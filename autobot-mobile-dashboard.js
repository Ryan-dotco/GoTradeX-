(function(){
"use strict";
if(window.__gtxAutoBotMobileDashboardLoaded)return;
window.__gtxAutoBotMobileDashboardLoaded=true;
function mount(){
 if(document.getElementById("gtxAutoBotMobile"))return;
 var css="#gtxAutoBotMobile{position:fixed;inset:0;z-index:2147483004;display:none;overflow-y:auto;background:#0a1118;color:#fff;font-family:Roboto,Arial,sans-serif;padding-bottom:76px}#gtxAutoBotMobile.open{display:block}#gtxAutoBotMobile *{box-sizing:border-box}#gtxAutoBotMobile .ab-header{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:12px;background:#0a1118;border-bottom:1px solid #1a2a35}#gtxAutoBotMobile .ab-logo{font-size:20px;font-weight:900}#gtxAutoBotMobile .ab-logo b{color:#8aff5a}#gtxAutoBotMobile .ab-badge{border:1px solid #8aff5a;color:#8aff5a;padding:4px 10px;border-radius:16px;font-size:9px}#gtxAutoBotMobile .ab-card{margin:10px;border:1px solid #1a2a35;border-radius:12px;background:#0f1a22;padding:14px}#gtxAutoBotMobile .ab-price-card,#gtxAutoBotMobile .ab-green{border-color:#8aff5a;box-shadow:0 0 10px #8aff5a22}#gtxAutoBotMobile .ab-pair{font-size:18px;font-weight:800}#gtxAutoBotMobile small,#gtxAutoBotMobile .ab-sub{font-size:10px;color:#9aadb9;line-height:1.5}#gtxAutoBotMobile .ab-pair small{color:#8aff5a}#gtxAutoBotMobile .ab-price{font-size:24px;font-weight:900;color:#8aff5a;margin:7px 0}#gtxAutoBotMobile .ab-time-row{display:flex;gap:6px;overflow-x:auto;margin-top:10px}#gtxAutoBotMobile button{font-family:inherit;cursor:pointer;touch-action:manipulation}#gtxAutoBotMobile .ab-time-row button{padding:7px 12px;border-radius:6px;border:0;background:#1a2a35;color:#fff;font-size:12px}#gtxAutoBotMobile .ab-time-row button.active{background:#8aff5a;color:#000;font-weight:bold}#gtxAutoBotMobile .ab-chart{height:210px;margin:10px;border:1px solid #1a2a35;border-radius:12px;background:#0f1a22;padding:6px}#gtxAutoBotMobile canvas{width:100%;height:100%;display:block}#gtxAutoBotMobile .ab-stats{margin:10px;background:#0f1a22;border:1px solid #1a2a35;border-radius:8px;padding:9px;display:flex;justify-content:space-around;gap:8px;flex-wrap:wrap;font-size:10px;color:#8aff5a}#gtxAutoBotMobile .ab-muted{font-size:11px;color:#9aadb9}#gtxAutoBotMobile .ab-equity{font-size:24px;font-weight:900;margin:4px 0}#gtxAutoBotMobile .ab-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;font-size:11px}#gtxAutoBotMobile .ab-grid2 b{display:block;font-size:14px;color:#8aff5a;margin-top:3px}#gtxAutoBotMobile .ab-status{display:inline-block;background:#8aff5a;color:#000;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:bold}#gtxAutoBotMobile .ab-bar{height:6px;background:#1a2a35;border-radius:6px;margin-top:8px;overflow:hidden}#gtxAutoBotMobile .ab-fill{height:100%;width:0;background:#8aff5a}#gtxAutoBotMobile .ab-row{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #1a2a35;font-size:12px}#gtxAutoBotMobile .ab-actions{display:flex;gap:6px;margin:10px}#gtxAutoBotMobile .ab-actions button{flex:1;min-width:0;padding:12px 5px;border-radius:8px;border:1px solid #8aff5a;background:transparent;color:#fff;font-size:12px}#gtxAutoBotMobile .ab-actions .primary{background:#8aff5a;color:#000;font-weight:bold}#gtxAutoBotMobile .ab-bottom{position:fixed;bottom:0;left:0;right:0;z-index:6;background:#0f1a22;border-top:1px solid #1a2a35;display:flex;justify-content:space-around;padding:8px 0 calc(8px + env(safe-area-inset-bottom))}#gtxAutoBotMobile .ab-bottom button{background:none;border:0;color:#aaa;font-size:10px;display:flex;flex-direction:column;align-items:center;gap:2px;flex:1}#gtxAutoBotMobile .ab-bottom button.active{color:#8aff5a}#gtxAutoBotMobile .ab-close{background:#152634;color:#fff;border:1px solid #30495b;border-radius:8px;padding:7px 10px}@media(min-width:700px){#gtxAutoBotMobile .ab-content{max-width:760px;margin:auto}}";
 var st=document.createElement("style");st.id="gtxAutoBotMobileStyle";st.textContent=css;document.head.appendChild(st);
 var host=document.createElement("div");host.innerHTML='<div id="gtxAutoBotMobile" aria-hidden="true"><header class="ab-header"><div><div class="ab-logo">GoTrade<b>X</b> <span style="font-size:10px;opacity:.6">GTX-000001</span></div><div class="ab-sub">AI-assisted market analysis &amp; paper trading</div></div><button class="ab-close" type="button" data-ab-close>Close ×</button></header><div class="ab-content"><section class="ab-card ab-price-card"><div class="ab-pair"><span id="abPair">EUR/USD</span> <small>SELECTED MARKET</small></div><div class="ab-price" id="abPrice">—</div><div class="ab-sub" id="abFeedStatus">Quote not verified on this dashboard.</div><div class="ab-time-row"><button data-ab-time="1m">1m</button><button data-ab-time="5m">5m</button><button data-ab-time="15m">15m</button><button data-ab-time="1H" class="active">1H</button><button data-ab-time="4H">4H</button><button data-ab-time="1D">1D</button></div></section><div class="ab-chart"><canvas id="abCanvas" aria-label="Illustrative chart preview"></canvas></div><div class="ab-stats"><span>Open: —</span><span>High: —</span><span>Low: —</span><span>Vol: —</span></div><section class="ab-card ab-green"><div class="ab-muted">Portfolio Summary</div><div class="ab-muted">Account equity · selected account</div><div class="ab-equity" id="abEquity">$0.00</div><div id="abProfit" style="font-size:12px;color:#8aff5a">+$0.00 · recorded result</div><div class="ab-grid2"><div>Today’s P/L<b id="abToday">Not available</b></div><div>Buying Power<b id="abBuyingPower">Not available</b></div></div><div class="ab-sub" style="margin-top:8px">Values use recorded account state where available. No sample funds are shown as real funds.</div></section><section class="ab-card"><div style="font-size:13px;font-weight:bold">AUTOBOT STATUS</div><div class="ab-status" id="abBotStatus" style="margin:6px 0">NOT ACTIVATED</div><div style="font-size:11px;line-height:1.7">Strategy: <span id="abStrategy">Not configured</span><br>Risk: <span id="abRisk">Not configured</span> · Confidence: <span>Not available</span><br>Trades today: <span>Not available</span> · Win rate: <span>Not available</span></div><div class="ab-bar"><div class="ab-fill" id="abFill"></div></div><div class="ab-sub" style="margin-top:6px" id="abBotNote">Status does not confirm that a live strategy is executing.</div></section><section class="ab-card"><div style="font-size:13px;font-weight:bold">Open Position</div><div style="color:#8aff5a;font-size:12px;font-weight:bold;margin-top:6px" id="abPosition">No verified open position available</div><div class="ab-sub" style="margin-top:5px">Check the trading portal for recorded orders.</div></section><section class="ab-card"><div style="font-size:13px;font-weight:bold;margin-bottom:6px">Watchlist</div><div class="ab-row"><span>GBP/USD</span><span class="ab-sub">Check Markets for quote</span></div><div class="ab-row"><span>USD/JPY</span><span class="ab-sub">Check Markets for quote</span></div><div class="ab-row"><span>XAU/USD</span><span class="ab-sub">Check Markets for quote</span></div></section><div class="ab-actions"><button class="primary" type="button" data-ab-action="trade">+ New Trade</button><button type="button" data-ab-action="pause" id="abPause">Pause</button><button type="button" data-ab-action="settings">Settings</button></div></div><nav class="ab-bottom"><button class="active" data-ab-nav="dashboard">📊<span>Dashboard</span></button><button data-ab-nav="trading">📈<span>Trading</span></button><button data-ab-nav="autobot">🤖<span>AutoBot</span></button><button data-ab-nav="portfolio">💼<span>Portfolio</span></button><button data-ab-nav="history">🕘<span>History</span></button></nav></div>';
 document.body.appendChild(host.firstElementChild);
 var root=document.getElementById("gtxAutoBotMobile");
 function getAccount(){try{return JSON.parse(localStorage.getItem("gotradex_user_autobot_account")||"{}")||{}}catch(e){return {}}}
 function money(v){var n=Number(v);return Number.isFinite(n)?"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"Not available"}
 function refresh(){var a=getAccount(),key=localStorage.getItem("gotradex_account_mode")==="REAL"?"gotradex_real_balance":"gotradex_demo_balance",raw=localStorage.getItem(key),balance=raw===null?null:Number(raw),start=Number(a.startingBalance)||0,cur=Number.isFinite(Number(a.currentBalance))?Number(a.currentBalance):start,pl=cur-start,active=!!a.active;
 root.querySelector("#abBotStatus").textContent=active?"ACCOUNT ACTIVE":"NOT ACTIVATED";root.querySelector("#abBotStatus").style.background=active?"#8aff5a":"#33424c";root.querySelector("#abBotStatus").style.color=active?"#000":"#fff";root.querySelector("#abPause").textContent=active?"Pause":"Activate";root.querySelector("#abEquity").textContent=raw===null?money(cur):money(balance);root.querySelector("#abProfit").textContent=(pl>=0?"+":"−")+money(Math.abs(pl))+" · locally recorded AutoBot result";root.querySelector("#abToday").textContent="Not available";root.querySelector("#abBuyingPower").textContent="Not available";root.querySelector("#abStrategy").textContent=a.strategy||"Not configured";root.querySelector("#abRisk").textContent=a.risk||"Not configured";root.querySelector("#abFill").style.width=active?"35%":"0%";root.querySelector("#abBotNote").textContent=active?"Account flag is active; this does not prove live orders are executing.":"Activate AutoBot from its account portal after reviewing settings.";var pair=document.getElementById("bottomAssetPair");if(pair&&pair.textContent.trim())root.querySelector("#abPair").textContent=pair.textContent.trim();var mode=document.getElementById("bottomAssetMode");root.querySelector("#abFeedStatus").textContent=(mode?mode.textContent.trim()+" market selected. ":"")+"Open the main trading chart for its verified feed. Candles below are illustrative only."}
 function draw(){var c=document.getElementById("abCanvas");if(!c)return;var w=Math.max(280,c.clientWidth),h=Math.max(150,c.clientHeight),d=Math.min(window.devicePixelRatio||1,2);c.width=w*d;c.height=h*d;var x=c.getContext("2d");x.scale(d,d);x.clearRect(0,0,w,h);x.strokeStyle="#1a2a35";for(var i=0;i<w;i+=42){x.beginPath();x.moveTo(i,0);x.lineTo(i,h);x.stroke()}for(i=0;i<h;i+=32){x.beginPath();x.moveTo(0,i);x.lineTo(w,i);x.stroke()}var vals=[.64,.59,.66,.54,.58,.46,.51,.39,.43,.49,.34,.4,.29,.36,.25,.32,.22,.28,.18,.25,.2,.14,.21,.12,.18,.1],gap=(w-24)/vals.length;vals.forEach(function(v,i){var xx=12+i*gap,cy=v*h,up=i===0||v<vals[i-1],bh=7+(i%5)*2;x.strokeStyle=up?"#8aff5a":"#416457";x.beginPath();x.moveTo(xx+gap*.42,cy-9);x.lineTo(xx+gap*.42,cy+11);x.stroke();x.fillStyle=up?"#8aff5a":"#1a3a2a";x.fillRect(xx,cy-(up?bh:2),Math.max(3,gap*.48),bh)});x.fillStyle="#9aadb9";x.font="10px Roboto,Arial";x.fillText("ILLUSTRATIVE PREVIEW · NOT LIVE DATA",8,h-7)}
 function open(){refresh();root.classList.add("open");root.removeAttribute("aria-hidden");document.querySelectorAll(".drawer.open,.adminPage.open,.adminDrawer.open,.helpPage.open,.supportPage.open,.myTeamPage.open,.policyPage.open,.termsPage.open,.userAutoBotDrawer.open,.agentWidget.open,.keypad.open").forEach(function(el){el.classList.remove("open")});var s=document.getElementById("portal-settings-standalone");if(s)s.classList.remove("is-open");setTimeout(draw,40)}
 function close(){root.classList.remove("open");root.setAttribute("aria-hidden","true")}
 root.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;if(b.hasAttribute("data-ab-close")){close();return}if(b.dataset.abTime){root.querySelectorAll("[data-ab-time]").forEach(function(q){q.classList.toggle("active",q===b)});return}if(b.dataset.abAction==="trade"){close();var trade=document.getElementById("buy")||document.getElementById("sell");if(trade){try{window.dispatchEvent(new CustomEvent("gotradex:trade-intent",{detail:{source:"AB",side:trade.id==="sell"?"SELL":"BUY"}}))}catch(e){}trade.click()}else window.scrollTo(0,0);return}if(b.dataset.abAction==="pause"){var a=getAccount();a.active=!a.active;a.updatedAt=new Date().toLocaleString();try{localStorage.setItem("gotradex_user_autobot_account",JSON.stringify(a))}catch(e){}refresh();var m=document.getElementById("userAutoBotMessage");if(m)m.textContent=a.active?"AutoBot account flag activated; live order execution is not implied.":"AutoBot account flag paused.";return}if(b.dataset.abAction==="settings"){close();var sb=document.querySelector('[data-profile-action="settings"]');if(sb)sb.click();else if(window.openGtxSettings)window.openGtxSettings();return}if(b.dataset.abNav==="dashboard"){refresh();draw();root.scrollTo({top:0,behavior:"smooth"});return}if(b.dataset.abNav==="trading"){close();window.scrollTo(0,0);return}if(b.dataset.abNav==="autobot"){close();var ab=document.getElementById("mainAutoBotBtn");if(ab)ab.click();return}if(b.dataset.abNav==="portfolio"){close();var p=document.querySelector('.menuItem[data-section="Portfolio"]');if(p)p.click();return}if(b.dataset.abNav==="history"){close();var h=document.getElementById("historyAccountBtn");if(h)h.click();else{var m=document.getElementById("menuBtn");if(m)m.click()}}});
 window.addEventListener("resize",function(){if(root.classList.contains("open"))draw()});
 document.addEventListener("click",function(e){var b=e.target.closest('.menuItem[data-section="AutoBot"],#mainAutoBotBtn');if(!b)return;e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();var m=document.getElementById("menuDrawer");if(m)m.classList.remove("open");open()},true);
 window.openGtxAutoBotDashboard=open;
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
})();

