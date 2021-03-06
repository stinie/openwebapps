/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is App Dashboard, dashboard.js
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Michael Hanson <mhanson@mozilla.com>
 *  Dan Walkowski <dwalkowski@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */



// Singleton instance of the Apps object:
var gApps = null;

// The selected app
var gSelectedInstall = null;

// Display mode:
var ROOT = 1;
var APP_INFO = 2;
var gDisplayMode = ROOT;
var gDashboardState = null;

var minAppListHeight = 0;
var minAppListWidth = 0;

var getInfoId = "getInfo";


function showInstallDialog(browserType, installFunc) {
		// a workaround for a flaw in the demo system (http://dev.jqueryui.com/ticket/4375), ignore!
		$( "#dialog:ui-dialog" ).dialog( "destroy" );

		$( "#dialog-confirm" ).dialog( {
		  title: "Install " + browserType + " Add-On",
			resizable: false,
			modal: true,
			width: 400,
			position: [100, 100],
			buttons: {
				"Install": function() {
					$( this ).dialog( "close" );
					installFunc();
				},
				"No Thank You": function() {
					$( this ).dialog( "close" );
				}
			}
		} );
	}


function retrieveInstalledApps()
{
  var listOfApps;
  navigator.apps.mgmt.list(function (listOfInstalledApps) {
    (function () {
      gApps = listOfInstalledApps;
      gDisplayMode = ROOT;
      render();
    })();
  });


}


function addonIsInstalled() {
  if(navigator.apps.html5Implementation) {
    return false;
  }
  return true;
}

var one_hour = 1000 * 60 * 60;
var three_days = 72 * one_hour;

function shouldBotherUser()
{
  //check to see if we should bother the user about installing the addon this time
  //question, where do we keep this setting?  localStorage?  for what domain?
  var now = Date.now();
  var nextBother = window.localStorage.getItem("addon-bother-timestamp");

  if (nextBother) {
    if (nextBother == -1) return false;       //never bother them again.

    if (nextBother < now) {
      nextBother = now + three_days;
      window.localStorage.setItem("addon-bother-timestamp", nextBother);
      return true;
    }
    else return false;

  } else {  //first time
      nextBother = now;
      window.localStorage.setItem("addon-bother-timestamp", nextBother);
      return false;
  }
}

function recommendAddon() {
  if (!addonIsInstalled() && shouldBotherUser()) {
      var agent = navigator.userAgent.toLowerCase();
      if (agent.indexOf("firefox") != -1) {
          //present UI asking the user if they want to install the firefox plugin
          showInstallDialog("Firefox", ( function () { document.location = "installFFX-addon.html"; } ));

      } else if (agent.indexOf("chrome") != -1) {
          //present UI asking the user if they want to install the chrome plugin
          showInstallDialog("Chrome", ( function () { document.location = "installCHRM-addon.html"; } ));

      }
    }
  }



$(document).ready(function() {
    //temporarily set the repository origin to localhost
    navigator.apps.setRepoOrigin("..");

  $('#page1').resizable({"handles":'s', "stop": function(event, ui) {saveDashSize();} });

  // can this user use myapps?
   var w = window;
   if (w.JSON && w.postMessage) {
       try {
           // Construct our Apps handle
             retrieveInstalledApps();
             navigator.apps.mgmt.loadState( ( function (s) { gDashboardState = s;
                                                             if (!gDashboardState) { gDashboardState = {}; } } ) );
           } catch (e) {
           if (typeof console !== "undefined") console.log(e);
       }

       // figure out which browser we are on, and whether the addon has been installed and enabled, and whether we should pester them if not.
      self.recommendAddon();

   } else {
       $("#unsupportedBrowser").fadeIn(500);
   }

   updateLoginStatus();
});


function updateMinDashSize()
{
  minAppListHeight = 0;
  minAppListWidth = 0;

  $('.app').each(function(index, elem) {
      var ePos = $(elem).position();
      var h = $(elem).height();
      var w = $(elem).width();
      if (ePos.top + h + 6 > minAppListHeight)  minAppListHeight = ePos.top + h + 6;
      if (ePos.left + w + 6 > minAppListWidth)  minAppListWidth = ePos.left + w + 6;
    });

  $('#page1').resizable( "option", "minHeight", minAppListHeight );
  $('#page1').resizable( "option", "minWidth", minAppListWidth );
}


