/* =========================================================
   GOTRADEX PHASE 5
   SHARED MARKET ANALYSIS ENGINE
   Reads the exact candle series owned by gtx-fresh-chart.js.
   ========================================================= */

(function () {
  "use strict";

  let timer = null;

  const selected = () => {
    const controls = window.GTXSignalControls?.getState?.();
    return new Set(controls?.indicators || ["ema", "rsi", "momentum"]);
  };

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  function closes(candles) {
    return candles.map(c => Number(c.close)).filter(Number.isFinite);
  }

  function ema(values, period) {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let value = values.slice(0, period).reduce((a,b) => a+b, 0) / period;
    for (let i=period;i<values.length;i++) value = values[i] * k + value * (1-k);
    return value;
  }

  function rsi(values, period = 14) {
    if (values.length <= period) return null;
    let gains = 0, losses = 0;
    for (let i=1;i<=period;i++) {
      const d = values[i] - values[i-1];
      if (d >= 0) gains += d;
      else losses -= d;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i=period+1;i<values.length;i++) {
      const d = values[i] - values[i-1];
      const gain = Math.max(d,0);
      const loss = Math.max(-d,0);
      avgGain = (avgGain * (period-1) + gain) / period;
      avgLoss = (avgLoss * (period-1) + loss) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  function momentum(values, period = 10) {
    if (values.length <= period) return null;
    return values[values.length-1] - values[values.length-1-period];
  }

  function alligator(candles) {
    const values = closes(candles);
    const jaw = ema(values, 13);
    const teeth = ema(values, 8);
    const lips = ema(values, 5);
    if ([jaw, teeth, lips].some(v => v === null)) return null;
    if (lips > teeth && teeth > jaw) return "BULLISH";
    if (lips < teeth && teeth < jaw) return "BEARISH";
    return "MIXED";
  }

  function fractals(candles) {
    if (candles.length < 5) return null;
    const i = candles.length - 3;
    const c = candles[i];
    const high = c.high > candles[i-2].high && c.high > candles[i-1].high &&
      c.high > candles[i+1].high && c.high > candles[i+2].high;
    const low = c.low < candles[i-2].low && c.low < candles[i-1].low &&
      c.low < candles[i+1].low && c.low < candles[i+2].low;
    if (high) return "UP FRACTAL";
    if (low) return "DOWN FRACTAL";
    return "NONE";
  }

  function macd(values) {
    const fast = ema(values, 12);
    const slow = ema(values, 26);
    if (fast === null || slow === null) return null;
    const line = fast - slow;
    return line >= 0 ? "BULLISH" : "BEARISH";
  }

  function analyze() {
    const candles = window.GTXFreshChart?.getCandles?.() || [];
    const values = closes(candles);

    if (values.length < 30) {
      set("gtxIndicatorFeed", "WAITING");
      return;
    }

    const active = selected();
    const e9 = ema(values, 9);
    const e21 = ema(values, 21);
    const r = rsi(values);
    const m = momentum(values);
    const a = alligator(candles);
    const f = fractals(candles);
    const mc = macd(values);

    set("gtxLiveEMA", active.has("ema") ? (
      e9 > e21 ? "BULLISH" : e9 < e21 ? "BEARISH" : "FLAT"
    ) : "OFF");

    set("gtxLiveRSI", active.has("rsi") && r !== null ? r.toFixed(1) : "OFF");

    set("gtxLiveMomentum", active.has("momentum") && m !== null ? (
      m > 0 ? "POSITIVE" : m < 0 ? "NEGATIVE" : "FLAT"
    ) : "OFF");

    set("gtxLiveAlligator", active.has("alligator") ? (a || "WAITING") : "OFF");
    set("gtxLiveFractals", active.has("fractals") ? (f || "WAITING") : "OFF");
    set("gtxLiveMACD", active.has("macd") ? (mc || "WAITING") : "OFF");
    set("gtxIndicatorFeed", "LIVE");

    const signals = [];
    if (active.has("ema") && e9 !== null && e21 !== null) signals.push(e9 > e21 ? 1 : -1);
    if (active.has("rsi") && r !== null) signals.push(r > 55 ? 1 : r < 45 ? -1 : 0);
    if (active.has("momentum") && m !== null) signals.push(m > 0 ? 1 : m < 0 ? -1 : 0);
    if (active.has("alligator")) signals.push(a === "BULLISH" ? 1 : a === "BEARISH" ? -1 : 0);
    if (active.has("macd")) signals.push(mc === "BULLISH" ? 1 : mc === "BEARISH" ? -1 : 0);
    const score = signals.reduce((sum, value) => sum + value, 0);
    const direction = score >= 2 ? "BUY" : score <= -2 ? "SELL" : "HOLD";
    const confidence = Math.min(99, Math.max(0, Math.round(Math.max(
      signals.filter(v => v > 0).length,
      signals.filter(v => v < 0).length
    ) / Math.max(1, signals.length) * 100)));
    const snapshot = { symbol: window.GTXSignalControls?.getState?.().symbol || "BTCUSDT", timeframe: window.GTXSignalControls?.getState?.().timeframe || "1m", direction, confidence, ema9: e9, ema21: e21, rsi: r, momentum: m, alligator: a, fractals: f, macd: mc, time: Date.now() };

    const direction = $("analysisDirection");
    const confidence = $("analysisConfidence");

    if (direction) {
      direction.textContent = directionValue(snapshot);
    }

    if (confidence) {
      const activeCount = Math.max(1, active.size);
      let bullish = 0;
      if (active.has("ema") && e9 > e21) bullish++;
      if (active.has("rsi") && r > 55) bullish++;
      if (active.has("momentum") && m > 0) bullish++;
      if (active.has("alligator") && a === "BULLISH") bullish++;
      if (active.has("macd") && mc === "BULLISH") bullish++;
      const bearish = activeCount - bullish;
      const strength = Math.round(Math.max(bullish, bearish) / activeCount * 100);
      confidence.textContent = snapshot.confidence + "%";
    }
    return snapshot;
  }

  function directionValue(snapshot) { return snapshot.direction; }

  function bind() {
    const run = () => analyze();
    timer = setInterval(run, 2500);

    document.addEventListener("click", event => {
      if (
        event.target.closest("[data-indicator]") ||
        event.target.closest("[data-signal-category]") ||
        event.target.closest("[data-signal-timeframe]") ||
        event.target.closest("#analyzeButton")
      ) {
        setTimeout(run, 150);
      }
    });

    run();
  }

  window.GTXMarketAnalysis = {
    refresh: analyze,
    snapshot: analyze,
    ema,
    rsi,
    momentum
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
