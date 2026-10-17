import { createClient } from "npm:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"https://glffecggusetzklmyukv.supabase.co";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const SELF=SUPABASE_URL+"/functions/v1/gotradex-market-stream-worker";
const RUN_MS=105000, HANDOFF_MS=90000;
const SUBSCRIPTION_TTL_MS=24*60*60*1000;
const admin=createClient(SUPABASE_URL,SERVICE,{auth:{autoRefreshToken:false,persistSession:false}});
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});

async function acquire(){const id=crypto.randomUUID();const {data,error}=await admin.rpc("gotradex_acquire_market_worker",{p_worker_id:id,p_lease_seconds:120});return{id,ok:!error&&data===true};}
async function renew(id:string){await admin.rpc("gotradex_renew_market_worker",{p_worker_id:id,p_lease_seconds:120});}
async function release(id:string){await admin.rpc("gotradex_release_market_worker",{p_worker_id:id});}

async function activeSymbols(){
 const cutoff=new Date(Date.now()-SUBSCRIPTION_TTL_MS).toISOString();
 const [subs,open]=await Promise.all([
  admin.from("gotradex_market_subscriptions").select("symbol").gte("last_requested_at",cutoff),
  admin.from("gotradex_user_trades").select("asset,provider,provider_symbol").eq("result","OPEN").limit(100)
 ]);
 if(subs.error)throw new Error("Subscription lookup failed: "+subs.error.message);
 if(open.error)throw new Error("Open-trade lookup failed: "+open.error.message);
 const set=new Set<string>((subs.data||[]).map((x:any)=>String(x.symbol).toUpperCase()));
 for(const t of (open.data||[]))if(t.asset)set.add(String(t.asset).toUpperCase());
 const {data:reg,error:regError}=await admin.from("gotradex_market_registry").select("symbol,provider,provider_symbol,asset,priority").eq("enabled",true).order("priority",{ascending:true});
 if(regError)throw new Error("Market registry lookup failed: "+regError.message);
 const rows=(reg||[]).filter((r:any)=>set.has(String(r.symbol).toUpperCase()));
 return{deriv:rows.filter((r:any)=>r.provider==="DERIV"),bybit:rows.filter((r:any)=>r.provider==="BYBIT")};
}
async function writeTick(r:any,price:number,ts=Date.now()){
 if(!Number.isFinite(price)||price<=0)return;
 const iso=new Date(ts>1e12?ts:ts*1000).toISOString(),now=new Date().toISOString();
 const results=await Promise.all([
  admin.from("gotradex_market_state").upsert({symbol:String(r.symbol).toUpperCase(),asset:r.asset,provider:r.provider,provider_symbol:r.provider_symbol,price,tick_at:iso,updated_at:now},{onConflict:"symbol"}),
  admin.from("gotradex_market_registry").update({last_price:price,last_tick_at:iso,last_error:null,updated_at:now}).eq("symbol",r.symbol)
 ]);
 if(results[0].error)throw new Error("Market state upsert failed for "+r.symbol+": "+results[0].error.message);
 if(results[1].error)throw new Error("Registry tick update failed for "+r.symbol+": "+results[1].error.message);
}
async function restPrice(r:any){
 try{
  if(r.provider==="BYBIT"){
   const u="https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(r.provider_symbol);
   const d=await (await fetch(u,{cache:"no-store"})).json();
   const p=Number(d?.result?.list?.[0]?.lastPrice); if(Number.isFinite(p))await writeTick(r,p,Date.now()); else throw new Error("No Bybit price");
  }else{
   throw new Error("Unsupported provider. Only verified Bybit REST prices are used for catch-up.");
  }
 }catch(e){
  await admin.from("gotradex_market_registry").update({last_error:String((e as Error)?.message||e),updated_at:new Date().toISOString()}).eq("symbol",r.symbol);
 }
}
function connectDeriv(rows:any[]){
 return new Promise<number>(resolve=>{
  if(!rows.length)return resolve(0);
  const ws=new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");let count=0,done=false,opened=false,sawTick=false;
  const finish=()=>{if(done)return;done=true;clearTimeout(diagnosticTimer);try{ws.close()}catch(_){}resolve(count)};
  const timer=setTimeout(finish,RUN_MS-5000);
  const diagnosticTimer=setTimeout(()=>{if(!sawTick){console.error("DERIV_NO_TICKS",JSON.stringify(rows.map((r:any)=>({symbol:r.symbol,provider_symbol:r.provider_symbol,opened:opened}))));Promise.all(rows.map((r:any)=>admin.from("gotradex_market_registry").update({last_error:"Deriv WebSocket returned no ticks; verify symbol and provider availability.",updated_at:new Date().toISOString()}).eq("symbol",r.symbol))).catch(()=>{})}},10000);
  ws.onopen=()=>{
   opened=true;console.log("DERIV_WS_OPEN",rows.length);
   try{ws.send(JSON.stringify({active_symbols:"brief",product_type:"basic",req_id:999}))}catch(_){}
   rows.forEach((r:any,i:number)=>{
    try{ws.send(JSON.stringify({ticks:r.provider_symbol,subscribe:1,req_id:i+1}))}catch(_){}
   });
   const ping=setInterval(()=>{try{ws.send(JSON.stringify({ping:1}))}catch(_){}},20000);
   ws.addEventListener("close",()=>clearInterval(ping));
  };
  ws.onmessage=e=>{
   try{
    const m=JSON.parse(String(e.data||"{}"));
    if(m?.error){console.error("DERIV_PROVIDER_ERROR",String(m.error.message||"unknown"),String(m.error.code||""));return;}
    if(m?.msg_type==="tick"&&m?.tick){
      const sym=String(m.tick.symbol||"").toUpperCase();
      const row=rows.find((r:any)=>String(r.provider_symbol).toUpperCase()===sym);
      const price=Number(m.tick.quote),epoch=Number(m.tick.epoch);
      if(row&&Number.isFinite(price)&&price>0){count++;if(!sawTick){sawTick=true;clearTimeout(diagnosticTimer);console.log("DERIV_FIRST_TICK",row.symbol)}writeTick(row,price,Number.isFinite(epoch)?epoch*1000:Date.now()).catch((err:any)=>console.error("DERIV_WRITE_FAILED",row.symbol,String(err?.message||err)))}
    }
   }catch(_){}
  };
  ws.onerror=(e)=>{console.error("DERIV_WS_ERROR",String((e as any)?.message||"WebSocket error"));Promise.all(rows.map((r:any)=>admin.from("gotradex_market_registry").update({last_error:"Deriv WebSocket connection failed. Verify the app ID and provider availability.",updated_at:new Date().toISOString()}).eq("symbol",r.symbol))).catch(()=>{});finish()};ws.onclose=()=>{clearTimeout(timer);if(!sawTick)console.error("DERIV_WS_CLOSED_BEFORE_TICK",rows.length);finish()};
 });
}
function connectBybit(rows:any[]){
 return new Promise<number>(resolve=>{
  if(!rows.length)return resolve(0);
  const ws=new WebSocket("wss://stream.bybit.com/v5/public/spot");let count=0,done=false;
  const finish=()=>{if(done)return;done=true;try{ws.close()}catch(_){}resolve(count)};const timer=setTimeout(finish,RUN_MS-5000);
  ws.onopen=()=>{ws.send(JSON.stringify({op:"subscribe",args:rows.map(r=>"tickers."+r.provider_symbol)}));const ping=setInterval(()=>{try{ws.send(JSON.stringify({op:"ping"}))}catch(_){}},20000);ws.addEventListener("close",()=>clearInterval(ping));};
  ws.onmessage=e=>{try{const m=JSON.parse(String(e.data||"{}"));const topic=String(m.topic||"");if(topic.startsWith("tickers.")){const sym=topic.slice(8),row=rows.find(r=>r.provider_symbol===sym),p=Number(m?.data?.lastPrice);if(row&&Number.isFinite(p)){count++;writeTick(row,p,Number(m.ts||Date.now())).catch(()=>{})}}}catch(_){}};
  ws.onerror=()=>finish();ws.onclose=()=>{clearTimeout(timer);finish()};
 });
}
async function pollLoop(active:any[],deadline:number){
 // Bybit REST is a catch-up pass only. Forex and OTC prices come from Deriv ticks.
 if(Date.now()>=deadline)return;
 for(const r of active){
  if(Date.now()>=deadline)break;
  await restPrice(r);
 }
}
async function runWorker(id:string){
 const active=await activeSymbols();
 console.log("MARKET_WORKER_ACTIVE",{deriv:active.deriv.length,bybit:active.bybit.length});
 if(!active.deriv.length&&!active.bybit.length)return;
 const deadline=Date.now()+RUN_MS-5000;
 const wsPromise=Promise.all([connectDeriv(active.deriv),connectBybit(active.bybit)]);
 await Promise.all([wsPromise,pollLoop(active.bybit,deadline)]);
 await renew(id);
 if(Date.now()-deadline<HANDOFF_MS){
  fetch(SELF,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+SERVICE,"apikey":SERVICE},body:JSON.stringify({handoff:true})}).catch(()=>{});
 }
}
Deno.serve(async req=>{
 if(req.method!=="POST")return json({ok:false,error:"POST required"},405);
 if(!SERVICE)return json({ok:false,error:"Server service key is not configured"},503);
 const auth=req.headers.get("authorization")||"",api=req.headers.get("apikey")||"";
 if(auth!=="Bearer "+SERVICE&&api!==SERVICE)return json({ok:false,error:"Unauthorized"},401);
 const lock=await acquire();if(!lock.ok)return json({ok:true,skipped:true,reason:"another worker holds the lease"});
 EdgeRuntime.waitUntil(runWorker(lock.id).catch(async e=>{console.error("market worker",e);await release(lock.id)}));
 EdgeRuntime.waitUntil(new Promise<void>(resolve=>setTimeout(()=>{release(lock.id).finally(resolve)},RUN_MS)));
 return json({ok:true,started:true,worker_id:lock.id});
});