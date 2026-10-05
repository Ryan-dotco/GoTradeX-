/* GoTradeX server-authoritative trade/runtime bridge.
 * The phone is a viewer/controller; the server owns the trade clock and lifecycle.
 * Real-money execution remains disabled until a verified broker execution adapter exists.
 */
(function(){
  "use strict";
  if(window.GoTradeXServerRuntime) return;
  const URL="https://glffecggusetzklmyukv.supabase.co";
  const KEY="sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5";
  const ENGINE=URL+"/functions/v1/gotradex-trade-engine";
  let sb=null, syncTimer=null, syncing=false, realtimeChannel=null, realtimeUserId=null;

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
    return String(document.getElementById("bottomAssetPair")?.textContent||document.getElementById("pairName")?.textContent||"BTC/USD").replace(/\s+(LIVE|OTC)$/i,"").trim();
  }
  async function call(action,extra={}){
    const s=client(); if(!s)throw new Error("Supabase client unavailable.");
    const {data}=await s.auth.getSession(); const token=data?.session?.access_token;
    if(!token)throw new Error("Please sign in before trading.");
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
      const mode=String(localStorage.getItem("gotradex_account_mode")||"DEMO").toUpperCase();
      const j=await call("open",{account_mode:mode,market_mode:String(localStorage.getItem("gotradex_market_mode")||"LIVE").toUpperCase(),asset:asset(),direction,amount:amount(),expiry_seconds:secondsFromUi()});
      if(j.trade) status(direction+" OPEN • SERVER "+new Date(j.trade.expires_at).toLocaleTimeString());
      await sync();
    }catch(e){status(e?.message||"Trade could not be opened.");}
  }
  async function marketState(assetName){
    const s=client(); if(!s) return null;
    const {data}=await s.from("gotradex_market_state").select("*").eq("symbol",String(assetName||asset()).toUpperCase()).maybeSingle();
    return data||null;
  }
  async function sync(){
    if(syncing)return; syncing=true;
    try{
      const j=await call("sync");
      const market=await marketState(asset());
      j.market_state=market;
      window.GoTradeXServerRuntime.last=j;
      const open=(j.open||[]).filter(x=>x.result==="OPEN");
      if(open.length){
        const t=open[0];
        status("LIVE SERVER • "+t.asset+" • "+t.direction+" • "+Math.max(0,Math.ceil((new Date(t.expires_at)-Date.now())/1000))+"s");
      }
      window.dispatchEvent(new CustomEvent("gotradex:server-sync",{detail:j}));
    }catch(e){ /* reconnect quietly; chart/feed status remains independent */ }
    finally{syncing=false;}
  }
  async function setupRealtime(){
    const s=client(); if(!s?.channel)return;
    try{
      const {data}=await s.auth.getSession();
      const uid=data?.session?.user?.id;
      if(!uid || uid===realtimeUserId) return;
      if(realtimeChannel) await s.removeChannel(realtimeChannel);
      realtimeUserId=uid;
      realtimeChannel=s.channel("gotradex-server-trades-"+uid)
        .on("postgres_changes",{
          event:"*",
          schema:"public",
          table:"gotradex_user_trades",
          filter:"user_id=eq."+uid
        },()=>{ sync(); })
        .subscribe();
    }catch(e){ /* five-second sync remains the recovery path */ }
  }
  function install(){
    const buy=document.getElementById("buy"),sell=document.getElementById("sell");
    if(buy)buy.onclick=()=>open("BUY");
    if(sell)sell.onclick=()=>open("SELL");
    setupRealtime();
    sync();
    if(syncTimer)clearInterval(syncTimer);
    syncTimer=setInterval(sync,5000);
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){setupRealtime();sync()}});
    window.addEventListener("pageshow",()=>{setupRealtime();sync()});
    window.addEventListener("online",()=>{setupRealtime();sync()});
  }
  window.GoTradeXServerRuntime={call,sync,open,marketState,last:null};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();