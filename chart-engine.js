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
let candles=[],symbol=String(store.get("gotradex_chart_symbol","BTCUSDT")).toUpperCase().replace(/[^A-Z0-9_]/g,""),assetType=String(store.get("gotradex_asset_type","crypto")).toLowerCase(),assetDisplay=String(store.get("gotradex_asset_display","")).trim(),tf=store.get("gotradex_chart_timeframe","1 Minute");
let active=new Set(),started=false,ws=null,tdWs=null,reconnectTimer=null,poll=null,indicatorSeries=[],liveBroker="BYBIT";
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
function usesExternalMarket(){
 return ["forex","stocks","indices","commodities","metals"].includes(String(assetType||"").toLowerCase());
}
function selectedFeed(){
 const feeds=window.GoTradeXMarketFeeds;
 if(!feeds||typeof feeds.resolve!=="function")throw Error("Verified market-feed registry is not loaded.");
 const f=feeds.resolve();
 if(!f?.available)throw Error(f?.reason||("No verified live feed is available for "+pairLabel()+"."));
 return f;
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
 const f=selectedFeed();
 const key=f.provider+":"+String(f.type||assetType)+":"+String(f.symbol||f.label||pairLabel());
 if(!force&&resolvedMarket&&resolvedKey===key)return resolvedMarket;
 if(f.provider==="BYBIT")resolvedMarket={broker:"BYBIT",symbol:f.symbol,category:f.category||"spot",assetType:f.type||"crypto"};
 else if(f.provider==="TWELVE_DATA")resolvedMarket={broker:"TWELVE_DATA",symbol:f.symbol,assetType:f.type||assetType,label:f.label||pairLabel()};
 else throw Error("No verified provider is configured for "+pairLabel()+".");
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
function displayBroker(){return usesExternalMarket()?"Twelve Data":"Bybit"}
function fmt(v){v=Number(v);if(!Number.isFinite(v))return"—";return v>=1000?v.toFixed(2):v>=10?v.toFixed(4):v>=1?v.toFixed(5):v.toFixed(6)}

function injectCss(){
 if($("gtx-kengly-v6-css"))return;
 const s=document.createElement("style");s.id="gtx-kengly-v6-css";
 s.textContent=`
.gtxKengly{position:relative!important;display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#071827!important;color:#dbe9f7!important}
.gtxKenglyHeader{flex:0 0 auto!important;display:flex!important;align-items:center!important;gap:7px!important;width:100%!important;box-sizing:border-box!important;padding:3px 7px!important;background:#071827!important;z-index:20!important;white-space:nowrap!important;overflow:hidden!important}
.gtxKenglyBadge{font:800 9px/16px sans-serif!important;padding:0 6px!important;border-radius:9px!important;background:#10304a!important;color:#9fc8e8!important}
.gtxKenglyBadge.live{background:#123c2b!important;color:#5ee39a!important}
.gtxKenglyPair{font:900 11px/16px sans-serif!important;color:#fff!important}
.gtxKenglyTf{font:700 9px/16px sans-serif!important;color:#9db4cc!important}
.gtxKenglySource{margin-left:auto!important;font:800 8px/16px sans-serif!important;color:#5ee39a!important}
.gtxKenglySource.stale{color:#ff9aaa!important}
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
 <span class="gtxKenglyBadge live">● LIVE</span><strong class="gtxKenglyPair" id="gtxKenglyPair">${pairLabel()}</strong>
<span class="gtxKenglySource" id="gtxKenglySource">Connecting to live feed…</span>
 </div><div class="gtxKenglyStage"><div class="gtxKenglyHost" id="gtxKenglyHost"></div><div class="gtxKenglyOverlay" id="gtxKenglyOverlay"></div><div class="gtxKenglyError" id="gtxKenglyError" hidden></div></div>`;
 return true;
}

function normalize(rows){return(Array.isArray(rows)?rows:[]).map(k=>({time:Math.floor(Number(k[0])/1000),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]||0)})).filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time)}
function dedupe(rows){const m=new Map();rows.forEach(x=>m.set(x.time,x));return[...m.values()].sort((a,b)=>a.time-b.time)}
async function fetchBybitCandles(){
 const feeds=window.GoTradeXMarketFeeds;
 if(!feeds||typeof feeds.bybitHistory!=="function")throw Error("Verified Bybit feed adapter is not loaded.");
 const market=await resolveMarket();
 const rows=await feeds.bybitHistory(market.symbol,Number(TF[tf]||60));
 if(!rows.length)throw Error("No verified Bybit candles received for "+pairLabel()+".");
 return rows.map(x=>({time:Math.floor(Number(x.t)/1000),open:Number(x.o),high:Number(x.h),low:Number(x.l),close:Number(x.c),volume:Number(x.v||0)}))
  .filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite));
}
async function fetchTwelveDataCandles(){
 if(["5 Seconds","15 Seconds","30 Seconds"].includes(tf))return [];
 const feeds=window.GoTradeXMarketFeeds;
 if(!feeds||typeof feeds.twelveHistory!=="function")throw Error("Verified Twelve Data feed adapter is not loaded.");
 const market=await resolveMarket();
 const rows=await feeds.twelveHistory(market.symbol,Number(TF[tf]||60));
 if(!rows.length)throw Error("No verified "+market.symbol+" candles were returned for "+pairLabel()+".");
 return rows.map(x=>({time:Math.floor(Number(x.t)/1000),open:Number(x.o),high:Number(x.h),low:Number(x.l),close:Number(x.c),volume:Number(x.v||0)}))
  .filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite));
}
async function fetchCandles(){return usesExternalMarket()?fetchTwelveDataCandles():fetchBybitCandles();}