function resizeDash(h,w)
{
    $('#page1').top = 0;
    $('#page1').left = 0;

    $('#page1').height(h);
    //$('#page1').width(w);
}


function loadDashSize () {
  //load the last saved size of the dash
  if (gDashboardState.dashSize) {
    resizeDash(gDashboardState.dashSize.height, gDashboardState.dashSize.width);
  }
}

function saveDashSize () {
  //save size of the dash
    gDashboardState.dashSize = {"height":$('#page1').height(), "width":$('#page1').width()};
    navigator.apps.mgmt.saveState(gDashboardState);
}



function elem(type, clazz) {
 var e = document.createElement(type);
  if (clazz) e.setAttribute("class", clazz);
  return e;
}

// Creates an opener for an app tab.  The usual behavior
// applies - if the app is already running, we switch to it.
// If the app is not running, we create a new app tab and
// launch the app into it.
function makeOpenAppTabFn(app, id)
{
    return function(evt) {
        if ($(this).hasClass("ui-draggable-dragged")) {
            $(this).removeClass("ui-draggable-dragged");
            return false;
        }

        navigator.apps.mgmt.launch(id);
    }
}

// Render the contents of the "apps" element by creating canvases
// and labels for all apps.
function render()
{
  var box = $("#page1");

  //clear out the the app nodes.  WARNING: this kills all of them everywhere, I think,
  // so if we had multiple pages of apps, this might cause them all to refresh.
  $('.app').remove();

  var selectedBox = null;
  for ( var i = 0; i < gApps.length; i++ ) {
    try {
      var install = gApps[i];

      var icon = createAppIcon(install);
      //check for no icon here, and supply a default one
      if (!icon) {
        //use some default icon here
      }

      if (install === gSelectedInstall) {
        selectedBox = icon;
      }
      box.append(icon);
    } catch (e) {

      if (typeof console !== "undefined") console.log("Error while creating application icon for app " + i + ": " + e);
    }
  }




  //lay out the apps
  if (gDisplayMode == APP_INFO) {
      // kick back to "ROOT" display mode if there's no
      // selected application for which to display an info pane
      if (selectedBox) {
          renderAppInfo(selectedBox);
      } else {
          gDisplayMode == ROOT;
      }
  }

  //load the saved dash size
  loadDashSize();

  //determine smallest size that can contain the apps
  updateMinDashSize();


  //then resize it if necessary
  if ($('#page1').height() < (minAppListHeight)) {
     $('#page1').height(minAppListHeight);
   }

   if ($('#page1').width() < (minAppListWidth)) {
     $('#page1').width(minAppListWidth);
   }


}


function getBiggestIcon(minifest) {
  //see if the minifest has any icons, and if so, return the largest one
  if (minifest.icons) {
    var biggest = 0;
    for (z in minifest.icons) {
      var size = parseInt(z, 10);
      if (size > biggest) biggest = size;
    }
    if (biggest !== 0) return minifest.icons[biggest];
  }
  return null;
}

