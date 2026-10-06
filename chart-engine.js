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
let active=new Set(),started=false,ws=null,reconnectTimer=null,poll=null,indicatorSeries=[],twelveHandle=null;

function root(){return document.querySelector(".chart")}
function pairSymbol(){let s=String(symbol||"BTCUSDT").toUpperCase().replace("/","");return s.endsWith("USDT")?s:s+"USDT"}
function fmt(v){v=Number(v);if(!Number.isFinite(v))return"—";return v>=1000?v.toFixed(2):v>=10?v.toFixed(4):v>=1?v.toFixed(5):v.toFixed(6)}
function timeText(t){return new Date(t*1000).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}

function injectCss(){
  if($("gtx-kengly-v5-css"))return;
  const s=document.createElement("style");s.id="gtx-kengly-v5-css";
  s.textContent=`
    .gtxKengly{position:relative!important;display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#071827;color:#dbe9f7}
    .gtxKenglyBar{height:40px;flex:0 0 40px;display:flex;align-items:center;gap:5px;padding:5px 7px;background:#081b31;border-bottom:1px solid #23466d;overflow-x:auto;scrollbar-width:none}
    .gtxKenglyBar::-webkit-scrollbar{display:none}
    .gtxKenglySymbol{font-size:12px;font-weight:900;color:#fff;white-space:nowrap;margin-right:auto}
    .gtxKenglyBtn{height:29px;min-width:42px;flex:0 0 auto;border:1px solid #2b527d;border-radius:7px;background:#102945;color:#e6f0fa;font-size:9px;font-weight:900;padding:0 9px}
    .gtxKenglyBtn:active,.gtxKenglyBtn:hover{background:#176fca;color:#fff}
    .gtxKenglyStage{position:relative;flex:1 1 auto;min-height:0;width:100%;overflow:hidden}
    .gtxKenglyHost{position:absolute;inset:0;width:100%;height:100%;min-height:0}
    .gtxKenglyHost canvas{touch-action:none}
    .gtxKenglyInfo{position:absolute;left:9px;top:8px;z-index:5;pointer-events:none;text-shadow:0 1px 2px #000}
    .gtxKenglyPrice{font-size:16px;line-height:19px;font-weight:900;color:#fff}
    .gtxKenglyMeta,.gtxKenglySource{font-size:8px;color:#aac1d8;margin-top:2px}
    .gtxKenglyTools{position:absolute;right:8px;top:8px;z-index:10;display:flex;gap:5px}
    .gtxKenglyTools button{height:29px;border:1px solid #2b527d;border-radius:7px;background:rgba(8,27,49,.95);color:#fff;font-size:8px;font-weight:900;padding:0 8px}
    .gtxKenglyMenu{display:none;position:absolute;right:8px;top:44px;width:min(330px,90vw);max-height:75%;overflow:auto;z-index:30;padding:9px;background:#081b31;border:1px solid #2b527d;border-radius:9px;box-shadow:0 14px 36px #0009}
    .gtxKenglyMenu.open{display:block}
    .gtxKenglyGrid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
    .gtxKenglyGrid button,.gtxKenglyReset{min-height:31px;border:1px solid #2b527d;border-radius:7px;background:#102945;color:#dbe9f7;font-size:8px;text-align:left;padding:6px}
    .gtxKenglyGrid button.on{background:#176fca;color:#fff}
    .gtxKenglyReset{width:100%;margin-top:7px;text-align:center;font-weight:900}
    .gtxKenglyLoading{position:absolute;inset:0;display:grid;place-items:center;z-index:40;background:#071827e8;color:#aac1d8;font-size:11px;font-weight:800}
    .gtxKengly.ready .gtxKenglyLoading{display:none}
    .gtxKenglyHint{position:absolute;left:9px;bottom:8px;z-index:5;color:#7893ad;font-size:7px;pointer-events:none}
    @media(max-width:600px){
      .gtxKenglyBar{height:36px;flex-basis:36px;padding:4px 6px}
      .gtxKenglyBtn{height:27px;min-width:38px;font-size:8px;padding:0 7px}
      .gtxKenglyPrice{font-size:14px}
      .gtxKenglyTools button{height:27px;font-size:7px;padding:0 7px}
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
    <div class="gtxKenglyBar">
      <strong class="gtxKenglySymbol" id="gtxKenglySymbol">BTCUSDT</strong>
      <button class="gtxKenglyBtn" id="gtxKenglyPrev">‹</button>
      <button class="gtxKenglyBtn" id="gtxKenglyTf">1 Minute</button>
      <button class="gtxKenglyBtn" id="gtxKenglyNext">›</button>
      <button class="gtxKenglyBtn" id="gtxKenglyFit">FIT</button>
    </div>
    <div class="gtxKenglyStage">
      <div class="gtxKenglyHost" id="gtxKenglyHost"></div>
      <div class="gtxKenglyInfo">
        <div class="gtxKenglyPrice" id="gtxKenglyPrice">—</div>
        <div class="gtxKenglyMeta" id="gtxKenglyMeta">—</div>
        <div class="gtxKenglySource" id="gtxKenglySource">Loading candles…</div>
      </div>
      <div class="gtxKenglyTools">
        <button id="gtxKenglyIndicators">INDICATORS</button>
        <button id="gtxKenglyType">CANDLES</button>
      </div>
      <div class="gtxKenglyMenu" id="gtxKenglyMenu">
        <div class="gtxKenglyGrid" id="gtxKenglyGrid"></div>
        <button class="gtxKenglyReset" id="gtxKenglyReset">RESET INDICATORS</button>
      </div>
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
  const feeds=window.GoTradeXMarketFeeds;
  if(!feeds?.resolve) throw Error("Verified market-feed registry is not loaded.");
  const feed=feeds.resolve();
  if(!feed?.available) throw Error(feed?.reason||"No verified live feed is available for the selected asset.");
  const sec=TF[tf]||60;
  const rows=feed.provider==="BYBIT"
    ? await feeds.bybitHistory(feed.symbol,sec)
    : await feeds.twelveHistory(feed.symbol,sec,feed.type);
  if(!Array.isArray(rows)||!rows.length) throw Error("No verified live candles were returned for "+feed.label+".");
  return rows.map(x=>({
    time:Math.floor(Number(x.t)/1000),
    open:Number(x.o),high:Number(x.h),low:Number(x.l),close:Number(x.c),volume:Number(x.v||0)
  })).filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite)).slice(-500);
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

function updateInfo(){
  const x=candles.at(-1);if(!x)return;
  $("gtxKenglyPrice").textContent=fmt(x.close);
  $("gtxKenglyMeta").textContent="O "+fmt(x.open)+"  H "+fmt(x.high)+"  L "+fmt(x.low)+"  C "+fmt(x.close)+" • "+timeText(x.time);
  $("gtxKenglySymbol").textContent=pairSymbol()+" • "+tf;
  if(priceLine)priceLine.applyOptions({price:x.close});
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
}

function closeSocket(){try{ws?.close()}catch(_){}ws=null;try{window.__gtxKenglyTwelveSocket?.close?.()}catch(_){}window.__gtxKenglyTwelveSocket=null;clearTimeout(reconnectTimer);reconnectTimer=null}
function connectSocket(){
  closeSocket();
  const feeds=window.GoTradeXMarketFeeds;
  const feed=feeds?.resolve?.();
  if(!feed?.available){
    const el=$("gtxKenglySource");
    if(el)el.textContent="LIVE • WAITING FOR VERIFIED FEED";
    return;
  }
  if(feed.provider==="BYBIT"){
    try{
      ws=new WebSocket("wss://stream.bybit.com/v5/public/spot");
      ws.onopen=()=>{ws.send(JSON.stringify({op:"subscribe",args:["tickers."+feed.symbol]}));$("gtxKenglySource").textContent="LIVE • Bybit verified market feed"};
      ws.onmessage=e=>{try{const m=JSON.parse(e.data),p=Number(m?.data?.lastPrice);if(Number.isFinite(p))updateLivePrice(p)}catch(_){}};
      ws.onerror=()=>{closeSocket();if(started)reconnectTimer=setTimeout(connectSocket,3000)};
      ws.onclose=()=>{if(started)reconnectTimer=setTimeout(connectSocket,3000)};
    }catch(_){reconnectTimer=setTimeout(connectSocket,3000)}
    return;
  }
  if(feed.provider==="TWELVE_DATA" && feeds.twelveSocket){
    feeds.twelveSocket(feed.symbol,
      tick=>{updateLivePrice(Number(tick.price));},
      status=>{const el=$("gtxKenglySource");if(el)el.textContent=String(status||"LIVE • TWELVE DATA");}
    ).then(handle=>{window.__gtxKenglyTwelveSocket=handle}).catch(()=>{});
  }
}

function updateLivePrice(p){
  const step=TF[tf]||60,t=Math.floor(Date.now()/1000/step)*step;let x=candles.at(-1);
  if(!x||t>x.time){x={time:t,open:p,high:p,low:p,close:p,volume:0};candles.push(x);candles=candles.slice(-500)}
  else{x.close=p;x.high=Math.max(x.high,p);x.low=Math.min(x.low,p)}
  series?.update(x);priceLine?.applyOptions({price:p});updateInfo();
}
async function fast(){
  if(!started||!candles.length)return;
  const feeds=window.GoTradeXMarketFeeds,feed=feeds?.resolve?.();
  if(!feed?.available)return;
  if(feed.provider==="BYBIT"){
    try{
      const p=await feeds.twelvePrice?.(feed.symbol);
      if(Number.isFinite(Number(p?.price)))updateLivePrice(Number(p.price));
    }catch(_){}
  }else if(feed.provider==="TWELVE_DATA"&&feeds.twelvePrice){
    try{const p=await feeds.twelvePrice(feed.symbol);if(Number.isFinite(Number(p?.price)))updateLivePrice(Number(p.price))}catch(_){}
  }
}

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
  const order=Object.keys(TF);
  const move=dir=>{let i=order.indexOf(tf);tf=order[(i+dir+order.length)%order.length];store.set("gotradex_chart_timeframe",tf);$("gtxKenglyTf").textContent=tf;refresh()};
  $("gtxKenglyPrev").onclick=()=>move(-1);$("gtxKenglyNext").onclick=()=>move(1);$("gtxKenglyTf").onclick=()=>move(1);
  $("gtxKenglyFit").onclick=()=>chart?.timeScale().fitContent();
  $("gtxKenglyIndicators").onclick=()=>$("gtxKenglyMenu").classList.toggle("open");
  $("gtxKenglyReset").onclick=()=>{active.clear();renderIndicators();buildIndicators()};
  $("gtxKenglyType").onclick=()=>{
    const b=$("gtxKenglyType"),line=b.dataset.line==="1";b.dataset.line=line?"0":"1";b.textContent=line?"CANDLES":"LINE";
    if(!chart||!series)return;chart.removeSeries(series);
    series=line?chart.addSeries(LightweightCharts.LineSeries,{color:"#4f9cff",lineWidth:2,priceLineVisible:false}):chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:"#36c275",downColor:"#e05b70",borderUpColor:"#36c275",borderDownColor:"#e05b70",wickUpColor:"#36c275",wickDownColor:"#36c275",priceLineVisible:false});
    series.setData(line?candles.map(x=>({time:x.time,value:x.close})):candles);
    priceLine=series.createPriceLine({price:candles.at(-1).close,color:"#f5c542",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"LIVE"});buildIndicators();
  };
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

async function boot(){
  if(started||!root())return;started=true;
  injectCss();rebuildDom();fitMobile();window.addEventListener("resize",fitMobile,{passive:true});
  try{await loadLibrary();bindControls();await refresh();clearInterval(poll);poll=setInterval(fast,1000)}
  catch(_){
    const host=$("gtxKenglyHost");if(host){host.innerHTML='<div style="height:100%;display:grid;place-items:center;color:#aac1d8;font:700 11px sans-serif">Kengly chart library unavailable</div>'}
  }
}

window.GoTradeXChartEngine={
  boot,refresh,
  setSymbol:s=>{symbol=String(s||"BTCUSDT").toUpperCase();store.set("gotradex_chart_symbol",symbol);refresh()},
  setTimeframe:x=>{if(TF[x]){tf=x;store.set("gotradex_chart_timeframe",tf);$("gtxKenglyTf").textContent=tf;refresh()}}
};

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else setTimeout(boot,0);
})();