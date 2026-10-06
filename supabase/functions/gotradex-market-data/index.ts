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
  if (assetType === "commodities" || assetType === "metals") {
    const map: Record<string, string> = {
      "WTI OIL":"WTI/USD","BRENT OIL":"BRENT/USD","NATURAL GAS":"NATGAS/USD",
      "COPPER":"HG1","PLATINUM":"XPT/USD","PALLADIUM":"XPD/USD"
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
      const params: Record<string, string> = { symbol };
      if (assetType === "forex") params.type = "forex";
      const d = await td("/price", params);
      return json({ ok: true, provider: "twelve_data", symbol, assetType, price: Number(d?.price), timestamp: Date.now() });
    }
    if (action === "chart") {
      // Crypto is served directly by Bybit from this trusted server adapter.
      // This keeps exchange credentials/API traffic off the client and prevents
      // the frontend from calling an unsupported bybit_chart action.
      if (assetType === "crypto") {
        const bybitSymbol = cleanSymbol(symbol).replace("/", "");
        if (!/^[A-Z0-9]+$/.test(bybitSymbol)) throw new Error("Invalid Bybit crypto symbol.");
        if (["5 Seconds", "15 Seconds", "30 Seconds"].includes(tf)) {
          const u = "https://api.bybit.com/v5/market/recent-trade?category=spot&symbol=" +
            encodeURIComponent(bybitSymbol) + "&limit=1000";
          const r = await fetch(u, { cache: "no-store" });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || Number(d?.retCode) !== 0) {
            throw new Error(String(d?.retMsg || "Bybit recent trades unavailable."));
          }
          const trades = Array.isArray(d?.result?.list) ? d.result.list.slice().reverse() : [];
          const sec = tf === "5 Seconds" ? 5 : tf === "15 Seconds" ? 15 : 30;
          const buckets = new Map<string, any>();
          for (const x of trades) {
            const ts = Number(x.time), p = Number(x.price), v = Number(x.size || 0);
            if (!Number.isFinite(ts) || !Number.isFinite(p)) continue;
            const b = Math.floor(ts / 1000 / sec) * sec;
            let c = buckets.get(String(b));
            if (!c) c = { time: b, open: p, high: p, low: p, close: p, volume: 0 };
            c.high = Math.max(c.high, p); c.low = Math.min(c.low, p); c.close = p;
            c.volume += Number.isFinite(v) ? v : 0;
            buckets.set(String(b), c);
          }
          const candles = Array.from(buckets.values()).sort((a, b) => a.time - b.time).slice(-220);
          if (!candles.length) throw new Error("No verified Bybit trade history was returned for " + bybitSymbol + ".");
          return json({ ok: true, provider: "bybit", symbol: bybitSymbol, assetType, timeframe: tf, candles });
        }
        const bybitIntervals: Record<string, string> = {
          "1 Minute":"1","2 Minutes":"2","5 Minutes":"5","15 Minutes":"15","30 Minutes":"30",
          "1 Hour":"60","4 Hours":"240","1 Day":"D","1 Month":"M"
        };
        const interval = bybitIntervals[tf];
        if (!interval) throw new Error("Bybit does not provide a native candle interval for " + tf + ".");
        const u = "https://api.bybit.com/v5/market/kline?category=spot&symbol=" +
          encodeURIComponent(bybitSymbol) + "&interval=" + interval + "&limit=500";
        const r = await fetch(u, { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || Number(d?.retCode) !== 0) {
          throw new Error(String(d?.retMsg || "Bybit historical candles unavailable."));
        }
        const rows = Array.isArray(d?.result?.list) ? d.result.list.slice().reverse() : [];
        const candles = rows.map((x: any[]) => ({
          time: Math.floor(Number(x[0]) / 1000),
          open: Number(x[1]), high: Number(x[2]), low: Number(x[3]), close: Number(x[4]), volume: Number(x[5] || 0)
        })).filter((x: any) => Number.isFinite(x.time) && [x.open,x.high,x.low,x.close].every(Number.isFinite));
        if (!candles.length) throw new Error("No verified Bybit historical candles were returned for " + bybitSymbol + ".");
        return json({ ok: true, provider: "bybit", symbol: bybitSymbol, assetType, timeframe: tf, candles });
      }

      const interval = intervalFor(tf);
      const params: Record<string, string> = { symbol, interval, outputsize: "500" };
      if (assetType === "forex") params.type = "forex";
      const d = await td("/time_series", params);
      const candles = valuesToCandles(Array.isArray(d?.values) ? d.values : []);
      if (!candles.length) throw new Error("No candles were returned for " + symbol + ".");
      return json({ ok: true, provider: "twelve_data", symbol, assetType, timeframe: tf, interval, candles });
    }
    return json({ ok: false, error: "Unsupported market-data action." }, 400);
  } catch (error) {
    console.error("gotradex-market-data provider failure:", error);
    return json({ ok: false, error: String((error as Error)?.message || error || "Market-data request failed.") }, 502);
  }
});