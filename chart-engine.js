/* GoTradeX Candlestick Engine V7
   LIVE MARKET CHART — Bybit only
   Keeps existing GoTradeX controls through GoTradeXChartEngine.
*/
(()=>{"use strict";

const TF={"5 Seconds":5,"15 Seconds":15,"30 Seconds":30,"1 Minute":60,"5 Minutes":300,"15 Minutes":900,"30 Minutes":1800,"1 Hour":3600,"4 Hours":14400,"12 Hours":43200,"1 Day":86400,"1 Week":604800,"1 Month":2592000,"6 Months":15552000,"1 Year":31536000};
const API={"1 Minute":"1","5 Minutes":"5","15 Minutes":"15","30 Minutes":"30","1 Hour":"60","4 Hours":"240","12 Hours":"720","1 Day":"D","1 Week":"W","1 Month":"M"};
const store={get(k,d){try{return localStorage.getItem(k)||d}catch(_){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(_){}}};
const BYBIT_WS_LINEAR="wss://stream.bybit.com/v5/public/linear";
const BYBIT_WS_SPOT="wss://stream.bybit.com/v5/public/spot";
const INDS=["Alligator","Fractals","EMA / SMA","Bollinger Bands","Parabolic SAR","Supertrend","Ichimoku Cloud","RSI","MACD","Stochastic","ATR","Support & Resistance","Horizontal Line"];
const $=id=>document.getElementById(id);

let chart=null,series=null,priceLine=null,tradeLine=null,resizeObserver=null;
let assetRequestId=0,socketGeneration=0;
let candles=[],symbol=String(store.get("gotradex_chart_symbol","BTCUSDT")).toUpperCase().replace(/[^A-Z0-9_]/g,""),assetType=String(store.get("gotradex_asset_type","crypto")).toLowerCase(),assetDisplay=String(store.get("gotradex_asset_display","")).trim(),tf=store.get("gotradex_chart_timeframe","1 Minute"),marketMode=String(store.get("gotradex_market_mode","LIVE")).toUpperCase()==="OTC"?"OTC":"LIVE";
let active=new Set(),started=false,ws=null,tdWs=null,reconnectTimer=null,poll=null,indicatorSeries=[],liveBroker="BYBIT";
let candleMode=["candles","heikin","bars","line","area"].includes(String(store.get("gotradex_candle_mode","candles")))?String(store.get("gotradex_candle_mode","candles")):"candles";
let lastLiveUpdateAt=0,liveFreshTimer=null;
let resolvedMarket=null,resolvedKey="";
liveBroker="BYBIT";
let trade=null,completedTrade=null,tradeOverlay=null,signalExpiryAt=0,expiryTimer=null;

function root(){return document.querySelector(".chart")}
function normalizedSymbol(){return String(symbol||"BTCUSDT").toUpperCase().replace(/[^A-Z0-9_]/g,"")}
function pairSymbol(){
 const s=normalizedSymbol();
 if(s.endsWith("USDT"))return s;
 if(s.endsWith("USD"))return s.slice(0,-3)+"USDT";
 return s+"USDT";
}
function inferAssetType(display,s){
 const d=String(display||"").trim().toUpperCase();
 const crypto=["BTC/USD","ETH/USD","XRP/USD","SOL/USD","ADA/USD","DOGE/USD","LTC/USD","BNB/USD","AVAX/USD","DOT/USD","LINK/USD","TRX/USD"];
 const commodities=["XAU/USD","XAG/USD","WTI OIL","BRENT OIL","NATURAL GAS","COPPER","PLATINUM","PALLADIUM"];
 const indices=["US30","US500","NAS100","UK100","GER40","FRA40","JPN225","AUS200","HK50","EU50","SA40"];
 const stocks=["AAPL","MSFT","NVDA","AMZN","TSLA","GOOGL","META","NFLX","AMD","AVGO","JPM","V"];
 if(crypto.includes(d))return "crypto";
 if(commodities.includes(d))return "commodities";
 if(indices.includes(d))return "indices";
 if(stocks.includes(d))return "stocks";
 if(/^[A-Z]{3}\/([A-Z]{3})$/.test(d))return "forex";
 const raw=String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
 if(["BTCUSD","ETHUSD","XRPUSD","SOLUSD","ADAUSD","DOGEUSD","LTCUSD","BNBUSD","AVAXUSD","DOTUSD","LINKUSD","TRXUSD"].includes(raw))return "crypto";
 if(/^[A-Z]{6}$/.test(raw))return "forex";
 return String(assetType||"crypto").toLowerCase();
}
function pairLabel(){
 if(assetDisplay)return assetDisplay;
 const s=normalizedSymbol();
 if(s.endsWith("USDT"))return s.slice(0,-4)+"/USDT";
 if(s.endsWith("USD"))return s.slice(0,-3)+"/USD";
 return s;
}
function isOtcMode(){return marketMode==="OTC"}
function usesExternalMarket(){
 return !isOtcMode() && (["forex","stocks","indices","commodities"].includes(assetType) || (assetType==="crypto" && /USD$/.test(normalizedSymbol()) && !/USDT$/.test(normalizedSymbol())));
}
async function resolveBybitSymbol(){
 const wanted=normalizedSymbol().replace(/[^A-Z0-9]/g,"").toUpperCase();
 let base=wanted,quote="USD";
 if(wanted.endsWith("USDT")){base=wanted.slice(0,-4);quote="USDT"}
 else if(wanted.endsWith("USD")){base=wanted.slice(0,-3);quote="USD"}
 const candidates=quote==="USD"?[base+"USDT",base+"USD"]:[wanted];
 for(const category of ["spot","linear"]){
  for(const sym of candidates){
   try{
    const u="https://api.bybit.com/v5/market/instruments-info?category="+category+"&symbol="+encodeURIComponent(sym);
    const r=await fetch(u,{cache:"no-store"});const d=await r.json();
    if(r.ok&&Number(d?.retCode)===0&&Array.isArray(d?.result?.list)&&d.result.list.some(x=>String(x.symbol).toUpperCase()===sym&&String(x.status||"Trading")==="Trading"))
      return {symbol:sym,category};
   }catch(_){}
  }
 }
 throw Error("Bybit market not available for "+pairLabel());
}
async function resolveMarket(force=false){
 if(isOtcMode())return {broker:"OTC_UNCONFIGURED",symbol:normalizedSymbol(),assetType};
 const key=(usesExternalMarket()?"TD:":"BYBIT:")+assetType+":"+normalizedSymbol();
 if(!force&&resolvedMarket&&resolvedKey===key)return resolvedMarket;
 if(usesExternalMarket()){
  resolvedMarket={broker:"TWELVE_DATA",symbol:normalizedSymbol(),assetType};
 }else{
  resolvedMarket={broker:"BYBIT",...await resolveBybitSymbol()};
 }
 resolvedKey=key;
 return resolvedMarket;
}
function normalizedExternalSymbol(){
 const raw=normalizedSymbol();
 const d=String(assetDisplay||"").trim().toUpperCase();
 if(assetType==="commodities"){
  const map={"XAUUSD":"XAU/USD","XAGUSD":"XAG/USD","WTIOIL":"WTI","BRENTOIL":"XBR","NATURALGAS":"NG","COPPER":"XG","PLATINUM":"XPT","PALLADIUM":"XPD"};
  return map[raw]||d;
 }
 if(assetType==="forex"&&/^[A-Z]{6}$/.test(raw))return raw.slice(0,3)+"/"+raw.slice(3);
 if(assetType==="indices"){
  const map={US30:"DJI",US500:"SPX",NAS100:"NDX",UK100:"FTSE",GER40:"DAX",FRA40:"CAC",JPN225:"N225",AUS200:"ASX",HK50:"HSI",EU50:"STOXX50E",SA40:"JTOPI"};
  return map[raw]||raw;
 }
 if(assetType==="stocks")return d||raw;
 return d||raw;
}
function displayBroker(){return isOtcMode()?"OTC Provider":usesExternalMarket()?"Twelve Data":"Bybit"}
function fmt(v){v=Number(v);if(!Number.isFinite(v))return"—";return v>=1000?v.toFixed(2):v>=10?v.toFixed(4):v>=1?v.toFixed(5):v.toFixed(6)}

function injectCss(){
 if($("gtx-kengly-v6-css"))return;
 const s=document.createElement("style");s.id="gtx-kengly-v6-css";
 s.textContent=`
.gtxKengly{position:relative!important;display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;min-height:180px!important;overflow:hidden!important;background:#071827!important;color:#dbe9f7!important}
.gtxKenglyHeader{flex:0 0 auto!important;display:flex!important;align-items:center!important;gap:7px!important;width:100%!important;box-sizing:border-box!important;padding:3px 7px!important;background:#071827!important;z-index:20!important;white-space:nowrap!important;overflow:hidden!important}
.gtxKenglyBadge{font:800 9px/16px sans-serif!important;padding:0 6px!important;border-radius:9px!important;background:#10304a!important;color:#9fc8e8!important}
.gtxKenglyBadge.live{background:#123c2b!important;color:#5ee39a!important}.gtxKenglyBadge.otc{background:#2a1644!important;color:#c9a0ff!important}
.gtxKenglyPair{font:900 11px/16px sans-serif!important;color:#fff!important}
.gtxKenglyTf{font:700 9px/16px sans-serif!important;color:#9db4cc!important}
.gtxKenglySource{margin-left:auto!important;font:800 8px/16px sans-serif!important;color:#5ee39a!important}
.gtxKenglySource.stale{color:#ff9aaa!important}.gtxCandleMode{margin-left:4px!important;border:1px solid #2b527d!important;border-radius:7px!important;background:#0b2033!important;color:#dbe9f7!important;font:800 8px/15px sans-serif!important;padding:0 6px!important;white-space:nowrap!important}
.gtxKenglyStage{position:relative!important;flex:1 1 0!important;height:auto!important;min-height:220px!important;width:100%!important;overflow:hidden!important}
@media(max-width:600px){.gtxKenglyStage{min-height:220px!important}.gtxKengly{min-height:220px!important}}
.gtxKenglyHost{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}
.gtxKenglyHost canvas{touch-action:none!important}
.gtxKenglyOverlay{position:absolute!important;inset:0!important;pointer-events:none!important;z-index:12!important;overflow:hidden!important}
.gtxTradeFlag{position:absolute!important;transform:translate(-50%,-100%)!important;padding:3px 6px!important;border-radius:4px!important;background:#0d2438!important;border:1px solid #3d7198!important;color:#fff!important;font:900 8px/11px sans-serif!important;box-shadow:0 2px 8px #0008!important;animation:gtxFlagPulse 1s ease-in-out infinite!important;white-space:nowrap!important;z-index:3!important}.gtxTradeVertical{position:absolute!important;top:0!important;bottom:0!important;width:2px!important;transform:translateX(-1px)!important;background:repeating-linear-gradient(to bottom,currentColor 0 7px,transparent 7px 12px)!important;opacity:.9!important;z-index:1!important}.gtxTradePoint{position:absolute!important;width:9px!important;height:9px!important;border-radius:50%!important;transform:translate(-50%,-50%)!important;background:#071827!important;border:2px solid currentColor!important;box-shadow:0 0 8px currentColor!important;z-index:4!important}
.gtxTradeFlag.buy{border-color:#36c275!important;color:#72efaa!important}
.gtxTradeFlag.sell{border-color:#e05b70!important;color:#ff9aaa!important}
.gtxTradeFlag.end{animation:none!important;opacity:.95!important}.gtxTradeResult{position:absolute!important;transform:translateX(-50%)!important;padding:2px 5px!important;border-radius:4px!important;background:#071827!important;border:1px solid #3d7198!important;color:#dbe9f7!important;font:900 7px/10px sans-serif!important;white-space:nowrap!important;z-index:5!important}.gtxTradeResult.buy{border-color:#36c275!important;color:#72efaa!important}.gtxTradeResult.sell{border-color:#e05b70!important;color:#ff9aaa!important}
.gtxTradeFlag:after{content:""!important;position:absolute!important;left:50%!important;bottom:-4px!important;transform:translateX(-50%) rotate(45deg)!important;width:7px!important;height:7px!important;background:#0d2438!important;border-right:1px solid #3d7198!important;border-bottom:1px solid #3d7198!important}
.gtxTradeFlag.buy:after{border-color:#36c275!important}.gtxTradeFlag.sell:after{border-color:#e05b70!important}
@keyframes gtxFlagPulse{0%,100%{transform:translate(-50%,-100%) scale(1)}50%{transform:translate(-50%,-100%) scale(1.08)}}
.gtxKenglyError{height:100%;display:grid;place-items:center;text-align:center;padding:20px;box-sizing:border-box;color:#aac1d8;font:800 11px/17px sans-serif}
@media(max-width:600px){.gtxKenglyHeader{gap:5px;padding:2px 5px}.gtxKenglySource{font-size:7px}.gtxKenglyStage{min-height:145px}}
`;
 document.head.appendChild(s);
}

function rebuildDom(){
 const r=root();if(!r)return false;
 const pairEl=$("pairName");
 if(pairEl)pairEl.textContent=pairLabel();
 r.className="chart gtxKengly";
 r.innerHTML=`<div class="gtxKenglyHeader">
 <span class="gtxKenglyBadge ${marketMode==="OTC"?"otc":"live"}">${marketMode==="OTC"?"● OTC 24/7":"● LIVE"}</span><strong class="gtxKenglyPair" id="gtxKenglyPair">${pairLabel()}</strong>
<span class="gtxKenglySource" id="gtxKenglySource">Connecting to live feed…</span><button class="gtxCandleMode" id="gtxCandleMode" type="button">CANDLES</button>
 </div><div class="gtxKenglyStage"><div class="gtxKenglyHost" id="gtxKenglyHost"></div><div class="gtxKenglyOverlay" id="gtxKenglyOverlay"></div><div class="gtxKenglyError" id="gtxKenglyError" hidden></div></div>`;
 return true;
}

function normalize(rows){return(Array.isArray(rows)?rows:[]).map(k=>({time:Math.floor(Number(k[0])/1000),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]||0)})).filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time)}
function dedupe(rows){const m=new Map();rows.forEach(x=>m.set(x.time,x));return[...m.values()].sort((a,b)=>a.time-b.time)}
async function fetchBybitCandles(){
 const iv=API[tf]||"1";
 const market=await resolveMarket();
 const res=await fetch("https://api.bybit.com/v5/market/kline?category="+encodeURIComponent(market.category)+"&symbol="+encodeURIComponent(market.symbol)+"&interval="+iv+"&limit=500",{cache:"no-store"});
 const data=await res.json();
 if(!res.ok||Number(data?.retCode)!==0)throw Error(data?.retMsg||"Bybit market feed unavailable");
 const rows=normalize(data?.result?.list?.slice().reverse());
 if(!rows.length)throw Error("No Bybit candles received");
 return rows;
}
async function fetchTwelveDataCandles(){
 const auth=window.GTXBybitAuth;
 if(!auth||typeof auth.ensureClient!=="function")throw Error("Secure GoTradeX session is not ready.");
 const client=auth.ensureClient();
 const subMinute=["5 Seconds","15 Seconds","30 Seconds"].includes(tf);
 const requestedTimeframe=subMinute?"1 Minute":tf;
 const {data,error}=await client.functions.invoke("gotradex-market-data",{
  body:{action:"chart",symbol:normalizedExternalSymbol(),assetType,timeframe:requestedTimeframe,marketMode}
 });
 if(error)throw Error(error.message||"Forex/stock market-data request failed.");
 if(!data?.ok)throw Error(data?.error||"Forex/stock market-data feed unavailable.");
 const rows=Array.isArray(data.candles)?data.candles:[];
 if(!rows.length)throw Error("No candles received for "+pairLabel()+".");
 const normalized=rows.map(x=>({time:Number(x.time),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume||0)}))
  .filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite));
 return normalized;
}
function localOtcNoise(key,t){
 const s=String(key)+"|"+Math.floor(Number(t)/5),h=[...s].reduce((a,ch)=>((a*33+ch.charCodeAt(0))>>>0),2166136261)>>>0;
 return (h/4294967296)*2-1;
}
function otcHash(key,t){
 const s=String(key)+"|"+Math.floor(Number(t)/5),h=[...s].reduce((a,ch)=>((a*1664525+ch.charCodeAt(0)+1013904223)>>>0),2166136261)>>>0;
 return h/4294967296;
}
function otcGaussian(key,t){
 const a=Math.max(0.000001,otcHash(key+"|a",t)),b=Math.max(0.000001,otcHash(key+"|b",t));
 return Math.sqrt(-2*Math.log(a))*Math.cos(Math.PI*2*b);
}
function otcRegime(t){
 const q=Math.floor(Number(t)/900);
 const x=Math.sin(q*.41)+Math.sin(q*.13)*.65+Math.sin(q*.071)*.35;
 return x>.95?1:x<-.95?-1:0;
}
// GoTradeX OTC is a deterministic synthetic market, not random noise.
// The path is built from persistent regimes + correlated returns so each
// candle opens from the previous candle's close and develops naturally.
function otcReturn(key,bucket,step){
 const regime=otcRegime(bucket);
 const z1=otcGaussian(key+"|ret",bucket);
 const z2=otcGaussian(key+"|ret2",bucket-step);
 const persistence=z2*.22;
 const wave=Math.sin(bucket/997)*.00018+Math.sin(bucket/2417)*.00012;
 const volatility=.00022+Math.abs(otcGaussian(key+"|vol",Math.floor(bucket/step)*step))*.00065;
 const shock=Math.abs(z1)>2.25?Math.sign(z1)*volatility*.9:0;
 return Math.max(-.012,Math.min(.012,regime*.00028+(z1*.72+persistence)*volatility+wave+shock));
}
function otcPathPrice(t){
 const step=60;
 const bucket=Math.floor(Number(t)/step)*step;
 const key=normalizedSymbol()+"|"+pairLabel();
 const base=Math.max(assetLocalUnit(),basePriceForLocalOtc());
 const anchor=Math.floor(bucket/(step*60))*step*60;
 let price=base;
 // Deterministic cumulative walk from a stable anchor. This prevents
 // candles from snapping independently around the base price.
 for(let b=anchor+step;b<=bucket;b+=step){
  price=Math.max(assetLocalUnit(),price*(1+otcReturn(key,b,step)));
 }
 return price;
}
function localOtcPrice(t){
 return otcPathPrice(t);
}
function localOtcCandle(bucket,step){
 const k=normalizedSymbol()+"|"+pairLabel();
 const safeStep=Math.max(1,Number(step)||60);
 const open=otcPathPrice(bucket-safeStep);
 const close=Math.max(assetLocalUnit(),open*(1+otcReturn(k,bucket,safeStep)));
 const micro1=otcGaussian(k+"|micro1",bucket);
 const micro2=otcGaussian(k+"|micro2",bucket-safeStep);
 const body=Math.abs(close-open);
 // Wicks are derived from the candle's own movement. No arbitrary
 // synthetic spikes are injected.
 const range=Math.max(body*1.15,Math.abs(open)*(.00018+Math.abs(micro1)*.00042));
 const upper=range*(.28+Math.min(1.2,Math.abs(micro2))*.22);
 const lower=range*(.28+Math.min(1.2,Math.abs(otcGaussian(k+"|micro3",bucket)))*.22);
 const high=Math.max(open,close)+upper;
 const low=Math.max(assetLocalUnit(),Math.min(open,close)-lower);
 const volume=Math.round(500+Math.abs(close-open)/Math.max(assetLocalUnit(),open)*100000+otcHash(k+"|volume",bucket)*1800);
 return {time:bucket,open,high,low,close,volume};
}
function shapeOtcCandle(candle,previousClose){
 return candle;
}
function seedOtcCandles(){
 const step=Math.max(1,Number(TF[tf]||60));
 const end=Math.floor(Date.now()/1000/step)*step;
 const out=[];
 let previousClose=null;
 for(let i=239;i>=0;i--){
  const bucket=end-i*step;
  const raw=localOtcCandle(bucket,step);
  // Keep the visible OTC series continuous even before the network endpoint responds.
  if(previousClose!=null){
   const scale=previousClose/Math.max(assetLocalUnit(),Number(raw.open)||previousClose);
   raw.open=previousClose;
   raw.high=Math.max(raw.high*scale,raw.open,raw.close*scale);
   raw.low=Math.max(assetLocalUnit(),Math.min(raw.low*scale,raw.open,raw.close*scale));
   raw.close=Math.max(assetLocalUnit(),raw.close*scale);
  }
  out.push(raw);
  previousClose=raw.close;
 }
 return out;
}

