/* GoTradeX Chart Tools: card-style expanders with real chart-engine actions. */
(function(){
"use strict";
const aliases={
 alligator:"Alligator",fractals:"Fractals",ao:"Awesome Oscillator",ema:"EMA / SMA",
 supertrend:"Supertrend",kangaroo:"Kangaroo",lion:"Lion",kenkley:"Kenkley’s Lines",
 rsi:"RSI",macd:"MACD",bb:"Bollinger Bands",ichimoku:"Ichimoku Cloud",
 parabolicsar:"Parabolic SAR",adx:"ADX",patterns:"Patterns",stochastic:"Stochastic",
 cci:"CCI",williamsr:"Williams %R",atr:"ATR",keltnerchannels:"Keltner Channels",
 donchianchannels:"Donchian Channels",supportresistance:"Support & Resistance",
 trendline:"Trend Line",horizontalline:"Horizontal Line",verticalline:"Vertical Line",
 fibonacciRetracement:"Fibonacci Retracement",fibonacciExtension:"Fibonacci Extension",
 candlesticks:"Candlesticks",heikinashi:"Heikin Ashi",linechart:"Line Chart",areachart:"Area Chart",
 pricealert:"Price Alert",indicatoralert:"Indicator Alert",buysellsignalalert:"BUY / SELL Signal Alert",
 chartsettings:"Chart Settings"
};
const descriptions={
 "Alligator":"Jaw, Teeth and Lips overlays calculated from the selected chart candles.",
 "Fractals":"Marks local swing highs and lows on the selected chart.",
 "EMA / SMA":"Moving-average overlays based on the current chart history.",
 "Supertrend":"ATR-based trend overlay calculated from current chart candles.",
 "Bollinger Bands":"Upper and lower volatility bands from the current chart history.",
 "Support & Resistance":"Adds horizontal levels from the recent chart high and low.",
 "Candlesticks":"Switches the main chart to candlesticks.",
 "Heikin Ashi":"Switches candle rendering to Heikin Ashi.",
 "Line Chart":"Switches the main chart to a close-price line.",
 "Area Chart":"Switches the main chart to an area chart."
};
function init(){
 const drawer=document.getElementById("chartToolsDrawer");if(!drawer||drawer.dataset.gtxCardsReady==="1")return;
 const panel=drawer.querySelector(".panel");if(!panel)return;
 drawer.dataset.gtxCardsReady="1";
 const style=document.createElement("style");style.id="gtx-chart-tools-cards-style";
 style.textContent=`
 #chartToolsDrawer .panel{width:min(560px,100vw)!important;padding:12px!important;overflow-y:auto!important;overscroll-behavior:contain}
 #chartToolsDrawer .panel h2{margin:8px 0 16px;font-size:18px}
 #chartToolsDrawer .category{margin:18px 2px 7px;color:#8fa8c4;font-size:10px;letter-spacing:1.3px}

 #chartToolsDrawer .gtxPortal{margin:10px 0 14px;border:1px solid #7a1f1f;border-radius:14px;background:#0d1930;overflow:hidden}
 #chartToolsDrawer .gtxPortalHead{width:100%;min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;background:#132040;border:0;color:#fff;text-align:left;font-size:14px;font-weight:800;letter-spacing:.2px;cursor:pointer}
 #chartToolsDrawer .gtxPortalHead.open{background:#192b4d;box-shadow:inset 3px 0 #ff3b3b}
 #chartToolsDrawer .gtxPortalArrow{font-size:20px;color:#ff7777;transition:transform .2s}
 #chartToolsDrawer .gtxPortalHead.open .gtxPortalArrow{transform:rotate(180deg)}
 #chartToolsDrawer .gtxPortalBody{display:none;padding:8px 10px 2px;max-height:65vh;overflow-y:auto}
 #chartToolsDrawer .gtxPortalBody.show{display:block}
 #chartToolsDrawer .gtxPortalBody .gtxToolCard{margin:8px 0 10px}

 #chartToolsDrawer .gtxToolCard{margin:10px 0}
 #chartToolsDrawer .tool-btn{width:100%;min-height:66px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#132040;border:1px solid #7a1f1f;border-radius:14px;padding:11px 13px;color:#fff;text-align:left;cursor:pointer}
 #chartToolsDrawer .tool-btn.open{border-color:#ff3b3b;box-shadow:0 0 12px #ff3b3b22}
 #chartToolsDrawer .tool-left{display:flex;align-items:center;gap:12px;min-width:0}
 #chartToolsDrawer .tool-icon{width:42px;height:42px;flex:0 0 42px;background:#1a2f55;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}
 #chartToolsDrawer .tool-text b{font-size:14px;color:#d0d8e6;display:block}
 #chartToolsDrawer .tool-text span{font-size:11px;opacity:.65;display:block;margin-top:3px;line-height:1.35}
 #chartToolsDrawer .tool-arrow{font-size:16px;opacity:.8;transition:transform .2s}
 #chartToolsDrawer .tool-btn.open .tool-arrow{transform:rotate(180deg)}
 #chartToolsDrawer .tool-body{display:none;background:#0f1d36;border:1px solid #1e335a;border-radius:12px;padding:0;margin:4px 0 14px;position:relative;max-height:55vh;overflow-y:auto}
 #chartToolsDrawer .tool-body.show{display:block;animation:gtxToolSlide .2s ease}
 @keyframes gtxToolSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
 #chartToolsDrawer .body-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #1a2f55}
 #chartToolsDrawer .body-head b{font-size:12px;opacity:.9}
 #chartToolsDrawer .body-content{padding:14px}
 #chartToolsDrawer .tool-description{font-size:12px;line-height:1.5;color:#9bb1cb}
 #chartToolsDrawer .tool-current-market{font-size:11px;margin-top:10px;color:#4ade80;background:#081325;border:1px solid #1e3a5f;border-radius:7px;padding:7px 9px}
 #chartToolsDrawer .apply-row{display:flex;gap:8px;margin-top:14px}
 #chartToolsDrawer .apply-btn{flex:1;min-height:42px;padding:10px 8px;border-radius:10px;border:1px solid #2a3f66;font-weight:800;font-size:11px;cursor:pointer}
 #chartToolsDrawer .apply-btn.on{background:#2563eb;border-color:#2563eb;color:#fff}
 #chartToolsDrawer .apply-btn.off{background:#132040;color:#d0d8e6}
 #chartToolsDrawer .apply-btn.applied{background:#00d084;border-color:#00d084;color:#061426}
 #chartToolsDrawer #chartToolsStatus{margin:10px 0;padding:9px;background:#0f1d36;border:1px solid #1a2f55;border-radius:8px;color:#9bb1cb;font-size:11px;line-height:1.45;text-align:left}
 @media(min-width:600px){#chartToolsDrawer .panel{width:min(560px,92vw)!important}}
 `;
 document.head.appendChild(style);
 const icons={"Alligator":"🐊","Fractals":"🔺","Patterns":"🧩","Awesome Oscillator":"📊","EMA / SMA":"📈","Supertrend":"🚀","Kangaroo":"🦘","Lion":"🦁","Kenkley’s Lines":"〰️","RSI":"⚡","MACD":"〰️","Bollinger Bands":"◍"};
 const status=panel.querySelector("#chartToolsStatus");
 const market=()=>{const pair=document.getElementById("bottomAssetPair")?.textContent||document.getElementById("pairName")?.textContent||"selected market";const mode=document.getElementById("bottomAssetMode")?.textContent||"current feed";return (pair+" • "+mode).trim();};

 // Turn each heading into a real expandable PORTAL and keep every existing tool inside it.
 const portalNames={
   "Trend & Pattern":"Chart Indicators",
   "Custom Indicators":"Custom Indicators",
   "Chart Type":"Chart Type",
   "Drawing & Price":"Drawing & Price",
   "Momentum":"Momentum",
   "Volatility":"Volatility",
   "Alerts & Controls":"Alert ⚠️ Control"
 };
 const categories=Array.from(panel.querySelectorAll(".category"));
 categories.forEach((category,idx)=>{
   const original=category.textContent.trim();
   const titleText=portalNames[original]||original;
   const portal=document.createElement("section");
   portal.className="gtxPortal";
   const portalHead=document.createElement("button");
   portalHead.type="button";
   portalHead.className="gtxPortalHead";
   portalHead.setAttribute("aria-expanded","false");
   const portalTitle=document.createElement("span");
   portalTitle.textContent=titleText;
   const portalArrow=document.createElement("span");
   portalArrow.className="gtxPortalArrow";
   portalArrow.textContent="⌄";
   portalHead.append(portalTitle,portalArrow);
   const portalBody=document.createElement("div");
   portalBody.className="gtxPortalBody";
   let node=category.nextSibling;
   while(node && !(node.nodeType===1 && (node.classList.contains("category") || node.id==="chartToolsStatus"))){
     const next=node.nextSibling;
     portalBody.appendChild(node);
     node=next;
   }
   category.replaceWith(portal);
   portal.append(portalHead,portalBody);
   portalHead.addEventListener("click",()=>{
     const open=!portalBody.classList.contains("show");
     panel.querySelectorAll(".gtxPortalBody.show").forEach(el=>el.classList.remove("show"));
     panel.querySelectorAll(".gtxPortalHead.open").forEach(el=>{el.classList.remove("open");el.setAttribute("aria-expanded","false")});
     if(open){portalBody.classList.add("show");portalHead.classList.add("open");portalHead.setAttribute("aria-expanded","true");}
   });
 });

 panel.querySelectorAll(".chartToolOption").forEach((old,index)=>{
   const name=old.dataset.tool||old.textContent.trim().replace(/›/g,"").trim();
   const card=document.createElement("section");card.className="gtxToolCard";
   const head=document.createElement("button");head.type="button";head.className="tool-btn";head.dataset.tool=name;
   const left=document.createElement("span");left.className="tool-left";
   const icon=document.createElement("span");icon.className="tool-icon";icon.textContent=icons[name]||"›";
   const textWrap=document.createElement("span");textWrap.className="tool-text";
   const title=document.createElement("b");title.textContent=name;
   const sub=document.createElement("span");sub.textContent=descriptions[name]||"Tool settings and chart availability for the selected market.";
   textWrap.append(title,sub);left.append(icon,textWrap);
   const arrow=document.createElement("span");arrow.className="tool-arrow";arrow.textContent="V";
   head.append(left,arrow);
   const body=document.createElement("div");body.className="tool-body";
   const bodyHead=document.createElement("div");bodyHead.className="body-head";
   const bodyTitle=document.createElement("b");bodyTitle.textContent=(icons[name]?icons[name]+" ":"")+name.toUpperCase();
   const close=document.createElement("button");close.type="button";close.className="closeToolBody";close.textContent="×";close.setAttribute("aria-label","Collapse "+name);close.style.cssText="width:32px;height:32px;background:#1a0a0a;border:1px solid #7a1f1f;border-radius:8px;color:#ff6a6a;font-size:20px";
   bodyHead.append(bodyTitle,close);
   const content=document.createElement("div");content.className="body-content";
   const desc=document.createElement("div");desc.className="tool-description";desc.textContent=descriptions[name]||"This item is in the requested tools list. The chart engine will report if its overlay is not implemented yet.";
   const current=document.createElement("div");current.className="tool-current-market";current.textContent="Selected chart: "+market();
   const actions=document.createElement("div");actions.className="apply-row";
   const apply=document.createElement("button");apply.type="button";apply.className="apply-btn on";apply.textContent="APPLY TO CHART";
   const remove=document.createElement("button");remove.type="button";remove.className="apply-btn off";remove.textContent="REMOVE";
   actions.append(apply,remove);content.append(desc,current,actions);body.append(bodyHead,content);
   old.replaceWith(card);card.append(head,body);
   const setStatus=msg=>{if(status)status.textContent=msg;};
   const closeCard=()=>{body.classList.remove("show");head.classList.remove("open");head.setAttribute("aria-expanded","false");};
   head.setAttribute("aria-expanded","false");
   head.addEventListener("click",()=>{
     const opening=!body.classList.contains("show");
     panel.querySelectorAll(".tool-body.show").forEach(el=>el.classList.remove("show"));
     panel.querySelectorAll(".tool-btn.open").forEach(el=>{el.classList.remove("open");el.setAttribute("aria-expanded","false")});
     if(opening){body.classList.add("show");head.classList.add("open");head.setAttribute("aria-expanded","true");current.textContent="Selected chart: "+market();}
   });
   close.addEventListener("click",closeCard);
   apply.addEventListener("click",()=>{
     const api=window.GoTradeXLiveChart;
     if(!api||typeof api.setChartTool!=="function"){setStatus("Chart engine is not ready. No tool was applied.");return;}
     const result=typeof api.setChartToolEnabled==="function"?api.setChartToolEnabled(name,true):api.setChartTool(name);
     if(result.ok){apply.classList.toggle("applied",result.active!==false);apply.textContent=result.active===false?"APPLY TO CHART":"✓ APPLIED TO CHART";remove.classList.toggle("applied",false);setStatus(result.message||name+" updated on the selected chart.");}
     else setStatus(result.message||name+" is not implemented in the chart engine yet. No fake live result was shown.");
   });
   remove.addEventListener("click",()=>{
     const api=window.GoTradeXLiveChart;
     if(!api||typeof api.setChartTool!=="function"){setStatus("Chart engine is not ready. Nothing was removed.");return;}
     const result=typeof api.setChartToolEnabled==="function"?api.setChartToolEnabled(name,false):api.setChartTool(name);
     if(result.ok){apply.classList.remove("applied");apply.textContent="APPLY TO CHART";setStatus(result.message||name+" removed from the selected chart.");}
     else setStatus(result.message||name+" could not be removed because it is not implemented.");
   });
 });
 const oldClose=panel.querySelector(".close");
 if(oldClose){oldClose.style.position="sticky";oldClose.style.top="0";oldClose.style.zIndex="8";}
 if(status)status.setAttribute("aria-live","polite");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();