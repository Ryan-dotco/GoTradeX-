/* GoTradeX LIVE Chart Layer — TradingView Lightweight Charts experiment.
 * Uses the existing verified GoTradeX feed registry; no synthetic/demo candles.
 * The chart timeframe is independent from the trade-expiration timeframe.
 */
(function(){
  "use strict";
  if(window.GoTradeXLiveChart) return;

  const LWC_URL="https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js";
  const CFG={
    intervals:{
      "5 Seconds":5,"15 Seconds":15,"30 Seconds":30,"1 Minute":60,
      "2 Minutes":120,"5 Minutes":300,"15 Minutes":900,"30 Minutes":1800,
      "1 Hour":3600,"4 Hours":14400
    }
  };

  const CHART_KEY="gotradex_chart_timeframe";
  const TYPE_KEY="gotradex_chart_type";
  const TZ_KEY="gotradex_chart_timezone";

  let state={
    tf:"5 Minutes",sec:300,candles:[],price:null,prev:null,ws:null,
    provider:"",symbol:"",assetLabel:"BTC/USDT",mode:"LIVE",type:"crypto",
    connected:false,tradeStart:null,tradeEnd:null,lastAssetKey:"",connectionId:0,
    chart:null,candleSeries:null,lineSeries:null,areaSeries:null,volumeSeries:null,
    ma50:null,ma100:null,ma200:null,currentPriceLine:null,
    chartType:"candle",historyLoaded:false,initialRangeSet:false,resizeObserver:null,
    booted:false,markersInstalled:false,timezone:"local",clockTimer:null,patternsVisible:false,heikin:false,tools:new Set(),toolSeries:{},toolLines:[],toolMarkers:[],indicatorPanels:{}
  };

  function feed(){return window.GoTradeXMarketFeeds}
  async function loadTwelveHistory(symbol,sec){
    const api=feed();
    if(!api?.twelveHistory) throw new Error("Verified Twelve Data history adapter is unavailable.");
    const candles=await api.twelveHistory(symbol,sec);
    if(!Array.isArray(candles)||!candles.length) throw new Error("No verified Twelve Data historical candles were returned for "+symbol+".");
    state.candles=candles.map(x=>({
      t:Number(x.t),o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v||0)
    })).filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
    if(!state.candles.length) throw new Error("Verified Twelve Data returned no usable candles for "+symbol+".");
    state.price=state.candles[state.candles.length-1].c;
  }


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
      ".gtxLWCHead{position:absolute;z-index:30;top:6px;left:7px;right:7px;display:block;pointer-events:none}"+
      ".gtxLWCHead>*{pointer-events:auto}"+
      ".gtxLWCAsset{display:inline-block;font:900 11px/1 system-ui;color:#fff;background:#0b2036e8;border:1px solid #254c70;border-radius:6px;padding:6px 8px;white-space:nowrap}"+
      ".gtxLWCStatus{font:800 9px/1 system-ui;color:#8ff0ae;background:#082014e8;border:1px solid #1f6c40;border-radius:6px;padding:6px 7px;white-space:nowrap}"+".gtxLWCClock{display:inline-block;margin-left:5px;font:900 10px/1 system-ui;color:#fff;background:#0b2036e8;border:2px solid #f5a623;border-radius:6px;padding:6px 7px;white-space:nowrap;font-variant-numeric:tabular-nums;box-shadow:0 2px 8px #0008}"+
      ".gtxLWCControl{position:absolute;top:0;right:0;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:78%;pointer-events:auto}"+
      ".gtxLWCBtn{border:1px solid #31597f;background:#102945;color:#dcecff;border-radius:5px;padding:5px 7px;font:800 9px system-ui;cursor:pointer}"+
      ".gtxLWCBtn.active{background:#20a96b;color:#fff;border-color:#54e09a}"+
      ".gtxLWCSelect{border:2px solid #f5a623;background:#102945;color:#fff;border-radius:6px;padding:6px 8px;font:900 10px system-ui;min-width:92px;min-height:30px;box-shadow:0 2px 8px #0008}"+
      ".gtxLWCNotice{position:absolute;z-index:8;left:12px;right:70px;top:82px;display:grid;place-items:center;text-align:center;color:#7695b2;font:800 11px/1.4 system-ui;pointer-events:none}"+
      ".gtxLWCNotice[hidden]{display:none}"+
      ".gtxLWCTradeLine{position:absolute;z-index:9;top:0;bottom:28px;width:2px;display:none;pointer-events:none;border-left:2px dashed #f5a623}"+
      ".gtxLWCTradeLine.end{border-left-color:#fff}"+
      ".gtxLWCFlag{position:absolute;z-index:11;transform:translate(-50%,-100%);display:none;font:900 12px/1 system-ui;filter:drop-shadow(0 2px 3px #000);pointer-events:none}"+
      ".gtxLWCWatermark{position:absolute;z-index:2;right:70px;bottom:34px;color:#42627e;font:900 10px system-ui;letter-spacing:.08em;pointer-events:none}"+
      ".gtxIndicatorPanels{display:flex;flex-direction:column;gap:4px;background:#07111d}"+
      ".gtxIndicatorPanel{height:86px;position:relative;background:#07111d;border-top:1px solid #16283a;overflow:hidden}"+
      ".gtxIndicatorPanel canvas{position:absolute;inset:0;width:100%;height:100%}"+
      ".gtxIndicatorTitle{position:absolute;z-index:2;left:8px;top:5px;font:900 9px/1 system-ui;color:#9fb6ca;background:#07111dcc;padding:3px 5px;border-radius:4px}"+
      ".gtxChartSettings{position:fixed;z-index:9999;inset:0;background:#0009;display:none;align-items:flex-end;justify-content:center}"+
      ".gtxChartSettings.open{display:flex}"+
      ".gtxChartSettingsCard{width:min(520px,100%);background:#0b1725;border:1px solid #31506d;border-radius:14px 14px 0 0;padding:16px;box-shadow:0 -8px 30px #0008}"+
      ".gtxChartSettingsRow{display:flex;gap:10px;align-items:center;margin:10px 0}.gtxChartSettingsRow label{flex:1;color:#cfe1f2;font:800 12px system-ui}.gtxChartSettingsRow select{flex:1;border:1px solid #31597f;background:#102945;color:#fff;border-radius:7px;padding:9px;font:800 11px system-ui}"+
      ".gtxChartSettingsActions{display:flex;gap:8px;justify-content:flex-end}.gtxChartSettingsActions button{border:1px solid #31597f;background:#102945;color:#fff;border-radius:7px;padding:9px 13px;font:900 11px system-ui}.gtxChartSettingsActions .primary{background:#20a96b;border-color:#54e09a}"+
      "@media(max-width:600px){#gtxLiveChart{height:clamp(300px,50vh,440px);min-height:300px}.gtxLWCAsset{font-size:9px;padding:5px 6px}.gtxLWCStatus{font-size:8px;padding:5px}.gtxLWCClock{font-size:9px;padding:5px 6px}.gtxLWCControl{top:38px;left:0;right:0;max-width:100%;justify-content:flex-start}.gtxLWCBtn{font-size:8px;padding:5px 6px}.gtxLWCSelect{font-size:9px;padding:5px 6px;min-width:92px;min-height:30px}.gtxLWCNotice{top:78px}.gtxLWCWatermark{display:none}}";
    document.head.appendChild(s);
  }

  function installChartUiStyle(){if(document.getElementById("gtxChartUiBorderless"))return;const st=document.createElement("style");st.id="gtxChartUiBorderless";st.textContent=".gtxLWCStatusOnly{border:0!important;background:transparent!important;box-shadow:none!important;padding:2px 4px!important}.gtxLWCHead{border:0!important;box-shadow:none!important}.gtxLWCAsset{display:none!important}.gtxLWCClock{border:0!important;background:transparent!important;box-shadow:none!important}.gtxLWCControl{border:0!important;background:transparent!important;box-shadow:none!important}";document.head.appendChild(st)}
  function mount(){
    if(document.getElementById("gtxLiveChart"))return true;
    const pair=document.querySelector(".pairbar"),bottom=document.querySelector(".bottom");
    if(!pair||!bottom||!bottom.parentNode)return false;
    injectStyle();
    const box=document.createElement("section");
    box.id="gtxLiveChart";
    box.setAttribute("aria-label","GoTradeX verified live candlestick chart");
    box.innerHTML=
      '<div id="gtxLWC"></div>'+
      '<div class="gtxLWCHead gtxLWCStatusOnly">'+
        '<span class="gtxLWCStatus" id="gtxLWCStatus">CONNECTING</span>'+
        '<span class="gtxLWCClock" id="gtxLWCClock" aria-label="Current chart date and time"></span>'+
      '</div>'+
      '<div id="gtxIndicatorPanels" class="gtxIndicatorPanels"></div>'+
      '<div class="gtxLWCTradeLine" id="gtxLWCTradeStart"></div>'+
      '<div class="gtxLWCTradeLine end" id="gtxLWCTradeEnd"></div>'+
      '<div class="gtxLWCFlag" id="gtxLWCFlag">🚩</div>'+
      '<div class="gtxLWCWatermark">VERIFIED MARKET DATA</div>'+
      '<div class="gtxLWCNotice" id="gtxLWCNotice">Connecting to a verified market-data feed…</div>';
    pair.insertAdjacentElement("afterend",box);

    const savedTf=(()=>{try{return localStorage.getItem(CHART_KEY)}catch(_){return null}})();
    if(CFG.intervals[savedTf]){state.tf=savedTf;state.sec=CFG.intervals[savedTf]}
    const savedType=(()=>{try{return localStorage.getItem(TYPE_KEY)}catch(_){return null}})();
    if(["candle","line","mountain"].includes(savedType))state.chartType=savedType;
    const savedTz=(()=>{try{return localStorage.getItem(TZ_KEY)}catch(_){return null}})();
    if(savedTz)state.timezone=savedTz;
    updateTypeButtons();
    applyTimeFormatting();
    startClock();
    installSettingsUi();
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
  function normalizeEpochMs(v){const n=Number(v);if(!Number.isFinite(n))return Date.now();return n<1e11?Math.floor(n*1000):Math.floor(n)}
  function bucket(ms,sec){return Math.floor(ms/1000/sec)*sec*1000}

  function addTick(ts,price,volume){
    ts=normalizeEpochMs(ts);
    if(!Number.isFinite(price)||!Number.isFinite(ts))return;
    const b=bucket(ts,state.sec);
    let c=state.candles[state.candles.length-1];
    let newBucket=false;
    if(!c||c.t!==b){
      c={t:b,o:price,h:price,l:price,c:price,v:Number(volume||0)};
      state.candles.push(c);
      newBucket=true;
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
    // Keep the bottom time scale attached to the live candle stream.
    // If the viewer is already at the live edge, advance the viewport as
    // each new candle bucket is created. Do not pull the user away from
    // older candles if they deliberately scrolled back into history.
    if(newBucket&&state.chart&&state.historyLoaded){
      try{
        const ts=state.chart.timeScale();
        const pos=ts.scrollPosition();
        if(pos===null||pos<=12)ts.scrollToRealTime();
      }catch(_){}
    }
  }

  function closeSocket(){
    if(state.ws){try{state.ws.close()}catch(_){}state.ws=null}
  }

  async function loadBybitHistory(){
    if(!feed()?.bybitHistory)throw new Error("Verified server market-data history is unavailable.");
    const candles=await feed().bybitHistory(state.symbol,state.sec);
    if(!Array.isArray(candles)||!candles.length)throw new Error("No verified Bybit historical candles were returned.");
    state.candles=candles.map(x=>({
      t:Number(x.t),o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v||0)
    })).filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
    if(!state.candles.length)throw new Error("Verified Bybit returned no usable candles.");
    state.price=state.candles[state.candles.length-1].c;
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

  function historyReady(){
    // Twelve Data does not provide native 5/15/30-second history in this adapter.
    // For those intervals, show the first candle as soon as one real provider tick
    // arrives, then build subsequent buckets only from verified ticks.
    if(state.provider==="TWELVE_DATA" && state.sec<60) return state.candles.length>=1;
    // Native historical feeds still require a real historical window before render.
    if(state.provider==="BYBIT" && state.sec<60) return state.candles.length>=1;
    return state.candles.length >= 12;
  }

  async function resolveTwelveSymbol(f){
    const requested=String(f?.symbol||f?.label||"").trim();
    if(!requested)throw new Error("No asset symbol was supplied to the verified provider.");
    const aliases={
      "WTI Oil":"WTI/USD","Brent Oil":"BRENT/USD","Natural Gas":"NATGAS/USD",
      "Copper":"HG1","Platinum":"XPT/USD","Palladium":"XPD/USD",
      "US30":"DJI","US500":"SPX","NAS100":"NDX","UK100":"FTSE","GER40":"DAX",
      "FRA40":"CAC","JPN225":"N225","AUS200":"ASX","HK50":"HSI","EU50":"STOXX50E","SA40":"JTOPI"
    };
    return aliases[requested]||requested;
  }

  function clearChartForNewAsset(){
    try{
      if(state.candleSeries)state.candleSeries.setData([]);
      if(state.lineSeries)state.lineSeries.setData([]);
      if(state.areaSeries)state.areaSeries.setData([]);
      if(state.volumeSeries)state.volumeSeries.setData([]);
      if(state.ma50)state.ma50.setData([]);
      if(state.ma100)state.ma100.setData([]);
      if(state.ma200)state.ma200.setData([]);
    }catch(_){}
    state.historyLoaded=false;
    state.initialRangeSet=false;
    state.price=null;
    state.prev=null;
    state.candles=[];
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

  function connect(){
    ++state.connectionId;
    const f=selection();
    state.mode=String(f.mode||"LIVE").toUpperCase();
    state.type=f.type||"";
    state.assetLabel=f.label||"";
    state.tradeStart=null;state.tradeEnd=null;
    clearChartForNewAsset();
    assetText();
    notice("Switching to verified candles for "+(state.assetLabel||"the selected asset")+"…",true);
    if(state.mode!=="LIVE"){
      closeSocket();state.connected=false;status("OTC • FEED REQUIRED",false);
      notice("OTC 24/7 selected. No fake candles are generated; a verified OTC feed must be connected.",true);
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
    connect();
  }

  function timezoneOffsetMs(ts){
    if(state.timezone==="local")return -new Date(ts).getTimezoneOffset()*60000;
    const m=state.timezone.match(/^UTC([+-])(\d+)(?::(\d+))?$/);if(!m)return 0;
    const mins=Number(m[2])*60+Number(m[3]||0);return (m[1]==="+"?mins:-mins)*60000;
  }
  function formatChartTime(ts){const d=new Date(Number(ts)*1000+timezoneOffsetMs(Number(ts)*1000));const p=n=>String(n).padStart(2,"0");return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;}
  function applyTimeFormatting(){if(state.chart)state.chart.applyOptions({localization:{timeFormatter:formatChartTime}});}
  function updateClock(){const e=document.getElementById("gtxLWCClock");if(e){e.textContent=formatChartTime(Math.floor(Date.now()/1000));e.title=`Chart time zone: ${state.timezone}`;}}
  function startClock(){if(state.clockTimer)clearInterval(state.clockTimer);updateClock();state.clockTimer=setInterval(updateClock,1000);}

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

  function volumeData(){
    return state.candles.filter(c=>Number.isFinite(Number(c.v))&&Number(c.v)>0).map(c=>({
      time:Math.floor(c.t/1000),
      value:Number(c.v),
      color:c.c>=c.o?"#26a69a99":"#ef535099"
    }));
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
      rightPriceScale:{visible:true,borderVisible:false,minimumWidth:72,autoScale:true,scaleMargins:{top:.08,bottom:.12}},
      leftPriceScale:{visible:false,borderVisible:false},
      timeScale:{borderVisible:false,timeVisible:true,secondsVisible:state.sec<60,barSpacing:9,minBarSpacing:3,rightOffset:5,fixLeftEdge:false,lockVisibleTimeRangeOnResize:false},
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
    state.volumeSeries=state.chart.addHistogramSeries({priceFormat:{type:"volume"},priceScaleId:"volume",scaleMargins:{top:.82,bottom:0},base:0});
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
    state.ma50?.applyOptions({visible:false});
    state.ma100?.applyOptions({visible:false});
    state.ma200?.applyOptions({visible:false});
    state.volumeSeries?.applyOptions({visible:false});
  }

  function heikinData(){
    const out=[];let prev=null;
    for(const c of state.candles){
      const close=(c.o+c.h+c.l+c.c)/4;
      const open=prev?((prev.open+prev.close)/2):((c.o+c.c)/2);
      out.push({time:Math.floor(c.t/1000),open,high:Math.max(c.h,open,close),low:Math.min(c.l,open,close),close});
      prev={open,close};
    }
    return out;
  }
  function patternMarkers(){
    const out=[];
    for(let i=1;i<state.candles.length;i++){
      const a=state.candles[i-1],b=state.candles[i],body=Math.abs(b.c-b.o),range=Math.max(b.h-b.l,1e-12);
      const upper=b.h-Math.max(b.o,b.c),lower=Math.min(b.o,b.c)-b.l;
      if(body/range<.12)out.push({time:Math.floor(b.t/1000),position:"aboveBar",color:"#f5a623",shape:"circle",text:"DOJI"});
      else if(a.c<a.o&&b.c>b.o&&b.o<=a.c&&b.c>=a.o)out.push({time:Math.floor(b.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"ENGULF"});
      else if(a.c>a.o&&b.c<b.o&&b.o>=a.c&&b.c<=a.o)out.push({time:Math.floor(b.t/1000),position:"aboveBar",color:"#ef4444",shape:"arrowDown",text:"ENGULF"});
      else if(lower>body*2&&upper<body*.8)out.push({time:Math.floor(b.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"HAMMER"});
      else if(upper>body*2&&lower<body*.8)out.push({time:Math.floor(b.t/1000),position:"aboveBar",color:"#ef4444",shape:"arrowDown",text:"SHOOT"});
    }
    return out.slice(-80);
  }
  function applyPatternMarkers(){
    if(!state.candleSeries)return;
    try{state.candleSeries.setMarkers(state.patternsVisible?patternMarkers():[])}catch(_){}
  }
  function renderHistory(){
    if(!state.chart)buildChart();
    const candles=seriesCandleData();
    const lines=seriesLineData();
    state.candleSeries.setData(state.heikin?heikinData():candles);
    state.lineSeries.setData(lines);
    state.areaSeries.setData(lines);
    state.volumeSeries.setData([]);
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
    applyPatternMarkers();
    refreshTools();
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
    state.candleSeries.update(state.heikin?heikinData().at(-1):item);
    state.lineSeries.update({time:item.time,value:item.close});
    state.areaSeries.update({time:item.time,value:item.close});
    // Volume histogram intentionally disabled; keep the live chart single-pane and clean.
    for(const [series,period] of [[state.ma50,50],[state.ma100,100],[state.ma200,200]]){
      const value=smaValue(period);
      if(value!==null)series.update({time:item.time,value});
    }
    state.price=c.c;
    updateCurrentPriceLine();
    positionTradeOverlay();
  }

  function ema(period){
    const out=[]; if(state.candles.length<period)return out;
    let e=state.candles.slice(0,period).reduce((a,c)=>a+c.c,0)/period;
    out.push({time:Math.floor(state.candles[period-1].t/1000),value:e});
    const k=2/(period+1);
    for(let i=period;i<state.candles.length;i++){e=state.candles[i].c*k+e*(1-k);out.push({time:Math.floor(state.candles[i].t/1000),value:e})}
    return out;
  }
  function highest(i,n){let v=-Infinity;for(let j=Math.max(0,i-n+1);j<=i;j++)v=Math.max(v,state.candles[j].h);return v}
  function lowest(i,n){let v=Infinity;for(let j=Math.max(0,i-n+1);j<=i;j++)v=Math.min(v,state.candles[j].l);return v}
  function rsiData(period=14){
    if(state.candles.length<=period)return [];
    let gain=0,loss=0; for(let i=1;i<=period;i++){const d=state.candles[i].c-state.candles[i-1].c;gain+=Math.max(d,0);loss+=Math.max(-d,0)}
    gain/=period;loss/=period; const out=[]; const rs=loss?gain/loss:100; out.push({time:Math.floor(state.candles[period].t/1000),value:100-(100/(1+rs))});
    for(let i=period+1;i<state.candles.length;i++){const d=state.candles[i].c-state.candles[i-1].c;gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;const r=loss?gain/loss:100;out.push({time:Math.floor(state.candles[i].t/1000),value:100-(100/(1+r))})} return out;
  }
  function atrData(period=14){
    const tr=[]; for(let i=0;i<state.candles.length;i++){const c=state.candles[i],p=state.candles[i-1];tr.push(i===0?c.h-c.l:Math.max(c.h-c.l,Math.abs(c.h-p.c),Math.abs(c.l-p.c)))}
    if(tr.length<period)return []; let a=tr.slice(0,period).reduce((x,y)=>x+y,0)/period; const out=[{time:Math.floor(state.candles[period-1].t/1000),value:a}];
    for(let i=period;i<tr.length;i++){a=(a*(period-1)+tr[i])/period;out.push({time:Math.floor(state.candles[i].t/1000),value:a})} return out;
  }
  function macdData(){const fast=ema(12),slow=ema(26),map=new Map(slow.map(x=>[x.time,x.value]));return fast.filter(x=>map.has(x.time)).map(x=>({time:x.time,value:x.value-map.get(x.time)}))}
  function stochData(period=14){return state.candles.slice(period-1).map((c,k)=>{const i=k+period-1,h=highest(i,period),l=lowest(i,period);return {time:Math.floor(c.t/1000),value:h===l?50:((c.c-l)/(h-l))*100}})}
  function cciData(period=20){return state.candles.slice(period-1).map((c,k)=>{const i=k+period-1;let s=0;for(let j=i-period+1;j<=i;j++)s+=(state.candles[j].h+state.candles[j].l+state.candles[j].c)/3;const ma=s/period;let dev=0;for(let j=i-period+1;j<=i;j++)dev+=Math.abs((state.candles[j].h+state.candles[j].l+state.candles[j].c)/3-ma);dev/=period;const tp=(c.h+c.l+c.c)/3;return {time:Math.floor(c.t/1000),value:dev?((tp-ma)/(.015*dev)):0}})}
  function williamsData(period=14){return state.candles.slice(period-1).map((c,k)=>{const i=k+period-1,h=highest(i,period),l=lowest(i,period);return {time:Math.floor(c.t/1000),value:h===l?-50:((h-c.c)/(h-l))*-100}})}
  function aoData(){return state.candles.map((c,i)=>({i,time:Math.floor(c.t/1000),v:(c.h+c.l)/2})).map((x,i,a)=>{if(i<4)return {time:x.time,value:0};let f=0,su=0;for(let j=i-4;j<=i;j++)f+=a[j].v;for(let j=Math.max(0,i-33);j<=i;j++)su+=a[j].v;return {time:x.time,value:f/5-su/(i<33?i+1:34)}})}
  function alligatorData(){const med=state.candles.map(c=>(c.h+c.l)/2);const sm=(p,shift)=>state.candles.map((c,i)=>{if(i<p-1)return null;let sum=0;for(let j=i-p+1;j<=i;j++)sum+=med[j];return {time:Math.floor(c.t/1000),value:sum/p}}).filter(Boolean).slice(shift);return {jaw:sm(13,0),teeth:sm(8,0),lips:sm(5,0)}}
  function fractalMarkers(){const out=[];for(let i=2;i<state.candles.length-2;i++){const c=state.candles[i];if(c.h>state.candles[i-1].h&&c.h>state.candles[i-2].h&&c.h>state.candles[i+1].h&&c.h>state.candles[i+2].h)out.push({time:Math.floor(c.t/1000),position:"aboveBar",color:"#f59e0b",shape:"arrowDown",text:"F"});if(c.l<state.candles[i-1].l&&c.l<state.candles[i-2].l&&c.l<state.candles[i+1].l&&c.l<state.candles[i+2].l)out.push({time:Math.floor(c.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"F"})}return out.slice(-100)}
  function extendedPatternMarkers(){const out=[];for(let i=1;i<state.candles.length;i++){const a=state.candles[i-1],b=state.candles[i],ab=Math.abs(a.c-a.o),bb=Math.abs(b.c-b.o),br=Math.max(b.h-b.l,1e-12),up=b.c>b.o,prevUp=a.c>a.o;const upper=b.h-Math.max(b.o,b.c),lower=Math.min(b.o,b.c)-b.l;
      if(bb/br<.1)out.push({time:Math.floor(b.t/1000),position:"aboveBar",color:"#f5a623",shape:"circle",text:"DOJI"});
      if(lower>bb*2&&upper<bb*.8)out.push({time:Math.floor(b.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"HAMMER"});
      if(upper>bb*2&&lower<bb*.8)out.push({time:Math.floor(b.t/1000),position:"aboveBar",color:"#ef4444",shape:"arrowDown",text:"SHOOT"});
      if(!prevUp&&up&&b.o<=a.c&&b.c>=a.o)out.push({time:Math.floor(b.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"ENGULF"});
      if(prevUp&&!up&&b.o>=a.c&&b.c<=a.o)out.push({time:Math.floor(b.t/1000),position:"aboveBar",color:"#ef4444",shape:"arrowDown",text:"ENGULF"});
      if(i>=2){const p=state.candles[i-2];if(p.c<p.o&&Math.abs(a.c-a.o)<ab*.45&&up&&b.c>(p.o+p.c)/2)out.push({time:Math.floor(b.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"MORNING"});if(p.c>p.o&&Math.abs(a.c-a.o)<ab*.45&&!up&&b.c<(p.o+p.c)/2)out.push({time:Math.floor(b.t/1000),position:"aboveBar",color:"#ef4444",shape:"arrowDown",text:"EVENING"});}
      if(i>=3){const p1=state.candles[i-2],p2=state.candles[i-3];if(p2.c<p2.o&&p1.c>p1.o&&b.c>b.o&&b.c>p1.c)out.push({time:Math.floor(b.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"3WS"});if(p2.c>p2.o&&p1.c<p1.o&&b.c<b.o&&b.c<p1.c)out.push({time:Math.floor(b.t/1000),position:"aboveBar",color:"#ef4444",shape:"arrowDown",text:"3BC"});}}
    return out.slice(-120)}
  function supertrendData(period=10,mult=3){const atr=atrData(period),am=new Map(atr.map(x=>[x.time,x.value])),out=[];let prev=state.candles[period-1]?.c||null;for(let i=period-1;i<state.candles.length;i++){const c=state.candles[i],a=am.get(Math.floor(c.t/1000))||0;const mid=(c.h+c.l)/2;const line=prev!==null?(c.c>=prev?mid-a*mult:mid+a*mult):mid;out.push({time:Math.floor(c.t/1000),value:line});prev=c.c}return out}
  function ichimoku(){const out1=[],out2=[],out3=[],out4=[];for(let i=0;i<state.candles.length;i++){const c=state.candles[i];const conv=(highest(i,9)+lowest(i,9))/2;const base=(highest(i,26)+lowest(i,26))/2;const spanA=(conv+base)/2;const spanB=(highest(i,52)+lowest(i,52))/2;out1.push({time:Math.floor(c.t/1000),value:conv});out2.push({time:Math.floor(c.t/1000),value:base});out3.push({time:Math.floor(c.t/1000),value:spanA});out4.push({time:Math.floor(c.t/1000),value:spanB})}return {conv:out1,base:out2,spanA:out3,spanB:out4}}
  function psarData(){const out=[];let bull=true,af=.02,ep=state.candles[0]?.l||0,sar=state.candles[0]?.h||0;for(let i=1;i<state.candles.length;i++){const c=state.candles[i];sar=sar+af*(ep-sar);if(bull){sar=Math.min(sar,state.candles[i-1].l,i>1?state.candles[i-2].l:state.candles[i-1].l);if(c.l<sar){bull=false;sar=ep;ep=c.l;af=.02}else if(c.h>ep){ep=c.h;af=Math.min(.2,af+.02)}}else{sar=Math.max(sar,state.candles[i-1].h,i>1?state.candles[i-2].h:state.candles[i-1].h);if(c.h>sar){bull=true;sar=ep;ep=c.h;af=.02}else if(c.l<ep){ep=c.l;af=Math.min(.2,af+.02)}}out.push({time:Math.floor(c.t/1000),value:sar})}return out}
  function createToolSeries(name,data,color,width=2){if(!state.chart)return;if(!state.toolSeries[name])state.toolSeries[name]=state.chart.addLineSeries({color,lineWidth:width,priceLineVisible:false,lastValueVisible:false});state.toolSeries[name].setData(data||[])}
  function clearToolSeries(prefix){Object.keys(state.toolSeries).filter(k=>k.startsWith(prefix)).forEach(k=>{removeSeriesSafe(state.toolSeries[k]);delete state.toolSeries[k]})}
  function installIndicatorPanels(){return document.getElementById("gtxIndicatorPanels")}
  function renderPanel(name,title,data,min,max){const host=installIndicatorPanels();if(!host)return;let p=state.indicatorPanels[name];if(!p){p=document.createElement("div");p.className="gtxIndicatorPanel";p.innerHTML='<div class="gtxIndicatorTitle"></div><canvas></canvas>';host.appendChild(p);state.indicatorPanels[name]=p}p.querySelector(".gtxIndicatorTitle").textContent=title;const canvas=p.querySelector("canvas"),dpr=window.devicePixelRatio||1,w=canvas.clientWidth||host.clientWidth||300,h=canvas.clientHeight||86;canvas.width=Math.max(1,Math.floor(w*dpr));canvas.height=Math.max(1,Math.floor(h*dpr));const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);if(!data?.length)return;const vals=data.map(x=>Number(x.value)).filter(Number.isFinite);const lo=Number.isFinite(min)?min:Math.min(...vals),hi=Number.isFinite(max)?max:Math.max(...vals);const range=hi-lo||1;ctx.strokeStyle="#28445e";ctx.lineWidth=1;[.25,.5,.75].forEach(q=>{ctx.beginPath();ctx.moveTo(0,h*q);ctx.lineTo(w,h*q);ctx.stroke()});ctx.strokeStyle="#42d392";ctx.lineWidth=1.5;ctx.beginPath();data.forEach((x,i)=>{const xx=data.length===1?0:(i/(data.length-1))*w;const yy=h-((Number(x.value)-lo)/range)*(h-12)-6;if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy)});ctx.stroke()}
  function clearPanel(name){const p=state.indicatorPanels[name];if(p){p.remove();delete state.indicatorPanels[name]}}
  function refreshTools(){
    if(!state.chart)return;
    clearToolSeries("ALLIGATOR");clearToolSeries("EMA");clearToolSeries("SUPERTREND");clearToolSeries("ICHIMOKU");clearToolSeries("PSAR");
    const t=state.tools;
    if(t.has("Alligator")){const a=alligatorData();createToolSeries("ALLIGATOR-jaw",a.jaw,"#3b82f6");createToolSeries("ALLIGATOR-teeth",a.teeth,"#ef4444");createToolSeries("ALLIGATOR-lips",a.lips,"#22c55e")}
    if(t.has("EMA / SMA")){createToolSeries("EMA-9",ema(9),"#f59e0b");createToolSeries("EMA-21",ema(21),"#3b82f6")}
    if(t.has("Supertrend"))createToolSeries("SUPERTREND",supertrendData(),"#22c55e",2);
    if(t.has("Ichimoku Cloud")){const i=ichimoku();createToolSeries("ICHIMOKU-conv",i.conv,"#f59e0b");createToolSeries("ICHIMOKU-base",i.base,"#3b82f6");createToolSeries("ICHIMOKU-spanA",i.spanA,"#22c55e");createToolSeries("ICHIMOKU-spanB",i.spanB,"#ef4444")}
    if(t.has("Parabolic SAR"))createToolSeries("PSAR",psarData(),"#f5a623",1);
    const markerSet=[];if(t.has("Patterns"))markerSet.push(...extendedPatternMarkers());if(t.has("Fractals"))markerSet.push(...fractalMarkers());state.candleSeries?.setMarkers(markerSet.slice(-120));
    const panels=[["Awesome Oscillator","AO",aoData(),null,null],["RSI","RSI",rsiData(),0,100],["MACD","MACD",macdData(),null,null],["Stochastic","Stochastic",stochData(),0,100],["CCI","CCI",cciData(),-200,200],["Williams %R","Williams %R",williamsData(),-100,0],["ATR","ATR",atrData(),null,null]];
    const activePanels=new Set();
    panels.forEach(([key,title,data,min,max])=>{if(t.has(key)){activePanels.add(key);renderPanel(key,title,data,min,max)}});
    Object.keys(state.indicatorPanels).forEach(k=>{if(!activePanels.has(k))clearPanel(k)});
    if(t.has("ADX")){const adx=ema(14).map((x,i)=>({time:x.time,value:50+Math.tanh((x.value-(state.candles[Math.max(0,i)].c||x.value))/Math.max(1e-9,x.value))*50}));renderPanel("ADX","ADX",adx,0,100);activePanels.add("ADX")}else clearPanel("ADX");
    ["Bollinger Bands","Keltner Channels","Donchian Channels","Support & Resistance","Trend Line","Horizontal Line","Vertical Line","Fibonacci Retracement","Fibonacci Extension","Kangaroo","Lion","Kenkley’s Lines"].forEach(name=>{if(t.has(name)){}});
    if(t.has("Bollinger Bands")){const mid=ema(20),upper=[],lower=[];for(let i=19;i<state.candles.length;i++){let sum=0;for(let j=i-19;j<=i;j++)sum+=state.candles[j].c;const m=sum/20;let v=0;for(let j=i-19;j<=i;j++)v+=(state.candles[j].c-m)**2;v=Math.sqrt(v/20);upper.push({time:Math.floor(state.candles[i].t/1000),value:m+2*v});lower.push({time:Math.floor(state.candles[i].t/1000),value:m-2*v})}createToolSeries("BOLL-upper",upper,"#a78bfa");createToolSeries("BOLL-lower",lower,"#a78bfa")}
    else{clearToolSeries("BOLL")}
    if(t.has("Donchian Channels")){createToolSeries("DONCHIAN-high",state.candles.map((c,i)=>({time:Math.floor(c.t/1000),value:highest(i,20)})),"#64748b");createToolSeries("DONCHIAN-low",state.candles.map((c,i)=>({time:Math.floor(c.t/1000),value:lowest(i,20)})),"#64748b")}else{clearToolSeries("DONCHIAN")}
    if(t.has("Support & Resistance")){clearToolSeries("SR");const n=state.candles.length;if(n){const hi=highest(n-1,50),lo=lowest(n-1,50);createToolSeries("SR-high",state.candles.map(c=>({time:Math.floor(c.t/1000),value:hi})),"#ef4444",1);createToolSeries("SR-low",state.candles.map(c=>({time:Math.floor(c.t/1000),value:lo})),"#22c55e",1)}}else clearToolSeries("SR");
    if(t.has("Kenkley’s Lines")){createToolSeries("KENKLEY-fast",ema(34),"#22c55e");createToolSeries("KENKLEY-slow",ema(89),"#f59e0b")}else{clearToolSeries("KENKLEY")}
    if(t.has("Kangaroo")){clearToolSeries("KANGAROO");const m=state.candles.slice(20).map((c,k)=>{const i=k+20;return c.c>highest(i-1,20)?{time:Math.floor(c.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"K"}:null}).filter(Boolean);state.candleSeries?.setMarkers([...(t.has("Patterns")?extendedPatternMarkers():[]),...(t.has("Fractals")?fractalMarkers():[]),...m].slice(-120))} 
    if(t.has("Lion")){clearToolSeries("LION");const d=ema(8);createToolSeries("LION",d,"#f97316",2)}else clearToolSeries("LION");
    if(t.has("Keltner Channels")){clearToolSeries("KELTNER");const m=ema(20),a=atrData(20),am=new Map(a.map(x=>[x.time,x.value]));createToolSeries("KELTNER-mid",m,"#f59e0b");createToolSeries("KELTNER-up",m.map(x=>({time:x.time,value:x.value+(am.get(x.time)||0)*2})),"#94a3b8",1);createToolSeries("KELTNER-low",m.map(x=>({time:x.time,value:x.value-(am.get(x.time)||0)*2})),"#94a3b8",1)}else clearToolSeries("KELTNER");
    if(t.has("Fibonacci Retracement")){clearToolSeries("FIBR");const n=state.candles.length;if(n){const hi=highest(n-1,100),lo=lowest(n-1,100),d=hi-lo;[0,.236,.382,.5,.618,.786,1].forEach((q,j)=>createToolSeries("FIBR-"+j,state.candles.map(c=>({time:Math.floor(c.t/1000),value:hi-d*q})),"#8b5cf6",1))}}else clearToolSeries("FIBR");
    if(t.has("Fibonacci Extension")){clearToolSeries("FIBE");const n=state.candles.length;if(n){const hi=highest(n-1,100),lo=lowest(n-1,100),d=hi-lo;[1.272,1.618,2].forEach((q,j)=>createToolSeries("FIBE-"+j,state.candles.map(c=>({time:Math.floor(c.t/1000),value:hi+d*(q-1)})),"#a78bfa",1))}}else clearToolSeries("FIBE");
    if(t.has("Trend Line")){clearToolSeries("TREND");const d=state.candles.slice(-60);if(d.length>1)createToolSeries("TREND",[{time:Math.floor(d[0].t/1000),value:d[0].c},{time:Math.floor(d[d.length-1].t/1000),value:d[d.length-1].c}],"#38bdf8",2)}else clearToolSeries("TREND");
    if(t.has("Horizontal Line")){clearToolSeries("HLINE");if(Number.isFinite(state.price))createToolSeries("HLINE",state.candles.map(c=>({time:Math.floor(c.t/1000),value:state.price})),"#f5a623",1)}else clearToolSeries("HLINE");
    if(t.has("Vertical Line"))status("VERTICAL LINE: select a candle with the crosshair",true);
  }
  function openSettings(){
    const e=document.getElementById("gtxChartSettings");if(e)e.classList.add("open");
  }
  function installSettingsUi(){
    if(document.getElementById("gtxChartSettings"))return;
    const e=document.createElement("div");e.id="gtxChartSettings";e.className="gtxChartSettings";e.innerHTML='<div class="gtxChartSettingsCard"><h3 style="margin:0;color:#fff;font:900 16px system-ui">Chart Settings</h3><div class="gtxChartSettingsRow"><label>Candle interval</label><select id="gtxSettingsTF"></select></div><div class="gtxChartSettingsRow"><label>Chart time</label><select id="gtxSettingsTZ"></select></div><div class="gtxChartSettingsActions"><button id="gtxSettingsClose">Close</button><button id="gtxSettingsApply" class="primary">Apply</button></div></div>';document.body.appendChild(e);
    const tf=e.querySelector("#gtxSettingsTF");Object.keys(CFG.intervals).forEach(k=>{const o=document.createElement("option");o.value=k;o.textContent=k;if(k===state.tf)o.selected=true;tf.appendChild(o)});
    const tz=e.querySelector("#gtxSettingsTZ");["local","UTC","UTC-1","UTC+0","UTC+1","UTC+2","UTC+3","UTC+4","UTC+5","UTC+5:30","UTC+6","UTC+7","UTC+8","UTC+9","UTC+10","UTC+12"].forEach(k=>{const o=document.createElement("option");o.value=k;o.textContent=k==="local"?"Local device time":k;if(k===state.timezone)o.selected=true;tz.appendChild(o)});
    e.querySelector("#gtxSettingsClose").onclick=()=>e.classList.remove("open");
    e.querySelector("#gtxSettingsApply").onclick=()=>{state.timezone=tz.value;try{localStorage.setItem(TZ_KEY,state.timezone)}catch(_){};const v=tf.value;e.classList.remove("open");if(v!==state.tf)setTimeframe(v);else{applyTimeFormatting();updateClock();refreshTools()}};
  }
    function setChartTool(tool){
    const t=String(tool||"").trim();
    if(!t)return;
    if(t==="Heikin Ashi"){state.heikin=!state.heikin;state.chartType="candle";renderHistory();return}
    if(t==="Line Chart"){state.heikin=false;state.chartType="line";renderHistory();return}
    if(t==="Area Chart"){state.heikin=false;state.chartType="mountain";renderHistory();return}
    if(t==="Candles"){state.heikin=false;state.chartType="candle";renderHistory();return}
    if(t==="Chart Settings"){openSettings();return}
    const toggle=["Alligator","Fractals","Patterns","Awesome Oscillator","EMA / SMA","Supertrend","Ichimoku Cloud","Parabolic SAR","ADX","Kangaroo","Lion","Kenkley’s Lines","RSI","MACD","Stochastic","CCI","Williams %R","Bollinger Bands","ATR","Keltner Channels","Donchian Channels","Support & Resistance","Trend Line","Horizontal Line","Vertical Line","Fibonacci Retracement","Fibonacci Extension"];
    if(toggle.includes(t)){if(state.tools.has(t))state.tools.delete(t);else state.tools.add(t);refreshTools();return}
    if(t==="Price Alert"||t==="Indicator Alert"||t==="BUY / SELL Signal Alert"){status(t.toUpperCase()+" READY",true);return}
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
      const s=document.createElement("script");
      s.src=LWC_URL;s.async=true;s.onload=()=>window.LightweightCharts?resolve():reject(new Error("Lightweight Charts loaded without its global API."));
      s.onerror=()=>reject(new Error("Could not load the Lightweight Charts library."));
      document.head.appendChild(s);
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

  function observeServerSync(){
    if(state.serverSyncInstalled)return;
    state.serverSyncInstalled=true;
    window.addEventListener("gotradex:server-sync",e=>{
      const d=e.detail||{};
      const m=d.market_state;
      if(!m||!Number.isFinite(Number(m.price)))return;
      const selected=selection();
      const normalize=v=>String(v||"").toUpperCase().replace(/\s+(LIVE|OTC)$/,"").replace(/\s+/g,"");
      const current=normalize(selected.label||state.assetLabel);
      const incoming=normalize(m.symbol||m.asset);
      if(current&&incoming&&current!==incoming)return;
      addTick(m.tick_at||Date.now(),Number(m.price),0);
      if(state.historyLoaded) updateLiveSeries(state.candles[state.candles.length-1]);
    });
  }

  function observeAssetChanges(){
    window.addEventListener("gotradex:asset-changed",()=>{try{watchSelection()}catch(_){connect()}});
  }

  function boot(){
    installChartUiStyle();
    observeAssetChanges();
    observeServerSync();
    if(state.booted)return;
    if(!mount()){setTimeout(boot,300);return}
    state.booted=true;
    installLibraryAndStart();
    observeTradeMarkers();
    setInterval(watchSelection,700);
  }

  window.GoTradeXLiveChart={
    boot,setTimeframe,reconnect:connect,setChartTool,state,
    chartVersion:"Lightweight Charts 4.2.2",
    engine:"TradingView Lightweight Charts"
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();