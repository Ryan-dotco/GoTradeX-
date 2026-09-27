/* =========================================================
   GOTRADEX CUSTOM CANDLE ENGINE
   Own candlestick renderer for the main market chart.
   ========================================================= */

"use strict";

(function () {
  const originalCreateChart = window.createChart;

  function candleInterval(timeframe) {
    const intervals = {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1H": "1h",
      "4H": "4h",
      "12H": "12h",
      "1D": "1d",
      "1W": "1w",
      "1M": "1M"
    };
    return intervals[timeframe] || null;
  }

  async function fetchOwnCandles(symbol, timeframe, limit = 60) {
    const interval = candleInterval(timeframe);
    if (!interval) throw new Error("Synthetic timeframe");

    const response = await fetch(
      `${CONFIG.BINANCE_API}/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`Candle request failed: ${response.status}`);
    }

    const rows = await response.json();

    return rows.map(row => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5])
    }));
  }

  function syntheticCandles(currentPrice, timeframe = "1H", count = 60) {
    const step = {
      "5s": 5000,
      "15s": 15000,
      "30s": 30000,
      "1m": 60000,
      "5m": 300000,
      "15m": 900000,
      "30m": 1800000,
      "1H": 3600000,
      "4H": 14400000,
      "12H": 43200000,
      "1D": 86400000,
      "1W": 604800000,
      "1M": 2592000000,
      "6M": 15552000000,
      "1Y": 31536000000
    }[timeframe] || 3600000;

    const base = Number(currentPrice) || 1;
    const candles = [];
    let previousClose = base * 0.994;

    for (let i = 0; i < count; i++) {
      const wave = Math.sin(i / 4.2) * 0.0035;
      const drift = Math.sin(i / 13) * 0.002;
      const open = previousClose;
      const close = open * (1 + wave + drift);
      const high = Math.max(open, close) * (1 + 0.0018 + Math.abs(Math.sin(i)) * 0.001);
      const low = Math.min(open, close) * (1 - 0.0018 - Math.abs(Math.cos(i)) * 0.001);

      candles.push({
        time: Date.now() - ((count - i) * step),
        open,
        high,
        low,
        close,
        volume: 0
      });

      previousClose = close;
    }

    return candles;
  }

  function drawCandles(canvas, candles, timeframe) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !candles.length) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 600));
    const height = Math.max(240, Math.floor(rect.height || canvas.clientHeight || 340));

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padding = { top: 18, right: 64, bottom: 28, left: 10 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const range = Math.max(maxPrice - minPrice, maxPrice * 0.001);
    const top = maxPrice + range * 0.06;
    const bottom = minPrice - range * 0.06;

    const priceY = price =>
      padding.top + ((top - price) / (top - bottom)) * chartHeight;

    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(145,164,189,0.10)";
    ctx.fillStyle = "#91a4bd";
    ctx.font = "10px Arial";

    const gridRows = 5;
    for (let i = 0; i <= gridRows; i++) {
      const y = padding.top + (chartHeight / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const price = top - ((top - bottom) / gridRows) * i;
      ctx.fillText(formatCandlePrice(price), width - padding.right + 7, y + 3);
    }

    // Candles
    const slot = chartWidth / candles.length;
    const bodyWidth = Math.max(3, Math.min(14, slot * 0.62));

    candles.forEach((candle, index) => {
      const x = padding.left + slot * index + slot / 2;
      const openY = priceY(candle.open);
      const closeY = priceY(candle.close);
      const highY = priceY(candle.high);
      const lowY = priceY(candle.low);
      const rising = candle.close >= candle.open;

      ctx.strokeStyle = rising ? "#22c55e" : "#ef4444";
      ctx.fillStyle = rising ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 1.2;

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
      ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    });

    // Latest price marker
    const last = candles[candles.length - 1];
    const lastY = priceY(last.close);

    ctx.strokeStyle = "rgba(79,124,255,0.65)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, lastY);
    ctx.lineTo(width - padding.right, lastY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#4f7cff";
    ctx.fillRect(width - padding.right, lastY - 9, 58, 18);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px Arial";
    ctx.fillText(formatCandlePrice(last.close), width - padding.right + 4, lastY + 3);

    // Time labels
    ctx.fillStyle = "#91a4bd";
    ctx.font = "9px Arial";
    const labelIndexes = [0, Math.floor(candles.length / 3), Math.floor(candles.length * 2 / 3), candles.length - 1];

    labelIndexes.forEach(index => {
      const candle = candles[index];
      const x = padding.left + slot * index + slot / 2;
      const date = new Date(candle.time);
      const options =
        timeframe === "5s" || timeframe === "15s" || timeframe === "30s"
          ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
          : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };

      const label = date.toLocaleString([], options);
      ctx.fillText(label, Math.max(padding.left, x - 28), height - 8);
    });
  }

  function formatCandlePrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(4);
    return n.toFixed(6);
  }

  async function createOwnCandleChart() {
    const canvas = $("mainChart");
    if (!canvas) return;

    const timeframe = state.currentTimeframe || "1H";
    const symbol = "BTCUSDT";
    const currentPrice = state.markets?.[symbol]?.price || 0;

    let candles;

    try {
      candles = await fetchOwnCandles(symbol, timeframe, 60);
    } catch (error) {
      console.warn("Own candle feed unavailable; using local candle engine:", error);
      candles = syntheticCandles(currentPrice, timeframe, 60);
    }

    if (state.chart?.destroy) {
      state.chart.destroy();
    }

    const render = () => drawCandles(canvas, candles, timeframe);
    render();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(render)
        : null;

    resizeObserver?.observe(canvas.parentElement || canvas);

    state.chart = {
      type: "candlestick",
      candles,
      destroy() {
        resizeObserver?.disconnect();
        const context = canvas.getContext("2d");
        if (context) {
          const rect = canvas.getBoundingClientRect();
          context.clearRect(0, 0, rect.width, rect.height);
        }
      }
    };
  }

  window.createChart = createOwnCandleChart;

  // If the original app already initialized the dashboard before this
  // file loaded, replace that first chart immediately.
  if (typeof state !== "undefined" && state.markets) {
    createOwnCandleChart();
  }
})();
