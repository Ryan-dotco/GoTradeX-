/* GoTradeX LIVE Chart Layer — TradingView Lightweight Charts experiment.
 * Uses the existing verified GoTradeX feed registry; no synthetic/demo candles.
 * The chart timeframe is independent from the trade-expiration timeframe.
 */
(function(){
  "use strict";
  if(window.GoTradeXLiveChart) return;

  const LWC_URLS=["https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js","https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js"];
  const CFG={
    intervals:{
      "5 Seconds":5,"15 Seconds":15,"30 Seconds":30,"1 Minute":60,
      "2 Minutes":120,"5 Minutes":300,"15 Minutes":900,"30 Minutes":1800,
      "1 Hour":3600,"4 Hours":14400,"1 Day":86400,"1 Month":2592000,
      "3 Months":7776000,"6 Months":15552000,"1 Year":31536000
    }
  };

  const CHART_KEY="gotradex_chart_timeframe";
  const TYPE_KEY="gotradex_chart_type";

  let state={
    tf:"5 Minutes",sec:300,candles:[],price:null,prev:null,ws:null,
    provider:"",symbol:"",assetLabel:"BTC/USDT",mode:"LIVE",type:"crypto",
    connected:false,tradeStart:null,tradeEnd:null,lastAssetKey:"",connectionId:0,
    chart:null,candleSeries:null,lineSeries:null,areaSeries:null,
    ma50:null,ma100:null,ma200:null,currentPriceLine:null,
    chartType:"candle",historyLoaded:false,initialRangeSet:false,resizeObserver:null,
    booted:false,markersInstalled:false
  };

  function feed(){return window.GoTradeXMarketFeeds}
  function selection(){
    const f=feed();
    return f ? f.resolve() : {available:false,reason:"Market feed registry is not loaded."};
  }

  function injectStyle(){
    if(document.getElementById("gtx-lwc-style"))return;
    const s=document.createElement("style");
    s.id="gtx-lwc-style";
    s.textContent=
      "#gtxLiveChart{position:relative;width:100%;height:clamp(330px,52vh,560px);min-height:300px;background:#07111d;border:0;border-radius:0;overflow:hidden;box-sizing:border-box;touch-action:none;user-select:none}"+
      "#gtxLWC{position:absolute;inset:0;width:100%;height:100%}"+
      ".gtxLWCHead{position:absolute;z-index:10;top:7px;left:8px;right:8px;display:flex;align-items:center;gap:6px;pointer-events:none}"+
      ".gtxLWCHead>*{pointer-events:auto}"+
      ".gtxLWCAsset{font:900 11px/1 system-ui;color:#fff;background:#0b2036e8;border:1px solid #254c70;border-radius:6px;padding:6px 8px;white-space:nowrap}"+
      ".gtxLWCStatus{font:800 9px/1 system-ui;color:#8ff0ae;background:#082014e8;border:1px solid #1f6c40;border-radius:6px;padding:6px 7px;white-space:nowrap}"+
      ".gtxLWCControl{margin-left:auto;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}"+
      ".gtxLWCBtn{border:1px solid #31597f;background:#102945;color:#dcecff;border-radius:5px;padding:5px 7px;font:800 9px system-ui;cursor:pointer}"+
      ".gtxLWCBtn.active{background:#20a96b;color:#fff;border-color:#54e09a}"+
      ".gtxLWCSelect{border:1px solid #31597f;background:#102945;color:#fff;border-radius:5px;padding:5px 7px;font:800 9px system-ui}"+
      ".gtxLWCNotice{position:absolute;z-index:8;left:12px;right:70px;top:50px;display:grid;place-items:center;text-align:center;color:#7695b2;font:800 11px/1.4 system-ui;pointer-events:none}"+
      ".gtxLWCNotice[hidden]{display:none}"+
      ".gtxLWCTradeLine{position:absolute;z-index:9;top:0;bottom:28px;width:2px;display:none;pointer-events:none;border-left:2px dashed #f5a623}"+
      ".gtxLWCTradeLine.end{border-left-color:#fff}"+
      ".gtxLWCFlag{position:absolute;z-index:11;transform:translate(-50%,-100%);display:none;font:900 12px/1 system-ui;filter:drop-shadow(0 2px 3px #000);pointer-events:none}"+
      ".gtxLWCWatermark{position:absolute;z-index:2;right:70px;bottom:34px;color:#42627e;font:900 10px system-ui;letter-spacing:.08em;pointer-events:none}"+
      "@media(max-width:600px){#gtxLiveChart{height:clamp(300px,50vh,440px);min-height:300px}.gtxLWCAsset{font-size:9px;padding:5px 6px}.gtxLWCStatus{font-size:8px;padding:5px}.gtxLWCBtn,.gtxLWCSelect{font-size:8px;padding:4px 5px}.gtxLWCControl{gap:3px}.gtxLWCWatermark{display:none}}";
    document.head.appendChild(s);
  }

  function mount(){
    if(document.getElementById("gtxLiveChart"))return true;
    const chartHost=document.getElementById("gtxChart");
    const pair=document.querySelector(".pairbar"),bottom=document.querySelector(".bottom");
    if(!chartHost||!pair||!bottom||!bottom.parentNode)return false;
    injectStyle();
    const box=document.createElement("section");
    box.id="gtxLiveChart";
    box.setAttribute("aria-label","GoTradeX verified live candlestick chart");
    box.innerHTML=
      '<div id="gtxLWC"></div>'+
      '<div class="gtxLWCHead">'+
        '<span class="gtxLWCAsset" id="gtxLWCAsset">LIVE • BTC/USD</span>'+
        '<span class="gtxLWCStatus" id="gtxLWCStatus">CONNECTING</span>'+
        '<div class="gtxLWCControl">'+
          '<button class="gtxLWCBtn active" data-chart-type="candle" type="button">Candles</button>'+
          '<button class="gtxLWCBtn" data-chart-type="line" type="button">Line</button>'+
          '<button class="gtxLWCBtn" data-chart-type="mountain" type="button">Mountain</button>'+
          '<select class="gtxLWCSelect" id="gtxLWCChartTF" aria-label="Chart timeframe"></select>'+
        '</div>'+
      '</div>'+
      '<div class="gtxLWCTradeLine" id="gtxLWCTradeStart"></div>'+
      '<div class="gtxLWCTradeLine end" id="gtxLWCTradeEnd"></div>'+
      '<div class="gtxLWCFlag" id="gtxLWCFlag">🚩</div>'+
      '<div class="gtxLWCWatermark">VERIFIED MARKET DATA</div>'+
      '<div class="gtxLWCNotice" id="gtxLWCNotice">Connecting to a verified market-data feed…</div>';
    chartHost.replaceChildren(box);

    const tfSelect=document.getElementById("gtxLWCChartTF");
    Object.keys(CFG.intervals).forEach(t=>{
      const o=document.createElement("option");
      o.value=t;o.textContent=t;
      if(t===state.tf)o.selected=true;
      tfSelect.appendChild(o);
    });
    tfSelect.onchange=()=>setTimeframe(tfSelect.value);

    box.querySelectorAll("[data-chart-type]").forEach(b=>{
      b.addEventListener("click",()=>{
        state.chartType=b.dataset.chartType||"candle";
        try{localStorage.setItem(TYPE_KEY,state.chartType)}catch(_){}
        updateTypeButtons();
        applySeriesVisibility();
      });
    });

    try{
      const saved=localStorage.getItem(CHART_KEY);
      if(CFG.intervals[saved]){state.tf=saved;state.sec=CFG.intervals[saved];tfSelect.value=saved}
      const savedType=localStorage.getItem(TYPE_KEY);
      if(["candle","line","mountain"].includes(savedType))state.chartType=savedType;
    }catch(_){}
    updateTypeButtons();
    return true;
  }

  function status(t,ok){
    const e=document.getElementById("gtxLWCStatus");if(!e)return;
    e.textContent=t;e.style.color=ok?"#8ff0ae":"#b5c7d8";
    e.style.borderColor=ok?"#1f6c40":"#31506d";
  }
  function notice(t,show=true){
    const e=document.getElementById("gtxLWCNotice");if(e){e.textContent=t;e.hidden=!show}
  }
  function assetText(){
    const a=document.getElementById("gtxLWCAsset");
    if(a)a.textContent=(state.mode==="LIVE"?"LIVE":"OTC")+" • "+(state.assetLabel||"");
  }
  function updateTypeButtons(){
    document.querySelectorAll("#gtxLiveChart [data-chart-type]").forEach(b=>{
      b.classList.toggle("active",b.dataset.chartType===state.chartType);
    });
  }
  function bucket(ms,sec){return Math.floor(ms/1000/sec)*sec*1000}

  function addTick(ts,price,volume){
    if(!Number.isFinite(price)||!Number.isFinite(ts))return;
    const b=bucket(ts,state.sec);
    let c=state.candles[state.candles.length-1];
    if(!c||c.t!==b){
      c={t:b,o:price,h:price,l:price,c:price,v:Number(volume||0)};
      state.candles.push(c);
      if(state.candles.length>500)state.candles.shift();
    }else{
      c.h=Math.max(c.h,price);
      c.l=Math.min(c.l,price);
      c.c=price;
      c.v+=Number(volume||0);
    }
    state.prev=state.price;
    state.price=price;
    updateLiveSeries(c);
  }

  function closeSocket(){
    if(state.ws){try{state.ws.close()}catch(_){}state.ws=null}
  }

  async function loadBybitHistory(){
    // Keep the 604 "100% perfect" chart UI/behavior, but route history through
    // GoTradeX's verified server adapter instead of exposing exchange calls in the browser.
    if(!feed()||typeof feed().bybitHistory!=="function"){
      throw new Error("Verified crypto market-data adapter is not loaded.");
    }
    state.candles=await feed().bybitHistory(state.symbol,state.sec);
    state.candles=(Array.isArray(state.candles)?state.candles:[])
      .map(x=>({t:Number(x.t),o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v||0)}))
      .filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite))
      .sort((a,b)=>a.t-b.t);
    if(state.candles.length)state.price=state.candles[state.candles.length-1].c;
  }

  function historyReady(){
    // Never paint a tiny one/two-candle chart and then progressively zoom it out.
    // The first render requires a real historical window.
    return state.candles.length >= 12;
  }

  async function resolveTwelveSymbol(f){
    if(f.provider!=="TWELVE_DATA_LOOKUP")return f.symbol;
    return await feed().twelveSearch(f.symbol);
  }

  async function loadTwelveHistory(symbol){
    state.candles=await feed().twelveHistory(symbol,state.sec);
    state.candles=state.candles.filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
    if(state.candles.length)state.price=state.candles[state.candles.length-1].c;
  }

  function connectBybit(){
    const id=++state.connectionId;
    closeSocket();
    const f=selection();
    if(!f.available||f.provider!=="BYBIT"){
      state.connected=false;status("NO VERIFIED LIVE FEED",false);
      notice(f.reason||"Selected asset is not available on the verified Bybit Spot feed.",true);
      return;
    }
    state.provider=f.provider;state.symbol=f.symbol;state.assetLabel=f.label;assetText();
    state.connected=false;status("LOADING • BYBIT",false);
    notice("Loading verified historical candles…",true);

    loadBybitHistory().then(()=>{
      if(id!==state.connectionId)return;
      if(!historyReady()){
        state.connected=false;
        status("WAITING FOR HISTORY",false);
        notice("Waiting for enough verified historical candles before displaying the chart…",true);
        setTimeout(()=>{if(id===state.connectionId)connect()},2500);
        return;
      }
      renderHistory();
      const ws=new WebSocket("wss://stream.bybit.com/v5/public/spot");
      state.ws=ws;
      ws.onopen=()=>{
        if(id!==state.connectionId){try{ws.close()}catch(_){}return}
        state.connected=true;
        status("LIVE • BYBIT WEBSOCKET",true);
        notice("",false);
        ws.send(JSON.stringify({op:"subscribe",args:["publicTrade."+state.symbol]}));
      };
      ws.onmessage=e=>{
        if(id!==state.connectionId)return;
        try{
          const j=JSON.parse(e.data);
          if(Array.isArray(j.data))j.data.forEach(t=>addTick(Number(t.T||Date.now()),Number(t.p),Number(t.v)));
        }catch(_){}
      };
      ws.onerror=()=>{
        if(id!==state.connectionId)return;
        state.connected=false;status("FEED ERROR",false);notice("Bybit live stream error. Retrying…",true);
      };
      ws.onclose=()=>{
        if(id!==state.connectionId)return;
        state.connected=false;status("RECONNECTING • BYBIT",false);
        setTimeout(()=>{if(id===state.connectionId)connect()},2500);
      };
    }).catch(e=>{
      if(id!==state.connectionId)return;
      state.connected=false;status("FEED ERROR",false);
      notice(e.message||"Verified Bybit historical data unavailable.",true);
    });
  }

  function connectTwelve(){
    const id=++state.connectionId;
    closeSocket();
    const f=selection();
    if(!f.available||!String(f.provider).startsWith("TWELVE_DATA")){
      state.connected=false;status("NO VERIFIED LIVE FEED",false);
      notice(f.reason||"No verified provider is available for this asset.",true);
      return;
    }
    state.assetLabel=f.label;assetText();
    status("VERIFYING • TWELVE DATA",false);
    notice("Loading verified historical candles…",true);
    resolveTwelveSymbol(f).then(async symbol=>{
      if(id!==state.connectionId)return;
      state.symbol=symbol;state.provider="TWELVE_DATA";
      // Twelve Data provides verified live prices for this adapter. For sub-minute
      // chart timeframes we build 5/15/30-second candles only from those real
      // provider ticks; we never fabricate startup history.
      if(state.sec>=60)await loadTwelveHistory(symbol);
      if(id!==state.connectionId)return;
      if(state.sec>=60 && !historyReady()){
        state.connected=false;
        status("WAITING FOR HISTORY",false);
        notice("Waiting for enough verified historical candles before displaying the chart…",true);
        return;
      }
      if(state.sec>=60)renderHistory();
      const socket=await feed().twelveSocket(symbol,
        tick=>{
          if(id!==state.connectionId)return;
          addTick(tick.time,tick.price,0);
          if(!state.historyLoaded && historyReady()){
            try{renderHistory();status("LIVE • TWELVE DATA",true);notice("",false)}catch(e){
              status("CHART ENGINE ERROR",false);notice(e.message||"Unable to render live candles.",true);
            }
          }
        },
        (msg,ok)=>{
          if(id!==state.connectionId)return;
          state.connected=!!ok;
          status(ok?"LIVE • TWELVE DATA":msg,!!ok);
          if(ok)notice("",false);
        }
      );
      if(id!==state.connectionId){try{socket.close()}catch(_){}return}
      state.ws=socket;
    }).catch(e=>{
      if(id!==state.connectionId)return;
      state.connected=false;status("NO VERIFIED LIVE FEED",false);
      notice(e.message||"The selected symbol is not available through the configured verified provider.",true);
    });
  }

  function connectOTC(){
    const id=++state.connectionId;
    closeSocket();
    const f=selection();
    if(!f.available||f.provider!=="GOTRADEX_OTC"){
      state.connected=false;status("OTC FEED UNAVAILABLE",false);
      notice(f.reason||"The selected OTC asset is not available.",true);
      return;
    }
    state.provider=f.provider;state.symbol=f.symbol;state.assetLabel=f.label;assetText();
    state.connected=false;status("OTC • LOADING",false);notice("Loading isolated OTC candles…",true);
    feed().otcHistory(f.symbol,state.sec).then(async history=>{
      if(id!==state.connectionId)return;
      state.candles=Array.isArray(history)?history:[];
      if(state.candles.length)state.price=state.candles[state.candles.length-1].c;
      if(state.candles.length)renderHistory();
      const socket=await feed().otcSocket(f.symbol,
        tick=>{
          if(id!==state.connectionId)return;
          addTick(tick.time,tick.price,0);
          if(!state.historyLoaded && state.candles.length)try{renderHistory()}catch(_){}
        },
        (msg,ok)=>{
          if(id!==state.connectionId)return;
          state.connected=!!ok;status(msg,!!ok);
          if(ok)notice("",false);
        }
      );
      if(id!==state.connectionId){try{socket.close()}catch(_){}return}
      state.ws=socket;
    }).catch(e=>{
      if(id!==state.connectionId)return;
      state.connected=false;status("OTC FEED ERROR",false);
      notice(e.message||"Unable to read isolated OTC chart data.",true);
    });
  }

  function connect(){
    ++state.connectionId;
    const f=selection();
    state.mode=String(f.mode||"LIVE").toUpperCase();
    state.type=f.type||"";
    state.assetLabel=f.label||"";
    state.candles=[];state.price=null;state.prev=null;state.tradeStart=null;state.tradeEnd=null;
    state.historyLoaded=false;state.initialRangeSet=false;assetText();
    if(state.mode==="OTC"){
      if(f.provider==="GOTRADEX_OTC")connectOTC();
      else{closeSocket();state.connected=false;status("OTC FEED UNAVAILABLE",false);notice(f.reason||"The selected OTC asset is not available.",true)}
      return;
    }
    if(f.provider==="BYBIT")connectBybit();
    else if(String(f.provider).startsWith("TWELVE_DATA"))connectTwelve();
    else{closeSocket();state.connected=false;status("NO VERIFIED LIVE FEED",false);notice(f.reason||"No verified live feed is connected for this asset.",true)}
  }

  function setTimeframe(tf){
    if(!CFG.intervals[tf])return;
    state.tf=tf;state.sec=CFG.intervals[tf];
    try{localStorage.setItem(CHART_KEY,tf)}catch(_){}
    const s=document.getElementById("gtxLWCChartTF");if(s)s.value=tf;
    connect();
  }

  function precisionForPrice(p){
    const n=Math.abs(Number(p)||0);
    if(n>=1000)return 2;
    if(n>=100)return 3;
    if(n>=1)return state.type==="forex"||state.type==="metals"?5:4;
    return 6;
  }

  function sma(period){
    const out=[];
    for(let i=period-1;i<state.candles.length;i++){
      let sum=0;
      for(let j=i-period+1;j<=i;j++)sum+=state.candles[j].c;
      out.push({time:Math.floor(state.candles[i].t/1000),value:sum/period});
    }
    return out;
  }

  function seriesCandleData(){
    return state.candles.map(c=>({
      time:Math.floor(c.t/1000),
      open:Number(c.o),high:Number(c.h),low:Number(c.l),close:Number(c.c)
    }));
  }

  function seriesLineData(){
    return state.candles.map(c=>({time:Math.floor(c.t/1000),value:Number(c.c)}));
  }

  function removeSeriesSafe(s){
    if(!s||!state.chart)return;
    try{state.chart.removeSeries(s)}catch(_){}
  }

  function buildChart(){
    if(state.chart)return;
    const C=window.LightweightCharts;
    const host=document.getElementById("gtxLWC");
    if(!C||!host)throw new Error("Lightweight Charts library did not load.");
    state.chart=C.createChart(host,{
      autoSize:true,
      layout:{background:{type:C.ColorType.Solid,color:"#07111d"},textColor:"#a9bdd0",fontFamily:"Inter,system-ui,sans-serif",fontSize:11},
      grid:{vertLines:{color:"#16283a",style:C.LineStyle.Solid},horzLines:{color:"#16283a",style:C.LineStyle.Solid}},
      rightPriceScale:{visible:true,borderVisible:false,minimumWidth:58,scaleMargins:{top:.08,bottom:.12}},
      leftPriceScale:{visible:false,borderVisible:false},
      timeScale:{borderVisible:false,timeVisible:true,secondsVisible:state.sec<60,barSpacing:9,minBarSpacing:3,rightOffset:5,fixLeftEdge:false},
      crosshair:{mode:C.CrosshairMode.Normal,vertLine:{color:"#58718a",width:1,style:C.LineStyle.Dashed,labelBackgroundColor:"#263d53"},horzLine:{color:"#58718a",width:1,style:C.LineStyle.Dashed,labelBackgroundColor:"#263d53"}},
      handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
      handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}
    });

    state.candleSeries=state.chart.addCandlestickSeries({
      upColor:"#22c55e",downColor:"#ef4444",
      borderUpColor:"#22c55e",borderDownColor:"#ef4444",
      wickUpColor:"#a7f3c2",wickDownColor:"#fca5a5",
      priceLineVisible:false,lastValueVisible:true
    });
    state.lineSeries=state.chart.addLineSeries({color:"#42d392",lineWidth:2,priceLineVisible:false,lastValueVisible:true});
    state.areaSeries=state.chart.addAreaSeries({lineColor:"#42d392",topColor:"#42d39255",bottomColor:"#42d39205",lineWidth:2,priceLineVisible:false,lastValueVisible:true});
    state.ma50=state.chart.addLineSeries({color:"#22e36f",lineWidth:2,priceLineVisible:false,lastValueVisible:false});
    state.ma100=state.chart.addLineSeries({color:"#f59e0b",lineWidth:2,priceLineVisible:false,lastValueVisible:false});
    state.ma200=state.chart.addLineSeries({color:"#3b82f6",lineWidth:2,priceLineVisible:false,lastValueVisible:false});
    state.currentPriceLine=state.candleSeries.createPriceLine({
      price:0,color:"#f5a623",lineWidth:1,lineStyle:C.LineStyle.Dashed,
      axisLabelVisible:true,title:"LIVE"
    });
    applySeriesVisibility();
    state.chart.timeScale().subscribeSizeChange(()=>positionTradeOverlay());
    state.chart.timeScale().subscribeVisibleLogicalRangeChange(()=>positionTradeOverlay());
  }

  function applySeriesVisibility(){
    if(!state.chart)return;
    const candle=state.chartType==="candle";
    const line=state.chartType==="line";
    const mountain=state.chartType==="mountain";
    state.candleSeries?.applyOptions({visible:candle});
    state.lineSeries?.applyOptions({visible:line});
    state.areaSeries?.applyOptions({visible:mountain});
    const ind=candle;
    state.ma50?.applyOptions({visible:ind});
    state.ma100?.applyOptions({visible:ind});
    state.ma200?.applyOptions({visible:ind});
  }

  function renderHistory(){
    if(!state.chart)buildChart();
    const candles=seriesCandleData();
    const lines=seriesLineData();
    state.candleSeries.setData(candles);
    state.lineSeries.setData(lines);
    state.areaSeries.setData(lines);
    state.ma50.setData(sma(50));
    state.ma100.setData(sma(100));
    state.ma200.setData(sma(200));
    state.historyLoaded=candles.length>0;
    state.initialRangeSet=false;
    applySeriesVisibility();
    updateCurrentPriceLine();
    if(candles.length){
      const from=Math.max(0,candles.length-60);
      state.chart.timeScale().setVisibleLogicalRange({from,to:candles.length+4});
      state.initialRangeSet=true;
    }
    positionTradeOverlay();
    notice("",false);
  }

  function smaValue(period){
    if(state.candles.length<period)return null;
    let sum=0;
    for(let i=state.candles.length-period;i<state.candles.length;i++)sum+=Number(state.candles[i].c);
    return sum/period;
  }

  function updateLiveSeries(c){
    if(!state.chart||!state.historyLoaded){
      if(historyReady()){try{buildChart();renderHistory()}catch(e){notice(e.message||"Chart engine error.",true)}}
      return;
    }
    const item={time:Math.floor(c.t/1000),open:Number(c.o),high:Number(c.h),low:Number(c.l),close:Number(c.c)};
    state.candleSeries.update(item);
    state.lineSeries.update({time:item.time,value:item.close});
    state.areaSeries.update({time:item.time,value:item.close});
    for(const [series,period] of [[state.ma50,50],[state.ma100,100],[state.ma200,200]]){
      const value=smaValue(period);
      if(value!==null)series.update({time:item.time,value});
    }
    state.price=c.c;
    updateCurrentPriceLine();
    positionTradeOverlay();
  }

  function updateCurrentPriceLine(){
    if(!state.currentPriceLine||!Number.isFinite(state.price))return;
    const C=window.LightweightCharts;
    state.currentPriceLine.applyOptions({
      price:Number(state.price),
      color:"#f5a623",
      lineWidth:1,
      lineStyle:C.LineStyle.Dashed,
      axisLabelVisible:true,
      title:"LIVE"
    });
  }

  function observeTradeMarkers(){
    if(state.markersInstalled)return;
    state.markersInstalled=true;
    document.addEventListener("click",e=>{
      const b=e.target.closest("#buy,#sell");
      if(!b||!Number.isFinite(state.price))return;
      state.tradeStart={time:bucket(Date.now(),state.sec),price:state.price,side:b.id==="buy"?"BUY":"SELL"};
      state.tradeEnd=null;
      try{
        const markerTime=Math.floor(state.tradeStart.time/1000);
        state.candleSeries?.setMarkers([{
          time:markerTime,
          position:b.id==="buy"?"belowBar":"aboveBar",
          color:b.id==="buy"?"#22c55e":"#ef4444",
          shape:b.id==="buy"?"arrowUp":"arrowDown",
          text:b.id==="buy"?"BUY":"SELL",
          size:2
        }]);
      }catch(_){}
      positionTradeOverlay();
    },true);
  }

  function positionTradeOverlay(){
    if(!state.chart||!state.tradeStart)return;
    const x=state.chart.timeScale().timeToCoordinate(Math.floor(state.tradeStart.time/1000));
    const line=document.getElementById("gtxLWCTradeStart");
    const flag=document.getElementById("gtxLWCFlag");
    if(x!==null&&x!==undefined){
      line.style.left=x+"px";line.style.display="block";
      flag.style.left=x+"px";
      const y=state.candleSeries?.priceToCoordinate(state.tradeStart.price);
      if(y!==null&&y!==undefined){flag.style.top=y+"px";flag.style.display="block"}
    }
    if(state.tradeEnd){
      const ex=state.chart.timeScale().timeToCoordinate(Math.floor(state.tradeEnd.time/1000));
      const end=document.getElementById("gtxLWCTradeEnd");
      if(ex!==null&&ex!==undefined){end.style.left=ex+"px";end.style.display="block"}
    }
  }

  function installLibraryAndStart(){
    if(window.LightweightCharts){start();return}
    if(window.__gtxLwcPromise){window.__gtxLwcPromise.then(start).catch(e=>{status("CHART ENGINE ERROR",false);notice(e.message||"Lightweight Charts could not load.",true)});return}
    window.__gtxLwcPromise=new Promise((resolve,reject)=>{
      let i=0;
      const tryNext=()=>{
        if(window.LightweightCharts){resolve();return}
        if(i>=LWC_URLS.length){reject(new Error("Could not load the Lightweight Charts library."));return}
        const s=document.createElement("script");
        s.src=LWC_URLS[i++];s.async=true;
        s.onload=()=>window.LightweightCharts?resolve():tryNext();
        s.onerror=()=>tryNext();
        document.head.appendChild(s);
      };
      tryNext();
    });
    window.__gtxLwcPromise.then(start).catch(e=>{
      status("CHART ENGINE ERROR",false);
      notice(e.message||"Lightweight Charts could not load.",true);
    });
  }

  function start(){
    try{
      buildChart();
      connect();
    }catch(e){
      status("CHART ENGINE ERROR",false);
      notice(e.message||"Unable to start the chart engine.",true);
    }
  }

  function watchSelection(){
    const f=selection();
    const k=[f.provider,f.symbol,f.label,f.type,String(f.mode||"LIVE").toUpperCase()].join("|");
    if(k!==state.lastAssetKey){
      state.lastAssetKey=k;
      connect();
    }
  }

  function boot(){
    if(state.booted)return;
    if(!mount()){setTimeout(boot,300);return}
    state.booted=true;
    installLibraryAndStart();
    observeTradeMarkers();
    setInterval(watchSelection,700);
  }

  window.GoTradeXLiveChart={
    boot,setTimeframe,reconnect:connect,state,
    chartVersion:"Lightweight Charts 4.2.2",
    engine:"TradingView Lightweight Charts"
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