function renderAppInfo(selectedBox)
{
    $( "#" + getInfoId ).remove();

    // Set up Info starting location
    var info = document.createElement("div");
    info.id = getInfoId;
    info.className = getInfoId;

    var badge = elem("div", "appBadge");
    var appIcon = elem("div", "icon");

    var icon = getBiggestIcon(gSelectedInstall);

    if (icon) {
        appIcon.setAttribute("style",
                             "background:url(\"" + icon + "\") no-repeat; background-size:100%");
    }

    $(appIcon).css("position", "absolute").css("top", -3).css("left", 9);

    var label = elem("div", "appBadgeName");
    label.appendChild(document.createTextNode(gSelectedInstall.name));

    badge.appendChild(appIcon);
    badge.appendChild(label);
    info.appendChild(badge);


    var off = $(selectedBox).offset();
    $(info).css("postion", "absolute").css("top", off.top + -4).css("left", off.left + -8);
    $(info).width(110).height(128).animate({
        width: 300,
        height: 320
    }, 200, function() {
        var data = elem("div", "appData");
        function makeColumn(label, value) {
            var boxDiv = elem("div", "appDataBox");
            var labelDiv = elem("div", "appDataLabel");
            var valueDiv = elem("div", "appDataValue");
            labelDiv.appendChild(document.createTextNode(label));
            if (typeof value == "string") {
                valueDiv.appendChild(document.createTextNode(value));
            } else {
                valueDiv.appendChild(value);
            }
            boxDiv.appendChild(labelDiv);
            boxDiv.appendChild(valueDiv);
            return boxDiv;
        }
        var dev = elem("div", "developerName");
        if (gSelectedInstall.developer) {
          if (gSelectedInstall.developer.url) {
            var a = elem("a");
            a.setAttribute("href", gSelectedInstall.developer.url);
            a.setAttribute("target", "_blank");
            a.appendChild(document.createTextNode(gSelectedInstall.developer.name));
            dev.appendChild(a);
            data.appendChild(dev);

            var linkbox = elem("div", "developerLink");
            a = elem("a");
            a.setAttribute("href", gSelectedInstall.developer.url);
            a.setAttribute("target", "_blank");
            a.appendChild(document.createTextNode(gSelectedInstall.developer.url));
            linkbox.appendChild(a);
            data.appendChild(linkbox);

          } else {
            if (gSelectedInstall.developer.name) {
                dev.appendChild(document.createTextNode(gSelectedInstall.developer.name));
                data.appendChild(dev);
            } else {
                dev.appendChild(document.createTextNode("No developer info"));
                $(dev).addClass("devUnknown");
                data.appendChild(dev);
            }
          }
        }

        info.appendChild(data);

        var desc = elem("div", "desc");
        desc.appendChild(document.createTextNode(gSelectedInstall.description));
        info.appendChild(desc);

        var props = elem("div", "appProperties");

        props.appendChild(makeColumn("Install Date", formatDate(gSelectedInstall.installTime)));
        props.appendChild(makeColumn("Installed From", gSelectedInstall.installURL));

        info.appendChild(props);

        // finally, a delete link and action
        $("<div/>").text("Delete this application.").addClass("deleteText").appendTo(info).click(function() {
            navigator.apps.mgmt.remove(gSelectedInstall.id,
                                        function() {
                                                     retrieveInstalledApps();
                                                  });
            gSelectedInstall = null;
            gDisplayMode = ROOT;
            render();

            // let's now create a synthetic click to the document to cause the info dialog to get dismissed and
            // cleaned up properly
            $(document).click();

            return false;
        });

        $(info).click(function() {return false;});
    });

    $("body").append(info);

    // Dismiss box when user clicks anywhere else
    setTimeout( function() { // Delay for Mozilla
        $(document).click(function() {
            $(document).unbind('click');
            $(info).fadeOut(100, function() { $("#"+getInfoId).remove(); });
            return false;
        });
    }, 0);
}

//other words for widget:
// sketch, recap, clipping, nutshell, aperture, channel, spout,
// beacon, buzz, meter, crux, ticker, ...

function createAppIcon(install)
{
  //we will make an 'appDiv', which contains all the parts.
  // it will have an icon and a title, in default mode.
  // if the app has a widget enabled, it will be larger, visible, and have an iframe
  // next to the app icon and title.  the iframe has a default size, but can be
  // made larger if the widget specifies it, up to some reasonable maximum

  var appContainer = elem("div", "app");
  appContainer.setAttribute("id", install.id);

  
  var clickyIcon = $("<div/>").addClass("icon");
  var iconImg = getBiggestIcon(install);
  if (iconImg) {
      clickyIcon.css({
          background: "url(\"" + iconImg + "\") no-repeat #FFFFFF",
          backgroundSize: "100%"
      });
  }
  clickyIcon.onclick = makeOpenAppTabFn(install, install.id);
  $(appContainer).append(clickyIcon);

  var appName = elem("div", "appName");
  appName.appendChild(document.createTextNode(install.name));
  
  appName.style.left = "10px";
  $(appContainer).append(appName);

  //now set the container size depending on whether they have a widget or not.
  // probably if there's no widget, we should  make it transparent
   if (install.embedURL) {
   //make the appContainer large, with rounded corners and a white background
    var width = 300;
    var height = 164;
    
    appContainer.style.width = width;
    appContainer.style.height = height;
    appContainer.style.background = "white";
    appContainer.style.opacity = "1";
    appContainer.style.border = "1px solid black";

    appContainer.style.MozBorderRadius = "1em";
    appContainer.style.WebkitBorderRadius = "1em";
    appContainer.style.borderRadius = "1em";
    
    var widget = createWidget(install.embedURL, 10, ( 96 + 20), (height - 20), (width - (96 + 20 + 10)));
    $(widget).addClass("widget");
    
    $(appContainer).append(widget);
   } else {
      //make sure it's invisible?
   }

  $(appContainer).draggable({ handle: clickyIcon, containment: "#page1", scroll: false, stop: function(event, ui) {
                          //store the new position in the dashboard meta-data
                          var newPos = ui.position;
                          gDashboardState[install.id] = newPos;
                          navigator.apps.mgmt.saveState(gDashboardState);
                          $(this).addClass("ui-draggable-dragged");
                          updateMinDashSize();
                        }
                      });






    var moreInfo = $("<div/>").addClass("moreInfo").appendTo(clickyIcon);
    $("<a/>").appendTo(clickyIcon);

    // Set up the hover handler.  Only fade in after the user hovers for
    // 500ms.
    var tHandle;
    $(clickyIcon).hover(function() {
        var self = $(this);
        tHandle = setTimeout(function() {
            self.find(".moreInfo").fadeIn();
        }, 500);
    }, function() {
        $(this).find(".moreInfo").hide();
        clearTimeout(tHandle);
    });

    // bring up detail display when user clicks on info icon
    moreInfo.click(function(e) {
        for (var i = 0; i < gApps.length; i++) {
          if (install.id == gApps[i].id) {
            gSelectedInstall = gApps[i];
            break;
          }
        }
        if (!gSelectedInstall) return;

        gDisplayMode = APP_INFO;
        render();
        return false;
    });

    if (gDashboardState) {
      var appPos = gDashboardState[install.id];
      if (appPos) {
          $(appContainer).css("position", "absolute").css("top", appPos.top).css("left", appPos.left);
          }
    }

    return appContainer;
}