// GoTradeX OTC AI Analyzer portal integration.
// Isolated overlay: preserves the existing dashboard and its trading/chart controls.
(function(){
  const analyzerUrl="https://raw.githack.com/Ryan-dotco/GoTradeX-/repair/otc-analyzer-real-connection-15min-2026-10-17/otc-ai-scanner-test/index.html?v=20261017signal-portal-toggle1";
  function installOtcAiPortal(){
    const nav=document.querySelector(".gtxNavColumn");
    if(nav && !nav.querySelector('[data-section="OTC AI Scanner Pro"]')){
      const button=document.createElement("button");
      button.type="button";
      button.className="option menuItem";
      button.dataset.section="OTC AI Scanner Pro";
      button.innerHTML='OTC AI Scanner Pro <span>›</span>';
      const about=nav.querySelector('[data-section="About"]');
      nav.insertBefore(button,about||nav.querySelector("#adminPortalMenuItem")||null);
    }
    if(!document.getElementById("gtxOtcAiOverlay")){
      const overlay=document.createElement("div");
      overlay.id="gtxOtcAiOverlay";
      overlay.setAttribute("role","dialog");
      overlay.setAttribute("aria-label","OTC AI Scanner Pro");
      overlay.style.cssText="position:fixed;inset:0;z-index:2147483005;background:#020a1d;display:none;flex-direction:column";
      overlay.innerHTML='<div style="height:48px;flex:0 0 48px;display:flex;align-items:center;gap:12px;padding:0 12px;background:#081b33;border-bottom:1px solid #23466d;color:#fff"><button id="gtxOtcAiBack" type="button" style="background:#163554;color:#fff;border:1px solid #315477;border-radius:8px;padding:7px 12px;font-weight:800">‹ Back to GoTradeX</button><strong style="font-size:13px">OTC AI Scanner Pro</strong></div><iframe title="GoTradeX OTC AI Scanner Pro" src="'+analyzerUrl+'" style="display:block;flex:1;width:100%;height:calc(100% - 48px);border:0;background:#020a1d" allow="camera; clipboard-read; clipboard-write"></iframe>';
      document.body.appendChild(overlay);
      const close=()=>{overlay.style.display="none";document.body.style.overflow="";};
      overlay.querySelector("#gtxOtcAiBack").addEventListener("click",close);
      document.addEventListener("keydown",e=>{if(e.key==="Escape"&&overlay.style.display!=="none")close();});
    }
  }
  function openOtcAiPortal(){
    installOtcAiPortal();
    const overlay=document.getElementById("gtxOtcAiOverlay");
    const menu=document.getElementById("menuDrawer");
    if(menu)menu.classList.remove("open");
    if(overlay){overlay.style.display="flex";document.body.style.overflow="hidden";const frame=overlay.querySelector("iframe");if(frame&&!frame.dataset.gtxSyncBound){frame.dataset.gtxSyncBound="1";frame.addEventListener("load",sendMainState);}sendMainState();}
  }
  document.addEventListener("click",function(e){
    const b=e.target.closest('.menuItem[data-section="OTC AI Scanner Pro"]');
    if(!b)return;
    e.preventDefault();e.stopPropagation();
    if(e.stopImmediatePropagation)e.stopImmediatePropagation();
    openOtcAiPortal();
  },true);

  function analyzerFrame(){return document.querySelector("#gtxOtcAiOverlay iframe");}
  function currentMainState(){
    const read=(k,f)=>{try{return localStorage.getItem(k)||f}catch(_){return f}};
    return {type:"GTX_MAIN_STATE",marketMode:read("gotradex_market_mode","LIVE").toUpperCase()==="OTC"?"OTC":"LIVE",asset:read("gotradex_asset_display","BTC/USD").replace(/\s+OTC$/i,""),assetType:read("gotradex_asset_type","forex"),accountMode:read("gotradex_account_mode","DEMO").toUpperCase()==="REAL"?"REAL":"DEMO",expiration:read("gotradex_trade_expiration","5 Minutes"),chartTimeframe:read("gotradex_chart_timeframe","5 Minutes")};
  }
  function sendMainState(){
    const frame=analyzerFrame();if(!frame||!frame.contentWindow)return;
    try{frame.contentWindow.postMessage(currentMainState(),window.location.origin)}catch(_){}
  }
  window.addEventListener("message",function(event){
    if(event.origin!==window.location.origin)return;
    const frame=analyzerFrame();if(!frame||event.source!==frame.contentWindow)return;
    const msg=event.data;if(!msg||msg.type!=="GTX_ANALYZER_SYNC")return;
    const allowedExpiry=["5 Seconds","1 Minute","3 Minutes","5 Minutes","15 Minutes","30 Minutes","1 Hour","4 Hours","1 Day"];
    const mode=String(msg.marketMode||"").toUpperCase()==="OTC"?"OTC":"LIVE";
    const asset=String(msg.asset||"").replace(/\s+OTC$/i,"").trim();
    const type=String(msg.assetType||"forex").toLowerCase();
    if(typeof window.gtxSetMarketMode==="function")window.gtxSetMarketMode(mode);
    if(asset&&typeof window.gtxSetBottomAsset==="function")window.gtxSetBottomAsset(asset,type);
    if(allowedExpiry.includes(msg.expiration)&&window.GoTradeXTimeframeController&&typeof window.GoTradeXTimeframeController.set==="function")window.GoTradeXTimeframeController.set(msg.expiration,"analyzer");
    const allowedChartTf=["1 Minute","3 Minutes","5 Minutes","15 Minutes","30 Minutes","1 Hour","4 Hours","1 Day"];
    if(allowedChartTf.includes(msg.chartTimeframe)&&window.GoTradeXLiveChart&&typeof window.GoTradeXLiveChart.setTimeframe==="function")window.GoTradeXLiveChart.setTimeframe(msg.chartTimeframe);
    const account=String(msg.accountMode||"").toUpperCase()==="REAL"?"REAL":"DEMO";
    try{localStorage.setItem("gotradex_account_mode",account)}catch(_){}
    if(typeof window.setAccountMode==="function")try{window.setAccountMode(account)}catch(_){}
    if(msg.action==="BUY"||msg.action==="SELL"){
      const button=document.getElementById(msg.action.toLowerCase());
      const market=String(localStorage.getItem("gotradex_market_mode")||"LIVE").toUpperCase();
      const asset=String(localStorage.getItem("gotradex_asset_display")||msg.asset||"").replace(/\s+OTC$/i,"").trim().toUpperCase();
      const supportedBybitDemoAssets=["BTC/USD","ETH/USD","XRP/USD","SOL/USD"];
      let message="";
      if(account==="REAL"){
        message="Live broker execution is disabled until a verified broker execution adapter is connected. No real order or balance change has occurred.";
      }else if(market!=="LIVE"){
        message="OTC execution is not connected to the server trade engine. No paper trade or chart marker was created.";
      }else if(!supportedBybitDemoAssets.includes(asset)){
        message="This asset has no approved Bybit-only paper-trade mapping in the current runtime. No Twelve Data fallback was used and no trade was opened.";
      }else if(window.GoTradeXServerRuntime&&typeof window.GoTradeXServerRuntime.open==="function"){
        // Only supported LIVE crypto demo orders are submitted to the server runtime.
        // The server's accepted trade event is what creates the chart marker.
        window.GoTradeXServerRuntime.open(msg.action);
      }else{
        message="DEMO order not opened: server trade runtime is unavailable.";
      }
      if(message){
        const status=document.getElementById("status");
        if(status){status.classList.add("trade-feedback");status.replaceChildren();const title=document.createElement("strong");title.textContent=msg.action+" NOT OPENED • "+account+" • "+market+" • "+asset;status.appendChild(title);const note=document.createElement("span");note.className="trade-feedback-note";note.textContent=message;status.appendChild(note);}
      }
    }
    sendMainState();
  });
  window.addEventListener("gotradex:asset-changed",sendMainState);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installOtcAiPortal,{once:true});
  else installOtcAiPortal();
})();
