/* GoTradeX Kengly Candlestick Engine v5
   Rebuilt cleanly for the GTX mobile trading terminal.
   Scope: chart-engine.js only.
*/
(()=>{"use strict";

const TF={
  "5 Seconds":5,"15 Seconds":15,"30 Seconds":30,"1 Minute":60,
  "5 Minutes":300,"15 Minutes":900,"30 Minutes":1800,"1 Hour":3600,
  "4 Hours":14400,"12 Hours":43200,"1 Day":86400,"1 Week":604800,
  "1 Month":2592000,"6 Months":15552000,"1 Year":31536000
};
const API={"1 Minute":"1","5 Minutes":"5","15 Minutes":"15","30 Minutes":"30","1 Hour":"60","4 Hours":"240","12 Hours":"720","1 Day":"D","1 Week":"W","1 Month":"M"};
const INDS=["Alligator","Fractals","EMA / SMA","Bollinger Bands","Parabolic SAR","Supertrend","Ichimoku Cloud","RSI","MACD","Stochastic","ATR","Support & Resistance","Horizontal Line"];
const $=id=>document.getElementById(id);
const store={get(k,d){try{return localStorage.getItem(k)||d}catch(_){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(_){}}};

let chart=null,series=null,priceLine=null,resizeObserver=null;
let candles=[],symbol=store.get("gotradex_chart_symbol","BTCUSDT"),tf=store.get("gotradex_chart_timeframe","1 Minute");
let active=new Set(),started=false,ws=null,reconnectTimer=null,poll=null,indicatorSeries=[];

function root(){return document.querySelector(".chart")}
function pairSymbol(){let s=String(symbol||"BTCUSDT").toUpperCase().replace("/","");return s.endsWith("USDT")?s:s+"USDT"}
function fmt(v){v=Number(v);if(!Number.isFinite(v))return"—";return v>=1000?v.toFixed(2):v>=10?v.toFixed(4):v>=1?v.toFixed(5):v.toFixed(6)}
function timeText(t){return new Date(t*1000).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}

function injectCss(){
  if($("gtx-kengly-v5-css"))return;
  const s=document.createElement("style");s.id="gtx-kengly-v5-css";
  s.textContent=`
    .gtxKengly{position:relative!important;display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#071827;color:#dbe9f7}
    .gtxKenglyHeader{position:relative!important;flex:0 0 58px!important;display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:flex-start!important;gap:1px!important;width:100%!important;height:58px!important;box-sizing:border-box!important;padding:3px 6px 4px!important;background:transparent!important;border:0!important;z-index:100!important;overflow:visible!important}
    .gtxKenglyClock,.gtxKenglyTimerRow{display:flex!important;visibility:visible!important;opacity:1!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;width:auto!important;height:auto!important;min-height:17px!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important;color:#dbe9f7!important;white-space:nowrap!important;position:relative!important;z-index:101!important}
    .gtxKenglyClock{font-size:9px!important;line-height:17px!important;font-weight:800!important}
    .gtxKenglyTimerRow{font-size:10px!important;line-height:17px!important;font-weight:800!important}
    .gtxKenglyTimerRow span,.gtxKenglyTimerRow strong{display:inline-block!important;visibility:visible!important;opacity:1!important;font-size:10px!important;line-height:17px!important;color:#fff!important}
    .gtxKenglyTimerRow span{min-width:42px!important;color:#dbe9f7!important}
    .gtxKenglyStage{position:relative;flex:1 1 auto;min-height:0;width:100%;overflow:hidden;z-index:1}
    .gtxKenglyStage{position:relative;flex:1 1 auto;min-height:0;width:100%;overflow:hidden}
    .gtxKenglyHost{position:absolute;inset:0;width:100%;height:100%;min-height:0}
    .gtxKenglyHost canvas{touch-action:none}
    .gtxKenglyLoading{position:absolute;inset:0;display:grid;place-items:center;z-index:40;background:#071827e8;color:#aac1d8;font-size:11px;font-weight:800}
    .gtxKengly.ready .gtxKenglyLoading{display:none}
    .gtxKenglyTools{position:absolute;right:8px;bottom:8px;z-index:10;display:none}
    @media(max-width:600px){
      .gtxKenglyClock{font-size:9px;min-height:25px}
      .gtxKenglyPair{font-size:12px}
      .gtxKenglySignal{font-size:9px}
      .gtxKenglyCandle{font-size:8px}
      .gtxKenglyCandle strong{font-size:10px}
    }
  `;
  document.head.appendChild(s);
}

function rebuildDom(){
  const r=root();if(!r)return false;
  r.className="chart gtxKengly";
  r.style.setProperty("display","flex","important");
  r.style.setProperty("flex-direction","column","important");
  r.style.setProperty("min-height","0","important");
  r.style.setProperty("visibility","visible","important");
  r.innerHTML=`
    <div class="gtxKenglyHeader">
      <div class="gtxKenglyClock" id="gtxKenglyClock">01-10-2026 15:30 UTC-04</div>
      <div class="gtxKenglyTimerRow"><span>Signal</span><strong id="gtxKenglySignal">00:05:00</strong></div>
      <div class="gtxKenglyTimerRow"><span>Candle</span><strong id="gtxKenglyCandle">00:00:05</strong></div>
    </div>
    <div class="gtxKenglyStage">
      <div class="gtxKenglyHost" id="gtxKenglyHost"></div>
      <div class="gtxKenglyLoading">Building Kengly candlestick engine…</div>
    </div>`;
  return true;
}

function normalize(rows){
  return (Array.isArray(rows)?rows:[]).map(k=>({
    time:Math.floor(Number(k[0])/1000),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]||0)
  })).filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
}
function dedupe(rows){const m=new Map();rows.forEach(x=>m.set(x.time,x));return [...m.values()].sort((a,b)=>a.time-b.time)}
async function fetchCandles(){
  const iv=API[tf];if(!iv)throw Error("Local timeframe");
  const res=await fetch("https://api.bybit.com/v5/market/kline?category=spot&symbol="+encodeURIComponent(pairSymbol())+"&interval="+iv+"&limit=500",{cache:"no-store"});
  const data=await res.json();if(!res.ok||Number(data?.retCode)!==0)throw Error(data?.retMsg||"Market feed unavailable");
  return normalize(data?.result?.list?.slice().reverse());
}
function demoCandles(){
  const d=Array.isArray(window.demoCandleData)?window.demoCandleData:[],step=TF[tf]||60,now=Math.floor(Date.now()/1000);
  return d.slice(-500).map((x,i)=>({time:now-(d.length-1-i)*step,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume||0)})).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite));
}
function syntheticCandles(){
  const step=TF[tf]||60,now=Math.floor(Date.now()/1000),out=[];let p=100;
  for(let i=0;i<300;i++){const o=p,c=Math.max(.001,o+(Math.sin(i*.51)+Math.cos(i*.19))*.25+(Math.random()-.5)*.5),h=Math.max(o,c)+Math.random()*.25,l=Math.min(o,c)-Math.random()*.25;out.push({time:now-(299-i)*step,open:o,high:h,low:l,close:c,volume:100});p=c}
  return out;
}
async function loadCandles(){
  try{candles=dedupe(await fetchCandles());$("gtxKenglySource").textContent="LIVE • Bybit market candles"}
  catch(_){candles=dedupe(demoCandles());$("gtxKenglySource").textContent=candles.length?"DEMO FALLBACK • Bybit unavailable":"DEMO FALLBACK • local chart data";if(!candles.length)candles=syntheticCandles()}
  candles=candles.slice(-500);
}

