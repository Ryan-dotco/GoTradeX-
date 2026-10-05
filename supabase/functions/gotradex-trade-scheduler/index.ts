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
    const r = await fetch(
      "https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(symbol),
      { cache:"no-store" }
    );
    if (!r.ok) throw new Error("Bybit price request failed.");
    const d = await r.json();
    const price = Number(d?.result?.list?.[0]?.lastPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Bybit returned no live price.");
    return { price, time:new Date().toISOString() };
  }

  if (provider === "TWELVE_DATA") {
    const key = Deno.env.get("TWELVE_DATA_API_KEY") || "";
    if (!key) throw new Error("TWELVE_DATA_API_KEY is not configured.");
    const r = await fetch(
      "https://api.twelvedata.com/price?symbol="+encodeURIComponent(symbol)+"&apikey="+encodeURIComponent(key),
      { cache:"no-store" }
    );
    if (!r.ok) throw new Error("Twelve Data price request failed.");
    const d = await r.json();
    const price = Number(d?.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(d?.message || "Twelve Data returned no live price.");
    }
    return { price, time:new Date().toISOString() };
  }

  throw new Error("Unsupported provider.");
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ ok:false, error:"POST required." }, 405);

    const schedulerSecret = req.headers.get("x-gotradex-scheduler-secret") || "";
    const { data: authorized, error: authError } =
      await ctx.supabaseAdmin.rpc("gotradex_verify_scheduler_secret", { p_secret:schedulerSecret });

    if (authError || authorized !== true) {
      return json({ ok:false, error:"Unauthorized scheduler call." }, 401);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (serviceKey) {
      try {
        const { data: lease } = await ctx.supabaseAdmin.from("gotradex_market_worker").select("lease_until").eq("id",true).maybeSingle();
        if (!lease?.lease_until || new Date(lease.lease_until).getTime() < Date.now()) {
          fetch("https://glffecggusetzklmyukv.supabase.co/functions/v1/gotradex-market-stream-worker", {
            method:"POST",
            headers:{"Content-Type":"application/json","Authorization":"Bearer "+serviceKey,"apikey":serviceKey},
            body:JSON.stringify({source:"trade-scheduler"})
          }).catch(e=>console.error("market worker start",e));
        }
      } catch (e) { console.error("market worker lease check",e); }
    }

    const now = new Date().toISOString();
    const { data: openTrades, error } = await ctx.supabaseAdmin
      .from("gotradex_user_trades")
      .select("*")
      .eq("result","OPEN")
      .order("expires_at",{ascending:true})
      .limit(100);

    if (error) return json({ ok:false, error:error.message }, 500);

    const trades = openTrades || [];
    const priceCache = new Map<string,{price:number,time:string}>();
    let ticked = 0, settled = 0, failed = 0;
    const settledRows: unknown[] = [];

    // One provider request per unique active symbol, not one request per trade.
    const uniqueSymbols = new Map<string,{provider:string,symbol:string}>();
    for (const trade of trades) {
      const map = mapping(String(trade.asset || ""));
      if (!map) { failed++; continue; }
      const provider = String(trade.provider || map.provider);
      const symbol = String(trade.provider_symbol || map.symbol);
      uniqueSymbols.set(provider+"|"+symbol,{provider,symbol});
    }

    for (const [key, target] of uniqueSymbols) {
      try {
        priceCache.set(key, await priceFor(target.provider, target.symbol));
      } catch (e) {
        failed++;
        console.error("server-trade-scheduler price", key, e);
      }
    }

    for (const trade of trades) {
      const map = mapping(String(trade.asset || ""));
      if (!map) continue;

      const provider = String(trade.provider || map.provider);
      const symbol = String(trade.provider_symbol || map.symbol);
      const key = provider+"|"+symbol;
      const p = priceCache.get(key);
      if (!p) continue;

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
    }

    return json({
      ok:true,
      server_time:now,
      open_seen:trades.length,
      unique_symbols:uniqueSymbols.size,
      ticked,
      settled,
      failed,
      settled_trades:settledRows
    });
  })
};
