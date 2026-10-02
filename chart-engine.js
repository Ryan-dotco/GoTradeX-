/* GoTradeX Candlestick Engine V6
   LIVE MARKET CHART — Deriv + Bybit Linear
   Keeps existing GoTradeX controls through GoTradeXChartEngine.
*/
(()=>{"use strict";

const TF={"5 Seconds":5,"15 Seconds":15,"30 Seconds":30,"1 Minute":60,"5 Minutes":300,"15 Minutes":900,"30 Minutes":1800,"1 Hour":3600,"4 Hours":14400,"12 Hours":43200,"1 Day":86400,"1 Week":604800,"1 Month":2592000,"6 Months":15552000,"1 Year":31536000};
const API={"1 Minute":"1","5 Minutes":"5","15 Minutes":"15","30 Minutes":"30","1 Hour":"60","4 Hours":"240","12 Hours":"720","1 Day":"D","1 Week":"W","1 Month":"M"};
const store={get(k,d){try{return localStorage.getItem(k)||d}catch(_){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(_){}}};
const BROKER=store.get("gotradex_chart_broker","AUTO");
const DERIV_WS="wss://api.derivws.com/trading/v1/options/ws/public";
const BYBIT_WS="wss://stream.bybit.com/v5/public/linear";
const INDS=["Alligator","Fractals","EMA / SMA","Bollinger Bands","Parabolic SAR","Supertrend","Ichimoku Cloud","RSI","MACD","Stochastic","ATR","Support & Resistance","Horizontal Line"];
const $=id=>document.getElementById(id);

let chart=null,series=null,priceLine=null,tradeLine=null,resizeObserver=null;
let assetRequestId=0,socketGeneration=0;
let candles=[],symbol=store.get("gotradex_chart_symbol","EURUSD"),tf=store.get("gotradex_chart_timeframe","1 Minute");
let active=new Set(),started=false,ws=null,reconnectTimer=null,poll=null,indicatorSeries=[],liveBroker=BROKER;
let resolvedMarket=null,resolvedKey="";
let trade=null,tradeOverlay=null,signalExpiryAt=0,expiryTimer=null;

function root(){return document.querySelector(".chart")}
function normalizedSymbol(){return String(symbol||"EURUSD").toUpperCase().replace(/[^A-Z0-9_]/g,"")}
function isDerivForexSymbol(){return !!derivSymbol()}
function pairSymbol(){
 const s=normalizedSymbol();
 if(isDerivForexSymbol())return s;
 if(s.endsWith("USDT"))return s;
 if(s.endsWith("USD"))return s.slice(0,-3)+"USDT";
 return s+"USDT";
}
function pairLabel(){
 const s=normalizedSymbol();
 if(isDerivForexSymbol()){
  const clean=s.replace(/^FRX/,"");
  return clean.length===6?clean.slice(0,3)+"/"+clean.slice(3):clean;
 }
 if(s.endsWith("USDT"))return s.slice(0,-4)+"/USDT";
 return s;
}
async function wsRequest(payload,timeoutMs=10000){
 const endpoint=DERIV_WS;
 try{
  const w=new WebSocket(endpoint);
  return await new Promise((resolve,reject)=>{
   let done=false;
   const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(timer);try{w.close()}catch(_){}fn(v)};
   const timer=setTimeout(()=>finish(reject,Error("Market symbol lookup timed out")),timeoutMs);
   w.onopen=()=>{try{w.send(JSON.stringify(payload))}catch(e){finish(reject,e)}};
   w.onerror=()=>finish(reject,Error("Market symbol lookup unavailable"));
   w.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.error)finish(reject,Error(m.error.message||"Market symbol lookup failed"));else finish(resolve,m)}catch(err){finish(reject,err)}};
  });
 }catch(e){throw e}
}
async function resolveDerivSymbol(){
 const clean=normalizedSymbol().replace(/^FRX/,"").replace(/[^A-Z0-9]/g,"");
 // Major Deriv forex symbols have a deterministic public symbol name.
 // Resolve these directly so a temporary active_symbols lookup outage cannot
 // prevent the live EUR/USD, GBP/JPY and other forex charts from loading.
 const fx=["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","EURGBP","EURJPY","GBPJPY","AUDJPY","EURCHF","USDZAR","EURZAR","GBPZAR","XAUUSD","XAGUSD"];
 if(fx.includes(clean))return "frx"+clean;
 const raw=normalizedSymbol();
 if(/^FRX[A-Z]{6}$/.test(raw))return raw.toLowerCase();
 if(/^R_(10|25|50|75|100)$/.test(raw)||/^1HZ[0-9A-Z]+$/.test(raw)||/^BOOM|^CRASH/.test(raw))return raw;
 const wantedClean=clean;
 const m=await wsRequest({active_symbols:"brief"});
 const list=Array.isArray(m.active_symbols)?m.active_symbols:[];
 const found=list.find(x=>{
  const rawSym=String(x.symbol||x.underlying_symbol||"").toUpperCase();
  const sym=rawSym.replace(/^FRX/,"").replace(/[^A-Z0-9]/g,"");
  const rawName=String(x.display_name||x.underlying_symbol_name||"").toUpperCase();
  const name=rawName.replace(/[^A-Z0-9]/g,"");
  return sym===wantedClean||name===wantedClean;
 });
 if(!found)throw Error("Deriv market not available for "+pairLabel());
 return String(found.symbol||found.underlying_symbol);
}
async function resolveBybitSymbol(){
 const wanted=normalizedSymbol().replace(/[^A-Z0-9]/g,"").toUpperCase();
 let base=wanted,quote="USD";
 if(wanted.endsWith("USDT")){base=wanted.slice(0,-4);quote="USDT"}
 else if(wanted.endsWith("USD")){base=wanted.slice(0,-3);quote="USD"}
 const candidates=[];
 if(quote==="USD")candidates.push(base+"USDT",base+"USD");
 else candidates.push(wanted);
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
 const key=chooseBroker()+":"+normalizedSymbol();
 if(!force&&resolvedMarket&&resolvedKey===key)return resolvedMarket;
 const broker=chooseBroker();
 if(broker==="DERIV"){
  const sym=await resolveDerivSymbol();
  resolvedMarket={broker,symbol:sym};
 }else{
  resolvedMarket={broker,...await resolveBybitSymbol()};
 }
 resolvedKey=key;
 return resolvedMarket;
}