function sma(v,p){const out=[];for(let i=p-1;i<v.length;i++)out.push({time:candles[i].time,value:v.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p});return out}
function ema(v,p){const out=[],k=2/(p+1);let e=null;v.forEach((x,i)=>{e=e==null?x:x*k+e*(1-k);if(i>=p-1)out.push({time:candles[i].time,value:e})});return out}
function atr(p=14){const tr=[];for(let i=0;i<candles.length;i++){const x=candles[i],q=candles[i-1];tr.push(q?Math.max(x.high-x.low,Math.abs(x.high-q.close),Math.abs(x.low-q.close)):x.high-x.low)}return tr.map((_,i)=>i>=p-1?{time:candles[i].time,value:tr.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p}:null).filter(Boolean)}
function addLine(data,color,width=1,title=""){const s=chart.addSeries(LightweightCharts.LineSeries,{color,lineWidth:width,priceLineVisible:false,lastValueVisible:false,title,crosshairMarkerVisible:false});s.setData(data);indicatorSeries.push(s);return s}
function clearIndicators(){indicatorSeries.forEach(s=>{try{chart.removeSeries(s)}catch(_){}});indicatorSeries=[]}

function buildIndicators(){
  clearIndicators();if(!chart||!candles.length)return;
  const c=candles.map(x=>x.close),h=candles.map(x=>x.high),l=candles.map(x=>x.low);
  if(active.has("EMA / SMA")){addLine(ema(c,9),"#f5c542",2,"EMA 9");addLine(ema(c,21),"#5ea7ff",2,"EMA 21");addLine(sma(c,50),"#b58cff",1,"SMA 50")}
  if(active.has("Alligator")){addLine(sma(c,5),"#57d68d",2,"Jaw");addLine(sma(c,8),"#f5c542",2,"Teeth");addLine(sma(c,13),"#ff6b6b",2,"Lips")}
  if(active.has("Bollinger Bands")){const mid=sma(c,20),up=[],dn=[];for(let i=19;i<c.length;i++){const q=c.slice(i-19,i+1),m=q.reduce((a,b)=>a+b,0)/20,sd=Math.sqrt(q.reduce((a,b)=>a+(b-m)**2,0)/20);up.push({time:candles[i].time,value:m+2*sd});dn.push({time:candles[i].time,value:m-2*sd})}addLine(mid,"#8fa8c4");addLine(up,"#9c7cff");addLine(dn,"#9c7cff")}
  if(active.has("Fractals")){const hi=[],lo=[];for(let i=2;i<c.length-2;i++){if(h[i]>h[i-1]&&h[i]>h[i-2]&&h[i]>h[i+1]&&h[i]>h[i+2])hi.push({time:candles[i].time,value:h[i]});if(l[i]<l[i-1]&&l[i]<l[i-2]&&l[i]<l[i+1]&&l[i]<l[i+2])lo.push({time:candles[i].time,value:l[i]})}addLine(hi,"#ff9f43",2,"Fractal High");addLine(lo,"#48dbfb",2,"Fractal Low")}
  if(active.has("Support & Resistance")){const lows=[...l].sort((a,b)=>a-b).slice(0,3),highs=[...h].sort((a,b)=>b-a).slice(0,3);[...new Set(lows)].forEach(v=>addLine(candles.map(x=>({time:x.time,value:v})),"#48dbfb"));[...new Set(highs)].forEach(v=>addLine(candles.map(x=>({time:x.time,value:v})),"#ff6b6b"))}
  if(active.has("Horizontal Line")){const v=candles.at(-1)?.close;if(v)addLine(candles.map(x=>({time:x.time,value:v})),"#f5c542",1,"Horizontal")}
  if(active.has("Keltner Channels")){const m=ema(c,20),a=atr(10),am=new Map(a.map(x=>[x.time,x.value])),u=[],d=[];m.forEach(x=>{const z=am.get(x.time);if(z){u.push({time:x.time,value:x.value+2*z});d.push({time:x.time,value:x.value-2*z})}});addLine(m,"#57d68d");addLine(u,"#57d68d");addLine(d,"#57d68d")}
  if(active.has("Donchian Channels")){const u=[],d=[];for(let i=19;i<c.length;i++){u.push({time:candles[i].time,value:Math.max(...h.slice(i-19,i+1))});d.push({time:candles[i].time,value:Math.min(...l.slice(i-19,i+1))})}addLine(u,"#a78bfa");addLine(d,"#a78bfa")}
  if(active.has("Parabolic SAR")){let sar=l[0],ep=h[0],af=.02,up=true,out=[];for(let i=1;i<c.length;i++){sar=sar+af*(ep-sar);if(up){sar=Math.min(sar,l[i-1],i>1?l[i-2]:l[i-1]);if(l[i]<sar){up=false;sar=ep;ep=l[i];af=.02}else if(h[i]>ep){ep=h[i];af=Math.min(.2,af+.02)}}else{sar=Math.max(sar,h[i-1],i>1?h[i-2]:h[i-1]);if(h[i]>sar){up=true;sar=ep;ep=h[i];af=.02}else if(l[i]<ep){ep=l[i];af=Math.min(.2,af+.02)}}out.push({time:candles[i].time,value:sar})}addLine(out,"#fff",1,"SAR")}
  if(active.has("Supertrend")){const a=atr(10),am=new Map(a.map(x=>[x.time,x.value])),out=[];candles.forEach(x=>{const z=am.get(x.time);if(z)out.push({time:x.time,value:(x.high+x.low)/2+2*z})});addLine(out,"#57d68d",2,"Supertrend")}
}

