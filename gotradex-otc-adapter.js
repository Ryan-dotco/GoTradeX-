/* GoTradeX OTC read-only adapter.
 * Reads only the isolated public OTC tables. Never writes to GoTradeX.
 * Never alters LIVE/crypto/Forex provider resolution.
 */
(function(){
  "use strict";
  if(window.GoTradeXOTCAdapter) return;

  const SUPABASE_URL="https://glffecggusetzklmyukv.supabase.co";
  const SUPABASE_KEY="sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5";
  const PAIRS={
    "EUR/USD OTC":"EUR/USD OTC","GBP/USD OTC":"GBP/USD OTC","USD/JPY OTC":"USD/JPY OTC",
    "AUD/USD OTC":"AUD/USD OTC","USD/CAD OTC":"USD/CAD OTC","USD/CHF OTC":"USD/CHF OTC",
    "NZD/USD OTC":"NZD/USD OTC"
  };
  const TF={60:"1m",300:"5m",900:"15m",1800:"30m",3600:"1h",14400:"4h",86400:"1d",2592000:"1month"};

  function client(){
    if(!window.supabase?.createClient) throw new Error("Supabase client is not loaded.");
    return window.__GoTradeXOTCReadClient||(window.__GoTradeXOTCReadClient=
      window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}}));
  }
  function selectedPair(){
    // The visible bottom Assets selector is the first source of truth.
    // This prevents any stale legacy/localStorage value from keeping the chart
    // bound to the previously selected OTC pair.
    let display="";
    try{display=String(document.getElementById("bottomAssetPair")?.textContent||"").trim()}catch(_){}
    if(display){
      const base=display.replace(/\s+OTC$/i,"").trim();
      const selected=base+" OTC";
      if(PAIRS[selected])return selected;
    }
    // Stored selector state is the second source of truth.
    try{display=String(localStorage.getItem("gotradex_asset_display")||"").trim()}catch(_){}
    if(display){
      const base=display.replace(/\s+OTC$/i,"").trim();
      const selected=base+" OTC";
      if(PAIRS[selected])return selected;
    }
    // Legacy fallback only when the current selector has not provided a value.
    let legacy="";
    try{legacy=String(localStorage.getItem("gtx_pair")||"").trim()}catch(_){}
    if(legacy){
      const selected=legacy.replace(/\s+OTC$/i,"").trim()+" OTC";
      if(PAIRS[selected])return selected;
    }
    return "EUR/USD OTC";
  }
  function timeframe(sec){
    const v=TF[Number(sec)];
    if(!v) throw new Error("OTC timeframe is not supported: "+sec);
    return v;
  }
  async function history(pair,sec){
    const p=PAIRS[pair]||pair;
    const tf=timeframe(sec);
    const {data,error}=await client().from("otc_candles")
      .select("candle_time,open,high,low,close,volume")
      .eq("pair",p).eq("timeframe",tf).order("candle_time",{ascending:true}).limit(500);
    if(error) throw new Error("OTC history read failed: "+error.message);
    return (data||[]).map(x=>({
      t:Date.parse(x.candle_time),o:Number(x.open),h:Number(x.high),l:Number(x.low),
      c:Number(x.close),v:Number(x.volume||0)
    })).filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite));
  }
  async function price(pair){
    const p=PAIRS[pair]||pair;
    const {data,error}=await client().from("otc_prices")
      .select("price,updated_at").eq("pair",p).maybeSingle();
    if(error) throw new Error("OTC price read failed: "+error.message);
    if(!data||!Number.isFinite(Number(data.price))) throw new Error("No OTC price is available for "+p+".");
    return {price:Number(data.price),time:Date.parse(data.updated_at)||Date.now()};
  }
  async function socket(pair,onTick,onStatus){
    let stopped=false;
    let timer=null;
    const endpoint=SUPABASE_URL+"/functions/v1/gotradex-otc-engine";
    const poll=async()=>{
      if(stopped)return;
      try{
        // Read the server-generated OTC price directly so the chart does not
        // freeze when the persisted otc_prices row is momentarily stale.
        const res=await fetch(endpoint,{
          method:"POST",cache:"no-store",
          headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},
          body:JSON.stringify({action:"chart",pair,timeframe:60,tf:60,limit:20})
        });
        const data=await res.json().catch(()=>null);
        const p=Number(data?.price),t=Number(data?.serverTime||Date.now()/1000)*1000;
        if(!res.ok||!Number.isFinite(p))throw new Error(data?.error||"OTC price unavailable");
        if(stopped)return;
        onTick({price:p,time:t});
        onStatus("OTC • LIVE ENGINE",true);
      }catch(e){
        try{
          const p=await price(pair);
          if(stopped)return;
          onTick(p);
          onStatus("OTC • DATA CATCH-UP",true);
        }catch(_){
          if(stopped)return;
          onStatus("OTC • WAITING",false);
        }
      }
    };
    await poll();
    if(!stopped) timer=setInterval(poll,1000);
    return {close(){stopped=true;if(timer)clearInterval(timer)}};
  }

  const feeds=window.GoTradeXMarketFeeds;
  if(!feeds||typeof feeds.resolve!=="function"){
    window.setTimeout(()=>window.dispatchEvent(new Event("gotradex:otc-adapter-retry")),0);
    return;
  }

  const originalResolve=feeds.resolve.bind(feeds);
  feeds.resolve=function(){
    let mode="LIVE";
    try{mode=String(localStorage.getItem("gotradex_market_mode")||"LIVE").toUpperCase()}catch(_){}
    if(mode==="OTC"){
      const pair=selectedPair();
      const base=pair.replace(/\s+OTC$/i,"");
      return {available:true,provider:"GOTRADEX_OTC",symbol:pair,label:base,type:"forex",mode:"OTC",short:false};
    }
    return originalResolve();
  };
  feeds.otcHistory=history;
  feeds.otcPrice=price;
  feeds.otcSocket=socket;
  window.GoTradeXOTCAdapter={history,price,socket,pairs:Object.keys(PAIRS),timeframes:Object.values(TF)};
})();