async function fetchSyntheticCandles(){
 const step=Math.max(1,Number(TF[tf]||60));
 const end=Math.floor(Date.now()/1000/step)*step;
 const out=[];
 let previous=null;
 for(let i=239;i>=0;i--){
  const raw=localOtcCandle(end-i*step,step);
  const shaped=shapeOtcCandle(raw,previous?.close);
  out.push(shaped);
  previous=shaped;
 }
 return out;
}
async function fetchCandles(){
 if(isOtcMode())return fetchSyntheticCandles();
 return usesExternalMarket()?fetchTwelveDataCandles():fetchBybitCandles();
}

async function loadCandles(requestId=assetRequestId){
 const market=await resolveMarket();
 const loaded=dedupe(await fetchCandles()).slice(-500);
 // Asset changes are transactional: an older request is never allowed to
 // install its candles after the user has selected another asset.
 if(requestId!==assetRequestId)return false;
 candles=loaded;
 if(usesExternalMarket()&&["5 Seconds","15 Seconds","30 Seconds"].includes(tf)){const src0=$("gtxKenglySource");if(src0)src0.textContent="LIVE TICKS • building "+tf+" candles • "+pairLabel();}
 const e=$("gtxKenglyError"),src=$("gtxKenglySource");
 if(e)e.hidden=true;
 if(src&&!(usesExternalMarket()&&["5 Seconds","15 Seconds","30 Seconds"].includes(tf)))src.textContent=isOtcMode()?"OTC • GoTradeX • LOCAL 24/7":usesExternalMarket()?"LIVE • Twelve Data • "+assetType.toUpperCase()+" • "+pairLabel():"LIVE • Bybit "+String(market.category).toUpperCase()+" • "+market.symbol;
 return true;
}