async function loadCandles(){
 const market=await resolveMarket();
 candles=dedupe(await fetchCandles()).slice(-500);
 if(usesExternalMarket()&&["5 Seconds","15 Seconds","30 Seconds"].includes(tf)){const src0=$("gtxKenglySource");if(src0)src0.textContent="LIVE TICKS • building "+tf+" candles • "+pairLabel();}
 const e=$("gtxKenglyError"),src=$("gtxKenglySource");
 if(e)e.hidden=true;
 if(src&&!(usesExternalMarket()&&["5 Seconds","15 Seconds","30 Seconds"].includes(tf)))src.textContent=usesExternalMarket()?"LIVE • Twelve Data • "+assetType.toUpperCase()+" • "+pairLabel():"LIVE • Bybit "+String(market.category).toUpperCase()+" • "+market.symbol;
}

function sma(v,p){const o=[];for(let i=p-1;i<v.length;i++)o.push({time:candles[i].time,value:v.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p});return o}
function ema(v,p){const o=[],k=2/(p+1);let e=null;v.forEach((x,i)=>{e=e==null?x:x*k+e*(1-k);if(i>=p-1)o.push({time:candles[i].time,value:e})});return o}
function addLine(data,color,width=1,title=""){if(!chart)return null;const s=chart.addSeries(LightweightCharts.LineSeries,{color,lineWidth:width,priceLineVisible:false,lastValueVisible:false,title,crosshairMarkerVisible:false});s.setData(data);indicatorSeries.push(s);return s}
function clearIndicators(){indicatorSeries.forEach(s=>{try{chart.removeSeries(s)}catch(_){}});indicatorSeries=[]}
function buildIndicators(){
 clearIndicators();if(!chart||!candles.length)return;
 const c=candles.map(x=>x.close);
 if(active.has("EMA / SMA")){addLine(ema(c,9),"#f5c542",2,"EMA 9");addLine(ema(c,21),"#5ea7ff",2,"EMA 21");addLine(sma(c,50),"#b58cff",1,"SMA 50")}
 if(active.has("Alligator")){addLine(sma(c,5),"#57d68d",2,"Jaw");addLine(sma(c,8),"#f5c542",2,"Teeth");addLine(sma(c,13),"#ff6b6b",2,"Lips")}
 if(active.has("Bollinger Bands")){const m=sma(c,20),u=[],d=[];for(let i=19;i<c.length;i++){const q=c.slice(i-19,i+1),a=q.reduce((x,y)=>x+y,0)/20,sd=Math.sqrt(q.reduce((x,y)=>x+(y-a)**2,0)/20);u.push({time:candles[i].time,value:a+2*sd});d.push({time:candles[i].time,value:a-2*sd})}addLine(m,"#8fa8c4");addLine(u,"#9c7cff");addLine(d,"#9c7cff")}
 if(active.has("Fractals")){const h=candles.map(x=>x.high),l=candles.map(x=>x.low),hi=[],lo=[];for(let i=2;i<c.length-2;i++){if(h[i]>h[i-1]&&h[i]>h[i-2]&&h[i]>h[i+1]&&h[i]>h[i+2])hi.push({time:candles[i].time,value:h[i]});if(l[i]<l[i-1]&&l[i]<l[i-2]&&l[i]<l[i+1]&&l[i]<l[i+2])lo.push({time:candles[i].time,value:l[i]})}addLine(hi,"#ff9f43",2,"Fractal High");addLine(lo,"#48dbfb",2,"Fractal Low")}
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
  const count=Math.min(80,candles.length);
  chart.timeScale().setVisibleLogicalRange({from:Math.max(0,candles.length-count),to:candles.length+4});
  chart.priceScale("right").applyOptions({visible:true,autoScale:true,minimumWidth:78,ticksVisible:true,alignLabels:true});
 }catch(_){}
}
function makeChart(){
 const host=$("gtxKenglyHost");if(!host||!window.LightweightCharts)throw Error("Lightweight Charts library unavailable");
 if(chart)try{chart.remove()}catch(_){}
 chart=LightweightCharts.createChart(host,{autoSize:true,layout:{background:{type:"solid",color:"#071827"},textColor:"#9db4cc",fontSize:10},grid:{vertLines:{color:"rgba(120,160,200,.09)"},horzLines:{color:"rgba(120,160,200,.09)"}},rightPriceScale:{visible:true,borderColor:"#2b527d",minimumWidth:78,ticksVisible:true,entireTextOnly:false,alignLabels:true,autoScale:true,scaleMargins:{top:.08,bottom:.12}},timeScale:{visible:true,borderColor:"#2b527d",timeVisible:true,secondsVisible:true,barSpacing:14,rightOffset:5,minBarSpacing:6,maxBarSpacing:45},crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{width:1,style:2,labelBackgroundColor:"#176fca"},horzLine:{width:1,style:2,labelBackgroundColor:"#176fca"}},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true}});
 series=chart.addSeries(LightweightCharts.CandlestickSeries,{priceScaleId:"right",upColor:"#19c765",downColor:"#e5394f",borderUpColor:"#19c765",borderDownColor:"#e5394f",wickUpColor:"#19c765",wickDownColor:"#e5394f",borderVisible:true,priceLineVisible:true,lastValueVisible:true,priceFormat:{type:"price",precision:assetPricePrecision(),minMove:assetPriceMinMove()}});
 series.setData(candles);
 const last=candles.at(-1)?.close;
 if(Number.isFinite(last))priceLine=series.createPriceLine({price:last,color:"#f5c542",lineWidth:2,lineStyle:2,axisLabelVisible:true,title:"LIVE"});
 buildIndicators();showRecentChartWindow();root().classList.add("ready");observeSize();updateInfo();updateTradeOverlay();
}

