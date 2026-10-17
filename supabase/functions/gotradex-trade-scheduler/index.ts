import { withSupabase } from "npm:@supabase/server@1";
import WebSocketClient from "npm:ws@8.18.0";


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
    "EUR/USD":"frxEURUSD","GBP/USD":"frxGBPUSD","USD/JPY":"frxUSDJPY","AUD/USD":"frxAUDUSD",
    "USD/CHF":"frxUSDCHF","USD/CAD":"frxUSDCAD","NZD/USD":"frxNZDUSD","EUR/GBP":"frxEURGBP",
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
  if (crypto[a]) return { provider:"BYBIT", symbol:crypto[a] };
  if (fx[a]) return { provider:"DERIV", symbol:fx[a] };
  return null;
};

async function derivPrice(symbol: string) {
  return await new Promise<{price:number,time:string}>((resolve,reject)=>{
    let ws:any=null,done=false;
    const finish=(fn:(v:any)=>void,value:any)=>{if(done)return;done=true;clearTimeout(timer);try{ws?.close()}catch{}fn(value)};
    const timer=setTimeout(()=>finish(reject,new Error("Deriv price request timed out.")),8000);
    try{
      ws=new WebSocketClient("wss://api.derivws.com/trading/v1/options/ws/public",{
        handshakeTimeout:7000,
        headers:{"Origin":"https://app.deriv.com","User-Agent":"Mozilla/5.0 (compatible; GoTradeX/1.0; market-data)"}
      });
    }catch(e){finish(reject,e);return}
    ws.on("open",()=>{try{ws.send(JSON.stringify({ticks_history:symbol,end:"latest",count:1,style:"ticks",req_id:1}))}catch(e){finish(reject,e)}});
    ws.on("message",(data:any)=>{
      try{
        const d=JSON.parse(String(data||"{}"));
        if(d.error){finish(reject,new Error(String(d.error.message||"Deriv rejected the price request.")));return}
        if(d.msg_type==="history"&&Array.isArray(d.history?.prices)&&d.history.prices.length){
          const i=d.history.prices.length-1,price=Number(d.history.prices[i]),epoch=Number(d.history.times?.[i]);
          if(Number.isFinite(price)&&price>0&&Number.isFinite(epoch)){finish(resolve,{price,time:new Date(epoch*1000).toISOString()});return}
          finish(reject,new Error("Deriv returned no valid latest price."));
        }
      }catch{finish(reject,new Error("Could not parse Deriv price response."))}
    });
    ws.on("unexpected-response",(_request:any,response:any)=>{
      let body="";
      response.on("data",(chunk:any)=>{body+=String(chunk);if(body.length>500)body=body.slice(0,500)});
      response.on("end",()=>finish(reject,new Error("Deriv price handshake rejected: HTTP "+response.statusCode+" "+body)));
    });
    ws.on("error",(e:any)=>finish(reject,new Error("Deriv price connection failed: "+String(e?.message||e))));
    ws.on("close",()=>{if(!done)finish(reject,new Error("Deriv closed before returning a verified price."))});
  });
}
async function priceFor(provider: string, symbol: string) {
  if (provider === "DERIV") return await derivPrice(symbol);
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
      const provider = map.provider === "DERIV" ? "DERIV" : String(trade.provider || map.provider);
      const symbol = map.provider === "DERIV" ? map.symbol : String(trade.provider_symbol || map.symbol);
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

      const provider = map.provider === "DERIV" ? "DERIV" : String(trade.provider || map.provider);
      const symbol = map.provider === "DERIV" ? map.symbol : String(trade.provider_symbol || map.symbol);
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
