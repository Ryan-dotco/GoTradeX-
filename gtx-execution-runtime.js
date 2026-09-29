/* =========================================================
   GOTRADEX PHASES 6-11
   CENTRAL EXECUTION + ROBOT + RISK + ADMIN OPERATIONS
   Browser execution remains simulation-only.
   ========================================================= */
(function () {
  "use strict";
  const KEY = "gotradex_runtime_v1";
  const defaults = {
    risk: { maxRiskUsd: 25, maxDailyLossUsd: 100, maxOpenTrades: 1 },
    robot: { enabled: false, intervalMs: 5000, minConfidence: 70, cooldownMs: 30000 },
    production: { liveExecutionEnabled: false, brokerReady: false },
    audit: []
  };
  let runtime = load();
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      return saved && typeof saved === "object"
        ? { ...defaults, ...saved, risk: { ...defaults.risk, ...(saved.risk || {}) }, robot: { ...defaults.robot, ...(saved.robot || {}) }, production: { ...defaults.production, ...(saved.production || {}) } }
        : JSON.parse(JSON.stringify(defaults));
    } catch (_) { return JSON.parse(JSON.stringify(defaults)); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(runtime)); } catch (_) {} }
  function audit(type, data = {}) {
    runtime.audit.unshift({ id: "audit_" + Date.now(), type, time: new Date().toISOString(), ...data });
    runtime.audit = runtime.audit.slice(0, 200);
    save();
    window.dispatchEvent(new CustomEvent("gtx:runtime-event", { detail: { type, ...data } }));
    return runtime.audit[0];
  }
  function appState() { return window.state || {}; }
  function priceFor(symbol) {
    const p = Number(appState().markets?.[symbol]?.price);
    if (Number.isFinite(p) && p > 0) return p;
    const candles = window.GTXFreshChart?.getCandles?.() || [];
    return Number(candles[candles.length - 1]?.close) || 0;
  }
  function openTrades() { return Array.isArray(appState().demo?.openTrades) ? appState().demo.openTrades : []; }
  function riskCheck({ amount, price, stop }) {
    const dailyPL = Number(appState().demo?.dailyPL || 0);
    if (dailyPL <= -Math.abs(Number(runtime.risk.maxDailyLossUsd || 100))) return {ok:false,reason:"Risk limit: maximum daily loss has been reached."};
    if (openTrades().length >= Number(runtime.risk.maxOpenTrades || 1)) return { ok:false, reason:"Risk limit: maximum open positions reached." };
    const risk = Math.abs(Number(price) - Number(stop)) * (Number(amount) / Number(price));
    if (!Number.isFinite(risk) || risk <= 0) return { ok:false, reason:"Invalid risk calculation." };
    if (risk > Number(runtime.risk.maxRiskUsd)) return { ok:false, reason:"Risk limit: stop-loss exposure exceeds the configured maximum." };
    return { ok:true, risk };
  }
  function execute(params = {}) {
    const source = params.source || "manual";
    const symbol = params.symbol || appState().currentSymbol || "BTCUSDT";
    const direction = String(params.direction || "").toUpperCase();
    const amount = Number(params.amount);
    const price = Number(params.price || priceFor(symbol));
    const stop = Number(params.stop);
    const target = Number(params.target);
    if (!["BUY","SELL"].includes(direction)) return {ok:false,reason:"Invalid trade direction."};
    const guard = window.GTXTradingCore?.canAcceptOrder?.({source,symbol,direction});
    if (guard && !guard.ok) return guard;
    if (!Number.isFinite(price) || price <= 0) return {ok:false,reason:"Live price unavailable."};
    if (!Number.isFinite(amount) || amount < 1) return {ok:false,reason:"Trade amount must be at least $1."};
    if (!Number.isFinite(stop) || !Number.isFinite(target)) return {ok:false,reason:"Stop loss and take profit are required."};
    if (direction === "BUY" && !(stop < price && target > price)) return {ok:false,reason:"BUY requires stop below price and target above price."};
    if (direction === "SELL" && !(stop > price && target < price)) return {ok:false,reason:"SELL requires stop above price and target below price."};
    const risk = riskCheck({amount,price,stop});
    if (!risk.ok) return risk;
    if (openTrades().some(t=>t.symbol===symbol)) return {ok:false,reason:"An open position already exists for this instrument."};
    const trade = {
      id:"gtx_"+source+"_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
      symbol, broker:"gtx-simulation", executionMode:"simulation", brokerOrderId:null,
      brokerTransactionId:null, direction, confidence:Number(params.confidence||0),
      entry:price,current:price,stop,target,quantity:amount/price,riskAmount:risk.risk,
      openedAt:new Date().toISOString(),status:"OPEN",unrealizedPL:0,source
    };
    appState().demo.openTrades.unshift(trade);
    window.GTXTradingCore?.recordOrder?.({source,symbol,direction,status:"OPEN",price,executionMode:"simulation",tradeId:trade.id});
    window.updateDemoMetrics?.(); window.saveDemoState?.(); window.renderRobotStatus?.();
    window.renderManualTradeTicket?.(); window.renderDemoTrades?.();
    audit("ORDER_OPENED",{source,symbol,direction,price,amount,risk:risk.risk,executionMode:"simulation"});
    return {ok:true,trade};
  }
  function close(tradeId, reason="MANUAL CLOSE") {
    const trade=openTrades().find(t=>t.id===tradeId);
    if(!trade) return {ok:false,reason:"Position not found."};
    const price=priceFor(trade.symbol);
    if(!price) return {ok:false,reason:"Live price unavailable."};
    window.closeDemoTrade?.(trade,price,reason);
    window.updateDemoMetrics?.(); window.saveDemoState?.(); window.renderRobotStatus?.(); window.renderDemoTrades?.();
    audit("POSITION_CLOSED",{tradeId,symbol:trade.symbol,price,reason});
    return {ok:true};
  }
  function signalSnapshot() {
    const candles=window.GTXFreshChart?.getCandles?.()||[];
    if(candles.length<30 || !window.GTXMarketAnalysis?.snapshot) return null;
    return window.GTXMarketAnalysis.snapshot();
  }
  let robotTimer=null,lastRobotTradeAt=0;
  function robotTick() {
    const core=window.GTXTradingCore?.snapshot?.()||{};
    if(!core.robotEnabled||!core.masterTrading||core.emergencyStop) return {ok:false,reason:"Robot not armed by central control."};
    if(Date.now()-lastRobotTradeAt<Number(runtime.robot.cooldownMs)) return {ok:false,reason:"Robot cooldown active."};
    const signal=signalSnapshot();
    if(!signal||signal.direction==="HOLD"||Number(signal.confidence)<Number(runtime.robot.minConfidence)) return {ok:false,reason:"No qualifying signal."};
    const symbol=appState().currentSymbol||"BTCUSDT",price=priceFor(symbol);
    if(!price) return {ok:false,reason:"Live price unavailable."};
    const distance=Math.max(price*0.003,0.01);
    const stop=signal.direction==="BUY"?price-distance:price+distance;
    const target=signal.direction==="BUY"?price+distance*1.5:price-distance*1.5;
    const result=execute({source:"robot",symbol,direction:signal.direction,amount:10,price,stop,target,confidence:signal.confidence});
    if(result.ok){lastRobotTradeAt=Date.now();audit("ROBOT_EXECUTION",{symbol,direction:signal.direction,confidence:signal.confidence});}
    return result;
  }
  function startRobotLoop(){if(!robotTimer)robotTimer=setInterval(robotTick,Number(runtime.robot.intervalMs));}
  function productionStatus(){return {liveExecutionEnabled:Boolean(runtime.production.liveExecutionEnabled),brokerReady:Boolean(runtime.production.brokerReady),liveOrdersBlocked:!runtime.production.liveExecutionEnabled||!runtime.production.brokerReady};}
  function renderReadiness(){
    if(!appState().isAdmin) return;
    const host=document.querySelector('[data-admin-section="overview"]');
    if(!host||document.getElementById("gtxReadinessPanel")) return;
    const panel=document.createElement("div");
    panel.id="gtxReadinessPanel";panel.className="panel";
    panel.innerHTML='<div class="section-header"><div><h3>Phase 11 Production Readiness</h3><p class="muted">Final gate before any real-money execution is considered.</p></div><span class="demo-badge">LIVE LOCKED</span></div><div id="gtxReadinessList" class="info-list"></div>';
    host.appendChild(panel); updateReadiness();
  }
  function updateReadiness(){
    const list=document.getElementById("gtxReadinessList"); if(!list) return;
    const checks=[
      ["Authentication",Boolean(appState().user)],
      ["Central control",Boolean(window.GTXTradingCore)],
      ["Live candle engine",Boolean(window.GTXFreshChart)],
      ["Market analysis",Boolean(window.GTXMarketAnalysis?.snapshot)],
      ["Execution guard",Boolean(window.GTXExecution)],
      ["Live order gate",false]
    ];
    list.innerHTML=checks.map(x=>"<div><span>"+x[0]+"</span><strong class='"+(x[1]?"positive":"negative")+"'>"+(x[1]?"READY":"LOCKED")+"</strong></div>").join("");
  }

  function renderAdminOps(){
    if(!appState().isAdmin)return;
    const host=document.querySelector('[data-admin-section="trade-control"]');
    if(!host||document.getElementById("gtxAdminOpsPanel"))return;
    const panel=document.createElement("div");
    panel.id="gtxAdminOpsPanel";panel.className="panel gtx-admin-ops-panel";
    panel.innerHTML='<div class="section-header"><div><h3>Execution & Risk Control</h3><p class="muted">One execution path for manual and robot trades.</p></div><span id="gtxProductionGate" class="demo-badge">LIVE ORDERS BLOCKED</span></div><div class="gtx-command-grid gtx-command-metrics"><div class="account-status"><span>Max risk / trade</span><strong id="gtxMaxRisk">$25.00</strong></div><div class="account-status"><span>Max daily loss</span><strong id="gtxMaxDaily">$100.00</strong></div><div class="account-status"><span>Max open trades</span><strong id="gtxMaxOpen">1</strong></div><div class="account-status"><span>Execution mode</span><strong id="gtxExecutionMode">SIMULATION</strong></div></div><div class="robot-actions-row"><button id="gtxEmergencyButton" type="button" class="danger-button">Emergency Stop</button><button id="gtxClearEmergencyButton" type="button" class="small-button">Clear Stop</button><button id="gtxRobotTickButton" type="button" class="small-button">Run Robot Check</button></div><div class="panel"><h3>Recent Audit Events</h3><div id="gtxAuditList" class="info-list"></div></div>';
    host.appendChild(panel);
    panel.querySelector("#gtxEmergencyButton").addEventListener("click",()=>window.GTXTradingCore?.emergencyStop?.());
    panel.querySelector("#gtxClearEmergencyButton").addEventListener("click",()=>window.GTXTradingCore?.clearEmergencyStop?.());
    panel.querySelector("#gtxRobotTickButton").addEventListener("click",robotTick);
    renderAdminOpsState();
  }
  function renderAdminOpsState(){
    const gate=document.getElementById("gtxProductionGate"),mode=document.getElementById("gtxExecutionMode"),list=document.getElementById("gtxAuditList"),ps=productionStatus();
    if(gate)gate.textContent=ps.liveOrdersBlocked?"LIVE ORDERS BLOCKED":"LIVE ORDERS ENABLED";
    if(mode)mode.textContent=ps.liveOrdersBlocked?"SIMULATION":"LIVE";
    if(list)list.innerHTML=runtime.audit.slice(0,8).map(e=>"<div><span>"+e.type.replaceAll("_"," ")+"</span><strong>"+new Date(e.time).toLocaleTimeString()+"</strong></div>").join("")||"<div><span>No events</span><strong>—</strong></div>";
  }
  function renderRobotPanel(){
    const core=window.GTXTradingCore?.snapshot?.()||{};
    const status=document.getElementById("gtxRobotRuntimeStatus");
    const mode=document.getElementById("gtxRobotSignalMode");
    const msg=document.getElementById("gtxRobotRuntimeMessage");
    if(status) status.textContent=core.robotEnabled?"RUNNING":"STOPPED";
    if(mode) mode.textContent=(core.signalMode||"monitor").toUpperCase();
    if(msg) msg.textContent=core.emergencyStop?"Emergency stop is active.":core.robotEnabled?"Robot is armed and waiting for a qualifying signal.":"Robot is stopped.";
  }

  function bindRobotPanel(){
    document.getElementById("gtxRobotRuntimeStart")?.addEventListener("click",()=>{
      const core=window.GTXTradingCore?.snapshot?.()||{};
      if(core.emergencyStop){ document.getElementById("gtxRobotRuntimeMessage").textContent="Clear the emergency stop before starting the robot."; return; }
      window.GTXTradingCore?.setControl?.({masterTrading:true,robotEnabled:true,signalMode:"armed"},"Robot started from Robot Control");
      audit("ROBOT_STARTED",{source:"robot-control"});
      renderRobotPanel();
    });
    document.getElementById("gtxRobotRuntimeStop")?.addEventListener("click",()=>{
      window.GTXTradingCore?.setControl?.({robotEnabled:false},"Robot stopped from Robot Control");
      audit("ROBOT_STOPPED",{source:"robot-control"});
      renderRobotPanel();
    });
    document.getElementById("gtxRobotRuntimeCheck")?.addEventListener("click",()=>{
      const result=robotTick();
      const msg=document.getElementById("gtxRobotRuntimeMessage");
      if(msg) msg.textContent=result?.ok ? "Robot execution created a simulation position." : (result?.reason||"No qualifying robot action.");
      renderRobotPanel();
    });
  }

  function renderPortfolio(){
    const open= document.getElementById("gtxPortfolioPositions");
    const history=document.getElementById("gtxPortfolioHistory");
    const s=appState(), trades=Array.isArray(s.demo?.openTrades)?s.demo.openTrades:[], done=Array.isArray(s.demo?.tradeHistory)?s.demo.tradeHistory:[];
    if(open) open.innerHTML=trades.length?trades.map(t=>"<div class='market-row'><div><strong>"+String(t.symbol)+"</strong><span>"+String(t.direction)+" • "+String(t.source||"manual")+"</span></div><div><span>Entry</span><strong>"+Number(t.entry).toFixed(2)+"</strong></div><div><span>Current</span><strong>"+Number(t.current||t.entry).toFixed(2)+"</strong></div><div><span>Risk</span><strong>$"+Number(t.riskAmount||0).toFixed(2)+"</strong></div></div>").join(""):"<div class='empty-state'>No open positions.</div>";
    if(history) history.innerHTML=done.length?done.slice(0,20).map(t=>"<div class='market-row'><div><strong>"+String(t.symbol)+"</strong><span>"+String(t.direction)+" • "+String(t.closeReason||"Closed")+"</span></div><div><span>P/L</span><strong class='"+(Number(t.pnl)>=0?"positive":"negative")+"'>$"+Number(t.pnl||0).toFixed(2)+"</strong></div><div><span>Exit</span><strong>"+Number(t.exit||0).toFixed(2)+"</strong></div><div><span>Time</span><strong>"+new Date(t.closedAt||Date.now()).toLocaleTimeString()+"</strong></div></div>").join(""):"<div class='empty-state'>No completed trades yet.</div>";
  }

  function init(){startRobotLoop();bindRobotPanel();setInterval(()=>{renderReadiness();updateReadiness();renderAdminOps();renderAdminOpsState();renderRobotPanel();renderPortfolio();},1000);audit("RUNTIME_READY",{execution:"simulation",liveOrdersBlocked:true});}
  window.GTXExecution={execute,close,riskCheck,productionStatus,audit,getRuntime:()=>JSON.parse(JSON.stringify(runtime))};
  window.GTXRobotRuntime={tick:robotTick,start:startRobotLoop};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();