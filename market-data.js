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
    twelveRest: "https://api.twelvedata.com",
    twelveWs: "wss://ws.twelvedata.com/v1/quotes/price",
    bybitWs: "wss://stream.bybit.com/v5/public/spot",
    bybitRest: "https://api.bybit.com/v5/market/kline"
  };

  const cryptoMap = {
    "BTC/USD":"BTCUSDT","ETH/USD":"ETHUSDT","XRP/USD":"XRPUSDT","SOL/USD":"SOLUSDT",
    "ADA/USD":"ADAUSDT","DOGE/USD":"DOGEUSDT","LTC/USD":"LTCUSDT","BNB/USD":"BNBUSDT",
    "AVAX/USD":"AVAXUSDT","DOT/USD":"DOTUSDT","LINK/USD":"LINKUSDT","TRX/USD":"TRXUSDT",
    "TON/USD":"TONUSDT","ATOM/USD":"ATOMUSDT","UNI/USD":"UNIUSDT","BCH/USD":"BCHUSDT",
    "ETC/USD":"ETCUSDT","XLM/USD":"XLMUSDT","NEAR/USD":"NEARUSDT","APT/USD":"APTUSDT",
    "ARB/USD":"ARBUSDT","OP/USD":"OPUSDT","SUI/USD":"SUIUSDT","FIL/USD":"FILUSDT",
    "ALGO/USD":"ALGOUSDT"
  };

  const directTwelve = {
    "EUR/USD":"EUR/USD","GBP/USD":"GBP/USD","USD/JPY":"USD/JPY","USD/CHF":"USD/CHF",
    "AUD/USD":"AUD/USD","USD/CAD":"USD/CAD","NZD/USD":"NZD/USD","EUR/GBP":"EUR/GBP",
    "EUR/JPY":"EUR/JPY","GBP/JPY":"GBP/JPY","EUR/CHF":"EUR/CHF","AUD/JPY":"AUD/JPY",
    "XAU/USD":"XAU/USD","XAG/USD":"XAG/USD","XAU/EUR":"XAU/EUR","XAG/EUR":"XAG/EUR",
    "WTI Oil":"WTI/USD","Brent Oil":"BRENT/USD","Natural Gas":"NATGAS/USD",
    "Copper":"COPPER/USD","Platinum":"XPT/USD","Palladium":"XPD/USD"
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
    try{return localStorage.getItem("gotradex_asset_display")||"BTC/USDT"}catch(e){return "BTC/USDT"}
  }

  function mode(){
    try{return String(localStorage.getItem("gotradex_market_mode")||"LIVE").toUpperCase()}catch(e){return "LIVE"}
  }

  function resolve(){
    const l=label(), t=type();
    if(mode()!=="LIVE") return {available:false,provider:"NONE",reason:"OTC 24/7 has no verified feed connected.",label:l,type:t};
    if(t==="crypto" && cryptoMap[l]) return {available:true,provider:"BYBIT",symbol:cryptoMap[l],label:l,type:t,short:true};
    if((t==="forex" || t==="metals" || t==="commodities") && directTwelve[l])
      return {available:true,provider:"TWELVE_DATA",symbol:directTwelve[l],label:l,type:t,short:true};
    if(t==="stocks" && /^[A-Z]{1,6}$/.test(l))
      return {available:true,provider:"TWELVE_DATA",symbol:l,label:l,type:t,short:true};
    if(t==="indices")
      return {available:true,provider:"TWELVE_DATA_LOOKUP",symbol:l,label:l,type:t,short:true};
    return {available:false,provider:"NONE",reason:"No verified provider mapping exists for "+l+".",label:l,type:t};
  }

  async function twelveSearch(symbol){ return String(symbol||"").trim().toUpperCase(); }

  function intervals(sec){
    if(sec===60)return "1min"; if(sec===300)return "5min"; if(sec===900)return "15min";
    if(sec===1800)return "30min"; if(sec===3600)return "1h"; if(sec===14400)return "4h";
    if(sec===86400)return "1day"; if(sec===2592000)return "1month"; return null;
  }
  function timeframeName(sec){
    const m={60:"1 Minute",300:"5 Minutes",900:"15 Minutes",1800:"30 Minutes",3600:"1 Hour",14400:"4 Hours",86400:"1 Day",2592000:"1 Month"};
    return m[sec]||null;
  }

  async function twelveHistory(symbol,sec){
    const tf=timeframeName(sec);
    if(!tf) return [];
    const d=await serverInvoke({action:"chart",marketMode:"LIVE",assetType:type(),symbol,timeframe:tf});
    const candles=Array.isArray(d.candles)?d.candles:[];
    return candles.map(x=>({t:Number(x.time)*1000,o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close),v:Number(x.volume||0)})).filter(x=>Number.isFinite(x.c));
  }

  async function twelvePrice(symbol){
    const d=await serverInvoke({action:"price",marketMode:"LIVE",assetType:type(),symbol});
    if(!Number.isFinite(Number(d.price))) throw new Error("No verified live price was returned.");
    return {price:Number(d.price),time:Number(d.timestamp)||Date.now()};
  }

  async function twelveSocket(symbol,onTick,onStatus){
    let stopped=false;
    const poll=async()=>{
      if(stopped)return;
      try{const p=await twelvePrice(symbol);onTick(p);onStatus("LIVE • TWELVE DATA",true)}
      catch(e){onStatus("NO VERIFIED LIVE FEED",false)}
    };
    await poll();
    const timer=setInterval(poll,5000);
    return {close(){stopped=true;clearInterval(timer)}};
  }

  window.GoTradeXMarketFeeds={
    config:CFG,key,resolve,twelveSearch,twelveHistory,twelvePrice,twelveSocket,intervals
  };
})();