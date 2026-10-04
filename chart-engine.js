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
let candleMode=String(store.get("gotradex_candle_mode","candles")).toLowerCase();
if(!["candles","heikin","bars","line","area"].includes(candleMode))candleMode="candles";
let lastLiveUpdateAt=0,liveFreshTimer=null;
let resolvedMarket=null,resolvedKey="";
liveBroker="BYBIT";
let trade=null,completedTrade=null,tradeOverlay=null,signalExpiryAt=0,expiryTimer=null;

function root(){return document.getElementById("gotradex-main-chart")||document.querySelector(".chart")}
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
.gtxKengly{position:relative!important;display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#071827!important;color:#dbe9f7!important}
.gtxKenglyHeader{flex:0 0 auto!important;display:flex!important;align-items:center!important;gap:7px!important;width:100%!important;box-sizing:border-box!important;padding:3px 7px!important;background:#071827!important;z-index:20!important;white-space:nowrap!important;overflow:hidden!important}
.gtxKenglyBadge{font:800 9px/16px sans-serif!important;padding:0 6px!important;border-radius:9px!important;background:#10304a!important;color:#9fc8e8!important}
.gtxKenglyBadge.live{background:#123c2b!important;color:#5ee39a!important}.gtxKenglyBadge.otc{background:#2a1644!important;color:#c9a0ff!important}
.gtxKenglyPair{font:900 11px/16px sans-serif!important;color:#fff!important}
.gtxKenglyPrice{font:900 11px/16px sans-serif!important;color:#fff!important;letter-spacing:.01em}
.gtxKenglyChange{font:900 8px/16px sans-serif!important;padding:0 4px;border-radius:4px;background:#102945;color:#9db4cc!important}
.gtxKenglyChange.up{color:#5ee39a!important;background:#123c2b!important}.gtxKenglyChange.down{color:#ff9aaa!important;background:#421c26!important}
.gtxKenglyTf{font:700 9px/16px sans-serif!important;color:#9db4cc!important}
.gtxKenglySource{margin-left:auto!important;font:800 8px/16px sans-serif!important;color:#5ee39a!important}
.gtxKenglySource.stale{color:#ff9aaa!important}.gtxCandleMode{margin-left:4px!important;border:1px solid #2b527d!important;border-radius:7px!important;background:#0b2033!important;color:#dbe9f7!important;font:800 8px/15px sans-serif!important;padding:0 6px!important;white-space:nowrap!important}
.gtxKenglyStage{position:relative!important;flex:1 1 auto!important;min-height:150px!important;width:100%!important;overflow:hidden!important}
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
 <span class="gtxKenglyBadge ${marketMode==="OTC"?"otc":"live"}">${marketMode==="OTC"?"● OTC 24/7":"● LIVE"}</span><strong class="gtxKenglyPair" id="gtxKenglyPair">${pairLabel()}</strong><strong class="gtxKenglyPrice" id="gtxKenglyPrice">—</strong><span class="gtxKenglyChange" id="gtxKenglyChange">—</span>
<span class="gtxKenglySource" id="gtxKenglySource">Connecting…</span><button class="gtxCandleMode" id="gtxCandleMode" type="button">CANDLES</button>
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
 const s=String(key)+"|"+Math.floor(Number(t)/18),h=[...s].reduce((a,ch)=>((a*33+ch.charCodeAt(0))>>>0),2166136261)>>>0;
 return (h/4294967296)*2-1;
}
function localOtcPrice(t){
 const b=basePriceForLocalOtc(), k=normalizedSymbol()+"|"+pairLabel();
 const a=localOtcNoise(k+"a",t/3),b1=localOtcNoise(k+"b",t/9),c=localOtcNoise(k+"c",t/30);
 return Math.max(assetLocalUnit(),b*(1+a*.0009+b1*.002+c*.004));
}
function basePriceForLocalOtc(){const d=String(pairLabel()).replace(/\\s+OTC$/i,"");const map={"EUR/USD":1.085,"GBP/USD":1.275,"USD/JPY":149.5,"XAU/USD":2650,"BTC/USD":62000,"ETH/USD":2450,"XRP/USD":.52,"SOL/USD":145};return Number(map[d]||100)}
function assetLocalUnit(){const p=basePriceForLocalOtc();return p<1?.00001:p<10?.0001:p<100?.001:.01}
function localOtcCandle(bucket,step){const o=localOtcPrice(bucket),c=localOtcPrice(bucket+step),mid=(o+c)/2,r=Math.abs(localOtcNoise("r|"+normalizedSymbol(),bucket)),w=mid*(.0015+r*.004);return {time:bucket,open:o,high:Math.max(o,c)+w*(.6+r),low:Math.max(assetLocalUnit(),Math.min(o,c)-w*(.6+(1-r))),close:c,volume:Math.round(800+r*3200)}}
async function fetchSyntheticCandles(){
 const endpoint="https://glffecggusetzklmyukv.functions.supabase.co/gotradex-synthetic-market";
 const u=endpoint+"?action=chart&symbol="+encodeURIComponent(normalizedSymbol())+"&display="+encodeURIComponent(pairLabel())+"&timeframe="+encodeURIComponent(tf)+"&limit=500";
 let rows=[];
 try{
  const res=await fetch(u,{cache:"no-store",headers:{"Accept":"application/json"}});
  const data=await res.json().catch(()=>null);
  if(res.ok&&data?.ok&&Array.isArray(data.candles))rows=data.candles;
 }catch(_){rows=[]}
 if(!rows.length){const step=Math.max(1,Number(TF[tf]||60)),end=Math.floor(Date.now()/1000/step)*step;for(let i=499;i>=0;i--)rows.push(localOtcCandle(end-i*step,step));}

 const out=[];
 let prev=null;
 for(const x of rows){
  const t=Number(x.time),o=Number(x.open),h=Number(x.high),l=Number(x.low),cl=Number(x.close),v=Number(x.volume||0);
  if(!Number.isFinite(t)||![o,h,l,cl].every(Number.isFinite))continue;
  const hi=Math.max(o,h,l,cl),lo=Math.min(o,h,l,cl);
  let open=o,close=cl;
  if(prev){
   // Guard against a synthetic feed jump: keep each new candle anchored to the prior close.
   const maxJump=Math.max(Math.abs(prev.close)*0.08,0.000001);
   if(Math.abs(open-prev.close)>maxJump)open=prev.close;
   if(Math.abs(close-open)>maxJump)close=open+Math.sign(close-open)*maxJump;
  }
  const high=Math.max(hi,open,close);
  const low=Math.min(lo,open,close);
  out.push({time:t,open,high,low,close,volume:v});
  prev=out[out.length-1];
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
 if(src&&!(usesExternalMarket()&&["5 Seconds","15 Seconds","30 Seconds"].includes(tf)))src.textContent=isOtcMode()?"OTC • GoTradeX Synthetic • LIVE 24/7":usesExternalMarket()?"LIVE • Twelve Data • "+assetType.toUpperCase()+" • "+pairLabel():"LIVE • Bybit "+String(market.category).toUpperCase()+" • "+market.symbol;
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
function displayCandles(){return candleMode==="heikin"?heikinCandles():candles;}
function syncCandleModeButton(){
 const b=$("gtxCandleMode");if(!b)return;
 const labels={candles:"CANDLES",heikin:"HEIKIN ASHI",bars:"BARS",line:"LINE",area:"AREA"};
 b.textContent=labels[candleMode]||"CANDLES";
 b.title="Chart style: "+(labels[candleMode]||"CANDLES")+" • tap to change";
}
function drawGoTradeXCanvas(){
 const host=$("gtxKenglyHost");if(!host)return;
 let c=host.querySelector("canvas.gtxVisibleCanvas");
 if(!c){c=document.createElement("canvas");c.className="gtxVisibleCanvas";host.appendChild(c)}
 const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),d=Math.min(2,window.devicePixelRatio||1);
 c.width=Math.round(w*d);c.height=Math.round(h*d);c.style.cssText="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:5";
 const ctx=c.getContext("2d");ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
 const data=displayCandles().slice(-70);
 ctx.fillStyle="#071827";ctx.fillRect(0,0,w,h);
 const pad={l:8,r:72,t:8,b:24},innerH=h-pad.t-pad.b,innerW=w-pad.l-pad.r;
 ctx.strokeStyle="rgba(120,160,200,.10)";ctx.lineWidth=1;
 for(let g=0;g<=4;g++){const yy=pad.t+g*innerH/4;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();}
 if(!data.length){
  ctx.fillStyle="#9db4cc";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText(isOtcMode()?"Connecting to GoTradeX OTC candles…":"Waiting for verified LIVE market data…",w/2,h/2);return;
 }
 let lo=Math.min(...data.map(x=>x.low)),hi=Math.max(...data.map(x=>x.high));if(!(hi>lo)){hi=lo+assetLocalUnit()}
 const span=hi-lo,y=p=>pad.t+(hi-p)/span*innerH,cw=innerW/data.length;
 for(let g=0;g<=4;g++){const val=hi-g*span/4,yy=pad.t+g*innerH/4;ctx.fillStyle="#9db4cc";ctx.font="10px sans-serif";ctx.textAlign="left";ctx.fillText(Number(val).toFixed(assetPricePrecision()),w-pad.r+6,yy+3);}
 data.forEach((x,i)=>{
  const xx=pad.l+i*cw+cw/2,up=x.close>=x.open,yo=y(x.open),yc=y(x.close),yh=y(x.high),yl=y(x.low);
  ctx.strokeStyle=up?"#19c765":"#e5394f";ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=2;
  if(candleMode==="line"||candleMode==="area"){
   if(i===0)ctx.beginPath();else ctx.lineTo(xx,yc);if(i===0)ctx.moveTo(xx,yc);
   if(i===data.length-1){
    if(candleMode==="area"){ctx.lineTo(xx,h-pad.b);ctx.lineTo(pad.l+cw/2,h-pad.b);ctx.closePath();ctx.globalAlpha=.18;ctx.fill();ctx.globalAlpha=1;ctx.beginPath();data.forEach((q,j)=>{const px=pad.l+j*cw+cw/2;const py=y(q.close);j?ctx.lineTo(px,py):ctx.moveTo(px,py)});}
   }
  }else if(candleMode==="bars"){
   ctx.beginPath();ctx.moveTo(xx,yh);ctx.lineTo(xx,yl);ctx.moveTo(xx-cw*.28,yo);ctx.lineTo(xx,yo);ctx.moveTo(xx,yc);ctx.lineTo(xx+cw*.28,yc);ctx.stroke();
  }else{
   ctx.beginPath();ctx.moveTo(xx,yh);ctx.lineTo(xx,yl);ctx.stroke();
   const top=Math.min(yo,yc),bh=Math.max(2,Math.abs(yo-yc)),bodyW=Math.max(3,Math.min(14,cw*.62));ctx.fillRect(xx-bodyW/2,top,bodyW,bh);
  }
 });
 if(candleMode==="line"||candleMode==="area"){ctx.strokeStyle="#42a5ff";ctx.lineWidth=2.5;ctx.beginPath();data.forEach((q,j)=>{const px=pad.l+j*cw+cw/2,py=y(q.close);j?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.stroke();}
 const last=data[data.length-1],lastY=y(last.close);
 ctx.strokeStyle="#f5c542";ctx.lineWidth=1;ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(pad.l,lastY);ctx.lineTo(w-pad.r,lastY);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle="#f5c542";ctx.font="10px sans-serif";ctx.textAlign="left";ctx.fillText(Number(last.close).toFixed(assetPricePrecision()),w-pad.r+6,lastY+3);
 const now=new Date(Number(last.time)*1000),clock=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"});
 ctx.fillStyle="#9db4cc";ctx.font="10px sans-serif";ctx.fillText((isOtcMode()?"OTC • GoTradeX Synthetic":"LIVE • Verified feed")+" • "+clock,8,h-8);
 ctx.textAlign="right";ctx.fillText(clock,w-pad.r,h-8);
}
function renderCandleSeries(){
 const data=displayCandles();
 if(series){
  series.setData(data);
  if(data.length){try{series.applyOptions({priceFormat:{type:"price",precision:assetPricePrecision(),minMove:assetPriceMinMove()}})}catch(_){}}
 }
 drawGoTradeXCanvas();
}
function toggleCandleMode(){
 const modes=["candles","heikin","bars","line","area"];
 candleMode=modes[(modes.indexOf(candleMode)+1)%modes.length];
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
 const sourceCandles=displayCandles(), closes=sourceCandles.map(x=>x.close), highs=sourceCandles.map(x=>x.high), lows=sourceCandles.map(x=>x.low);
 if(active.has("EMA / SMA")){addLine(ema(closes,9),"#f5c542",2,"EMA 9");addLine(ema(closes,21),"#5ea7ff",2,"EMA 21");addLine(sma(closes,50),"#b58cff",1,"SMA 50")}
 if(active.has("Alligator")){addLine(sma(closes,5),"#57d68d",2,"Jaw");addLine(sma(closes,8),"#f5c542",2,"Teeth");addLine(sma(closes,13),"#ff6b6b",2,"Lips")}
 if(active.has("Bollinger Bands")){const mid=sma(closes,20),up=[],dn=[];for(let i=19;i<closes.length;i++){const q=closes.slice(i-19,i+1),a=q.reduce((x,y)=>x+y,0)/20,sd=Math.sqrt(q.reduce((x,y)=>x+(y-a)**2,0)/20);up.push({time:sourceCandles[i].time,value:a+2*sd});dn.push({time:sourceCandles[i].time,value:a-2*sd})}addLine(mid,"#8fa8c4",1,"BB Middle");addLine(up,"#9c7cff",1,"BB Upper");addLine(dn,"#9c7cff",1,"BB Lower")}
 if(active.has("Fractals")){const hi=[],lo=[];for(let i=2;i<closes.length-2;i++){if(highs[i]>highs[i-1]&&highs[i]>highs[i-2]&&highs[i]>highs[i+1]&&highs[i]>highs[i+2])hi.push({time:sourceCandles[i].time,value:highs[i]});if(lows[i]<lows[i-1]&&lows[i]<lows[i-2]&&lows[i]<lows[i+1]&&lows[i]<lows[i+2])lo.push({time:sourceCandles[i].time,value:lows[i]})}addLine(hi,"#ff9f43",2,"Fractal High");addLine(lo,"#48dbfb",2,"Fractal Low")}
 if(active.has("Parabolic SAR")){const step=.02,max=.2,ps=[];let bull=true,ep=highs[0],sar=lows[0],af=step;for(let i=1;i<sourceCandles.length;i++){sar=sar+af*(ep-sar);if(bull){sar=Math.min(sar,lows[i-1],i>1?lows[i-2]:lows[i-1]);if(lows[i]<sar){bull=false;sar=ep;ep=lows[i];af=step}else if(highs[i]>ep){ep=highs[i];af=Math.min(max,af+step)}}else{sar=sar+af*(ep-sar);sar=Math.max(sar,highs[i-1],i>1?highs[i-2]:highs[i-1]);if(highs[i]>sar){bull=true;sar=ep;ep=highs[i];af=step}else if(lows[i]<ep){ep=lows[i];af=Math.min(max,af+step)}}ps.push({time:sourceCandles[i].time,value:sar})}addLine(ps,"#ffcc00",2,"Parabolic SAR")}
 if(active.has("Supertrend")){const atrN=10,mult=3,atr=[],st=[];for(let i=0;i<sourceCandles.length;i++){const tr=i===0?highs[i]-lows[i]:Math.max(highs[i]-lows[i],Math.abs(highs[i]-closes[i-1]),Math.abs(lows[i]-closes[i-1]));atr.push(tr)}for(let i=atrN-1;i<sourceCandles.length;i++){const a=atr.slice(i-atrN+1,i+1).reduce((x,y)=>x+y,0)/atrN;const mid=(highs[i]+lows[i])/2;st.push({time:sourceCandles[i].time,value:mid-(closes[i]>=mid?mult*a:-mult*a)})}addLine(st,"#00d4ff",2,"Supertrend")}
 if(active.has("Ichimoku Cloud")){const line=(period,offset)=>{const out=[];for(let i=period-1;i<sourceCandles.length;i++){let hi=-Infinity,lo=Infinity;for(let j=i-period+1;j<=i;j++){hi=Math.max(hi,highs[j]);lo=Math.min(lo,lows[j])}out.push({time:sourceCandles[i+offset]?.time??sourceCandles[i].time,value:(hi+lo)/2})}return out};addLine(line(9,0),"#ff6b6b",1,"Tenkan");addLine(line(26,0),"#5ea7ff",1,"Kijun")}
 if(active.has("RSI")){const n=14,out=[];for(let i=n;i<closes.length;i++){let gain=0,loss=0;for(let j=i-n+1;j<=i;j++){const d=closes[j]-closes[j-1];if(d>0)gain+=d;else loss-=d}const rs=loss?gain/loss:100;out.push({time:sourceCandles[i].time,value:100-100/(1+rs)})}addLine(out,"#ff8c42",2,"RSI 14")}
 if(active.has("MACD")){const e12=ema(closes,12),e26=ema(closes,26),mac=[];for(let i=0;i<e12.length;i++){const a=e12[i],b=e26[i];if(a&&b)mac.push({time:a.time,value:a.value-b.value})}addLine(mac,"#c084fc",2,"MACD 12/26")}
 if(active.has("Stochastic")){const out=[],n=14;for(let i=n-1;i<closes.length;i++){let hi=-Infinity,lo=Infinity;for(let j=i-n+1;j<=i;j++){hi=Math.max(hi,highs[j]);lo=Math.min(lo,lows[j])}out.push({time:sourceCandles[i].time,value:hi===lo?50:100*(closes[i]-lo)/(hi-lo)})}addLine(out,"#4ade80",2,"Stochastic %K")}
 if(active.has("ATR")){const out=[],n=14,tr=[];for(let i=0;i<sourceCandles.length;i++)tr.push(i?Math.max(highs[i]-lows[i],Math.abs(highs[i]-closes[i-1]),Math.abs(lows[i]-closes[i-1])):highs[i]-lows[i]);for(let i=n-1;i<tr.length;i++)out.push({time:sourceCandles[i].time,value:tr.slice(i-n+1,i+1).reduce((x,y)=>x+y,0)/n});addLine(out,"#f97316",2,"ATR 14")}
 if(active.has("Support & Resistance")){const s=[],res=[];for(let i=2;i<sourceCandles.length-2;i++){if(highs[i]>highs[i-1]&&highs[i]>highs[i+1])res.push({time:sourceCandles[i].time,value:highs[i]});if(lows[i]<lows[i-1]&&lows[i]<lows[i+1])s.push({time:sourceCandles[i].time,value:lows[i]})}addLine(s.slice(-8),"#38bdf8",1,"Support");addLine(res.slice(-8),"#fb7185",1,"Resistance")}
 if(active.has("Horizontal Line")){const last=closes.at(-1);if(Number.isFinite(last))addLine(sourceCandles.slice(-2).map(x=>({time:x.time,value:last})),"#ffffff",1,"Horizontal Line")}
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
 const host=$("gtxKenglyHost");if(!host||!window.LightweightCharts)throw Error("Lightweight Charts library unavailable");
 if(chart)try{chart.remove()}catch(_){}
 chart=LightweightCharts.createChart(host,{autoSize:true,layout:{background:{type:"solid",color:"#071827"},textColor:"#9db4cc",fontSize:10},grid:{vertLines:{color:"rgba(120,160,200,.09)"},horzLines:{color:"rgba(120,160,200,.09)"}},rightPriceScale:{visible:true,borderColor:"#2b527d",minimumWidth:78,ticksVisible:true,entireTextOnly:false,alignLabels:true,autoScale:true,scaleMargins:{top:.08,bottom:.12}},timeScale:{visible:true,borderColor:"#2b527d",timeVisible:true,secondsVisible:true,barSpacing:14,rightOffset:5,minBarSpacing:6,maxBarSpacing:45},crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{width:1,style:2,labelBackgroundColor:"#176fca"},horzLine:{width:1,style:2,labelBackgroundColor:"#176fca"}},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true}});
 series=chart.addSeries(LightweightCharts.CandlestickSeries,{priceScaleId:"right",upColor:"#19c765",downColor:"#e5394f",borderUpColor:"#19c765",borderDownColor:"#e5394f",wickUpColor:"#19c765",wickDownColor:"#e5394f",borderVisible:true,priceLineVisible:true,lastValueVisible:true,priceFormat:{type:"price",precision:assetPricePrecision(),minMove:assetPriceMinMove()}});
 renderCandleSeries();
 const last=candles.at(-1)?.close;
 if(Number.isFinite(last))priceLine=series.createPriceLine({price:last,color:"#f5c542",lineWidth:2,lineStyle:2,axisLabelVisible:true,title:"LIVE"});
 buildIndicators();showRecentChartWindow();root().classList.add("ready");observeSize();updateInfo();updateTradeOverlay();
}

function observeSize(){const host=$("gtxKenglyHost");if(!host)return;resizeObserver?.disconnect();resizeObserver=new ResizeObserver(()=>{if(chart&&host.clientWidth&&host.clientHeight)chart.resize(host.clientWidth,host.clientHeight);drawGoTradeXCanvas();updateTradeOverlay()});resizeObserver.observe(host)}
function updateInfo(){const p=$("gtxKenglyPair"),t=$("gtxKenglyTimeframe"),pr=$("gtxKenglyPrice"),ch=$("gtxKenglyChange");if(p)p.textContent=pairLabel();if(t)t.textContent=tf;const x=candles.at(-1);if(x){if(pr)pr.textContent=fmt(x.close);const prev=candles.length>1?Number(candles.at(-2).close):Number(x.open);const pct=Number.isFinite(prev)&&prev!==0?((Number(x.close)-prev)/prev)*100:0;if(ch){ch.textContent=(pct>=0?"+":"")+pct.toFixed(2)+"%";ch.classList.toggle("up",pct>=0);ch.classList.toggle("down",pct<0)}if(priceLine)priceLine.applyOptions({price:x.close});if(series){try{series.applyOptions({priceFormat:{type:"price",precision:assetPricePrecision(),minMove:assetPriceMinMove()}})}catch(_){} }}else{if(pr)pr.textContent="—";if(ch)ch.textContent="—"}updateTradeOverlay()}

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
      if(src){src.classList.remove("stale");src.textContent="OTC • GoTradeX Synthetic • LOCAL ENGINE";}
    }
   }catch(e){
    updateLivePrice(localOtcPrice(Date.now()/1000),Date.now()/1000);
    if(src){src.classList.remove("stale");src.textContent="OTC • GoTradeX Synthetic • LOCAL ENGINE";}
   }
  };
  if(src)src.textContent="OTC • GoTradeX Synthetic • CONNECTING…";
  await tick();
  poll=setInterval(tick,1000);
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
   ws.send(JSON.stringify({op:"subscribe",args:["tickers."+market.symbol]}));
   const src=$("gtxKenglySource");if(src)src.textContent="LIVE • Bybit WebSocket";
  };
  ws.onmessage=e=>{try{
   if(requestId!==assetRequestId||thisWs!==ws||mySocket!==socketGeneration)return;
   const m=JSON.parse(e.data),p=Number(m?.data?.lastPrice),t=Number(m?.ts||Date.now());
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
 try{
  if(!(await loadCandles(requestId)))return;
  if(requestId!==assetRequestId)return;

  if(!chart)makeChart();else{renderCandleSeries();buildIndicators();showRecentChartWindow();updateInfo()}
  connectSocket(requestId).catch(()=>{});
 }catch(e){
  if(!chart&&window.LightweightCharts){try{makeChart()}catch(_){}}
  throw e;
 }
}

function showLiveError(e){
 const box=$("gtxKenglyError"),src=$("gtxKenglySource");
 const msg=String(e?.message||"Market data is not available");
 if(src)src.textContent=isOtcMode()?"OTC SYNTHETIC FEED ERROR • Retrying…":"LIVE FEED ERROR • Retrying…";
 if(box){box.hidden=false;box.innerHTML=(isOtcMode()?"OTC SYNTHETIC MARKET UNAVAILABLE":"LIVE CANDLE FEED UNAVAILABLE")+"<br><span style='font-weight:500;color:#7891aa'>"+msg.replace(/[<>&"]/g,m=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[m]))+"</span><br><span style='font-weight:500;color:#7891aa'>"+(isOtcMode()?"Retrying GoTradeX synthetic market…":"Retrying live market data…")+"</span>"}
}
async function retryLive(requestId=assetRequestId){if(!started||requestId!==assetRequestId)return;try{await loadLibrary();await refresh(requestId)}catch(e){if(requestId!==assetRequestId)return;showLiveError(e);reconnectTimer=setTimeout(()=>retryLive(requestId),3000)}}

async function boot(){
 if(started||!root())return;
 // Start every chart from the currently selected asset/mode.
 assetRequestId++;
 started=true;
 assetDisplay=String(store.get("gotradex_asset_display","")).trim();
 assetType=inferAssetType(assetDisplay,assetType,symbol);
 const storedDisplay=assetDisplay||pairLabel();
 if(storedDisplay)store.set("gotradex_asset_display",storedDisplay);
 store.set("gotradex_asset_type",assetType);
 injectCss();rebuildDom();bindExpiry();
 try{await loadLibrary();bindControls();await refresh();clearInterval(poll);poll=null}
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
 store.set("gotradex_asset_display",assetDisplay||pairLabel());
 resolvedMarket=null;resolvedKey="";
 const pairEl=$("pairName");if(pairEl)pairEl.textContent=pairLabel();const topPair=$("gtxKenglyPair");if(topPair)topPair.textContent=pairLabel();
 // Clear the previous asset immediately. Never leave old candles visible while the new feed loads.
 candles=[];
 if(series){try{series.setData([])}catch(_){} }
 clearIndicators();
 try{priceLine?.applyOptions({price:NaN})}catch(_){}
 const errBox=$("gtxKenglyError");if(errBox)errBox.hidden=true;
 const source=$("gtxKenglySource");if(source)source.textContent=isOtcMode()?"OTC • GoTradeX Synthetic • CONNECTING…":"Connecting to "+pairLabel()+"…";
 updateInfo();refresh(requestId).catch(e=>{if(requestId===assetRequestId)showLiveError(e)})
},
 setMarketMode:mode=>{
  marketMode=String(mode).toUpperCase()==="OTC"?"OTC":"LIVE";
  store.set("gotradex_market_mode",marketMode);
  resolvedMarket=null;resolvedKey="";
  clearTimeout(reconnectTimer);reconnectTimer=null;closeSocket();
  const src=$("gtxKenglySource");if(src)src.textContent=marketMode==="OTC"?"OTC • GoTradeX Synthetic • CONNECTING…":"Connecting to "+pairLabel()+"…";
  refresh().catch(showLiveError);
 },
 setBroker:()=>{
 liveBroker="BYBIT";
 resolvedMarket=null;resolvedKey="";
 store.set("gotradex_chart_broker","BYBIT");
 refresh().catch(showLiveError);
},
 setTimeframe:x=>{if(TF[x]){tf=x;store.set("gotradex_chart_timeframe",tf);refresh().catch(showLiveError)}},
 toggleIndicator,
 startTrade
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else setTimeout(boot,0);
})();