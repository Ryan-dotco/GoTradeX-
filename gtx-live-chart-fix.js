(function(){
  "use strict";

  /* GoTradeX — canonical Bybit candle chart.
     The surrounding chart panel, header controls and content below the chart
     are intentionally left untouched. This file owns only #mainChart. */

  const LIB = "https://unpkg.com/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js";
  let chart = null;
  let candleSeries = null;
  let volumeSeries = null;
  let resizeObserver = null;
  let socket = null;
  let currentKey = "";

  const $ = id => document.getElementById(id);
  const cryptoSymbols = new Set([
    "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","DOTUSDT","LINKUSDT",
    "LTCUSDT","BCHUSDT","TRXUSDT","SHIBUSDT","TONUSDT","XLMUSDT","ATOMUSDT","ETCUSDT","FILUSDT","APTUSDT",
    "NEARUSDT","ALGOUSDT","ICPUSDT","HBARUSDT","VETUSDT","UNIUSDT","AAVEUSDT","MKRUSDT","SANDUSDT","MANAUSDT","PEPEUSDT"
  ]);

  const intervalMap = {
    "1m":"1","2m":"1","3m":"3","5m":"5","10m":"5","15m":"15","30m":"30",
    "1H":"60","2H":"120","4H":"240","6H":"360","12H":"720","1D":"D","1W":"W","1M":"M"
  };
  const secondsMap = {"5s":5,"15s":15,"30s":30};

  function isCrypto(symbol){ return cryptoSymbols.has(String(symbol || "")); }

  function marketName(symbol){
    try {
      const catalogs = window.marketCatalog || {};
      const all = [...(catalogs.crypto||[]),...(catalogs.commodities||[]),...(catalogs.metals||[]),...(catalogs.indices||[])];
      const found = all.find(x => x[0] === symbol);
      if(found) return found[1];
    } catch(_){}
    return symbol && symbol.length === 6 ? symbol.slice(0,3) + " / " + symbol.slice(3) : symbol;
  }

  function host(){
    const e = $("mainChart");
    if(!e) return null;
    e.classList.add("gtx-live-chart");
    Object.assign(e.style,{
      width:"100%",height:"100%",minHeight:"430px",background:"#07111d",
      borderRadius:"10px",overflow:"hidden",touchAction:"none",position:"relative"
    });
    const wrapper = e.closest(".chart-wrapper");
    if(wrapper){
      Object.assign(wrapper.style,{minHeight:"430px",height:wrapper.style.height || "430px",background:"#07111d",overflow:"hidden",position:"relative"});
    }
    return e;
  }

  function updateHeader(symbol){
    const h = $("chartSymbol"), l = $("chartMarketToggleLabel"), p = $("btcPrice");
    if(h) h.textContent = marketName(symbol);
    if(l) l.textContent = symbol;
    const price = Number(window.state?.markets?.[symbol]?.price);
    if(p) p.textContent = price > 0 ? formatPrice(price) + " · LIVE" : "Waiting for Bybit…";
  }

  function cleanup(){
    if(resizeObserver){ try{resizeObserver.disconnect()}catch(_){} resizeObserver=null; }
    if(socket){ try{socket.close()}catch(_){} socket=null; }
    if(chart){ try{chart.remove()}catch(_){} chart=null; }
    candleSeries=null;
    volumeSeries=null;
  }

  function toCandle(row){
    return {
      time: Math.floor(Number(row[0])/1000),
      open:Number(row[1]), high:Number(row[2]), low:Number(row[3]), close:Number(row[4]), volume:Number(row[5])||0
    };
  }

  function normalize(c){
    return {time:Math.floor(Number(c.time)/1000),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close),volume:Number(c.volume)||0};
  }

  async function fetchBybitCandles(symbol, timeframe){
    if(!isCrypto(symbol)) return [];
    if(secondsMap[timeframe]){
      const response = await fetch(
        "https://api.bybit.com/v5/market/recent-trade?category=spot&symbol="+encodeURIComponent(symbol)+"&limit=1000",
        {cache:"no-store"}
      );
      if(!response.ok) throw new Error("Bybit recent trades: HTTP " + response.status);
      const json = await response.json();
      const trades = (json?.result?.list || []).map(t => ({
        time:Number(t.time), price:Number(t.price), size:Number(t.size)||0
      })).filter(t => Number.isFinite(t.time) && Number.isFinite(t.price) && t.price > 0).sort((a,b)=>a.time-b.time);
      const seconds = secondsMap[timeframe];
      const buckets = new Map();
      for(const t of trades){
        const bucket = Math.floor(t.time/(seconds*1000))*(seconds*1000);
        let c = buckets.get(bucket);
        if(!c) c={time:bucket,open:t.price,high:t.price,low:t.price,close:t.price,volume:0};
        c.high=Math.max(c.high,t.price); c.low=Math.min(c.low,t.price); c.close=t.price; c.volume+=t.size; buckets.set(bucket,c);
      }
      return [...buckets.values()].map(normalize).slice(-250);
    }
    const interval = intervalMap[timeframe] || "60";
    const response = await fetch(
      "https://api.bybit.com/v5/market/kline?category=spot&symbol="+encodeURIComponent(symbol)+"&interval="+interval+"&limit=250",
      {cache:"no-store"}
    );
    if(!response.ok) throw new Error("Bybit kline: HTTP " + response.status);
    const json = await response.json();
    if(json?.retCode && json.retCode !== 0) throw new Error(json.retMsg || "Bybit returned an error");
    return (json?.result?.list || []).map(toCandle).filter(c=>
      [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)
    ).sort((a,b)=>a.time-b.time);
  }

  function dimensions(e){
    const r=e.getBoundingClientRect(), p=e.parentElement?.getBoundingClientRect?.();
    return {w:Math.max(320,Math.floor(r.width||p?.width||320)),h:Math.max(360,Math.floor(r.height||p?.height||360))};
  }

  function render(candles,symbol,timeframe){
    const e=host(), lw=window.LightweightCharts;
    if(!e || !lw?.createChart || candles.length<2) return false;
    cleanup();
    e.innerHTML="";
    const d=candles.map(normalize).filter(c=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
    if(d.length<2) return false;
    const size=dimensions(e);
    chart=lw.createChart(e,{
      autoSize:false,width:size.w,height:size.h,
      layout:{background:{type:"solid",color:"#07111d"},textColor:"#9aa9bc"},
      grid:{vertLines:{color:"rgba(148,163,184,.08)"},horzLines:{color:"rgba(148,163,184,.08)"}},
      rightPriceScale:{borderColor:"rgba(148,163,184,.2)",scaleMargins:{top:.08,bottom:.12}},
      timeScale:{borderColor:"rgba(148,163,184,.2)",rightOffset:12,barSpacing:9,minBarSpacing:3},
      handleScroll:true,handleScale:true,
      crosshair:{mode:lw.CrosshairMode?.Normal ?? 0}
    });
    candleSeries=chart.addSeries(lw.CandlestickSeries,{
      upColor:"#10c878",downColor:"#ef4444",borderUpColor:"#10c878",borderDownColor:"#ef4444",
      wickUpColor:"#10c878",wickDownColor:"#ef4444",priceLineVisible:true
    });
    candleSeries.setData(d.map(c=>({time:c.time,open:c.open,high:c.high,low:c.low,close:c.close})));
    volumeSeries=chart.addSeries(lw.HistogramSeries,{priceFormat:{type:"volume"},priceScaleId:"volume",priceLineVisible:false},1);
    volumeSeries.setData(d.map(c=>({time:c.time,value:c.volume,color:c.close>=c.open?"rgba(16,200,120,.45)":"rgba(239,68,68,.45)"})));
    chart.panes?.()[1]?.setHeight(82);
    chart.timeScale().fitContent();

    const resize=()=>{ const s=dimensions(e); try{chart?.resize(s.w,s.h)}catch(_){} };
    resizeObserver=typeof ResizeObserver!=="undefined" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(e);
    requestAnimationFrame(()=>{resize();requestAnimationFrame(resize)});

    window.state.chart={
      type:"bybit-candles",symbol:symbol,timeframe:timeframe,candles:d.slice(),chart,canvas:e,
      render(){},
      updateCandle(c){
        const z=normalize(c), list=window.state.chart.candles, last=list[list.length-1];
        if(last && Number(last.time)===z.time) Object.assign(last,z); else {list.push(z);if(list.length>250)list.shift();}
        try{
          candleSeries?.update({time:z.time,open:z.open,high:z.high,low:z.low,close:z.close});
          volumeSeries?.update({time:z.time,value:z.volume,color:z.close>=z.open?"rgba(16,200,120,.45)":"rgba(239,68,68,.45)"});
        }catch(_){}
      },
      destroy:cleanup
    };
    updateHeader(symbol);
    return true;
  }

  function connect(symbol,timeframe){
    if(!isCrypto(symbol)) return;
    if(socket){try{socket.close()}catch(_){}socket=null;}
    socket=new WebSocket("wss://stream.bybit.com/v5/public/spot");
    socket.onopen=()=>{
      const topic=secondsMap[timeframe] ? "publicTrade."+symbol : "kline."+((intervalMap[timeframe]||"60"))+"."+symbol;
      socket.send(JSON.stringify({op:"subscribe",args:[topic]}));
    };
    socket.onmessage=event=>{
      try{
        const message=JSON.parse(event.data);
        if(!window.state.chart || window.state.chart.symbol!==symbol || window.state.chart.timeframe!==timeframe) return;
        if(secondsMap[timeframe]){
          if(!message.topic?.startsWith("publicTrade.") || !Array.isArray(message.data)) return;
          const sec=secondsMap[timeframe];
          for(const t of message.data){
            const time=Number(t.T), price=Number(t.p), volume=Number(t.v)||0;
            if(!Number.isFinite(time)||!Number.isFinite(price)||price<=0) continue;
            const bucket=Math.floor(time/(sec*1000))*(sec*1000);
            const list=window.state.chart.candles,last=list[list.length-1];
            let c;
            if(last && Number(last.time)*1000===bucket) c={...last};
            else c={time:bucket,open:price,high:price,low:price,close:price,volume:0};
            c.high=Math.max(c.high,price);c.low=Math.min(c.low,price);c.close=price;c.volume+=volume;
            window.state.chart.updateCandle(c);
            window.state.markets[symbol]={...(window.state.markets[symbol]||{}),symbol:symbol,price:price,source:"Bybit Live",live:true};
            updateHeader(symbol);
          }
        } else {
          if(!message.topic?.startsWith("kline.") || !message.data?.[0]) return;
          const x=message.data[0];
          const c={time:Number(x.start),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)||0};
          if(![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)) return;
          window.state.chart.updateCandle(c);
          window.state.markets[symbol]={...(window.state.markets[symbol]||{}),symbol:symbol,price:c.close,source:"Bybit Live",live:true};
          updateHeader(symbol);
          const bid=$("gtxMobileBidPrice"), ask=$("gtxMobileAskPrice");
          if(bid) bid.textContent=formatPrice(c.close);
          if(ask) ask.textContent=formatPrice(c.close);
        }
      }catch(_){}
    };
  }

  function fixTimeframePortal(){
    const panel=document.querySelector(".chart-panel"), header=document.querySelector(".chart-panel .panel-header"), control=document.querySelector(".chart-timeframe-control"), menu=control?.querySelector(".timeframes"), toggle=control?.querySelector(".chart-control-toggle");
    if(!panel||!header||!control||!menu||!toggle) return;
    header.style.position="relative";header.style.zIndex="5000";panel.style.position="relative";panel.style.zIndex="4000";control.style.position="relative";control.style.zIndex="9999";menu.style.zIndex="99999";menu.style.pointerEvents="auto";
    if(!control.dataset.portalFixed){
      control.dataset.portalFixed="1";
      toggle.addEventListener("click",()=>requestAnimationFrame(()=>{const open=!menu.hidden;if(open){menu.style.position="absolute";menu.style.right="0";menu.style.top="calc(100% + 8px)";}}));
    }
  }

  function loadLib(done){
    if(window.LightweightCharts?.createChart) return done();
    const old=document.querySelector('script[data-gtx-lwc="1"]');
    if(old){old.addEventListener("load",done,{once:true});return;}
    const s=document.createElement("script");s.src=LIB;s.async=true;s.dataset.gtxLwc="1";s.onload=done;s.onerror=()=>console.error("GTX: Lightweight Charts failed to load");document.head.appendChild(s);
  }

  async function install(){
    fixTimeframePortal();
    const symbol=window.state?.currentSymbol||"BTCUSDT", timeframe=window.state?.currentTimeframe||"1H", key=symbol+"|"+timeframe;
    if(currentKey===key && window.state?.chart?.type==="bybit-candles") return;
    currentKey=key;
    updateHeader(symbol);
    if(!isCrypto(symbol)){
      cleanup();
      const e=host();
      if(e)e.innerHTML='<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font:14px system-ui">Bybit candles are available for crypto markets.</div>';
      return;
    }
    loadLib(async()=>{
      try{
        const candles=await fetchBybitCandles(symbol,timeframe);
        if(currentKey!==key) return;
        if(!render(candles,symbol,timeframe)) throw new Error("Bybit returned insufficient candle data");
        connect(symbol,timeframe);
        fixTimeframePortal();
      }catch(error){
        console.error("GTX Bybit chart:",error);
        const e=host();
        if(e)e.innerHTML='<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;background:#07111d;font:14px system-ui">Unable to load Bybit candle data.</div>';
      }
    });
  }

  window.GTXForceLiveChart={install};
  window.createChart=install;
  document.addEventListener("DOMContentLoaded",()=>setTimeout(install,150));
  setTimeout(install,500);
  setInterval(()=>{if(document.visibilityState!=="hidden"){fixTimeframePortal();}},10000);
})();
