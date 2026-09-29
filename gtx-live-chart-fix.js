(function(){"use strict";
const LIB="https://unpkg.com/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js";
let chart=null,observer=null,socket=null,reconnect=null,currentKey="";
const $=id=>document.getElementById(id);
const cryptoSymbols=new Set(["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","DOTUSDT","LINKUSDT","LTCUSDT","BCHUSDT","TRXUSDT","SHIBUSDT","TONUSDT","XLMUSDT","ATOMUSDT","ETCUSDT","FILUSDT","APTUSDT","NEARUSDT","ALGOUSDT","ICPUSDT","HBARUSDT","VETUSDT","UNIUSDT","AAVEUSDT","MKRUSDT","SANDUSDT","MANAUSDT","PEPEUSDT"]);
function loadLib(done){if(window.LightweightCharts?.createChart)return done();const old=document.querySelector('script[data-gtx-lwc="1"]');if(old){old.addEventListener("load",done,{once:true});return;}const s=document.createElement("script");s.src=LIB;s.async=true;s.dataset.gtxLwc="1";s.onload=done;s.onerror=()=>console.error("GTX chart library failed to load");document.head.appendChild(s);}
function isCrypto(s){return cryptoSymbols.has(String(s||""));}
function marketName(s){try{const catalogs=window.marketCatalog||{};const all=[...(catalogs.crypto||[]),...(catalogs.commodities||[]),...(catalogs.metals||[]),...(catalogs.indices||[])];const f=all.find(x=>x[0]===s);if(f)return f[1];return s.length===6?s.slice(0,3)+" / "+s.slice(3):s;}catch(_){return s;}}
function host(){let e=$("mainChart");if(!e)return null;if(e.tagName==="CANVAS"||e.tagName==="IMG"){const d=document.createElement("div");d.id="mainChart";e.replaceWith(d);e=d;}e.classList.add("gtx-live-chart");Object.assign(e.style,{width:"100%",height:"100%",minHeight:"430px",background:"#07111d",borderRadius:"10px",overflow:"hidden",touchAction:"none",position:"relative"});const w=e.closest(".chart-wrapper");if(w)Object.assign(w.style,{minHeight:"430px",height:w.style.height||"min(62vh,560px)",background:"#07111d",overflow:"visible",position:"relative"});return e;}
function header(s){const h=$("chartSymbol"),l=$("chartMarketToggleLabel"),p=$("btcPrice");if(h)h.textContent=marketName(s);if(l)l.textContent=s;const v=Number(state.markets?.[s]?.price);if(p)p.textContent=v>0?formatPrice(v)+" · LIVE":"Waiting for live feed…";}
function destroy(){if(observer){try{observer.disconnect()}catch(_){}observer=null}if(chart){try{chart.remove()}catch(_){}chart=null}}
function interval(tf){return ({"1m":"1","2m":"1","3m":"3","5m":"5","10m":"5","15m":"15","30m":"30","1H":"60","2H":"120","4H":"240","6H":"360","12H":"720","1D":"D","1W":"W","1M":"M"}[tf]||"60")}
function subMinuteSeconds(tf){return ({"5s":5,"10s":10,"15s":15,"30s":30}[tf]||0)}
function normalize(x){return {time:Math.floor(Number(x.time)/1000),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)||0}}
async function getSubMinuteCandles(s,tf){
  const sec=subMinuteSeconds(tf);
  if(!sec)return [];
  const u=`https://api.bybit.com/v5/market/recent-trade?category=spot&symbol=${encodeURIComponent(s)}&limit=1000`;
  const r=await fetch(u,{cache:"no-store"});
  if(!r.ok)throw new Error("Bybit recent trades request failed: "+r.status);
  const j=await r.json();
  const trades=(j?.result?.list||[]).map(x=>({time:Number(x.time),price:Number(x.price),volume:Number(x.size)||0})).filter(x=>x.time>0&&Number.isFinite(x.price)).reverse();
  const bars=new Map();
  for(const t of trades){
    const bucket=Math.floor(t.time/(sec*1000))*(sec*1000);
    let b=bars.get(bucket);
    if(!b)b={time:bucket,open:t.price,high:t.price,low:t.price,close:t.price,volume:0};
    b.high=Math.max(b.high,t.price); b.low=Math.min(b.low,t.price); b.close=t.price; b.volume+=t.volume;
    bars.set(bucket,b);
  }
  return [...bars.values()].sort((a,b)=>a.time-b.time).slice(-250);
}
async function getCandles(s,tf){if(subMinuteSeconds(tf)){const a=await getSubMinuteCandles(s,tf);if(a.length>1)return a;}if(typeof fetchChartCandles==="function"){try{const a=await fetchChartCandles(s,tf,250);if(Array.isArray(a)&&a.length>1)return a}catch(e){console.warn("GTX chart loader:",e)}}if(!isCrypto(s))return[];const u=`https://api.bybit.com/v5/market/kline?category=spot&symbol=${encodeURIComponent(s)}&interval=${interval(tf)}&limit=250`;const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error("Bybit chart request failed: "+r.status);const j=await r.json();return(j?.result?.list||[]).reverse().map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])||0})).filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite));}
function renderLightweight(a,s,tf){const e=host(),lw=window.LightweightCharts;if(!e||!lw?.createChart||!Array.isArray(a)||a.length<2)return false;destroy();e.innerHTML="";const d=a.map(normalize).filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((x,y)=>x.time-y.time);if(d.length<2)return false;chart=lw.createChart(e,{autoSize:true,layout:{background:{type:"solid",color:"#07111d"},textColor:"#9aa9bc"},grid:{vertLines:{color:"rgba(148,163,184,.08)"},horzLines:{color:"rgba(148,163,184,.08)"}},rightPriceScale:{borderColor:"rgba(148,163,184,.2)",scaleMargins:{top:.08,bottom:.12}},timeScale:{borderColor:"rgba(148,163,184,.2)",rightOffset:12,barSpacing:9,minBarSpacing:3,fixLeftEdge:false},handleScroll:true,handleScale:true,crosshair:{mode:lw.CrosshairMode?.Normal??0}});const primary=chart.addSeries(lw.CandlestickSeries,{upColor:"#10c878",downColor:"#ef4444",borderUpColor:"#10c878",borderDownColor:"#ef4444",wickUpColor:"#10c878",wickDownColor:"#ef4444",priceLineVisible:false});primary.setData(d.map(x=>({time:x.time,open:x.open,high:x.high,low:x.low,close:x.close})));const volume=chart.addSeries(lw.HistogramSeries,{priceFormat:{type:"volume"},priceScaleId:"volume",priceLineVisible:false},1);volume.setData(d.map(x=>({time:x.time,value:x.volume,color:x.close>=x.open?"rgba(16,200,120,.55)":"rgba(240,68,90,.55)"})));chart.panes()[1]?.setHeight(82);chart.timeScale().fitContent();observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>chart?.resize(e.clientWidth,e.clientHeight)):null;observer?.observe(e);state.chart={type:"gtx-live-lightweight",symbol:s,timeframe:tf,candles:a.slice(),chart,canvas:e,render(){},updateCandle(x){const z=normalize(x);try{primary.update({time:z.time,open:z.open,high:z.high,low:z.low,close:z.close});volume.update({time:z.time,value:z.volume,color:z.close>=z.open?"rgba(16,200,120,.55)":"rgba(240,68,90,.55)"})}catch(_){}},destroy};header(s);return true}
function renderCanvasFallback(a,s,tf){const e=host();if(!e||!Array.isArray(a)||a.length<2)return false;destroy();e.innerHTML="";const c=document.createElement("canvas");c.id="gtxFallbackCanvas";c.style.cssText="display:block;width:100%;height:100%;touch-action:none;background:#07111d";e.appendChild(c);const draw=()=>{if(typeof drawOwnTradingChart!=="function")return;const rect=e.getBoundingClientRect();c.width=Math.max(1,Math.floor(rect.width*(devicePixelRatio||1)));c.height=Math.max(1,Math.floor(rect.height*(devicePixelRatio||1)));c.style.width=rect.width+"px";c.style.height=rect.height+"px";drawOwnTradingChart(c,a,{mode:"candles",showEMA:true,showVolume:true,showAlligator:true,crosshairX:null,zoom:1,pan:0});};draw();observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(draw):null;observer?.observe(e);state.chart={type:"gtx-live-canvas",symbol:s,timeframe:tf,candles:a.slice(),chart:null,canvas:c,render:draw,updateCandle(x){const last=state.chart.candles[state.chart.candles.length-1],z={...x};if(last&&Number(last.time)===Number(z.time))Object.assign(last,z);else state.chart.candles.push(z);if(state.chart.candles.length>250)state.chart.candles.shift();draw()},destroy(){observer?.disconnect();observer=null}};header(s);return true}
function connect(s,tf){
  if(!isCrypto(s))return;
  try{socket?.close()}catch(_){}
  const sec=subMinuteSeconds(tf);
  if(sec){
    socket=new WebSocket("wss://stream.bybit.com/v5/public/spot");
    socket.onopen=()=>socket.send(JSON.stringify({op:"subscribe",args:[`publicTrade.${s}`]}));
    socket.onmessage=e=>{
      try{
        const m=JSON.parse(e.data), rows=Array.isArray(m.data)?m.data:[];
        if(!m.topic?.startsWith("publicTrade.")||!rows.length||!state.chart||state.chart.symbol!==s||state.chart.timeframe!==tf)return;
        for(const x of rows){
          const ts=Number(x.T||x.time||Date.now()), price=Number(x.p||x.price), volume=Number(x.v||x.size)||0;
          if(!Number.isFinite(ts)||!Number.isFinite(price))continue;
          const bucket=Math.floor(ts/(sec*1000))*(sec*1000);
          const a=state.chart.candles; let last=a[a.length-1];
          if(!last||Number(last.time)!==bucket){
            const c={time:bucket,open:price,high:price,low:price,close:price,volume};
            a.push(c);if(a.length>250)a.shift();state.chart.updateCandle(c);
          }else{
            last.high=Math.max(Number(last.high),price);last.low=Math.min(Number(last.low),price);last.close=price;last.volume=(Number(last.volume)||0)+volume;
            state.chart.updateCandle(last);
          }
          state.markets[s]={...(state.markets[s]||{}),symbol:s,price,source:"Bybit Live",live:true};
          header(s);
          if($("gtxMobileBidPrice"))$("gtxMobileBidPrice").textContent=formatPrice(price);
          if($("gtxMobileAskPrice"))$("gtxMobileAskPrice").textContent=formatPrice(price);
        }
      }catch(_){}
    };
  }else{
    const iv=interval(tf);
    socket=new WebSocket("wss://stream.bybit.com/v5/public/spot");
    socket.onopen=()=>socket.send(JSON.stringify({op:"subscribe",args:[`kline.${iv}.${s}`]}));
    socket.onmessage=e=>{
      try{
        const m=JSON.parse(e.data),x=m.data?.[0];
        if(!m.topic?.startsWith("kline.")||!x||!state.chart||state.chart.symbol!==s||state.chart.timeframe!==tf)return;
        const c={time:Number(x.start),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)||0};
        const a=state.chart.candles,last=a[a.length-1];
        if(last&&Number(last.time)===c.time)Object.assign(last,c);else{a.push(c);if(a.length>250)a.shift()}
        state.chart.updateCandle(c);state.markets[s]={...(state.markets[s]||{}),symbol:s,price:c.close,source:"Bybit Live",live:true};header(s);
        if($("gtxMobileBidPrice"))$("gtxMobileBidPrice").textContent=formatPrice(c.close);
        if($("gtxMobileAskPrice"))$("gtxMobileAskPrice").textContent=formatPrice(c.close);
      }catch(_){}
    };
  }
  socket.onclose=()=>{clearTimeout(reconnect);reconnect=setTimeout(()=>{if(currentKey===s+"|"+tf)connect(s,tf)},1500)};
}
function fixTimeframePortal(){const panel=document.querySelector(".chart-panel"),headerEl=panel?.querySelector(".panel-header"),control=panel?.querySelector(".chart-timeframe-control"),menu=control?.querySelector(".timeframes"),toggle=control?.querySelector(".chart-control-toggle");if(!panel||!headerEl||!control||!menu||!toggle)return;headerEl.style.position="relative";headerEl.style.zIndex="5000";panel.style.position="relative";panel.style.zIndex="4000";const mobileTabs=document.querySelector(".gtx-mobile-terminal-tabs");if(mobileTabs)mobileTabs.style.zIndex="20";control.style.position="relative";control.style.zIndex="9999";menu.style.zIndex="2147483647";menu.style.pointerEvents="auto";if(!control.dataset.portalFixed){control.dataset.portalFixed="1";toggle.addEventListener("click",()=>{requestAnimationFrame(()=>{const open=!menu.hidden;headerEl.style.zIndex=open?"5000":"4000";panel.style.zIndex=open?"4000":"30";if(open){menu.style.zIndex="99999";menu.style.position=window.innerWidth<=850?"fixed":"absolute";menu.style.right=window.innerWidth<=850?"10px":"0";menu.style.left=window.innerWidth<=850?"10px":"auto";menu.style.top=window.innerWidth<=850?"120px":"calc(100% + 8px)";}});});}}
async function install(){fixTimeframePortal();const s=state.currentSymbol||"BTCUSDT",tf=state.currentTimeframe||"1H",k=s+"|"+tf;if(currentKey===k&&state.chart&&(chart||state.chart.canvas))return;currentKey=k;header(s);loadLib(async()=>{try{const a=await getCandles(s,tf);if(currentKey!==k)return;if(!renderLightweight(a,s,tf)){if(!renderCanvasFallback(a,s,tf)){const e=host();if(e)e.innerHTML='<div style="height:100%;min-height:430px;display:flex;align-items:center;justify-content:center;color:#94a3b8;background:#07111d;font:14px system-ui">Waiting for live market data…</div>';return}}connect(s,tf);fixTimeframePortal()}catch(e){console.error("GTX live chart error:",e);const h=host();if(h)h.innerHTML='<div style="height:100%;min-height:430px;display:flex;align-items:center;justify-content:center;color:#94a3b8;background:#07111d;font:14px system-ui">Live chart connection unavailable</div>'}})}
window.GTXForceLiveChart={install};window.createChart=install;document.addEventListener("DOMContentLoaded",()=>setTimeout(install,150));setTimeout(install,500);setInterval(()=>{if(document.visibilityState!=="hidden"){fixTimeframePortal();if(!state.chart)install()}},10000);
})();