function derivSymbol(){
 const raw=String(symbol||"").toUpperCase().replace("/","");
 if(/^FRX[A-Z]{6}$/.test(raw))return raw;
 if(/^R_(10|25|50|75|100)$/.test(raw))return raw;
 if(/^1HZ[0-9A-Z]+$/.test(raw))return raw;
 if(/^BOOM|^CRASH/.test(raw))return raw;
 const clean=raw.replace(/^OTC_/,"").replace(/[^A-Z0-9]/g,"");
 const fx=["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","EURGBP","EURJPY","GBPJPY","AUDJPY","XAUUSD","XAGUSD"];
 if(fx.includes(clean))return "frx"+clean;
 return null;
}
function isRealAccount(){return document.body?.dataset?.accountMode==="REAL"}
function derivAuthUrl(){
 const api=window.GoTradeXDeriv;
 if(!api||typeof api.getAuthenticatedMarketWebSocket!=="function")throw Error("Deriv LIVE authentication is not ready. Connect Deriv first.");
 return api.getAuthenticatedMarketWebSocket();
}
function chooseBroker(){
 // Account mode does not choose the market-data broker.
 // AUTO prefers Deriv for symbols that are explicitly known as Deriv markets,
 // otherwise Bybit is used. Symbol resolution then verifies actual availability.
 const d=derivSymbol();
 if(liveBroker==="DERIV"&&d)return "DERIV";
 if(liveBroker==="BYBIT")return "BYBIT";
 return d?"DERIV":"BYBIT";
}
function displayBroker(){
 const b=chooseBroker();
 return b==="DERIV"?"Deriv":"Bybit Linear";
}
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
.gtxKenglyStage{position:relative!important;flex:1 1 auto!important;min-height:150px!important;width:100%!important;overflow:hidden!important}
.gtxKenglyHost{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}
.gtxKenglyHost canvas{touch-action:none!important}
.gtxKenglyOverlay{position:absolute!important;inset:0!important;pointer-events:none!important;z-index:12!important;overflow:hidden!important}
.gtxTradeFlag{position:absolute!important;transform:translate(-50%,-100%)!important;padding:3px 6px!important;border-radius:4px!important;background:#0d2438!important;border:1px solid #3d7198!important;color:#fff!important;font:900 8px/11px sans-serif!important;box-shadow:0 2px 8px #0008!important;animation:gtxFlagPulse 1s ease-in-out infinite!important;white-space:nowrap!important}
.gtxTradeFlag.buy{border-color:#36c275!important;color:#72efaa!important}
.gtxTradeFlag.sell{border-color:#e05b70!important;color:#ff9aaa!important}
.gtxTradeFlag.end{animation:none!important;opacity:.9!important}
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
 r.className="chart gtxKengly";
 r.innerHTML=`<div class="gtxKenglyHeader">
 <span class="gtxKenglyBadge live">● LIVE</span><strong class="gtxKenglyPair" id="gtxKenglyPair">${pairLabel()}</strong>
<span class="gtxKenglySource" id="gtxKenglySource">Connecting to live feed…</span>
 </div><div class="gtxKenglyStage"><div class="gtxKenglyHost" id="gtxKenglyHost"></div><div class="gtxKenglyOverlay" id="gtxKenglyOverlay"></div><div class="gtxKenglyError" id="gtxKenglyError" hidden></div></div>`;
 return true;
}

function normalize(rows){return(Array.isArray(rows)?rows:[]).map(k=>({time:Math.floor(Number(k[0])/1000),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]||0)})).filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time)}
function dedupe(rows){const m=new Map();rows.forEach(x=>m.set(x.time,x));return[...m.values()].sort((a,b)=>a.time-b.time)}
async function fetchDerivCandles(){
 const market=await resolveMarket();
 const sym=market.symbol;if(!sym)throw Error("This asset is not available on Deriv.");
 const step=TF[tf]||60;
 const nativeGranularities=[60,120,180,300,600,900,1800,3600,7200,14400,28800,86400];
 const style=step<60?"ticks":"candles";
 const requestGranularity=nativeGranularities.includes(step)?step:86400;
 const needsAggregation=style==="candles"&&requestGranularity!==step;
 const w=new WebSocket(DERIV_WS);
 const rows=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{try{w.close()}catch(_){}reject(Error("Deriv history timeout"))},12000);
  w.onopen=()=>w.send(JSON.stringify(style==="ticks"
   ?{ticks_history:sym,count:5000,end:"latest",style:"ticks",req_id:101}
   :{ticks_history:sym,count:500,end:"latest",style:"candles",granularity:requestGranularity,req_id:101}));
  w.onerror=()=>{clearTimeout(timer);reject(Error("Deriv market feed unavailable"))};
  w.onmessage=e=>{try{
    const m=JSON.parse(e.data);
    if(m.error){clearTimeout(timer);try{w.close()}catch(_){}reject(Error(m.error.message||"Deriv error"));return}
    if(m.msg_type!=="history"&&m.msg_type!=="candles")return;
    clearTimeout(timer);try{w.close()}catch(_){}
    if(style==="candles"){
      const base=(m.candles||[]).map(k=>({time:Number(k.epoch),open:Number(k.open),high:Number(k.high),low:Number(k.low),close:Number(k.close),volume:0}))
        .filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite));
      if(!needsAggregation){resolve(base);return;}
      const map=new Map(),out=[];
      for(const x of base){
        const bucket=Math.floor(x.time/step)*step;
        let y=map.get(bucket);
        if(!y){y={time:bucket,open:x.open,high:x.high,low:x.low,close:x.close,volume:0};map.set(bucket,y);out.push(y)}
        else{y.high=Math.max(y.high,x.high);y.low=Math.min(y.low,x.low);y.close=x.close}
      }
      resolve(out);
      return;
    }
    const times=m.history?.times||[],prices=m.history?.prices||[],out=[],map=new Map();
    for(let i=0;i<Math.min(times.length,prices.length);i++){
      const t=Number(times[i]),p=Number(prices[i]);if(!Number.isFinite(t)||!Number.isFinite(p))continue;
      const bucket=Math.floor(t/step)*step;let x=map.get(bucket);
      if(!x){x={time:bucket,open:p,high:p,low:p,close:p,volume:0};map.set(bucket,x);out.push(x)}
      else{x.close=p;x.high=Math.max(x.high,p);x.low=Math.min(x.low,p)}
    }
    resolve(out);
  }catch(_){}};
 });
 if(!rows.length)throw Error("No Deriv candles received");
 return rows;
}
async function fetchBybitCandles(){
 const iv=API[tf];if(!iv)throw Error("This timeframe is not supplied by Bybit");
 const market=await resolveMarket();
 const res=await fetch("https://api.bybit.com/v5/market/kline?category="+encodeURIComponent(market.category)+"&symbol="+encodeURIComponent(market.symbol)+"&interval="+iv+"&limit=500",{cache:"no-store"});
 const data=await res.json();if(!res.ok||Number(data?.retCode)!==0)throw Error(data?.retMsg||"Bybit Linear market feed unavailable");
 const rows=normalize(data?.result?.list?.slice().reverse());if(!rows.length)throw Error("No Bybit Linear candles received");return rows;
}
async function fetchCandles(){
 const b=chooseBroker();
 if(b==="DERIV")return fetchDerivCandles();
 return fetchBybitCandles();
}

