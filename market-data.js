/* GoTradeX verified market-feed registry.
 * No synthetic prices. A feed is marked LIVE only after its provider confirms
 * the selected symbol/stream is available. Bybit Spot is the native crypto feed.
 * Deriv supplies verified forex and OTC-index feeds; Bybit supplies crypto.
 * Unsupported symbols remain unavailable; no synthetic fallback candles are allowed.
 */
(function(){
  "use strict";
  if(window.GoTradeXMarketFeeds) return;

  const CFG = {
    bybitWs: "wss://stream.bybit.com/v5/public/spot",
    bybitRest: "https://api.bybit.com/v5/market/kline"
  };

  const cryptoMap = {
    "BTC/USD":"BTCUSDT","BTCUSD":"BTCUSDT","BTC/USDT":"BTCUSDT","ETH/USD":"ETHUSDT","XRP/USD":"XRPUSDT","SOL/USD":"SOLUSDT",
    "ADA/USD":"ADAUSDT","DOGE/USD":"DOGEUSDT","LTC/USD":"LTCUSDT","BNB/USD":"BNBUSDT",
    "AVAX/USD":"AVAXUSDT","DOT/USD":"DOTUSDT","LINK/USD":"LINKUSDT","TRX/USD":"TRXUSDT",
    "TON/USD":"TONUSDT","ATOM/USD":"ATOMUSDT","UNI/USD":"UNIUSDT","BCH/USD":"BCHUSDT",
    "ETC/USD":"ETCUSDT","XLM/USD":"XLMUSDT","NEAR/USD":"NEARUSDT","APT/USD":"APTUSDT",
    "ARB/USD":"ARBUSDT","OP/USD":"OPUSDT","SUI/USD":"SUIUSDT","FIL/USD":"FILUSDT",
    "ALGO/USD":"ALGOUSDT",
    "SHIB/USD":"SHIBUSDT","PEPE/USD":"PEPEUSDT","AAVE/USD":"AAVEUSDT","ICP/USD":"ICPUSDT",
    "INJ/USD":"INJUSDT","SEI/USD":"SEIUSDT","WIF/USD":"WIFUSDT","RENDER/USD":"RENDERUSDT",
    "SAND/USD":"SANDUSDT","MANA/USD":"MANAUSDT","GALA/USD":"GALAUSDT","FET/USD":"FETUSDT",
    "ONDO/USD":"ONDOUSDT","JUP/USD":"JUPUSDT","POL/USD":"POLUSDT",
    "RUNE/USD":"RUNEUSDT","IMX/USD":"IMXUSDT","LDO/USD":"LDOUSDT","CRV/USD":"CRVUSDT",
    "AR/USD":"ARUSDT","STX/USD":"STXUSDT","TIA/USD":"TIAUSDT","KAS/USD":"KASUSDT",
    "HBAR/USD":"HBARUSDT",
    "VET/USD":"VETUSDT",
    "XTZ/USD":"XTZUSDT",
    "THETA/USD":"THETAUSDT",
    "ZIL/USD":"ZILUSDT",
    "EGLD/USD":"EGLDUSDT",
    "KAVA/USD":"KAVAUSDT",
    "ROSE/USD":"ROSEUSDT",
    "MINA/USD":"MINAUSDT",
    "QNT/USD":"QNTUSDT",
    "ENS/USD":"ENSUSDT",
    "COMP/USD":"COMPUSDT",
    "SNX/USD":"SNXUSDT",
    "DYDX/USD":"DYDXUSDT",
    "PENDLE/USD":"PENDLEUSDT",
    "ENA/USD":"ENAUSDT",
    "WLD/USD":"WLDUSDT",
    "JTO/USD":"JTOUSDT",
    "PYTH/USD":"PYTHUSDT",
    "JASMY/USD":"JASMYUSDT",
    "AXS/USD":"AXSUSDT",
    "CHZ/USD":"CHZUSDT",
    "BOME/USD":"BOMEUSDT",
    "NOT/USD":"NOTUSDT",
    "STRK/USD":"STRKUSDT",
    "ZK/USD":"ZKUSDT",
    "BLUR/USD":"BLURUSDT",
    "MASK/USD":"MASKUSDT",
    "GMT/USD":"GMTUSDT",
    "APE/USD":"APEUSDT",
    "FLOW/USD":"FLOWUSDT",
    "DYM/USD":"DYMUSDT",
    "ALT/USD":"ALTUSDT",
    "AEVO/USD":"AEVOUSDT",
    "ORDI/USD":"ORDIUSDT",
    "CORE/USD":"COREUSDT",
    "BEAM/USD":"BEAMUSDT",
    "GRT/USD":"GRTUSDT",
    "QTUM/USD":"QTUMUSDT",
    "LRC/USD":"LRCUSDT",
    "ENJ/USD":"ENJUSDT",
    "BAT/USD":"BATUSDT",
    "ZRX/USD":"ZRXUSDT",
    "1INCH/USD":"1INCHUSDT",
    "YFI/USD":"YFIUSDT",
    "TWT/USD":"TWTUSDT",
    "ARKM/USD":"ARKMUSDT",
    "MANTA/USD":"MANTAUSDT",
    "BLAST/USD":"BLASTUSDT",
    "ZETA/USD":"ZETAUSDT",
    "XAI/USD":"XAIUSDT"
  };

  // 46 forex pairs returned usable Deriv historical candles in the standalone batch test.
  // This map routes those tested LIVE pairs to Deriv for history and live tick streams.
  // USD/HUF is intentionally excluded: Deriv returned "Invalid symbol" in the batch test.
  const derivMap = {
    "EUR/USD":"frxEURUSD","GBP/USD":"frxGBPUSD","USD/JPY":"frxUSDJPY","AUD/USD":"frxAUDUSD",
    "USD/CHF":"frxUSDCHF","USD/CAD":"frxUSDCAD","NZD/USD":"frxNZDUSD","EUR/GBP":"frxEURGBP",
    "EUR/JPY":"frxEURJPY","GBP/JPY":"frxGBPJPY","EUR/CHF":"frxEURCHF","AUD/JPY":"frxAUDJPY",
    "AUD/CAD":"frxAUDCAD","AUD/CHF":"frxAUDCHF","AUD/NZD":"frxAUDNZD","CAD/JPY":"frxCADJPY",
    "CHF/JPY":"frxCHFJPY","EUR/AUD":"frxEURAUD","EUR/CAD":"frxEURCAD","EUR/NZD":"frxEURNZD",
    "GBP/AUD":"frxGBPAUD","GBP/CAD":"frxGBPCAD","GBP/CHF":"frxGBPCHF","GBP/NZD":"frxGBPNZD",
    "NZD/JPY":"frxNZDJPY","NZD/CAD":"frxNZDCAD","CAD/CHF":"frxCADCHF","USD/SGD":"frxUSDSGD",
    "USD/HKD":"frxUSDHKD","USD/MXN":"frxUSDMXN","USD/ZAR":"frxUSDZAR","EUR/ZAR":"frxEURZAR",
    "GBP/ZAR":"frxGBPZAR","USD/TRY":"frxUSDTRY","USD/NOK":"frxUSDNOK","USD/SEK":"frxUSDSEK",
    "USD/DKK":"frxUSDDKK","EUR/NOK":"frxEURNOK","EUR/SEK":"frxEURSEK","EUR/PLN":"frxEURPLN",
    "EUR/TRY":"frxEURTRY","GBP/SGD":"frxGBPSGD","USD/INR":"frxUSDINR","USD/BRL":"frxUSDBRL",
    "USD/CNH":"frxUSDCNH","USD/IDR":"frxUSDIDR"
  };

  // Deriv OTC indices whose historical candles and short-test live ticks both responded.
  // Australia 200 and Japan 225 are intentionally omitted until their tick streams are verified.
  const derivOtcIndexMap = {
    "US 500":"OTC_SPC", "US Tech 100":"OTC_NDX", "Wall Street 30":"OTC_DJI",
    "Hong Kong 50":"OTC_HSI", "Euro 50":"OTC_SX5E", "France 40":"OTC_FCHI",
    "Germany 40":"OTC_GDAXI", "Netherlands 25":"OTC_AEX", "Swiss 20":"OTC_SSMI",
    "UK 100":"OTC_FTSE"
  };


  function key(){ return ""; }

  async function serverInvoke(body){
    const sb = window.GoTradeXMarketSupabase || (window.GoTradeXMarketSupabase =
      window.supabase.createClient("https://glffecggusetzklmyukv.supabase.co","sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5",{auth:{persistSession:true,autoRefreshToken:true}}));
    const {data,error}=await sb.functions.invoke("gotradex-market-data",{body});
    if(error) throw new Error(error.message||"Secure market-data function failed.");
    if(!data?.ok) throw new Error(data?.error||"No verified market data was returned.");
    return data;
  }

  function type(){
    try{return String(localStorage.getItem("gotradex_asset_type")||"crypto").toLowerCase()}catch(e){return "crypto"}
  }

  function label(){
    try{
      // The stored asset is the authoritative selection. Never infer a new asset
      // from the legacy pairName button, because that element is also used by
      // the chart UI and may still contain its initial BTC/USD text during boot.
      const stored=String(localStorage.getItem("gotradex_asset_display")||"").trim();
      if(stored)return stored.replace(/\s+OTC$/i,"");
      const visible=String(document.getElementById("bottomAssetPair")?.textContent||"").trim().replace(/\s+OTC$/i,"");
      return visible||"BTC/USD";
    }catch(e){return "BTC/USD"}
  }
  function mode(){
    try{return String(localStorage.getItem("gotradex_market_mode")||"LIVE").toUpperCase()}catch(e){return "LIVE"}
  }

  function resolve(){
    const raw=label();
    const l=({BTCUSD:"BTC/USD","BTC/USDT":"BTC/USD"}[raw]||raw);
    const storedType=type();
    const inferredCrypto=!!cryptoMap[l];
    const inferredType=inferredCrypto ? "crypto" :
      /^(XAU|XAG)\//.test(l) ? "metals" :
      /^(WTI|BRENT|NATURAL GAS|COPPER|PLATINUM|PALLADIUM)/i.test(l) ? "commodities" :
      /^[A-Z]{3}\/[A-Z]{3}$/.test(l) ? "forex" : storedType;
    const t=inferredType;
    if(mode()==="OTC"){
      if(t==="indices" && derivOtcIndexMap[l]) return {available:true,provider:"DERIV",symbol:derivOtcIndexMap[l],label:l,type:t,otc:true,mode:"OTC"};
      return {available:false,provider:"NONE",reason:"No verified Deriv OTC feed is configured for "+l+".",label:l,type:t,mode:"OTC"};
    }
    if(t==="crypto" && cryptoMap[l]) return {available:true,provider:"BYBIT",symbol:cryptoMap[l],label:l,type:t,short:true,mode:"LIVE"};
    if(t==="forex" && derivMap[l]) return {available:true,provider:"DERIV",symbol:derivMap[l],label:l,type:t,mode:"LIVE"};
    return {available:false,provider:"NONE",reason:"No verified Deriv or Bybit live feed is configured for "+l+". Twelve Data and synthetic fallback feeds are disabled.",label:l,type:t,mode:mode()};
  }

  async function twelveSearch(){ throw new Error("Twelve Data symbol discovery is disabled. Use the verified asset registry."); }

  function intervals(sec){
    if(sec===60)return "1min"; if(sec===300)return "5min"; if(sec===900)return "15min";
    if(sec===1800)return "30min"; if(sec===3600)return "1h"; if(sec===14400)return "4h";
    if(sec===86400)return "1day"; if(sec===2592000)return "1month"; return null;
  }
  function timeframeName(sec){
    const m={5:"5 Seconds",10:"10 Seconds",15:"15 Seconds",30:"30 Seconds",60:"1 Minute",180:"3 Minutes",300:"5 Minutes",900:"15 Minutes",1800:"30 Minutes",3600:"1 Hour",14400:"4 Hours",86400:"1 Day"};
    return m[sec]||null;
  }

  function normalizeCandles(rows){
    return rows.map(x=>({t:Number(x.time)*1000,o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close),v:Number(x.volume||0)}))
      .filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
  }

  function aggregateMonths(candles,monthCount){
    const merged=new Map();
    for(const c of candles){
      const d=new Date(c.t),monthIndex=d.getUTCFullYear()*12+d.getUTCMonth();
      const groupIndex=Math.floor(monthIndex/monthCount)*monthCount;
      const year=Math.floor(groupIndex/12),month=groupIndex%12;
      const t=Date.UTC(year,month,1),a=merged.get(t);
      if(!a)merged.set(t,{t,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v});
      else{a.h=Math.max(a.h,c.h);a.l=Math.min(a.l,c.l);a.c=c.c;a.v+=c.v}
    }
    return Array.from(merged.values()).sort((a,b)=>a.t-b.t);
  }

  function aggregateSeconds(candles,seconds){
    const width=seconds*1000,merged=new Map();
    for(const c of candles){
      const t=Math.floor(c.t/width)*width,a=merged.get(t);
      if(!a)merged.set(t,{t,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v});
      else{a.h=Math.max(a.h,c.h);a.l=Math.min(a.l,c.l);a.c=c.c;a.v+=c.v}
    }
    return Array.from(merged.values()).sort((a,b)=>a.t-b.t);
  }

  async function touchMarketSubscription(){
    try{
      const selected=resolve();
      if(!selected.available || !["DERIV","BYBIT"].includes(selected.provider)) return false;
      if(selected.provider==="DERIV" && !(await getDerivAppId())) return false;
      const symbol=selected.mode==="OTC" ? selected.label+" OTC" : selected.label;
      const sb=marketSupabaseClient();if(!sb)return false;
      const {data,error}=await sb.rpc("gotradex_touch_market_subscription",{p_symbol:symbol});
      return !error && data===true;
    }catch(_){return false}
  }

  async function bybitHistory(symbol,sec){
    touchMarketSubscription().catch(()=>{});
    const tf=timeframeName(sec);
    if(!tf) return [];
    const requestTf=sec>2592000?"1 Month":tf;
    const d=await serverInvoke({action:"chart",marketMode:"LIVE",assetType:"crypto",symbol,timeframe:requestTf});
    const candles=normalizeCandles(Array.isArray(d.candles)?d.candles:[]);
    if(sec>2592000)return aggregateMonths(candles,sec===7776000?3:sec===15552000?6:12);
    return candles;
  }
  async function twelveHistory(){ return []; }

  async function twelvePrice(){ throw new Error("Twelve Data is disabled. Use verified Deriv or Bybit feeds."); }

  async function twelveSocket(symbol,onTick,onStatus){
    if(typeof onStatus==="function")onStatus("UNAVAILABLE • Twelve Data disabled",false);
    return {close(){}};
  }

  let DERIV_APP_ID_CACHE=String(window.GTX_DERIV_APP_ID||"").trim(),DERIV_APP_ID_PROMISE=null;
  function marketSupabaseClient(){
    if(window.GoTradeXMarketSupabase)return window.GoTradeXMarketSupabase;
    if(!window.supabase||typeof window.supabase.createClient!=="function")return null;
    window.GoTradeXMarketSupabase=window.supabase.createClient("https://glffecggusetzklmyukv.supabase.co","sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5",{auth:{persistSession:true,autoRefreshToken:true}});
    return window.GoTradeXMarketSupabase;
  }
  async function getDerivAppId(){
    if(DERIV_APP_ID_CACHE)return DERIV_APP_ID_CACHE;
    try{const saved=String(localStorage.getItem("gotradex_deriv_app_id")||"").trim();if(saved){DERIV_APP_ID_CACHE=saved;return saved}}catch(_){}
    if(DERIV_APP_ID_PROMISE)return DERIV_APP_ID_PROMISE;
    DERIV_APP_ID_PROMISE=(async()=>{
      try{
        const sb=marketSupabaseClient();if(!sb)return "";
        const {data,error}=await sb.from("gotradex_public_settings").select("value").eq("key","deriv_app_id").maybeSingle();
        if(!error&&data&&data.value){DERIV_APP_ID_CACHE=String(data.value).trim();window.GTX_DERIV_APP_ID=DERIV_APP_ID_CACHE}
        return DERIV_APP_ID_CACHE;
      }catch(_){return ""}
      finally{DERIV_APP_ID_PROMISE=null}
    })();
    return DERIV_APP_ID_PROMISE;
  }
  function derivWsUrl(appId){return "wss://ws.derivws.com/websockets/v3?app_id="+encodeURIComponent(appId);}
  function setDerivAppId(value){DERIV_APP_ID_CACHE=String(value||"").trim();DERIV_APP_ID_PROMISE=null;if(DERIV_APP_ID_CACHE)window.GTX_DERIV_APP_ID=DERIV_APP_ID_CACHE;}

  function derivCandleHistory(symbol,sec){
    touchMarketSubscription().catch(()=>{});
    return getDerivAppId().then(appId=>{
      if(!appId)throw new Error("Deriv App ID is not configured. An administrator must save a registered Deriv app ID in the scanner integration settings.");
      return new Promise((resolve,reject)=>{
      if(!Number.isFinite(sec)||![5,10,15,30,60,120,300,900,1800,3600,14400,86400].includes(sec)) return resolve([]);
      let ws=null,done=false,timer=null;
      const finish=(fn,value)=>{
        if(done)return;done=true;if(timer)clearTimeout(timer);
        try{ws?.close()}catch(_){}
        fn(value);
      };
      try{ws=new WebSocket(derivWsUrl(appId))}catch(e){return reject(e)}
      timer=setTimeout(()=>finish(reject,new Error("Deriv history request timed out.")),10000);
      ws.onopen=()=>{
        ws.send(JSON.stringify(sec<60?{ticks_history:symbol,end:"latest",count:1000,style:"ticks",req_id:1}:{ticks_history:symbol,end:"latest",count:100,granularity:sec,style:"candles",req_id:1}));
      };
      ws.onerror=()=>finish(reject,new Error("Deriv historical candle connection failed."));
      ws.onclose=()=>{if(!done)finish(reject,new Error("Deriv historical candle connection closed."))};
      ws.onmessage=e=>{
        try{
          const d=JSON.parse(e.data);
          if(d.error)return finish(reject,new Error(d.error.message||"Deriv historical candle request failed."));
          if(sec<60&&d.msg_type==="history"&&Array.isArray(d.history?.times)&&Array.isArray(d.history?.prices)){
            const ticks=d.history.times.map((time,i)=>({t:Number(time)*1000,p:Number(d.history.prices[i])}))
              .filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.p)).sort((a,b)=>a.t-b.t);
            const width=sec*1000,buckets=new Map();
            for(const tick of ticks){const t=Math.floor(tick.t/width)*width;let c=buckets.get(t);if(!c)c={t,o:tick.p,h:tick.p,l:tick.p,c:tick.p,v:0};else{c.h=Math.max(c.h,tick.p);c.l=Math.min(c.l,tick.p);c.c=tick.p}buckets.set(t,c)}
            return finish(resolve,Array.from(buckets.values()).sort((a,b)=>a.t-b.t));
          }
          if((d.msg_type==="candles"||d.msg_type==="history")&&Array.isArray(d.candles)){
            const candles=d.candles.map(x=>({t:Number(x.epoch)*1000,o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close),v:0}))
              .filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
            return finish(resolve,candles);
          }
        }catch(_){}
      };
      });
    });
  }

  function derivSocket(symbol,onTick,onStatus){
    let stopped=false,ws=null,subId=null,reconnectTimer=null;
    const connect=async()=>{
      if(stopped)return;
      const appId=await getDerivAppId();
      if(stopped)return;
      if(!appId){onStatus("DERIV APP ID NOT CONFIGURED",false);return}
      try{ws=new WebSocket(derivWsUrl(appId))}catch(e){onStatus("DERIV CONNECTION ERROR",false);return}
      onStatus("CONNECTING • DERIV",false);
      ws.onopen=()=>{
        if(stopped){try{ws.close()}catch(_){};return}
        onStatus("CONNECTED • WAITING FOR DERIV TICK",false);
        ws.send(JSON.stringify({ticks:symbol,subscribe:1,req_id:2}));
      };
      ws.onmessage=e=>{
        if(stopped)return;
        try{
          const d=JSON.parse(e.data);
          if(d.error){
            const detail=String(d.error.message||d.error.code||"Provider rejected the subscription").slice(0,120);
            onStatus("DERIV FEED ERROR: "+detail,false);return;
          }
          if(d.msg_type==="tick"&&d.tick&&d.tick.symbol===symbol){
            if(d.tick.subscription?.id)subId=d.tick.subscription.id;
            const price=Number(d.tick.quote),time=Number(d.tick.epoch)*1000;
            if(Number.isFinite(price)&&Number.isFinite(time)){
              onTick({price,time});
              onStatus("LIVE • DERIV",true);
            }
          }
        }catch(_){}
      };
      ws.onerror=()=>{if(!stopped)onStatus("DERIV FEED ERROR",false)};
      ws.onclose=()=>{
        if(stopped)return;
        onStatus("RECONNECTING • DERIV",false);
        clearTimeout(reconnectTimer);
        reconnectTimer=setTimeout(connect,2500);
      };
    };
    connect();
    return {close(){
      stopped=true;clearTimeout(reconnectTimer);
      try{if(subId&&ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({forget:subId,req_id:99}))}catch(_){}
      try{ws?.close()}catch(_){}
    }};
  }

  window.GoTradeXMarketFeeds={
    config:CFG,key,resolve,getDerivAppId,setDerivAppId,touchMarketSubscription,twelveSearch,twelveHistory,bybitHistory,twelvePrice,twelveSocket,derivCandleHistory,derivSocket,intervals
  };
})();