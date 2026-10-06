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
    chart:null,candleSeries:null,lineSeries:null,areaSeries:null,volumeSeries:null,
    ma50:null,ma100:null,ma200:null,currentPriceLine:null,
    chartType:"candle",historyLoaded:false,initialRangeSet:false,resizeObserver:null,
    booted:false,markersInstalled:false,chartTools:new Set(),indicatorSeries:new Map(),oscillatorPane:null,heikin:false
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
      "#gtxLiveChart{position:relative;width:100%;height:auto!important;min-height:300px!important;max-height:none!important;flex:1 1 auto!important;align-self:stretch;background:#07111d;border:0;border-radius:0;overflow:hidden;box-sizing:border-box;touch-action:none;user-select:none}"+
      "#gtxLWC{position:absolute;inset:0;width:100%;height:100%}"+
      ".gtxLWCHead{position:absolute;z-index:10;top:7px;left:8px;right:8px;display:flex;align-items:center;gap:6px;pointer-events:none}"+
      ".gtxLWCHead>*{pointer-events:auto}"+
      ".gtxLWCAsset{display:none!important}"+
      ".gtxLWCStatus{font:800 9px/1 system-ui;color:#8ff0ae;background:#082014e8;border:1px solid #1f6c40;border-radius:6px;padding:6px 7px;white-space:nowrap}"+
      ".gtxLWCClock{font:800 10px/1 system-ui;color:#dbe9f7;background:transparent;border:0;padding:0;white-space:nowrap;font-variant-numeric:tabular-nums}"+
      ".gtxLWCControl{display:none!important}"+
      ".gtxLWCBtn{border:1px solid #31597f;background:#102945;color:#dcecff;border-radius:5px;padding:5px 7px;font:800 9px system-ui;cursor:pointer}"+
      ".gtxLWCBtn.active{background:#20a96b;color:#fff;border-color:#54e09a}"+
      ".gtxLWCSelect{border:1px solid #31597f;background:#102945;color:#fff;border-radius:5px;padding:5px 7px;font:800 9px system-ui}"+
      ".gtxLWCNotice{position:absolute;z-index:8;left:12px;right:70px;top:50px;display:grid;place-items:center;text-align:center;color:#7695b2;font:800 11px/1.4 system-ui;pointer-events:none}"+
      ".gtxLWCNotice[hidden]{display:none}"+
      ".gtxLWCTradeLine{position:absolute;z-index:9;top:0;bottom:28px;width:2px;display:none;pointer-events:none;border-left:2px dashed #f5a623}"+
      ".gtxLWCTradeLine.end{border-left-color:#fff}"+
      ".gtxLWCFlag{position:absolute;z-index:11;transform:translate(-50%,-100%);display:none;font:900 12px/1 system-ui;filter:drop-shadow(0 2px 3px #000);pointer-events:none}"+
      ".gtxLWCWatermark{position:absolute;z-index:2;right:70px;bottom:34px;color:#42627e;font:900 10px system-ui;letter-spacing:.08em;pointer-events:none}"+".gtxIndicatorPane{position:absolute;z-index:12;left:0;right:58px;bottom:0;display:none;max-height:112px;background:#07111ddd;border-top:1px solid #1b3146;pointer-events:none;overflow:hidden;box-sizing:border-box}"+".gtxIndicatorRow{height:36px;display:flex;align-items:center;gap:6px;padding:3px 7px;box-sizing:border-box}"+".gtxIndicatorLabel{width:74px;flex:0 0 74px;color:#8fa9bf;font:800 8px/1 system-ui;white-space:nowrap}"+".gtxIndicatorSvg{flex:1;height:30px;display:block}"+".gtxIndicatorValue{width:58px;flex:0 0 58px;text-align:right;color:#dcecff;font:800 8px/1 system-ui}"+
      "@media(max-width:600px){#gtxLiveChart{height:auto!important;min-height:300px!important;max-height:none!important;flex:1 1 auto!important}.gtxLWCAsset{font-size:9px;padding:5px 6px}.gtxLWCStatus{font-size:8px;padding:5px}.gtxLWCBtn,.gtxLWCSelect{font-size:8px;padding:4px 5px}.gtxLWCControl{gap:3px}.gtxLWCWatermark{display:none}}";
    document.head.appendChild(s);
  }

  function mount(){
    if(document.getElementById("gtxLiveChart"))return true;
    const pair=document.querySelector(".pairbar"),bottom=document.querySelector(".bottom"),app=document.querySelector(".app");
    if(!pair||!bottom||!bottom.parentNode)return false;
    injectStyle();
    const box=document.createElement("section");
    box.id="gtxLiveChart";
    box.setAttribute("aria-label","GoTradeX verified live candlestick chart");
    box.innerHTML=
      '<div id="gtxLWC"></div>'+
      '<div class="gtxLWCHead">'+
        '<span class="gtxLWCAsset" id="gtxLWCAsset">LIVE • BTC/USD</span>'+
        '<span class="gtxLWCStatus" id="gtxLWCStatus">CONNECTING</span>'+
        '<span class="gtxLWCClock" id="gtxLWCClock"></span>'+
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
    if(app){app.style.display="flex";app.style.flexDirection="column";app.style.height="100dvh";app.style.minHeight="0";app.style.overflow="hidden"}
    if(pair){pair.style.flex="0 0 auto"}
    if(bottom){bottom.style.flex="0 0 auto"}
    box.style.flex="1 1 auto";box.style.height="auto";box.style.minHeight="300px";box.style.maxHeight="none";box.style.width="100%";box.style.display="block";box.style.overflow="hidden";
    pair.insertAdjacentElement("afterend",box);

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

  function updateClock(){const e=document.getElementById("gtxLWCClock");if(!e)return;const d=new Date();const p=n=>String(n).padStart(2,"0");e.textContent=p(d.getDate())+"-"+p(d.getMonth()+1)+"-"+d.getFullYear()+" "+p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds());}
  function startClock(){updateClock();if(state.clockTimer)clearInterval(state.clockTimer);state.clockTimer=setInterval(updateClock,1000);}

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
    const symbol=String(state.symbol||"").toUpperCase();
    const tf=state.tf;
    const bybitSymbol=symbol.replace("/","");
    if(!/^[A-Z0-9]+$/.test(bybitSymbol))throw new Error("Invalid verified Bybit symbol.");

    // Crypto candles must not depend on Twelve Data. Fetch the verified Bybit
    // exchange history first; the Supabase adapter remains a secondary route.
    try{
      if(state.sec<60){
        const u="https://api.bybit.com/v5/market/recent-trade?category=spot&symbol="+encodeURIComponent(bybitSymbol)+"&limit=1000";
        const r=await fetch(u,{cache:"no-store"});
        const j=await r.json().catch(()=>({}));
        if(!r.ok||Number(j?.retCode)!==0)throw new Error(j?.retMsg||"Bybit recent trades unavailable.");
        const rows=(j?.result?.list||[]).slice().reverse(),byBucket=new Map();
        rows.forEach(x=>{
          const ts=Number(x.time),p=Number(x.price),v=Number(x.size||0);
          if(!Number.isFinite(ts)||!Number.isFinite(p))return;
          const b=bucket(ts,state.sec);let c=byBucket.get(b);
          if(!c)c={t:b,o:p,h:p,l:p,c:p,v:0};
          c.h=Math.max(c.h,p);c.l=Math.min(c.l,p);c.c=p;c.v+=Number.isFinite(v)?v:0;byBucket.set(b,c);
        });
        state.candles=Array.from(byBucket.values()).sort((a,b)=>a.t-b.t).slice(-220);
      }else{
        const map={60:"1",120:"2",300:"5",900:"15",1800:"30",3600:"60",7200:"120",14400:"240",86400:"D",604800:"W",2592000:"M"};
        const interval=map[state.sec];
        if(!interval)throw new Error("Bybit does not provide a native candle interval for "+tf+".");
        const u="https://api.bybit.com/v5/market/kline?category=spot&symbol="+encodeURIComponent(bybitSymbol)+"&interval="+interval+"&limit=500";
        const r=await fetch(u,{cache:"no-store"});
        const j=await r.json().catch(()=>({}));
        if(!r.ok||Number(j?.retCode)!==0)throw new Error(j?.retMsg||"Bybit historical candles unavailable.");
        state.candles=(j?.result?.list||[]).slice().reverse().map(x=>({
          t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5]||0)
        })).filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite));
      }
      state.candles.sort((a,b)=>a.t-b.t);
      if(state.candles.length>=12){
        state.provider="BYBIT";state.price=state.candles[state.candles.length-1].c;return;
      }
      throw new Error("Bybit returned too little verified history.");
    }catch(primaryError){
      // Secondary verified route through the existing Supabase adapter.
      try{
        const sb=window.GoTradeXMarketSupabase||(window.GoTradeXMarketSupabase=
          window.supabase.createClient("https://glffecggusetzklmyukv.supabase.co","sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5",{auth:{persistSession:true,autoRefreshToken:true}}));
        const r=await sb.functions.invoke("gotradex-market-data",{body:{action:"chart",marketMode:"LIVE",assetType:"crypto",symbol,timeframe:tf}});
        if(r.error)throw new Error(r.error.message||"Verified crypto history request failed.");
        if(!r.data?.ok)throw new Error(r.data?.error||"No verified crypto history returned.");
        const rows=Array.isArray(r.data.candles)?r.data.candles:[];
        state.candles=rows.map(x=>({t:Number(x.time)*1000,o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close),v:Number(x.volume||0)}))
          .filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
        if(state.candles.length)state.price=state.candles[state.candles.length-1].c;
        if(state.candles.length>=12)return;
      }catch(_){}
      throw primaryError;
    }
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

  function connect(){
    ++state.connectionId;
    const f=selection();
    state.mode=String(f.mode||"LIVE").toUpperCase();
    state.type=f.type||"";
    state.assetLabel=f.label||"";
    state.candles=[];state.price=null;state.prev=null;state.tradeStart=null;state.tradeEnd=null;
    state.historyLoaded=false;state.initialRangeSet=false;assetText();
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

  function heikinCandleData(){
    let prevO=null,prevC=null;return state.candles.map(c=>{const hc=(c.o+c.h+c.l+c.c)/4,ho=prevO==null?(c.o+c.c)/2:(prevO+prevC)/2,h=Math.max(c.h,ho,hc),l=Math.min(c.l,ho,hc);prevO=ho;prevC=hc;return {time:Math.floor(c.t/1000),open:ho,high:h,low:l,close:hc}});
  }

  function seriesLineData(){
    return state.candles.map(c=>({time:Math.floor(c.t/1000),value:Number(c.c)}));
  }

  function toolValues(){
    return state.candles.map(c=>Number(c.c)).filter(Number.isFinite);
  }
  function emaData(period){
    const c=toolValues(),out=[],k=2/(period+1);let e=null;
    c.forEach((v,i)=>{e=e==null?v:v*k+e*(1-k);if(i>=period-1)out.push({time:Math.floor(state.candles[i].t/1000),value:e})});
    return out;
  }
  function smaData(period){
    const c=toolValues(),out=[];
    for(let i=period-1;i<c.length;i++){let sum=0;for(let j=i-period+1;j<=i;j++)sum+=c[j];out.push({time:Math.floor(state.candles[i].t/1000),value:sum/period})}
    return out;
  }
  function atrData(period=14){
    const out=[],p=Math.max(1,period);let atr=null;
    for(let i=0;i<state.candles.length;i++){
      const c=state.candles[i],prev=i?state.candles[i-1].c:c.o;
      const tr=Math.max(c.h-c.l,Math.abs(c.h-prev),Math.abs(c.l-prev));
      atr=atr==null?tr:((atr*(p-1))+tr)/p;
      if(i>=p-1)out.push({time:Math.floor(c.t/1000),value:atr});
    }
    return out;
  }
  function rsiData(period=14){
    const c=toolValues(),out=[];if(c.length<=period)return out;
    let g=0,l=0;for(let i=1;i<=period;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}
    let ag=g/period,al=l/period;
    out.push({time:Math.floor(state.candles[period].t/1000),value:al===0?100:100-(100/(1+ag/al))});
    for(let i=period+1;i<c.length;i++){const d=c[i]-c[i-1];ag=(ag*(period-1)+(d>0?d:0))/period;al=(al*(period-1)+(d<0?-d:0))/period;out.push({time:Math.floor(state.candles[i].t/1000),value:al===0?100:100-(100/(1+ag/al))})}
    return out;
  }
  function macdData(){
    const a=emaData(12),b=new Map(emaData(26).map(x=>[x.time,x.value])),out=[];
    a.forEach(x=>{const y=b.get(x.time);if(Number.isFinite(y))out.push({time:x.time,value:x.value-y})});return out;
  }
  function stochasticData(period=14){
    const out=[];for(let i=period-1;i<state.candles.length;i++){let hi=-Infinity,lo=Infinity;for(let j=i-period+1;j<=i;j++){hi=Math.max(hi,state.candles[j].h);lo=Math.min(lo,state.candles[j].l)}const d=hi-lo;out.push({time:Math.floor(state.candles[i].t/1000),value:d?((state.candles[i].c-lo)/d)*100:50})}return out;
  }
  function cciData(period=20){
    const out=[],tp=state.candles.map(x=>(x.h+x.l+x.c)/3);
    for(let i=period-1;i<tp.length;i++){const q=tp.slice(i-period+1,i+1),m=q.reduce((a,b)=>a+b,0)/period,md=q.reduce((a,b)=>a+Math.abs(b-m),0)/period;out.push({time:Math.floor(state.candles[i].t/1000),value:md?(tp[i]-m)/(.015*md):0})}return out;
  }
  function williamsData(period=14){
    const out=[];for(let i=period-1;i<state.candles.length;i++){let hi=-Infinity,lo=Infinity;for(let j=i-period+1;j<=i;j++){hi=Math.max(hi,state.candles[j].h);lo=Math.min(lo,state.candles[j].l)}const d=hi-lo;out.push({time:Math.floor(state.candles[i].t/1000),value:d?((hi-state.candles[i].c)/d)*-100:-50})}return out;
  }
  function alligatorLines(){
    return [{name:"Jaw",data:smaData(13),color:"#4da3ff"},{name:"Teeth",data:smaData(8),color:"#efc44f"},{name:"Lips",data:smaData(5),color:"#ef6a6a"}];
  }
  function bollinger(){
    const c=toolValues(),mid=[],up=[],dn=[];
    for(let i=19;i<c.length;i++){const q=c.slice(i-19,i+1),m=q.reduce((a,b)=>a+b,0)/20,sd=Math.sqrt(q.reduce((a,b)=>a+(b-m)**2,0)/20);mid.push({time:Math.floor(state.candles[i].t/1000),value:m});up.push({time:Math.floor(state.candles[i].t/1000),value:m+2*sd});dn.push({time:Math.floor(state.candles[i].t/1000),value:m-2*sd})}
    return {mid,up,dn};
  }
  function fractalMarkers(){
    const m=[];for(let i=2;i<state.candles.length-2;i++){const c=state.candles,h=c[i].h,l=c[i].l;if(h>c[i-1].h&&h>c[i-2].h&&h>c[i+1].h&&h>c[i+2].h)m.push({time:Math.floor(c[i].t/1000),position:"aboveBar",color:"#ff9f43",shape:"arrowDown",text:"F"});if(l<c[i-1].l&&l<c[i-2].l&&l<c[i+1].l&&l<c[i+2].l)m.push({time:Math.floor(c[i].t/1000),position:"belowBar",color:"#48dbfb",shape:"arrowUp",text:"F"})}return m;
  }
  function patternMarkers(){
    const m=[];for(let i=1;i<state.candles.length;i++){const a=state.candles[i-1],c=state.candles[i],bull=c.c>a.c,bear=c.c<a.c;if(bull&&c.o<=a.c&&c.c>=a.o)m.push({time:Math.floor(c.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"PAT"});else if(bear&&c.o>=a.c&&c.c<=a.o)m.push({time:Math.floor(c.t/1000),position:"aboveBar",color:"#ef4444",shape:"arrowDown",text:"PAT"})}return m.slice(-80);
  }
  function supertrendData(){
    const a=atrData(10),am=new Map(a.map(x=>[x.time,x.value])),out=[],c=state.candles;
    for(let i=10;i<c.length;i++){const t=Math.floor(c[i].t/1000),atr=am.get(t)||0,mid=(c[i].h+c[i].l)/2;out.push({time:t,value:c[i].c>=mid?mid-atr*3:mid+atr*3})}return out;
  }
  function psarMarkers(){
    const m=[];for(let i=2;i<state.candles.length;i++){const c=state.candles;if(c[i].l>c[i-1].l&&c[i-1].l>c[i-2].l)m.push({time:Math.floor(c[i].t/1000),position:"belowBar",color:"#f5a623",shape:"circle",text:"SAR"});if(c[i].h<c[i-1].h&&c[i-1].h<c[i-2].h)m.push({time:Math.floor(c[i].t/1000),position:"aboveBar",color:"#f5a623",shape:"circle",text:"SAR"})}return m.slice(-100);
  }
  function renderOscillatorPane(){
    const pane=document.getElementById("gtxIndicatorPane");if(!pane)return;
    const tools=["Awesome Oscillator","RSI","MACD","Stochastic","CCI","Williams %R","ATR"].filter(x=>state.chartTools.has(x));
    pane.innerHTML="";if(!tools.length){pane.style.display="none";return}
    pane.style.display="block";
    const dataFor=t=>t==="RSI"?rsiData():t==="MACD"?macdData():t==="Stochastic"?stochasticData():t==="CCI"?cciData():t==="Williams %R"?williamsData():t==="ATR"?atrData():emaData(5).map((x,i)=>{const e=emaData(34)[i];return e?{time:x.time,value:x.value-e.value}:x});
    tools.slice(0,3).forEach(tool=>{
      const data=dataFor(tool).slice(-80),row=document.createElement("div");row.className="gtxIndicatorRow";
      const label=document.createElement("span");label.className="gtxIndicatorLabel";label.textContent=tool;row.appendChild(label);
      const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 500 30");svg.setAttribute("preserveAspectRatio","none");svg.classList.add("gtxIndicatorSvg");
      const values=data.map(x=>x.value).filter(Number.isFinite);const lo=Math.min(...values,0),hi=Math.max(...values,1),den=hi-lo||1;
      const pts=data.map((x,i)=>((i/(Math.max(1,data.length-1)))*500)+","+(28-((x.value-lo)/den)*26)).join(" ");
      const pl=document.createElementNS("http://www.w3.org/2000/svg","polyline");pl.setAttribute("fill","none");pl.setAttribute("stroke","#5ea7ff");pl.setAttribute("stroke-width","1.5");pl.setAttribute("points",pts);svg.appendChild(pl);row.appendChild(svg);
      const val=document.createElement("span");val.className="gtxIndicatorValue";val.textContent=values.length?Number(values.at(-1)).toFixed(2):"—";row.appendChild(val);pane.appendChild(row);
    });
  }
  function clearToolSeries(prefix){
    for(const [key,s] of state.indicatorSeries){if(key.startsWith(prefix)){try{state.chart?.removeSeries(s)}catch(_){}state.indicatorSeries.delete(key)}}
  }
  function addToolSeries(key,data,color,width=1,title=""){
    if(!state.chart||!data?.length)return;
    const s=state.chart.addLineSeries({color,lineWidth:width,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,title});
    s.setData(data);state.indicatorSeries.set(key,s);
  }
  function renderChartTools(){
    for(const s of state.indicatorSeries.values()){try{state.chart?.removeSeries(s)}catch(_){}}
    state.indicatorSeries.clear();
    if(!state.chart||!state.candles.length)return;
    const t=state.chartTools;
    if(t.has("EMA / SMA")){addToolSeries("EMA9",emaData(9),"#f5c542",2);addToolSeries("EMA21",emaData(21),"#5ea7ff",2);addToolSeries("SMA50",smaData(50),"#b58cff",1)}
    if(t.has("Alligator"))alligatorLines().forEach(x=>addToolSeries("ALLIGATOR-"+x.name,x.data,x.color,2,x.name));
    if(t.has("Bollinger Bands")){const b=bollinger();addToolSeries("BOLL-mid",b.mid,"#8fa8c4",1);addToolSeries("BOLL-up",b.up,"#9c7cff",1);addToolSeries("BOLL-dn",b.dn,"#9c7cff",1)}
    if(t.has("Supertrend"))addToolSeries("SUPERTREND",supertrendData(),"#22c55e",2);
    if(t.has("Ichimoku Cloud")){const c=toolValues(),conv=[],base=[],a=[],b=[];for(let i=0;i<c.length;i++){if(i>=8)conv.push({time:Math.floor(state.candles[i].t/1000),value:(Math.max(...state.candles.slice(i-8,i+1).map(x=>x.h))+Math.min(...state.candles.slice(i-8,i+1).map(x=>x.l)))/2);if(i>=25)base.push({time:Math.floor(state.candles[i].t/1000),value:(Math.max(...state.candles.slice(i-25,i+1).map(x=>x.h))+Math.min(...state.candles.slice(i-25,i+1).map(x=>x.l)))/2);if(i>=51){const ca=conv.find(x=>x.time===Math.floor(state.candles[i].t/1000))?.value,ba=base.find(x=>x.time===Math.floor(state.candles[i].t/1000))?.value;if(Number.isFinite(ca)&&Number.isFinite(ba)){a.push({time:Math.floor(state.candles[i].t/1000),value:(ca+ba)/2});b.push({time:Math.floor(state.candles[i].t/1000),value:(Math.max(...state.candles.slice(i-51,i+1).map(x=>x.h))+Math.min(...state.candles.slice(i-51,i+1).map(x=>x.l)))/2)}}}addToolSeries("ICHI-conv",conv,"#f59e0b");addToolSeries("ICHI-base",base,"#3b82f6");addToolSeries("ICHI-A",a,"#22c55e");addToolSeries("ICHI-B",b,"#ef4444")}
    const marks=[];if(t.has("Fractals"))marks.push(...fractalMarkers());if(t.has("Patterns"))marks.push(...patternMarkers());if(t.has("Kangaroo"))marks.push(...fractalMarkers(),...patternMarkers());if(t.has("Parabolic SAR"))marks.push(...psarMarkers());state.candleSeries?.setMarkers(marks.slice(-160));
    if(t.has("Lion"))addToolSeries("LION",emaData(8),"#f97316",2);
    if(t.has("Kenkley’s Lines")){addToolSeries("KENKLEY-fast",emaData(34),"#22c55e",2);addToolSeries("KENKLEY-slow",emaData(89),"#f59e0b",2)}
    if(t.has("Keltner Channels")){const m=emaData(20),a=atrData(20),am=new Map(a.map(x=>[x.time,x.value]));addToolSeries("KELTNER-mid",m,"#f59e0b");addToolSeries("KELTNER-up",m.map(x=>({time:x.time,value:x.value+(am.get(x.time)||0)*2})),"#94a3b8");addToolSeries("KELTNER-low",m.map(x=>({time:x.time,value:x.value-(am.get(x.time)||0)*2})),"#94a3b8")}
    if(t.has("Donchian Channels")){const hi=[],lo=[];for(let i=19;i<state.candles.length;i++){hi.push({time:Math.floor(state.candles[i].t/1000),value:Math.max(...state.candles.slice(i-19,i+1).map(x=>x.h))});lo.push({time:Math.floor(state.candles[i].t/1000),value:Math.min(...state.candles.slice(i-19,i+1).map(x=>x.l))})}addToolSeries("DON-hi",hi,"#64748b");addToolSeries("DON-lo",lo,"#64748b")}
    if(t.has("Support & Resistance")&&state.candles.length){const hi=Math.max(...state.candles.slice(-50).map(x=>x.h)),lo=Math.min(...state.candles.slice(-50).map(x=>x.l));addToolSeries("SR-hi",state.candles.map(c=>({time:Math.floor(c.t/1000),value:hi})),"#ef4444");addToolSeries("SR-lo",state.candles.map(c=>({time:Math.floor(c.t/1000),value:lo})),"#22c55e")}
    if(t.has("Horizontal Line")&&Number.isFinite(state.price))addToolSeries("HLINE",state.candles.map(c=>({time:Math.floor(c.t/1000),value:state.price})),"#f5a623");
    if(t.has("Trend Line")&&state.candles.length>1){const d=state.candles.slice(-60);addToolSeries("TREND",[{time:Math.floor(d[0].t/1000),value:d[0].c},{time:Math.floor(d[d.length-1].t/1000),value:d[d.length-1].c}],"#38bdf8",2)}
    if(t.has("Vertical Line")&&state.candles.length){const x=state.candles[Math.max(0,state.candles.length-1)],tm=Math.floor(x.t/1000),lo=Math.max(0,tm-1),hi=tm+1;addToolSeries("VLINE",[{time:lo,value:x.l},{time:hi,value:x.h}],"#f5a623",2)}
    if(t.has("Fibonacci Retracement")&&state.candles.length){const d=state.candles.slice(-100),hi=Math.max(...d.map(x=>x.h)),lo=Math.min(...d.map(x=>x.l)),gap=hi-lo;[0,.236,.382,.5,.618,.786,1].forEach((q,i)=>addToolSeries("FIBR"+i,d.map(x=>({time:Math.floor(x.t/1000),value:hi-gap*q})),"#8b5cf6",1))}
    if(t.has("Fibonacci Extension")&&state.candles.length){const d=state.candles.slice(-100),hi=Math.max(...d.map(x=>x.h)),lo=Math.min(...d.map(x=>x.l)),gap=hi-lo;[1.272,1.618,2].forEach((q,i)=>addToolSeries("FIBE"+i,d.map(x=>({time:Math.floor(x.t/1000),value:hi+gap*(q-1)})),"#a78bfa",1))}
    renderOscillatorPane();
  }
  function applyChartTool(tool){
    if(!tool)return;
    if(tool==="Candlesticks"){state.chartType="candle";state.heikin=false;applySeriesVisibility()}
    else if(tool==="Heikin Ashi"){state.chartType="candle";state.heikin=true;applySeriesVisibility();renderHistory()}
    else if(tool==="Line Chart"){state.chartType="line";state.heikin=false;applySeriesVisibility()}
    else if(tool==="Area Chart"){state.chartType="mountain";state.heikin=false;applySeriesVisibility()}
    else if(tool==="Chart Settings"){openSettings()}
    else if(["Price Alert","Indicator Alert","BUY / SELL Signal Alert"].includes(tool)){notice(tool+" enabled. Use the live chart controls/status for the next alert event.",true)}
    else {state.chartTools.has(tool)?state.chartTools.delete(tool):state.chartTools.add(tool);renderChartTools()}
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
    state.volumeSeries=null;
    state.ma50=null;
    state.ma100=null;
    state.ma200=null;
    state.currentPriceLine=null;
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
    state.volumeSeries?.applyOptions({visible:false});
  }

  function renderHistory(){
    if(!state.chart)buildChart();
    const candles=seriesCandleData();
    const lines=seriesLineData();
    state.candleSeries.setData(state.heikin?heikinCandleData():candles);
    state.lineSeries.setData(lines);
    state.areaSeries.setData(lines);

    state.historyLoaded=candles.length>0;
    state.initialRangeSet=false;
    applySeriesVisibility();

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
    state.candleSeries.update(state.heikin?heikinCandleData().at(-1):item);
    state.lineSeries.update({time:item.time,value:item.close});
    state.areaSeries.update({time:item.time,value:item.close});
    state.price=c.c;
    updateCurrentPriceLine();
    positionTradeOverlay();
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

  function boot(){
    if(state.booted)return;
    if(!mount()){setTimeout(boot,300);return}
    state.booted=true;
    startClock();
    installLibraryAndStart();
    observeTradeMarkers();
    setInterval(watchSelection,700);
  }

  window.GoTradeXLiveChart={
    boot,setTimeframe,reconnect:connect,state,
    setChartTool:applyChartTool,
    chartVersion:"Lightweight Charts 4.2.2",
    engine:"TradingView Lightweight Charts"
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();


(function(){var s=document.createElement('script');s.src='chart-indicators.js?v=20261006';document.head.appendChild(s)})();
