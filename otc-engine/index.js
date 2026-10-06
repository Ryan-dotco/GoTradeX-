import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TICK_MS = Math.max(1000, Number(process.env.TICK_INTERVAL_MS || 2000));
const CANDLE_MS = Math.max(60000, Number(process.env.CANDLE_INTERVAL_MS || 60000));
const HISTORY = Math.max(50, Math.min(1000, Number(process.env.HISTORY_CANDLES || 300)));
const VOL_MULTIPLIER = Math.max(0.1, Number(process.env.OTC_VOL_MULTIPLIER || 1));

const PAIRS = [
  ["EUR/USD OTC", "EUR/USD", 0.00008, 93],
  ["GBP/USD OTC", "GBP/USD", 0.00010, 92],
  ["USD/JPY OTC", "USD/JPY", 0.015, 91],
  ["AUD/USD OTC", "AUD/USD", 0.00009, 90],
  ["USD/CAD OTC", "USD/CAD", 0.00010, 90],
  ["USD/CHF OTC", "USD/CHF", 0.00008, 89],
  ["NZD/USD OTC", "NZD/USD", 0.00008, 89],
  ["EUR/GBP OTC", "EUR/GBP", 0.00007, 88],
  ["EUR/JPY OTC", "EUR/JPY", 0.015, 88],
  ["GBP/JPY OTC", "GBP/JPY", 0.018, 87],
  ["BTC/USD OTC", "BTC/USD", 2.5, 88],
  ["ETH/USD OTC", "ETH/USD", 1.2, 87]
].map(([pair, base, vol, payout]) => ({ pair, base, vol: vol * VOL_MULTIPLIER, payout }));

const state = new Map();

function decimals(pair) {
  return pair.includes("JPY") ? 3 : pair.startsWith("BTC") ? 2 : pair.startsWith("ETH") ? 2 : 5;
}
function round(pair, n) {
  const d = decimals(pair);
  return Number(Number(n).toFixed(d));
}
function normalish() {
  return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
}

async function getSeed(base) {
  const [from, to] = base.split("/");
  if (from === "BTC" || from === "ETH") {
    const symbol = from + to;
    const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
    const d = await r.json();
    const p = Number(d?.result?.list?.[0]?.lastPrice);
    if (Number.isFinite(p) && p > 0) return p;
  }

  const tdKey = process.env.TWELVE_DATA_API_KEY;
  if (tdKey) {
    const r = await fetch(
      `https://api.twelvedata.com/price?symbol=${encodeURIComponent(base)}&apikey=${encodeURIComponent(tdKey)}`
    );
    const d = await r.json();
    const p = Number(d?.price);
    if (Number.isFinite(p) && p > 0) return p;
  }

  // Frankfurter is a daily FX reference, not a real-time feed.
  // It is only a seed for the synthetic OTC stream; it is never labelled LIVE.
  const r = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  const d = await r.json();
  const p = Number(d?.rates?.[to]);
  if (Number.isFinite(p) && p > 0) return p;

  return null;
}

async function ensureSeed(asset) {
  let s = state.get(asset.pair);
  if (s?.price) return s;

  const seed = await getSeed(asset.base);
  if (!Number.isFinite(seed) || seed <= 0) {
    console.warn(`No seed available for ${asset.pair}; skipping until a source is available.`);
    return null;
  }

  const now = Date.now();
  const start = Math.floor(now / CANDLE_MS) * CANDLE_MS;
  s = { price: seed, candle: { time: start, open: seed, high: seed, low: seed, close: seed } };
  state.set(asset.pair, s);

  // Seed OTC-only history so the chart has candles immediately.
  let p = seed;
  const rows = [];
  for (let i = HISTORY; i > 0; i--) {
    const t = start - i * CANDLE_MS;
    const drift = normalish() * asset.vol;
    const o = p;
    const c = Math.max(0.00000001, o + drift);
    const h = Math.max(o, c) + Math.abs(normalish()) * asset.vol * 0.35;
    const l = Math.max(0.00000001, Math.min(o, c) - Math.abs(normalish()) * asset.vol * 0.35);
    rows.push({
      pair: asset.pair, timeframe: "1 Minute", candle_time: new Date(t).toISOString(),
      open: round(asset.base, o), high: round(asset.base, h), low: round(asset.base, l),
      close: round(asset.base, c), volume: 0, type: "OTC"
    });
    p = c;
  }

  const { error } = await supabase.from("otc_candles").upsert(rows, {
    onConflict: "pair,timeframe,candle_time"
  });
  if (error) throw error;

  return s;
}

async function writeTick(asset) {
  const s = await ensureSeed(asset);
  if (!s) return;

  const now = Date.now();
  const candleTime = Math.floor(now / CANDLE_MS) * CANDLE_MS;
  const move = normalish() * asset.vol * 0.20;
  const next = Math.max(0.00000001, s.price + move);
  s.price = next;

  if (s.candle.time !== candleTime) {
    s.candle = { time: candleTime, open: next, high: next, low: next, close: next };
  } else {
    s.candle.close = next;
    s.candle.high = Math.max(s.candle.high, next);
    s.candle.low = Math.min(s.candle.low, next);
  }

  const priceRow = {
    pair: asset.pair,
    base_pair: asset.base,
    category: asset.base.includes("/") ? "Forex" : "Crypto",
    price: round(asset.base, next),
    open: round(asset.base, s.candle.open),
    high: round(asset.base, s.candle.high),
    low: round(asset.base, s.candle.low),
    close: round(asset.base, s.candle.close),
    payout: asset.payout,
    type: "OTC",
    updated_at: new Date(now).toISOString()
  };

  const candleRow = {
    pair: asset.pair,
    timeframe: "1 Minute",
    candle_time: new Date(s.candle.time).toISOString(),
    open: round(asset.base, s.candle.open),
    high: round(asset.base, s.candle.high),
    low: round(asset.base, s.candle.low),
    close: round(asset.base, s.candle.close),
    volume: 0,
    type: "OTC"
  };

  const [priceResult, candleResult] = await Promise.all([
    supabase.from("otc_prices").upsert(priceRow, { onConflict: "pair" }),
    supabase.from("otc_candles").upsert(candleRow, { onConflict: "pair,timeframe,candle_time" })
  ]);

  if (priceResult.error) throw priceResult.error;
  if (candleResult.error) throw candleResult.error;
}

async function tick() {
  for (const asset of PAIRS) {
    try {
      await writeTick(asset);
    } catch (err) {
      console.error(`[${asset.pair}]`, err?.message || err);
    }
  }
}

console.log("GoTradeX OTC Engine starting (isolated service; OTC only).");
await tick();
setInterval(() => tick().catch(err => console.error("Engine tick:", err?.message || err)), TICK_MS);
