/* GoTradeX Live Chart Layer
 * One chart only. Uses verified Bybit Spot public trades for BTC/USDT.
 * 5-second candles are built from real incoming trades; no demo/random candles.
 */
(function(){
  "use strict";
  if(window.GoTradeXLiveChart) return;

  const CFG={
    ws:"wss://stream.bybit.com/v5/public/spot",
    rest:"https://api.bybit.com/v5/market/kline",
    symbol:"BTCUSDT",
    max:220,
    intervals:{
      "5 Seconds":5,"15 Seconds":15,"30 Seconds":30,
      "1 Minute":60,"2 Minutes":120,"5 Minutes":300,
      "15 Minutes":900,"30 Minutes":1800,"1 Hour":3600,
      "4 Hours":14400,"1 Day":86400,"1 Month":2592000,
      "3 Months":7776000,"6 Months":15552000,"1 Year":31536000
    }
  };

  let state={tf:"5 Seconds",sec:5,candles:[],price:null,prev:null,ws:null,
    connected:false,tradeStart:null,tradeEnd:null,flag:null,raf:0};

  function injectStyle(){
    if(document.getElementById("gtx-live-chart-style")) return;
    const s=document.createElement("style");s.id="gtx-live-chart-style";
    s.textContent=`
      #gtxLiveChart{position:relative;width:100%;height:clamp(300px,52vh,520px);min-height:300px;background:#061525;border:1px solid #16395f;border-radius:12px;overflow:hidden;box-sizing:border-box;touch-action:pan-y}
      #gtxLiveCanvas{position:absolute;inset:0;width:100%;height:100%;display:block}
      .gtxLCHead{position:absolute;z-index:4;top:7px;left:8px;right:8px;display:flex;align-items:center;gap:6px;pointer-events:none}
      .gtxLCHead>*{pointer-events:auto}
      .gtxLCBadge{font:900 9px/1 system-ui;color:#fff;background:#16a34a;border:1px solid #4ade80;border-radius:5px;padding:5px 7px}
      .gtxLCStatus{font:800 9px/1 system-ui;color:#a8bfd7;background:#081b31dd;border:1px solid #193d61;border-radius:5px;padding:5px 7px}
      .gtxLCSelect{margin-left:auto;background:#102945;color:#fff;border:1px solid #31597f;border-radius:6px;padding:5px 7px;font:800 9px system-ui}
      .gtxLCPrice{position:absolute;right:3px;z-index:5;padding:3px 5px;border-radius:4px;background:#f5a623;color:#071524;font:900 10px/1 system-ui;transform:translateY(-50%);pointer-events:none}
      .gtxLCFlag{position:absolute;z-index:6;transform:translate(-50%,-100%);font:900 12px/1 system-ui;display:none;filter:drop-shadow(0 2px 3px #000)}
      .gtxLCNotice{position:absolute;inset:50px 55px 35px 10px;display:grid;place-items:center;text-align:center;color:#6f8eac;font:800 11px/1.4 system-ui;pointer-events:none}
      .gtxLCNotice[hidden]{display:none}
      @media(max-width:600px){#gtxLiveChart{height:clamp(280px,48vh,430px);min-height:280px}.gtxLCHead{top:5px}.gtxLCSelect,.gtxLCStatus,.gtxLCBadge{font-size:8px;padding:4px 5px}.gtxLCPrice{font-size:9px}}
    `;
    document.head.appendChild(s);
  }

  function mount(){
    if(document.getElementById("gtxLiveChart")) return true;
    const pair=document.querySelector(".pairbar");
    const bottom=document.querySelector(".bottom");
    if(!pair||!bottom||!bottom.parentNode) return false;
    injectStyle();
    const box=document.createElement("section");box.id="gtxLiveChart";
    box.setAttribute("aria-label","GoTradeX live candlestick chart");
    box.innerHTML=`
      <canvas id="gtxLiveCanvas"></canvas>
      <div class="gtxLCHead">
        <span class="gtxLCBadge">LIVE</span><span class="gtxLCStatus" id="gtxLCStatus">CONNECTING • BYBIT</span>
        <select class="gtxLCSelect" id="gtxLCTF" aria-label="Chart timeframe"></select>
      </div>
      <div class="gtxLCPrice" id="gtxLCPrice" hidden></div>
      <div class="gtxLCFlag" id="gtxLCFlag">🚩</div>
      <div class="gtxLCNotice" id="gtxLCNotice">Connecting to verified live market data…</div>`;
    pair.insertAdjacentElement("afterend",box);
    const sel=document.getElementById("gtxLCTF");
    Object.keys(CFG.intervals).forEach(t=>{const o=document.createElement("option");o.value=t;o.textContent=t;if(t===state.tf)o.selected=true;sel.appendChild(o)});
    sel.onchange=()=>setTimeframe(sel.value);
    new ResizeObserver(draw).observe(box);
    window.addEventListener("resize",draw,{passive:true});
    return true;
  }

  function setStatus(t,ok){
    const e=document.getElementById("gtxLCStatus");if(e)e.textContent=t;
    if(e)e.style.color=ok?"#8ff0ae":"#a8bfd7";
  }
  function notice(t,show=true){const e=document.getElementById("gtxLCNotice");if(e){e.textContent=t;e.hidden=!show}}
  function keyTime(ms,sec){return Math.floor(ms/1000/sec)*sec*1000}

  function addTrade(ts,price,size){
    if(!Number.isFinite(price)||!Number.isFinite(ts)) return;
    const bucket=keyTime(ts,state.sec);
    let c=state.candles[state.candles.length-1];
    if(!c||c.t!==bucket){
      c={t:bucket,o:price,h:price,l:price,c:price,v:size||0};state.candles.push(c);
      if(state.candles.length>CFG.max)state.candles.shift();
    }else{
      c.h=Math.max(c.h,price);c.l=Math.min(c.l,price);c.c=price;c.v+=(size||0);
    }
    state.prev=state.price;state.price=price;draw();
  }

  async function loadHistory(){
    if(state.sec<60){
      state.candles=[];notice("Waiting for real-time trades to build "+state.tf+" candles…",true);draw();return;
    }
    try{
      const interval=Math.max(1,Math.round(state.sec/60));
      const u=CFG.rest+"?category=spot&symbol="+CFG.symbol+"&interval="+interval+"&limit=200";
      const r=await fetch(u,{cache:"no-store"});const j=await r.json();
      const rows=j&&j.result&&j.result.list||[];
      state.candles=rows.reverse().map(x=>({t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5])})).filter(x=>x.c>0);
      if(state.candles.length) state.price=state.candles[state.candles.length-1].c;
      notice("",false);draw();
    }catch(e){notice("Live stream connected. Historical candles unavailable; building from verified trades.",true);draw()}
  }

  function connect(){
    if(state.ws){try{state.ws.close()}catch(e){}}
    setStatus("CONNECTING • BYBIT",false);notice("Connecting to verified live market data…",true);
    const ws=new WebSocket(CFG.ws);state.ws=ws;
    ws.onopen=()=>{state.connected=true;setStatus("LIVE • BYBIT WEBSOCKET",true);notice("",false);
      ws.send(JSON.stringify({op:"subscribe",args:["publicTrade."+CFG.symbol]}));
    };
    ws.onmessage=e=>{
      try{
        const j=JSON.parse(e.data);
        if(!j.data||!Array.isArray(j.data))return;
        j.data.forEach(t=>addTrade(Number(t.T||Date.now()),Number(t.p),Number(t.v)));
      }catch(_){}
    };
    ws.onerror=()=>{state.connected=false;setStatus("FEED ERROR • RETRYING",false);notice("Unable to connect to Bybit live feed.",true)};
    ws.onclose=()=>{state.connected=false;setStatus("RECONNECTING • BYBIT",false);setTimeout(connect,2500)};
  }

  function setTimeframe(tf){
    if(!CFG.intervals[tf])return;state.tf=tf;state.sec=CFG.intervals[tf];
    state.candles=[];loadHistory();
  }

  function fmt(n){return Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
  function draw(){
    const box=document.getElementById("gtxLiveChart"),cv=document.getElementById("gtxLiveCanvas");if(!box||!cv)return;
    const dpr=Math.max(1,Math.min(2,devicePixelRatio||1)),w=box.clientWidth,h=box.clientHeight;
    cv.width=Math.floor(w*dpr);cv.height=Math.floor(h*dpr);const g=cv.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
    const left=8,right=62,top=30,bottom=25,cw=Math.max(1,w-left-right),ch=Math.max(1,h-top-bottom);
    const cs=state.candles.slice(-80);if(!cs.length)return;
    let lo=Math.min(...cs.map(x=>x.l)),hi=Math.max(...cs.map(x=>x.h));const pad=(hi-lo||1)*.08;lo-=pad;hi+=pad;
    const py=p=>top+(hi-p)/(hi-lo)*ch, step=cw/Math.max(1,cs.length);
    g.strokeStyle="#12304f";g.lineWidth=1;for(let i=0;i<5;i++){const y=top+ch*i/4;g.beginPath();g.moveTo(left,y);g.lineTo(left+cw,y);g.stroke()}
    g.font="9px system-ui";g.fillStyle="#7e9ab5";g.textAlign="left";
    for(let i=0;i<5;i++){const p=hi-(hi-lo)*i/4;g.fillText(fmt(p),w-right+5,top+9+ch*i/4)}
    cs.forEach((c,i)=>{
      const x=left+step*i+step*.5, up=c.c>=c.o, body=Math.max(2,Math.abs(py(c.o)-py(c.c)));
      g.strokeStyle=up?"#22c55e":"#ef4444";g.lineWidth=Math.max(2,Math.min(4,step*.35));g.beginPath();g.moveTo(x,py(c.h));g.lineTo(x,py(c.l));g.stroke();
      g.fillStyle=up?"#22c55e":"#ef4444";g.fillRect(x-Math.max(2,step*.3),Math.min(py(c.o),py(c.c)),Math.max(4,step*.6),body);
      if(i%Math.max(1,Math.floor(cs.length/5))===0){g.fillStyle="#708aa3";g.font="8px system-ui";g.textAlign="center";g.fillText(new Date(c.t).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:state.sec<60?"2-digit":undefined}),x,h-7)}
    });
    if(Number.isFinite(state.price)){
      const y=py(state.price),p=document.getElementById("gtxLCPrice");if(p){p.textContent=fmt(state.price);p.hidden=false;p.style.top=y+"px"}
      g.strokeStyle="#f5a623";g.setLineDash([5,4]);g.lineWidth=1;g.beginPath();g.moveTo(left,y);g.lineTo(w-right,y);g.stroke();g.setLineDash([]);
    }
    const flag=document.getElementById("gtxLCFlag");if(flag&&state.tradeStart){const x=left+cw*.18;flag.style.left=x+"px";flag.style.top=py(state.tradeStart.price)+"px";flag.style.display="block"}
  }

  function observeTradeMarkers(){
    document.addEventListener("click",e=>{
      const b=e.target.closest("#buy,#sell");if(!b)return;
      if(!state.price)return;
      state.tradeStart={time:Date.now(),price:state.price,side:b.id==="buy"?"BUY":"SELL"};
      draw();
    },true);
  }

  function boot(){
    if(!mount()){setTimeout(boot,300);return}
    loadHistory();connect();observeTradeMarkers();
    window.GoTradeXLiveChart={setTimeframe,reconnect:connect,state};
  }
  window.GoTradeXLiveChart={boot,setTimeframe,reconnect:connect,state};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();