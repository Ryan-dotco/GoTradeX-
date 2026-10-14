(function(){
"use strict";
var overlayId="portal-settings-standalone";
var previousPortalId=null;
var locationEnabled=false;
var locationStatus="";
var bound=false;
function byId(id){return document.getElementById(id);}
function safeGet(key,fallback){try{var v=localStorage.getItem(key);return v===null?fallback:v;}catch(e){return fallback;}}
function safeSet(key,value){try{localStorage.setItem(key,value);return true;}catch(e){return false;}}
function safeRemove(key){try{localStorage.removeItem(key);}catch(e){}}
function getPrefs(){try{return JSON.parse(localStorage.getItem("gtx_settings")||"{}");}catch(e){return {};}}
function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function bool(v,def){return typeof v==="boolean"?v:def;}
var socialDefaults={
 restrictPMs:true,hideOnline:false,watchCopiedTrades:false,
 hideCopyStats:false,hideWatching:false,watchedOnly:false
};
function getSocial(){var p=getPrefs(),s=p.social||{};var out={};Object.keys(socialDefaults).forEach(function(k){out[k]=bool(s[k],socialDefaults[k]);});return out;}
function switchMarkup(id,label,desc,checked){return '<div class="settings-switch-row"><div class="settings-switch-copy"><div class="settings-switch-title">'+label+'</div><div class="settings-switch-desc">'+desc+'</div></div><button type="button" class="settings-switch'+(checked?' is-on':'')+'" role="switch" aria-checked="'+(checked?'true':'false')+'" data-setting-toggle="'+id+'" aria-label="'+label+'"><span></span><b>'+(checked?'ON':'OFF')+'</b></button></div>';}
function sectionMarkup(id,icon,title,desc,body,open){return '<section class="settings-section'+(open?' is-expanded':'')+'" data-settings-section="'+id+'"><button type="button" class="settings-section-heading" aria-expanded="'+(open?'true':'false')+'" data-section-toggle="'+id+'"><span class="settings-section-icon">'+icon+'</span><span class="settings-section-heading-copy"><strong>'+title+'</strong><small>'+desc+'</small></span><span class="settings-chevron">⌄</span></button><div class="settings-section-body"'+(open?'':' hidden')+'>'+body+'</div></section>';}
function portalMarkup(){
 var p=getPrefs(),s=getSocial(),theme=safeGet("gtx_theme","default-dark"),color=safeGet("gtx_custom_color",""),img=safeGet("gtx_custom_bg_image",""),zone=safeGet("gtx_timezone_offset","+02:00"),zoneLabel=safeGet("gtx_timezone_label","UTC+02:00 — Johannesburg");
 var colors=[["#ff0000","Red"],["#f5f5dc","Beige"],["#007bff","Blue"],["#00008b","Dark Blue"],["#001f3f","Navy"],["#00a651","Green"],["#0a0a0a","Black Default"]];
 var zones=[["-12:00","UTC−12:00"],["-11:00","UTC−11:00"],["-10:00","UTC−10:00"],["-09:30","UTC−09:30"],["-09:00","UTC−09:00"],["-08:00","UTC−08:00"],["-07:00","UTC−07:00"],["-06:00","UTC−06:00"],["-05:00","UTC−05:00"],["-04:00","UTC−04:00"],["-03:30","UTC−03:30"],["-03:00","UTC−03:00"],["-02:00","UTC−02:00"],["-01:00","UTC−01:00"],["+00:00","UTC+00:00 — London"],["+01:00","UTC+01:00 — Lagos"],["+02:00","UTC+02:00 — Johannesburg"],["+03:00","UTC+03:00 — Nairobi"],["+03:30","UTC+03:30"],["+04:00","UTC+04:00 — Dubai"],["+04:30","UTC+04:30"],["+05:00","UTC+05:00 — Karachi"],["+05:30","UTC+05:30 — New Delhi"],["+05:45","UTC+05:45 — Kathmandu"],["+06:00","UTC+06:00 — Dhaka"],["+06:30","UTC+06:30"],["+07:00","UTC+07:00 — Bangkok"],["+08:00","UTC+08:00 — Singapore"],["+08:45","UTC+08:45"],["+09:00","UTC+09:00 — Tokyo"],["+09:30","UTC+09:30 — Adelaide"],["+10:00","UTC+10:00 — Sydney"],["+10:30","UTC+10:30"],["+11:00","UTC+11:00"],["+12:00","UTC+12:00 — Auckland"],["+12:45","UTC+12:45"],["+13:00","UTC+13:00"],["+14:00","UTC+14:00"]];
 var themeBody='<div class="settings-form-group"><label>Theme</label><div class="settings-theme-row"><button type="button" class="theme-btn" data-theme-choice="dark">Dark</button><button type="button" class="theme-btn" data-theme-choice="light">Light</button><button type="button" class="theme-btn" data-theme-choice="default-dark">Default Dark</button><button type="button" class="theme-btn" data-theme-choice="custom">Custom</button></div></div>'+
 '<div class="settings-form-group"><label>Accent color</label><div class="settings-colors">'+colors.map(function(c){return '<button type="button" class="settings-color" data-color-choice="'+c[0]+'" title="'+c[1]+'" aria-label="'+c[1]+' accent color" style="background:'+c[0]+'"></button>';}).join("")+'</div></div>'+
 '<div class="settings-form-group"><label for="bgUpload">Chart wallpaper</label><input type="file" id="bgUpload" accept="image/*"><div class="settings-actions"><button type="button" class="settings-secondary-action" id="removeCustomBg">Remove wallpaper</button><span id="bgStatus">'+(img?"Custom wallpaper saved":"No custom wallpaper")+'</span></div><div id="settingsBgPreview" aria-label="Wallpaper preview"></div><p class="settings-note">Wallpaper appears only behind the chart candles, at reduced opacity.</p></div>';
 var tradingBody='<div class="settings-form-group"><label for="prefAmount">Default trade amount</label><select id="prefAmount">'+["1","5","10","20","50","100"].map(function(v){return '<option value="'+v+'"'+(String(p.amount||"10")===v?" selected":"")+'>'+v+'</option>';}).join("")+'</select></div>'+
 '<div class="settings-form-group"><label for="prefTime">Default trade expiration</label><select id="prefTime">'+[["5s","5 seconds"],["1m","1 minute"],["3m","3 minutes"],["5m","5 minutes"],["15m","15 minutes"],["30m","30 minutes"],["1h","1 hour"],["4h","4 hours"],["1d","1 day"]].map(function(v){return '<option value="'+v[0]+'"'+(String(p.time||"1m")===v[0]?" selected":"")+'>'+v[1]+'</option>';}).join("")+'</select><p class="settings-note">This is trade expiration, not the chart candle timeframe.</p></div>'+
 switchMarkup("sound","Sound alerts","Play a sound for supported app alerts.",p.sound!==false)+switchMarkup("confirm","Confirm before trading","Ask for confirmation before a trade is submitted.",p.confirm!==false);
 var securityBody='<div class="settings-info-row"><strong>Account protection</strong><span>Keep your login credentials private and use the app’s existing security controls.</span></div><div class="settings-info-row"><strong>Privacy preferences</strong><span>Social privacy choices are saved on this device. Server-side visibility and message restrictions require the account privacy service to enforce them.</span></div>';
 var socialBody=switchMarkup("restrictPMs","Restrict private messages","Reduce unwanted private messages from other traders.",s.restrictPMs)+
 switchMarkup("hideOnline","Limit display of online status","Hide your online indicator from other traders.",s.hideOnline)+
 switchMarkup("watchCopiedTrades","Watch copied trades","Monitor trades copied from other users in real time.",s.watchCopiedTrades)+
 switchMarkup("hideCopyStats","Hide copying and statistics of my profile","Hide copy-trading availability and trading statistics where supported.",s.hideCopyStats)+
 switchMarkup("hideWatching","Hide watching of my trading","Prevent others from viewing your live trading activity where supported.",s.hideWatching)+
 switchMarkup("watchedOnly","Show only watched traders","Filter trader lists to people you follow.",s.watchedOnly);
 var selectedZone=zone;
 var timezoneBody='<div class="settings-form-group"><label for="prefTimezone">Time zone</label><select id="prefTimezone">'+zones.map(function(z){return '<option value="'+z[0]+'"'+(z[0]===selectedZone?' selected':'')+'>'+z[1]+'</option>';}).join("")+'</select><div class="settings-timezone-current" id="timezoneCurrent"></div><p class="settings-note">Changes the time zone preference for app displays. It does not change market data or trade expiration.</p></div>';
 var locOn=safeGet("gtx_location_enabled","false")==="true";
 var locationBody='<div class="settings-location-row"><div><strong>Enable your location</strong><p>Allow location-based features when you choose. Your browser or Android device will ask permission.</p></div><button type="button" class="settings-switch'+(locOn?' is-on':'')+'" id="locationToggle" role="switch" aria-checked="'+(locOn?'true':'false')+'"><span></span><b>'+(locOn?'ON':'OFF')+'</b></button></div><div class="settings-status" id="locationStatus" role="status">'+esc(locationStatus||(locOn?"Location preference is enabled.":"Location is off."))+'</div>';
 return '<div class="settings-shell"><header class="settings-header"><div class="settings-brand-mark">GTX</div><div class="settings-heading-copy"><h2>Settings</h2><p>Personalize your GoTradeX experience</p></div><button type="button" class="settings-icon-close" id="settingsCloseToTrading" aria-label="Close Settings" title="Close Settings">×</button></header>'+
 '<div class="settings-sections">'+
 sectionMarkup("social","◎","Social Trading & Privacy","Choose what other traders can see and do.",socialBody,true)+
 sectionMarkup("timezone","◷","Time Zone","Choose the time zone used to display times in the app.",timezoneBody,true)+
 sectionMarkup("location","⌖","Location Services","Enable location-based features only if you choose.",locationBody,true)+
 sectionMarkup("appearance","◐","Appearance","Theme color and chart wallpaper.",themeBody,false)+
 sectionMarkup("trading","↗","Trading Preferences","Default amount, expiration and confirmations.",tradingBody,false)+
 sectionMarkup("security","◇","Account & Security","Account protection and privacy information.",securityBody,false)+
 '</div><div class="settings-footer-actions"><button type="button" class="settings-secondary-action" id="settingsBackButton">← Back</button><button type="button" class="settings-main-action" id="saveSettingsButton">Save Settings</button><button type="button" class="settings-secondary-action settings-close-footer" id="settingsCloseFooter">Close</button></div><div class="settings-status" id="settingsStatus" role="status"></div></div>';
}
function hexMix(hex,amount){
 var h=String(hex||"#2563eb").replace("#","");if(h.length!==6)return "#93c5fd";
 var out="#";for(var i=0;i<3;i++){var n=parseInt(h.slice(i*2,i*2+2),16);n=Math.round(n+(255-n)*amount);out+=n.toString(16).padStart(2,"0");}return out;
}
function setPalette(accent,theme){
 var root=document.documentElement;
 /* The selected swatch controls borders only. Keep text, fills, chart colors and wallpaper unchanged. */
 root.style.setProperty("--gtx-accent-border",accent);
 root.style.setProperty("--gtx-page-surface",theme==="light"?"#f4f6f8":"#081b31");
 root.style.setProperty("--gtx-panel-surface",theme==="light"?"#ffffff":"#0b2038");
 root.style.setProperty("--gtx-screen-text",theme==="light"?"#111827":"#f8fafc");
 document.body.setAttribute("data-theme",theme);document.body.dataset.gtxTheme=theme;
 var chartTheme={border:accent};window.__gtxChartTheme=chartTheme;
 if(window.GoTradeXLiveChart&&typeof window.GoTradeXLiveChart.applyTheme==="function")window.GoTradeXLiveChart.applyTheme(chartTheme);
}
function setTheme(theme){
 if(["dark","light","default-dark","custom"].indexOf(theme)<0)theme="default-dark";safeSet("gtx_theme",theme);
 if(theme!=="custom")safeSet("gtx_appearance",theme==="light"?"light":"dark");
 var accent=theme==="custom"?safeGet("gtx_custom_color","#2563eb"):(theme==="light"?"#2563eb":theme==="dark"?"#64748b":"#2563eb");
 var appearance=theme==="custom"?safeGet("gtx_appearance","dark"):(theme==="light"?"light":"dark");
 setPalette(accent,appearance);
 var preview=byId("settingsBgPreview"),img=safeGet("gtx_custom_bg_image","");
 if(preview){preview.style.backgroundImage=img?'url("'+img+'")':"none";preview.style.backgroundColor=safeGet("gtx_custom_color",accent);preview.style.backgroundSize="cover";preview.style.backgroundPosition="center";}
 document.querySelectorAll("#"+overlayId+" [data-theme-choice]").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-theme-choice")===theme);});
}
function setCustomColor(color){
 if(!/^#[0-9a-f]{6}$/i.test(color))return;
 safeSet("gtx_theme","custom");safeSet("gtx_custom_color",color);
 /* Preserve the uploaded chart wallpaper when the border color changes. */
 setPalette(color,safeGet("gtx_appearance","dark"));
 var preview=byId("settingsBgPreview"),img=safeGet("gtx_custom_bg_image","");
 if(preview){preview.style.backgroundImage=img?'url("'+img+'")':"none";if(!img)preview.style.backgroundColor="";}
 var status=byId("bgStatus");if(status)status.textContent="Border color applied throughout GoTradeX. Your chart wallpaper is unchanged.";
}
function uploadCustomBg(input){
 var file=input&&input.files&&input.files[0];if(!file)return;var status=byId("bgStatus");
 if(!file.type||file.type.indexOf("image/")!==0){if(status)status.textContent="Please select an image file.";return;}
 if(file.size>3*1024*1024){if(status)status.textContent="Image is too large. Choose an image under 3 MB.";input.value="";return;}
 var reader=new FileReader();reader.onload=function(e){var data=String(e.target.result||"");if(!safeSet("gtx_custom_bg_image",data)){if(status)status.textContent="Could not save image. Try a smaller image.";return;}
  var preview=byId("settingsBgPreview");if(preview)preview.style.backgroundImage='url("'+data+'")';
  if(window.GoTradeXLiveChart&&typeof window.GoTradeXLiveChart.setWallpaper==="function")window.GoTradeXLiveChart.setWallpaper(data);
  if(status)status.textContent="Wallpaper applied inside the chart ✓";
 };reader.readAsDataURL(file);
}
function removeCustomBg(){
 safeRemove("gtx_custom_bg_image");
 var preview=byId("settingsBgPreview");if(preview){preview.style.backgroundImage="none";preview.style.backgroundColor="";}
 if(window.GoTradeXLiveChart&&typeof window.GoTradeXLiveChart.setWallpaper==="function")window.GoTradeXLiveChart.setWallpaper("");
 var status=byId("bgStatus");if(status)status.textContent="Wallpaper removed.";setTheme(safeGet("gtx_theme","default-dark"));
}
function parseOffset(s){var m=/^([+-])(\d{2}):(\d{2})$/.exec(s||"");if(!m)return 120;return (m[1]==="-"?-1:1)*(Number(m[2])*60+Number(m[3]));}
function zoneName(value){var opt=byId("prefTimezone");return opt&&opt.selectedOptions&&opt.selectedOptions[0]?opt.selectedOptions[0].textContent:"UTC"+value;}
function updateTimezonePreview(){
 var el=byId("timezoneCurrent"),sel=byId("prefTimezone");if(!el||!sel)return;
 var mins=parseOffset(sel.value),now=new Date(Date.now()+mins*60000),date=now.toISOString().slice(0,16).replace("T"," ");
 el.textContent=zoneName(sel.value)+" · "+date;
}
function applyTimezone(value,label){
 safeSet("gtx_timezone_offset",value);safeSet("gtx_timezone_label",label);
 document.documentElement.dataset.gtxTimezoneOffset=value;document.documentElement.dataset.gtxTimezoneLabel=label;
 var mins=parseOffset(value);document.documentElement.style.setProperty("--gtx-timezone-offset-minutes",String(mins));
 if(window.GoTradeXLiveChart&&typeof window.GoTradeXLiveChart.applyTimezone==="function")window.GoTradeXLiveChart.applyTimezone(value);
 updateTimezonePreview();
}
function setToggle(id,on){
 var b=document.querySelector("#"+overlayId+' [data-setting-toggle="'+id+'"]');if(!b)return;
 b.classList.toggle("is-on",!!on);b.setAttribute("aria-checked",on?"true":"false");var label=b.querySelector("b");if(label)label.textContent=on?"ON":"OFF";
}
function toggleSetting(id){
 var p=getPrefs(),s=getSocial();
 if(id==="sound"||id==="confirm"){p[id]=!(p[id]!==false);if(id==="confirm")safeSet("gotradex_confirm_trades",String(p[id]));if(id==="sound")document.body.dataset.gtxSoundAlerts=String(p[id]);}
 else{s[id]=!s[id];p.social=s;}
 safeSet("gtx_settings",JSON.stringify(p));setToggle(id,id==="sound"||id==="confirm"?p[id]:s[id]);
 var status=byId("settingsStatus");if(status)status.textContent="Preference updated. Tap Save Settings to confirm.";
}
function requestLocation(){
 var b=byId("locationToggle"),status=byId("locationStatus");
 if(!navigator.geolocation){safeSet("gtx_location_enabled","false");if(status)status.textContent="Location is not supported by this browser.";if(b){b.classList.remove("is-on");b.setAttribute("aria-checked","false");b.querySelector("b").textContent="OFF";}return;}
 if(status)status.textContent="Waiting for device permission…";
 navigator.geolocation.getCurrentPosition(function(){
  safeSet("gtx_location_enabled","true");if(b){b.classList.add("is-on");b.setAttribute("aria-checked","true");b.querySelector("b").textContent="ON";}if(status)status.textContent="Location permission granted. Coordinates are not saved by Settings.";
 },function(err){
  safeSet("gtx_location_enabled","false");if(b){b.classList.remove("is-on");b.setAttribute("aria-checked","false");b.querySelector("b").textContent="OFF";}
  if(status)status.textContent=err&&err.code===1?"Permission denied. You can enable it in Android/browser site settings.":"Location unavailable. You can continue using GoTradeX without it.";
 },{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
}
function closeOverlay(toPrevious){
 var overlay=byId(overlayId);if(overlay){overlay.classList.remove("is-open");overlay.style.removeProperty("display");overlay.style.removeProperty("visibility");overlay.style.removeProperty("pointer-events");overlay.style.removeProperty("z-index");}
 if(toPrevious){
  if(previousPortalId){var prev=byId(previousPortalId);if(prev){prev.classList.add("open");prev.style.removeProperty("display");prev.removeAttribute("aria-hidden");return;}}
  var nav=window.GoTradeXNavigationRecovery||window.GoTradeXNavigation;
  if(nav&&typeof nav.back==="function"){try{nav.back();return;}catch(e){}}
 }else{
  var navClose=window.GoTradeXNavigationRecovery||window.GoTradeXNavigation;
  if(navClose&&typeof navClose.closeToTrading==="function"){try{navClose.closeToTrading();return;}catch(e){}}
  if(navClose&&typeof navClose.closeAll==="function"){try{navClose.closeAll();return;}catch(e){}}
  document.querySelectorAll(".drawer.open,.adminPage.open,.adminDrawer.open,.helpPage.open,.supportPage.open,.myTeamPage.open,.policyPage.open,.termsPage.open,.userAutoBotDrawer.open,.agentWidget.open,.keypad.open").forEach(function(el){el.classList.remove("open");el.style.removeProperty("display");});
  var menu=byId("menuDrawer");if(menu)menu.classList.remove("open");
 }
}
function openSettings(){
 var existing=byId(overlayId);
 if(!existing){existing=document.createElement("div");existing.id=overlayId;existing.className="portal-section";document.body.appendChild(existing);}
 var active=document.querySelector(".drawer.open,.adminPage.open,.adminDrawer.open,.helpPage.open,.supportPage.open,.myTeamPage.open,.policyPage.open,.termsPage.open,.userAutoBotDrawer.open,.agentWidget.open,.keypad.open");
 previousPortalId=active&&active.id?active.id:null;
 existing.innerHTML=portalMarkup();existing.classList.add("is-open");existing.style.setProperty("display","block","important");existing.style.setProperty("visibility","visible","important");existing.style.setProperty("pointer-events","auto","important");existing.style.setProperty("z-index","2147483647","important");existing.setAttribute("role","dialog");existing.setAttribute("aria-modal","true");existing.removeAttribute("aria-hidden");
 var p=getPrefs();setTheme(safeGet("gtx_theme","default-dark"));applyTimezone(safeGet("gtx_timezone_offset","+02:00"),safeGet("gtx_timezone_label","UTC+02:00 — Johannesburg"));
 document.querySelectorAll("#"+overlayId+" [data-section-toggle]").forEach(function(b){b.addEventListener("click",function(){var section=b.closest(".settings-section"),body=section&&section.querySelector(".settings-section-body");if(!section||!body)return;var open=!section.classList.contains("is-expanded");section.classList.toggle("is-expanded",open);b.setAttribute("aria-expanded",open?"true":"false");body.hidden=!open;});});
 document.querySelectorAll("#"+overlayId+" [data-theme-choice]").forEach(function(b){b.addEventListener("click",function(){setTheme(b.getAttribute("data-theme-choice"));});});
 document.querySelectorAll("#"+overlayId+" [data-color-choice]").forEach(function(b){b.addEventListener("click",function(){setCustomColor(b.getAttribute("data-color-choice"));});});
 document.querySelectorAll("#"+overlayId+" [data-setting-toggle]").forEach(function(b){b.addEventListener("click",function(){toggleSetting(b.getAttribute("data-setting-toggle"));});});
 byId("bgUpload").addEventListener("change",function(){uploadCustomBg(this);});
 byId("removeCustomBg").addEventListener("click",removeCustomBg);
 byId("prefTimezone").addEventListener("change",updateTimezonePreview);
 byId("locationToggle").addEventListener("click",function(){if(safeGet("gtx_location_enabled","false")==="true"){safeSet("gtx_location_enabled","false");this.classList.remove("is-on");this.setAttribute("aria-checked","false");this.querySelector("b").textContent="OFF";var st=byId("locationStatus");if(st)st.textContent="Location is off.";return;}requestLocation();});
 byId("settingsCloseToTrading").addEventListener("click",function(){closeOverlay(false);});
 byId("settingsCloseFooter").addEventListener("click",function(){closeOverlay(false);});
 byId("settingsBackButton").addEventListener("click",function(){closeOverlay(true);});
 byId("saveSettingsButton").addEventListener("click",function(){
  var old=getPrefs(),social=getSocial();
  var prefs=Object.assign({},old,{amount:byId("prefAmount").value,time:byId("prefTime").value,sound:old.sound!==false,confirm:old.confirm!==false,social:social});
  var zone=byId("prefTimezone").value;var label=zoneName(zone);
  if(!safeSet("gtx_settings",JSON.stringify(prefs))){byId("settingsStatus").textContent="Could not save settings on this device.";return;}
  applyTimezone(zone,label);safeSet("gotradex_confirm_trades",String(prefs.confirm));document.body.dataset.gtxSoundAlerts=String(prefs.sound);
  byId("settingsStatus").textContent="Settings saved on this device ✓";
 });
 var img=safeGet("gtx_custom_bg_image",""),color=safeGet("gtx_custom_color","");
 var preview=byId("settingsBgPreview");if(preview){preview.style.backgroundImage=img?'url("'+img+'")':"none";if(color)preview.style.backgroundColor=color;}
 if(img&&window.GoTradeXLiveChart&&typeof window.GoTradeXLiveChart.setWallpaper==="function")window.GoTradeXLiveChart.setWallpaper(img);
 updateTimezonePreview();
}
function restoreSavedTheme(){
 setTheme(safeGet("gtx_theme","default-dark"));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",restoreSavedTheme,{once:true});
else restoreSavedTheme();
window.openGtxSettings=openSettings;
window.gtxSettingsBackToPrevious=function(){closeOverlay(true);};
window.gtxSettingsCloseToTrading=function(){closeOverlay(false);};
window.gtxSettingsSetTheme=setTheme;
window.gtxSettingsSetColor=setCustomColor;
document.addEventListener("click",function(e){
 var button=e.target&&e.target.closest?e.target.closest('[data-profile-action="settings"]'):null;
 if(!button)return;
 e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();e.stopPropagation();
 openSettings();
},true);
document.addEventListener("keydown",function(e){if(e.key==="Escape"){var p=byId(overlayId);if(p&&p.classList.contains("is-open"))closeOverlay(false);}});
})();