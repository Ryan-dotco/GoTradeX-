import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers });
  return new Response(JSON.stringify({
    ok: false,
    provider: "NONE",
    code: "SYNTHETIC_MARKET_DISABLED",
    error: "Synthetic OTC price and candle generation has been disabled. Use a verified Deriv feed; unsupported symbols remain unavailable."
  }), { status: 410, headers });
});
