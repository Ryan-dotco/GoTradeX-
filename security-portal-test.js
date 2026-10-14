(function(){
"use strict";
const SUPABASE_URL="https://glffecggusetzklmyukv.supabase.co";
const SUPABASE_KEY="sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let user=null;
function status(text,type){const e=$("globalStatus");e.textContent=text;e.className="status "+(type||"")}
function busy(id,on){const b=$(id);if(!b)return;if(!b.dataset.label)b.dataset.label=b.textContent;b.disabled=on;b.textContent=on?"Please wait…":b.dataset.label}
async function callRpc(name,args){const {data,error}=await sb.rpc(name,args||{});if(error)throw error;return data}
async function loadSecurity(){
 const {data,error}=await sb.rpc("gotradex_security_status");
 if(error)throw error;
 const s=Array.isArray(data)?data[0]:data;
 if(!s){$("pinState").textContent="Not configured";$("accountState").textContent="Profile not found";return}
 $("pinState").textContent=s.has_withdrawal_pin?"Configured":"Not configured";
 $("toggle2FA").checked=!!s.require_email_otp;
 $("accountState").textContent=s.account_frozen_at?"EMERGENCY FROZEN":"Active";
 const until=s.withdrawal_frozen_until?new Date(s.withdrawal_frozen_until):null;
 if(until&&until>new Date()){$("freezeUntil").textContent=until.toLocaleString();$("freezeReason").textContent="Reason: "+(s.freeze_reason||"Security protection")+" · withdrawals blocked";$("freezeBox").classList.add("show")}
 else $("freezeBox").classList.remove("show");
}
async function init(){
 const {data,error}=await sb.auth.getUser();
 if(error||!data.user){$("accountEmail").textContent="Not signed in";$("emailLocked").value="Sign in through GoTradeX first";$("traderId").textContent="Not signed in";status("No active GoTradeX session found. Sign in through the main app, then reopen this test page.","error");return}
 user=data.user;$("accountEmail").textContent=user.email||"Email unavailable";$("emailLocked").value=user.email||"Email unavailable";
 $("traderId").textContent=localStorage.getItem("gotradex_trader_id")||("Account "+user.id.slice(0,8).toUpperCase());
 status("Signed in as "+user.email+". Checking server-side security status…","ok");
 try{await loadSecurity();status("Signed in. Security backend responded successfully.","ok")}
 catch(e){$("pinState").textContent="Not connected";$("accountState").textContent="Migration required";status("Signed in, but the Phase 4 database migration is not applied to this database: "+(e.message||"backend unavailable"),"warn")}
}
$("changePassword").addEventListener("click",async()=>{
 if(!user)return status("Sign in through GoTradeX first.","error");
 const oldPass=$("oldPass").value,newPass=$("newPass").value;
 if(!oldPass||newPass.length<8)return status("Enter the current password and a new password of at least 8 characters.","error");
 busy("changePassword",true);
 try{
  const {error:reauthError}=await sb.auth.signInWithPassword({email:user.email,password:oldPass});
  if(reauthError)throw new Error("Current password is incorrect. Password was not changed.");
  const {error}=await sb.auth.updateUser({password:newPass});if(error)throw error;
  $("oldPass").value="";$("newPass").value="";await loadSecurity();
  status("Password updated. Confirm that the database trigger shows the 24-hour withdrawal freeze.","ok");
 }catch(e){status("Password change failed: "+(e.message||"unknown error"),"error")}
 finally{busy("changePassword",false)}
});
$("setPin").addEventListener("click",async()=>{
 const pin=$("withdrawalPin").value;if(!/^\d{4}$/.test(pin))return status("Withdrawal PIN must contain exactly four digits.","error");
 busy("setPin",true);
 try{const until=await callRpc("gotradex_set_withdrawal_pin",{p_pin:pin});$("withdrawalPin").value="";await loadSecurity();status("PIN saved securely. Withdrawals frozen until "+new Date(until).toLocaleString()+".","ok")}
 catch(e){status("PIN change failed: "+(e.message||"backend unavailable"),"error")}
 finally{busy("setPin",false)}
});
$("toggle2FA").addEventListener("change",async()=>{
 const enabled=$("toggle2FA").checked;
 try{await callRpc("gotradex_set_email_otp_requirement",{p_enabled:enabled});status("Email OTP preference saved. Main-app login enforcement still needs to be confirmed.","ok")}
 catch(e){$("toggle2FA").checked=!enabled;status("Could not save email OTP preference: "+(e.message||"backend unavailable"),"error")}
});
$("logoutOthers").addEventListener("click",async()=>{
 if(!confirm("Log out all other sessions for this account? The current session should remain active."))return;
 busy("logoutOthers",true);
 try{const {error}=await sb.auth.signOut({scope:"others"});if(error)throw error;status("Supabase accepted the request to revoke other sessions.","ok")}
 catch(e){status("Could not revoke other sessions: "+(e.message||"Auth configuration does not support this action"),"error")}
 finally{busy("logoutOthers",false)}
});
$("freezeAccount").addEventListener("click",async()=>{
 if(!confirm("Emergency-freeze this account now? Account actions may be restricted until Admin review."))return;
 busy("freezeAccount",true);
 try{const at=await callRpc("gotradex_freeze_my_account");await loadSecurity();status("Emergency account freeze recorded at "+new Date(at).toLocaleString()+". Contact Admin for review.","error")}
 catch(e){status("Emergency freeze failed: "+(e.message||"backend unavailable"),"error")}
 finally{busy("freezeAccount",false)}
});
init();
})();