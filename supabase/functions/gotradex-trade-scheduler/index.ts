import { withSupabase } from "npm:@supabase/server@1";

const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const mapping = (asset: string, marketMode: string) => {
  const a = asset.toUpperCase().trim();
  const crypto: Record<string,string> = {
    "BTC/USD":"BTCUSDT","BTC/USDT":"BTCUSDT","ETH/USD":"ETHUSDT","ETH/USDT":"ETHUSDT","XRP/USD":"XRPUSDT","XRP/USDT":"XRPUSDT","SOL/USD":"SOLUSDT","SOL/USDT":"SOLUSDT",
    "ADA/USD":"ADAUSDT","ADA/USDT":"ADAUSDT","DOGE/USD":"DOGEUSDT","DOGE/USDT":"DOGEUSDT","LTC/USD":"LTCUSDT","BNB/USD":"BNBUSDT",
    "AVAX/USD":"AVAXUSDT","DOT/USD":"DOTUSDT","LINK/USD":"LINKUSDT","TRX/USD":"TRXUSDT",
    "TON/USD":"TONUSDT","ATOM/USD":"ATOMUSDT","UNI/USD":"UNIUSDT","BCH/USD":"BCHUSDT",
    "ETC/USD":"ETCUSDT","XLM/USD":"XLMUSDT","NEAR/USD":"NEARUSDT","APT/USD":"APTUSDT",
    "ARB/USD":"ARBUSDT","OP/USD":"OPUSDT","SUI/USD":"SUIUSDT","FIL/USD":"FILUSDT","ALGO/USD":"ALGOUSDT"
  };
  const fx: Record<string,string> = {
    "EUR/USD":"frxEURUSD","GBP/USD":"frxGBPUSD","USD/JPY":"frxUSDJPY","USD/CHF":"frxUSDCHF",
    "AUD/USD":"frxAUDUSD","USD/CAD":"frxUSDCAD","NZD/USD":"frxNZDUSD","EUR/GBP":"frxEURGBP",
    "EUR/JPY":"frxEURJPY","GBP/JPY":"frxGBPJPY","EUR/CHF":"frxEURCHF","AUD/JPY":"frxAUDJPY",
    "AUD/CAD":"frxAUDCAD","AUD/CHF":"frxAUDCHF","AUD/NZD":"frxAUDNZD","CAD/JPY":"frxCADJPY",
    "CHF/JPY":"frxCHFJPY","EUR/AUD":"frxEURAUD","EUR/CAD":"frxEURCAD","EUR/NZD":"frxEURNZD",
    "GBP/AUD":"frxGBPAUD","GBP/CAD":"frxGBPCAD","GBP/CHF":"frxGBPCHF","GBP/NZD":"frxGBPNZD",
    "NZD/JPY":"frxNZDJPY","NZD/CAD":"frxNZDCAD","CAD/CHF":"frxCADCHF","USD/SGD":"frxUSDSGD",
    "USD/HKD":"frxUSDHKD","USD/MXN":"frxUSDMXN","USD/ZAR":"frxUSDZAR","EUR/ZAR":"frxEURZAR",
    "GBP/ZAR":"frxGBPZAR","USD/TRY":"frxUSDTRY","USD/NOK":"frxUSDNOK","USD/SEK":"frxUSDSEK",
    "USD/DKK":"frxUSDDKK","EUR/NOK":"frxEURNOK","EUR/SEK":"frxEURSEK","EUR/PLN":"frxEURPLN",
    "EUR/TRY":"frxEURTRY","GBP/SGD":"frxGBPSGD","USD/INR":"frxUSDINR","USD/BRL":"frxUSDBRL",
    "USD/CNH":"frxUSDCNH","USD/IDR":"frxUSDIDR"
  };
  const otc: Record<string,string> = {
    "US 500 OTC":"OTC_SPC","US TECH 100 OTC":"OTC_NDX","WALL STREET 30 OTC":"OTC_DJI",
    "HONG KONG 50 OTC":"OTC_HSI","EURO 50 OTC":"OTC_SX5E","FRANCE 40 OTC":"OTC_FCHI",
    "GERMANY 40 OTC":"OTC_GDAXI","NETHERLANDS 25 OTC":"OTC_AEX","SWISS 20 OTC":"OTC_SSMI",
    "UK 100 OTC":"OTC_FTSE"
  };
  if (marketMode === "OTC") {
    const otcKey = a.endsWith(" OTC") ? a : a + " OTC";
    return otc[otcKey] ? { provider:"DERIV", symbol:otc[otcKey] } : null;
  }
  if (a.endsWith(" OTC")) return null;
  if (crypto[a]) return { provider:"BYBIT", symbol:crypto[a] };
  if (fx[a]) return { provider:"DERIV", symbol:fx[a] };
  return null;
};

async function derivPrice(symbol: string) {
  return await new Promise<{price:number,time:string}>((resolve,reject)=>{
    let ws: WebSocket | null = null;
    let done = false;
    const finish = (error?: Error, value?: {price:number,time:string}) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws?.close(); } catch (_) {}
      if (error) reject(error); else resolve(value!);
    };
    const timer = setTimeout(()=>finish(new Error("Deriv live price request timed out.")),8000);
    try { ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089"); }
    catch (_) { finish(new Error("Deriv public WebSocket could not be opened.")); return; }
    ws.onopen = () => {
      try { ws?.send(JSON.stringify({ticks_history:symbol,end:"latest",count:1,style:"ticks",req_id:1})); }
      catch (_) { finish(new Error("Deriv history request could not be sent.")); }
    };
    ws.onmessage = event => {
      try {
        const data = JSON.parse(String(event.data));
        if (data?.error) { finish(new Error(String(data.error.message || "Deriv rejected the symbol."))); return; }
        const history = data?.history;
        if (Array.isArray(history?.prices) && history.prices.length) {
          const i = history.prices.length - 1;
          const price = Number(history.prices[i]);
          const epoch = Number(history.times?.[i]);
          if (Number.isFinite(price) && price > 0) {
            finish(undefined,{price,time:new Date(Number.isFinite(epoch)?epoch*1000:Date.now()).toISOString()});
          }
          return;
        }
        if (data?.msg_type === "tick" && data?.tick) {
          const price = Number(data.tick.quote), epoch = Number(data.tick.epoch);
          if (Number.isFinite(price) && price > 0) finish(undefined,{price,time:new Date(Number.isFinite(epoch)?epoch*1000:Date.now()).toISOString()});
        }
      } catch (_) {}
    };
    ws.onerror = () => finish(new Error("Deriv public feed connection failed."));
    ws.onclose = () => { if (!done) finish(new Error("Deriv public feed closed before returning a price.")); };
  });
}

async function priceFor(provider: string, symbol: string) {
  if (provider === "BYBIT") {
    const response = await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(symbol),{cache:"no-store"});
    const data = await response.json().catch(()=>({}));
    if (!response.ok || Number(data?.retCode)!==0) throw new Error(String(data?.retMsg||"Bybit price request failed."));
    const price = Number(data?.result?.list?.[0]?.lastPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Bybit returned no live price.");
    return {price,time:new Date().toISOString()};
  }
  if (provider === "DERIV") return await derivPrice(symbol);
  throw new Error("Unsupported verified provider. Twelve Data and synthetic prices are disabled.");
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
      const map = mapping(String(trade.asset || ""),String(trade.market_mode || "LIVE"));
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
      const map = mapping(String(trade.asset || ""),String(trade.market_mode || "LIVE"));
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