function heikinCandles(){
 const out=[];
 let prevOpen=null,prevClose=null;
 candles.forEach((x)=>{
  const close=(x.open+x.high+x.low+x.close)/4;
  const open=prevOpen==null?(x.open+x.close)/2:(prevOpen+prevClose)/2;
  out.push({time:x.time,open,high:Math.max(x.high,open,close),low:Math.min(x.low,open,close),close,volume:x.volume});
  prevOpen=open;prevClose=close;
 });
 return out;
}
const CANDLE_MODES=["candles","heikin","bars","line","area"];
const CANDLE_MODE_LABELS={candles:"CANDLES",heikin:"HEIKIN ASHI",bars:"BARS",line:"LINE",area:"AREA"};
function displayCandles(){return candleMode==="heikin"?heikinCandles():candles;}
function chartLineData(){
 const src=displayCandles();
 return src.map(x=>({time:x.time,value:x.close}));
}
function syncCandleModeButton(){
 const b=$("gtxCandleMode");if(!b)return;
 b.textContent=CANDLE_MODE_LABELS[candleMode]||"CANDLES";
 b.title="Chart style: "+(CANDLE_MODE_LABELS[candleMode]||"CANDLES")+" • tap to change";
}
function removeMainSeries(){
 if(!chart||!series)return;
 try{chart.removeSeries(series)}catch(_){}
 series=null;
 priceLine=null;
}
function ensureMainSeries(){
 if(!chart)return;
 if(series?.__gtxMode===candleMode)return;
 removeMainSeries();
 const common={priceScaleId:"right",priceLineVisible:true,lastValueVisible:true,priceFormat:{type:"price",precision:assetPricePrecision(),minMove:assetPriceMinMove()}};
 if(candleMode==="bars"){
  series=chart.addSeries(LightweightCharts.BarSeries,{...common,upColor:"#19c765",downColor:"#e5394f",thinBars:false});
 }else if(candleMode==="line"){
  series=chart.addSeries(LightweightCharts.LineSeries,{...common,color:"#42a5ff",lineWidth:3,crosshairMarkerVisible:true});
 }else if(candleMode==="area"){
  series=chart.addSeries(LightweightCharts.AreaSeries,{...common,lineColor:"#42a5ff",lineWidth:2,topColor:"rgba(66,165,255,.24)",bottomColor:"rgba(66,165,255,.02)"});
 }else{
  series=chart.addSeries(LightweightCharts.CandlestickSeries,{
   ...common,
   upColor:"#19c765",downColor:"#e5394f",
   borderUpColor:"#19c765",borderDownColor:"#e5394f",
   wickUpColor:"#19c765",wickDownColor:"#e5394f",
   borderVisible:true
  });
 }
 series.__gtxMode=candleMode;
}
function drawFallbackCandles(){
 const host=$("gtxKenglyHost"); if(!host)return;
 let canvas=host.querySelector("canvas.gtxFallbackCanvas");
 if(!canvas){canvas=document.createElement("canvas");canvas.className="gtxFallbackCanvas";canvas.style.cssText="position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;";host.appendChild(canvas);}
 const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 ctx.fillStyle="#071827";ctx.fillRect(0,0,w,h);
 const data=displayCandles().slice(-60); if(!data.length)return;
 let lo=Math.min(...data.map(x=>x.low)),hi=Math.max(...data.map(x=>x.high)); if(!(hi>lo)){hi=lo+1}
 const pad={l:6,r:64,t:8,b:22},cw=(w-pad.l-pad.r)/Math.max(1,data.length),span=hi-lo;
 const y=p=>pad.t+(hi-p)/span*(h-pad.t-pad.b);
 ctx.strokeStyle="rgba(120,160,200,.12)";ctx.lineWidth=1;
 for(let g=0;g<=4;g++){const yy=pad.t+g*(h-pad.t-pad.b)/4;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();const val=hi-(g/4)*span;ctx.fillStyle="#9db4cc";ctx.font="10px sans-serif";ctx.fillText(val.toFixed(assetPricePrecision()),w-pad.r+5,yy+3)}
 if(candleMode==="line"||candleMode==="area"){
  ctx.beginPath();
  data.forEach((x,i)=>{const xx=pad.l+i*cw+cw/2,yy=y(x.close);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});
  if(candleMode==="area"){ctx.lineTo(pad.l+(data.length-.5)*cw,h-pad.b);ctx.lineTo(pad.l+cw/2,h-pad.b);ctx.closePath();ctx.fillStyle="rgba(66,165,255,.14)";ctx.fill();}
  ctx.strokeStyle="#42a5ff";ctx.lineWidth=3;ctx.stroke();
 }else{
  data.forEach((x,i)=>{const xx=pad.l+i*cw+cw/2,ow=y(x.open),ch=y(x.close),yh=y(x.high),yl=y(x.low),up=x.close>=x.open;ctx.strokeStyle=up?"#19c765":"#e5394f";ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx,yh);ctx.lineTo(xx,yl);ctx.stroke();if(candleMode==="bars"){ctx.beginPath();ctx.moveTo(xx-cw*.22,ow);ctx.lineTo(xx,ow);ctx.moveTo(xx,ch);ctx.lineTo(xx+cw*.22,ch);ctx.stroke();}else{const top=Math.min(ow,ch),bh=Math.max(2,Math.abs(ow-ch));ctx.fillRect(xx-Math.max(2,cw*.34),top,Math.max(3,cw*.68),bh);}});
 }
 ctx.fillStyle="#9db4cc";ctx.font="10px sans-serif";ctx.fillText("LIVE",6,h-7);
}
function drawNativeCandles(){
 const host=$("gtxKenglyHost");if(!host)return;
 let cv=host.querySelector("canvas.gtxNativeCandles");
 if(!cv){
  cv=document.createElement("canvas");
  cv.className="gtxNativeCandles";
  cv.setAttribute("aria-label","GoTradeX candlestick chart");
  host.appendChild(cv);
 }
 const w=Math.max(1,host.clientWidth||host.getBoundingClientRect().width||320);
 const h=Math.max(1,host.clientHeight||host.getBoundingClientRect().height||220);
 const dpr=Math.min(2,window.devicePixelRatio||1);
 cv.width=Math.max(1,Math.round(w*dpr));
 cv.height=Math.max(1,Math.round(h*dpr));
 cv.style.cssText="position:absolute;inset:0;width:100%;height:100%;display:block;z-index:50;pointer-events:none;background:#071827";
 const ctx=cv.getContext("2d");
 if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,w,h);
 ctx.fillStyle="#071827";
 ctx.fillRect(0,0,w,h);

 const data=displayCandles().filter(x=>[x.open,x.high,x.low,x.close].every(v=>Number.isFinite(Number(v)))).slice(-72);
 const left=8,right=66,top=8,bottom=24;
 const plotW=Math.max(1,w-left-right),plotH=Math.max(1,h-top-bottom);

 if(!data.length){
  ctx.fillStyle="#8fa8bf";
  ctx.font="800 11px sans-serif";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText(isOtcMode()?"BUILDING OTC 24/7 CANDLES":"WAITING FOR LIVE MARKET CANDLES",left+plotW/2,top+plotH/2);
  ctx.textAlign="left";
  return;
 }

 let lo=Infinity,hi=-Infinity;
 data.forEach(x=>{
  lo=Math.min(lo,Number(x.low),Number(x.open),Number(x.close));
  hi=Math.max(hi,Number(x.high),Number(x.open),Number(x.close));
 });
 if(!(hi>lo)){
  const p=Math.max(1,Math.abs(hi)*0.002);
  lo-=p;hi+=p;
 }
 const span=hi-lo;
 const y=v=>top+(hi-Number(v))/span*plotH;

 ctx.strokeStyle="rgba(120,160,200,.10)";
 ctx.lineWidth=1;
 ctx.font="10px sans-serif";
 ctx.textBaseline="middle";
 for(let i=0;i<=4;i++){
  const yy=top+plotH*i/4;
  ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();
  const v=hi-span*i/4;
  ctx.fillStyle="#9db4cc";
  ctx.fillText(Number(v).toFixed(assetPricePrecision()),w-right+5,yy);
 }

 const stepX=plotW/data.length;
 const bodyW=Math.max(3,Math.min(18,stepX*.62));
 const realWicks=!isOtcMode();

 data.forEach((x,i)=>{
  const xx=left+i*stepX+stepX/2;
  const openY=y(x.open),closeY=y(x.close);
  const highY=y(x.high),lowY=y(x.low);
  const up=Number(x.close)>=Number(x.open);
  const fill=up?"#19c765":"#e5394f";

  if(realWicks){
   ctx.strokeStyle=fill;
   ctx.lineWidth=Math.max(1,Math.min(2,bodyW*.12));
   ctx.beginPath();
   ctx.moveTo(xx,highY);
   ctx.lineTo(xx,Math.min(openY,closeY));
   ctx.moveTo(xx,Math.max(openY,closeY));
   ctx.lineTo(xx,lowY);
   ctx.stroke();
  }

  const bodyTop=Math.min(openY,closeY);
  const bodyH=Math.max(2,Math.abs(openY-closeY));
  ctx.fillStyle=fill;
  ctx.fillRect(Math.round(xx-bodyW/2),Math.round(bodyTop),Math.max(2,Math.round(bodyW)),Math.round(bodyH));
 });

 const last=data[data.length-1];
 const lastY=y(last.close);
 ctx.strokeStyle="#f5c542";
 ctx.lineWidth=1;
 ctx.setLineDash([5,5]);
 ctx.beginPath();ctx.moveTo(left,lastY);ctx.lineTo(w-right,lastY);ctx.stroke();
 ctx.setLineDash([]);

 ctx.fillStyle="#f5c542";
 ctx.fillRect(w-right,lastY-8,right-4,16);
 ctx.fillStyle="#071827";
 ctx.font="900 9px sans-serif";
 ctx.textBaseline="middle";
 ctx.fillText(Number(last.close).toFixed(assetPricePrecision()),w-right+4,lastY);

 ctx.fillStyle="#9db4cc";
 ctx.font="9px sans-serif";
 ctx.textBaseline="alphabetic";
 const label=(isOtcMode()?"OTC 24/7":"LIVE")+" • "+pairLabel();
 ctx.fillText(label,left,h-7);
}