async function loadCandles(){
 const market=await resolveMarket();
 candles=dedupe(await fetchCandles()).slice(-500);
 const e=$("gtxKenglyError"),src=$("gtxKenglySource");
 if(e)e.hidden=true;
 if(src)src.textContent=market.broker==="DERIV"?"LIVE • Deriv • "+pairLabel():"LIVE • Bybit "+String(market.category).toUpperCase()+" • "+market.symbol;
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

function makeChart(){
 const host=$("gtxKenglyHost");if(!host||!window.LightweightCharts)throw Error("Lightweight Charts library unavailable");
 if(chart)try{chart.remove()}catch(_){}
 chart=LightweightCharts.createChart(host,{autoSize:true,layout:{background:{type:"solid",color:"#071827"},textColor:"#9db4cc",fontSize:10},grid:{vertLines:{color:"rgba(120,160,200,.09)"},horzLines:{color:"rgba(120,160,200,.09)"}},rightPriceScale:{visible:true,borderColor:"#2b527d",scaleMargins:{top:.08,bottom:.12}},timeScale:{visible:true,borderColor:"#2b527d",timeVisible:true,secondsVisible:true,barSpacing:10,rightOffset:5,minBarSpacing:2,maxBarSpacing:45},crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{width:1,style:2,labelBackgroundColor:"#176fca"},horzLine:{width:1,style:2,labelBackgroundColor:"#176fca"}},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true}});
 series=chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:"#19c765",downColor:"#e5394f",borderUpColor:"#19c765",borderDownColor:"#e5394f",wickUpColor:"#19c765",wickDownColor:"#e5394f",priceLineVisible:false});
 series.setData(candles);
 const last=candles.at(-1)?.close;
 if(Number.isFinite(last))priceLine=series.createPriceLine({price:last,color:"#f5c542",lineWidth:2,lineStyle:2,axisLabelVisible:true,title:"LIVE"});
 buildIndicators();chart.timeScale().fitContent();root().classList.add("ready");observeSize();updateInfo();updateTradeOverlay();
}

