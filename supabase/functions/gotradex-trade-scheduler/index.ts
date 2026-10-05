import { withSupabase } from "npm:@supabase/server@1";

const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const mapping = (asset: string) => {
  const a = asset.toUpperCase();
  const crypto: Record<string,string> = {
    "BTC/USD":"BTCUSDT","ETH/USD":"ETHUSDT","XRP/USD":"XRPUSDT",
    "SOL/USD":"SOLUSDT","ADA/USD":"ADAUSDT","DOGE/USD":"DOGEUSDT","LTC/USD":"LTCUSDT"
  };
  const fx: Record<string,string> = {
    "EUR/USD":"EUR/USD","GBP/USD":"GBP/USD","USD/JPY":"USD/JPY","USD/CHF":"USD/CHF",
    "AUD/USD":"AUD/USD","USD/CAD":"USD/CAD","NZD/USD":"NZD/USD","EUR/GBP":"EUR/GBP",
    "EUR/JPY":"EUR/JPY","GBP/JPY":"GBP/JPY","USD/ZAR":"USD/ZAR",
    "XAU/USD":"XAU/USD","XAG/USD":"XAG/USD"
  };
  if (crypto[a]) return { provider:"BYBIT", symbol:crypto[a] };
  if (fx[a]) return { provider:"TWELVE_DATA", symbol:fx[a] };
  return null;
};

async function priceFor(provider: string, symbol: string) {
  if (provider === "BYBIT") {
    const r = await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(symbol), { cache:"no-store" });
    if (!r.ok) throw new Error("Bybit price request failed.");
    const d = await r.json();
    const price = Number(d?.result?.list?.[0]?.lastPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Bybit returned no live price.");
    return { price, time:new Date().toISOString() };
  }
  if (provider === "TWELVE_DATA") {
    const key = Deno.env.get("TWELVE_DATA_API_KEY") || "";
    if (!key) throw new Error("TWELVE_DATA_API_KEY is not configured.");
    const r = await fetch("https://api.twelvedata.com/price?symbol="+encodeURIComponent(symbol)+"&apikey="+encodeURIComponent(key), { cache:"no-store" });
    if (!r.ok) throw new Error("Twelve Data price request failed.");
    const d = await r.json();
    const price = Number(d?.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error(d?.message || "Twelve Data returned no live price.");
    return { price, time:new Date().toISOString() };
  }
  throw new Error("Unsupported provider.");
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ ok:false, error:"POST required." }, 405);
    const now = new Date().toISOString();
    const { data: openTrades, error } = await ctx.supabaseAdmin
      .from("gotradex_user_trades")
      .select("*")
      .eq("result","OPEN")
      .order("expires_at",{ascending:true})
      .limit(100);

    if (error) return json({ ok:false, error:error.message }, 500);

    let ticked = 0, settled = 0, failed = 0;
    const settledRows: unknown[] = [];

    for (const trade of (openTrades || [])) {
      const map = mapping(String(trade.asset || ""));
      if (!map) { failed++; continue; }

      try {
        const provider = String(trade.provider || map.provider);
        const symbol = String(trade.provider_symbol || map.symbol);
        const p = await priceFor(provider, symbol);

        await ctx.supabaseAdmin
          .from("gotradex_user_trades")
          .update({
            last_server_price:p.price,
            last_server_tick_at:p.time,
            updated_at:now
          })
          .eq("id",trade.id)
          .eq("result","OPEN");

        await ctx.supabaseAdmin
          .from("gotradex_market_state")
          .upsert({
            symbol:String(trade.asset).toUpperCase(),
            asset:String(trade.asset),
            provider,
            provider_symbol:symbol,
            price:p.price,
            tick_at:p.time,
            updated_at:now
          }, { onConflict:"symbol" });

        ticked++;

        if (new Date(trade.expires_at).getTime() <= Date.now()) {
          const entry = Number(trade.entry_price);
          const direction = String(trade.direction).toUpperCase();
          const draw = p.price === entry;
          const won = direction === "BUY" ? p.price > entry : p.price < entry;
          const result = draw ? "DRAW" : (won ? "WON" : "LOST");
          const payout = Number(trade.payout_pct || 80);
          const amount = Number(trade.amount || 0);
          const pnl = draw ? 0 : (won ? amount * payout / 100 : -amount);

          const { data: updated } = await ctx.supabaseAdmin
            .from("gotradex_user_trades")
            .update({
              exit_price:p.price,
              result,
              pnl,
              settled_at:p.time,
              last_server_price:p.price,
              last_server_tick_at:p.time,
              updated_at:now
            })
            .eq("id",trade.id)
            .eq("result","OPEN")
            .select("*")
            .maybeSingle();

          if (updated) {
            settled++;
            settledRows.push(updated);
          }
        }
      } catch (e) {
        failed++;
        console.error("server-trade-scheduler", trade.id, e);
      }
    }

    return json({
      ok:true,
      server_time:now,
      open_seen:(openTrades || []).length,
      ticked,
      settled,
      failed,
      settled_trades:settledRows
    });
  })
};