function renderCandleSeries(){
 const data=displayCandles();
 // Native renderer is the primary visible chart. Always render it after data changes.
 try{drawNativeCandles()}catch(e){console.error("GoTradeX native candle render failed",e)}
 if(!chart){return;}
 try{ensureMainSeries()}catch(_){series=null;return;}
 if(!series)return;
 const rendered=(candleMode==="line"||candleMode==="area")?chartLineData():data;
 try{series.setData(rendered)}catch(_){return;}
 if(rendered.length){
  try{series.applyOptions({priceFormat:{type:"price",precision:assetPricePrecision(),minMove:assetPriceMinMove()}})}catch(_){}
 }
}
function toggleCandleMode(){
 const i=CANDLE_MODES.indexOf(candleMode);
 candleMode=CANDLE_MODES[(i+1)%CANDLE_MODES.length];
 store.set("gotradex_candle_mode",candleMode);
 syncCandleModeButton();
 renderCandleSeries();
 showRecentChartWindow();
 updateInfo();
}
function sma(v,p){const o=[];for(let i=p-1;i<v.length;i++)o.push({time:candles[i].time,value:v.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p});return o}
function ema(v,p){const o=[],k=2/(p+1);let e=null;v.forEach((x,i)=>{e=e==null?x:x*k+e*(1-k);if(i>=p-1)o.push({time:candles[i].time,value:e})});return o}
function addLine(data,color,width=1,title=""){if(!chart)return null;const s=chart.addSeries(LightweightCharts.LineSeries,{color,lineWidth:width,priceLineVisible:false,lastValueVisible:false,title,crosshairMarkerVisible:false});s.setData(data);indicatorSeries.push(s);return s}
function clearIndicators(){indicatorSeries.forEach(s=>{try{chart.removeSeries(s)}catch(_){}});indicatorSeries=[]}
function buildIndicators(){
 clearIndicators();if(!chart||!candles.length)return;
 const sourceCandles=displayCandles();
 const c=sourceCandles.map(x=>x.close);
 if(active.has("EMA / SMA")){addLine(ema(c,9),"#f5c542",2,"EMA 9");addLine(ema(c,21),"#5ea7ff",2,"EMA 21");addLine(sma(c,50),"#b58cff",1,"SMA 50")}
 if(active.has("Alligator")){addLine(sma(c,5),"#57d68d",2,"Jaw");addLine(sma(c,8),"#f5c542",2,"Teeth");addLine(sma(c,13),"#ff6b6b",2,"Lips")}
 if(active.has("Bollinger Bands")){const m=sma(c,20),u=[],d=[];for(let i=19;i<c.length;i++){const q=c.slice(i-19,i+1),a=q.reduce((x,y)=>x+y,0)/20,sd=Math.sqrt(q.reduce((x,y)=>x+(y-a)**2,0)/20);u.push({time:sourceCandles[i].time,value:a+2*sd});d.push({time:sourceCandles[i].time,value:a-2*sd})}addLine(m,"#8fa8c4");addLine(u,"#9c7cff");addLine(d,"#9c7cff")}
 if(active.has("Fractals")){const h=sourceCandles.map(x=>x.high),l=sourceCandles.map(x=>x.low),hi=[],lo=[];for(let i=2;i<c.length-2;i++){if(h[i]>h[i-1]&&h[i]>h[i-2]&&h[i]>h[i+1]&&h[i]>h[i+2])hi.push({time:sourceCandles[i].time,value:h[i]});if(l[i]<l[i-1]&&l[i]<l[i-2]&&l[i]<l[i+1]&&l[i]<l[i+2])lo.push({time:sourceCandles[i].time,value:l[i]})}addLine(hi,"#ff9f43",2,"Fractal High");addLine(lo,"#48dbfb",2,"Fractal Low")}
}

