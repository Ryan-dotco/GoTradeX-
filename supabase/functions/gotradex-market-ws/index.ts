import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers });
  return new Response(JSON.stringify({
    ok: false,
    provider: "NONE",
    code: "UNVERIFIED_PROVIDER_DISABLED",
    error: "The Twelve Data WebSocket adapter is disabled. Use verified Deriv forex/OTC feeds or Bybit crypto feeds."
  }), { status: 410, headers });
});
