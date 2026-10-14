(function(){
"use strict";
const markup = `
<div class="drawer" id="gtxSecurityPortalIndependent" aria-hidden="true">
 <div class="panel">
  <button class="close" type="button" data-gsp-close>Close</button><h2>Security Portal</h2>
  <p class="gsp-intro">A separate account-protection portal. General Settings remain unchanged.</p>
  <section class="gsp-section"><h3>1. Login Security</h3><p>Change your password or sign out other active sessions.</p>
   <div class="gsp-field"><label for="gspNewPassword">New password (minimum 8 characters)</label><input id="gspNewPassword" type="password" autocomplete="new-password"></div>
   <div class="gsp-field"><label for="gspConfirmPassword">Confirm new password</label><input id="gspConfirmPassword" type="password" autocomplete="new-password"></div>
   <div class="gsp-actions"><button class="gsp-btn primary" data-gsp-action="password">Change Password</button><button class="gsp-btn" data-gsp-action="sessions">Log Out Other Sessions</button></div>
   <div class="gsp-actions"><button class="gsp-btn" data-gsp-action="otp-on">Enable Email OTP Preference</button><button class="gsp-btn" data-gsp-action="otp-off">Disable Email OTP Preference</button></div>
   <div class="gsp-warning">The OTP preference is saved on the account. Mandatory enforcement during every login requires the login flow to check this setting; this control does not claim that step-up enforcement is already active.</div><div class="gsp-state" id="gspLoginStatus"></div>
  </section>
  <section class="gsp-section"><h3>2. Money Security</h3><p>Set a four-digit withdrawal PIN. The security service starts a 24-hour withdrawal freeze when the PIN changes.</p>
   <div class="gsp-field"><label for="gspPin">New 4-digit withdrawal PIN</label><input id="gspPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></div>
   <div class="gsp-field"><label for="gspPinConfirm">Confirm withdrawal PIN</label><input id="gspPinConfirm" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></div>
   <div class="gsp-actions"><button class="gsp-btn primary" data-gsp-action="pin">Save PIN &amp; Start 24-Hour Freeze</button><button class="gsp-btn" data-gsp-action="refresh">Refresh Status</button></div><div class="gsp-state" id="gspMoneyStatus">Security status not loaded.</div>
  </section>
  <section class="gsp-section"><h3>3. Email Protection</h3><p>Registered email changes are submitted for Admin review; submitting a request does not change your login email.</p>
   <div class="gsp-field"><label for="gspRequestedEmail">Requested new email</label><input id="gspRequestedEmail" type="email" autocomplete="email"></div>
   <div class="gsp-field"><label for="gspEmailReason">Reason for the change</label><textarea id="gspEmailReason" rows="2" maxlength="240"></textarea></div>
   <div class="gsp-actions"><button class="gsp-btn primary" data-gsp-action="email-request">Submit Request for Admin Review</button></div><div class="gsp-state" id="gspEmailStatus"></div>
  </section>
  <section class="gsp-section"><h3>4. Device &amp; Emergency</h3><p>Sign out other sessions or request an emergency account freeze.</p>
   <div class="gsp-actions"><button class="gsp-btn" data-gsp-action="sessions">Log Out Other Sessions</button><button class="gsp-btn" data-gsp-action="facial">Open Facial Verification</button><button class="gsp-btn danger" data-gsp-action="freeze">Emergency Freeze Account</button></div><div class="gsp-state" id="gspDeviceStatus"></div>
   <div class="gsp-warning">Emergency freeze is a serious restriction. Use only if you suspect unauthorized access.</div>
  </section>
 </div>
</div>`;
function init(){
 if(document.getElementById("gtxSecurityPortalIndependent"))return;
 const host=document.createElement("div");host.innerHTML=markup;document.body.appendChild(host.firstElementChild);
 const root=document.getElementById("gtxSecurityPortalIndependent");
 const $=id=>document.getElementById(id);
 function note(id,msg,type){const e=$(id);if(e){e.textContent=msg||"";e.className="gsp-state"+(type?" "+type:"")}}
 function sb(){return window.supabaseClient||null}
 async function auth(){const c=sb();if(!c)throw Error("Secure account connection is not ready.");const r=await c.auth.getUser();if(r.error)throw r.error;if(!r.data||!r.data.user)throw Error("Please sign in first.");return {c,user:r.data.user}}
 async function call(c,name,args){const r=await c.rpc(name,args||{});if(r.error)throw r.error;return r.data}
 async function refresh(){
  try{const {c}=await auth();const d=await call(c,"gotradex_security_status");const x=Array.isArray(d)?d[0]:d;
   if(!x){note("gspMoneyStatus","No security status returned. Check that the account security migration is installed.","err");return}
   note("gspMoneyStatus","Withdrawal PIN: "+(x.has_withdrawal_pin?"SET":"NOT SET")+"\nEmail OTP preference: "+(x.require_email_otp?"ON":"OFF")+"\nWithdrawal freeze until: "+(x.withdrawal_frozen_until?new Date(x.withdrawal_frozen_until).toLocaleString():"Not active")+"\nAccount: "+(x.account_frozen_at?"EMERGENCY FROZEN":"Not frozen"),x.account_frozen_at?"err":"ok");
   note("gspDeviceStatus",x.account_frozen_at?"Emergency freeze is active. Contact Admin for review.":"No emergency freeze is currently recorded.",x.account_frozen_at?"err":"ok");
  }catch(e){note("gspMoneyStatus",e.message||"Could not load status.","err")}
 }
 function open(){document.getElementById("menuDrawer")?.classList.remove("open");document.querySelectorAll(".drawer.open").forEach(x=>{if(x!==root)x.classList.remove("open")});root.classList.add("open");root.style.setProperty("display","block","important");root.style.setProperty("z-index","2147483003","important");root.removeAttribute("aria-hidden");refresh()}
 function close(){root.classList.remove("open");root.style.setProperty("display","none","important");root.setAttribute("aria-hidden","true")}
 async function run(a){
  try{
   const {c}=await auth();
   if(a==="password"){const p=$("gspNewPassword").value,q=$("gspConfirmPassword").value;if(p.length<8)throw Error("Password must contain at least 8 characters.");if(p!==q)throw Error("Password confirmation does not match.");const r=await c.auth.updateUser({password:p});if(r.error)throw r.error;$("gspNewPassword").value="";$("gspConfirmPassword").value="";note("gspLoginStatus","Password changed. The configured server trigger should apply the 24-hour withdrawal freeze.","ok");await refresh();return}
   if(a==="sessions"){if(!confirm("Sign out other active sessions?"))return;const r=await c.auth.signOut({scope:"others"});if(r.error)throw r.error;note("gspDeviceStatus","Sign-out request for other sessions completed. This device remains signed in.","ok");return}
   if(a==="otp-on"||a==="otp-off"){await call(c,"gotradex_set_email_otp_requirement",{p_enabled:a==="otp-on"});note("gspLoginStatus","Email OTP preference saved. Login-flow enforcement is a separate integration.","ok");await refresh();return}
   if(a==="pin"){const p=$("gspPin").value,q=$("gspPinConfirm").value;if(!/^[0-9]{4}$/.test(p))throw Error("PIN must be exactly four digits.");if(p!==q)throw Error("PIN confirmation does not match.");const until=await call(c,"gotradex_set_withdrawal_pin",{p_pin:p});$("gspPin").value="";$("gspPinConfirm").value="";note("gspMoneyStatus","PIN saved. Withdrawal freeze until: "+(until?new Date(until).toLocaleString():"server-confirmed time")+".","ok");await refresh();return}
   if(a==="refresh"){await refresh();return}
   if(a==="email-request"){const email=$("gspRequestedEmail").value.trim(),reason=$("gspEmailReason").value.trim();const d=await call(c,"gotradex_request_email_change",{p_requested_email:email,p_reason:reason});note("gspEmailStatus","Request submitted for Admin review. ID: "+(d&&d.request_id||"submitted")+". Your registered email is unchanged.","ok");return}
   if(a==="freeze"){if(!confirm("Emergency freeze blocks new trades and protected withdrawals pending Admin review. Continue?"))return;const d=await call(c,"gotradex_freeze_my_account");note("gspDeviceStatus","Emergency freeze recorded by the server at "+(d?new Date(d).toLocaleString():"now")+".","err");await refresh();return}
   if(a==="facial"){close();const b=Array.from(document.querySelectorAll(".menuItem")).find(x=>x.dataset.section==="Facial Verification");if(b)b.click();else note("gspDeviceStatus","Open Facial Verification from the main menu.","");}
  }catch(e){const id=["password","sessions","otp-on","otp-off"].includes(a)?"gspLoginStatus":a==="pin"||a==="refresh"?"gspMoneyStatus":a==="email-request"?"gspEmailStatus":"gspDeviceStatus";note(id,e.message||"Action failed.","err")}
 }
 window.addEventListener("click",e=>{
  const b=e.target&&e.target.closest?e.target.closest("[data-open-security-portal]"):null;
  if(b){e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();open();return}
  if(e.target&&e.target.closest&&e.target.closest("[data-gsp-close]")){e.preventDefault();e.stopPropagation();close();return}
  const a=e.target&&e.target.closest?e.target.closest("[data-gsp-action]"):null;if(a){e.preventDefault();e.stopPropagation();run(a.dataset.gspAction)}
 },true);
 window.addEventListener("keydown",e=>{if(e.key==="Escape"&&root.classList.contains("open"))close()});
}
function isVisible(el){
 const s=window.getComputedStyle(el);
 return s.display!=="none"&&s.visibility!=="hidden"&&el.getClientRects().length>0;
}
function addLauncher(container){
 if(!container||container.querySelector("[data-open-security-portal='true']"))return false;
 const b=document.createElement("button");
 b.type="button";b.className="gsp-settings-entry";b.setAttribute("data-open-security-portal","true");
 b.innerHTML='<span class="gsp-entry-icon" aria-hidden="true">⛨</span><span class="gsp-entry-copy"><strong>Security Portal</strong><small>Password, withdrawal PIN, email protection & emergency controls</small></span><span class="gsp-entry-arrow" aria-hidden="true">›</span>';
 container.appendChild(b);
 return true;
}
function installSettingsEntry(){
 // The Security Portal belongs in the profile drawer, directly between Settings and Notifications.
 const profile=document.getElementById("gtxProfileDrawer");
 if(profile){
  document.querySelectorAll("[data-open-security-portal='true']").forEach(function(old){
   if(!profile.contains(old))old.remove();
  });
  const settingsButton=profile.querySelector('[data-profile-action="settings"]');
  if(settingsButton){
   let launcher=profile.querySelector("[data-open-security-portal='true']");
   if(!launcher){
    launcher=document.createElement("button");
    launcher.type="button";
    launcher.className="gsp-settings-entry";
    launcher.setAttribute("data-open-security-portal","true");
    launcher.innerHTML='<span class="gsp-entry-icon" aria-hidden="true">⛨</span><span class="gsp-entry-copy"><strong>Security Portal</strong><small>Password, withdrawal PIN, email protection &amp; emergency controls</small></span><span class="gsp-entry-arrow" aria-hidden="true">›</span>';
   }
   if(settingsButton.nextElementSibling!==launcher)settingsButton.insertAdjacentElement("afterend",launcher);
   return;
  }
 }
 // Do not place the launcher inside Settings while the profile drawer is not mounted.
}
const observer=new MutationObserver(installSettingsEntry);
function watchSettings(){installSettingsEntry();observer.observe(document.body,{childList:true,subtree:true,characterData:true})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{init();watchSettings()});else{init();watchSettings()}
})();