function assetPricePrecision(){
 const p=candles.at(-1)?.close;
 if(!Number.isFinite(p))return 2;
 if(p>=1000)return 2;
 if(p>=100)return 2;
 if(p>=10)return 3;
 if(p>=1)return 5;
 return 6;
}
function assetPriceMinMove(){
 const precision=assetPricePrecision();
 return Math.pow(10,-precision);
}
function showRecentChartWindow(){
 if(!chart||!candles.length)return;
 try{
  const count=Math.min(36,candles.length);
  chart.timeScale().setVisibleLogicalRange({from:Math.max(0,candles.length-count),to:candles.length+4});
  chart.priceScale("right").applyOptions({visible:true,autoScale:true,minimumWidth:78,ticksVisible:true,alignLabels:true});
 }catch(_){}
}
function makeChart(){
 const host=$("gtxKenglyHost");if(!host)throw Error("Chart host unavailable");
 if(chart)try{chart.remove()}catch(_){} chart=null; series=null;
 if(!window.LightweightCharts){drawFallbackCandles();root().classList.add("ready");observeSize();updateInfo();updateTradeOverlay();return;}
 try{
  chart=LightweightCharts.createChart(host,{autoSize:true,layout:{background:{type:"solid",color:"#071827"},textColor:"#9db4cc",fontSize:10},grid:{vertLines:{color:"rgba(120,160,200,.09)"},horzLines:{color:"rgba(120,160,200,.09)"}},rightPriceScale:{visible:true,borderColor:"#2b527d",minimumWidth:78,ticksVisible:true,entireTextOnly:false,alignLabels:true,autoScale:true,scaleMargins:{top:.08,bottom:.12}},timeScale:{visible:true,borderColor:"#2b527d",timeVisible:true,secondsVisible:true,barSpacing:14,rightOffset:5,minBarSpacing:6,maxBarSpacing:45},crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{width:1,style:2,labelBackgroundColor:"#176fca"},horzLine:{width:1,style:2,labelBackgroundColor:"#176fca"}},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true}});
  ensureMainSeries();
  renderCandleSeries();
 }catch(e){
  try{chart?.remove()}catch(_){}
  chart=null;series=null;
  drawFallbackCandles();
  root().classList.add("ready");observeSize();updateInfo();updateTradeOverlay();
  return;
 }
 const last=candles.at(-1)?.close;
 if(Number.isFinite(last))priceLine=series.createPriceLine({price:last,color:"#f5c542",lineWidth:2,lineStyle:2,axisLabelVisible:true,title:"LIVE"});
 buildIndicators();showRecentChartWindow();root().classList.add("ready");observeSize();updateInfo();updateTradeOverlay();
}

function observeSize(){const host=$("gtxKenglyHost");if(!host)return;resizeObserver?.disconnect();resizeObserver=new ResizeObserver(()=>{if(host.clientWidth&&host.clientHeight){if(chart)chart.resize(host.clientWidth,host.clientHeight);if(candles.length)drawNativeCandles();}updateTradeOverlay()});resizeObserver.observe(host);if(host.clientWidth&&host.clientHeight&&candles.length)drawNativeCandles()}
function updateInfo(){const p=$("gtxKenglyPair"),t=$("gtxKenglyTimeframe");if(p)p.textContent=pairLabel();if(t)t.textContent=tf;const x=candles.at(-1);if(x&&priceLine)priceLine.applyOptions({price:x.close});if(series&&x){try{series.applyOptions({priceFormat:{type:"price",precision:assetPricePrecision(),minMove:assetPriceMinMove()}})}catch(_){}}updateTradeOverlay()}

