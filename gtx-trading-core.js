/* GoTradeX Central Trading Control Plane
 * Fresh architecture foundation for:
 * Market Data -> Signal Analyzer -> Robot -> Trade Control -> Execution -> Positions/History
 * Admin is the control plane. Chart is intentionally not implemented here.
 */
(function () {
  "use strict";

  const KEY = "gotradex_control_plane_v1";
  const listeners = new Set();
  const recentOrders = new Map();

  const defaults = {
    masterTrading: false,
    signalMode: "monitor",
    robotEnabled: false,
    emergencyStop: false,
    maxOpenTrades: 1,
    lastAction: "System initialized",
    lastActionAt: null,
    lastSignal: null,
    lastOrder: null
  };

  let control = { ...defaults };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && typeof saved === "object") control = { ...defaults, ...saved };
    } catch (_) {}
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(control)); } catch (_) {}
  }

  function emit(type, data = {}) {
    const event = { type, time: Date.now(), ...data };
    listeners.forEach(fn => {
      try { fn(event); } catch (_) {}
    });
    window.dispatchEvent(new CustomEvent("gtx:trading-event", { detail: event }));
    render();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(control));
  }

  function setControl(patch, reason = "Admin control updated") {
    control = { ...control, ...patch, lastAction: reason, lastActionAt: Date.now() };
    save();
    emit("CONTROL_CHANGED", { reason, control: snapshot() });
  }

  function isTradingAllowed(source = "manual") {
    if (control.emergencyStop) return false;
    if (!control.masterTrading) return false;
    if (source === "robot" && !control.robotEnabled) return false;
    return true;
  }

  function canAcceptOrder({ source = "manual", symbol = "", direction = "" } = {}) {
    if (!isTradingAllowed(source)) return { ok: false, reason: "Trading is disabled by Admin Control." };

    const key = [source, symbol, direction].join("|");
    const now = Date.now();
    const last = recentOrders.get(key) || 0;
    if (now - last < 900) {
      return { ok: false, reason: "Duplicate order blocked by execution guard." };
    }

    recentOrders.set(key, now);
    if (recentOrders.size > 300) {
      for (const [k, t] of recentOrders) if (now - t > 10000) recentOrders.delete(k);
    }

    return { ok: true };
  }

  function recordSignal(signal) {
    control.lastSignal = {
      direction: signal?.direction || "HOLD",
      symbol: signal?.symbol || window.state?.currentSymbol || "",
      confidence: Number(signal?.confidence) || 0,
      entry: Number(signal?.entry) || 0,
      target: Number(signal?.target) || 0,
      stop: Number(signal?.stop) || 0,
      time: Date.now()
    };
    emit("SIGNAL_UPDATED", { signal: control.lastSignal });
  }

  function recordOrder(order) {
    control.lastOrder = { ...order, time: Date.now() };
    emit("ORDER_RECORDED", { order: control.lastOrder });
  }

  function emergencyStop() {
    setControl(
      { emergencyStop: true, masterTrading: false, robotEnabled: false },
      "EMERGENCY STOP activated"
    );
    emit("EMERGENCY_STOP");
  }

  function clearEmergencyStop() {
    setControl(
      { emergencyStop: false },
      "Emergency stop cleared; trading remains disabled until enabled"
    );
  }

  function fmtMoney(value) {
    return Number(value || 0).toLocaleString("en-US", {
      style: "currency", currency: "USD", minimumFractionDigits: 2
    });
  }

  function getStats() {
    const s = window.state || {};
    const demo = s.demo || {};
    return {
      symbol: s.currentSymbol || "—",
      price: Number(s.markets?.[s.currentSymbol]?.price || 0),
      robot: control.robotEnabled ? "RUNNING" : "STOPPED",
      trading: control.masterTrading ? "ENABLED" : "PAUSED",
      signalMode: control.signalMode.toUpperCase(),
      openTrades: Array.isArray(demo.openTrades) ? demo.openTrades.length : Number(s.robotStatus?.openTrades || 0),
      equity: Number(demo.equity || s.robotStatus?.equity || 0),
      dailyPL: Number(demo.dailyPL || s.robotStatus?.dailyPL || 0)
    };
  }

  function ensurePanel() {
    if (!window.state?.isAdmin) return;
    const host = document.querySelector('[data-admin-section="overview"]');
    if (!host || document.getElementById("gtxAdminTradingCommand")) return;

    const panel = document.createElement("div");
    panel.id = "gtxAdminTradingCommand";
    panel.className = "panel gtx-admin-command-panel";
    panel.innerHTML = `
      <div class="section-header">
        <div>
          <h3>Trading Command Center</h3>
          <p class="muted">Central control for Market Data, Signal Analyzer, Robot and Trade Control.</p>
        </div>
        <div id="gtxAdminTradingState" class="live-market-label">● CONTROL PLANE</div>
      </div>

      <div class="gtx-command-grid">
        <div class="panel gtx-command-card">
          <span>Trading Control</span>
          <strong id="gtxAdminTradingStatus">PAUSED</strong>
          <button id="gtxAdminTradingToggle" type="button" class="primary-button">Enable Trading</button>
        </div>
        <div class="panel gtx-command-card">
          <span>Signal Analyzer</span>
          <strong id="gtxAdminSignalStatus">MONITOR</strong>
          <button id="gtxAdminSignalToggle" type="button" class="small-button">Arm Signals</button>
        </div>
        <div class="panel gtx-command-card">
          <span>Trading Robot</span>
          <strong id="gtxAdminRobotStatus">STOPPED</strong>
          <button id="gtxAdminRobotToggle" type="button" class="primary-button">Start Robot</button>
        </div>
        <div class="panel gtx-command-card">
          <span>Execution Guard</span>
          <strong id="gtxAdminGuardStatus">ACTIVE</strong>
          <button id="gtxAdminEmergencyStop" type="button" class="danger-button">EMERGENCY STOP</button>
        </div>
      </div>

      <div class="gtx-command-grid gtx-command-metrics">
        <div class="account-status"><span>Instrument</span><strong id="gtxAdminCommandSymbol">—</strong></div>
        <div class="account-status"><span>Market Price</span><strong id="gtxAdminCommandPrice">—</strong></div>
        <div class="account-status"><span>Open Positions</span><strong id="gtxAdminCommandOpenTrades">0</strong></div>
        <div class="account-status"><span>Equity</span><strong id="gtxAdminCommandEquity">$0.00</strong></div>
      </div>

      <div class="panel gtx-admin-signal-monitor">
        <h3>Latest Signal</h3>
        <div id="gtxAdminLatestSignal" class="empty-state">No signal recorded.</div>
      </div>

      <div class="panel gtx-admin-order-monitor">
        <h3>Latest Execution</h3>
        <div id="gtxAdminLatestOrder" class="empty-state">No order recorded.</div>
      </div>
    `;

    host.appendChild(panel);

    document.getElementById("gtxAdminTradingToggle")?.addEventListener("click", () => {
      if (control.emergencyStop) return;
      setControl(
        { masterTrading: !control.masterTrading },
        control.masterTrading ? "Admin paused trading" : "Admin enabled trading"
      );
    });

    document.getElementById("gtxAdminSignalToggle")?.addEventListener("click", () => {
      setControl(
        { signalMode: control.signalMode === "monitor" ? "armed" : "monitor" },
        control.signalMode === "monitor" ? "Signal Analyzer armed" : "Signal Analyzer set to monitor-only"
      );
    });

    document.getElementById("gtxAdminRobotToggle")?.addEventListener("click", () => {
      if (control.emergencyStop) return;
      if (!control.masterTrading) {
        setControl({ masterTrading: true, robotEnabled: true }, "Admin enabled trading and started Robot");
      } else {
        setControl({ robotEnabled: !control.robotEnabled }, control.robotEnabled ? "Admin stopped Robot" : "Admin started Robot");
      }
    });

    document.getElementById("gtxAdminEmergencyStop")?.addEventListener("click", () => {
      if (control.emergencyStop) clearEmergencyStop();
      else emergencyStop();
    });
  }

  function render() {
    const panel = document.getElementById("gtxAdminTradingCommand");
    if (!panel) return;

    const stats = getStats();
    const trading = document.getElementById("gtxAdminTradingStatus");
    const signal = document.getElementById("gtxAdminSignalStatus");
    const robot = document.getElementById("gtxAdminRobotStatus");
    const guard = document.getElementById("gtxAdminGuardStatus");

    if (trading) trading.textContent = stats.trading;
    if (signal) signal.textContent = stats.signalMode;
    if (robot) robot.textContent = stats.robot;
    if (guard) guard.textContent = control.emergencyStop ? "STOPPED" : "ACTIVE";

    const t = document.getElementById("gtxAdminTradingToggle");
    const r = document.getElementById("gtxAdminRobotToggle");
    const e = document.getElementById("gtxAdminEmergencyStop");

    if (t) t.textContent = control.masterTrading ? "Pause Trading" : "Enable Trading";
    if (r) r.textContent = control.robotEnabled ? "Stop Robot" : "Start Robot";
    if (e) e.textContent = control.emergencyStop ? "Clear Emergency Stop" : "EMERGENCY STOP";

    const symbol = document.getElementById("gtxAdminCommandSymbol");
    const price = document.getElementById("gtxAdminCommandPrice");
    const open = document.getElementById("gtxAdminCommandOpenTrades");
    const equity = document.getElementById("gtxAdminCommandEquity");

    if (symbol) symbol.textContent = stats.symbol;
    if (price) price.textContent = stats.price ? "$" + stats.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "—";
    if (open) open.textContent = String(stats.openTrades);
    if (equity) equity.textContent = fmtMoney(stats.equity);

    const ls = document.getElementById("gtxAdminLatestSignal");
    if (ls) {
      const x = control.lastSignal;
      ls.innerHTML = x
        ? `<strong>${x.symbol} — ${x.direction}</strong><br><span class="muted">Confidence: ${x.confidence}% · Entry: ${x.entry || "—"} · Stop: ${x.stop || "—"} · Target: ${x.target || "—"}</span>`
        : "No signal recorded.";
    }

    const lo = document.getElementById("gtxAdminLatestOrder");
    if (lo) {
      const x = control.lastOrder;
      lo.innerHTML = x
        ? `<strong>${x.symbol || "—"} — ${x.direction || "—"}</strong><br><span class="muted">Source: ${x.source || "—"} · Status: ${x.status || "—"}</span>`
        : "No order recorded.";
    }
  }

  function init() {
    load();
    ensurePanel();
    render();
    setInterval(() => { ensurePanel(); render(); }, 1000);
  }

  window.GTXTradingCore = {
    snapshot,
    subscribe,
    setControl,
    isTradingAllowed,
    canAcceptOrder,
    recordSignal,
    recordOrder,
    emergencyStop,
    clearEmergencyStop,
    getStats
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();