import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL = Deno.env.get("SUPABASE_URL") || "";
const ANON = (() => { try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || ""; } catch { return Deno.env.get("SUPABASE_ANON_KEY") || ""; } })();
const SERVICE = (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; } })();
const headers = { "Content-Type":"application/json", "Cache-Control":"no-store", "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization,content-type,apikey", "Access-Control-Allow-Methods":"POST,OPTIONS" };
const reply = (data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function userFromToken(token:string){
  if(!token||!ANON)return null;
  const r=await fetch(URL+"/auth/v1/user",{headers:{apikey:ANON,Authorization:"Bearer "+token},cache:"no-store"});
  if(!r.ok)return null; const u=await r.json(); return u?.id?u:null;
}
async function db(path:string,init:RequestInit={}){
  const r=await fetch(URL+"/rest/v1/"+path,{...init,headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":"application/json",Prefer:"return=representation",...(init.headers||{})},cache:"no-store"});
  const body=await r.text(); if(!r.ok)throw new Error(body||"Database request failed "+r.status); return body?JSON.parse(body):null;
}
function symbolFor(asset:string,provided?:string){
  const raw=String(provided||asset||"").toUpperCase().replace(/\s/g,"");
  const symbol=raw.includes("/")?raw.replace("/","").replace(/USD$/,"USDT"):raw.replace(/[-_]/g,"");
  if(!/^[A-Z0-9]{3,24}$/.test(symbol))throw new Error("Invalid Bybit symbol.");
  return symbol.endsWith("USDT")?symbol:symbol+"USDT";
}
async function price(symbol:string){
  const url="https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(symbol);
  const r=await fetch(url,{cache:"no-store"}); if(!r.ok)throw new Error("Bybit market price request failed.");
  const j=await r.json(); const p=Number(j?.result?.list?.[0]?.lastPrice);
  if(j?.retCode!==0||!Number.isFinite(p)||p<=0)throw new Error("Bybit has no verified Spot ticker for "+symbol+".");
  return {price:p,at:new Date().toISOString()};
}
function validLevels(side:string,entry:number,sl:number|null,tp:number|null){
  if(sl!==null&&(!(sl>0)||(side==="BUY"?sl>=entry:sl<=entry)))throw new Error("Stop Loss must be below entry for BUY and above entry for SELL.");
  if(tp!==null&&(!(tp>0)||(side==="BUY"?tp<=entry:tp>=entry)))throw new Error("Take Profit must be above entry for BUY and below entry for SELL.");
}
function crossed(t:any,p:number){
  const buy=t.direction==="BUY";
  if(t.stop_loss!=null&&(buy?p<=Number(t.stop_loss):p>=Number(t.stop_loss)))return "STOP_LOSS";
  if(t.take_profit!=null&&(buy?p>=Number(t.take_profit):p<=Number(t.take_profit)))return "TAKE_PROFIT";
  return null;
}
function pnl(t:any,exit:number){
  const amount=Number(t.amount),entry=Number(t.entry_price);
  const gross=amount*((t.direction==="BUY"?exit-entry:entry-exit)/entry);
  const openFee=amount*0.001;
  const closeFee=gross>0?gross*0.10:(gross<0?amount*0.001:0);
  return {gross,openFee,closeFee,net:gross-openFee-closeFee};
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return reply({ok:true});
  if(req.method!=="POST")return reply({ok:false,error:"POST required."},405);
  try{
    const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    const user=await userFromToken(token); if(!user)return reply({ok:false,error:"Authenticated GoTradeX session required."},401);
    const body=await req.json().catch(()=>({})); const action=String(body.action||"sync");
    if(action==="open"){
      if(String(body.account_mode||"DEMO").toUpperCase()!=="DEMO")return reply({ok:false,error:"This Testing position engine is Demo-only. Real-money execution is not enabled."},409);
      const asset=String(body.asset||"").trim(),direction=String(body.direction||"").toUpperCase(),amount=Number(body.amount),expirySeconds=Math.max(5,Math.min(31536000,Math.floor(Number(body.expiry_seconds)||180)));
      if(!asset||!["BUY","SELL"].includes(direction)||!Number.isFinite(amount)||amount<=0)return reply({ok:false,error:"Invalid position details."},400);
      const symbol=symbolFor(asset,body.provider_symbol); const approved=await db("gotradex_market_registry?provider=eq.BYBIT&enabled=eq.true&provider_symbol=eq."+encodeURIComponent(symbol)+"&select=symbol&limit=1"); if(!Array.isArray(approved)||!approved.length)return reply({ok:false,error:"Asset is not approved for Bybit Spot Demo trading. This symbol remains IN REVIEW."},409); const q=await price(symbol),openedAt=new Date(q.at),expiresAt=new Date(openedAt.getTime()+expirySeconds*1000).toISOString();
      const rows=await db("gotradex_testing_positions",{method:"POST",body:JSON.stringify({user_id:user.id,account_mode:"DEMO",asset,provider:"BYBIT",provider_symbol:symbol,direction,amount,entry_price:q.price,last_price:q.price,last_tick_at:q.at,expiry_seconds:expirySeconds,expires_at:expiresAt,opened_at:q.at,metadata:{engine:"testing-bybit-position-engine",price_source:"Bybit Spot REST ticker",expiry_display_only:true}})});
      return reply({ok:true,position:rows?.[0]||null,price_source:"BYBIT_SPOT"});
    }
    if(action==="levels"){
      const id=String(body.position_id||""); if(!id)return reply({ok:false,error:"Position ID is required."},400);
      const rows=await db("gotradex_testing_positions?id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(user.id)+"&result=eq.OPEN&select=*");
      const t=rows?.[0]; if(!t)return reply({ok:false,error:"Open Demo position not found."},404);
      const sl=body.stop_loss===null?null:Number(body.stop_loss),tp=body.take_profit===null?null:Number(body.take_profit);
      if((sl!==null&&(!Number.isFinite(sl)||sl<=0))||(tp!==null&&(!Number.isFinite(tp)||tp<=0)))return reply({ok:false,error:"SL/TP must be positive prices."},400);
      validLevels(t.direction,Number(t.entry_price),sl,tp);
      const updated=await db("gotradex_testing_positions?id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(user.id)+"&result=eq.OPEN",{method:"PATCH",body:JSON.stringify({stop_loss:sl,take_profit:tp,updated_at:new Date().toISOString()})});
      return reply({ok:true,position:updated?.[0]||null});
    }
    if(action==="close"){
      const id=String(body.position_id||""); if(!id)return reply({ok:false,error:"Position ID is required."},400);
      const rows=await db("gotradex_testing_positions?id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(user.id)+"&result=eq.OPEN&select=*");
      const t=rows?.[0]; if(!t)return reply({ok:false,error:"Open Demo position not found."},404);
      const q=await price(t.provider_symbol),v=pnl(t,q.price),now=q.at;
      const updated=await db("gotradex_testing_positions?id=eq."+encodeURIComponent(id)+"&user_id=eq."+encodeURIComponent(user.id)+"&result=eq.OPEN",{method:"PATCH",body:JSON.stringify({result:v.net>=0?"WON":"LOST",close_reason:"MANUAL",exit_price:q.price,last_price:q.price,last_tick_at:now,gross_pnl:v.gross,opening_fee:v.openFee,closing_fee:v.closeFee,pnl:v.net,closed_at:now,updated_at:now})});
      return reply({ok:true,position:updated?.[0]||null});
    }
    if(action==="sync"){
      const open=await db("gotradex_testing_positions?user_id=eq."+encodeURIComponent(user.id)+"&result=eq.OPEN&select=*&order=opened_at.asc");
      const changed=[];
      for(const t of open||[]){
        try{
          const approved=await db("gotradex_market_registry?provider=eq.BYBIT&enabled=eq.true&provider_symbol=eq."+encodeURIComponent(t.provider_symbol)+"&select=symbol&limit=1");
          if(!Array.isArray(approved)||!approved.length){changed.push({id:t.id,error:"Asset is not approved in the Bybit registry; no price action taken."});continue;}
          const q=await price(t.provider_symbol),expired=Number.isFinite(Date.parse(t.expires_at))&&Date.now()>=Date.parse(t.expires_at),hit=crossed(t,q.price),reason=hit||(expired?"EXPIRED":null);
          if(reason){
            const v=pnl(t,q.price),result=v.net>=0?"WON":"LOST";
            const rows=await db("gotradex_testing_positions?id=eq."+encodeURIComponent(t.id)+"&user_id=eq."+encodeURIComponent(user.id)+"&result=eq.OPEN",{method:"PATCH",body:JSON.stringify({result,close_reason:reason,exit_price:q.price,last_price:q.price,last_tick_at:q.at,gross_pnl:v.gross,opening_fee:v.openFee,closing_fee:v.closeFee,pnl:v.net,closed_at:q.at,updated_at:q.at})});
            changed.push(rows?.[0]||{id:t.id,result,close_reason:reason});
          }else{
            const rows=await db("gotradex_testing_positions?id=eq."+encodeURIComponent(t.id)+"&user_id=eq."+encodeURIComponent(user.id)+"&result=eq.OPEN",{method:"PATCH",body:JSON.stringify({last_price:q.price,last_tick_at:q.at,updated_at:q.at})});
            changed.push(rows?.[0]||{id:t.id,last_price:q.price});
          }
        }catch(e){changed.push({id:t.id,error:e instanceof Error?e.message:"Bybit sync failed"});}
      }
      const latest=await db("gotradex_testing_positions?user_id=eq."+encodeURIComponent(user.id)+"&select=*&order=opened_at.desc&limit=50");
      return reply({ok:true,server_time:new Date().toISOString(),open:(latest||[]).filter((x:any)=>x.result==="OPEN"),changed,history:latest||[],price_source:"BYBIT_SPOT"});
    }
    return reply({ok:false,error:"Unknown action."},400);
  }catch(e){return reply({ok:false,error:e instanceof Error?e.message:"Position engine failed."},500);}
});