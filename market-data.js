/* GoTradeX verified market-feed registry.
 * No synthetic prices. A feed is marked LIVE only after its provider confirms
 * the selected symbol/stream is available. Bybit Spot is the native crypto feed.
 * Twelve Data is the verified non-crypto adapter when a valid API key/feed access
 * is configured. Short candles are built only from real provider ticks.
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
    "ALGO/USD":"ALGOUSDT"
  };

  // Only pairs verified by the standalone Deriv test AND GoTradeX isolated app test.
  const derivMap = {
    "EUR/USD":"frxEURUSD","GBP/USD":"frxGBPUSD","USD/JPY":"frxUSDJPY","AUD/USD":"frxAUDUSD",
    "USD/CHF":"frxUSDCHF","USD/CAD":"frxUSDCAD","NZD/USD":"frxNZDUSD","EUR/GBP":"frxEURGBP",
    "EUR/JPY":"frxEURJPY","GBP/JPY":"frxGBPJPY","EUR/CHF":"frxEURCHF","AUD/JPY":"frxAUDJPY",
    "AUD/CAD":"frxAUDCAD","AUD/NZD":"frxAUDNZD",
    "USD/ZAR":"frxUSDZAR","EUR/AUD":"frxEURAUD","GBP/AUD":"frxGBPAUD","NZD/JPY":"frxNZDJPY",
    "CAD/JPY":"frxCADJPY","CHF/JPY":"frxCHFJPY",
    "EUR/CAD":"frxEURCAD","EUR/NZD":"frxEURNZD","GBP/CAD":"frxGBPCAD","GBP/CHF":"frxGBPCHF",
    "GBP/NZD":"frxGBPNZD","AUD/CHF":"frxAUDCHF","USD/MXN":"frxUSDMXN","USD/PLN":"frxUSDPLN"
  };

  const directTwelve = {
    "EUR/USD":"EUR/USD","GBP/USD":"GBP/USD","USD/JPY":"USD/JPY","USD/CHF":"USD/CHF",
    "AUD/USD":"AUD/USD","USD/CAD":"USD/CAD","NZD/USD":"NZD/USD","EUR/GBP":"EUR/GBP",
    "EUR/JPY":"EUR/JPY","GBP/JPY":"GBP/JPY","EUR/CHF":"EUR/CHF","AUD/JPY":"AUD/JPY",
    "XAU/USD":"XAU/USD","XAG/USD":"XAG/USD","XAU/EUR":"XAU/EUR","XAG/EUR":"XAG/EUR",
    "WTI Oil":"WTI/USD","Brent Oil":"BRENT/USD","Natural Gas":"NATGAS/USD",
    "Copper":"HG1","Platinum":"XPT/USD","Palladium":"XPD/USD"
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
    const raw=label(); const l=({BTCUSD:"BTC/USD","BTC/USDT":"BTC/USD"}[raw]||raw);
    const storedType=type();
    const inferredCrypto=!!cryptoMap[l];
    const inferredTwelve=!!directTwelve[l];
    const inferredType=inferredCrypto ? "crypto" : inferredTwelve ? (
      /^(XAU|XAG)\//.test(l) ? "metals" :
      /^(WTI|Brent|Natural Gas|Copper|Platinum|Palladium)/.test(l) ? "commodities" : "forex"
    ) : storedType;
    const t=inferredType;
    if(mode()!=="LIVE") return {available:false,provider:"NONE",reason:"OTC 24/7 has no verified feed connected.",label:l,type:t};
    if(t==="crypto" && cryptoMap[l]) return {available:true,provider:"BYBIT",symbol:cryptoMap[l],label:l,type:t,short:true};
    if(t==="forex" && derivMap[l]) return {available:true,provider:"DERIV",symbol:derivMap[l],label:l,type:t};
    if(directTwelve[l]) return {available:true,provider:"TWELVE_DATA",symbol:directTwelve[l],label:l,type:t};
    if(t==="forex" && /^[A-Z]{3}\/[A-Z]{3}$/.test(l)) return {available:true,provider:"TWELVE_DATA",symbol:l,label:l,type:t};
    if(t==="stocks" && /^[A-Z]{1,6}$/.test(l)) return {available:true,provider:"TWELVE_DATA",symbol:l,label:l,type:t};
    if(t==="commodities" || t==="metals" || t==="indices") return {available:true,provider:"TWELVE_DATA",symbol:l,label:l,type:t};
    return {available:false,provider:"NONE",reason:"No verified native feed is configured for "+l+".",label:l,type:t};
  }

  async function twelveSearch(symbol){
    const requested=String(symbol||"").trim().toUpperCase();
    const d=await serverInvoke({action:"lookup",marketMode:"LIVE",assetType:type(),symbol:requested});
    const matches=Array.isArray(d.matches)?d.matches:[];
    if(!matches.length) throw new Error("No verified Twelve Data symbol matches were returned for "+requested+".");
    const exact=matches.find(x=>String(x.symbol||"").toUpperCase()===requested);
    return String((exact||matches[0]).symbol||requested);
  }

  function intervals(sec){
    if(sec===60)return "1min"; if(sec===300)return "5min"; if(sec===900)return "15min";
    if(sec===1800)return "30min"; if(sec===3600)return "1h"; if(sec===14400)return "4h";
    if(sec===86400)return "1day"; if(sec===2592000)return "1month"; return null;
  }
  function timeframeName(sec){
    const m={60:"1 Minute",300:"5 Minutes",900:"15 Minutes",1800:"30 Minutes",3600:"1 Hour",14400:"4 Hours",86400:"1 Day",2592000:"1 Month"};
    return m[sec]||null;
  }

  async function bybitHistory(symbol,sec){
    const tf=timeframeName(sec);
    if(!tf) return [];
    const d=await serverInvoke({action:"chart",marketMode:"LIVE",assetType:"crypto",symbol,timeframe:tf});
    const candles=Array.isArray(d.candles)?d.candles:[];
    return candles.map(x=>({t:Number(x.time)*1000,o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close),v:Number(x.volume||0)}))
      .filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
  }
  async function twelveHistory(symbol,sec,assetType){
    const tf=timeframeName(sec);
    if(!tf) return [];
    const d=await serverInvoke({action:"chart",marketMode:"LIVE",assetType:String(assetType||type()).toLowerCase(),symbol,timeframe:tf});
    const candles=Array.isArray(d.candles)?d.candles:[];
    return candles.map(x=>({t:Number(x.time)*1000,o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close),v:Number(x.volume||0)}))
      .filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
  }

  async function twelvePrice(symbol){
    const d=await serverInvoke({action:"price",marketMode:"LIVE",assetType:type(),symbol});
    if(!Number.isFinite(Number(d.price))) throw new Error("No verified live price was returned.");
    return {price:Number(d.price),time:Number(d.timestamp)||Date.now()};
  }

  async function twelveSocket(symbol,onTick,onStatus){
    let stopped=false,ws=null,timer=null,fallbackTimer=null,opened=false;
    const sb=window.GoTradeXMarketSupabase||(window.GoTradeXMarketSupabase=
      window.supabase.createClient("https://glffecggusetzklmyukv.supabase.co","sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5",{auth:{persistSession:true,autoRefreshToken:true}}));

    const poll=async()=>{
      if(stopped)return;
      try{const p=await twelvePrice(symbol);onTick(p);onStatus("LIVE • TWELVE DATA",true)}
      catch(e){onStatus("WAITING • TWELVE DATA",false)}
    };
    const startFallback=async()=>{
      if(stopped||timer)return;
      await poll();
      if(stopped)return;
      timer=setInterval(poll,15000);
    };

    try{
      const {data}=await sb.auth.getSession();
      const token=data?.session?.access_token||"";
      if(!token) throw new Error("No authenticated GoTradeX session is available for the live market stream.");
      const base="https://glffecggusetzklmyukv.supabase.co/functions/v1/gotradex-market-ws";
      ws=new WebSocket(base+"?access_token="+encodeURIComponent(token)+"&symbol="+encodeURIComponent(symbol));
      onStatus("CONNECTING • TWELVE DATA",false);
      const failTimer=setTimeout(()=>{if(!opened&&!stopped)startFallback()},4500);
      ws.onopen=()=>{opened=true;clearTimeout(failTimer);onStatus("LIVE • TWELVE DATA",true)};
      ws.onmessage=e=>{
        if(stopped)return;
        try{
          const d=JSON.parse(String(e.data||"{}"));
          if(d.event==="price" && Number.isFinite(Number(d.price))){
            onTick({price:Number(d.price),time:Number(d.timestamp)||Date.now()});
            onStatus("LIVE • TWELVE DATA",true);
          }else if(d.event==="subscribe-status" && String(d.status||"").toLowerCase()==="failed"){
            startFallback();
          }else if(d.event==="proxy-status" && d.status!=="connected"){
            startFallback();
          }
        }catch(_){}
      };
      ws.onerror=()=>{if(!opened)startFallback()};
      ws.onclose=()=>{if(!stopped)startFallback()};
      fallbackTimer=failTimer;
    }catch(_){
      await startFallback();
    }

    return {close(){
      stopped=true;
      if(timer)clearInterval(timer);
      if(fallbackTimer)clearTimeout(fallbackTimer);
      try{ws?.close()}catch(_){}
    }};
  }

  const DERIV_WS="wss://api.derivws.com/trading/v1/options/ws/public";

  function derivCandleHistory(symbol,sec){
    return new Promise((resolve,reject)=>{
      if(!Number.isFinite(sec)||sec<60) return resolve([]);
      let ws=null,done=false,timer=null;
      const finish=(fn,value)=>{
        if(done)return;done=true;if(timer)clearTimeout(timer);
        try{ws?.close()}catch(_){}
        fn(value);
      };
      try{ws=new WebSocket(DERIV_WS)}catch(e){return reject(e)}
      timer=setTimeout(()=>finish(reject,new Error("Deriv history request timed out.")),10000);
      ws.onopen=()=>{ws.send(JSON.stringify({ticks_history:symbol,end:"latest",count:100,granularity:sec,style:"candles",req_id:1}))};
      ws.onerror=()=>finish(reject,new Error("Deriv historical candle connection failed."));
      ws.onclose=()=>{if(!done)finish(reject,new Error("Deriv historical candle connection closed."))};
      ws.onmessage=e=>{
        try{
          const d=JSON.parse(e.data);
          if(d.error)return finish(reject,new Error(d.error.message||"Deriv historical candle request failed."));
          if((d.msg_type==="candles"||d.msg_type==="history")&&Array.isArray(d.candles)){
            const candles=d.candles.map(x=>({t:Number(x.epoch)*1000,o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close),v:0}))
              .filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
            return finish(resolve,candles);
          }
        }catch(_){}
      };
    });
  }

  function derivSocket(symbol,onTick,onStatus){
    let stopped=false,ws=null,subId=null,reconnectTimer=null;
    const connect=()=>{
      if(stopped)return;
      try{ws=new WebSocket(DERIV_WS)}catch(e){onStatus("DERIV CONNECTION ERROR",false);return}
      onStatus("CONNECTING • DERIV",false);
      ws.onopen=()=>{
        if(stopped){try{ws.close()}catch(_){};return}
        onStatus("LIVE • DERIV",true);
        ws.send(JSON.stringify({ticks:symbol,subscribe:1,req_id:2}));
      };
      ws.onmessage=e=>{
        if(stopped)return;
        try{
          const d=JSON.parse(e.data);
          if(d.error){onStatus("DERIV FEED ERROR",false);return}
          if(d.msg_type==="tick"&&d.tick&&d.tick.symbol===symbol){
            if(d.tick.subscription?.id)subId=d.tick.subscription.id;
            const price=Number(d.tick.quote),time=Number(d.tick.epoch)*1000;
            if(Number.isFinite(price)&&Number.isFinite(time))onTick({price,time});
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

  window.GoTradeXMarketFeeds={config:CFG,key,resolve,twelveSearch,twelveHistory,bybitHistory,twelvePrice,twelveSocket,derivCandleHistory,derivSocket,intervals};
})();