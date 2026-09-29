/* GoTradeX Robot History — persistent demo activity and performance layer */
(function () {
  "use strict";

  const KEY_PREFIX = "gotradex_robot_history_v1_";
  let timer = null;

  function key() {
    try {
      return KEY_PREFIX + (state.user?.id || "guest") + "_" + (state.deriv?.selectedAccountId || "no-account");
    } catch (_) { return KEY_PREFIX + "guest"; }
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(key()) || "null");
      if (!saved) return;
      state.demo.robotActivity = Array.isArray(saved.robotActivity) ? saved.robotActivity : [];
      state.demo.sessionStats = saved.sessionStats || {};
    } catch (_) {}
  }

  function save() {
    try {
      localStorage.setItem(key(), JSON.stringify({
        robotActivity: (state.demo.robotActivity || []).slice(0, 250),
        sessionStats: state.demo.sessionStats || {},
        savedAt: Date.now()
      }));
    } catch (_) {}
  }

  function add(type, data) {
    if (!state.demo.robotActivity) state.demo.robotActivity = [];
    state.demo.robotActivity.unshift({ id: "evt_" + Date.now() + "_" + Math.random().toString(36).slice(2,7), type, time: new Date().toISOString(), ...data });
    state.demo.robotActivity = state.demo.robotActivity.slice(0, 250);
    save();
    render();
  }

  function stats() {
    const h = state.demo.tradeHistory || [];
    const wins = h.filter(t => Number(t.pnl) > 0).length;
    const losses = h.filter(t => Number(t.pnl) < 0).length;
    const grossProfit = h.filter(t => Number(t.pnl) > 0).reduce((a,t) => a + Number(t.pnl), 0);
    const grossLoss = Math.abs(h.filter(t => Number(t.pnl) < 0).reduce((a,t) => a + Number(t.pnl), 0));
    const realized = h.reduce((a,t) => a + (Number(t.pnl) || 0), 0);
    const unrealized = (state.demo.openTrades || []).reduce((a,t) => a + (Number(t.unrealizedPL) || 0), 0);
    return { total: h.length, wins, losses, winRate: h.length ? (wins / h.length) * 100 : 0, grossProfit, grossLoss, profitFactor: grossLoss ? grossProfit / grossLoss : (grossProfit ? Infinity : 0), realized, unrealized, totalPL: realized + unrealized, equity: Number(state.demo.equity) || 0 };
  }

  function money(v) { return Number(v || 0).toLocaleString("en-US", {style:"currency",currency:"USD",minimumFractionDigits:2}); }
  function price(v) { return Number(v || 0).toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:6}); }
  function esc(v) { return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }


  function updateCapitalDisplay() {
    // The demo broker balance is realized cash. While trades are open,
    // live capital is equity = realized balance + unrealized P/L.
    // Show that live equity in the Deriv account card so open demo trades
    // visibly affect the account value without double-counting P/L.
    try {
      const balanceEl = document.getElementById("derivBalance");
      if (!balanceEl) return;

      const label = balanceEl.previousElementSibling;
      const demoReady = Boolean(state.demo?.initialized && state.deriv?.connected);
      const equity = Number(state.demo?.equity);
      const balance = Number(state.demo?.balance);

      if (demoReady && Number.isFinite(equity)) {
        if (label) label.textContent = "Live Equity";
        balanceEl.textContent = money(equity);

        const card = balanceEl.closest(".market-row, .stat-card, .account-row, .info-row, .account-info-row, div");
        if (card) card.setAttribute("title", "Live demo capital: realized balance plus unrealized profit/loss.");
      } else if (Number.isFinite(balance) && balance > 0) {
        if (label) label.textContent = "Balance";
        balanceEl.textContent = money(balance);
      }
    } catch (_) {}
  }

  function render() {
    const panel = document.getElementById("gtxRobotHistoryPanel");
    if (!panel) return;
    const s = stats();
    updateCapitalDisplay();
    const cards = [
      ["Total Trades", s.total], ["Win Rate", s.winRate.toFixed(1) + "%"], ["Realized P/L", money(s.realized)],
      ["Unrealized P/L", money(s.unrealized)], ["Total P/L", money(s.totalPL)], ["Equity", money(s.equity)],
      ["Wins / Losses", s.wins + " / " + s.losses], ["Profit Factor", Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"]
    ];
    const events = (state.demo.robotActivity || []).slice(0, 25);
    panel.innerHTML = `
      <div class="panel">
        <h3>Robot Performance</h3>
        <div class="stats-grid">${cards.map(c => `<div class="stat-card"><span>${c[0]}</span><strong>${c[1]}</strong></div>`).join("")}</div>
      </div>
      <div class="panel">
        <h3>Robot Activity History</h3>
        <div class="robot-history-list">${events.length ? events.map(e => `<div class="market-row"><div><strong>${esc(e.type)}</strong><span>${new Date(e.time).toLocaleString()}</span></div><div><span>${esc(e.symbol || "Robot")}</span><strong>${esc(e.direction || e.reason || "")}</strong></div><div><span>P/L</span><strong>${e.pnl == null ? "—" : money(e.pnl)}</strong></div><div><span>Price</span><strong>${e.price == null ? "—" : price(e.price)}</strong></div></div>`).join("") : '<div class="empty-state">No robot activity recorded yet.</div>'}</div>
      </div>`;
  }

  function patch() {
    if (typeof closeDemoTrade === "function" && !closeDemoTrade.__historyPatched) {
      const original = closeDemoTrade;
      const wrapped = function (trade, exitPrice, reason) {
        const before = (state.demo.tradeHistory || []).length;
        const result = original.apply(this, arguments);
        const history = state.demo.tradeHistory || [];
        if (history.length > before) {
          const t = history[0];
          add("TRADE CLOSED", {symbol:t.symbol, direction:t.direction, pnl:t.pnl, price:t.exit, reason:t.closeReason});
        }
        return result;
      };
      wrapped.__historyPatched = true;
      window.closeDemoTrade = wrapped;
    }

    if (typeof openDemoTrade === "function" && !openDemoTrade.__historyPatched) {
      const original = openDemoTrade;
      const wrapped = function (symbol, signal) {
        const before = (state.demo.openTrades || []).length;
        const result = original.apply(this, arguments);
        if (result && (state.demo.openTrades || []).length > before) {
          const t = state.demo.openTrades.find(x => x.symbol === symbol) || state.demo.openTrades[0];
          if (t) add("TRADE OPENED", {symbol:t.symbol, direction:t.direction, pnl:0, price:t.entry});
        }
        return result;
      };
      wrapped.__historyPatched = true;
      window.openDemoTrade = wrapped;
    }
  }

  function init() {
    if (typeof state === "undefined") return setTimeout(init, 100);
    if (!state.demo.robotActivity) state.demo.robotActivity = [];
    load();
    patch();
    const robotPage = document.querySelector("#page-robot, [data-page="robot"], [data-page="trading-robot"], #robotPage, #tradingRobotPage");
    const robotGrid = robotPage ? robotPage.querySelector(".robot-grid") : null;
    if (robotGrid && !document.getElementById("gtxRobotHistoryPanel")) {
      const p = document.createElement("div");
      p.id = "gtxRobotHistoryPanel";
      p.className = "robot-history-layout-slot";
      robotGrid.appendChild(p);
    }
    render();
    clearInterval(timer);
    timer = setInterval(function () { patch(); render(); save(); }, 3000);
  }

  window.GTXRobotHistory = { load, save, add, render, stats, updateCapitalDisplay };
  window.addEventListener("DOMContentLoaded", init);
  setTimeout(init, 300);
})();