let signalExpiryAt=0,expiryTimer=null;

function pairLabel(){
  const s=pairSymbol();
  return s.endsWith("USDT")?s.slice(0,-4)+"/USDT":s.length===6?s.slice(0,3)+"/"+s.slice(3):s;
}
function zoneLabel(){
  try{
    const z=Intl.DateTimeFormat().resolvedOptions().timeZone||"Local";
    if(z==="Africa/Johannesburg")return"SAST • UTC+2";
    return z.replaceAll("_"," ");
  }catch(_){return"Local time"}
}
function updateExpiryDisplay(){
  const now=Date.now(),sec=Math.floor(now/1000),step=TF[tf]||60;
  const next=Math.ceil((sec+0.001)/step)*step;
  const remain=Math.max(0,next-sec);
  const mm=String(Math.floor(remain/60)).padStart(2,"0"),ss=String(remain%60).padStart(2,"0");
  const ce=$( "gtxKenglyCandle");
  if(ce)ce.textContent=step>=60?String(Math.floor(remain/60)).padStart(2,"0")+":"+ss+":00":"00:00:"+String(remain).padStart(2,"0");
  const se=$( "gtxKenglySignal");
  if(se){
    const left=signalExpiryAt?Math.max(0,Math.ceil((signalExpiryAt-now)/1000)):0;
    const sm=String(Math.floor(left/60)).padStart(2,"0"),ss2=String(left%60).padStart(2,"0");
    se.textContent=signalExpiryAt?(step>=60?sm+":"+ss2+":00":"00:00:"+String(left).padStart(2,"0")):"00:05:00";
    if(signalExpiryAt&&left<=0)signalExpiryAt=0;
  }
  const clock=$( "gtxKenglyClock");
  if(clock){
    const d=new Date(now);
    const date=d.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}).replaceAll("/","-");
    const time=d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",hour12:false});
    clock.textContent=date+" "+time+" UTC-04";
    const amountEl=$( "gtxKenglyAmount"),amountBtn=$( "amountBtn");if(amountEl&&amountBtn)amountEl.textContent=amountBtn.textContent.trim()||"$10.00";
    const sellEl=$( "gtxKenglySell"),buyEl=$( "gtxKenglyBuy");const sellPct=document.querySelector(".sell .tradePercent"),buyPct=document.querySelector(".buy .tradePercent");if(sellEl)sellEl.textContent=sellPct?.textContent?.trim()||"—";if(buyEl)buyEl.textContent=buyPct?.textContent?.trim()||"—";
  }
}
function startSignalExpiry(){
  const step=TF[tf]||60;
  signalExpiryAt=Date.now()+step*1000;
  updateExpiryDisplay();
}
function bindSignalExpiry(){
  ["buy","sell"].forEach(id=>{
    const b=$(id);if(!b||b.dataset.gtxExpiryBound==="1")return;
    b.dataset.gtxExpiryBound="1";
    b.addEventListener("click",startSignalExpiry,{capture:true});
  });
}
function updateInfo(){
  const x=candles.at(-1);if(!x)return;
  $( "gtxKenglyPair").textContent=pairLabel().replace("/USDT","").replace("/", "");
  const tfEl=$( "gtxKenglyTimeframe");if(tfEl)tfEl.textContent=tf;
  if(priceLine)priceLine.applyOptions({price:x.close});
  updateExpiryDisplay();
}

