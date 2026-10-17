import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
const cleanSymbol = (v: unknown) => String(v || "").trim().toUpperCase().replace(/[^A-Z0-9/._:-]/g, "").slice(0, 60);

function aggregateCandles(rows: any[], seconds: number) {
  const buckets = new Map<number, any>();
  for (const row of rows) {
    const time = Number(row.time), open = Number(row.open), high = Number(row.high);
    const low = Number(row.low), close = Number(row.close), volume = Number(row.volume || 0);
    if (![time, open, high, low, close].every(Number.isFinite)) continue;
    const bucket = Math.floor(time / seconds) * seconds;
    let candle = buckets.get(bucket);
    if (!candle) candle = { time: bucket, open, high, low, close, volume: 0 };
    candle.high = Math.max(candle.high, high);
    candle.low = Math.min(candle.low, low);
    candle.close = close;
    candle.volume += Number.isFinite(volume) ? volume : 0;
    buckets.set(bucket, candle);
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time).slice(-500);
}

async function bybitJson(path: string) {
  const response = await fetch("https://api.bybit.com" + path, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || Number(data?.retCode) !== 0) {
    throw new Error(String(data?.retMsg || "Bybit public market data is unavailable."));
  }
  return data;
}

async function bybitPrice(symbol: string) {
  const data = await bybitJson("/v5/market/tickers?category=spot&symbol=" + encodeURIComponent(symbol));
  const price = Number(data?.result?.list?.[0]?.lastPrice);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Bybit returned no verified live price.");
  return { ok: true, provider: "bybit", symbol, price, timestamp: Date.now() };
}

async function bybitCandles(symbol: string, timeframe: string) {
  if (["5 Seconds", "10 Seconds", "15 Seconds", "30 Seconds"].includes(timeframe)) {
    const data = await bybitJson("/v5/market/recent-trade?category=spot&symbol=" + encodeURIComponent(symbol) + "&limit=1000");
    const trades = Array.isArray(data?.result?.list) ? data.result.list.slice().reverse() : [];
    const seconds = timeframe === "5 Seconds" ? 5 : timeframe === "10 Seconds" ? 10 : timeframe === "15 Seconds" ? 15 : 30;
    const buckets = new Map<number, any>();
    for (const trade of trades) {
      const ts = Number(trade.time), price = Number(trade.price), volume = Number(trade.size || 0);
      if (!Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) continue;
      const time = Math.floor(ts / 1000 / seconds) * seconds;
      let candle = buckets.get(time);
      if (!candle) candle = { time, open: price, high: price, low: price, close: price, volume: 0 };
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += Number.isFinite(volume) ? volume : 0;
      buckets.set(time, candle);
    }
    const candles = Array.from(buckets.values()).sort((a, b) => a.time - b.time).slice(-220);
    if (!candles.length) throw new Error("Bybit returned no verified recent trades for " + symbol + ".");
    return { ok: true, provider: "bybit", symbol, timeframe, candles };
  }

  const map: Record<string, string> = {
    "1 Minute": "1", "2 Minutes": "2", "3 Minutes": "3", "5 Minutes": "5",
    "15 Minutes": "15", "30 Minutes": "30", "1 Hour": "60", "4 Hours": "240", "1 Day": "D"
  };
  let interval = map[timeframe];
  let aggregateSeconds = 0;
  if (timeframe === "2 Minutes") { interval = "1"; aggregateSeconds = 120; }
  if (!interval) throw new Error("Unsupported Bybit candle timeframe: " + timeframe + ".");
  const data = await bybitJson("/v5/market/kline?category=spot&symbol=" + encodeURIComponent(symbol) + "&interval=" + interval + "&limit=500");
  const rows = Array.isArray(data?.result?.list) ? data.result.list.slice().reverse() : [];
  let candles = rows.map((x: any[]) => ({
    time: Math.floor(Number(x[0]) / 1000), open: Number(x[1]), high: Number(x[2]),
    low: Number(x[3]), close: Number(x[4]), volume: Number(x[5] || 0)
  })).filter((x: any) => Number.isFinite(x.time) && [x.open, x.high, x.low, x.close].every(Number.isFinite) && x.close > 0);
  if (aggregateSeconds) candles = aggregateCandles(candles, aggregateSeconds);
  if (!candles.length) throw new Error("Bybit returned no verified historical candles for " + symbol + ".");
  return { ok: true, provider: "bybit", symbol, timeframe, candles };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "POST required." }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "chart").toLowerCase();
    if (action === "diagnose") {
      return json({ ok: true, provider: "Bybit + Deriv public feeds", credentialsRequired: false,
        message: "This endpoint serves Bybit public crypto data. Supported forex and verified OTC indices use Deriv public feeds directly." });
    }
    if (action === "lookup") {
      return json({ ok: false, provider: "NONE", error: "Automatic symbol discovery is disabled. Use the verified asset registry." }, 409);
    }
    const assetType = String(body?.assetType || "").toLowerCase();
    if (assetType !== "crypto") {
      return json({ ok: false, provider: "NONE", error: "No verified Bybit crypto mapping applies. Forex and verified OTC indices must use the Deriv feed; unsupported assets are not substituted or fabricated." }, 409);
    }
    const symbol = cleanSymbol(body?.symbol).replace("/", "");
    if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !symbol.endsWith("USDT")) {
      return json({ ok: false, provider: "NONE", error: "A verified USDT spot symbol is required." }, 400);
    }
    if (action === "price") return json(await bybitPrice(symbol));
    if (action === "chart") return json(await bybitCandles(symbol, String(body?.timeframe || "1 Minute")));
    return json({ ok: false, error: "Unsupported market-data action." }, 400);
  } catch (error) {
    console.error("gotradex-market-data provider failure:", error);
    return json({ ok: false, error: String((error as Error)?.message || error || "Market-data request failed.") }, 502);
  }
});
