/* GoTradeX Stop Loss / Take Profit chart controls.
 * Shared Demo/Live presentation. This layer stores editable levels locally only;
 * it deliberately does not claim broker-side protection or close positions.
 */
(function(){
 "use strict";
 if(window.GoTradeXPositionControls)return;
 const KEY="gotradex_position_levels_v1";
 let active=null, dragging=null, root=null, layer=null;
 const $=id=>document.getElementById(id);
 const money=n=>Number.isFinite(Number(n))?Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:6}):"—";
 function mode(){return String(localStorage.getItem("gotradex_account_mode")||"DEMO").toUpperCase();}
 function read(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch(_){return {}}}
 function save(){const all=read();if(active)all[active.id]=active;try{localStorage.setItem(KEY,JSON.stringify(all))}catch(_){}}
 function chart(){return window.GoTradeXLiveChart&&window.GoTradeXLiveChart.state}
 function currentPrice(){const s=chart();return Number(s&&s.price)||Number(active&&active.entryPrice)||0}
 function fmt(n){return money(n)}
 function ensure(){
  layer=$("gtxLWCExpiryLayer");if(!layer)return false;
  if(root&&root.isConnected)return true;
  root=document.createElement("div");root.id="gtxPositionControls";
  root.innerHTML='<div class="gtxpc-head"><div><b>POSITION LEVELS</b><small id="gtxpc-mode">DEMO • SETUP</small></div><button type="button" id="gtxpc-hide" aria-label="Hide position controls">−</button></div><div class="gtxpc-row"><button type="button" data-level="sl" class="gtxpc-level sl"><span>STOP LOSS</span><b id="gtxpc-sl-value">Not set</b></button><button type="button" data-level="tp" class="gtxpc-level tp"><span>TAKE PROFIT</span><b id="gtxpc-tp-value">Not set</b></button></div><div class="gtxpc-actions"><button type="button" id="gtxpc-auto">AUTO SET</button><button type="button" id="gtxpc-manual">MANUAL DRAG</button><button type="button" id="gtxpc-edit">ENTER PRICE</button></div><div class="gtxpc-note" id="gtxpc-note">Drag either line on the chart or enter an exact price. Levels are saved as setup only; execution protection is not connected yet.</div>';
  layer.appendChild(root);
  const style=document.createElement("style");style.id="gtxpc-style";style.textContent=
  '#gtxPositionControls{position:absolute;z-index:2147483002;left:10px;top:10px;width:min(260px,calc(100% - 96px));pointer-events:auto;background:rgba(5,19,35,.94);border:1px solid #294765;border-radius:10px;padding:8px;box-shadow:0 4px 16px #0006;color:#eaf3fb;font:11px system-ui}'+
  '.gtxpc-head{display:flex;align-items:center;justify-content:space-between}.gtxpc-head b{font-size:10px;letter-spacing:.7px}.gtxpc-head small{display:block;color:#91a9c2;font-size:8px;margin-top:2px}#gtxpc-hide{background:#1a3552;color:#dce9f7;border-radius:5px;width:24px;height:22px}'+
  '.gtxpc-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.gtxpc-level{min-width:0;text-align:left;border-radius:7px;padding:6px;background:#122b45;color:#fff;border:1px solid #34516d}.gtxpc-level span{display:block;font-size:8px;font-weight:900;color:#a9bdd0}.gtxpc-level b{display:block;font-size:11px;margin-top:3px}.gtxpc-level.sl{border-left:3px solid #ef626b}.gtxpc-level.tp{border-left:3px solid #25c783}'+
  '.gtxpc-actions{display:flex;gap:5px;margin-top:7px}.gtxpc-actions button{flex:1;background:#173858;color:#eaf3fb;border:1px solid #315271;border-radius:6px;padding:6px 3px;font-size:8px;font-weight:900}'+
  '.gtxpc-note{font-size:8px;line-height:1.35;color:#91a9c2;margin-top:6px}'+
  '.gtxpc-line{position:absolute;left:0;right:72px;height:2px;z-index:2147483001;pointer-events:auto;touch-action:none;cursor:ns-resize}'+
  '.gtxpc-line.sl{background:#ef626b;box-shadow:0 0 7px #ef626b77}.gtxpc-line.tp{background:#25c783;box-shadow:0 0 7px #25c78377}'+
  '.gtxpc-line span{position:absolute;left:0;top:-15px;padding:2px 5px;border-radius:4px;background:#07182b;color:#fff;font:900 9px system-ui;white-space:nowrap;pointer-events:none}'+
  '@media(max-width:420px){#gtxPositionControls{left:6px;top:6px;width:220px;padding:6px}.gtxpc-note{font-size:7px}.gtxpc-actions button{font-size:7px}}';
  document.head.appendChild(style);
  ["sl","tp"].forEach(k=>{const el=document.createElement("div");el.className="gtxpc-line "+k;el.id="gtxpc-line-"+k;el.innerHTML='<span></span>';layer.appendChild(el);el.addEventListener("pointerdown",e=>startDrag(e,k));});
  $("gtxpc-hide").addEventListener("click",()=>{root.style.display="none";});
  root.querySelectorAll("[data-level]").forEach(b=>b.addEventListener("click",()=>edit(b.dataset.level)));
  $("gtxpc-auto").addEventListener("click",autoSet);
  $("gtxpc-manual").addEventListener("click",()=>note("Manual mode: drag the red Stop Loss or green Take Profit line up/down."));
  $("gtxpc-edit").addEventListener("click",()=>edit("both"));
  return true;
 }
 function note(s){const el=$("gtxpc-note");if(el)el.textContent=s}
 function edit(which){
  if(!active)return;
  const p=currentPrice();let sl=active.sl,tp=active.tp;
  const ask=(label,val)=>{const x=window.prompt(label,val?String(val):"");if(x===null)return null;const n=Number(x);return Number.isFinite(n)&&n>0?n:NaN};
  if(which==="sl"||which==="both"){const n=ask("Stop Loss price",sl);if(n===null)return;if(!Number.isFinite(n)){note("Enter a valid positive price.");return}sl=n}
  if(which==="tp"||which==="both"){const n=ask("Take Profit price",tp);if(n===null)return;if(!Number.isFinite(n)){note("Enter a valid positive price.");return}tp=n}
  active.sl=sl;active.tp=tp;save();render();note("Prices saved. Execution protection is not connected yet.");
 }
 function autoSet(){
  if(!active)return;const p=Number(active.entryPrice);if(!(p>0))return;
  const buy=active.side!=="SELL";
  active.sl=buy?p*.99:p*1.01;active.tp=buy?p*1.02:p*.98;
  save();render();note("Automatic levels set at 1% stop loss and 2% take profit from entry. You can drag either line to adjust.");
 }
 function startDrag(e,k){
  if(!active)return;e.preventDefault();dragging=k;
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}
  moveDrag(e);
  const move=ev=>{if(dragging===k)moveDrag(ev)};
  const end=()=>{dragging=null;window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",end);window.removeEventListener("pointercancel",end);save();render();};
  window.addEventListener("pointermove",move);window.addEventListener("pointerup",end);window.addEventListener("pointercancel",end);
 }
 function moveDrag(e){
  const s=chart(),host=$("gtxLWC");if(!s||!s.candleSeries||!host)return;
  const rect=host.getBoundingClientRect(),y=e.clientY-rect.top;
  const price=s.candleSeries.coordinateToPrice(y);if(!Number.isFinite(price)||price<=0)return;
  active[dragging]=price;render();
 }
 function render(){
  if(!active||!ensure())return;
  $("gtxpc-mode").textContent=mode()+" • "+(active.side||"POSITION")+" • SETUP";
  $("gtxpc-sl-value").textContent=active.sl?fmt(active.sl):"Not set";
  $("gtxpc-tp-value").textContent=active.tp?fmt(active.tp):"Not set";
  const s=chart(),host=$("gtxLWC");if(!s||!s.candleSeries||!host)return;
  ["sl","tp"].forEach(k=>{
   const el=$("gtxpc-line-"+k),v=Number(active[k]);
   if(!v){el.style.display="none";return}
   const y=s.candleSeries.priceToCoordinate(v);
   if(y===null||!Number.isFinite(y)){el.style.display="none";return}
   el.style.display="block";el.style.top=y+"px";
   el.querySelector("span").textContent=(k==="sl"?"SL ":"TP ")+fmt(v);
  });
 }
 function opened(event){
  const t=event&&event.detail&&(event.detail.trade||event.detail);if(!t)return;
  const id=String(t.id||t.trade_id||t.order_id||("local-"+Date.now()));
  const entry=Number(t.entry_price||t.entryPrice||t.open_price||t.openPrice||t.price||currentPrice());
  if(!(entry>0))return;
  const saved=read()[id]||{};
  active={id,side:String(t.direction||t.side||"BUY").toUpperCase(),entryPrice:entry,sl:saved.sl||null,tp:saved.tp||null,asset:t.asset||$("bottomAssetPair")?.textContent||"BTC/USD",createdAt:Date.now()};
  save();if(ensure()){root.style.display="block";render();note("Position detected. Set levels automatically or drag the red/green lines. These are setup controls only until the trade engine supports server-side SL/TP.");}
 }
 window.addEventListener("gotradex:trade-opened",opened);
 window.addEventListener("gotradex:autobot-trade-opened",opened);
 window.addEventListener("resize",render);
 window.addEventListener("gotradex:asset-changed",()=>setTimeout(render,100));
 const timer=setInterval(()=>{if(active)render()},500);

 /* Use the chart's own horizontal price/crosshair position as the SL/TP placement tool. */
 let candidate=null, chooser=null, gesture=null, placementInstalled=false;
 function ensureChooser(){
  if(chooser&&chooser.isConnected)return chooser;
  chooser=document.createElement("div");chooser.id="gtxpc-choice";
  chooser.innerHTML='<button type="button" data-pick="sl">SL · STOP LOSS</button><button type="button" data-pick="tp">TP · TAKE PROFIT</button><button type="button" data-pick="cancel">CANCEL</button>';
  chooser.style.cssText="position:absolute;z-index:2147483646;display:none;gap:5px;padding:5px;background:#07182b;border:1px solid #36516d;border-radius:7px;pointer-events:auto;box-shadow:0 4px 14px #0008";
  chooser.querySelectorAll("button").forEach(b=>{b.style.cssText="border:0;border-radius:5px;padding:7px 9px;font:900 10px system-ui;color:white;background:#173858";b.addEventListener("click",()=>{const pick=b.dataset.pick;if(pick==="cancel"){candidate=null;chooser.style.display="none";return;}if(!active||!candidate)return;active[pick]=candidate;save();candidate=null;chooser.style.display="none";render();note((pick==="sl"?"Stop Loss":"Take Profit")+" pinned at "+fmt(active[pick])+". Automatic server-side closing is not connected yet.");});});
  layer.appendChild(chooser);return chooser;
 }
 function priceAt(y){const s=chart(),host=$("gtxLWC");if(!s||!s.candleSeries||!host)return null;const r=host.getBoundingClientRect(),p=s.candleSeries.coordinateToPrice(y-r.top);return Number.isFinite(p)&&p>0?p:null;}
 function showChoice(price,y){candidate=price;const el=ensureChooser(),r=layer.getBoundingClientRect();el.style.display="flex";el.style.left="10px";el.style.top=Math.max(8,Math.min(r.height-48,y-r.top-24))+"px";note("Selected "+fmt(price)+". Choose SL or TP to pin this price.");}
 function chartDown(e){
  if(!active||e.button!==0)return;
  if(e.target.closest?.("#gtxPositionControls,#gtxpc-choice"))return;
  const line=e.target.closest?.(".gtxpc-line"),kind=line?(line.classList.contains("sl")?"sl":"tp"):"candidate";
  const p=priceAt(e.clientY);if(!(p>0))return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  gesture={kind};if(kind==="candidate")candidate=p;else active[kind]=p;render();
 }
 function chartMove(e){if(!gesture)return;const p=priceAt(e.clientY);if(!(p>0))return;if(gesture.kind==="candidate")candidate=p;else active[gesture.kind]=p;render();}
 function chartUp(e){if(!gesture)return;const kind=gesture.kind;gesture=null;if(kind==="candidate"){if(candidate)showChoice(candidate,e.clientY);}else{save();render();note((kind==="sl"?"Stop Loss":"Take Profit")+" moved to "+fmt(active[kind])+".");}}
 function installPlacement(){const host=$("gtxLWC");if(!host||placementInstalled)return;placementInstalled=true;host.addEventListener("pointerdown",chartDown,true);window.addEventListener("pointermove",chartMove,true);window.addEventListener("pointerup",chartUp,true);window.addEventListener("pointercancel",chartUp,true);}
 const ensureBase=ensure;ensure=function(){const ok=ensureBase();if(ok)installPlacement();return ok;};
 window.GoTradeXPositionControls={get active(){return active},render,autoSet,edit,version:"0.2-crosshair-level-placement"};
 document.addEventListener("DOMContentLoaded",()=>{if(ensure())root.style.display="none"});
})();