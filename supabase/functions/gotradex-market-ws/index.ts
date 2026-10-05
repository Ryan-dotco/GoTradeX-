import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://glffecggusetzklmyukv.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY") || "";
const TWELVE_WS = "wss://ws.twelvedata.com/v1/quotes/price?apikey=";

function fail(message:string,status=401){ return new Response(JSON.stringify({ok:false,error:message}),{status,headers:{"Content-Type":"application/json"}}); }

async function authenticate(token:string){
  if(!token || !SUPABASE_ANON_KEY) return false;
  try{
    const r=await fetch(SUPABASE_URL+"/auth/v1/user",{
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+token},
      cache:"no-store"
    });
    return r.ok;
  }catch(_){ return false; }
}

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:{
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization,content-type",
    "Access-Control-Allow-Methods":"GET,OPTIONS"
  }});
  if(req.method!=="GET") return fail("WebSocket GET required.",405);

  const {searchParams}=new URL(req.url);
  const token=searchParams.get("access_token")||"";
  const symbol=String(searchParams.get("symbol")||"").trim().toUpperCase();
  if(!symbol) return fail("A Twelve Data symbol is required.",400);
  if(!TWELVE_DATA_API_KEY) return fail("TWELVE_DATA_API_KEY is not configured.",503);
  if(!(await authenticate(token))) return fail("Authenticated GoTradeX session required.",401);
  if(req.headers.get("upgrade")?.toLowerCase()!=="websocket") return fail("WebSocket upgrade required.",426);

  const {socket, response}=Deno.upgradeWebSocket(req);
  let upstream:WebSocket|null=null;
  let heartbeat:number|undefined;

  socket.onopen=()=>{
    try{
      upstream=new WebSocket(TWELVE_WS+encodeURIComponent(TWELVE_DATA_API_KEY));
      upstream.onopen=()=>{
        upstream?.send(JSON.stringify({action:"subscribe",params:{symbols:symbol}}));
        heartbeat=setInterval(()=>{try{upstream?.send(JSON.stringify({action:"heartbeat"}))}catch(_){}},10000);
      };
      upstream.onmessage=(e)=>{
        try{
          if(socket.readyState===WebSocket.OPEN) socket.send(String(e.data));
        }catch(_){}
      };
      upstream.onerror=()=>{try{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({event:"proxy-status",status:"error",message:"Twelve Data WebSocket error"}))}catch(_){}};
      upstream.onclose=()=>{try{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({event:"proxy-status",status:"closed",message:"Twelve Data stream closed"}))}catch(_){}};
    }catch(e){
      try{if(socket.readyState===WebSocket.OPEN)socket.close(1011,String((e as Error)?.message||e))}catch(_){}
    }
  };
  socket.onmessage=(e)=>{
    try{
      const msg=JSON.parse(String(e.data||"{}"));
      if(msg?.action==="heartbeat") upstream?.send(JSON.stringify({action:"heartbeat"}));
    }catch(_){}
  };
  const cleanup=()=>{
    if(heartbeat)clearInterval(heartbeat);
    try{upstream?.close()}catch(_){}
  };
  socket.onclose=cleanup;
  socket.onerror=cleanup;
  EdgeRuntime.waitUntil(new Promise<void>(resolve=>socket.addEventListener("close",()=>resolve())));
  return response;
});