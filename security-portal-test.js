(function(){
"use strict";
const SUPABASE_URL="https://glffecggusetzklmyukv.supabase.co";
const SUPABASE_KEY="sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let user=null, isAdmin=false;
function status(message,type){const el=$("globalStatus");el.textContent=message;el.className="status "+(type||"")}
function busy(id,on){const b=$(id);if(!b)return;if(!b.dataset.label)b.dataset.label=b.textContent;b.disabled=on;b.textContent=on?"Please wait…":b.dataset.label}
async function rpc(name,args){const {data,error}=await sb.rpc(name,args||{});if(error)throw error;return data}
function explainError(e){const m=String(e?.message||e||"Unknown error");if(/gotradex_security_status|schema cache|function .* does not exist|PGRST202/i.test(m))return "Security database migration is not applied to this test database yet.";return m}
async function loadSecurity(){
 const data=await rpc("gotradex_security_status");
 const s=Array.isArray(data)?data[0]:data;
 if(!s){$("pinState").textContent="Profile not found";$("accountState").textContent="No security profile";return null}
 $("pinState").textContent=s.has_withdrawal_pin?"Configured":"Not configured";
 $("toggle2FA").checked=!!s.require_email_otp;
 $("accountState").textContent=s.account_frozen_at?"EMERGENCY FROZEN":"Active";
 const until=s.withdrawal_frozen_until?new Date(s.withdrawal_frozen_until):null;
 if(until&&until>new Date()){$("freezeUntil").textContent=until.toLocaleString();$("freezeReason").textContent="Reason: "+(s.freeze_reason||"Security protection")+" · withdrawals blocked";$("freezeBox").classList.add("show")}
 else $("freezeBox").classList.remove("show");
 return s;
}
function queueCard(item){
 const card=document.createElement("div");card.className="card";card.style.margin="10px 0";card.style.padding="12px";
 const title=document.createElement("strong");title.textContent=(item.current_email||"Unknown current email")+" → "+item.requested_email;card.appendChild(title);
 const meta=document.createElement("p");meta.className="hint";meta.textContent="Trader: "+item.user_id+" · Requested: "+(item.created_at?new Date(item.created_at).toLocaleString():"—")+" · Reason: "+(item.reason||"Not supplied");card.appendChild(meta);
 const note=document.createElement("input");note.type="text";note.maxLength=240;note.placeholder="Admin decision note (required)";note.style.marginBottom="8px";card.appendChild(note);
 const actions=document.createElement("div");actions.style.display="flex";actions.style.gap="8px";actions.style.flexWrap="wrap";
 for(const decision of ["approved","rejected"]){const b=document.createElement("button");b.type="button";b.textContent=decision==="approved"?"Approve request":"Reject request";b.className=decision==="rejected"?"danger":"secondary";b.style.width="auto";b.addEventListener("click",async()=>{if(!note.value.trim()){status("Admin must enter a reason for the decision.","error");note.focus();return}if(!confirm("Record this email-change request as "+decision+"? This does not itself change the registered Auth email."))return;b.disabled=true;try{await rpc("gotradex_admin_review_email_change_request",{p_request_id:item.id,p_decision:decision,p_admin_note:note.value.trim()});status("Admin decision recorded. The registered email remains locked until a separate secure Auth email-change operation is completed.","ok");await loadQueue()}catch(e){status("Admin review failed: "+explainError(e),"error");b.disabled=false}});actions.appendChild(b)}
 card.appendChild(actions);return card;
}
async function loadQueue(){
 if(!isAdmin)return;
 $("emailQueueStatus").textContent="Loading requests…";$("emailQueue").replaceChildren();
 try{const rows=await rpc("gotradex_admin_list_email_change_requests");const items=Array.isArray(rows)?rows:[];$("emailQueueStatus").textContent=items.length?items.length+" pending request(s).":"No pending email-change requests.";for(const item of items)$("emailQueue").appendChild(queueCard(item))}
 catch(e){$("emailQueueStatus").textContent="Admin queue unavailable: "+explainError(e)}
}
async function init(){
 const {data,error}=await sb.auth.getUser();
 if(error||!data.user){$("accountEmail").textContent="Not signed in";$("emailLocked").value="Sign in through GoTradeX first";$("traderId").textContent="Not signed in";status("No active GoTradeX session found. Sign in through the main app, then reopen Security.","error");return}
 user=data.user;$("accountEmail").textContent=user.email||"Email unavailable";$("emailLocked").value=user.email||"Email unavailable";
 $("traderId").textContent=localStorage.getItem("gotradex_trader_id")||("Account "+user.id.slice(0,8).toUpperCase());
 status("Signed in as "+user.email+". Checking server-side security status…","ok");
 try{await loadSecurity();status("Signed in. Security settings loaded from the database.","ok")}
 catch(e){$("pinState").textContent="Not connected";$("accountState").textContent="Migration required";status("Security actions cannot be verified until the Phase 4 migration is applied to a separate test database: "+explainError(e),"warn")}
 // Authorization comes only from the server-side admin_users table/RPC, never browser metadata.
 try{await rpc("gotradex_admin_list_email_change_requests");isAdmin=true;$("adminEmailQueue").hidden=false;await loadQueue()}
 catch(_){isAdmin=false;$("adminEmailQueue").hidden=true}
}
$("changePassword").addEventListener("click",async()=>{
 if(!user)return status("Sign in through GoTradeX first.","error");
 const oldPass=$("oldPass").value,newPass=$("newPass").value;
 if(!oldPass||newPass.length<8)return status("Enter the current password and a new password of at least 8 characters.","error");
 busy("changePassword",true);
 try{const {error:reauthError}=await sb.auth.signInWithPassword({email:user.email,password:oldPass});if(reauthError)throw new Error("Current password is incorrect. Password was not changed.");const {error}=await sb.auth.updateUser({password:newPass});if(error)throw error;$("oldPass").value="";$("newPass").value="";await loadSecurity();status("Password updated. Check the status panel for the 24-hour withdrawal freeze.","ok")}
 catch(e){status("Password change failed: "+explainError(e),"error")}finally{busy("changePassword",false)}
});
$("setPin").addEventListener("click",async()=>{
 if(!user)return status("Sign in through GoTradeX first.","error");
 const pin=$("withdrawalPin").value;if(!/^\d{4}$/.test(pin))return status("Withdrawal PIN must contain exactly four digits.","error");
 busy("setPin",true);try{const until=await rpc("gotradex_set_withdrawal_pin",{p_pin:pin});$("withdrawalPin").value="";await loadSecurity();status("PIN saved. Withdrawals are frozen until "+new Date(until).toLocaleString()+".","ok")}
 catch(e){status("PIN change failed: "+explainError(e),"error")}finally{busy("setPin",false)}
});
$("toggle2FA").addEventListener("change",async()=>{
 if(!user){$("toggle2FA").checked=false;return status("Sign in through GoTradeX first.","error")}
 const enabled=$("toggle2FA").checked;
 try{await rpc("gotradex_set_email_otp_requirement",{p_enabled:enabled});status(enabled?"Email OTP requirement saved. Main-app login now checks this setting after password authentication.":"Email OTP requirement disabled for future logins.","ok")}
 catch(e){$("toggle2FA").checked=!enabled;status("Could not save email OTP preference: "+explainError(e),"error")}
});
$("requestEmailChange").addEventListener("click",async()=>{
 if(!user)return status("Sign in through GoTradeX first.","error");
 const email=$("requestedEmail").value.trim().toLowerCase(),reason=$("emailChangeReason").value.trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return $("emailRequestState").textContent="Enter a valid requested email address.";
 if(email===String(user.email||"").toLowerCase())return $("emailRequestState").textContent="That is already your registered email.";
 if(!reason)return $("emailRequestState").textContent="Please enter a reason for the Admin review.";
 busy("requestEmailChange",true);
 try{const result=await rpc("gotradex_request_email_change",{p_requested_email:email,p_reason:reason});$("requestedEmail").value="";$("emailChangeReason").value="";$("emailRequestState").textContent="Request submitted for Admin review. Reference: "+(result?.request_id||result?.id||"created")+". Your registered email has not changed.";status("Email change request submitted. The current registered email remains locked.","ok");if(isAdmin)await loadQueue()}
 catch(e){$("emailRequestState").textContent="Request not submitted: "+explainError(e);status("Could not submit email change request: "+explainError(e),"error")}
 finally{busy("requestEmailChange",false)}
});
$("refreshEmailQueue").addEventListener("click",loadQueue);
$("logoutOthers").addEventListener("click",async()=>{
 if(!user)return status("Sign in through GoTradeX first.","error");
 if(!confirm("Log out all other devices for this account? This device will remain signed in if Supabase supports remote session revocation."))return;
 busy("logoutOthers",true);try{const {error}=await sb.auth.signOut({scope:"others"});if(error)throw error;status("Supabase accepted the request to revoke other sessions. Test a second device to confirm its session is rejected.","ok")}
 catch(e){status("Could not revoke other sessions: "+explainError(e),"error")}finally{busy("logoutOthers",false)}
});
$("freezeAccount").addEventListener("click",async()=>{
 if(!user)return status("Sign in through GoTradeX first.","error");
 if(!confirm("Emergency-freeze this account now? New trades and withdrawals should be blocked until Admin review."))return;
 busy("freezeAccount",true);try{const at=await rpc("gotradex_freeze_my_account");await loadSecurity();status("Emergency freeze recorded at "+new Date(at).toLocaleString()+". Sign out and contact Admin to request release.","error")}
 catch(e){status("Emergency freeze failed: "+explainError(e),"error")}finally{busy("freezeAccount",false)}
});
init();
})();