function observeSize(){const host=$("gtxKenglyHost");if(!host)return;resizeObserver?.disconnect();resizeObserver=new ResizeObserver(()=>{if(chart&&host.clientWidth&&host.clientHeight)chart.resize(host.clientWidth,host.clientHeight);updateTradeOverlay()});resizeObserver.observe(host)}
function updateInfo(){const p=$("gtxKenglyPair"),t=$("gtxKenglyTimeframe");if(p)p.textContent=pairLabel();if(t)t.textContent=tf;const x=candles.at(-1);if(x&&priceLine)priceLine.applyOptions({price:x.close});if(series&&x){try{series.applyOptions({priceFormat:{type:"price",precision:assetPricePrecision(),minMove:assetPriceMinMove()}})}catch(_){}}updateTradeOverlay()}

function closeSocket(){try{ws?.close()}catch(_){}try{tdWs?.close()}catch(_){}ws=null;tdWs=null;clearTimeout(reconnectTimer);reconnectTimer=null;clearInterval(poll);poll=null;clearInterval(liveFreshTimer);liveFreshTimer=null;lastLiveUpdateAt=0}
async function connectSocket(requestId=assetRequestId){
 const src=$("gtxKenglySource"),feeds=window.GoTradeXMarketFeeds;
 if(!feeds)throw Error("Verified market-feed registry is not loaded.");
 if(usesExternalMarket()){
  closeSocket();
  const request=requestId,market=await resolveMarket();
  if(typeof feeds.twelveSocket!=="function")throw Error("Verified Twelve Data live adapter is not loaded.");
  tdWs=await feeds.twelveSocket(market.symbol,p=>{
   if(request===assetRequestId)updateLivePrice(Number(p.price),Number(p.time||Date.now()));
  },(status,ok)=>{
   if(request===assetRequestId&&src){src.classList.toggle("stale",!ok);src.textContent=String(status||("LIVE • "+market.symbol));}
  });
  return;
 }
 const mySocket=++socketGeneration;
 closeSocket();
 const market=await resolveMarket();
 if(requestId!==assetRequestId||mySocket!==socketGeneration)return;
 try{
  const url=market.category==="spot"?BYBIT_WS_SPOT:BYBIT_WS_LINEAR;
  ws=new WebSocket(url);const thisWs=ws;
  ws.onopen=()=>{
   if(requestId!==assetRequestId||thisWs!==ws||mySocket!==socketGeneration){try{thisWs.close()}catch(_){};return}
   ws.send(JSON.stringify({op:"subscribe",args:["tickers."+market.symbol]}));
   if(src){src.classList.remove("stale");src.textContent="LIVE • Bybit • "+market.symbol;}
  };
  ws.onmessage=e=>{try{
   if(requestId!==assetRequestId||thisWs!==ws||mySocket!==socketGeneration)return;
   const m=JSON.parse(e.data),p=Number(m?.data?.lastPrice),t=Number(m?.ts||Date.now());
   if(Number.isFinite(p))updateLivePrice(p,t/1000);
  }catch(_){}};
  ws.onerror=()=>{try{thisWs.close()}catch(_){}};
  ws.onclose=()=>{
   if(thisWs!==ws||mySocket!==socketGeneration||requestId!==assetRequestId)return;
   ws=null;if(started)reconnectTimer=setTimeout(()=>connectSocket(requestId).catch(()=>{}),3000);
  };
 }catch(e){
  if(src)src.textContent="LIVE FEED WAITING • "+(e?.message||"Connecting…");
  if(started)reconnectTimer=setTimeout(()=>connectSocket(requestId).catch(()=>{}),3000);
 }
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
  if(series)series.setData(candles);
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
  const feeds=window.GoTradeXMarketFeeds;if(!feeds)return;
  const market=await resolveMarket();
  if(market.broker==="BYBIT"){
   if(!["5 Seconds","15 Seconds","30 Seconds"].includes(tf))return;
   const r=await fetch("https://api.bybit.com/v5/market/tickers?category="+encodeURIComponent(market.category)+"&symbol="+encodeURIComponent(market.symbol),{cache:"no-store"});
   const d=await r.json(),p=Number(d?.result?.list?.[0]?.lastPrice);
   if(Number.isFinite(p))updateLivePrice(p);
  }else if(typeof feeds.twelvePrice==="function"){
   const p=await feeds.twelvePrice(market.symbol);
   if(Number.isFinite(Number(p?.price)))updateLivePrice(Number(p.price),Number(p.time||Date.now()));
  }
 }catch(_){}
}

