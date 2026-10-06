/*
 * GoTradeX PRO Engine
 * Source of truth for the supplied GoTradeX Pro asset/indicator/trade UI model.
 *
 * IMPORTANT:
 * - This module is intentionally isolated. Do not delete it as part of chart,
 *   market-feed, wallet, auth, admin, or chat work.
 * - It does NOT generate fake market candles and it does NOT claim live execution.
 * - LIVE selections hand off to the existing verified market/chart layer.
 * - OTC selections are explicitly marked OTC and hand off to the existing OTC layer.
 * - This file is vanilla browser JS because GoTradeX currently runs as a static
 *   HTML application rather than a React/Vite bundle.
 */
(function () {
  "use strict";

  const ASSETS = [
    { symbol: "EUR/USD", flags: ["🇪🇺", "🇺🇸"], payout: 92 },
    { symbol: "GBP/USD", flags: ["🇬🇧", "🇺🇸"], payout: 85 },
    { symbol: "USD/JPY", flags: ["🇺🇸", "🇯🇵"], payout: 88 },
    { symbol: "BTC/USD", flags: ["₿", "🇺🇸"], payout: 75 },
    { symbol: "AUD/USD", flags: ["🇦🇺", "🇺🇸"], payout: 80 }
  ];

  const LIVE_ASSETS = {
    Forex: [
      { symbol: "EUR/USD", flag: "🇪🇺🇺🇸", payout: 92 },
      { symbol: "GBP/USD", flag: "🇬🇧🇺🇸", payout: 88 },
      { symbol: "USD/JPY", flag: "🇺🇸🇯🇵", payout: 86 },
      { symbol: "AUD/USD", flag: "🇦🇺🇺🇸", payout: 84 },
      { symbol: "USD/CAD", flag: "🇺🇸🇨🇦", payout: 83 },
      { symbol: "USD/CHF", flag: "🇺🇸🇨🇭", payout: 82 },
      { symbol: "NZD/USD", flag: "🇳🇿🇺🇸", payout: 81 }
    ],
    Crypto: [
      { symbol: "BTC/USD", flag: "₿", payout: 80 },
      { symbol: "ETH/USD", flag: "Ξ", payout: 78 },
      { symbol: "SOL/USD", flag: "◎", payout: 76 },
      { symbol: "BNB/USD", flag: "BNB", payout: 75 }
    ],
    Commodities: [
      { symbol: "XAU/USD", name: "Gold", flag: "🥇", payout: 85 },
      { symbol: "XAG/USD", name: "Silver", flag: "🥈", payout: 83 },
      { symbol: "USOIL", name: "US Oil", flag: "🛢️", payout: 82 }
    ],
    Stocks: [
      { symbol: "AAPL", name: "Apple", flag: "🍎", payout: 82 },
      { symbol: "TSLA", name: "Tesla", flag: "🚗", payout: 84 },
      { symbol: "NVDA", name: "Nvidia", flag: "💾", payout: 83 },
      { symbol: "MSFT", name: "Microsoft", flag: "🪟", payout: 81 }
    ]
  };

  const OTC_ASSETS = {
    Forex: [
      { symbol: "EUR/USD OTC", base: "EUR/USD", payout: 93 },
      { symbol: "GBP/USD OTC", base: "GBP/USD", payout: 90 },
      { symbol: "USD/JPY OTC", base: "USD/JPY", payout: 89 },
      { symbol: "AUD/USD OTC", base: "AUD/USD", payout: 88 }
    ],
    Crypto: [
      { symbol: "BTC/USD OTC", base: "BTC/USD", payout: 88 },
      { symbol: "ETH/USD OTC", base: "ETH/USD", payout: 86 }
    ],
    Commodities: [
      { symbol: "GOLD OTC", base: "XAU/USD", payout: 89 }
    ],
    Stocks: [
      { symbol: "AAPL OTC", base: "AAPL", payout: 87 },
      { symbol: "TSLA OTC", base: "TSLA", payout: 85 }
    ]
  };

  const INDICATORS = [
    "Alligator",
    "Fractals",
    "Awesome Oscillator",
    "EMA",
    "SMA",
    "Supertrend",
    "Ichimoku Cloud",
    "Parabolic SAR",
    "ADX",
    "RSI",
    "MACD",
    "Bollinger Bands",
    "ATR",
    "Keltner",
    "Donchian",
    "Kangaroo",
    "Lion"
  ];

  const CHART_TYPES = ["candle", "heiken", "line", "area"];
  const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];

  const state = {
    selectedPair: localStorage.getItem("gtx_pair") || localStorage.getItem("gotradex_asset_display") || "BTC/USD",
    selectedType: localStorage.getItem("gtx_type") || localStorage.getItem("gotradex_market_mode") || "LIVE",
    timeframe: localStorage.getItem("gtx_pro_timeframe") || "M1",
    chartType: localStorage.getItem("gtx_pro_chart_type") || "candle",
    activeTrade: null
  };

  function normalizeMode(type) {
    return String(type || "LIVE").toUpperCase() === "OTC" ? "OTC" : "LIVE";
  }

  function baseSymbol(symbol) {
    return String(symbol || "").replace(/\s+OTC$/i, "").trim();
  }

  function allAssets(type) {
    const source = normalizeMode(type) === "OTC" ? OTC_ASSETS : LIVE_ASSETS;
    return Object.keys(source).reduce(function (out, category) {
      source[category].forEach(function (asset) {
        out.push(Object.assign({ category: category }, asset));
      });
      return out;
    }, []);
  }

  function findAsset(symbol, type) {
    const key = String(symbol || "").toUpperCase();
    return allAssets(type).find(function (asset) {
      return String(asset.symbol).toUpperCase() === key ||
        baseSymbol(asset.symbol).toUpperCase() === baseSymbol(key).toUpperCase();
    }) || null;
  }

  function persist() {
    localStorage.setItem("gtx_pair", state.selectedPair);
    localStorage.setItem("gtx_type", normalizeMode(state.selectedType));
    localStorage.setItem("gtx_pro_timeframe", state.timeframe);
    localStorage.setItem("gtx_pro_chart_type", state.chartType);
    localStorage.setItem("gotradex_asset_display", baseSymbol(state.selectedPair));
    localStorage.setItem("gotradex_market_mode", normalizeMode(state.selectedType));
  }

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function subscribeLive(symbol) {
    dispatch("gotradex:pro-live-subscribe", { symbol: baseSymbol(symbol) });
    try {
      if (window.GoTradeXLiveChart && typeof window.GoTradeXLiveChart.reconnect === "function") {
        window.GoTradeXLiveChart.reconnect();
      }
    } catch (_) {}
  }

  function subscribeOTC(symbol) {
    dispatch("gotradex:pro-otc-subscribe", { symbol: baseSymbol(symbol) });
  }

  function selectAsset(assetOrSymbol, type) {
    const mode = normalizeMode(type || state.selectedType);
    const symbol = typeof assetOrSymbol === "string"
      ? assetOrSymbol
      : assetOrSymbol && assetOrSymbol.symbol;

    const found = findAsset(symbol, mode);
    if (!found) {
      throw new Error("Asset is not registered in the GoTradeX Pro Engine: " + symbol);
    }

    state.selectedPair = found.symbol;
    state.selectedType = mode;
    persist();

    const detail = {
      symbol: found.symbol,
      base: baseSymbol(found.symbol),
      type: mode,
      category: found.category,
      payout: Number(found.payout) || 0,
      asset: found
    };

    dispatch("gotradex:pro-asset-changed", detail);
    dispatch("gotradex:asset-changed", {
      label: found.symbol,
      type: String(found.category || "").toLowerCase(),
      mode: mode
    });

    if (mode === "LIVE") subscribeLive(found.symbol);
    else subscribeOTC(found.base || found.symbol);

    return detail;
  }

  function setTimeframe(tf) {
    if (!TIMEFRAMES.includes(tf)) return false;
    state.timeframe = tf;
    persist();
    dispatch("gotradex:pro-timeframe-changed", { timeframe: tf });
    return true;
  }

  function setChartType(type) {
    if (!CHART_TYPES.includes(type)) return false;
    state.chartType = type;
    persist();
    dispatch("gotradex:pro-chart-type-changed", { chartType: type });
    return true;
  }

  function getPayout(symbol, type) {
    const found = findAsset(symbol, type);
    return found ? Number(found.payout) || 0 : 0;
  }

  function toHeikinAshi(data) {
    if (!Array.isArray(data) || !data.length) return [];
    let previousOpen = Number(data[0].open);
    let previousClose = Number(data[0].close);
    return data.map(function (c) {
      const open = (previousOpen + previousClose) / 2;
      const close = (Number(c.open) + Number(c.high) + Number(c.low) + Number(c.close)) / 4;
      previousOpen = open;
      previousClose = close;
      return Object.assign({}, c, {
        open: open,
        close: close,
        high: Math.max(Number(c.high), open, close),
        low: Math.min(Number(c.low), open, close)
      });
    });
  }

  function ema(data, period) {
    if (!Array.isArray(data) || !data.length || period < 1) return [];
    const k = 2 / (period + 1);
    let previous = Number(data[0].close);
    return data.map(function (c, index) {
      if (index === 0) previous = Number(c.close);
      else previous = Number(c.close) * k + previous * (1 - k);
      return { time: c.time, value: previous };
    });
  }

  function sma(data, period) {
    if (!Array.isArray(data) || period < 1) return [];
    const out = [];
    let sum = 0;
    data.forEach(function (c, i) {
      sum += Number(c.close);
      if (i >= period) sum -= Number(data[i - period].close);
      if (i >= period - 1) out.push({ time: c.time, value: sum / period });
    });
    return out;
  }

  function bollinger(data, period, multiplier) {
    period = period || 20;
    multiplier = multiplier || 2;
    if (!Array.isArray(data) || data.length < period) return { upper: [], middle: [], lower: [] };
    const upper = [], middle = [], lower = [];
    for (let i = period - 1; i < data.length; i++) {
      const window = data.slice(i - period + 1, i + 1).map(function (c) { return Number(c.close); });
      const mean = window.reduce(function (a, b) { return a + b; }, 0) / period;
      const variance = window.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / period;
      const deviation = Math.sqrt(variance);
      middle.push({ time: data[i].time, value: mean });
      upper.push({ time: data[i].time, value: mean + multiplier * deviation });
      lower.push({ time: data[i].time, value: mean - multiplier * deviation });
    }
    return { upper: upper, middle: middle, lower: lower };
  }

  function current() {
    const found = findAsset(state.selectedPair, state.selectedType);
    return {
      pair: state.selectedPair,
      base: baseSymbol(state.selectedPair),
      type: normalizeMode(state.selectedType),
      timeframe: state.timeframe,
      chartType: state.chartType,
      payout: found ? Number(found.payout) || 0 : 0,
      asset: found
    };
  }

  const engine = Object.freeze({
    version: "2026.10.06",
    ASSETS: ASSETS,
    LIVE_ASSETS: LIVE_ASSETS,
    OTC_ASSETS: OTC_ASSETS,
    INDICATORS: INDICATORS,
    CHART_TYPES: CHART_TYPES,
    TIMEFRAMES: TIMEFRAMES,
    state: state,
    allAssets: allAssets,
    findAsset: findAsset,
    selectAsset: selectAsset,
    setTimeframe: setTimeframe,
    setChartType: setChartType,
    getPayout: getPayout,
    current: current,
    toHeikinAshi: toHeikinAshi,
    ema: ema,
    sma: sma,
    bollinger: bollinger,
    subscribeLive: subscribeLive,
    subscribeOTC: subscribeOTC
  });

  window.GoTradeXProEngine = engine;

  window.addEventListener("gotradex:asset-changed", function (event) {
    const d = event && event.detail ? event.detail : {};
    const mode = normalizeMode(d.mode || state.selectedType);
    const label = d.label || state.selectedPair;
    const found = findAsset(label, mode);
    if (!found) return;
    state.selectedPair = found.symbol;
    state.selectedType = mode;
    persist();
  });

  window.addEventListener("gotradex:pro-timeframe-changed", function (event) {
    const tf = event && event.detail ? event.detail.timeframe : null;
    if (tf) localStorage.setItem("gtx_pro_timeframe", tf);
  });

  window.addEventListener("gotradex:pro-chart-type-changed", function (event) {
    const type = event && event.detail ? event.detail.chartType : null;
    if (type) localStorage.setItem("gtx_pro_chart_type", type);
  });

  dispatch("gotradex:pro-engine-ready", {
    version: engine.version,
    assetCount: allAssets("LIVE").length + allAssets("OTC").length,
    current: current()
  });
})();
