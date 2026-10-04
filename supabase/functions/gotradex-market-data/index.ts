import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

const TD = "https://api.twelvedata.com";

function cleanSymbol(v: unknown) {
  return String(v || "").trim().toUpperCase().replace(/[^A-Z0-9/._:-]/g, "").slice(0, 60);
}

function intervalFor(tf: string) {
  const map: Record<string, string> = {
    "5 Seconds": "1min", "15 Seconds": "1min", "30 Seconds": "1min",
    "1 Minute": "1min", "2 Minutes": "1min", "5 Minutes": "5min",
    "15 Minutes": "15min", "30 Minutes": "30min", "1 Hour": "1h",
    "4 Hours": "4h", "1 Day": "1day", "1 Month": "1month",
    "3 Months": "1month", "6 Months": "1month", "1 Year": "1month"
  };
  return map[tf] || "1min";
}

function symbolFor(assetType: string, symbol: string) {
  const s = cleanSymbol(symbol);
  if (assetType === "forex") {
    const raw = s.replace(/[^A-Z]/g, "");
    if (raw.length === 6) return raw.slice(0, 3) + "/" + raw.slice(3);
  }
  if (assetType === "indices") {
    const map: Record<string, string> = {
      US30: "DJI", US500: "SPX", NAS100: "NDX", UK100: "FTSE", GER40: "DAX",
      FRA40: "CAC", JPN225: "N225", AUS200: "ASX", HK50: "HSI", EU50: "STOXX50E", SA40: "JTOPI"
    };
    return map[s] || s;
  }
  return s;
}

async function td(path: string, params: Record<string, string>) {
  const key = Deno.env.get("TWELVE_DATA_API_KEY") || "";
  if (!key) throw new Error("TWELVE_DATA_API_KEY is not configured on the GoTradeX server.");
  const q = new URLSearchParams({ ...params, apikey: key });
  const r = await fetch(TD + path + "?" + q.toString(), { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || String(d?.status || "").toLowerCase() === "error" || d?.code) {
    throw new Error(String(d?.message || "Market-data provider request failed."));
  }
  return d;
}

function valuesToCandles(values: any[]) {
  return values.map(v => ({
    time: Math.floor(Date.parse(String(v.datetime || "")) / 1000),
    open: Number(v.open), high: Number(v.high), low: Number(v.low),
    close: Number(v.close), volume: Number(v.volume || 0)
  })).filter(x => Number.isFinite(x.time) && [x.open, x.high, x.low, x.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "chart").toLowerCase();
    const configured = Boolean(Deno.env.get("TWELVE_DATA_API_KEY"));
    if (action === "diagnose") return json({
      ok: configured, provider: "twelve_data", apiKeyConfigured: configured,
      coverage: ["forex", "stocks", "indices"],
      message: configured ? "Market-data provider configured." : "Add TWELVE_DATA_API_KEY to Supabase Edge Function secrets."
    });
    if (!configured) return json({
      ok: false, provider: "twelve_data",
      error: "TWELVE_DATA_API_KEY is not configured on the GoTradeX server.",
      configurationRequired: true
    }, 503);
    const assetType = String(body.assetType || "").toLowerCase();
    const symbol = symbolFor(assetType, String(body.symbol || ""));
    const tf = String(body.timeframe || "1 Minute");
    if (!symbol) return json({ ok: false, error: "A valid market symbol is required." }, 400);
    if (action === "price") {
      const d = await td("/price", { symbol });
      return json({ ok: true, provider: "twelve_data", symbol, assetType, price: Number(d?.price), timestamp: Date.now() });
    }
    if (action === "chart") {
      const interval = intervalFor(tf);
      const d = await td("/time_series", { symbol, interval, outputsize: "500", order: "asc", timezone: "UTC" });
      const candles = valuesToCandles(Array.isArray(d?.values) ? d.values : []);
      if (!candles.length) throw new Error("No candles were returned for " + symbol + ".");
      return json({ ok: true, provider: "twelve_data", symbol, assetType, timeframe: tf, interval, candles });
    }
    return json({ ok: false, error: "Unsupported market-data action." }, 400);
  } catch (error) {
    return json({ ok: false, error: String((error as Error)?.message || error || "Market-data request failed.") }, 502);
  }
});