function observeSize(){const host=$("gtxKenglyHost");if(!host)return;resizeObserver?.disconnect();resizeObserver=new ResizeObserver(()=>{if(chart&&host.clientWidth&&host.clientHeight)chart.resize(host.clientWidth,host.clientHeight);updateTradeOverlay()});resizeObserver.observe(host)}
function updateInfo(){const p=$("gtxKenglyPair"),t=$("gtxKenglyTimeframe");if(p)p.textContent=pairLabel();if(t)t.textContent=tf;const x=candles.at(-1);if(x&&priceLine)priceLine.applyOptions({price:x.close});updateTradeOverlay()}

function closeSocket(){try{ws?.close()}catch(_){}ws=null;clearTimeout(reconnectTimer);reconnectTimer=null}
async function connectSocket(requestId=assetRequestId){
 const mySocket=++socketGeneration;
 closeSocket();
 const market=await resolveMarket();
 if(requestId!==assetRequestId||mySocket!==socketGeneration)return;

 const broker=market.broker,sym=market.symbol;
 try{
  let url=BYBIT_WS;
  if(broker==="DERIV"){ url=DERIV_WS; }
  else if(market.category==="spot"){ url="wss://stream.bybit.com/v5/public/spot"; }
  ws=new WebSocket(url);
  const thisWs=ws;
  ws.onopen=()=>{
   if(requestId!==assetRequestId||thisWs!==ws||mySocket!==socketGeneration){try{thisWs.close()}catch(_){};return}
   if(broker==="DERIV")ws.send(JSON.stringify({ticks:sym,subscribe:1,req_id:102}));
   else ws.send(JSON.stringify({op:"subscribe",args:["tickers."+sym]}));
   const src=$("gtxKenglySource");if(src)src.textContent=broker==="DERIV"?"LIVE • Deriv market data":"LIVE • "+displayBroker()+" WebSocket";
  };
  ws.onmessage=e=>{try{
   if(requestId!==assetRequestId||thisWs!==ws||mySocket!==socketGeneration)return;
   const m=JSON.parse(e.data);let p=NaN,t=NaN;
   if(broker==="DERIV"&&m?.msg_type==="tick"){p=Number(m.tick.quote);t=Number(m.tick.epoch)}
   if(broker==="BYBIT"){p=Number(m?.data?.lastPrice);t=Date.now()/1000}
   if(Number.isFinite(p))updateLivePrice(p,t);
  }catch(_){}}; 
  ws.onerror=()=>{try{thisWs.close()}catch(_){}};
  ws.onclose=()=>{
   if(thisWs!==ws||mySocket!==socketGeneration||requestId!==assetRequestId)return;
   ws=null;
   if(started)reconnectTimer=setTimeout(()=>connectSocket(requestId).catch(()=>{}),3000)
  };
 }catch(e){const src=$("gtxKenglySource");if(src)src.textContent="LIVE FEED WAITING • "+(e?.message||"Connecting…");if(started)reconnectTimer=setTimeout(()=>connectSocket().catch(()=>{}),3000)}
}
function updateLivePrice(p,sourceTime){
 const step=TF[tf]||60,base=Number.isFinite(Number(sourceTime))?Number(sourceTime):Date.now()/1000,t=Math.floor(base/step)*step;let x=candles.at(-1);
 if(!x||t>x.time){x={time:t,open:p,high:p,low:p,close:p,volume:0};candles.push(x);candles=candles.slice(-500)}
 else{x.close=p;x.high=Math.max(x.high,p);x.low=Math.min(x.low,p)}
 series?.update(x);priceLine?.applyOptions({price:p});if(trade)updateTrade(p);updateInfo();
}
async function fast(){
 if(!started||!candles.length||!["5 Seconds","15 Seconds","30 Seconds"].includes(tf))return;
 try{
  const market=await resolveMarket();
  if(market.broker!=="BYBIT")return;
  const r=await fetch("https://api.bybit.com/v5/market/tickers?category="+encodeURIComponent(market.category)+"&symbol="+encodeURIComponent(market.symbol),{cache:"no-store"});
  const d=await r.json(),p=Number(d?.result?.list?.[0]?.lastPrice);
  if(Number.isFinite(p))updateLivePrice(p)
 }catch(_){}
}