//create the optional iframe to hold the widget version of the app
function createWidget(path, top, left, height, width) {

    iframe = document.createElement("iframe");
    //frame keyed on widget path
    iframe.id = path;
    iframe.style.position = "absolute";
    
    iframe.style.top = top;
    iframe.style.left = left;
    iframe.style.width = width;
    iframe.style.height = height;

    iframe.style.border = "0px solid white";

    iframe.style.background = "white";
    iframe.style.opacity = "1";
    iframe.scrolling = "no";

    iframe.src = path;
    return iframe;
}




function formatDate(dateStr)
{
  if (!dateStr) return "null";

  var now = new Date();
  var then = new Date(dateStr);

  if (then.getTime() > now.getTime()) {
    return "the future";
  }
  else if (then.getMonth() != now.getMonth() ||  then.getDate() != now.getDate())
  {
     var dayDelta = (new Date().getTime() - then.getTime() ) / 1000 / 60 / 60 / 24 // hours
     if (dayDelta < 2) str = "yesterday";
     else if (dayDelta < 7) str = Math.floor(dayDelta) + " days ago";
     else if (dayDelta < 14) str = "last week";
     else if (dayDelta < 30) str = Math.floor(dayDelta) + " days ago";
     else str = Math.floor(dayDelta /30)  + " month" + ((dayDelta/30>2)?"s":"") + " ago";
  } else {
      var str;
      var hrs = then.getHours();
      var mins = then.getMinutes();

      var hr = Math.floor(Math.floor(hrs) % 12);
      if (hr == 0) hr =12;
      var mins = Math.floor(mins);
      str = hr + ":" + (mins < 10 ? "0" : "") + Math.floor(mins) + " " + (hrs >= 12 ? "P.M." : "A.M.") + " today";
  }
  return str;
}

function onMessage(event)
{
  // unfreeze request message into object
  var msg = JSON.parse(event.data);
  if(!msg) {
    return;
  }
}

function onFocus(event)
{
  if (gApps) {
    gDisplayMode = ROOT;
    retrieveInstalledApps();
    render();
  }
}

function updateLoginStatus() {
  navigator.apps.mgmt.loginStatus(function (userInfo, loginInfo) {
    if (! userInfo) {
      $('#login-link a').attr('href', loginInfo.loginLink);
      $('#login-link').show();
    } else {
      $('#username').text(userInfo.email);
      $('#signed-in a').attr('href', loginInfo.logoutLink);
      $('#signed-in').show();
    }
  });
}


if (window.addEventListener) {
    window.addEventListener('message', onMessage, false);
} else if(window.attachEvent) {
    window.attachEvent('onmessage', onMessage);
}

if (window.addEventListener) {
    window.addEventListener('focus', onFocus, false);
} else if(window.attachEvent) {
    window.attachEvent('onfocus', onFocus);
}
