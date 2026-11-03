import { withSupabase } from "npm:@supabase/server@1";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
async function bybitPrice(symbol:string){
 const r=await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(symbol),{cache:"no-store"});
 if(!r.ok)throw new Error("Bybit ticker HTTP "+r.status);
 const d=await r.json(),p=Number(d?.result?.list?.[0]?.lastPrice);
 if(d?.retCode!==0||!Number.isFinite(p)||p<=0)throw new Error("No verified Bybit Spot tick for "+symbol);
 return {price:p,time:new Date().toISOString()};
}
function hit(t:any,p:number){const buy=t.direction==="BUY";if(t.stop_loss!=null&&(buy?p<=Number(t.stop_loss):p>=Number(t.stop_loss)))return "STOP_LOSS";if(t.take_profit!=null&&(buy?p>=Number(t.take_profit):p<=Number(t.take_profit)))return "TAKE_PROFIT";if(Number.isFinite(Date.parse(t.expires_at))&&Date.now()>=Date.parse(t.expires_at))return "EXPIRED";return null;}
function calc(t:any,exit:number){const amount=Number(t.amount),entry=Number(t.entry_price),gross=amount*((t.direction==="BUY"?exit-entry:entry-exit)/entry),opening=amount*.001,closing=gross>0?gross*.10:gross<0?amount*.001:0;return {gross,opening,closing,net:gross-opening-closing};}
Deno.serve(withSupabase({auth:"none"},async(req,ctx)=>{
 if(req.method!=="POST")return json({ok:false,error:"POST required"},405);
 const secret=req.headers.get("x-gotradex-scheduler-secret")||"";
 const {data:authorized,error:authError}=await ctx.supabaseAdmin.rpc("gotradex_verify_scheduler_secret",{p_secret:secret});
 if(authError||authorized!==true)return json({ok:false,error:"Unauthorized scheduler call"},401);
 const {data:positions,error}=await ctx.supabaseAdmin.from("gotradex_testing_positions").select("*").eq("result","OPEN").limit(500);
 if(error)return json({ok:false,error:error.message},500);
 const cache=new Map<string,{price:number,time:string}>(),updated:any[]=[],errors:any[]=[];
 for(const t of positions||[]){
  try{
   const {data:approved,error:registryError}=await ctx.supabaseAdmin.from("gotradex_market_registry").select("symbol").eq("provider","BYBIT").eq("enabled",true).eq("provider_symbol",t.provider_symbol).limit(1);if(registryError)throw registryError;if(!approved?.length)throw new Error("Symbol is not approved in GoTradeX registry; fail-closed.");let q=cache.get(t.provider_symbol);if(!q){q=await bybitPrice(t.provider_symbol);cache.set(t.provider_symbol,q);}
   const reason=hit(t,q.price),patch:any={last_price:q.price,last_tick_at:q.time,updated_at:q.time};
   if(reason){const v=calc(t,q.price);patch.result=v.net>=0?"WON":"LOST";patch.close_reason=reason;patch.exit_price=q.price;patch.gross_pnl=v.gross;patch.opening_fee=v.opening;patch.closing_fee=v.closing;patch.pnl=v.net;patch.closed_at=q.time;}
   const {data,error:updateError}=await ctx.supabaseAdmin.from("gotradex_testing_positions").update(patch).eq("id",t.id).eq("result","OPEN").select("*").maybeSingle();
   if(updateError)throw updateError;if(data)updated.push(data);
  }catch(e){errors.push({id:t.id,symbol:t.provider_symbol,error:e instanceof Error?e.message:"Bybit monitor failed"});}
 }
 return json({ok:true,checked:(positions||[]).length,updated:updated.length,closed:updated.filter(x=>x.result!=="OPEN").length,errors});
}));
