/* =========================================================
   GOTRADEX PHASE 4
   FRESH MARKET DATA + NATIVE CANDLE ENGINE
   No legacy chart code is used.
   ========================================================= */

(function () {
  "use strict";

  const API = "https://api.bybit.com";
  const WS = "wss://stream.bybit.com/v5/public/spot";
  const MAX_CANDLES = 180;
  const SUPPORTED = {
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "4h": "240",
    "1D": "D"
  };

  let candles = [];
  let symbol = "BTCUSDT";
  let timeframe = "1m";
  let socket = null;
  let resizeObserver = null;
  let reconnectTimer = null;
  let requestId = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function chartEls() {
    return {
      canvas: $("gtxDashboardChart"),
      status: $("gtxDashboardChartStatus"),
      dot: $("gtxDashboardChartDot"),
      symbol: $("gtxDashboardChartSymbol"),
      price: $("gtxDashboardChartPrice"),
      subtitle: $("gtxDashboardChartSubtitle"),
      empty: $("gtxDashboardChartEmpty")
    };
  }
  function setStatus(text, live) {
    const els = chartEls();
    if (els.status) els.status.textContent = text;
    if (els.dot) els.dot.style.opacity = live ? "1" : ".45";
  }

  function normalizeTimeframe(value) {
    return SUPPORTED[value] ? value : "1m";
  }

  function getSelectedState() {
    const app = window.state || {};
    return {
      symbol: app.currentSymbol || "BTCUSDT",
      timeframe: normalizeTimeframe(app.currentTimeframe || "5m")
    };
  }
  function formatPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 5 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
  }

  function setEmpty(message) {
    const el = chartEls().empty;
    if (el) {
      el.textContent = message;
      el.style.display = "grid";
    }
  }

  function hideEmpty() {
    const el = chartEls().empty;
    if (el) el.style.display = "none";
  }

  async function loadHistory() {
    const currentRequest = ++requestId;
    symbol = getSelectedState().symbol;
    timeframe = getSelectedState().timeframe;

    const els = chartEls();
    if (els.symbol) els.symbol.textContent = symbol;
    if (els.subtitle) els.subtitle.textContent = "Real Bybit candles • " + timeframe;

    const cryptoSymbols = new Set(["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT"]);
    if (!cryptoSymbols.has(symbol)) {
      candles = [];
      setStatus("BYBIT N/A", false);
      setEmpty("Bybit Spot live candles are available here for Crypto. Select Crypto for the live Bybit chart.");
      draw();
      if (socket) { try { socket.close(); } catch (_) {} socket = null; }
      return;
    }

    if (!SUPPORTED[timeframe]) {
      candles = [];
      setStatus("UNSUPPORTED", false);
      setEmpty("This live exchange feed does not publish a " + timeframe + " candle interval. Select 1m or higher.");
      draw();
      return;
    }

    setStatus("LOADING", false);
    setEmpty("Loading real market candles…");

    try {
      const params = new URLSearchParams({
        category: "spot",
        symbol,
        interval: SUPPORTED[timeframe],
        limit: String(MAX_CANDLES)
      });

      const response = await fetch(API + "/v5/market/kline?" + params.toString(), {
        cache: "no-store"
      });
      const payload = await response.json();

      if (currentRequest !== requestId) return;
      if (payload.retCode !== 0 || !payload.result?.list?.length) {
        throw new Error(payload.retMsg || "No candle data returned");
      }

      candles = payload.result.list
        .map(row => ({
          time: Number(row[0]),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5])
        }))
        .filter(c => [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite))
        .sort((a,b) => a.time - b.time);

      hideEmpty();
      setStatus("LIVE", true);
      draw();
      connectSocket();
    } catch (error) {
      console.error("Fresh chart history error:", error);
      candles = [];
      setStatus("ERROR", false);
      setEmpty("Live candle data could not be loaded. " + (error.message || ""));
      draw();
    }
  }

  function connectSocket() {
    if (socket) {
      try { socket.close(); } catch (_) {}
      socket = null;
    }

    if (!SUPPORTED[timeframe]) return;

    const interval = SUPPORTED[timeframe];
    const topic = "kline." + interval + "." + symbol;

    try {
      socket = new WebSocket(WS);
    } catch (error) {
      setStatus("ERROR", false);
      return;
    }

    socket.addEventListener("open", () => {
      setStatus("LIVE", true);
      socket.send(JSON.stringify({
        op: "subscribe",
        args: [topic]
      }));
    });

    socket.addEventListener("message", event => {
      try {
        const message = JSON.parse(event.data);
        if (message.topic !== topic || !Array.isArray(message.data)) return;

        const item = message.data[0];
        if (!item) return;

        const next = {
          time: Number(item.start),
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volume)
        };

        if (!Number.isFinite(next.time)) return;

        const index = candles.findIndex(c => c.time === next.time);
        if (index >= 0) {
          candles[index] = next;
        } else {
          candles.push(next);
          candles.sort((a,b) => a.time - b.time);
          if (candles.length > MAX_CANDLES) candles.shift();
        }

        hideEmpty();
        setStatus("LIVE", true);
        updatePrice(next.close);
        draw();
      } catch (error) {
        console.warn("Chart stream message error:", error);
      }
    });

    socket.addEventListener("error", () => {
      setStatus("RECONNECTING", false);
    });

    socket.addEventListener("close", () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        if (document.visibilityState !== "hidden") connectSocket();
      }, 2500);
    });
  }

  function updatePrice(price) {
    const el = chartEls().price;
    if (el) el.textContent = formatPrice(price);
  }

  function draw() {
    const canvas = chartEls().canvas;
    const wrap = canvas?.parentElement;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!candles.length) return;

    const left = 10;
    const right = 68;
    const top = 12;
    const bottom = 24;
    const chartW = Math.max(1, width - left - right);
    const chartH = Math.max(1, height - top - bottom);

    let min = Math.min(...candles.map(c => c.low));
    let max = Math.max(...candles.map(c => c.high));
    const range = Math.max(max - min, Math.abs(max) * 0.0001 || 1);
    min -= range * .06;
    max += range * .06;

    const y = value => top + (max - value) / (max - min) * chartH;
    const step = chartW / candles.length;
    const bodyW = Math.max(2, Math.min(14, step * .62));

    ctx.globalAlpha = .18;
    ctx.beginPath();
    for (let i=0;i<5;i++) {
      const yy = top + (chartH / 4) * i;
      ctx.moveTo(left, yy);
      ctx.lineTo(left + chartW, yy);
    }
    ctx.stroke();

    ctx.globalAlpha = .55;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    for (let i=0;i<5;i++) {
      const value = max - ((max-min)/4)*i;
      ctx.fillText(formatPrice(value), left + chartW + 7, y(value) + 3);
    }

    candles.forEach((c, i) => {
      const x = left + step * i + step / 2;
      const openY = y(c.open);
      const closeY = y(c.close);
      const highY = y(c.high);
      const lowY = y(c.low);
      const rising = c.close >= c.open;

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(openY-closeY));
      ctx.fillStyle = rising ? "#22c55e" : "#ef4444";
      ctx.fillRect(x - bodyW/2, bodyTop, bodyW, bodyHeight);
    });

    const latest = candles[candles.length - 1];
    updatePrice(latest.close);

    ctx.globalAlpha = .72;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(new Date(latest.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}), left, height - 7);
  }

  function bind() {
    const canvas = chartEls().canvas;
    if (!canvas) return;

    document.addEventListener("click", event => {
      const category = event.target.closest("[data-signal-category]");
      const tf = event.target.closest("[data-signal-timeframe]");
      const asset = event.target.closest("#signalAsset");
      const dashboardCategory = event.target.closest("[data-dashboard-category]");
      const dashboardTf = event.target.closest("[data-dashboard-timeframe]");
      const dashboardAsset = event.target.closest("#gtxDashboardAssetSelect");

      if (category || tf || asset || dashboardCategory || dashboardTf || dashboardAsset) {
        setTimeout(loadHistory, 0);
      }
    });

    resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas.parentElement);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        loadHistory();
      } else if (socket) {
        try { socket.close(); } catch (_) {}
      }
    });

    loadHistory();
  }

  window.GTXFreshChart = {
    reload: loadHistory,
    getCandles: () => candles.slice()
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