function loadLibrary(){return new Promise((resolve,reject)=>{if(window.LightweightCharts)return resolve();const old=document.querySelector('script[data-gtx-kengly-lib="1"]');if(old){old.addEventListener("load",resolve,{once:true});old.addEventListener("error",reject,{once:true});return}const s=document.createElement("script");s.src="https://unpkg.com/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js";s.dataset.gtxKenglyLib="1";s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}

function renderIndicators(){const g=$("gtxKenglyGrid");if(!g)return;g.innerHTML="";INDS.forEach(n=>{const b=document.createElement("button");b.textContent=n;b.className=active.has(n)?"on":"";b.onclick=()=>{active.has(n)?active.delete(n):active.add(n);renderIndicators();buildIndicators()};g.appendChild(b)})}
function bindControls(){renderIndicators();["buy","sell"].forEach(id=>{const b=$(id);if(!b||b.dataset.gtxTradeBound==="1")return;b.dataset.gtxTradeBound="1";b.addEventListener("click",()=>startTrade(id==="buy"?"BUY":"SELL"),{capture:false})})}

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
  await loadCandles();
  if(requestId!==assetRequestId)return;

  if(!chart)makeChart();else{series?.setData(candles);buildIndicators();showRecentChartWindow();updateInfo()}
  connectSocket(requestId).catch(()=>{});
 }catch(e){
  if(!chart&&window.LightweightCharts){try{makeChart()}catch(_){}}
  throw e;
 }
}

function showLiveError(e){
 const box=$("gtxKenglyError"),src=$("gtxKenglySource");
 const msg=String(e?.message||"Market data is not available");
 if(src)src.textContent="LIVE FEED ERROR • Retrying…";
 if(box){box.hidden=false;box.innerHTML="LIVE CANDLE FEED UNAVAILABLE<br><span style='font-weight:500;color:#7891aa'>"+msg.replace(/[<>&"]/g,m=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[m]))+"</span><br><span style='font-weight:500;color:#7891aa'>Retrying live market data…</span>"}
}
async function retryLive(requestId=assetRequestId){if(!started||requestId!==assetRequestId)return;try{await loadLibrary();await refresh(requestId)}catch(e){if(requestId!==assetRequestId)return;showLiveError(e);reconnectTimer=setTimeout(()=>retryLive(requestId),3000)}}

async function boot(){
 if(started||!root())return;
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
 const source=$("gtxKenglySource");if(source)source.textContent="Connecting to "+pairLabel()+"…";
 updateInfo();refresh(requestId).catch(e=>{if(requestId===assetRequestId)showLiveError(e)})
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
window.addEventListener("gotradex:asset-changed",e=>{
 const d=e?.detail||{};
 if(String(d.mode||"LIVE").toUpperCase()!=="LIVE")return;
 if(d.label)window.GoTradeXChartEngine?.setSymbol?.(String(d.label).replace(/\s+OTC$/i,"").replace(/[^A-Za-z0-9]/g,"").toUpperCase(),d.type,d.label);
});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else setTimeout(boot,0);
})();