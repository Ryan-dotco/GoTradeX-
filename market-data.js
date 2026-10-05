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

  function key(){
    try{
      return window.GTXMarketDataConfig?.twelveDataApiKey ||
        localStorage.getItem("gotradex_twelvedata_api_key") || "";
    }catch(e){ return ""; }
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

  async function twelveSearch(symbol){
    const k=key();
    if(!k) throw new Error("Twelve Data API key is not configured.");
    const u=CFG.twelveRest+"/symbol_search?symbol="+encodeURIComponent(symbol)+"&apikey="+encodeURIComponent(k);
    const r=await fetch(u,{cache:"no-store"}), j=await r.json();
    if(j.status==="error") throw new Error(j.message||"Twelve Data symbol lookup failed.");
    const rows=Array.isArray(j.data)?j.data:(Array.isArray(j)?j:[]);
    const exact=rows.find(x=>String(x.symbol||"").toUpperCase()===String(symbol).toUpperCase());
    const first=exact||rows[0];
    if(!first) throw new Error("Provider did not return a verified symbol for "+symbol+".");
    return String(first.symbol||"");
  }

  function intervals(sec){
    if(sec<60) return null;
    if(sec===60) return "1min";
    if(sec===120) return "2min";
    if(sec===300) return "5min";
    if(sec===900) return "15min";
    if(sec===1800) return "30min";
    if(sec===3600) return "1h";
    if(sec===14400) return "4h";
    if(sec===86400) return "1day";
    if(sec===2592000) return "1month";
    if(sec===7776000) return "3month";
    if(sec===15552000) return "6month";
    if(sec===31536000) return "1year";
    return null;
  }

  async function twelveHistory(symbol,sec){
    const k=key();
    if(!k) throw new Error("Twelve Data API key is not configured.");
    const iv=intervals(sec);
    if(!iv) throw new Error("This provider does not supply a verified "+sec+"-second candle interval.");
    const u=CFG.twelveRest+"/time_series?symbol="+encodeURIComponent(symbol)+"&interval="+iv+"&outputsize=200&apikey="+encodeURIComponent(k);
    const r=await fetch(u,{cache:"no-store"}), j=await r.json();
    if(j.status==="error" || !Array.isArray(j.values))
      throw new Error(j.message||"No verified historical data was returned.");
    return j.values.slice().reverse().map(x=>({
      t:new Date(x.datetime).getTime(),o:Number(x.open),h:Number(x.high),
      l:Number(x.low),c:Number(x.close),v:Number(x.volume||0)
    })).filter(x=>Number.isFinite(x.c));
  }

  async function twelvePrice(symbol){
    const k=key();
    if(!k) throw new Error("Twelve Data API key is not configured.");
    const u=CFG.twelveRest+"/price?symbol="+encodeURIComponent(symbol)+"&apikey="+encodeURIComponent(k);
    const r=await fetch(u,{cache:"no-store"}), j=await r.json();
    if(j.status==="error" || !Number.isFinite(Number(j.price)))
      throw new Error(j.message||"No verified live price was returned.");
    return {price:Number(j.price),time:Date.now()};
  }

  async function twelveSocket(symbol,onTick,onStatus){
    const k=key();
    if(!k) throw new Error("Twelve Data API key is not configured.");
    const ws=new WebSocket(CFG.twelveWs+"?apikey="+encodeURIComponent(k));
    ws.onopen=()=>{
      onStatus("SUBSCRIBING");
      ws.send(JSON.stringify({action:"subscribe",params:{symbols:symbol}}));
    };
    ws.onmessage=e=>{
      try{
        const j=JSON.parse(e.data);
        if(j.event==="subscribe-status"){
          const ok=String(j.status||"").toLowerCase()==="ok";
          onStatus(ok?"LIVE TICK STREAM":"SUBSCRIPTION REJECTED",ok);
          if(!ok) onStatus("NO VERIFIED LIVE FEED",false);
        }
        if(j.event==="price" && Number.isFinite(Number(j.price)))
          onTick({price:Number(j.price),time:Number(j.timestamp)*1000||Date.now()});
      }catch(_){}
    };
    ws.onerror=()=>onStatus("FEED ERROR",false);
    ws.onclose=()=>onStatus("DISCONNECTED",false);
    return ws;
  }

  window.GoTradeXMarketFeeds={
    config:CFG,key,resolve,twelveSearch,twelveHistory,twelvePrice,twelveSocket,intervals
  };
})();