function makeChart(){
  const host=$("gtxKenglyHost");if(!host||!window.LightweightCharts)return;
  if(chart)try{chart.remove()}catch(_){}
  chart=LightweightCharts.createChart(host,{
    autoSize:true,
    layout:{background:{type:"solid",color:"#071827"},textColor:"#9db4cc",fontSize:10},
    grid:{vertLines:{color:"rgba(120,160,200,.09)"},horzLines:{color:"rgba(120,160,200,.09)"}},
    rightPriceScale:{visible:true,borderColor:"#2b527d",scaleMargins:{top:.08,bottom:.12}},
    timeScale:{visible:true,borderColor:"#2b527d",timeVisible:true,secondsVisible:true,barSpacing:9,rightOffset:6,minBarSpacing:2,maxBarSpacing:40},
    crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{width:1,style:2,labelBackgroundColor:"#176fca"},horzLine:{width:1,style:2,labelBackgroundColor:"#176fca"}},
    handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
    handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true}
  });
  series=chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:"#36c275",downColor:"#e05b70",borderUpColor:"#36c275",borderDownColor:"#e05b70",wickUpColor:"#36c275",wickDownColor:"#e05b70",priceLineVisible:false});
  series.setData(candles);
  const last=candles.at(-1)?.close;
  if(Number.isFinite(last))priceLine=series.createPriceLine({price:last,color:"#f5c542",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"LIVE"});
  buildIndicators();chart.timeScale().fitContent();root().classList.add("ready");
  resizeObserver?.disconnect();resizeObserver=new ResizeObserver(()=>{if(chart&&host.clientWidth&&host.clientHeight)chart.resize(host.clientWidth,host.clientHeight)});resizeObserver.observe(host);
  updateInfo();
  bindSignalExpiry();
}

