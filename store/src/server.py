#!/usr/bin/env python
#
import tornado.httpserver
import tornado.auth
import tornado.ioloop
import tornado.web
import os
import re
import time
import calendar
import base64
import traceback
import logging
import urllib
import cStringIO
import json
import cgi
import config
import datetime
import crypto
import model
import urlparse
import urllib

class WebHandler(tornado.web.RequestHandler):
  def get_current_user(self):
    return self.get_secure_cookie("uid")

  def get_error_html(self, status_code, **kwargs):
    return "<html><title>Error!</title><style>.box {margin:16px;padding:8px;border:1px solid black;font:14pt Helvetica,arial} "\
            ".small {text-align:right;color:#888;font:italic 8pt Helvetica;}</style>" \
           "<body><div class='box'>We're sorry, something went wrong!<br><br>Perhaps "\
           "you should <a href='/'>return to the front page.</a><br><br><div class='small'>%s %s</div></div>" % (
          status_code, kwargs['exception'])
            
               
class MainHandler(WebHandler):
  def get(self):
    self.set_header("X-XRDS-Location", "https://appstore.mozillalabs.com/xrds")
    uid = self.get_current_user()
    if uid:
      account = model.user(uid)
      if account:
        try:
          account.displayName = account.identities[0].displayName
        except:
          account.displayName = "anonymous"

    else:
      account = None
    
    self.render("index.html", errorMessage=None, account=account)

class AppHandler(WebHandler):
  def get(self, appID):
    uid = self.get_current_user()
    account = None
    if uid:
      account = model.user(uid)
      try:
        account.displayName = account.identities[0].displayName
      except:
        account.displayName = "anonymous"
        
    try:
      theApp = model.application(appID) 
    except:
      return self.redirect("/")
    
    mode = self.get_argument("m", None)
    
    self.render("app.html", appID=appID, app=theApp, account=account, mode=mode)

class AccountHandler(WebHandler):
  @tornado.web.authenticated
  def get(self):
    uid = self.get_current_user()
    account = model.account(uid)
    self.render("account.html", account=account, error=None)

class LoginHandler(WebHandler):
  def get(self):
    uid = self.get_current_user()
    appID = self.get_argument("app", None)
    return_to = self.get_argument("return_to", None)

    if uid: # that shouldn't happen
      if return_to:
        self.redirect(return_to)
      else:
        self.redirect("/")
    else:
      app = None
      if appID:
        app = model.application(appID)
      
      if not return_to:
        return_to = "/"
      self.render("login.html", app=app, return_to=return_to, error=None)

class LogoutHandler(WebHandler):
  def get(self):
    self.set_cookie("uid", "", expires=datetime.datetime(1970,1,1,0,0,0,0))

    return_to = self.get_argument("return_to", None)
    if return_to:
      self.redirect(return_to)
    else:
      self.redirect("/")

class BuyHandler(WebHandler):
  @tornado.web.authenticated
  def post(self):
    uid = self.get_current_user()
    appid = self.get_argument("appid")
    
    if model.purchase_for_user_app(uid, appid):
      self.write("""{"status":"ok", "message":"User has already purchased that application."}""")
      return 
    else:
      model.createPurchaseForUserApp(uid, appid)
      self.write("""{"status":"ok", "message":"Purchase successful."}""")
      return       


class VerifyHandler(WebHandler):
  @tornado.web.authenticated
  def get(self, appID):
    uid = self.get_current_user()
    try:
      app = model.application(appID)
    except:
      raise ValueError("Unable to load application")

    if model.purchase_for_user_app(uid, appID):
      
      # Create verification token and sign
      timestamp = datetime.datetime.now()
      verificationToken = "%s|%s|%sT%s" % (uid, appID, timestamp.date(), timestamp.time())
      signature = crypto.sign_verification_token(verificationToken)      

      self.redirect("%s?%s" % (app.launchURL, urllib.urlencode( { 
        "moz_store.status":"ok",
        "verification":verificationToken,
        "signature":signature } )))
    else:
      # Could potentially provide multiple status codes, e.g. expired
      
      self.redirect("%s?%s" % (app.launchURL, urllib.urlencode( { 
        "moz_store.status":"fail" }) ))

class FederatedLoginHandler(WebHandler):
  def _on_auth(self, user):
    if not user:
      # hm, in the twitter case should we throw?
      self.authenticate_redirect()
      return

    # Couple cases here:
    # 
    # The user has no cookie
    #   Nobody has signed up for this ID yet: create a user, associate this ID with it, cookie the useragent
    #   Somebody has this ID: the user of this ID is the user; cookie the useragent
    # The user has a cookie
    #   Nobody has signed up for this ID yet: associate this ID with the user
    #   This user has this ID: welcome back, just keep going
    #   Somebody ELSE has this ID: we're on a stale session.  we can either switch sessions or report a problem.

    identifier = self.getIdentifier(user)
    name = user["name"] if "name" in user else identifier
    email = user["email"] if "email" in user else None
    
    uid = self.get_secure_cookie("uid")
    if not uid:
      ident = model.identity_by_identifier(identifier)
      if ident:
        # welcome back
        self.set_secure_cookie("uid", str(ident.user_id))
      else:
        u = model.createUser()
        uid = u.id
        self.set_secure_cookie("uid", str(uid))
        i = model.addIdentity(uid, identifier, name, email)
    else:
      ident = model.identity_by_identifier(identifier)
      if ident:
        if int(ident.user_id) != int(uid):
          # hm, somebody else has this ID.  the user just switched accounts.
          # this has potential to be confusing, but for now we will switch accounts.
          self.set_secure_cookie("uid", str(ident.user_id))
        else:
          # hm, you've already claimed this identity.  but welcome back anyway.
          pass
        
      else: # add this ident to the user
        i = model.addIdentity(uid, identifier, name, email)
    
    return_to = self.get_argument("to")
    if return_to:
      self.redirect(return_to)
    else:
      self.redirect("/account") # where to?


