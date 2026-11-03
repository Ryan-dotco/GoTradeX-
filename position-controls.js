/* GoTradeX Stop Loss / Take Profit chart controls.
 * Local storage is a display cache only. A level is active only after the
 * server-backed Demo position engine confirms it.
 */
(function(){
 "use strict";
 if(window.GoTradeXPositionControls)return;
 const KEY="gotradex_position_levels_v1";
 let active=null, dragging=null, root=null, layer=null, candidateLine=null, restoreTab=null, confirmedLevels={sl:null,tp:null}, autoArmed=false, panelHidden=true, panelCollapsed=false, panelDrag=null, selectedLevel=null;
 const $=id=>document.getElementById(id);
 const money=n=>Number.isFinite(Number(n))?Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:6}):"—";
 function mode(){return String(localStorage.getItem("gotradex_account_mode")||"DEMO").toUpperCase();}
 function read(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch(_){return {}}}
 function save(){const all=read();if(active)all[active.id]=active;try{localStorage.setItem(KEY,JSON.stringify(all))}catch(_){}}
 function chart(){return window.GoTradeXLiveChart&&window.GoTradeXLiveChart.state}
 function currentPrice(){const s=chart();return Number(s&&s.price)||Number(active&&active.entryPrice)||0}
 function fmt(n){return money(n)}
 function ensure(){
  const chartBox=$("gtxLiveChart");
  /* The control panel must exist even before the chart mounts. */
  layer=$("gtxLWCExpiryLayer");
  if(chartBox){
   if(!layer){layer=document.createElement("div");layer.id="gtxLWCExpiryLayer";chartBox.appendChild(layer);}
   chartBox.style.setProperty("position","relative","important");
   layer.style.setProperty("display","block","important");
   layer.style.setProperty("position","absolute","important");
   layer.style.setProperty("inset","0","important");
   layer.style.setProperty("z-index","2147483000","important");
   layer.style.setProperty("overflow","hidden","important");
   layer.style.setProperty("pointer-events","none","important");
   layer.style.setProperty("visibility","visible","important");
   layer.style.setProperty("opacity","1","important");
   layer.setAttribute("aria-hidden","false");
   if(!document.getElementById("gtxpc-line-sl")){
    ["sl","tp"].forEach(k=>{const el=document.createElement("div");el.className="gtxpc-line "+k;el.id="gtxpc-line-"+k;el.innerHTML='<span></span>';layer.appendChild(el);el.addEventListener("pointerdown",e=>startDrag(e,k));});
    candidateLine=document.createElement("div");candidateLine.className="gtxpc-candidate";candidateLine.id="gtxpc-candidate";candidateLine.innerHTML="<span></span>";layer.appendChild(candidateLine);candidateLine.addEventListener("pointerdown",candidateDown);
   }
  }
  if(root&&root.isConnected){if(chartBox&&root.parentElement!==chartBox)chartBox.appendChild(root);root.style.setProperty("display",panelHidden?"none":"block","important");root.style.setProperty("visibility","visible","important");root.style.setProperty("opacity","1","important");if(restoreTab&&chartBox&&restoreTab.parentElement!==chartBox)chartBox.appendChild(restoreTab);if(restoreTab)restoreTab.style.display=panelHidden?"block":"none";return true;}
  root=document.createElement("div");root.id="gtxPositionControls";
  root.innerHTML='<div class="gtxpc-head" id="gtxpc-drag-handle" title="Drag to move this panel"><div><b>POSITION LEVELS · MOVE ME</b><small id="gtxpc-mode">DEMO • SETUP</small></div><div class="gtxpc-head-buttons"><button type="button" id="gtxpc-back" aria-label="Hide position controls and return to chart" title="Back to chart">←</button><button type="button" id="gtxpc-hide" aria-label="Hide position controls" title="Hide panel">−</button><button type="button" id="gtxpc-dismiss" aria-label="Hide position controls" title="Hide panel">×</button></div></div><div class="gtxpc-body" id="gtxpc-body"><div class="gtxpc-row"><button type="button" data-level="sl" class="gtxpc-level sl"><span>STOP LOSS</span><b id="gtxpc-sl-value">Not set</b></button><button type="button" data-level="tp" class="gtxpc-level tp"><span>TAKE PROFIT</span><b id="gtxpc-tp-value">Not set</b></button></div><div id="gtxpc-live" class="gtxpc-live">BYBIT PRICE · waiting for verified tick</div><div class="gtxpc-actions"><button type="button" id="gtxpc-auto">AUTO SET</button><button type="button" id="gtxpc-manual">MANUAL DRAG</button><button type="button" id="gtxpc-edit">ENTER PRICE</button><button type="button" id="gtxpc-close">HIDE PANEL</button></div><div class="gtxpc-note" id="gtxpc-note">Drag either line on the chart or enter an exact price. Server confirmation is required for active SL/TP.</div></div>';
  (chartBox||document.body).appendChild(root);
  restoreTab=document.createElement("button");restoreTab.id="gtxpc-restore";restoreTab.type="button";restoreTab.textContent="SL / TP";restoreTab.setAttribute("aria-label","Show Stop Loss and Take Profit controls");restoreTab.style.cssText="position:absolute;right:8px;top:8px;z-index:2147483646;display:none;padding:7px 10px;border:1px solid #315271;border-radius:7px;background:#07182b;color:#eaf3fb;font:900 10px system-ui;box-shadow:0 3px 10px #0006";restoreTab.addEventListener("click",()=>{panelHidden=false;root.style.setProperty("display","block","important");restoreTab.style.display="none";});(chartBox||document.body).appendChild(restoreTab);
  const style=document.createElement("style");style.id="gtxpc-style";style.textContent=
  '#gtxPositionControls{position:absolute!important;z-index:2147483647!important;left:8px;top:8px;width:min(260px,calc(100% - 16px));max-width:calc(100% - 16px);pointer-events:auto;background:transparent;border:1px solid #45627e;border-radius:10px;padding:8px;box-shadow:none;color:#eaf3fb;font:11px system-ui}'+
  '.gtxpc-head{display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:move;touch-action:none;user-select:none}.gtxpc-head b{font-size:10px;letter-spacing:.4px}.gtxpc-head small{display:block;color:#91a9c2;font-size:8px;margin-top:2px}.gtxpc-head-buttons{display:flex;gap:4px;flex:0 0 auto}.gtxpc-head-buttons button{background:transparent;color:#dce9f7;border:1px solid #45627e;border-radius:5px;width:24px;height:22px;padding:0;font-weight:900}#gtxpc-dismiss{border-color:#b65a68;color:#ff9aa4}'+
  '.gtxpc-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.gtxpc-level{min-width:0;text-align:left;border-radius:7px;padding:6px;background:transparent;color:#fff;border:1px solid #45627e}.gtxpc-level span{display:block;font-size:8px;font-weight:900;color:#a9bdd0}.gtxpc-level b{display:block;font-size:11px;margin-top:3px}.gtxpc-level.sl{border-left:3px solid #ef626b}.gtxpc-level.tp{border-left:3px solid #25c783}'+
  '.gtxpc-actions{display:flex;gap:5px;margin-top:7px}.gtxpc-actions button{flex:1;background:transparent;color:#eaf3fb;border:1px solid #45627e;border-radius:6px;padding:6px 3px;font-size:8px;font-weight:900}'+
  '.gtxpc-live{font:800 9px/1.35 ui-monospace,monospace;color:#d8e7f7;margin-top:6px;font-variant-numeric:tabular-nums}'+
  '.gtxpc-note{font-size:8px;line-height:1.35;color:#91a9c2;margin-top:6px}'+
  '.gtxpc-line{position:absolute;left:0;right:72px;height:2px;z-index:2147483001;pointer-events:auto;touch-action:none;cursor:ns-resize}'+
  '.gtxpc-line.sl{background:#ef626b;box-shadow:0 0 7px #ef626b77}.gtxpc-line.tp{background:#25c783;box-shadow:0 0 7px #25c78377}'+
  '.gtxpc-line span{position:absolute;right:-70px;top:-12px;width:68px;text-align:center;padding:3px 2px;border-radius:4px;background:#07182b;color:#fff;font:900 9px system-ui;white-space:nowrap;pointer-events:none;border:1px solid currentColor}'+
  '.gtxpc-line.sl span{color:#ff8990;border-color:#ef626b}.gtxpc-line.tp span{color:#58e8ae;border-color:#25c783}'+
  '.gtxpc-candidate{position:absolute;left:0;right:0;height:3px;z-index:2147483003;border-top:2px dotted #c5cbd3;box-shadow:0 0 7px #d5dce588;pointer-events:auto;touch-action:none;cursor:ns-resize;display:none}'+
  '.gtxpc-candidate span{position:absolute;right:0;top:-13px;min-width:84px;text-align:center;padding:3px 4px;border-radius:4px;background:#aeb7c2;color:#101b28;border:1px solid #eef2f6;font:900 10px system-ui;white-space:nowrap}'+
  '@media(max-width:420px){#gtxPositionControls{left:6px;top:6px;width:min(220px,calc(100% - 12px));padding:6px}.gtxpc-note{font-size:7px}.gtxpc-actions button{font-size:7px}}';
  document.head.appendChild(style);
  $("gtxpc-hide").addEventListener("click",hidePanel);
  $("gtxpc-back").addEventListener("click",hidePanel);
  $("gtxpc-dismiss").addEventListener("click",hidePanel);
  $("gtxpc-close").addEventListener("click",hidePanel);
  const dragHandle=$("gtxpc-drag-handle");dragHandle.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;if(e.button!==0&&e.pointerType!=="touch")return;const box=root.parentElement.getBoundingClientRect(),r=root.getBoundingClientRect();panelDrag={x:e.clientX,y:e.clientY,left:r.left-box.left,top:r.top-box.top,box};e.preventDefault();try{dragHandle.setPointerCapture(e.pointerId)}catch(_){}});
  dragHandle.addEventListener("pointermove",e=>{if(!panelDrag)return;const box=root.parentElement.getBoundingClientRect(),maxLeft=Math.max(0,box.width-root.offsetWidth),maxTop=Math.max(0,box.height-root.offsetHeight);const left=Math.max(0,Math.min(maxLeft,panelDrag.left+e.clientX-panelDrag.x)),top=Math.max(0,Math.min(maxTop,panelDrag.top+e.clientY-panelDrag.y));root.style.left=left+"px";root.style.top=top+"px";});
  const endPanelDrag=()=>{panelDrag=null};dragHandle.addEventListener("pointerup",endPanelDrag);dragHandle.addEventListener("pointercancel",endPanelDrag);
  root.querySelectorAll("[data-level]").forEach(b=>b.addEventListener("click",()=>{const k=b.dataset.level;if(autoArmed){autoArmed=false;const autoButton=$("gtxpc-auto");if(autoButton)autoButton.textContent="AUTO SET";placeAuto(k);}else edit(k);}));
  $("gtxpc-auto").addEventListener("click",autoSet);
  $("gtxpc-manual").addEventListener("click",()=>{if(!active){note("Open a Demo position first.");return;}note("Manual placement: drag vertically on the chart to set the grey price line, then release. Choose PLACE or MODIFY STOP LOSS / TAKE PROFIT to confirm that one level.");});
  $("gtxpc-edit").addEventListener("click",()=>edit("both"));

  return true;
 }
 function note(s){const el=$("gtxpc-note");if(el)el.textContent=s}
 function hidePanel(){panelHidden=true;if(root)root.style.setProperty("display","none","important");if(restoreTab)restoreTab.style.display="block";}
 async function persistLevels(){if(!active?.id||String(active.id).startsWith("local-")){active.sl=confirmedLevels.sl;active.tp=confirmedLevels.tp;save();render();note("No server-backed position selected. SL/TP are not protected.");return false;}const rt=window.GoTradeXServerRuntime;if(!rt?.call){active.sl=confirmedLevels.sl;active.tp=confirmedLevels.tp;save();render();note("Position engine unavailable. SL/TP are not protected.");return false;}try{const j=await rt.call("levels",{position_id:active.id,stop_loss:active.sl??null,take_profit:active.tp??null});if(!j?.position)throw new Error("Server did not return the updated position.");active={...active,...j.position,sl:j.position.stop_loss??null,tp:j.position.take_profit??null};confirmedLevels={sl:active.sl,tp:active.tp};save();render();note("SL/TP confirmed and saved by server.");return true;}catch(e){active.sl=confirmedLevels.sl;active.tp=confirmedLevels.tp;selectedLevel=confirmedLevels.sl!=null?"sl":confirmedLevels.tp!=null?"tp":"entry";save();render();note("SERVER REJECTED SL/TP: "+(e?.message||"request failed")+". Reverted to last server-confirmed levels; no new protection was activated.");return false;}}
 async function closePosition(){if(!active?.id)return;const rt=window.GoTradeXServerRuntime;if(!rt?.call){note("Position engine is not available.");return;}try{const j=await rt.call("close",{position_id:active.id});if(j.position){active=j.position;save();render();note("Position manually closed. Result: "+j.position.result+". Net P/L: "+fmt(j.position.pnl));window.dispatchEvent(new CustomEvent("gotradex:position-closed",{detail:j.position}));}}catch(e){note(e?.message||"Position could not be closed.");}}
 function edit(which){
  if(!active)return;
  const p=currentPrice();let sl=active.sl,tp=active.tp;
  const ask=(label,val)=>{const x=window.prompt(label,val?String(val):"");if(x===null)return null;const n=Number(x);return Number.isFinite(n)&&n>0?n:NaN};
  if(which==="sl"||which==="both"){const n=ask("Stop Loss price",sl);if(n===null)return;if(!Number.isFinite(n)){note("Enter a valid positive price.");return}sl=n}
  if(which==="tp"||which==="both"){const n=ask("Take Profit price",tp);if(n===null)return;if(!Number.isFinite(n)){note("Enter a valid positive price.");return}tp=n}
  const buy=active.side!=="SELL",entry=Number(active.entryPrice);if((sl!=null&&(!(sl>0)||(buy?sl>=entry:sl<=entry)))||(tp!=null&&(!(tp>0)||(buy?tp<=entry:tp>=entry)))){note("Invalid levels: BUY needs SL below and TP above entry; SELL needs SL above and TP below entry.");return;}active.sl=sl;active.tp=tp;save();render();note("Saving SL/TP to the server…");persistLevels();
 }
 function autoSet(){
  if(!active){note("Open a Demo position first.");return;}
  autoArmed=!autoArmed;
  const button=$("gtxpc-auto");if(button)button.textContent=autoArmed?"AUTO: CHOOSE SL/TP":"AUTO SET";
  note(autoArmed?"Auto mode armed. Tap STOP LOSS or TAKE PROFIT to place only that one level using the chart’s visible price scale.":"Auto mode cancelled. Choose a level to place it manually on the grey chart line.");
 }
 function validLevel(k,price){
  const entry=Number(active?.entryPrice),buy=String(active?.side||"BUY").toUpperCase()!=="SELL";
  if(!(Number.isFinite(price)&&price>0&&entry>0))return false;
  return k==="sl"?(buy?price<entry:price>entry):(buy?price>entry:price<entry);
 }
 function placeAt(k,price,source){
  if(!active||!(price>0))return;
  if(!validLevel(k,price)){note((k==="sl"?"Stop Loss":"Take Profit")+" price "+fmt(price)+" is on the wrong side of entry. "+(active.side==="SELL"?"SELL needs SL above and TP below entry.":"BUY needs SL below and TP above entry."));return;}
  const hadExisting=Number(active[k])>0;active[k]=price;selectedLevel=k;candidate=price;if(candidateLine)candidateLine.querySelector("span").textContent=(k==="sl"?"SL ":"TP ")+fmt(price);save();render();note((hadExisting?"Modify ":"Place ")+(k==="sl"?"Stop Loss":"Take Profit")+" at "+fmt(price)+" — waiting for server confirmation…");
  persistLevels();
 }
 function placeAuto(k){
  const s=chart(),host=$("gtxLWC");if(!active||!s?.candleSeries||!host){note("Chart price scale is unavailable; automatic placement was not made.");return;}
  const entry=Number(active.entryPrice),buy=String(active.side||"BUY").toUpperCase()!=="SELL";
  const yEntry=s.candleSeries.priceToCoordinate(entry),yLive=s.candleSeries.priceToCoordinate(currentPrice());
  let anchor=Number.isFinite(yEntry)?yEntry:yLive;
  if(!Number.isFinite(anchor)){note("Entry price is not visible on the chart scale. Zoom or scroll the chart, then try Auto again.");return;}
  const above=(k==="tp")===buy;
  const height=Math.max(1,host.clientHeight);
  let target=null;
  for(const distance of [48,64,80,96,120,144,168]){
   const y=Math.max(3,Math.min(height-3,anchor+(above?-distance:distance)));
   const p=s.candleSeries.coordinateToPrice(y);
   if(validLevel(k,p)){target=p;break;}
  }
  if(!(target>0)){note("No valid automatic price level is visible in the current chart scale. Adjust the chart scale and try again.");return;}
  placeAt(k,target,"auto");
 }
 function startDrag(e,k){
  if(!active)return;e.preventDefault();dragging=k;
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}
  moveDrag(e);
  const move=ev=>{if(dragging===k)moveDrag(ev)};
  const end=()=>{dragging=null;window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",end);window.removeEventListener("pointercancel",end);save();render();persistLevels();};
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
  const live=$("gtxpc-live"),cs=chart(),priceMarketMatch=!cs?.symbol||!active.provider_symbol||String(cs.symbol)===String(active.provider_symbol),last=Number(priceMarketMatch?currentPrice():active.last_price||active.entryPrice);if(live&&last>0){const gross=Number(active.amount||0)*((active.side==="SELL"?Number(active.entryPrice)-last:last-Number(active.entryPrice))/Number(active.entryPrice));const fee=Number(active.amount||0)*.001+(gross>0?gross*.10:gross<0?Number(active.amount||0)*.001:0);const net=gross-fee;live.textContent="BYBIT "+fmt(last)+"  ·  NET P/L "+(net>=0?"+":"")+fmt(net);}
  const s=chart(),host=$("gtxLWC");if(!s||!s.candleSeries||!host)return;
  const sameMarket=sameInstrument(s);
  ["sl","tp"].forEach(k=>{const el=$("gtxpc-line-"+k);if(el)el.style.display="none";});
  if(!sameMarket){if(candidateLine)candidateLine.style.display="none";return;}
  if(selectedLevel&&(selectedLevel==="entry"?Number(active.entryPrice)>0:Number(active[selectedLevel])>0)&&candidateLine){
   const levelPrice=selectedLevel==="entry"?Number(active.entryPrice):Number(active[selectedLevel]);
   const y=s.candleSeries.priceToCoordinate(levelPrice);
   if(Number.isFinite(y)){
    const offset=host.getBoundingClientRect().top-layer.getBoundingClientRect().top;
    candidateLine.style.display="block";
    candidateLine.style.top=(y+offset)+"px";
    candidateLine.querySelector("span").textContent=(selectedLevel==="entry"?"":selectedLevel==="sl"?"SL ":"TP ")+fmt(levelPrice);
   }
  }
 }
 function opened(event){
  const t=event&&event.detail&&(event.detail.trade||event.detail);if(!t)return;
  const id=String(t.id||t.trade_id||t.order_id||("local-"+Date.now()));selectedLevel="entry";
  const entry=Number(t.entry_price||t.entryPrice||t.open_price||t.openPrice||t.price||currentPrice());
  if(!(entry>0))return;
  const saved=read()[id]||{};
  active={...t,id,side:String(t.direction||t.side||"BUY").toUpperCase(),entryPrice:entry,provider_symbol:t.provider_symbol||t.providerSymbol||"",amount:Number(t.amount||0),last_price:Number(t.last_price||t.last_price===0?t.last_price:entry),sl:t.stop_loss??null,tp:t.take_profit??null,asset:t.asset||$("bottomAssetPair")?.textContent||"BTC/USD",createdAt:Date.now()};confirmedLevels={sl:active.sl,tp:active.tp};
  save();if(ensure()){panelHidden=true;root.style.setProperty("display","none","important");if(restoreTab)restoreTab.style.display="none";render();note("Position opened. Drag the grey dotted entry-price line to place or modify SL/TP.");}
 }
 window.addEventListener("gotradex:trade-opened",opened);
 window.addEventListener("gotradex:autobot-trade-opened",opened);
 window.addEventListener("gotradex:server-sync",e=>{const j=e.detail||{},p=(j.open||[]).find(x=>String(x.id)===String(active?.id))||(!active?(j.open||[])[0]:null);if(p){active={...p,entryPrice:Number(p.entry_price),side:p.direction,sl:p.stop_loss??null,tp:p.take_profit??null};confirmedLevels={sl:active.sl,tp:active.tp};save();if(ensure())root.style.setProperty("display",panelHidden?"none":"block","important");render();}const h=(j.history||[]).find(x=>String(x.id)===String(active?.id));if(h&&h.result!=="OPEN"){active={...active,...h};render();note("Position closed: "+h.close_reason+" · "+h.result+" · Net P/L "+fmt(h.pnl));}});
 window.addEventListener("resize",render);
 window.addEventListener("gotradex:asset-changed",()=>setTimeout(render,100));
 const timer=setInterval(()=>{if(!root||!root.isConnected){if(ensure()&&panelHidden)root.style.setProperty("display","none","important");}if(root){if(!panelHidden)root.style.setProperty("display","block","important");else root.style.setProperty("display","none","important");if(restoreTab)restoreTab.style.display=panelHidden?"block":"none";root.style.setProperty("visibility","visible","important");root.style.setProperty("opacity","1","important");}if(active)render()},500);

 /* Use the chart's own horizontal price/crosshair position as the SL/TP placement tool. */
 let candidate=null, chooser=null, gesture=null, placementInstalled=false;
 function ensureChooser(){
  if(chooser&&chooser.isConnected)return chooser;
  chooser=document.createElement("div");chooser.id="gtxpc-choice";
  chooser.innerHTML='<button type="button" data-pick="auto">PLACE / MODIFY</button><button type="button" data-pick="cancel">CANCEL</button>';
  chooser.style.cssText="position:absolute;z-index:2147483646;display:none;gap:5px;padding:5px;background:#07182b;border:1px solid #36516d;border-radius:7px;pointer-events:auto;box-shadow:0 4px 14px #0008";
  chooser.querySelectorAll("button").forEach(b=>{b.style.cssText="border:0;border-radius:5px;padding:7px 9px;font:900 10px system-ui;color:white;background:#173858";b.addEventListener("click",()=>{const pick=b.dataset.pick;if(pick==="cancel"){candidate=null;chooser.style.display="none";return;}if(!active||!candidate)return;const price=candidate,k=levelForPrice(price);if(!k){note("Move the grey line above or below the entry line to choose SL or TP.");return;}candidate=null;chooser.style.display="none";placeAt(k,price,"manual");});});
  layer.appendChild(chooser);return chooser;
 }
 function normSymbol(v){return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").replace(/USD$/,"USDT");}
 function sameInstrument(s){return !s?.symbol||!active?.provider_symbol||normSymbol(s.symbol)===normSymbol(active.provider_symbol);}
 function priceAt(clientY){const s=chart(),host=$("gtxLWC");if(!s||!s.candleSeries||!host||!sameInstrument(s))return null;const r=host.getBoundingClientRect(),localY=clientY-r.top;if(localY<0||localY>r.height)return null;const p=s.candleSeries.coordinateToPrice(localY);return Number.isFinite(p)&&p>0?p:null;}
 function levelForPrice(price){const entry=Number(active?.entryPrice);if(!(entry>0)||!Number.isFinite(price)||price===entry)return null;const above=price>entry,buy=String(active?.side||"BUY").toUpperCase()!=="SELL";return buy?(above?"tp":"sl"):(above?"sl":"tp");}
 function candidateDown(e){if(!active||e.button!==0)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();gesture={kind:"candidate"};try{candidateLine.setPointerCapture(e.pointerId)}catch(_){}const p=priceAt(e.clientY);if(p>0){candidate=p;const r=layer.getBoundingClientRect();candidateLine.style.top=(e.clientY-r.top)+"px";candidateLine.querySelector("span").textContent=fmt(p);}}
 function showChoice(price,y){candidate=price;const el=ensureChooser(),r=layer.getBoundingClientRect(),k=levelForPrice(price),kind=k==="sl"?"STOP LOSS":"TAKE PROFIT";el.querySelector("[data-pick=auto]").textContent=(Number(active?.[k])>0?"MODIFY ":"PLACE ")+kind;el.style.display="flex";el.style.left="10px";el.style.top=Math.max(8,Math.min(r.height-48,y-r.top-24))+"px";if(candidateLine){candidateLine.style.display="block";candidateLine.style.top=(y-r.top)+"px";candidateLine.querySelector("span").textContent=fmt(price);}note("Selected "+fmt(price)+". Choose Place or Modify for one level; the other level will not change.");}
 function chartDown(e){
  /* Only the visible grey dotted line is draggable; arbitrary chart taps do not place levels. */
  return;
  if(!active||e.button!==0)return;
  if(!sameInstrument(chart())){note("Select the same market as the open position before placing SL/TP.");return;}
  if(e.target.closest?.("#gtxPositionControls,#gtxpc-choice"))return;
  if(e.target.closest?.(".gtxpc-line,#gtxpc-candidate"))return;
  const kind="candidate",p=priceAt(e.clientY);if(!(p>0))return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  gesture={kind};candidate=p;selectedLevel=null;
  try{e.target.setPointerCapture?.(e.pointerId)}catch(_){}
  const r=layer.getBoundingClientRect();if(candidateLine){candidateLine.style.display="block";candidateLine.style.top=(e.clientY-r.top)+"px";candidateLine.querySelector("span").textContent=fmt(p);}
  render();
 }
 function chartMove(e){if(!gesture)return;const p=priceAt(e.clientY);if(!(p>0))return;e.preventDefault?.();const r=layer.getBoundingClientRect(),y=e.clientY-r.top;candidate=p;if(candidateLine){candidateLine.style.display="block";candidateLine.style.top=y+"px";candidateLine.querySelector("span").textContent=fmt(p);}note("Selected chart price "+fmt(p)+". Release to choose Stop Loss or Take Profit.");}
 function chartUp(e){if(!gesture)return;const kind=gesture.kind;gesture=null;if(kind==="candidate"){const finalPrice=priceAt(e.clientY);if(finalPrice>0)candidate=finalPrice;if(candidate){const r=layer.getBoundingClientRect();const y=Number.isFinite(e.clientY)?e.clientY:r.top+(candidateLine?parseFloat(candidateLine.style.top)||0:0);showChoice(candidate,y);}}else{save();render();persistLevels();note((kind==="sl"?"Stop Loss":"Take Profit")+" moved to "+fmt(active[kind])+". Updating engine…");}}
 function installPlacement(){const host=$("gtxLWC");if(!host||placementInstalled)return;placementInstalled=true;host.addEventListener("pointerdown",chartDown,true);window.addEventListener("pointermove",chartMove,true);window.addEventListener("pointerup",chartUp,true);window.addEventListener("pointercancel",chartUp,true);}
 const ensureBase=ensure;ensure=function(){const ok=ensureBase();if(ok)installPlacement();return ok;};
 window.GoTradeXPositionControls={get active(){return active},render,autoSet,edit,placeAuto,version:"1.0-single-grey-dotted-line-directional-sl-tp"};
 document.addEventListener("DOMContentLoaded",()=>{const init=()=>{if(ensure()){root.style.setProperty("display","block","important");if(!active)note("No open position detected. Open a Demo position to enable Stop Loss and Take Profit controls.");}};init();window.addEventListener("load",init,{once:true});});
})();