function closeSocket(){try{ws?.close()}catch(_){}try{tdWs?.close()}catch(_){}ws=null;tdWs=null;clearTimeout(reconnectTimer);reconnectTimer=null;clearInterval(poll);poll=null;clearInterval(liveFreshTimer);liveFreshTimer=null;lastLiveUpdateAt=0}
async function connectSocket(requestId=assetRequestId){
 if(isOtcMode()){
  closeSocket();
  const request=requestId;
  const endpoint="https://glffecggusetzklmyukv.functions.supabase.co/gotradex-synthetic-market";
  const src=$("gtxKenglySource");
  const tick=async()=>{
   if(request!==assetRequestId)return;
   try{
    const u=endpoint+"?action=price&symbol="+encodeURIComponent(normalizedSymbol())+"&display="+encodeURIComponent(pairLabel());
    const res=await fetch(u,{cache:"no-store",headers:{"Accept":"application/json"}});
    const data=await res.json().catch(()=>null);
    const p=Number(data?.price),t=Number(data?.timestamp||Date.now()/1000);
    if(res.ok&&Number.isFinite(p)){
      updateLivePrice(p,t);
      if(src){src.classList.remove("stale");src.textContent="OTC • GoTradeX Synthetic • LIVE 24/7";}
    }else{
      updateLivePrice(localOtcPrice(Date.now()/1000),Date.now()/1000);
      if(src){src.classList.remove("stale");src.textContent="OTC • GoTradeX • LOCAL 24/7";}
    }
   }catch(e){
    updateLivePrice(localOtcPrice(Date.now()/1000),Date.now()/1000);
    if(src){src.classList.remove("stale");src.textContent="OTC • GoTradeX • LOCAL 24/7";}
   }
  };
  if(src)src.textContent="OTC • GoTradeX • LOCAL 24/7 • CONNECTING…";
  await tick();
  poll=setInterval(tick,500);
  return;
 }
 if(usesExternalMarket()){
  closeSocket();
  const request=requestId;
  const auth=window.GTXBybitAuth;
  const src=$("gtxKenglySource");
  if(!auth||typeof auth.ensureClient!=="function")throw Error("Secure GoTradeX session is not ready.");
  const client=auth.ensureClient();
  const sessionResult=await client.auth.getSession();
  const token=sessionResult?.data?.session?.access_token;
  if(!token)throw Error("Sign in to GoTradeX to receive live market prices.");
  const endpoint="wss://glffecggusetzklmyukv.functions.supabase.co/gotradex-market-ws"
    +"?token="+encodeURIComponent(token)
    +"&symbol="+encodeURIComponent(normalizedExternalSymbol())
    +"&marketMode="+encodeURIComponent(marketMode);
  const thisWs=new WebSocket(endpoint);
  tdWs=thisWs;
  clearInterval(poll);
  poll=null;
  const fallbackPoll=async()=>{
   if(request!==assetRequestId||thisWs!==tdWs||lastLiveUpdateAt&&Date.now()-lastLiveUpdateAt<2500)return;
   try{
    const {data}=await client.functions.invoke("gotradex-market-data",{body:{action:"price",symbol:normalizedExternalSymbol(),assetType}});
    const fp=Number(data?.price);
    if(Number.isFinite(fp))updateLivePrice(fp,Number(data?.timestamp||Date.now())/1000);
   }catch(_){}
  };
  if(!isOtcMode()){
   poll=setInterval(fallbackPoll,2000);
   fallbackPoll();
  }
  thisWs.onopen=()=>{
    if(request!==assetRequestId||thisWs!==tdWs){try{thisWs.close()}catch(_){};return}
    if(src)updateFeedStatus();
  };
  thisWs.onmessage=e=>{
    if(request!==assetRequestId||thisWs!==tdWs)return;
    try{
      const m=JSON.parse(e.data);
      if(m?.event==="price"){
        const p=Number(m?.price),t=Number(m?.timestamp||Date.now())/1000;
        if(Number.isFinite(p))updateLivePrice(p,t);
      }else if(m?.event==="proxy-status"){
        if(src)updateFeedStatus();
      }else if(m?.event==="proxy-error"||m?.event==="proxy-closed"){
        if(src)src.textContent=(isOtcMode()?"OTC FEED ERROR • ":"LIVE FEED ERROR • ")+String(m?.message||m?.reason||(isOtcMode()?"OTCharts stream unavailable":"Twelve Data connection closed"));
      }
    }catch(_){}
  };
  thisWs.onerror=()=>{
    if(request===assetRequestId&&thisWs===tdWs&&src)src.textContent="LIVE FEED ERROR • Twelve Data WebSocket";
  };
  thisWs.onclose=()=>{
    if(thisWs!==tdWs||request!==assetRequestId)return;
    tdWs=null;
    if(started)reconnectTimer=setTimeout(()=>connectSocket(request).catch(()=>{}),2000);
  };
  clearInterval(liveFreshTimer);
  liveFreshTimer=setInterval(()=>{
    if(request!==assetRequestId||thisWs!==tdWs)return;
    if(src)updateFeedStatus();
  },1000);
  return;
 }
 const mySocket=++socketGeneration;
 closeSocket();
 const market=await resolveMarket();
 if(requestId!==assetRequestId||mySocket!==socketGeneration)return;
 try{
  const url=market.category==="spot"?BYBIT_WS_SPOT:BYBIT_WS_LINEAR;
  ws=new WebSocket(url);
  const thisWs=ws;
  ws.onopen=()=>{
   if(requestId!==assetRequestId||thisWs!==ws||mySocket!==socketGeneration){try{thisWs.close()}catch(_){};return}
   const topics=["tickers."+market.symbol];
   const klineInterval=API[tf];
   if(klineInterval)topics.push("kline."+klineInterval+"."+market.symbol);
   ws.send(JSON.stringify({op:"subscribe",args:topics}));
   const src=$("gtxKenglySource");if(src)src.textContent="LIVE • Bybit WebSocket • "+market.symbol;
  };
  ws.onmessage=e=>{try{
   if(requestId!==assetRequestId||thisWs!==ws||mySocket!==socketGeneration)return;
   const m=JSON.parse(e.data);
   if(String(m?.topic||"").startsWith("kline.")){
    const rows=Array.isArray(m?.data)?m.data:[];
    rows.forEach(k=>{
     const t=Number(k?.start||k?.timestamp||m?.ts||Date.now())/1000;
     const o=Number(k?.open),h=Number(k?.high),l=Number(k?.low),c=Number(k?.close);
     if([t,o,h,l,c].every(Number.isFinite)){
      const existing=candles.find(x=>Number(x.time)===Math.floor(t));
      if(existing){existing.open=o;existing.high=h;existing.low=l;existing.close=c;existing.volume=Number(k?.volume||existing.volume||0)}
      else candles.push({time:Math.floor(t),open:o,high:h,low:l,close:c,volume:Number(k?.volume||0)});
      candles=dedupe(candles).slice(-500);
      renderCandleSeries();updateInfo();
     }
    });
   }
   const p=Number(m?.data?.lastPrice),t=Number(m?.ts||Date.now());
   if(Number.isFinite(p))updateLivePrice(p,t/1000);
  }catch(_){}};
  ws.onerror=()=>{try{thisWs.close()}catch(_){}};
  ws.onclose=()=>{
   if(thisWs!==ws||mySocket!==socketGeneration||requestId!==assetRequestId)return;
   ws=null;
   if(started)reconnectTimer=setTimeout(()=>connectSocket(requestId).catch(()=>{}),3000);
  };
 }catch(e){
  const src=$("gtxKenglySource");if(src)src.textContent="LIVE FEED WAITING • "+(e?.message||"Connecting…");
  if(started)reconnectTimer=setTimeout(()=>connectSocket(requestId).catch(()=>{}),3000);
 }
}
function isForexWeekendClosed(){
 if(assetType!=="forex")return false;
 const d=new Date();
 const day=d.getUTCDay();
 return day===0 || day===6;
}
function updateFeedStatus(){
 const src=$("gtxKenglySource");
 if(!src)return;
 if(isOtcMode()){
  src.classList.remove("stale");
  src.textContent="OTC • GoTradeX Synthetic • LIVE 24/7";
  return;
 }
 if(isForexWeekendClosed()){
  src.classList.add("stale");
  src.textContent="MARKET CLOSED • Forex weekend • Last AUD/USD price";
  return;
 }
 const stale=lastLiveUpdateAt>0&&(Date.now()-lastLiveUpdateAt)>20000;
 src.classList.toggle("stale",stale);
 src.textContent=stale?"STALE • waiting for live "+pairLabel():"LIVE • Twelve Data WebSocket • "+assetType.toUpperCase()+" • "+pairLabel();
}
function updateLivePrice(p,sourceTime){
 if(!Number.isFinite(Number(p)))return false;
 const price=Number(p);
 lastLiveUpdateAt=Date.now();
 const step=Math.max(1,Number(TF[tf]||60));
 const base=Number.isFinite(Number(sourceTime))?Number(sourceTime):Date.now()/1000;
 const t=Math.floor(base/step)*step;
 let x=candles.at(-1);
 if(!x||Number(x.time)!==t){
  x={time:t,open:price,high:price,low:price,close:price,volume:0};
  candles.push(x);
  if(candles.length>500)candles=candles.slice(-500);
 }else{
  x.close=price;
  x.high=Math.max(Number(x.high),price);
  x.low=Math.min(Number(x.low),price);
 }
 if(isOtcMode()){
  const previous=candles.length>1?candles[candles.length-2]:null;
  const base=Math.max(assetLocalUnit(),Number(previous?.close)||price);
  const move=price-base;
  const vol=Math.max(assetLocalUnit(),base*(.00035+Math.abs(otcGaussian(normalizedSymbol()+"|livevol",t))*.0012));
  x.open=previous?base:Math.max(assetLocalUnit(),price-move);
  x.close=price;
  x.high=Math.max(x.open,x.close)+vol*(.25+otcHash(normalizedSymbol()+"|livehi",t)*.75);
  x.low=Math.max(assetLocalUnit(),Math.min(x.open,x.close)-vol*(.25+otcHash(normalizedSymbol()+"|livelo",t)*.75));
 }
 try{
  renderCandleSeries();
  if(chart){showRecentChartWindow();chart.timeScale().scrollToRealTime();}
 }catch(_){}
 if(priceLine)priceLine.applyOptions({price});
 if(trade)updateTrade(price);
 updateInfo();
 return true;
}
async function fast(){
 if(!started||!candles.length)return;
 try{
  const market=await resolveMarket();
  if(market.broker==="BYBIT"){
   if(!["5 Seconds","15 Seconds","30 Seconds"].includes(tf))return;
   const r=await fetch("https://api.bybit.com/v5/market/tickers?category="+encodeURIComponent(market.category)+"&symbol="+encodeURIComponent(market.symbol),{cache:"no-store"});
   const d=await r.json(),p=Number(d?.result?.list?.[0]?.lastPrice);
   if(Number.isFinite(p))updateLivePrice(p);
  }else{
   const auth=window.GTXBybitAuth;if(!auth||typeof auth.ensureClient!=="function")return;
   const client=auth.ensureClient();
   const {data}=await client.functions.invoke("gotradex-market-data",{body:{action:"price",symbol:normalizedExternalSymbol(),assetType}});
   const p=Number(data?.price);
   if(Number.isFinite(p))updateLivePrice(p,Number(data?.timestamp||Date.now())/1000);
  }
 }catch(_){}
}