function closeSocket(){try{ws?.close()}catch(_){}ws=null;clearTimeout(reconnectTimer);reconnectTimer=null}
function connectSocket(){
  closeSocket();const s=pairSymbol();
  try{
    ws=new WebSocket("wss://stream.bybit.com/v5/public/spot");
    ws.onopen=()=>{ws.send(JSON.stringify({op:"subscribe",args:["tickers."+s]}));$("gtxKenglySource").textContent="LIVE • Bybit ticker"};
    ws.onmessage=e=>{try{const m=JSON.parse(e.data),p=Number(m?.data?.lastPrice);if(!Number.isFinite(p))return;updateLivePrice(p)}catch(_){}};
    ws.onerror=()=>{closeSocket();if(started)reconnectTimer=setTimeout(connectSocket,3000)};
    ws.onclose=()=>{if(started)reconnectTimer=setTimeout(connectSocket,3000)};
  }catch(_){reconnectTimer=setTimeout(connectSocket,3000)}
}
function updateLivePrice(p){
  const step=TF[tf]||60,t=Math.floor(Date.now()/1000/step)*step;let x=candles.at(-1);
  if(!x||t>x.time){x={time:t,open:p,high:p,low:p,close:p,volume:0};candles.push(x);candles=candles.slice(-500)}
  else{x.close=p;x.high=Math.max(x.high,p);x.low=Math.min(x.low,p)}
  series?.update(x);priceLine?.applyOptions({price:p});updateInfo();
}
async function fast(){if(!started||!candles.length||!["5 Seconds","15 Seconds","30 Seconds"].includes(tf))return;try{const r=await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(pairSymbol()),{cache:"no-store"}),d=await r.json(),p=Number(d?.result?.list?.[0]?.lastPrice);if(Number.isFinite(p))updateLivePrice(p)}catch(_){}}

function loadLibrary(){
  return new Promise((resolve,reject)=>{
    if(window.LightweightCharts)return resolve();
    const old=document.querySelector('script[data-gtx-kengly-lib="1"]');
    if(old){old.addEventListener("load",resolve,{once:true});old.addEventListener("error",reject,{once:true});return}
    const s=document.createElement("script");s.src="https://unpkg.com/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js";s.dataset.gtxKenglyLib="1";s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
  });
}

function renderIndicators(){
  const g=$("gtxKenglyGrid");if(!g)return;g.innerHTML="";
  INDS.forEach(name=>{const b=document.createElement("button");b.textContent=name;b.className=active.has(name)?"on":"";b.onclick=()=>{active.has(name)?active.delete(name):active.add(name);renderIndicators();buildIndicators()};g.appendChild(b)});
}
function bindControls(){
  renderIndicators();
}

function fitMobile(){
  if(!window.matchMedia("(max-width:600px)").matches)return;
  const chartEl=document.querySelector(".chart"),bottom=document.querySelector(".bottom"),top=document.querySelector(".top"),pair=document.querySelector(".pairbar");
  if(!chartEl||!bottom)return;
  const viewport=window.innerHeight||document.documentElement.clientHeight;
  const used=(top?.getBoundingClientRect().height||0)+(pair?.getBoundingClientRect().height||0)+(bottom.getBoundingClientRect().height||0);
  const available=Math.max(150,Math.floor(viewport-used));
  chartEl.style.setProperty("flex","0 0 "+available+"px","important");
  chartEl.style.setProperty("height",available+"px","important");
  chartEl.style.setProperty("min-height","150px","important");
  chartEl.style.setProperty("max-height",available+"px","important");
  chart?.resize(chartEl.clientWidth,Math.max(150,available-40));
}

