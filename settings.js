(function(){
"use strict";
var overlayId="portal-settings-standalone";
var previousPortalId=null;
var previousWasMenu=false;
function byId(id){return document.getElementById(id);}
function safeGet(key,fallback){try{var v=localStorage.getItem(key);return v===null?fallback:v;}catch(e){return fallback;}}
function safeSet(key,value){try{localStorage.setItem(key,value);return true;}catch(e){return false;}}
function getPrefs(){try{return JSON.parse(localStorage.getItem("gtx_settings")||"{}");}catch(e){return {};}}
function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");}
function portalMarkup(){
 var p=getPrefs(),theme=safeGet("gtx_theme","default-dark"),color=safeGet("gtx_custom_color",""),img=safeGet("gtx_custom_bg_image","");
 var colors=[["#ff0000","Red"],["#f5f5dc","Beige"],["#007bff","Blue"],["#00008b","Dark Blue"],["#001f3f","Navy"],["#00a651","Green"],["#0a0a0a","Black Default"]];
 return '<div class="settings-shell"><div class="settings-close-row"><button type="button" class="settings-secondary-action" id="settingsCloseToTrading">Close</button></div>'+
 '<h2>Settings</h2><p class="settings-description">Manage your local GoTradeX preferences without changing balances or trading connections.</p>'+
 '<div class="settings-form-group"><label for="prefLang">Language</label><select id="prefLang"><option value="en">English (Default)</option><option disabled>Bemba - Coming Soon</option><option disabled>Nyanja - Coming Soon</option><option disabled>Swahili - Coming Soon</option><option disabled>French - Coming Soon</option><option disabled>Portuguese - Coming Soon</option></select></div>'+
 '<div class="settings-form-group"><label>Theme</label><div class="settings-theme-row">'+
 '<button type="button" class="theme-btn" data-theme-choice="dark">Dark</button><button type="button" class="theme-btn" data-theme-choice="light">Light</button><button type="button" class="theme-btn" data-theme-choice="default-dark">Default Dark</button><button type="button" class="theme-btn" data-theme-choice="custom">Custom</button></div></div>'+
 '<div class="settings-form-group"><label>Custom Background - Choose Color</label><div class="settings-colors">'+colors.map(function(c){return '<button type="button" class="settings-color" data-color-choice="'+c[0]+'" title="'+c[1]+'" aria-label="'+c[1]+' background" style="background:'+c[0]+'"></button>';}).join("")+'</div></div>'+
 '<div class="settings-form-group"><label for="bgUpload">Upload Your Own Picture as Background</label><input type="file" id="bgUpload" accept="image/*"><div class="settings-actions"><button type="button" class="settings-secondary-action" id="removeCustomBg">Remove Custom Background</button><span id="bgStatus" style="font-size:12px">'+(img?"Custom image set ✓":"No custom image")+'</span></div><div id="settingsBgPreview"></div></div>'+
 '<div class="settings-form-group"><label for="prefAmount">Default Trade Amount</label><select id="prefAmount">'+["1","5","10","20","50","100"].map(function(v){return '<option value="'+v+'"'+(String(p.amount||"10")===v?" selected":"")+'>'+v+'</option>';}).join("")+'</select></div>'+
 '<div class="settings-form-group"><label for="prefTime">Default Timeframe</label><select id="prefTime">'+["30s","1 Minute","2 Minutes","5 Minutes"].map(function(v){return '<option value="'+v+'"'+(String(p.time||"1 Minute")===v?" selected":"")+'>'+v+'</option>';}).join("")+'</select></div>'+
 '<div class="settings-form-group"><label class="settings-check-label"><input type="checkbox" id="prefSound"'+(p.sound===false?"":" checked")+'> Sound Alerts ON</label><label class="settings-check-label"><input type="checkbox" id="prefConfirm"'+(p.confirm===false?"":" checked")+'> Confirm Before Trade</label></div>'+
 '<button type="button" class="settings-main-action" id="saveSettingsButton">Save Settings</button><div class="settings-status" id="settingsStatus" role="status"></div>'+
 '<button type="button" class="settings-secondary-action" id="settingsBackButton" style="width:100%;margin-top:10px">← Back to Previous Portal</button></div>';
}
function setTheme(theme){
 if(["dark","light","default-dark","custom"].indexOf(theme)<0)theme="default-dark";
 safeSet("gtx_theme",theme);
 document.body.setAttribute("data-theme",theme);
 var bg=theme==="light"?"#ffffff":(theme==="dark"?"#111827":"#0a0a0a");
 var fg=theme==="light"?"#111827":"#ffffff";
 if(theme==="custom")bg=safeGet("gtx_custom_color","#0a0a0a");
 document.body.style.backgroundColor=bg;document.body.style.color=fg;
 var app=document.querySelector(".app");if(app){app.style.backgroundColor=bg;app.style.color=fg;}
 var preview=byId("settingsBgPreview"),img=safeGet("gtx_custom_bg_image","");
 if(preview){preview.style.backgroundImage=img?'url("'+img+'")':"none";preview.style.backgroundColor=safeGet("gtx_custom_color",bg);preview.style.backgroundSize="cover";preview.style.backgroundPosition="center";}
 document.querySelectorAll("#"+overlayId+" [data-theme-choice]").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-theme-choice")===theme);});
}
function setCustomColor(color){
 if(!/^#[0-9a-f]{6}$/i.test(color))return;
 safeSet("gtx_theme","custom");safeSet("gtx_custom_color",color);
 try{localStorage.removeItem("gtx_custom_bg_image");}catch(e){}
 setTheme("custom");
 var preview=byId("settingsBgPreview");if(preview){preview.style.backgroundImage="none";preview.style.backgroundColor=color;}
 var status=byId("bgStatus");if(status)status.textContent="Custom color applied.";
}
function uploadCustomBg(input){
 var file=input&&input.files&&input.files[0];if(!file)return;
 var status=byId("bgStatus");
 if(!file.type||file.type.indexOf("image/")!==0){if(status)status.textContent="Please select an image file.";return;}
 if(file.size>3*1024*1024){if(status)status.textContent="Image is too large. Choose an image under 3 MB.";input.value="";return;}
 var reader=new FileReader();
 reader.onload=function(e){var data=String(e.target.result||"");if(!safeSet("gtx_custom_bg_image",data)){if(status)status.textContent="Could not save image. Try a smaller image.";return;}
 var preview=byId("settingsBgPreview");if(preview)preview.style.backgroundImage='url("'+data+'")';
 document.body.style.backgroundImage='url("'+data+'")';document.body.style.backgroundSize="cover";document.body.style.backgroundAttachment="fixed";
 var app=document.querySelector(".app");if(app){app.style.backgroundImage='url("'+data+'")';app.style.backgroundSize="cover";app.style.backgroundPosition="center";}
 if(status)status.textContent="Custom image set ✓";};
 reader.readAsDataURL(file);
}
function removeCustomBg(){
 try{localStorage.removeItem("gtx_custom_bg_image");localStorage.removeItem("gtx_custom_color");}catch(e){}
 document.body.style.backgroundImage="";document.body.style.backgroundAttachment="";
 var app=document.querySelector(".app");if(app)app.style.backgroundImage="";
 var preview=byId("settingsBgPreview");if(preview){preview.style.backgroundImage="";preview.style.backgroundColor="";}
 var status=byId("bgStatus");if(status)status.textContent="Removed - Back to Default Dark";
 setTheme("default-dark");
}
function closeOverlay(toPrevious){
 var overlay=byId(overlayId);if(overlay)overlay.classList.remove("is-open");
 if(toPrevious&&previousPortalId){var prev=byId(previousPortalId);if(prev){prev.classList.add("open");prev.style.removeProperty("display");prev.removeAttribute("aria-hidden");}}
 else{document.querySelectorAll(".drawer.open,.adminPage.open,.adminDrawer.open,.helpPage.open,.supportPage.open,.myTeamPage.open,.policyPage.open,.termsPage.open,.userAutoBotDrawer.open,.agentWidget.open,.keypad.open").forEach(function(el){el.classList.remove("open");if(el.id!=="menuDrawer")el.style.setProperty("display","none","important");});var menu=byId("menuDrawer");if(menu)menu.classList.remove("open");}
 var h=document.querySelector(".gtxKenglyHeader");if(h)h.style.setProperty("display","flex","important");
}
function openSettings(){
 var existing=byId(overlayId);
 if(!existing){existing=document.createElement("div");existing.id=overlayId;existing.className="portal-section";document.body.appendChild(existing);}
 var active=document.querySelector(".drawer.open,.adminPage.open,.adminDrawer.open,.helpPage.open,.supportPage.open,.myTeamPage.open,.policyPage.open,.termsPage.open,.userAutoBotDrawer.open,.agentWidget.open,.keypad.open");
 previousPortalId=active&&active.id&&active.id!=="menuDrawer"?active.id:null;
 existing.innerHTML=portalMarkup();existing.classList.add("is-open");existing.setAttribute("role","dialog");existing.setAttribute("aria-modal","true");
 var p=getPrefs();byId("prefLang").value=p.lang||"en";setTheme(safeGet("gtx_theme","default-dark"));
 byId("settingsCloseToTrading").addEventListener("click",function(){closeOverlay(false);});
 byId("settingsBackButton").addEventListener("click",function(){closeOverlay(true);});
 document.querySelectorAll("#"+overlayId+" [data-theme-choice]").forEach(function(b){b.addEventListener("click",function(){setTheme(b.getAttribute("data-theme-choice"));});});
 document.querySelectorAll("#"+overlayId+" [data-color-choice]").forEach(function(b){b.addEventListener("click",function(){setCustomColor(b.getAttribute("data-color-choice"));});});
 byId("bgUpload").addEventListener("change",function(){uploadCustomBg(this);});
 byId("removeCustomBg").addEventListener("click",removeCustomBg);
 byId("saveSettingsButton").addEventListener("click",function(){
  var prefs={lang:byId("prefLang").value,amount:byId("prefAmount").value,time:byId("prefTime").value,sound:byId("prefSound").checked,confirm:byId("prefConfirm").checked};
  if(!safeSet("gtx_settings",JSON.stringify(prefs))){byId("settingsStatus").textContent="Could not save settings on this device.";return;}
  safeSet("gotradex_confirm_trades",String(prefs.confirm));document.body.dataset.gtxSoundAlerts=String(prefs.sound);
  byId("settingsStatus").textContent="Settings saved locally ✓ Balances and trading connections were not changed.";
 });
 var img=safeGet("gtx_custom_bg_image",""),color=safeGet("gtx_custom_color","");
 var preview=byId("settingsBgPreview");if(preview){preview.style.backgroundImage=img?'url("'+img+'")':"none";if(color)preview.style.backgroundColor=color;}
}
window.openGtxSettings=openSettings;
window.gtxSettingsSetTheme=setTheme;
window.gtxSettingsSetColor=setCustomColor;
document.addEventListener("click",function(e){
 var button=e.target&&e.target.closest?e.target.closest('[data-profile-action="settings"]'):null;
 if(!button)return;
 e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();e.stopPropagation();
 var menu=byId("menuDrawer");if(menu)menu.classList.remove("open");
 openSettings();
},true);
document.addEventListener("keydown",function(e){if(e.key==="Escape"){var p=byId(overlayId);if(p&&p.classList.contains("is-open"))closeOverlay(false);}});
})();
