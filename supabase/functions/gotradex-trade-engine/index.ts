import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const PUBLISHABLE = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || ""; } catch { return Deno.env.get("SUPABASE_ANON_KEY") || ""; }
})();
const SERVICE_ROLE = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
})();
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY") || "";
 

const DERIV_FX:Record<string,string>={
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
function twelveSymbol(asset:string){return asset.replace(/\s+/g," ").trim();}

async function derivPrice(symbol:string){
  return await new Promise<{price:number,time:string}>((resolve,reject)=>{
    let ws:WebSocket|null=null,done=false;
    const finish=(fn:(v:any)=>void,value:any)=>{if(done)return;done=true;clearTimeout(timer);try{ws?.close()}catch{}fn(value)};
    const timer=setTimeout(()=>finish(reject,new Error("Deriv price request timed out.")),8000);
    try{ws=new WebSocket("wss://ws.binaryws.com/websockets/v3")}catch(e){finish(reject,e);return}
    ws.onopen=()=>{try{ws?.send(JSON.stringify({ticks_history:symbol,end:"latest",count:1,style:"ticks",req_id:1}))}catch(e){finish(reject,e)}};
    ws.onerror=()=>finish(reject,new Error("Deriv price connection failed."));
    ws.onclose=()=>{if(!done)finish(reject,new Error("Deriv price connection closed before a verified tick was received."))};
    ws.onmessage=event=>{
      try{
        const d=JSON.parse(String(event.data||"{}"));
        if(d.error){finish(reject,new Error(String(d.error.message||"Deriv rejected the price request.")));return}
        if(d.msg_type==="history"&&Array.isArray(d.history?.prices)&&d.history.prices.length){
          const i=d.history.prices.length-1,p=Number(d.history.prices[i]),t=Number(d.history.times?.[i]);
          if(Number.isFinite(p)&&p>0&&Number.isFinite(t)){finish(resolve,{price:p,time:new Date(t*1000).toISOString()});return}
          finish(reject,new Error("Deriv returned no valid latest price."));
        }
      }catch{finish(reject,new Error("Could not parse Deriv price response."))}
    };
  });
}
async function priceFor(asset:string,provider:string,providerSymbol:string){
  if(provider==="BYBIT"){
    const r=await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(providerSymbol),{cache:"no-store"});
    if(!r.ok) throw new Error("Bybit price request failed.");
    const d=await r.json(); const p=Number(d?.result?.list?.[0]?.lastPrice);
    if(!Number.isFinite(p)||p<=0) throw new Error("Bybit returned no live price.");
    return {price:p,time:new Date().toISOString()};
  }
  if(provider==="DERIV") return await derivPrice(providerSymbol);
  if(provider==="TWELVE_DATA"){
    if(!TWELVE_DATA_API_KEY) throw new Error("TWELVE_DATA_API_KEY is not configured on the server.");
    const r=await fetch("https://api.twelvedata.com/price?symbol="+encodeURIComponent(twelveSymbol(providerSymbol))+"&apikey="+encodeURIComponent(TWELVE_DATA_API_KEY),{cache:"no-store"});
    if(!r.ok) throw new Error("Twelve Data price request failed.");
    const d=await r.json(); const p=Number(d?.price);
    if(!Number.isFinite(p)||p<=0) throw new Error(d?.message||"Twelve Data returned no live price.");
    return {price:p,time:new Date().toISOString()};
  }
  throw new Error("Unsupported verified provider.");
}
async function mapping(asset:string){
  const a=asset.toUpperCase();
  const crypto:Record<string,string>={
    "BTC/USD":"BTCUSDT","ETH/USD":"ETHUSDT","XRP/USD":"XRPUSDT","SOL/USD":"SOLUSDT","ADA/USD":"ADAUSDT",
    "DOGE/USD":"DOGEUSDT","LTC/USD":"LTCUSDT","BNB/USD":"BNBUSDT","AVAX/USD":"AVAXUSDT","DOT/USD":"DOTUSDT",
    "LINK/USD":"LINKUSDT","TRX/USD":"TRXUSDT","TON/USD":"TONUSDT","ATOM/USD":"ATOMUSDT","UNI/USD":"UNIUSDT",
    "BCH/USD":"BCHUSDT","ETC/USD":"ETCUSDT","XLM/USD":"XLMUSDT","NEAR/USD":"NEARUSDT","APT/USD":"APTUSDT",
    "ARB/USD":"ARBUSDT","OP/USD":"OPUSDT","SUI/USD":"SUIUSDT","FIL/USD":"FILUSDT","ALGO/USD":"ALGOUSDT"
  };
  if(crypto[a]) return {provider:"BYBIT",symbol:crypto[a]};
  if(DERIV_FX[a]) return {provider:"DERIV",symbol:DERIV_FX[a]};
  if(!TWELVE_DATA_API_KEY) return null;
  const aliases:Record<string,string>={
    "WTI OIL":"WTI/USD","BRENT OIL":"BRENT/USD","NATURAL GAS":"NATGAS/USD","COPPER":"HG1",
    "PLATINUM":"XPT/USD","PALLADIUM":"XPD/USD","US30":"DJI","US500":"SPX","NAS100":"NDX",
    "UK100":"FTSE","GER40":"DAX","FRA40":"CAC","JPN225":"N225","AUS200":"ASX","HK50":"HSI",
    "EU50":"STOXX50E","SA40":"JTOPI"
  };
  const query=aliases[a]||asset.trim();
  const r=await fetch("https://api.twelvedata.com/symbol_search?symbol="+encodeURIComponent(query)+"&outputsize=12&apikey="+encodeURIComponent(TWELVE_DATA_API_KEY),{cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||String(d?.status||"").toLowerCase()==="error"||d?.code) throw new Error(String(d?.message||"Twelve Data symbol lookup failed."));
  const matches=Array.isArray(d?.data)?d.data:[];
  if(!matches.length) return null;
  const clean=(v:string)=>String(v||"").trim().toUpperCase();
  const exact=matches.find((x:any)=>clean(x?.symbol)===clean(query));
  const best=exact||matches[0];
  return best?.symbol ? {provider:"TWELVE_DATA",symbol:String(best.symbol)} : null;
}
async function settleDue(userId:string){
  const trades=await db("gotradex_user_trades?user_id=eq."+encodeURIComponent(userId)+"&result=eq.OPEN&expires_at=lte."+encodeURIComponent(new Date().toISOString())+"&select=*");
  const settled=[];
  for(const t of (trades||[])){
    try{
      const resolved=DERIV_FX[String(t.asset||"").toUpperCase()] ? {provider:"DERIV",symbol:DERIV_FX[String(t.asset).toUpperCase()]} : {provider:t.provider,symbol:t.provider_symbol};
      const p=await priceFor(t.asset,resolved.provider,resolved.symbol);
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
      const map=await mapping(asset); if(!map) return json({ok:false,error:"No verified provider mapping exists for "+asset+"."},409);
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
          const resolved=DERIV_FX[String(t.asset||"").toUpperCase()] ? {provider:"DERIV",symbol:DERIV_FX[String(t.asset).toUpperCase()]} : {provider:t.provider,symbol:t.provider_symbol};
          const p=await priceFor(t.asset,resolved.provider,resolved.symbol);
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
  }catch(e){ console.error(e); const message=e instanceof Error ? e.message : "Server trade runtime failed."; return json({ok:false,error:message},500); }
});