async function refresh(){
  await loadCandles();
  if(!chart)makeChart();else{series?.setData(candles);buildIndicators();chart.timeScale().fitContent();updateInfo()}
  connectSocket();
}

function drawCanvasFallback(){
  const host=$("gtxKenglyHost");if(!host)return;
  host.innerHTML='<canvas id="gtxKenglyCanvas" aria-label="GoTradeX candlestick chart"></canvas>';
  const canvas=$("gtxKenglyCanvas"),ctx=canvas.getContext("2d");if(!ctx)return;
  const draw=()=>{
    const w=Math.max(320,host.clientWidth||320),h=Math.max(220,host.clientHeight||220),dpr=Math.max(1,window.devicePixelRatio||1);
    canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);canvas.style.width=w+"px";canvas.style.height=h+"px";ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);ctx.fillStyle="#071827";ctx.fillRect(0,0,w,h);
    const rows=candles.slice(-80);if(!rows.length)return;
    const max=Math.max(...rows.map(x=>x.high)),min=Math.min(...rows.map(x=>x.low)),range=Math.max(max-min,.000001);
    const left=8,right=58,top=8,bottom=22,pw=Math.max(1,(w-left-right)/rows.length),body=Math.max(2,pw*.58);
    ctx.strokeStyle="rgba(120,160,200,.10)";ctx.lineWidth=1;ctx.font="9px sans-serif";ctx.fillStyle="#7891aa";
    for(let i=0;i<5;i++){const y=top+(h-top-bottom)*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();const v=max-range*i/4;ctx.fillText(fmt(v),w-right+5,y+3)}
    rows.forEach((x,i)=>{const cx=left+i*pw+pw/2,py=v=>top+(max-v)/range*(h-top-bottom),yo=py(x.open),yc=py(x.close),yh=py(x.high),yl=py(x.low),up=x.close>=x.open;ctx.strokeStyle=up?"#36c275":"#e05b70";ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(cx,yh);ctx.lineTo(cx,yl);ctx.stroke();const y=Math.min(yo,yc),bh=Math.max(1,Math.abs(yc-yo));ctx.fillRect(cx-body/2,y,body,bh)});
    const last=rows.at(-1)?.close;if(Number.isFinite(last)){const y=top+(max-last)/range*(h-top-bottom);ctx.strokeStyle="#f5c542";ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#f5c542";ctx.fillText(fmt(last),w-right+5,y+3)}
  };
  draw();
  resizeObserver?.disconnect();resizeObserver=new ResizeObserver(draw);resizeObserver.observe(host);
  root().classList.add("ready");updateInfo();bindSignalExpiry();
}

async function boot(){
  if(started||!root())return;started=true;
  injectCss();rebuildDom();fitMobile();window.addEventListener("resize",fitMobile,{passive:true});
  clearInterval(expiryTimer);expiryTimer=setInterval(updateExpiryDisplay,250);bindSignalExpiry();
  try{await loadLibrary();bindControls();await refresh();clearInterval(poll);poll=setInterval(fast,1000)}
  catch(_){
    try{candles=dedupe(demoCandles());if(!candles.length)candles=syntheticCandles();drawCanvasFallback();}
    catch(e){const host=$("gtxKenglyHost");if(host)host.innerHTML='<div style="height:100%;display:grid;place-items:center;color:#aac1d8;font:700 11px sans-serif">Candlestick chart unavailable</div>'}
  }
}

function toggleIndicator(name){
  if(!INDS.includes(name)) return false;
  if(active.has(name)) active.delete(name); else active.add(name);
  if(chart) buildIndicators();
  return active.has(name);
}
window.GoTradeXChartEngine={
  boot,refresh,
  setSymbol:s=>{symbol=String(s||"BTCUSDT").toUpperCase();store.set("gotradex_chart_symbol",symbol);refresh()},
  setTimeframe:x=>{if(TF[x]){tf=x;store.set("gotradex_chart_timeframe",tf);refresh()}},
  toggleIndicator
};

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else setTimeout(boot,0);
})();