function loadLibrary(){return new Promise((resolve,reject)=>{if(window.LightweightCharts)return resolve();const old=document.querySelector('script[data-gtx-kengly-lib="1"]');if(old){old.addEventListener("load",resolve,{once:true});old.addEventListener("error",reject,{once:true});return}const s=document.createElement("script");s.src="https://unpkg.com/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js";s.dataset.gtxKenglyLib="1";s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}

function renderIndicators(){const g=$("gtxKenglyGrid");if(!g)return;g.innerHTML="";INDS.forEach(n=>{const b=document.createElement("button");b.textContent=n;b.className=active.has(n)?"on":"";b.onclick=()=>{active.has(n)?active.delete(n):active.add(n);renderIndicators();buildIndicators()};g.appendChild(b)})}
function bindControls(){renderIndicators();syncCandleModeButton();const mode=$("gtxCandleMode");if(mode&&!mode.dataset.gtxBound){mode.dataset.gtxBound="1";mode.addEventListener("click",toggleCandleMode)}["buy","sell"].forEach(id=>{const b=$(id);if(!b||b.dataset.gtxTradeBound==="1")return;b.dataset.gtxTradeBound="1";b.addEventListener("click",()=>startTrade(id==="buy"?"BUY":"SELL"),{capture:false})})}

function readTradeControls(){
 const amountEl=$("amountValueText");
 const timeEl=$("timeBtn");
 const amount=Number(String(amountEl?.textContent||"").replace(/[^0-9.]/g,""));
 const label=String(timeEl?.textContent||tf||"").replace(/\\s*▾\\s*$/," ").trim();
 const seconds=Number(TF[label]||TF[tf]||0);
 return {amount,label,seconds};
}
function setTradeControlStatus(message,ok=false){
 const st=$("status");
 if(st){
  st.textContent=message;
  st.style.color=ok?"#7ee2a8":"#8fa8c4";
 }
}
function startTrade(direction){
 if(direction!=="BUY"&&direction!=="SELL")return;
 if(!candles.length){setTradeControlStatus("Live candles are not ready yet.");return;}
 if(trade){setTradeControlStatus("A trade is already active. Wait for it to finish before starting another.");return;}
 const controls=readTradeControls();
 if(!Number.isFinite(controls.amount)||controls.amount<=0){setTradeControlStatus("Enter a valid trade amount first.");return;}
 if(!Number.isFinite(controls.seconds)||controls.seconds<=0){setTradeControlStatus("Choose a valid trade time first.");return;}
 const x=candles.at(-1),now=Math.floor(Date.now()/1000),step=controls.seconds;
 completedTrade=null;
 trade={direction,symbol:pairLabel(),amount:controls.amount,expiryLabel:controls.label,startTime:now,startPrice:x.close,endTime:now+step,endPrice:x.close,execution:"NO_TRADE"};
 signalExpiryAt=Date.now()+step*1000;
 setTradeControlStatus("✓ "+direction+" control verified • Amount $"+controls.amount.toFixed(2)+" • "+controls.label+" • NO TRADE placed.",true);
 drawTrade();
}
function updateTrade(price){
 if(!trade)return;
 trade.endPrice=price;
 if(Date.now()>=signalExpiryAt){finishTrade();signalExpiryAt=0;return}
 drawTrade();
}
function finishTrade(){
 if(!trade)return;
 trade.endTime=Math.floor(Date.now()/1000);
 const p=trade.endPrice??trade.startPrice;
 trade.endPrice=p;
 completedTrade={...trade,result:(trade.direction==="BUY"?(p>=trade.startPrice):(p<=trade.startPrice))?"WIN":"LOSS"};
 tradeLine?.setData([{time:trade.startTime,value:trade.startPrice},{time:trade.endTime,value:p}]);
 setTradeControlStatus((completedTrade.result==="WIN"?"✓ WIN":"✕ LOSS")+" • "+completedTrade.direction+" • $"+completedTrade.amount.toFixed(2)+" • "+completedTrade.expiryLabel+" • NO TRADE placed.",completedTrade.result==="WIN");
 trade=null;
 updateTradeOverlay();
}
function drawTrade(){
 if(!chart||!series)return;
 const activeTrade=trade||completedTrade;
 if(!activeTrade)return;
 const endTime=trade?Math.floor(Date.now()/1000):activeTrade.endTime;
 const endPrice=trade?(trade.endPrice??trade.startPrice):(activeTrade.endPrice??activeTrade.startPrice);
 if(!tradeLine){tradeLine=chart.addSeries(LightweightCharts.LineSeries,{color:activeTrade.direction==="BUY"?"#36c275":"#e05b70",lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});}
 tradeLine.applyOptions({color:activeTrade.direction==="BUY"?"#36c275":"#e05b70"});
 tradeLine.setData([{time:activeTrade.startTime,value:activeTrade.startPrice},{time:endTime,value:endPrice}]);
 updateTradeOverlay();
}
function updateTradeOverlay(){
 const ov=$("gtxKenglyOverlay");if(!ov||!chart||!candles.length)return;
 ov.innerHTML="";
 const activeTrade=trade||completedTrade;
 if(!activeTrade)return;
 const color=activeTrade.direction==="BUY"?"#36c275":"#e05b70";
 const startX=chart.timeScale().timeToCoordinate(activeTrade.startTime);
 const endX=chart.timeScale().timeToCoordinate(activeTrade.endTime);
 const startY=series?.priceToCoordinate(activeTrade.startPrice);
 const endY=series?.priceToCoordinate(activeTrade.endPrice??activeTrade.startPrice);
 const addMarker=(kind,x,y,label,subLabel)=>{
  if(x==null)return;
  const line=document.createElement("div");
  line.className="gtxTradeVertical "+activeTrade.direction.toLowerCase()+" "+kind;
  line.style.left=x+"px";line.style.color=color;ov.appendChild(line);
  if(y!=null){
   const point=document.createElement("div");
   point.className="gtxTradePoint "+activeTrade.direction.toLowerCase()+" "+kind;
   point.style.left=x+"px";point.style.top=y+"px";point.style.color=color;ov.appendChild(point);
  }
  const flag=document.createElement("div");
  flag.className="gtxTradeFlag "+activeTrade.direction.toLowerCase()+" "+kind;
  flag.textContent=label;
  flag.style.left=x+"px";
  if(kind==="start")flag.style.top="15px";
  else flag.style.top=y==null?"15px":Math.max(18,y-8)+"px";
  ov.appendChild(flag);
  if(subLabel){
   const result=document.createElement("div");
   result.className="gtxTradeResult "+activeTrade.direction.toLowerCase()+" "+kind;
   result.textContent=subLabel;
   result.style.left=x+"px";
   result.style.top=y==null?"34px":Math.min(Math.max(28,y+8),ov.clientHeight-18)+"px";
   ov.appendChild(result);
  }
 };
 addMarker("start",startX,startY,"📍 "+activeTrade.symbol+" START","");
 addMarker("end",endX,endY,"📍 END",completedTrade?((completedTrade.result==="WIN"?"✓ WIN":"✕ LOSS")+" • "+activeTrade.direction+" • $"+activeTrade.amount.toFixed(2)+" • "+activeTrade.expiryLabel):"");
}

function updateExpiryDisplay(){
 if(signalExpiryAt&&Date.now()>=signalExpiryAt&&trade){finishTrade();signalExpiryAt=0}
}
function bindExpiry(){clearInterval(expiryTimer);expiryTimer=setInterval(updateExpiryDisplay,250)}

async function refresh(requestId=assetRequestId){
 if(requestId!==assetRequestId)return;
 // Start the realtime feed FIRST. History must never block the live chart.
 const liveFeedPromise=connectSocket(requestId).catch(e=>{
  if(requestId!==assetRequestId)return;
  const src=$("gtxKenglySource");
  if(src)src.textContent=isOtcMode()?"OTC • GoTradeX • LOCAL 24/7 • RETRYING…":"LIVE FEED WAITING • "+String(e?.message||"Connecting…");
 });
 try{
  try{
   const loaded=await loadCandles(requestId);
   if(loaded&&requestId===assetRequestId){
    if(!chart)makeChart();
    renderCandleSeries();
    buildIndicators();
    showRecentChartWindow();
    updateInfo();
   }
  }catch(e){
   // A failed/slow history request must not leave the chart blank.
   // Bybit ticker/kline WebSocket continues independently and will build candles.
   if(requestId===assetRequestId){
    const box=$("gtxKenglyError");
    if(box)box.hidden=true;
    const src=$("gtxKenglySource");
    if(src&&!isOtcMode())src.textContent="LIVE • waiting for Bybit WebSocket candles…";
    console.warn("GoTradeX history unavailable; realtime feed remains active:",e);
   }
   if(!chart)try{makeChart()}catch(_){}
   renderCandleSeries();
  }
 }finally{
  // Do not await the live feed here: WebSocket must remain independent of REST history.
  void liveFeedPromise;
 }
}

function showLiveError(e){
 const box=$("gtxKenglyError"),src=$("gtxKenglySource");
 const msg=String(e?.message||"Market data is not available");
 if(src)src.textContent=isOtcMode()?"OTC LOCAL ENGINE ERROR • Retrying…":"LIVE FEED ERROR • Retrying…";
 if(box){box.hidden=false;box.innerHTML=(isOtcMode()?"OTC LOCAL MARKET UNAVAILABLE":"LIVE CANDLE FEED UNAVAILABLE")+"<br><span style='font-weight:500;color:#7891aa'>"+msg.replace(/[<>&"]/g,m=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[m]))+"</span><br><span style='font-weight:500;color:#7891aa'>"+(isOtcMode()?"Retrying GoTradeX local market…":"Retrying live market data…")+"</span>"}
}
async function retryLive(requestId=assetRequestId){if(!started||requestId!==assetRequestId)return;try{await loadLibrary();await refresh(requestId)}catch(e){if(requestId!==assetRequestId)return;showLiveError(e);reconnectTimer=setTimeout(()=>retryLive(requestId),3000)}}

async function boot(){
 if(started)return;
 if(!root()){setTimeout(()=>boot().catch(()=>{}),500);return;}
 // Start every chart from the currently selected asset/mode.
 assetRequestId++;
 started=true;
 assetDisplay=String(store.get("gotradex_asset_display","")).trim();
 assetType=inferAssetType(assetDisplay,assetType,symbol);
 const storedDisplay=assetDisplay||pairLabel();
 if(storedDisplay)store.set("gotradex_asset_display",storedDisplay);
 store.set("gotradex_asset_type",assetType);
 injectCss();rebuildDom();bindExpiry();
 // Seed OTC synchronously so the chart is never empty while the 24/7 feed connects.
 if(isOtcMode()){
  try{candles=seedOtcCandles();renderCandleSeries()}catch(e){console.error("GoTradeX OTC seed failed",e)}
 }
 // Build the visible chart immediately. Market data is connected afterward.
 try{makeChart()}catch(e){console.error("GoTradeX initial chart build failed",e)}
 try{
  try{await loadLibrary()}catch(_){/* Native renderer works without external chart libraries. */}
  bindControls();
  try{await refresh()}catch(e){showLiveError(e);console.error("GoTradeX market connection failed",e)}
  clearInterval(poll);poll=null;
  requestAnimationFrame(()=>{try{renderCandleSeries();observeSize()}catch(_){}}); 
  setTimeout(()=>{try{renderCandleSeries()}catch(_){}} ,250);
 }
 catch(e){showLiveError(e);closeSocket();reconnectTimer=setTimeout(retryLive,3000)}
}
function toggleIndicator(name){if(!INDS.includes(name))return false;if(active.has(name))active.delete(name);else active.add(name);buildIndicators();return active.has(name)}

window.GoTradeXChartEngine={
 boot,refresh,
 setSymbol:(s,type,display)=>{
 const requestId=++assetRequestId;
 marketMode=String(store.get("gotradex_market_mode","LIVE")).toUpperCase()==="OTC"?"OTC":"LIVE";
 // Invalidate every in-flight feed before changing the visible pair.
 clearTimeout(reconnectTimer);reconnectTimer=null;
 closeSocket();
 symbol=String(s||"BTCUSDT").toUpperCase().replace(/[^A-Z0-9_]/g,"");
 assetDisplay=String(display||store.get("gotradex_asset_display","")).trim();
 assetType=inferAssetType(assetDisplay,type||store.get("gotradex_asset_type","crypto"));
 store.set("gotradex_chart_symbol",symbol);
 store.set("gotradex_asset_type",assetType);