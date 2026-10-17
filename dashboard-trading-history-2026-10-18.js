(function () {
  "use strict";
  if (window.__gtxDashboardTradingHistoryInstalled) return;
  window.__gtxDashboardTradingHistoryInstalled = true;

  var keys = ["gotradex_trade_history", "gotradex_trades", "gotradex_order_history", "gotradex_orders"];
  var activeFilter = "ALL";
  var overlay, list, count, searchInput;

  function readTrades() {
    var arrays = [];
    keys.forEach(function (key) {
      try {
        var value = JSON.parse(localStorage.getItem(key) || "null");
        if (Array.isArray(value) && value.length) arrays.push(value);
      } catch (_) {}
    });
    if (!arrays.length) return [];
    var best = arrays.sort(function (a, b) { return b.length - a.length; })[0];
    return best.slice().map(function (trade, index) {
      trade = trade && typeof trade === "object" ? trade : {};
      var statusRaw = String(trade.status || trade.state || trade.tradeStatus || "").toLowerCase();
      var closed = /settled|closed|completed|expired|won|lost|cancelled|canceled/.test(statusRaw);
      var open = /open|pending|active|running/.test(statusRaw);
      var timeRaw = trade.createdAt || trade.created_at || trade.timestamp || trade.openedAt || trade.opened_at || trade.date || trade.time || "";
      var date = timeRaw ? new Date(timeRaw) : null;
      if (date && isNaN(date.getTime()) && typeof timeRaw === "number") date = new Date(timeRaw < 1e12 ? timeRaw * 1000 : timeRaw);
      return {
        raw: trade,
        id: String(trade.id || trade.orderId || trade.order_id || trade.tradeId || trade.trade_id || ("record-" + index)),
        side: String(trade.side || trade.direction || trade.type || trade.action || "TRADE").toUpperCase(),
        pair: String(trade.pair || trade.symbol || trade.asset || trade.market || "Asset not recorded"),
        amount: firstNumber(trade.amount, trade.stake, trade.investment, trade.orderAmount),
        pnl: firstNumber(trade.pnl, trade.profitLoss, trade.profit_loss, trade.profit, trade.resultAmount),
        entry: firstNumber(trade.entryPrice, trade.entry_price, trade.entry, trade.openPrice, trade.open_price),
        exit: firstNumber(trade.exitPrice, trade.exit_price, trade.exit, trade.closePrice, trade.close_price),
        status: closed ? "CLOSED" : open ? "OPEN" : (statusRaw ? statusRaw.toUpperCase() : "RECORDED"),
        bucket: closed ? "CLOSED" : open ? "OPEN" : "OTHER",
        mode: String(trade.accountMode || trade.account_mode || trade.mode || "").toUpperCase(),
        date: date && !isNaN(date.getTime()) ? date : null
      };
    }).sort(function (a, b) {
      return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0);
    });
  }

  function firstNumber() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] !== null && arguments[i] !== undefined && arguments[i] !== "") {
        var n = Number(arguments[i]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  }
  function money(value) {
    if (value === null) return "—";
    return (value > 0 ? "+" : "") + "$" + Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/^/, value < 0 ? "−" : "");
  }
  function label(text, className) {
    var el = document.createElement("span");
    el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function makeButton(text, filter) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = "gtxTradeHistoryFilter" + (activeFilter === filter ? " active" : "");
    button.addEventListener("click", function () {
      activeFilter = filter;
      render();
    });
    return button;
  }
  function render() {
    if (!list) return;
    list.replaceChildren();
    var all = readTrades();
    var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var filtered = all.filter(function (t) {
      var matchesFilter = activeFilter === "ALL" || t.bucket === activeFilter;
      var matchesQuery = !query || (t.side + " " + t.pair + " " + t.status + " " + t.mode).toLowerCase().indexOf(query) !== -1;
      return matchesFilter && matchesQuery;
    });
    count.textContent = all.length + (all.length === 1 ? " saved record" : " saved records");
    var filters = overlay.querySelector(".gtxTradeHistoryFilters");
    filters.replaceChildren(makeButton("All", "ALL"), makeButton("Open", "OPEN"), makeButton("Closed", "CLOSED"));
    if (!filtered.length) {
      var empty = document.createElement("div");
      empty.className = "gtxTradeHistoryEmpty";
      var heading = document.createElement("strong");
      heading.textContent = all.length ? "No matching trades" : "No trading history yet";
      var detail = document.createElement("p");
      detail.textContent = all.length
        ? "Try another filter or search term."
        : "Completed or open trades will appear here when a verified execution service saves them. Buy/Sell taps that were not submitted are not counted as trades.";
      empty.append(heading, detail);
      list.appendChild(empty);
      return;
    }
    filtered.forEach(function (t) {
      var card = document.createElement("article");
      card.className = "gtxTradeHistoryCard";
      var head = document.createElement("div");
      head.className = "gtxTradeHistoryCardHead";
      var identity = document.createElement("div");
      identity.className = "gtxTradeHistoryIdentity";
      identity.appendChild(label(t.side, "gtxTradeHistorySide " + (t.side.indexOf("BUY") !== -1 || t.side.indexOf("CALL") !== -1 ? "buy" : t.side.indexOf("SELL") !== -1 || t.side.indexOf("PUT") !== -1 ? "sell" : "")));
      identity.appendChild(label(t.pair, "gtxTradeHistoryPair"));
      var badge = label(t.status, "gtxTradeHistoryStatus " + (t.bucket === "CLOSED" ? "closed" : t.bucket === "OPEN" ? "open" : ""));
      head.append(identity, badge);
      var details = document.createElement("div");
      details.className = "gtxTradeHistoryDetails";
      [["Amount", money(t.amount)], ["P/L", money(t.pnl)], ["Entry", t.entry === null ? "—" : String(t.entry)], ["Exit", t.exit === null ? "—" : String(t.exit)]].forEach(function (pair) {
        var cell = document.createElement("div");
        cell.className = "gtxTradeHistoryDetail";
        cell.append(label(pair[0]), label(pair[1], pair[0] === "P/L" && t.pnl !== null ? (t.pnl >= 0 ? "positive" : "negative") : ""));
        details.appendChild(cell);
      });
      var footer = document.createElement("div");
      footer.className = "gtxTradeHistoryFooter";
      footer.appendChild(label(t.date ? t.date.toLocaleString() : "Date not recorded"));
      if (t.mode) footer.appendChild(label(t.mode + " account"));
      card.append(head, details, footer);
      list.appendChild(card);
    });
  }
  function open() {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    render();
  }
  function close() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }
  function install() {
    var menuButton = document.querySelector('[data-profile-action="trading-history"]');
    if (menuButton && !menuButton.dataset.gtxHistoryBound) {
      menuButton.dataset.gtxHistoryBound = "true";
      menuButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        open();
      });
    }
    if (document.getElementById("gtxDashboardTradingHistory")) return;
    var style = document.createElement("style");
    style.id = "gtxDashboardTradingHistoryStyle";
    style.textContent = [
      ".gtxTradeHistoryOverlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);display:none;align-items:stretch;justify-content:center;color:#fff}",
      ".gtxTradeHistoryOverlay.open{display:flex}",
      ".gtxTradeHistoryPanel{width:100%;max-width:720px;height:100%;overflow:auto;background:#061426;padding:0 14px calc(18px + env(safe-area-inset-bottom));}",
      ".gtxTradeHistoryHeader{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;margin:0 -14px;padding:14px;background:#081b33;border-bottom:1px solid #23466d}",
      ".gtxTradeHistoryHeader h2{font-size:17px;margin:0;flex:1}",
      ".gtxTradeHistoryClose,.gtxTradeHistoryRefresh{border:1px solid #315779;border-radius:8px;background:#163554;color:#fff;padding:9px 11px;font-weight:800}",
      ".gtxTradeHistoryCount{color:#8fa8c4;font-size:11px;margin:14px 2px}",
      ".gtxTradeHistorySearch{width:100%;height:42px;padding:0 12px;background:#102945;color:#fff;border:1px solid #23466d;border-radius:9px;outline:none}",
      ".gtxTradeHistoryFilters{display:flex;gap:7px;margin:10px 0 12px}",
      ".gtxTradeHistoryFilter{flex:1;padding:9px;border:1px solid #23466d;border-radius:8px;background:#102945;color:#a8bdd4;font-weight:800}",
      ".gtxTradeHistoryFilter.active{background:#176fca;color:#fff;border-color:#176fca}",
      ".gtxTradeHistoryList{display:grid;gap:9px}",
      ".gtxTradeHistoryCard{padding:12px;background:#091f3a;border:1px solid #23466d;border-radius:11px}",
      ".gtxTradeHistoryCardHead,.gtxTradeHistoryIdentity,.gtxTradeHistoryFooter{display:flex;align-items:center;justify-content:space-between;gap:8px}",
      ".gtxTradeHistoryIdentity{justify-content:flex-start;min-width:0;flex-wrap:wrap}",
      ".gtxTradeHistorySide{padding:5px 7px;border-radius:6px;background:#163554;font-size:10px;font-weight:900}",
      ".gtxTradeHistorySide.buy{background:#123d2a;color:#72e3a2}.gtxTradeHistorySide.sell{background:#4a2029;color:#ff9292}",
      ".gtxTradeHistoryPair{font-weight:900;font-size:13px;overflow-wrap:anywhere}",
      ".gtxTradeHistoryStatus{font-size:9px;color:#b9c9db;font-weight:900;white-space:nowrap}",
      ".gtxTradeHistoryStatus.closed{color:#72e3a2}.gtxTradeHistoryStatus.open{color:#ffd98a}",
      ".gtxTradeHistoryDetails{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}",
      ".gtxTradeHistoryDetail{display:flex;justify-content:space-between;gap:8px;padding:8px;background:#102945;border-radius:7px;font-size:11px}",
      ".gtxTradeHistoryDetail span:first-child{color:#8fa8c4}.gtxTradeHistoryDetail span:last-child{font-weight:800;overflow-wrap:anywhere}",
      ".gtxTradeHistoryDetail .positive{color:#72e3a2}.gtxTradeHistoryDetail .negative{color:#ff9292}",
      ".gtxTradeHistoryFooter{margin-top:10px;color:#8fa8c4;font-size:10px;flex-wrap:wrap}",
      ".gtxTradeHistoryEmpty{padding:28px 16px;margin-top:10px;text-align:center;background:#091f3a;border:1px dashed #315779;border-radius:12px}",
      ".gtxTradeHistoryEmpty strong{font-size:14px}.gtxTradeHistoryEmpty p{font-size:12px;line-height:1.6;color:#8fa8c4}",
      "@media(max-width:380px){.gtxTradeHistoryPanel{padding-left:10px;padding-right:10px}.gtxTradeHistoryDetails{gap:6px}.gtxTradeHistoryDetail{font-size:10px;padding:7px}}"
    ].join("");
    document.head.appendChild(style);

    overlay = document.createElement("section");
    overlay.id = "gtxDashboardTradingHistory";
    overlay.className = "gtxTradeHistoryOverlay";
    overlay.setAttribute("aria-hidden", "true");
    var panel = document.createElement("div");
    panel.className = "gtxTradeHistoryPanel";
    var header = document.createElement("header");
    header.className = "gtxTradeHistoryHeader";
    var title = document.createElement("h2");
    title.textContent = "Trading History";
    var refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "gtxTradeHistoryRefresh";
    refresh.textContent = "Refresh";
    refresh.addEventListener("click", render);
    var closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "gtxTradeHistoryClose";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", close);
    header.append(title, refresh, closeButton);
    count = document.createElement("div");
    count.className = "gtxTradeHistoryCount";
    searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "gtxTradeHistorySearch";
    searchInput.placeholder = "Search asset, side, account or status";
    searchInput.setAttribute("aria-label", "Search trading history");
    searchInput.addEventListener("input", render);
    var filters = document.createElement("div");
    filters.className = "gtxTradeHistoryFilters";
    list = document.createElement("div");
    list.className = "gtxTradeHistoryList";
    var note = document.createElement("p");
    note.style.cssText = "color:#8fa8c4;font-size:10px;line-height:1.5;margin:14px 2px";
    note.textContent = "History is read from saved trade/order records on this device. This screen does not create or invent trades; records appear only when another app component or verified execution service saves them.";
    panel.append(header, count, searchInput, filters, list, note);
    overlay.appendChild(panel);
    overlay.addEventListener("click", function (event) { if (event.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && overlay.classList.contains("open")) close(); });
    window.addEventListener("storage", function () { if (overlay.classList.contains("open")) render(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  window.setTimeout(install, 350);
})();