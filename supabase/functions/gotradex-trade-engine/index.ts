import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || ""; } catch { return Deno.env.get("SUPABASE_ANON_KEY") || ""; }
})();
const SERVICE_ROLE = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
})();

const json=(x:any,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"}});

async function userFromToken(token:string){
  if(!token || !PUBLISHABLE) return null;
  const r=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:PUBLISHABLE,Authorization:"Bearer "+token},cache:"no-store"});
  if(!r.ok) return null;
  const u=await r.json(); return u?.id ? u : null;
}
async function db(path:string,init:RequestInit={}){
  const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:SERVICE_ROLE,Authorization:"Bearer "+SERVICE_ROLE,"Content-Type":"application/json","Prefer":"return=representation",...(init.headers||{})},cache:"no-store"});
  const body=await r.text();
  if(!r.ok) throw new Error(body||("Database request failed "+r.status));
  return body?JSON.parse(body):null;
}
async function derivPrice(symbol:string){
  return await new Promise<{price:number,time:string}>((resolve,reject)=>{
    let ws:WebSocket|null=null;
    let done=false;
    const finish=(error?:Error,value?:{price:number,time:string})=>{
      if(done)return;done=true;clearTimeout(timer);try{ws?.close()}catch(_){}
      if(error)reject(error);else resolve(value!);
    };
    const timer=setTimeout(()=>finish(new Error("Deriv live price request timed out.")),8000);
    try{ws=new WebSocket("wss://ws.derivws.com/websockets/v3?app_id="+encodeURIComponent(Deno.env.get("DERIV_APP_ID")||"1089"))}
    catch(_){finish(new Error("Deriv public WebSocket could not be opened."));return}
    ws.onopen=()=>{try{ws?.send(JSON.stringify({ticks_history:symbol,end:"latest",count:1,style:"ticks",req_id:1}))}catch(_){finish(new Error("Deriv history request could not be sent."))}};
    ws.onmessage=event=>{
      try{
        const data=JSON.parse(String(event.data));
        if(data?.error){finish(new Error(String(data.error.message||"Deriv rejected the symbol.")));return}
        const history=data?.history;
        if(Array.isArray(history?.prices)&&history.prices.length){
          const i=history.prices.length-1,price=Number(history.prices[i]),epoch=Number(history.times?.[i]);
          if(Number.isFinite(price)&&price>0)finish(undefined,{price,time:new Date(Number.isFinite(epoch)?epoch*1000:Date.now()).toISOString()});
          return;
        }
        if(data?.msg_type==="tick"&&data?.tick){
          const price=Number(data.tick.quote),epoch=Number(data.tick.epoch);
          if(Number.isFinite(price)&&price>0)finish(undefined,{price,time:new Date(Number.isFinite(epoch)?epoch*1000:Date.now()).toISOString()});
        }
      }catch(_){}
    };
    ws.onerror=()=>finish(new Error("Deriv public feed connection failed."));
    ws.onclose=()=>{if(!done)finish(new Error("Deriv public feed closed before returning a price."))};
  });
}
async function priceFor(_asset:string,provider:string,providerSymbol:string){
  if(provider==="BYBIT"){
    const r=await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(providerSymbol),{cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||Number(d?.retCode)!==0)throw new Error(String(d?.retMsg||"Bybit price request failed."));
    const p=Number(d?.result?.list?.[0]?.lastPrice);
    if(!Number.isFinite(p)||p<=0)throw new Error("Bybit returned no live price.");
    return {price:p,time:new Date().toISOString()};
  }
  if(provider==="DERIV")return await derivPrice(providerSymbol);
  throw new Error("Unsupported verified provider. Twelve Data and synthetic prices are disabled.");
}
async function mapping(asset:string,marketMode:string){
  const a=asset.toUpperCase().trim();
  const crypto:Record<string,string>={
    "BTC/USD":"BTCUSDT","BTC/USDT":"BTCUSDT","ETH/USD":"ETHUSDT","ETH/USDT":"ETHUSDT",
    "XRP/USD":"XRPUSDT","XRP/USDT":"XRPUSDT","SOL/USD":"SOLUSDT","SOL/USDT":"SOLUSDT",
    "ADA/USD":"ADAUSDT","ADA/USDT":"ADAUSDT","DOGE/USD":"DOGEUSDT","DOGE/USDT":"DOGEUSDT",
    "LTC/USD":"LTCUSDT","BNB/USD":"BNBUSDT","AVAX/USD":"AVAXUSDT","DOT/USD":"DOTUSDT",
    "LINK/USD":"LINKUSDT","TRX/USD":"TRXUSDT","TON/USD":"TONUSDT","ATOM/USD":"ATOMUSDT",
    "UNI/USD":"UNIUSDT","BCH/USD":"BCHUSDT","ETC/USD":"ETCUSDT","XLM/USD":"XLMUSDT",
    "NEAR/USD":"NEARUSDT","APT/USD":"APTUSDT","ARB/USD":"ARBUSDT","OP/USD":"OPUSDT",
    "SUI/USD":"SUIUSDT","FIL/USD":"FILUSDT","ALGO/USD":"ALGOUSDT"
  };
  const fx:Record<string,string>={
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
  const otc:Record<string,string>={
    "US 500":"OTC_SPC","US 500 OTC":"OTC_SPC","US TECH 100":"OTC_NDX","US TECH 100 OTC":"OTC_NDX",
    "WALL STREET 30":"OTC_DJI","WALL STREET 30 OTC":"OTC_DJI","HONG KONG 50":"OTC_HSI","HONG KONG 50 OTC":"OTC_HSI",
    "EURO 50":"OTC_SX5E","EURO 50 OTC":"OTC_SX5E","FRANCE 40":"OTC_FCHI","FRANCE 40 OTC":"OTC_FCHI",
    "GERMANY 40":"OTC_GDAXI","GERMANY 40 OTC":"OTC_GDAXI","NETHERLANDS 25":"OTC_AEX","NETHERLANDS 25 OTC":"OTC_AEX",
    "SWISS 20":"OTC_SSMI","SWISS 20 OTC":"OTC_SSMI","UK 100":"OTC_FTSE","UK 100 OTC":"OTC_FTSE"
  };
  if(marketMode==="OTC"){
    const symbol=otc[a];return symbol?{provider:"DERIV",symbol}:null;
  }
  if(a.endsWith(" OTC"))return null;
  if(crypto[a])return {provider:"BYBIT",symbol:crypto[a]};
  if(fx[a])return {provider:"DERIV",symbol:fx[a]};
  return null;
}
async function settleDue(userId:string){
  const trades=await db("gotradex_user_trades?user_id=eq."+encodeURIComponent(userId)+"&result=eq.OPEN&expires_at=lte."+encodeURIComponent(new Date().toISOString())+"&select=*");
  const settled=[];
  for(const t of (trades||[])){
    try{
      const p=await priceFor(t.asset,t.provider,t.provider_symbol);
      const won=t.direction==="BUY" ? p.price>Number(t.entry_price) : p.price<Number(t.entry_price);
      const draw=p.price===Number(t.entry_price);
      const result=draw?"DRAW":won?"WON":"LOST";
      const payout=Number(t.payout_pct||80);
      const pnl=draw?0:(won?Number(t.amount)*payout/100:-Number(t.amount));
      const rows=await db("gotradex_user_trades?id=eq."+t.id,{
        method:"PATCH",
        body:JSON.stringify({exit_price:p.price,result,pnl,settled_at:p.time,last_server_price:p.price,last_server_tick_at:p.time,updated_at:p.time})
      });
      settled.push(rows?.[0]||{id:t.id,result,pnl});
    }catch(e){ console.error("settle",t.id,e); }
  }
  return settled;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return json({ok:true});
  if(req.method!=="POST") return json({ok:false,error:"POST required."},405);
  try{
    const auth=req.headers.get("authorization")||"";
    const token=auth.replace(/^Bearer\s+/i,"");
    const user=await userFromToken(token);
    if(!user) return json({ok:false,error:"Authenticated GoTradeX session required."},401);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"sync");
    if(action==="open"){
      const accountMode=String(body.account_mode||"DEMO").toUpperCase();
      if(accountMode!=="DEMO") return json({ok:false,error:"REAL execution is not enabled. A verified broker execution connection is required; the server will not simulate a real-money trade."},409);
      const marketMode=String(body.market_mode||"LIVE").toUpperCase();
      const asset=String(body.asset||"").trim();
      const direction=String(body.direction||"").toUpperCase();
      const amount=Number(body.amount);
      const expirySeconds=Math.floor(Number(body.expiry_seconds));
      if(marketMode!=="LIVE") return json({ok:false,error:"OTC server execution is not connected to a verified provider."},409);
      if(!asset || !["BUY","SELL"].includes(direction) || !Number.isFinite(amount)||amount<=0 || !Number.isFinite(expirySeconds)||expirySeconds<5) return json({ok:false,error:"Invalid trade parameters."},400);
      const map=await mapping(asset,marketMode); if(!map) return json({ok:false,error:"No verified provider mapping exists for "+asset+"."},409);
      const p=await priceFor(asset,map.provider,map.symbol);
      const opened=new Date();
      const expires=new Date(opened.getTime()+expirySeconds*1000);
      const rows=await db("gotradex_user_trades",{
        method:"POST",
        body:JSON.stringify({user_id:user.id,account_mode:accountMode,market_mode:marketMode,asset,provider:map.provider,provider_symbol:map.symbol,direction,amount,expiry_seconds:expirySeconds,opened_at:opened.toISOString(),expires_at:expires.toISOString(),entry_price:p.price,last_server_price:p.price,last_server_tick_at:p.time,client_last_seen_at:opened.toISOString(),metadata:{source:"gotradex-server-runtime",execution:"PAPER_ONLY"}})
      });
      return json({ok:true,trade:rows?.[0]||null});
    }
    if(action==="sync"){
      const open=await db("gotradex_user_trades?user_id=eq."+encodeURIComponent(user.id)+"&result=eq.OPEN&select=*");
      const updates=[];
      for(const t of (open||[])){
        try{
          const p=await priceFor(t.asset,t.provider,t.provider_symbol);
          await db("gotradex_user_trades?id=eq."+t.id,{method:"PATCH",body:JSON.stringify({last_server_price:p.price,last_server_tick_at:p.time,client_last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
        }catch(e){console.error("tick",t.id,e);}
      }
      const settled=await settleDue(user.id);
      const latest=await db("gotradex_user_trades?user_id=eq."+encodeURIComponent(user.id)+"&select=*&order=created_at.desc&limit=50");
      return json({ok:true,server_time:new Date().toISOString(),open:latest?.filter((x:any)=>x.result==="OPEN")||[],settled,history:latest||[]});
    }
    if(action==="settle"){
      const settled=await settleDue(user.id);
      return json({ok:true,settled,server_time:new Date().toISOString()});
    }
    return json({ok:false,error:"Unknown action."},400);
  }catch(e){ console.error(e); return json({ok:false,error:e?.message||"Server trade runtime failed."},500); }
});