/* GoTradeX Profile + Account screens — isolated implementation */
(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const safeRead=(key,fallback={})=>{try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))||fallback}catch(e){return fallback}};
  const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){return false}};
  const mode=()=>localStorage.getItem("gotradex_account_mode")==="REAL"?"LIVE":"DEMO";
  const money=n=>"$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  function accountEmail(){
    const p=safeRead("gotradex_profile",{});
    if(p.email)return p.email;
    for(const k of ["gotradex_current_user","gotradex_logged_in_user","gotradex_user","gotradex_session"]){
      const v=safeRead(k,null); if(v&&typeof v==="object"){
        const email=v.email||v.user?.email||v.session?.user?.email;
        if(email)return email;
      }
    }
    try{const sb=window.supabaseClient;if(sb&&sb.auth&&sb.auth.getSession){/* asynchronous email is filled below */}}catch(e){}
    return "";
  }
  function balance(){
    const key=mode()==="LIVE"?"gotradex_real_balance":"gotradex_demo_balance";
    const fallback=mode()==="LIVE"?0:10000;
    const n=Number(localStorage.getItem(key));
    return Number.isFinite(n)?n:fallback;
  }
  function ensureStyles(){
    if($("gtxProfileAccountScreenStyle"))return;
    const s=document.createElement("style");s.id="gtxProfileAccountScreenStyle";
    s.textContent=`
      #gtxProfileScreen,#gtxAccountScreen{position:fixed;inset:0;z-index:110;background:#061426;display:none;overflow:auto;color:#fff}
      #gtxProfileScreen.open,#gtxAccountScreen.open{display:block}
      .gtxPASHead{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px;background:#081b33;border-bottom:1px solid #23466d}
      .gtxPASHead h2{margin:0;font-size:17px;flex:1}.gtxPASBtn{min-height:40px;border-radius:9px;background:#163554;color:#fff;padding:9px 13px;font-weight:800}
      .gtxPASBody{padding:14px;max-width:650px;margin:0 auto}.gtxPASCard{background:#091f3a;border:1px solid #23466d;border-radius:12px;padding:14px;margin-bottom:12px}
      .gtxPASHero{display:flex;align-items:center;gap:12px}.gtxPASAvatar{width:54px;height:54px;border-radius:14px;background:#176fca;display:grid;place-items:center;font-size:21px;font-weight:900;flex:0 0 auto}
      .gtxPASHero strong{display:block;font-size:15px;overflow-wrap:anywhere}.gtxPASMuted{color:#8fa8c4;font-size:11px;line-height:1.5;margin-top:5px}
      .gtxPASField{display:block;margin:12px 0}.gtxPASField span{display:block;color:#8fa8c4;font-size:11px;margin-bottom:6px}
      .gtxPASField input{width:100%;height:44px;background:#081b33;color:#fff;border:1px solid #23466d;border-radius:8px;padding:0 11px}
      .gtxPASRow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #183653;font-size:12px}.gtxPASRow:last-child{border-bottom:0}
      .gtxPASRow span{color:#8fa8c4}.gtxPASGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.gtxPASStat{background:#102945;border:1px solid #23466d;border-radius:10px;padding:12px;min-width:0}.gtxPASStat span{display:block;color:#8fa8c4;font-size:10px}.gtxPASStat strong{display:block;font-size:17px;margin-top:6px;overflow-wrap:anywhere}
      .gtxPASActions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.gtxPASPrimary{background:#176fca}.gtxPASStatus{min-height:16px;color:#8fe0b0;font-size:11px;margin-top:9px}
      @media(max-width:390px){.gtxPASBody{padding:10px}.gtxPASHead{padding:10px}.gtxPASHead h2{font-size:15px}.gtxPASStat strong{font-size:14px}}
    `;
    document.head.appendChild(s);
  }
  function ensureScreen(id,title){
    let screen=$(id);if(screen)return screen;
    screen=document.createElement("section");screen.id=id;
    screen.innerHTML='<header class="gtxPASHead"><button type="button" class="gtxPASBtn" data-pas-back>Back</button><h2>'+title+'</h2><button type="button" class="gtxPASBtn" data-pas-close>Close</button></header><div class="gtxPASBody" id="'+id+'Body"></div>';
    document.body.appendChild(screen);
    screen.querySelector("[data-pas-back]").addEventListener("click",()=>{screen.classList.remove("open");$("menuDrawer")?.classList.add("open")});
    screen.querySelector("[data-pas-close]").addEventListener("click",()=>screen.classList.remove("open"));
    return screen;
  }
  function openScreen(id,title,render){
    ensureStyles();const s=ensureScreen(id,title);
    $("menuDrawer")?.classList.remove("open");
    document.querySelectorAll("#gtxProfileScreen.open,#gtxAccountScreen.open").forEach(x=>x.classList.remove("open"));
    render($(id+"Body"));s.classList.add("open");window.scrollTo(0,0);
  }
  function openProfile(){
    openScreen("gtxProfileScreen","My Profile",body=>{
      const p=safeRead("gotradex_profile",{});
      const name=p.displayName||localStorage.getItem("gotradex_profile_name")||"Ryan Trading Account";
      const email=accountEmail();
      const referral=p.referralCode||"GTX-REF";
      const verified=localStorage.getItem("gotradex_email_verified")==="true"?"EMAIL VERIFIED":"STATUS NOT CONFIRMED";
      body.innerHTML=
        '<div class="gtxPASCard"><div class="gtxPASHero"><div class="gtxPASAvatar" id="gtxPASAvatar"></div><div><strong>'+name.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</strong><div class="gtxPASMuted">Trader ID: GTX-000001 · '+mode()+' ACCOUNT</div></div></div></div>'+
        '<div class="gtxPASCard"><label class="gtxPASField"><span>Display name</span><input id="gtxPASName" maxlength="40" autocomplete="name"></label>'+
        '<label class="gtxPASField"><span>Account email</span><input id="gtxPASEmail" type="email" readonly placeholder="Sign in to load account email"></label>'+
        '<label class="gtxPASField"><span>Referral code</span><input id="gtxPASReferral" maxlength="24"></label>'+
        '<div class="gtxPASRow"><span>Email verification</span><strong>'+verified+'</strong></div>'+
        '<button type="button" class="gtxPASBtn gtxPASPrimary" id="gtxPASSave" style="width:100%;margin-top:12px">SAVE PROFILE</button><div class="gtxPASStatus" id="gtxPASStatus"></div></div>'+
        '<div class="gtxPASMuted">Profile edits are saved on this device. They do not change account permissions, balances, or trading access.</div>';
      $("gtxPASAvatar").textContent=(name.charAt(0)||"R").toUpperCase();
      $("gtxPASName").value=name;$("gtxPASEmail").value=email;$("gtxPASReferral").value=referral;
      $("gtxPASSave").onclick=()=>{
        const next=safeRead("gotradex_profile",{});
        next.displayName=($("gtxPASName").value||"Trader").trim().slice(0,40)||"Trader";
        next.email=email;
        next.referralCode=($("gtxPASReferral").value||"GTX-REF").trim().toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,24)||"GTX-REF";
        if(safeWrite("gotradex_profile",next)){
          localStorage.setItem("gotradex_profile_name",next.displayName);
          $("gtxPASAvatar").textContent=next.displayName.charAt(0).toUpperCase();
          const m=$("gtxProfileMenuName");if(m)m.textContent=next.displayName;
          const av=$("gtxProfileAvatar");if(av)av.textContent=next.displayName.charAt(0).toUpperCase();
          const top=$("profileSub");if(top)top.textContent=next.displayName;
          $("gtxPASStatus").textContent="Profile saved on this device.";
        }else $("gtxPASStatus").textContent="Could not save profile in this browser.";
      };
      try{
        const sb=window.supabaseClient;
        if(sb?.auth?.getUser)sb.auth.getUser().then(({data})=>{const em=data?.user?.email;if(em&&$("gtxPASEmail"))$("gtxPASEmail").value=em}).catch(()=>{});
      }catch(e){}
    });
  }
  function openAccount(){
    openScreen("gtxAccountScreen","Account",body=>{
      const m=mode(),bal=balance();
      const profile=safeRead("gotradex_profile",{});
      body.innerHTML=
        '<div class="gtxPASCard"><div class="gtxPASHero"><div class="gtxPASAvatar">GTX</div><div><strong>GoTradeX Account</strong><div class="gtxPASMuted">Trader ID: GTX-000001</div></div></div></div>'+
        '<div class="gtxPASGrid"><div class="gtxPASStat"><span>ACCOUNT MODE</span><strong id="gtxPASMode">'+m+'</strong></div><div class="gtxPASStat"><span>DISPLAY BALANCE</span><strong id="gtxPASBalance">'+money(bal)+'</strong></div></div>'+
        '<div class="gtxPASCard" style="margin-top:12px"><div class="gtxPASRow"><span>Account holder</span><strong>'+(profile.displayName||"Ryan Trading Account")+'</strong></div>'+
        '<div class="gtxPASRow"><span>Email</span><strong style="overflow-wrap:anywhere">'+(accountEmail()||"Not available")+'</strong></div>'+
        '<div class="gtxPASRow"><span>Account status</span><strong>App account</strong></div>'+
        '<div class="gtxPASRow"><span>Execution</span><strong>'+(m==="DEMO"?"Paper trading":"Live orders disabled")+'</strong></div>'+
        '<div class="gtxPASActions"><button type="button" class="gtxPASBtn" id="gtxPASDemo">DEMO ACCOUNT</button><button type="button" class="gtxPASBtn" id="gtxPASLive">LIVE ACCOUNT</button></div>'+
        '<div class="gtxPASStatus" id="gtxPASAccountStatus"></div></div>'+
        '<div class="gtxPASCard"><strong>Account tools</strong><div class="gtxPASActions"><button type="button" class="gtxPASBtn" id="gtxPASDetails">ACCOUNT DETAILS</button><button type="button" class="gtxPASBtn" id="gtxPASHistory">TRANSACTION HISTORY</button></div><div class="gtxPASMuted">Deposit and withdrawal actions remain subject to a verified payment connection. Selecting LIVE does not enable real-money orders.</div></div>';
      function selectMode(value){
        try{
          if(typeof window.GoTradeXSetAccountMode==="function")window.GoTradeXSetAccountMode(value);
          else if(typeof window.setAccountMode==="function")window.setAccountMode(value);
          else localStorage.setItem("gotradex_account_mode",value);
          if(typeof window.GoTradeXSetAccountMode!=="function"&&typeof window.setAccountMode!=="function")localStorage.setItem("gotradex_account_mode",value);
          $("gtxPASMode").textContent=value==="REAL"?"LIVE":"DEMO";$("gtxPASBalance").textContent=money(balance());
          const picker=$("accountPickerLabel");if(picker)picker.textContent=(value==="REAL"?"LIVE":"DEMO")+" ▾";
          $("gtxPASAccountStatus").textContent=value==="REAL"?"LIVE selected. Real-money order execution remains disabled.":"DEMO selected. Paper-trading mode is active.";
        }catch(e){$("gtxPASAccountStatus").textContent="Could not change account mode: "+(e.message||"please try again");}
      }
      $("gtxPASDemo").onclick=()=>selectMode("DEMO");$("gtxPASLive").onclick=()=>selectMode("REAL");
      $("gtxPASDetails").onclick=()=>{const d=$("gtxAccountDetails");if(d){$("gtxAccountScreen").classList.remove("open");d.classList.add("open")}else $("gtxPASAccountStatus").textContent="Account details are not available yet."};
      $("gtxPASHistory").onclick=()=>{const h=$("gtxAccountHistory");if(h){$("gtxAccountScreen").classList.remove("open");h.classList.add("open")}else $("gtxPASAccountStatus").textContent="Transaction history is not available yet."};
    });
  }
  function bind(){
    document.querySelectorAll('[data-profile-action="profile"]').forEach(b=>{b.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();openProfile()},true)});
    document.querySelectorAll('[data-profile-action="account"]').forEach(b=>{b.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();openAccount()},true)});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
  window.GoTradeXOpenProfile=openProfile;window.GoTradeXOpenAccount=openAccount;
})();