class OpenIDLoginHandler(FederatedLoginHandler):
  @tornado.web.asynchronous
  def handle_get(self):
    if self.get_argument("openid.mode", None):
      self.get_authenticated_user(self.async_callback(self._on_auth))
      return

    # xheaders doesn't do all the right things to recover
    # from being reverse-proxied: change it up here.
    self.request.protocol = "https"
    self.request.host = "appstore.mozillalabs.com"
    
    return_to = self.get_argument("return_to", None)
    callback_uri = None
    if return_to:
      scheme, netloc, path, query, fragment = urlparse.urlsplit(self.request.uri)
      callback_uri = "https://appstore.mozillalabs.com/%s?%s" % (
        path, urllib.urlencode({"to":return_to})
      )
    self.authenticate_redirect(callback_uri=callback_uri)

class GoogleIdentityHandler(OpenIDLoginHandler, tornado.auth.GoogleMixin):
  @tornado.web.asynchronous
  def get(self):
    self.handle_get()

  def getIdentifier(self, user):
    return user["email"]

class YahooIdentityHandler(OpenIDLoginHandler, tornado.auth.OpenIdMixin):
  _OPENID_ENDPOINT = "https://open.login.yahooapis.com/openid/op/auth"

  @tornado.web.asynchronous
  def get(self):
    self.handle_get()

  def getIdentifier(self, user):
    return user["email"]

class TwitterIdentityHandler(FederatedLoginHandler, tornado.auth.TwitterMixin):
  @tornado.web.asynchronous
  def get(self):
    if self.get_argument("oauth_token", None):
      self.get_authenticated_user(self.async_callback(self._on_auth))
      return
    self.authorize_redirect()

  def getIdentifier(self, user):
    return "%s@twitter.com" % user["username"] 


class XRDSHandler(WebHandler):
  def get(self):
    self.set_header("Content-Type", "application/xrds+xml")
    self.write("""<?xml version="1.0" encoding="UTF-8"?>"""\
      """<xrds:XRDS xmlns:xrds="xri://$xrds" xmlns:openid="http://openid.net/xmlns/1.0" xmlns="xri://$xrd*($v*2.0)">"""\
      """<XRD>"""\
      """<Service priority="1">"""\
      """<Type>https://specs.openid.net/auth/2.0/return_to</Type>"""\
      """<URI>https://appstore.mozillalabs.com/app/</URI>"""\
      """</Service>"""\
      """</XRD>"""\
      """</xrds:XRDS>""")





TaskTrackerApp = {"name":"Task Tracker", 
                "app":{
                  "urls":["http://tasktracker.mozillalabs.com/",
                          "https://tasktracker.mozillalabs.com/"],
                  "launch": {
                    "web_url":"https://tasktracker.mozillalabs.com/"
                  }
                },
                "description":"Manage tasks with ease using this flexible task management application.\n\nCreate To Do lists or manage complex hierarchical tasks chains.\n\nIntegrates with many web-based calendars and notification systems.",
                "icons":{
                  "96":"data:image/png;base64,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"
                }
                }

MozillaBallApp = {"name":"MozillaBall",
                "app":{
                  "urls":["http://mozillaball.mozillalabs.com/",
                          "https://mozillaball.mozillalabs.com/"],
                  "launch": {
                    "web_url":"https://mozillaball.mozillalabs.com/"
                  }
                },
                "description":"Fast and furious Open Web development game play!\n\nScore points by implementing Open Web features.\n\nWin powerups by upgrading your JavaScript engine, adding security features, and hardware acceleration.",
                "icons":{
                  "96":"data:image/png;base64,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"
                }
                }

      
def create_bogus_apps():
  try:
    model.application(1)
  except:
    app = model.createApplication(json.dumps(TaskTrackerApp), json.dumps(TaskTrackerApp))
    app.price = 199
    model.save(app)
  
  try:
    model.application(2)
  except:
    model.createApplication(json.dumps(MozillaBallApp), json.dumps(MozillaBallApp))
  
##################################################################
# Main Application Setup
##################################################################

settings = {
    "static_path": os.path.join(os.path.dirname(__file__), "static"),
    "cookie_secret": config.cookie_secret,
    "login_url": "/login",
    "debug":True,
    "xheaders":True,

    "twitter_consumer_key":"HvhrjQU3EKYZttdBglHT4Q",
    "twitter_consumer_secret":"ajyQvZn3hDLcVI9VYZfwZi3kxsF8g8arayxzoyPBIo",
#    "xsrf_cookies": True,
}

application = tornado.web.Application([
    (r"/app/(.*)", AppHandler),
    (r"/xrds", XRDSHandler),
    (r"/login", LoginHandler),
    (r"/logout", LogoutHandler),
    (r"/verify/(.*)", VerifyHandler),
    (r"/api/buy", BuyHandler),
    (r"/account", AccountHandler),
    (r"/account/addid/google", GoogleIdentityHandler),    
    (r"/account/addid/yahoo", YahooIdentityHandler),    
    (r"/account/addid/twitter", TwitterIdentityHandler),    
    (r"/", MainHandler),
 
	], **settings)


def run():
    http_server = tornado.httpserver.HTTPServer(application)
    http_server.listen(8400)
    
    create_bogus_apps()
    
    tornado.ioloop.IOLoop.instance().start()
		
import logging
import sys
if __name__ == '__main__':
	if '-test' in sys.argv:
		import doctest
		doctest.testmod()
	else:
		logging.basicConfig(level = logging.DEBUG)
		run()
	
	