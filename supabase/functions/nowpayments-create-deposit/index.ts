// Testing-only NOWPayments invoice creation. Deploy only to an isolated test Supabase project.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const allowedCurrencies = new Set(
  (Deno.env.get("NOWPAYMENTS_ALLOWED_CURRENCIES") ?? "btc,eth,ltc,usdttrc20,usdterc20,usdc").split(",")
    .map((x) => x.trim().toLowerCase()).filter(Boolean),
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
  const appUrl = Deno.env.get("GOTRADEX_PUBLIC_APP_URL");
  const ipnUrl = Deno.env.get("GOTRADEX_NOWPAYMENTS_IPN_URL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey || !appUrl || !ipnUrl || !supabaseUrl || !anonKey || !serviceKey) {
    return json(503, { error: "funding_backend_not_configured" });
  }
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(401, { error: "authentication_required" });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json(401, { error: "authentication_required" });

    const body = await req.json();
    const amount = Number(body?.amount_usd);
    const payCurrency = String(body?.pay_currency ?? "").trim().toLowerCase();
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== amount * 100 || amount < 10 || amount > 100000) {
      return json(400, { error: "invalid_deposit_amount" });
    }
    if (!allowedCurrencies.has(payCurrency) || !/^[a-z0-9]{2,20}$/.test(payCurrency)) {
      return json(400, { error: "unsupported_payment_currency" });
    }

    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const internalOrderId = crypto.randomUUID();
    const { error: insertError } = await service.from("gotradex_nowpayments_orders").insert({
      user_id: userData.user.id,
      internal_order_id: internalOrderId,
      expected_usd: amount,
      expected_pay_currency: payCurrency,
      status: "creating",
      safe_metadata: { created_by: "nowpayments-create-deposit", schema_version: 1 },
    });
    if (insertError) {
      console.error("NOWPayments order insert failed", insertError.code);
      return json(503, { error: "deposit_order_unavailable" });
    }

    const response = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: "usd",
        pay_currency: payCurrency,
        order_id: internalOrderId,
        order_description: "GoTradeX account funding",
        ipn_callback_url: ipnUrl,
        success_url: new URL("/scanner-pro-funding/?funding=return", appUrl).toString(),
        cancel_url: new URL("/scanner-pro-funding/?funding=cancelled", appUrl).toString(),
      }),
    });
    const provider = await response.json().catch(() => ({}));
    if (!response.ok || typeof provider?.invoice_url !== "string" ||
        !provider.invoice_url.startsWith("https://") || typeof provider?.id !== "string") {
      await service.from("gotradex_nowpayments_orders").update({
        status: "failed", updated_at: new Date().toISOString(),
        safe_metadata: { failure: "provider_invoice_creation_failed", provider_http_status: response.status },
      }).eq("internal_order_id", internalOrderId);
      console.error("NOWPayments invoice creation failed", response.status);
      return json(502, { error: "invoice_creation_failed" });
    }
    const { error: updateError } = await service.from("gotradex_nowpayments_orders").update({
      provider_invoice_id: provider.id,
      invoice_url: provider.invoice_url,
      status: "waiting",
      updated_at: new Date().toISOString(),
      safe_metadata: { provider: "nowpayments", invoice_created: true },
    }).eq("internal_order_id", internalOrderId);
    if (updateError) {
      console.error("NOWPayments order update failed", updateError.code);
      return json(503, { error: "deposit_order_update_failed" });
    }
    return json(200, {
      order_id: internalOrderId,
      invoice_url: provider.invoice_url,
      expected_usd: amount,
      pay_currency: payCurrency,
      status: "waiting",
    });
  } catch {
    return json(400, { error: "invalid_request" });
  }
});
