/* GoTradeX Live Chart Layer — verified feeds only.
 * Bybit Spot: crypto live trades + historical klines.
 * Twelve Data: forex, metals, commodities, stocks and indices when a valid
 * feed/key is configured. No random/demo candles are generated.
 */
(function(){
  "use strict";
  if(window.GoTradeXLiveChart) return;

  const CFG={
    intervals:{
      "5 Seconds":5,"15 Seconds":15,"30 Seconds":30,"1 Minute":60,
      "2 Minutes":120,"5 Minutes":300,"15 Minutes":900,"30 Minutes":1800,
      "1 Hour":3600,"4 Hours":14400,"1 Day":86400,"1 Month":2592000,
      "3 Months":7776000,"6 Months":15552000,"1 Year":31536000
    },
    bybitWs:"wss://stream.bybit.com/v5/public/spot",
    bybitRest:"https://api.bybit.com/v5/market/kline"
  };

  let state={
    tf:"5 Seconds",sec:5,candles:[],price:null,prev:null,ws:null,
    provider:"",symbol:"",assetLabel:"BTC/USDT",mode:"LIVE",type:"crypto",
    connected:false,tradeStart:null,tradeEnd:null,lastAssetKey:"",poll:null,connectionId:0,historyReady:false
  };

  function feed(){return window.GoTradeXMarketFeeds}
  function selection(){
    const f=feed(); return f ? f.resolve() : {available:false,reason:"Market feed registry is not loaded."};
  }
  function injectStyle(){
    if(document.getElementById("gtx-live-chart-style"))return;
    const s=document.createElement("style");s.id="gtx-live-chart-style";
    s.textContent=
      "#gtxLiveChart{position:relative;width:100%;height:clamp(280px,48vh,520px);min-height:280px;background:#061525;border:1px solid #16395f;border-radius:12px;overflow:hidden;box-sizing:border-box;touch-action:pan-y}"+
      "#gtxLiveCanvas{position:absolute;inset:0;width:100%;height:100%;display:block}"+
      ".gtxLCHead{position:absolute;z-index:4;top:7px;left:8px;right:8px;display:flex;align-items:center;gap:6px;pointer-events:none}.gtxLCHead>*{pointer-events:auto}"+
      ".gtxLCBadge{font:900 9px/1 system-ui;color:#fff;background:#16a34a;border:1px solid #4ade80;border-radius:5px;padding:5px 7px}"+
      ".gtxLCStatus{font:800 9px/1 system-ui;color:#a8bfd7;background:#081b31dd;border:1px solid #193d61;border-radius:5px;padding:5px 7px}"+
      ".gtxLCSelect{margin-left:auto;background:#102945;color:#fff;border:1px solid #31597f;border-radius:6px;padding:5px 7px;font:800 9px system-ui}"+
      ".gtxLCPrice{position:absolute;right:3px;z-index:5;padding:3px 5px;border-radius:4px;background:#f5a623;color:#071524;font:900 10px/1 system-ui;transform:translateY(-50%);pointer-events:none}"+
      ".gtxLCFlag{position:absolute;z-index:6;transform:translate(-50%,-100%);font:900 12px/1 system-ui;display:none;filter:drop-shadow(0 2px 3px #000)}"+
      ".gtxLCNotice{position:absolute;inset:50px 55px 35px 10px;display:grid;place-items:center;text-align:center;color:#6f8eac;font:800 11px/1.4 system-ui;pointer-events:none}.gtxLCNotice[hidden]{display:none}"+
      "@media(max-width:600px){#gtxLiveChart{height:clamp(270px,45vh,430px);min-height:270px}.gtxLCSelect,.gtxLCStatus,.gtxLCBadge{font-size:8px;padding:4px 5px}.gtxLCPrice{font-size:9px}}";
    document.head.appendChild(s);
  }

  function mount(){
    if(document.getElementById("gtxLiveChart"))return true;
    const pair=document.querySelector(".pairbar"),bottom=document.querySelector(".bottom");
    if(!pair||!bottom||!bottom.parentNode)return false;
    injectStyle();
    const box=document.createElement("section");box.id="gtxLiveChart";
    box.setAttribute("aria-label","GoTradeX verified live candlestick chart");
    box.innerHTML=
      '<canvas id="gtxLiveCanvas"></canvas>'+
      '<div class="gtxLCHead"><span class="gtxLCBadge">LIVE</span><span class="gtxLCStatus" id="gtxLCStatus">CONNECTING</span><select class="gtxLCSelect" id="gtxLCTF" aria-label="Chart timeframe"></select></div>'+
      '<div class="gtxLCPrice" id="gtxLCPrice" hidden></div><div class="gtxLCFlag" id="gtxLCFlag">🚩</div>'+
      '<div class="gtxLCNotice" id="gtxLCNotice">Connecting to a verified market-data feed…</div>';
    pair.insertAdjacentElement("afterend",box);
    const sel=document.getElementById("gtxLCTF");
    Object.keys(CFG.intervals).forEach(t=>{
      const o=document.createElement("option");o.value=t;o.textContent=t;
      if(t===state.tf)o.selected=true;sel.appendChild(o);
    });
    sel.onchange=()=>setTimeframe(sel.value);
    if(window.ResizeObserver)new ResizeObserver(draw).observe(box);
    window.addEventListener("resize",draw,{passive:true});
    return true;
  }

  function status(t,ok){
    const e=document.getElementById("gtxLCStatus");if(!e)return;
    e.textContent=t;e.style.color=ok?"#8ff0ae":"#a8bfd7";
  }
  function notice(t,show=true){
    const e=document.getElementById("gtxLCNotice");if(e){e.textContent=t;e.hidden=!show}
  }
  function bucket(ms,sec){return Math.floor(ms/1000/sec)*sec*1000}

  function addTick(ts,price,volume){
    if(!Number.isFinite(price)||!Number.isFinite(ts))return;
    const b=bucket(ts,state.sec);
    let c=state.candles[state.candles.length-1];
    if(!c||c.t!==b){
      c={t:b,o:price,h:price,l:price,c:price,v:Number(volume||0)};
      state.candles.push(c);
      if(state.candles.length>220)state.candles.shift();
    }else{
      c.h=Math.max(c.h,price);c.l=Math.min(c.l,price);c.c=price;c.v+=Number(volume||0);
    }
    state.prev=state.price;state.price=price;draw();
  }

  function closeSocket(){
    if(state.ws){try{state.ws.close()}catch(_){}state.ws=null}
    if(state.poll){clearInterval(state.poll);state.poll=null}
  }

  async function loadBybitHistory(){
    // For 5/15/30-second views, build the initial window from REAL recent
    // Bybit trades. This prevents the chart from opening with one giant
    // stretched candle while the WebSocket slowly creates new buckets.
    if(state.sec<60){
      const u="https://api.bybit.com/v5/market/recent-trade?category=spot&symbol="+encodeURIComponent(state.symbol)+"&limit=1000";
      const r=await fetch(u,{cache:"no-store"}),j=await r.json();
      if(j.retCode!==0)throw new Error(j.retMsg||"Bybit recent trades unavailable.");
      const rows=(j?.result?.list||[]).slice().reverse();
      const byBucket=new Map();
      rows.forEach(x=>{
        const ts=Number(x.time),p=Number(x.price),v=Number(x.size||0);
        if(!Number.isFinite(ts)||!Number.isFinite(p))return;
        const b=bucket(ts,state.sec);
        let c=byBucket.get(b);
        if(!c)c={t:b,o:p,h:p,l:p,c:p,v:0};
        c.h=Math.max(c.h,p);c.l=Math.min(c.l,p);c.c=p;c.v+=v;
        byBucket.set(b,c);
      });
      state.candles=Array.from(byBucket.values()).sort((a,b)=>a.t-b.t).slice(-80);\n      state.historyReady=state.candles.length>=12;
    }else{
      const u=CFG.bybitRest+"?category=spot&symbol="+encodeURIComponent(state.symbol)+"&interval="+Math.max(1,Math.round(state.sec/60))+"&limit=200";
      const r=await fetch(u,{cache:"no-store"}),j=await r.json();
      if(j.retCode!==0)throw new Error(j.retMsg||"Bybit historical data unavailable.");
      const rows=j?.result?.list||[];
      state.candles=rows.slice().reverse().map(x=>({
        t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5])
      })).filter(x=>Number.isFinite(x.c));
    }
    if(state.candles.length)state.price=state.candles[state.candles.length-1].c;
  }

  async function connectBybit(){
    const id=++state.connectionId;
    closeSocket();const f=selection();
    if(!f.available||f.provider!=="BYBIT"){
      status("NO VERIFIED LIVE FEED",false);notice(f.reason||"Selected asset is not available on the verified Bybit Spot feed.",true);return;
    }
    state.provider=f.provider;state.symbol=f.symbol;
    status("CONNECTING • BYBIT",false);
    notice(state.sec<60?"Waiting for real Bybit trades to build "+state.tf+" candles…":"Loading verified Bybit candles…",true);
    try{
      await loadBybitHistory();
      if(id!==state.connectionId)return;
      draw();
      const ws=new WebSocket(CFG.bybitWs);state.ws=ws;
      ws.onopen=()=>{
        if(id!==state.connectionId){try{ws.close()}catch(_){}return}
        state.connected=true;status("LIVE • BYBIT WEBSOCKET",true);notice("",false);
        ws.send(JSON.stringify({op:"subscribe",args:["publicTrade."+state.symbol]}));
      };
      ws.onmessage=e=>{
        if(id!==state.connectionId)return;
        try{
          const j=JSON.parse(e.data);
          if(Array.isArray(j.data))j.data.forEach(t=>addTick(Number(t.T||Date.now()),Number(t.p),Number(t.v)));
        }catch(_){}
      };
      ws.onerror=()=>{if(id!==state.connectionId)return;state.connected=false;status("FEED ERROR",false);notice("Bybit live stream error. Retrying…",true)};
      ws.onclose=()=>{if(id!==state.connectionId)return;state.connected=false;status("RECONNECTING • BYBIT",false);setTimeout(()=>{if(id===state.connectionId)connect()},2500)};
    }catch(e){if(id!==state.connectionId)return;state.connected=false;status("FEED ERROR",false);notice(e.message||"Verified Bybit data unavailable.",true)}
  }

  async function resolveTwelveSymbol(f){
    if(f.provider!=="TWELVE_DATA_LOOKUP")return f.symbol;
    return await feed().twelveSearch(f.symbol);
  }

  async function loadTwelveHistory(symbol){
    state.candles=await feed().twelveHistory(symbol,state.sec);
    if(state.candles.length)state.price=state.candles[state.candles.length-1].c;
  }

  function connectTwelve(){
    const id=++state.connectionId;
    closeSocket();const f=selection();
    if(!f.available||!String(f.provider).startsWith("TWELVE_DATA")){
      status("NO VERIFIED LIVE FEED",false);notice(f.reason||"No verified provider is available for this asset.",true);return;
    }
    // Twelve Data credentials stay server-side in Supabase Edge Functions.
    status("VERIFYING • TWELVE DATA",false);notice("Checking verified provider access for "+f.label+"…",true);
    resolveTwelveSymbol(f).then(async symbol=>{
      if(id!==state.connectionId)return;
      state.symbol=symbol;state.provider="TWELVE_DATA";
      if(state.sec>=60){
        await loadTwelveHistory(symbol);
        if(id!==state.connectionId)return;
        draw();
        try{
          const p=await feed().twelvePrice(symbol);
          if(id!==state.connectionId)return;
          state.price=p.price;draw();
        }catch(_){}
      }
      const ws=await feed().twelveSocket(symbol,
        tick=>{if(id===state.connectionId)addTick(tick.time,tick.price,0)},
        (msg,ok)=>{
          if(id!==state.connectionId)return;
          status(ok?"LIVE • TWELVE DATA":msg,!!ok);
          if(ok)notice("",false);
        }
      );
      if(id!==state.connectionId){try{ws.close()}catch(_){}return}
      state.ws=ws;
    }).catch(e=>{
      if(id!==state.connectionId)return;
      state.connected=false;status("NO VERIFIED LIVE FEED",false);
      notice(e.message||"The selected symbol is not available through the configured verified provider.",true);
    });
  }

  function connect(){
    ++state.connectionId;
    const f=selection();
    state.mode=String(f.mode||"LIVE");state.type=f.type||"";
    state.assetLabel=f.label||"";
    state.candles=[];state.price=null;state.tradeStart=null;state.tradeEnd=null;state.historyReady=false;
    if(state.mode!=="LIVE"){closeSocket();status("OTC • FEED REQUIRED",false);notice("OTC 24/7 selected. No fake candles are generated; a verified OTC feed must be connected.",true);draw();return}
    if(f.provider==="BYBIT")connectBybit();
    else if(String(f.provider).startsWith("TWELVE_DATA"))connectTwelve();
    else{closeSocket();status("NO VERIFIED LIVE FEED",false);notice(f.reason||"No verified live feed is connected for this asset.",true);draw()}
  }

  function setTimeframe(tf){
    if(!CFG.intervals[tf])return;
    state.tf=tf;state.sec=CFG.intervals[tf];state.candles=[];connect();
  }

  function fmt(n){return Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
  function markerX(ts,left,cw,cs){
    if(!Number.isFinite(ts)||!cs.length)return null;
    const first=cs[0].t,last=cs[cs.length-1].t,span=Math.max(1,last-first);
    return left+Math.max(0,Math.min(1,(ts-first)/span))*cw;
  }

  function draw(){
    const box=document.getElementById("gtxLiveChart"),cv=document.getElementById("gtxLiveCanvas");
    if(!box||!cv)return;
    const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1)),w=box.clientWidth,h=box.clientHeight;
    cv.width=Math.floor(w*dpr);cv.height=Math.floor(h*dpr);
    const g=cv.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
    const left=8,right=62,top=30,bottom=25,cw=Math.max(1,w-left-right),ch=Math.max(1,h-top-bottom);
    const cs=state.candles.slice(-80);\n    if(!cs.length || (state.provider==="BYBIT" && state.sec<60 && !state.historyReady)){\n      document.getElementById("gtxLCPrice")?.setAttribute("hidden","");\n      return;\n    }
    let lo=Math.min(...cs.map(x=>x.l)),hi=Math.max(...cs.map(x=>x.h)),pad=(hi-lo||1)*.08;lo-=pad;hi+=pad;
    const py=p=>top+(hi-p)/(hi-lo)*ch;
    // Keep a stable, comfortable candle width instead of stretching the
    // first few live candles across the whole chart. On mobile this targets
    // roughly 24-32 visible candles; as more candles arrive, older ones leave
    // the window rather than making each candle grow/shrink dramatically.
    const targetPx=Math.max(24,Math.min(34,w<600?28:32));
    const targetVisible=Math.max(24,Math.min(32,Math.floor(cw/targetPx)));
    const step=cs.length>targetVisible ? cw/targetVisible : targetPx;
    const plotW=step*cs.length;
    const plotLeft=left+Math.max(0,cw-plotW);
    g.strokeStyle="#12304f";g.lineWidth=1;
    for(let i=0;i<5;i++){const y=top+ch*i/4;g.beginPath();g.moveTo(left,y);g.lineTo(left+cw,y);g.stroke()}
    g.font="9px system-ui";g.fillStyle="#7e9ab5";g.textAlign="left";
    for(let i=0;i<5;i++)g.fillText(fmt(hi-(hi-lo)*i/4),w-right+5,top+9+ch*i/4);
    cs.forEach((c,i)=>{
      const x=plotLeft+step*i+step*.5,up=c.c>=c.o,body=Math.max(2,Math.abs(py(c.o)-py(c.c)));
      g.strokeStyle=up?"#22c55e":"#ef4444";g.lineWidth=Math.max(1,Math.min(2,step*.08));
      g.beginPath();g.moveTo(x,py(c.h));g.lineTo(x,py(c.l));g.stroke();
      g.fillStyle=up?"#22c55e":"#ef4444";
      g.fillRect(x-Math.max(2,step*.22),Math.min(py(c.o),py(c.c)),Math.max(4,step*.44),body);
      if(i%Math.max(1,Math.floor(cs.length/5))===0){
        g.fillStyle="#708aa3";g.font="8px system-ui";g.textAlign="center";
        g.fillText(new Date(c.t).toLocaleTimeString([],{
          hour:"2-digit",minute:"2-digit",second:state.sec<60?"2-digit":undefined
        }),x,h-7);
      }
    });
    if(Number.isFinite(state.price)){
      const y=py(state.price),p=document.getElementById("gtxLCPrice");
      if(p){p.textContent=fmt(state.price);p.hidden=false;p.style.top=y+"px"}
      g.strokeStyle="#f5a623";g.setLineDash([5,4]);g.lineWidth=1;
      g.beginPath();g.moveTo(left,y);g.lineTo(w-right,y);g.stroke();g.setLineDash([]);
    }
    const flag=document.getElementById("gtxLCFlag");
    if(flag&&state.tradeStart){
      const x=markerX(state.tradeStart.time,plotLeft,plotW,cs)||plotLeft+step*.5;
      flag.style.left=x+"px";flag.style.top=py(state.tradeStart.price)+"px";flag.style.display="block";
      g.strokeStyle="#f5a623";g.setLineDash([4,4]);g.beginPath();g.moveTo(x,top);g.lineTo(x,top+ch);g.stroke();
      if(state.tradeEnd){const ex=markerX(state.tradeEnd.time,plotLeft,plotW,cs)||x;g.strokeStyle="#fff";g.beginPath();g.moveTo(ex,top);g.lineTo(ex,top+ch);g.stroke()}
      g.setLineDash([]);
    }
  }

  function observeTradeMarkers(){
    document.addEventListener("click",e=>{
      const b=e.target.closest("#buy,#sell");if(!b||!Number.isFinite(state.price))return;
      state.tradeStart={time:Date.now(),price:state.price,side:b.id==="buy"?"BUY":"SELL"};state.tradeEnd=null;draw();
    },true);
  }

  function watchSelection(){
    const f=selection();
    const k=[f.provider,f.symbol,f.label,f.type,state.tf,localStorage.getItem("gotradex_market_mode")].join("|");
    if(k!==state.lastAssetKey){state.lastAssetKey=k;connect()}
  }

  function boot(){
    if(!mount()){setTimeout(boot,300);return}
    const sel=document.getElementById("gtxLCTF");if(sel)sel.value=state.tf;
    window.GoTradeXLiveChart={boot,setTimeframe,reconnect:connect,state};
    observeTradeMarkers();watchSelection();setInterval(watchSelection,700);
  }

  window.GoTradeXLiveChart={boot,setTimeframe,reconnect:connect,state};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();