/* GoTradeX Dashboard v1 — isolated first build.
   This module owns only the Dashboard screen. It does not alter Admin, Settings,
   broker connection, Signal Analyzer, Robot, Portfolio, Team, Chat, or Rules. */
(() => {
  "use strict";

  const assets = {
    forex: [
      ["EURUSD","EUR / USD"],["GBPUSD","GBP / USD"],["USDJPY","USD / JPY"],["USDCHF","USD / CHF"],
      ["AUDUSD","AUD / USD"],["USDCAD","USD / CAD"],["NZDUSD","NZD / USD"],["EURGBP","EUR / GBP"],
      ["EURJPY","EUR / JPY"],["EURCHF","EUR / CHF"],["EURAUD","EUR / AUD"],["EURCAD","EUR / CAD"],
      ["EURNZD","EUR / NZD"],["GBPJPY","GBP / JPY"],["GBPCHF","GBP / CHF"],["GBPAUD","GBP / AUD"],
      ["GBPCAD","GBP / CAD"],["GBPNZD","GBP / NZD"],["AUDJPY","AUD / JPY"],["AUDCHF","AUD / CHF"],
      ["AUDCAD","AUD / CAD"],["AUDNZD","AUD / NZD"],["CADJPY","CAD / JPY"],["CADCHF","CAD / CHF"],
      ["NZDJPY","NZD / JPY"],["NZDCHF","NZD / CHF"],["CHFJPY","CHF / JPY"],["USDZAR","USD / ZAR"],
      ["USDMXN","USD / MXN"],["USDTRY","USD / TRY"],["USDNOK","USD / NOK"],["USDSEK","USD / SEK"],
      ["USDSGD","USD / SGD"],["USDPLN","USD / PLN"],["USDHUF","USD / HUF"],["USDCZK","USD / CZK"],
      ["EURZAR","EUR / ZAR"],["GBPZAR","GBP / ZAR"],["AUDZAR","AUD / ZAR"],["CADZAR","CAD / ZAR"]
    ],
    indices: [
      ["US500","S&P 500"],["NAS100","Nasdaq 100"],["US30","Dow Jones 30"],["GER40","DAX 40"],
      ["UK100","FTSE 100"],["JPN225","Nikkei 225"],["FRA40","CAC 40"],["AUS200","ASX 200"],
      ["HK50","Hang Seng 50"],["CHINA50","China A50"],["EU50","Euro Stoxx 50"],["ESP35","IBEX 35"],
      ["ITA40","Italy 40"],["NED25","Netherlands 25"],["SWI20","Swiss Market"],["SGP20","Singapore 20"],
      ["IND50","India 50"],["SA40","South Africa 40"],["TA35","Tel Aviv 35"],["KOSPI","KOSPI"]
    ],
    commodities: [
      ["WTIUSD","WTI Crude Oil"],["BRENTUSD","Brent Crude Oil"],["NATGASUSD","Natural Gas"],
      ["COPPERUSD","Copper"],["COTTONUSD","Cotton"],["COCOAUSD","Cocoa"],["COFFEEUSD","Coffee"],
      ["SUGARUSD","Sugar"]
    ],
    metals: [
      ["XAUUSD","Gold / USD"],["XAGUSD","Silver / USD"],["XPTUSD","Platinum / USD"],["XPDUSD","Palladium / USD"],
      ["XAUEUR","Gold / EUR"],["XAUGBP","Gold / GBP"],["XAGEUR","Silver / EUR"],["XAGGBP","Silver / GBP"]
    ],
    crypto: [
      ["BTCUSDT","Bitcoin / USD"],["ETHUSDT","Ethereum / USD"],["BNBUSDT","BNB / USD"],["SOLUSDT","Solana / USD"],
      ["XRPUSDT","XRP / USD"],["ADAUSDT","Cardano / USD"],["DOGEUSDT","Dogecoin / USD"],["AVAXUSDT","Avalanche / USD"],
      ["DOTUSDT","Polkadot / USD"],["LINKUSDT","Chainlink / USD"],["LTCUSDT","Litecoin / USD"],["BCHUSDT","Bitcoin Cash / USD"],
      ["TRXUSDT","TRON / USD"],["SHIBUSDT","Shiba Inu / USD"],["TONUSDT","Toncoin / USD"],["XLMUSDT","Stellar / USD"],
      ["ATOMUSDT","Cosmos / USD"],["ETCUSDT","Ethereum Classic / USD"],["FILUSDT","Filecoin / USD"],["APTUSDT","Aptos / USD"],
      ["NEARUSDT","NEAR / USD"],["ALGOUSDT","Algorand / USD"],["ICPUSDT","Internet Computer / USD"],["HBARUSDT","Hedera / USD"],
      ["VETUSDT","VeChain / USD"],["UNIUSDT","Uniswap / USD"],["AAVEUSDT","Aave / USD"],["MKRUSDT","Maker / USD"],
      ["SANDUSDT","The Sandbox / USD"],["MANAUSDT","Decentraland / USD"],["PEPEUSDT","Pepe / USD"]
    ]
  };

  const basePrices = {
    BTCUSDT:64231.5, ETHUSDT:3450.2, BNBUSDT:610.2, SOLUSDT:148.4, XRPUSDT:2.4, ADAUSDT:.82, DOGEUSDT:.17,
    AVAXUSDT:38.1, DOTUSDT:4.9, LINKUSDT:18.2, LTCUSDT:96.2, BCHUSDT:540, TRXUSDT:.31, SHIBUSDT:.000012,
    TONUSDT:3.2, XLMUSDT:.3, ATOMUSDT:4.6, ETCUSDT:18.7, FILUSDT:2.1, APTUSDT:4.2, NEARUSDT:2.6,
    ALGOUSDT:.21, ICPUSDT:5.2, HBARUSDT:.22, VETUSDT:.03, UNIUSDT:7, AAVEUSDT:250, MKRUSDT:1800,
    SANDUSDT:.25, MANAUSDT:.24, PEPEUSDT:.000009, EURUSD:1.0821, GBPUSD:1.263, USDJPY:150.2, USDCHF:.85,
    AUDUSD:.66, USDCAD:1.37, NZDUSD:.6, EURGBP:.86, EURJPY:162.5, EURCHF:.92, EURAUD:1.64, EURCAD:1.48,
    EURNZD:1.8, GBPJPY:189.7, GBPCHF:1.07, GBPAUD:1.91, GBPCAD:1.73, GBPNZD:2.1, AUDJPY:99.1, AUDCHF:.56,
    AUDCAD:.9, AUDNZD:1.1, CADJPY:109.6, CADCHF:.62, NZDJPY:90.1, NZDCHF:.51, CHFJPY:176.7, USDZAR:17.5,
    USDMXN:19.3, USDTRY:41, USDNOK:10, USDSEK:9.35, USDSGD:1.28, USDPLN:3.7, USDHUF:335, USDZAR:17.5,
    USDCZK:21.2, EURZAR:18.9, GBPZAR:22.1, AUDZAR:11.6, CADZAR:12.8, WTIUSD:78.2, BRENTUSD:82.1,
    NATGASUSD:3.1, COPPERUSD:4.2, COTTONUSD:.72, COCOAUSD:7800, COFFEEUSD:290, SUGARUSD:.18,
    XAUUSD:2340.1, XAGUSD:28.5, XPTUSD:980, XPDUSD:930, XAUEUR:2160, XAUGBP:1810, XAGEUR:26.3, XAGGBP:22.1,
    US500:5200, NAS100:18200, US30:39000, GER40:18500, UK100:8300, JPN225:39000, FRA40:8200, AUS200:7900,
    HK50:18000, CHINA50:13500, EU50:5000, ESP35:11300, ITA40:34000, NED25:900, SWI20:12000, SGP20:3400,
    IND50:26000, SA40:7600, TA35:2050, KOSPI:3500
  };

  const state = {
    symbol:"BTCUSDT",
    category:"crypto",
    chartType:"candles",
    timeframe:"1m",
    indicators:new Set(),
    candles:[]
  };

  const $ = id => document.getElementById(id);
  const page = () => $("page-dashboard");

  function priceFor(symbol) {
    return Number(basePrices[symbol] || 100);
  }

  function makeCandles(symbol) {
    const base = priceFor(symbol);
    let close = base;
    const out = [];
    for (let i=0;i<90;i++) {
      const wave = Math.sin(i/4.7)*0.002 + Math.sin(i/11)*0.0012 + ((i%7)-3)*0.00015;
      const open = close;
      close = Math.max(base*0.0001, close*(1+wave));
      const spread = Math.max(base*0.0009, Math.abs(close-open)*1.8);
      const high = Math.max(open,close) + spread*(0.55+(i%3)*0.12);
      const low = Math.min(open,close) - spread*(0.55+((i+1)%3)*0.12);
      out.push({open,high,low,close});
    }
    return out;
  }

  function fmt(v) {
    if (!Number.isFinite(v)) return "—";
    if (v >= 1000) return v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
    if (v >= 1) return v.toFixed(4);
    return v.toFixed(6);
  }

  function selectedName() {
    for (const list of Object.values(assets)) {
      const found = list.find(x => x[0] === state.symbol);
      if (found) return found[1];
    }
    return state.symbol;
  }

  function renderAssets(category) {
    const list = $("gtxAssetList");
    if (!list) return;
    state.category = category;
    list.innerHTML = assets[category].map(([symbol,name]) =>
      '<button type="button" data-select-asset="'+symbol+'"><strong>'+symbol+'</strong><span>'+name+'</span></button>'
    ).join("");
    list.querySelectorAll("[data-select-asset]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.symbol = btn.dataset.selectAsset;
        state.candles = makeCandles(state.symbol);
        $("gtxSelectedAsset").textContent = selectedName();
        $("gtxPriceLabel").textContent = selectedName();
        closeMenus();
        draw();
      });
    });
  }

  function closeMenus(except) {
    ["gtxAssetMenu","gtxChartMenu","gtxTimeframeMenu"].forEach(id => {
      if (id !== except) $(id)?.setAttribute("hidden","");
    });
  }

  function toggleMenu(id) {
    const el=$(id);
    if (!el) return;
    const open=el.hasAttribute("hidden");
    closeMenus(open ? id : "");
    if (open) el.removeAttribute("hidden");
  }

  function ema(values,p) {
    const k=2/(p+1), out=[];
    let e=values[0]||0;
    values.forEach((v,i)=>{ if(i===0)e=v; else e=(v-e)*k+e; out.push(e); });
    return out;
  }

  function sma(values,p) {
    return values.map((_,i)=> i<p-1 ? null : values.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p);
  }

  function smma(values,p) {
    if(values.length<p)return values.map(()=>null);
    const out=new Array(values.length).fill(null);
    let v=values.slice(0,p).reduce((a,b)=>a+b,0)/p; out[p-1]=v;
    for(let i=p;i<values.length;i++){v=((v*(p-1))+values[i])/p;out[i]=v;}
    return out;
  }

  function heikin(candles) {
    let po=null,pc=null;
    return candles.map(c=>{
      const close=(c.open+c.high+c.low+c.close)/4;
      const open=po===null?(c.open+c.close)/2:(po+pc)/2;
      po=open;pc=close;
      return {open,close,high:Math.max(c.high,open,close),low:Math.min(c.low,open,close)};
    });
  }

  function drawLine(ctx, values, mapY, xAt, lineWidth=1) {
    ctx.beginPath(); let started=false;
    values.forEach((v,i)=>{if(!Number.isFinite(v))return;const x=xAt(i),y=mapY(v);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);});
    if(started){ctx.lineWidth=lineWidth;ctx.stroke();}
  }

  function draw() {
    const canvas=$("gtxDashboardCanvas"), wrap=canvas?.parentElement;
    if(!canvas||!wrap)return;
    const rect=wrap.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
    const w=Math.max(320,Math.floor(rect.width)), h=Math.max(180,Math.floor(rect.height));
    canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width="100%";canvas.style.height="100%";
    const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);

    const source=state.chartType==="heikin"?heikin(state.candles):state.candles;
    const vals=source.map(c=>c.close), highs=source.map(c=>c.high), lows=source.map(c=>c.low);
    let hi=Math.max(...highs), lo=Math.min(...lows), range=Math.max(hi-lo,hi*.001);
    hi+=range*.08;lo-=range*.08;
    const left=8,right=58,top=10,bottom=18,oscHeight=(state.indicators.has("rsi")||state.indicators.has("macd"))?58:0,plotW=w-left-right,plotH=h-top-bottom-oscHeight;
    const xAt=i=>left+(i+.5)*(plotW/source.length);
    const yAt=v=>top+(hi-v)/(hi-lo)*plotH;
    ctx.fillStyle="#07111f";ctx.fillRect(0,0,w,h);
    ctx.font="10px Arial";ctx.fillStyle="#91a4bd";ctx.strokeStyle="rgba(145,164,189,.10)";ctx.lineWidth=1;

    for(let i=0;i<=5;i++){
      const y=top+plotH*i/5;
      ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();
      ctx.fillText(fmt(hi-(hi-lo)*i/5),w-right+6,y+3);
    }

    const slot=plotW/source.length, body=Math.max(2,Math.min(14,slot*.68));
    source.forEach((c,i)=>{
      const x=xAt(i), up=c.close>=c.open;
      ctx.strokeStyle=up?"#22c55e":"#ef4444";ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;
      if(state.chartType==="line"){
        if(i===0)ctx.beginPath();
        if(i===0)ctx.moveTo(x,yAt(c.close));else ctx.lineTo(x,yAt(c.close));
        if(i===source.length-1)ctx.stroke();
      } else {
        ctx.beginPath();ctx.moveTo(x,yAt(c.high));ctx.lineTo(x,yAt(c.low));ctx.stroke();
        if(state.chartType==="bars"){
          ctx.beginPath();ctx.moveTo(x-body*.55,yAt(c.open));ctx.lineTo(x,yAt(c.open));ctx.moveTo(x,yAt(c.close));ctx.lineTo(x+body*.55,yAt(c.close));ctx.stroke();
        } else {
          ctx.fillRect(x-body/2,Math.min(yAt(c.open),yAt(c.close)),body,Math.max(1,Math.abs(yAt(c.close)-yAt(c.open))));
        }
      }
    });

    if(state.indicators.has("ema")){
      ctx.strokeStyle="#f59e0b";drawLine(ctx,ema(vals,9),yAt,xAt,1.2);
      ctx.strokeStyle="#60a5fa";drawLine(ctx,ema(vals,21),yAt,xAt,1.2);
    }
    if(state.indicators.has("sma")){
      ctx.strokeStyle="#fb7185";drawLine(ctx,sma(vals,50),yAt,xAt,1.1);
    }
    if(state.indicators.has("alligator")){
      ctx.strokeStyle="#2563eb";drawLine(ctx,smma(vals,13),yAt,xAt,1.1);
      ctx.strokeStyle="#ef4444";drawLine(ctx,smma(vals,8),yAt,xAt,1.1);
      ctx.strokeStyle="#22c55e";drawLine(ctx,smma(vals,5),yAt,xAt,1.1);
    }
    if(state.indicators.has("bollinger")){
      const mid=sma(vals,20);
      const upper=[],lower=[];
      vals.forEach((_,i)=>{
        if(i<19){upper.push(null);lower.push(null);return;}
        const a=vals.slice(i-19,i+1),m=mid[i],sd=Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/20);
        upper.push(m+2*sd);lower.push(m-2*sd);
      });
      ctx.strokeStyle="#c084fc";drawLine(ctx,upper,yAt,xAt,1);drawLine(ctx,lower,yAt,xAt,1);
    }
    if(state.indicators.has("vwap")){
      let pv=0,v=0;const line=[];
      source.forEach(c=>{const vol=1+Math.abs(c.close-c.open)*1000;pv+=((c.high+c.low+c.close)/3)*vol;v+=vol;line.push(pv/v);});
      ctx.strokeStyle="#38bdf8";drawLine(ctx,line,yAt,xAt,1.1);
    }
    if(state.indicators.has("rsi")){
      const period=14, r=[];
      for(let i=0;i<vals.length;i++){
        if(i<period){r.push(null);continue;}
        let gain=0,loss=0;
        for(let j=i-period+1;j<=i;j++){const d=vals[j]-vals[j-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}
        const rs=loss===0?100:gain/loss;
        r.push(loss===0?100:100-(100/(1+rs)));
      }
      const oy=h-bottom-oscHeight, oh=oscHeight-5, ry=v=>oy+(100-v)/100*oh;
      ctx.strokeStyle="rgba(145,164,189,.16)";ctx.beginPath();ctx.moveTo(left,ry(70));ctx.lineTo(w-right,ry(70));ctx.moveTo(left,ry(30));ctx.lineTo(w-right,ry(30));ctx.stroke();
      ctx.strokeStyle="#a78bfa";drawLine(ctx,r,ry,xAt,1.2);ctx.fillStyle="#91a4bd";ctx.fillText("RSI",left+3,oy+10);
    }
    if(state.indicators.has("macd")){
      const fast=ema(vals,12), slow=ema(vals,26), macd=vals.map((_,i)=>fast[i]-slow[i]), signal=ema(macd,9);
      const all=macd.concat(signal), mx=Math.max(...all.map(Math.abs),1e-9), oy=h-bottom-oscHeight, oh=oscHeight-5, my=v=>oy+oh/2-(v/mx)*(oh/2);
      ctx.strokeStyle="rgba(145,164,189,.16)";ctx.beginPath();ctx.moveTo(left,oy+oh/2);ctx.lineTo(w-right,oy+oh/2);ctx.stroke();
      ctx.strokeStyle="#38bdf8";drawLine(ctx,macd,my,xAt,1.1);ctx.strokeStyle="#f59e0b";drawLine(ctx,signal,my,xAt,1.1);ctx.fillStyle="#91a4bd";ctx.fillText("MACD",left+3,oy+10);
    }

    if(state.indicators.has("fibonacci")){
      const levels=[0,0.236,0.382,0.5,0.618,0.786,1];
      ctx.setLineDash([4,4]);ctx.strokeStyle="rgba(245,158,11,.55)";
      levels.forEach(l=>{const y=yAt(lo+(hi-lo)*l);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillStyle="#f59e0b";ctx.fillText((l*100).toFixed(1)+"%",w-right-36,y-2);});
      ctx.setLineDash([]);
    }

    $("gtxPriceLabel").textContent=selectedName()+"  "+fmt(source[source.length-1].close);
    $("gtxChartModeLabel").textContent=state.chartType==="heikin"?"Heikin-Ashi":state.chartType.charAt(0).toUpperCase()+state.chartType.slice(1);
  }

  function bind() {
    if(page()?.dataset.dashboardV1==="true")return;
    page().dataset.dashboardV1="true";
    $("gtxAssetButton")?.addEventListener("click",()=>toggleMenu("gtxAssetMenu"));
    $("gtxChartButton")?.addEventListener("click",()=>toggleMenu("gtxChartMenu"));
    $("gtxTimeframeButton")?.addEventListener("click",()=>toggleMenu("gtxTimeframeMenu"));

    document.querySelectorAll("[data-asset-category]").forEach(btn=>{
      btn.addEventListener("click",()=>{renderAssets(btn.dataset.assetCategory);});
    });
    document.querySelectorAll("[data-chart-type]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        state.chartType=btn.dataset.chartType;
        $("gtxChartModeLabel").textContent=state.chartType;
        closeMenus();draw();
      });
    });
    document.querySelectorAll("[data-indicator]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const key=btn.dataset.indicator;
        state.indicators.has(key)?state.indicators.delete(key):state.indicators.add(key);
        btn.classList.toggle("selected",state.indicators.has(key));
        draw();
      });
    });
    document.querySelectorAll("[data-timeframe]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        state.timeframe=btn.dataset.timeframe;
        $("gtxTimeframeButton").textContent=btn.textContent+" ▾";
        $("gtxDurationDisplay").textContent=btn.textContent;
        closeMenus();draw();
      });
    });
    $("gtxTradeAmount")?.addEventListener("input",e=>{
      if(Number(e.target.value)<0)e.target.value="0";
    });
    document.addEventListener("click",e=>{
      if(!e.target.closest(".gtx-dash-head"))closeMenus();
    });
    window.addEventListener("resize",draw);
    renderAssets("crypto");
    state.candles=makeCandles(state.symbol);
    draw();
  }

  function init() {
    if(!$("gtxDashboardCanvas"))return;
    bind();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