function loadLibrary(){return new Promise((resolve,reject)=>{if(window.LightweightCharts)return resolve();const old=document.querySelector('script[data-gtx-kengly-lib="1"]');if(old){old.addEventListener("load",resolve,{once:true});old.addEventListener("error",reject,{once:true});return}const s=document.createElement("script");s.src="https://unpkg.com/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js";s.dataset.gtxKenglyLib="1";s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}

function renderIndicators(){const g=$("gtxKenglyGrid");if(!g)return;g.innerHTML="";INDS.forEach(n=>{const b=document.createElement("button");b.textContent=n;b.className=active.has(n)?"on":"";b.onclick=()=>{active.has(n)?active.delete(n):active.add(n);renderIndicators();buildIndicators()};g.appendChild(b)})}
function bindControls(){renderIndicators();["buy","sell"].forEach(id=>{const b=$(id);if(!b||b.dataset.gtxTradeBound==="1")return;b.dataset.gtxTradeBound="1";b.addEventListener("click",()=>startTrade(id==="buy"?"BUY":"SELL"),{capture:false})})}

function startTrade(direction){
 if(!candles.length)return;
 const x=candles.at(-1),step=TF[tf]||60;
 trade={direction,symbol:pairLabel(),startTime:x.time,startPrice:x.close,endTime:x.time+step,endPrice:x.close};
 signalExpiryAt=Date.now()+step*1000;
 drawTrade();
}
function updateTrade(price){
 if(!trade)return;
 trade.endPrice=price;
 if(Date.now()>=signalExpiryAt){trade.endTime=Math.floor(Date.now()/1000);finishTrade();return}
 drawTrade();
}
function finishTrade(){
 if(!trade)return;
 trade.endTime=Math.floor(Date.now()/1000);
 const p=trade.endPrice??trade.startPrice;
 tradeLine?.setData([{time:trade.startTime,value:trade.startPrice},{time:trade.endTime,value:p}]);
 drawTrade(true);
 trade=null;
}
function drawTrade(finished=false){
 if(!chart||!series||!trade)return;
 const endTime=finished?trade.endTime:Math.floor(Date.now()/1000);
 const endPrice=finished?(trade.endPrice??trade.startPrice):(trade.endPrice??trade.startPrice);
 if(!tradeLine){tradeLine=chart.addSeries(LightweightCharts.LineSeries,{color:trade.direction==="BUY"?"#36c275":"#e05b70",lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});}
 tradeLine.applyOptions({color:trade.direction==="BUY"?"#36c275":"#e05b70"});
 tradeLine.setData([{time:trade.startTime,value:trade.startPrice},{time:endTime,value:endPrice}]);
 updateTradeOverlay();
}
function updateTradeOverlay(){
 const ov=$("gtxKenglyOverlay");if(!ov||!chart||!trade||!candles.length)return;
 ov.innerHTML="";
 const pts=[{kind:"start",time:trade.startTime,price:trade.startPrice,text:trade.symbol},{kind:"end",time:trade.endTime,price:trade.endPrice??trade.startPrice,text:"END"}];
 pts.forEach(pt=>{const x=chart.timeScale().timeToCoordinate(pt.time),y=series?.priceToCoordinate(pt.price);if(x==null||y==null)return;const d=document.createElement("div");d.className="gtxTradeFlag "+trade.direction.toLowerCase()+" "+pt.kind;d.textContent=pt.text;d.style.left=x+"px";d.style.top=y+"px";ov.appendChild(d)});
}

function updateExpiryDisplay(){
 if(signalExpiryAt&&Date.now()>=signalExpiryAt&&trade){finishTrade();signalExpiryAt=0}
}
function bindExpiry(){clearInterval(expiryTimer);expiryTimer=setInterval(updateExpiryDisplay,250)}

async function refresh(requestId=assetRequestId){
 try{
  await loadCandles();
  if(requestId!==assetRequestId)return;

  if(!chart)makeChart();else{series?.setData(candles);buildIndicators();chart.timeScale().fitContent();updateInfo()}
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
 if(started||!root())return;started=true;injectCss();rebuildDom();bindExpiry();
 try{await loadLibrary();bindControls();await refresh();clearInterval(poll);poll=null}
 catch(e){showLiveError(e);closeSocket();reconnectTimer=setTimeout(retryLive,3000)}
}
function toggleIndicator(name){if(!INDS.includes(name))return false;if(active.has(name))active.delete(name);else active.add(name);buildIndicators();return active.has(name)}

window.GoTradeXChartEngine={
 boot,refresh,
 setSymbol:s=>{
 const requestId=++assetRequestId;
 clearTimeout(reconnectTimer);reconnectTimer=null;
 closeSocket();
 symbol=String(s||"EURUSD").toUpperCase().replace(/[^A-Z0-9_]/g,"");
 store.set("gotradex_chart_symbol",symbol);
 resolvedMarket=null;resolvedKey="";
 const pairEl=$("pairName");if(pairEl)pairEl.textContent=pairLabel();
 // Clear the previous asset immediately. Never leave old candles visible while the new feed loads.
 candles=[];
 if(series){try{series.setData([])}catch(_){} }
 clearIndicators();
 try{priceLine?.applyOptions({price:NaN})}catch(_){}
 const errBox=$("gtxKenglyError");if(errBox)errBox.hidden=true;
 const source=$("gtxKenglySource");if(source)source.textContent="Connecting to "+pairLabel()+"…";
 updateInfo();refresh(requestId).catch(e=>{if(requestId===assetRequestId)showLiveError(e)})
},
 setBroker:b=>{
 const requestId=++assetRequestId;
 clearTimeout(reconnectTimer);reconnectTimer=null;
 closeSocket();
 const v=String(b||"AUTO").toUpperCase();
 if(!["AUTO","DERIV","BYBIT"].includes(v))return;
 liveBroker=v;resolvedMarket=null;resolvedKey="";
 store.set("gotradex_chart_broker",v);refresh(requestId).catch(e=>{if(requestId===assetRequestId)showLiveError(e)})
},
 setTimeframe:x=>{if(TF[x]){tf=x;store.set("gotradex_chart_timeframe",tf);refresh().catch(showLiveError)}},
 toggleIndicator,
 startTrade
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else setTimeout(boot,0);
})();