/* GoTradeX server-authoritative trade/runtime bridge.
 * The phone is a viewer/controller; the server owns the trade clock and lifecycle.
 * Real-money execution remains disabled until a verified broker execution adapter exists.
 */
(function(){
  "use strict";
  if(window.GoTradeXServerRuntime) return;
  const URL="https://glffecggusetzklmyukv.supabase.co";
  const KEY="sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5";
  const ENGINE=URL+"/functions/v1/gotradex-testing-position-engine";
  let sb=null, syncing=false, settleInFlight=false, realtimeChannel=null, realtimeUserId=null;
  const expiryTimers=new Map(), expiryTriggered=new Set();

  function client(){
    if(!sb && window.supabase?.createClient) sb=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
    return sb;
  }
  function secondsFromUi(){
    const text=String(document.getElementById("timeBtn")?.textContent||"5 Seconds");
    const m=text.match(/(\d+)\s*(Second|Seconds|Minute|Minutes|Hour|Hours|Day|Days|Month|Months|Year|Years)/i);
    if(!m)return 5;
    const n=Number(m[1]),u=m[2].toLowerCase();
    if(u.startsWith("second"))return n;
    if(u.startsWith("minute"))return n*60;
    if(u.startsWith("hour"))return n*3600;
    if(u.startsWith("day"))return n*86400;
    if(u.startsWith("month"))return n*2592000;
    return n*31536000;
  }
  function amount(){
    const n=Number(String(document.getElementById("amountValueText")?.textContent||"10").replace(/[^0-9.]/g,""));
    return Number.isFinite(n)&&n>0?n:10;
  }
  function asset(){
    const stored=String(localStorage.getItem("gotradex_asset_display")||"").trim();
    const visible=String(document.getElementById("bottomAssetPair")?.textContent||document.getElementById("pairName")?.textContent||"BTC/USD")
      .replace(/^[A-Z]+\s+/i,"").replace(/\s+(LIVE|OTC)$/i,"").replace(/[▾▼].*$/,"").trim();
    return (stored||visible||"BTC/USD").replace(/\s+OTC$/i,"").trim();
  }
  async function call(action,extra={}){
    const s=client(); if(!s)throw new Error("Supabase client unavailable.");
    const {data}=await s.auth.getSession(); const session=data?.session,token=session?.access_token;
    if(!token||!session?.user?.email_confirmed_at)throw new Error("A verified GoTradeX sign-in is required before trading.");
    const r=await fetch(ENGINE,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",apikey:KEY},body:JSON.stringify({action,...extra})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||j.ok===false)throw new Error(j.error||"Server trade runtime failed.");
    return j;
  }
  function status(message){
    const el=document.getElementById("status"); if(el)el.textContent=message;
  }
  async function open(direction){
    try{
      const selected=window.GoTradeXMarketFeeds?.resolve?.();
      if(!selected?.available||selected.provider!=="BYBIT"||selected.type!=="crypto"||String(selected.mode||"LIVE").toUpperCase()==="OTC"){
        throw new Error("Testing positions currently support verified Bybit Spot crypto only. Forex and OTC Buy/Sell remain IN REVIEW until their provider-specific trade engine is verified.");
      }
      const mode=String(localStorage.getItem("gotradex_account_mode")||"DEMO").toUpperCase();
      const j=await call("open",{account_mode:mode,market_mode:String(localStorage.getItem("gotradex_market_mode")||"LIVE").toUpperCase(),asset:asset(),provider:"BYBIT",provider_symbol:selected.symbol,direction,amount:amount(),expiry_seconds:secondsFromUi()});
      if(j.position){
        const el=document.getElementById("status");
        if(el)el.textContent="";
        window.dispatchEvent(new CustomEvent("gotradex:trade-opened",{detail:{trade:j.position}}));
        const current=window.GoTradeXServerRuntime.last||{open:[],history:[]};
        const history=[j.position,...(current.history||[]).filter(x=>String(x.id)!==String(j.position.id))]
          .sort((a,b)=>Date.parse(b.opened_at||b.created_at||0)-Date.parse(a.opened_at||a.created_at||0)).slice(0,50);
        const open=history.filter(x=>x.result==="OPEN");
        window.GoTradeXServerRuntime.last={...current,ok:true,open,history};
        refreshExpiryTimers(open);
      }
    }catch(e){
      window.dispatchEvent(new CustomEvent("gotradex:trade-open-failed",{detail:{direction:String(direction||"").toUpperCase(),message:e?.message||"Trade could not be opened."}}));
      status(e?.message||"Trade could not be opened.");
    }
  }
  async function touchMarketSubscription(){
    const s=client(); if(!s) return;
    const a=asset(); if(!a) return;
    try{ await s.rpc("gotradex_touch_market_subscription",{p_symbol:String(a).toUpperCase()}); }catch(e){}
  }
  async function marketState(assetName){
    const s=client(); if(!s) return null;
    const {data}=await s.from("gotradex_market_state").select("*").eq("symbol",String(assetName||asset()).toUpperCase()).maybeSingle();
    return data||null;
  }
  function scheduleExpiry(position){
    if(!position||position.expiry_enforced!==true||!position.id)return;
    const id=String(position.id),expires=Date.parse(position.expires_at);
    if(!Number.isFinite(expires)||expiryTriggered.has(id))return;
    if(expiryTimers.has(id))clearTimeout(expiryTimers.get(id));
    const wait=Math.max(0,Math.min(expires-Date.now(),2147483647));
    const timer=setTimeout(()=>{
      expiryTimers.delete(id);
      if(Date.now()<expires){scheduleExpiry(position);return;}
      if(expiryTriggered.has(id))return;
      expiryTriggered.add(id);
      if(!settleInFlight){
        settleInFlight=true;
        void sync().finally(()=>{settleInFlight=false});
      }
    },wait);
    expiryTimers.set(id,timer);
  }
  function refreshExpiryTimers(positions){
    const open=(Array.isArray(positions)?positions:[]).filter(x=>x.result==="OPEN");
    const active=new Set(open.filter(x=>x.expiry_enforced===true).map(x=>String(x.id)));
    for(const [id,timer] of expiryTimers){
      if(!active.has(id)){clearTimeout(timer);expiryTimers.delete(id);expiryTriggered.delete(id);}
    }
    open.forEach(scheduleExpiry);
  }
  async function sync(){
    if(syncing)return; syncing=true;
    try{
      const s=client();
      if(!s)return;
      const {data:authData,error:authError}=await s.auth.getSession();
      if(authError||!authData?.session?.user?.email_confirmed_at){
        window.GoTradeXServerRuntime.last=null;
        return;
      }
      const uid=authData.session.user.id;
      const {data:positions,error:positionsError}=await s.from("gotradex_testing_positions")
        .select("*").eq("user_id",uid).order("opened_at",{ascending:false}).limit(50);
      if(positionsError)throw positionsError;
      const existingHistory=positions||[];
      const existingOpen=existingHistory.filter(x=>x.result==="OPEN");
      let j={ok:true,open:existingOpen,history:existingHistory};

      // Only call the Edge Function when this user actually has an open Testing position.
      // No five-second polling: live ticks and Realtime updates drive the position UI.
      if(existingOpen.length){
        await touchMarketSubscription();
        try{j=await call("sync");}
        catch(e){j={ok:false,open:existingOpen,history:existingHistory,error:e?.message||"Position sync is temporarily unavailable."};}
      }

      const market=await marketState(asset());
      j.market_state=market;
      window.GoTradeXServerRuntime.last=j;

      const open=(j.open||[]).filter(x=>x.result==="OPEN");
      refreshExpiryTimers(open);
      // Running trade state is displayed on the chart, not as a sentence below the controls.
      if(!open.length){
        const el=document.getElementById("status");
        if(el && /LIVE SERVER|TRADE OPEN|BUY OPEN|SELL OPEN/i.test(el.textContent||""))el.textContent="";
      }
      window.dispatchEvent(new CustomEvent("gotradex:server-sync",{detail:j}));
    }catch(e){
      // The next verified live tick, Realtime update, or page-resume event can retry.
    }finally{syncing=false;}
  }
  async function setupRealtime(){
    const s=client(); if(!s?.channel)return;
    try{
      const {data,error}=await s.auth.getSession();
      const session=data?.session;
      const uid=session?.user?.id;
      if(error||!session?.user?.email_confirmed_at||!uid){
        if(realtimeChannel)await s.removeChannel(realtimeChannel);
        realtimeChannel=null;realtimeUserId=null;
        return;
      }
      if(uid===realtimeUserId)return;
      if(realtimeChannel) await s.removeChannel(realtimeChannel);
      realtimeUserId=uid;
      realtimeChannel=s.channel("gotradex-server-trades-"+uid)
        .on("postgres_changes",{
          event:"*",
          schema:"public",
          table:"gotradex_user_trades",
          filter:"user_id=eq."+uid
        },()=>{ sync(); })
        .on("postgres_changes",{
          event:"*",
          schema:"public",
          table:"gotradex_testing_positions",
          filter:"user_id=eq."+uid
        },payload=>{
          const row=payload?.new||payload?.old;
          if(!row?.id)return;
          const current=window.GoTradeXServerRuntime.last||{open:[],history:[]};
          const history=[row,...(current.history||[]).filter(x=>String(x.id)!==String(row.id))]
            .sort((a,b)=>Date.parse(b.opened_at||b.created_at||0)-Date.parse(a.opened_at||a.created_at||0)).slice(0,50);
          const next={...current,ok:true,open:history.filter(x=>x.result==="OPEN"),history};
          window.GoTradeXServerRuntime.last=next;
          refreshExpiryTimers(next.open);
          window.dispatchEvent(new CustomEvent("gotradex:server-sync",{detail:next}));
        })
        .on("postgres_changes",{
          event:"*",
          schema:"public",
          table:"gotradex_market_state"
        },payload=>{
          const m=payload?.new;
          if(m?.symbol){
            const current=window.GoTradeXServerRuntime.last||{open:[],history:[]};
            const next={...current,market_state:m,open:current.open||[],history:current.history||[]};
            window.GoTradeXServerRuntime.last=next;
            window.dispatchEvent(new CustomEvent("gotradex:server-sync",{detail:next}));
          }
        })
        .subscribe();
    }catch(e){ /* five-second sync remains the recovery path */ }
  }
  function onLiveTick(event){
    if(settleInFlight)return;
    const d=event?.detail||{},price=Number(d.price);
    if(!Number.isFinite(price))return;
    const open=(window.GoTradeXServerRuntime.last?.open||[]).filter(x=>x.result==="OPEN");
    let expiredPositionId=null;
    const crossed=open.some(t=>{
      if(t.expiry_enforced!==true||t.provider!=="BYBIT"||String(t.provider_symbol)!==String(d.symbol))return false;
      const buy=t.direction==="BUY";
      const expired=Number.isFinite(Date.parse(t.expires_at))&&Date.parse(t.expires_at)<=Date.now()&&!expiryTriggered.has(String(t.id));
      if(expired)expiredPositionId=String(t.id);
      return expired||(t.stop_loss!=null&&(buy?price<=Number(t.stop_loss):price>=Number(t.stop_loss)))||
        (t.take_profit!=null&&(buy?price>=Number(t.take_profit):price<=Number(t.take_profit)));
    });
    if(!crossed)return;
    if(expiredPositionId)expiryTriggered.add(expiredPositionId);
    settleInFlight=true;
    void sync().finally(()=>{settleInFlight=false});
  }
  function install(){
    const buy=document.getElementById("buy"),sell=document.getElementById("sell");
    if(buy)buy.onclick=()=>open("BUY");
    if(sell)sell.onclick=()=>open("SELL");
    setupRealtime();
    sync();
    window.addEventListener("gotradex:live-tick",onLiveTick);
    const s=client();
    s?.auth.onAuthStateChange(event=>{
      if(event==="SIGNED_IN"){void setupRealtime();void sync();}
      else if(event==="SIGNED_OUT"){void setupRealtime();window.GoTradeXServerRuntime.last=null;}
    });
    const resume=()=>{expiryTriggered.clear();setupRealtime();sync();};
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")resume()});
    window.addEventListener("pageshow",resume);
    window.addEventListener("online",resume);
  }
  async function history(){
    const s=client();if(!s)throw new Error("Supabase client unavailable.");
    const {data:session}=await s.auth.getSession(),user=session?.session?.user;
    if(!user?.email_confirmed_at)throw new Error("Please sign in with a verified email to view your account history.");
    const cutoff=new Date(Date.now()-86400000).toISOString();
    const [demo,legacy]=await Promise.all([
      s.from("gotradex_testing_positions").select("*").eq("user_id",user.id).gte("opened_at",cutoff).order("opened_at",{ascending:false}).limit(100),
      s.from("gotradex_user_trades").select("id,account_mode,market_mode,asset,provider,provider_symbol,direction,amount,opened_at,entry_price,exit_price,result,pnl,settled_at,created_at,metadata").gte("opened_at",cutoff).order("opened_at",{ascending:false}).limit(100)
    ]);
    if(demo.error)throw demo.error;
    if(legacy.error)throw legacy.error;
    const normalize=(r,mode)=>({...r,account_mode:mode,opened_at:r.opened_at||r.created_at,close_reason:r.close_reason||r.metadata?.close_reason||""});
    return [...(demo.data||[]).map(r=>normalize(r,"DEMO")),...(legacy.data||[]).map(r=>normalize(r,r.account_mode==="REAL"?"LIVE":"DEMO"))];
  }
  window.GoTradeXServerRuntime={call,sync,open,marketState,history,last:null};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();