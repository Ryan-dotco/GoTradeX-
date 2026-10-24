// Testing-only NOWPayments IPN receiver. Never deploy until migration reviewed/applied to isolated test DB.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });
function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortRecursively((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a.toLowerCase());
  const bb = new TextEncoder().encode(b.toLowerCase());
  let diff = aa.length ^ bb.length;
  const max = Math.max(aa.length, bb.length);
  for (let i = 0; i < max; i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
async function verifySignature(body: unknown, signature: string, secret: string): Promise<boolean> {
  const canonical = JSON.stringify(sortRecursively(body));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical)));
  return safeEqual(hex(digest), signature);
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const secret = Deno.env.get("NOWPAYMENTS_IPN_SECRET");
  const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !apiKey || !url || !serviceKey) return reply(503, { error: "ipn_not_configured" });

  let event: Record<string, unknown>;
  try {
    event = await req.json();
    if (!event || typeof event !== "object" || Array.isArray(event)) return reply(400, { error: "invalid_event" });
  } catch {
    return reply(400, { error: "invalid_event" });
  }
  const signature = req.headers.get("x-nowpayments-sig") ?? "";
  if (!signature || !(await verifySignature(event, signature, secret))) {
    // Do not log the body, signature, or secrets.
    return reply(401, { error: "invalid_signature" });
  }
  const paymentId = String(event.payment_id ?? "").trim();
  const internalOrderId = String(event.order_id ?? "").trim();
  const status = String(event.payment_status ?? "").trim().toLowerCase();
  if (!paymentId || !internalOrderId) return reply(400, { error: "missing_payment_reference" });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const fingerprintBytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(JSON.stringify(sortRecursively(event))),
  ));
  const fingerprint = hex(fingerprintBytes);
  const { error: eventInsertError } = await supabase.from("gotradex_nowpayments_events").insert({
    provider_payment_id: paymentId,
    event_fingerprint: fingerprint,
    event_status: status,
    signature_valid: true,
    safe_metadata: { event_keys: Object.keys(event).sort() },
  });
  if (eventInsertError?.code === "23505") return reply(200, { received: true, result: "duplicate_event" });
  if (eventInsertError) {
    console.error("NOWPayments event ledger unavailable", eventInsertError.code);
    return reply(503, { error: "event_record_unavailable" });
  }

  const { data: order, error: orderError } = await supabase.from("gotradex_nowpayments_orders")
    .select("id,internal_order_id,user_id,expected_usd,expected_pay_currency,provider_payment_id,status")
    .eq("internal_order_id", internalOrderId).maybeSingle();
  if (orderError || !order) {
    await supabase.from("gotradex_nowpayments_events").update({
      handled_at: new Date().toISOString(), handling_result: "unknown_order",
    }).eq("event_fingerprint", fingerprint);
    return reply(200, { received: true, result: "manual_review" });
  }
  if (order.status === "settled" && order.provider_payment_id === paymentId) {
    await supabase.from("gotradex_nowpayments_events").update({
      handled_at: new Date().toISOString(), handling_result: "already_settled",
    }).eq("event_fingerprint", fingerprint);
    return reply(200, { received: true, result: "already_settled" });
  }
  if (order.provider_payment_id && order.provider_payment_id !== paymentId) {
    await supabase.from("gotradex_nowpayments_orders").update({ status: "manual_review", updated_at: new Date().toISOString() })
      .eq("id", order.id);
    await supabase.from("gotradex_nowpayments_events").update({
      handled_at: new Date().toISOString(), handling_result: "payment_id_mismatch",
    }).eq("event_fingerprint", fingerprint);
    return reply(200, { received: true, result: "manual_review" });
  }

  // Out-of-order/nonterminal notifications are recorded but never credit a wallet.
  if (status !== "finished") {
    const next = status === "expired" ? "expired" : status === "failed" ? "failed" :
      status === "confirming" ? "confirming" : status === "confirmed" ? "confirmed" :
      status === "waiting" ? "waiting" : "manual_review";
    if (order.status !== "settled") {
      await supabase.from("gotradex_nowpayments_orders").update({
        status: next, provider_payment_id: paymentId, provider_payment_status: status,
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).neq("status", "settled");
    }
    await supabase.from("gotradex_nowpayments_events").update({
      handled_at: new Date().toISOString(), handling_result: next,
    }).eq("event_fingerprint", fingerprint);
    return reply(200, { received: true, result: next });
  }

  // Verify the payment directly with NOWPayments; webhook fields alone cannot authorize credit.
  const verifyResponse = await fetch(`https://api.nowpayments.io/v1/payment/${encodeURIComponent(paymentId)}`, {
    headers: { "x-api-key": apiKey },
  });
  const payment = await verifyResponse.json().catch(() => ({}));
  if (!verifyResponse.ok || String(payment?.payment_id ?? "") !== paymentId) {
    await supabase.from("gotradex_nowpayments_orders").update({ status: "manual_review", updated_at: new Date().toISOString() })
      .eq("id", order.id).neq("status", "settled");
    await supabase.from("gotradex_nowpayments_events").update({
      handled_at: new Date().toISOString(), handling_result: "provider_verification_unavailable",
    }).eq("event_fingerprint", fingerprint);
    return reply(200, { received: true, result: "manual_review" });
  }
  const providerStatus = String(payment.payment_status ?? "").toLowerCase();
  const providerOrder = String(payment.order_id ?? "");
  const priceAmount = Number(payment.price_amount);
  const priceCurrency = String(payment.price_currency ?? "").toLowerCase();
  const payAmount = Number(payment.pay_amount);
  const payCurrency = String(payment.pay_currency ?? "").toLowerCase();
  const actuallyPaid = Number(payment.actually_paid);
  const actuallyPaidCurrency = String(payment.pay_currency ?? "").toLowerCase();
  if (providerStatus !== "finished" || providerOrder !== internalOrderId ||
      !Number.isFinite(priceAmount) || !Number.isFinite(payAmount) || !Number.isFinite(actuallyPaid)) {
    await supabase.from("gotradex_nowpayments_orders").update({ status: "manual_review", provider_payment_id: paymentId,
      provider_payment_status: providerStatus, updated_at: new Date().toISOString() })
      .eq("id", order.id).neq("status", "settled");
    await supabase.from("gotradex_nowpayments_events").update({
      handled_at: new Date().toISOString(), handling_result: "provider_data_mismatch",
    }).eq("event_fingerprint", fingerprint);
    return reply(200, { received: true, result: "manual_review" });
  }
  const { error: readyError } = await supabase.from("gotradex_nowpayments_orders").update({
    status: "confirmed", provider_payment_id: paymentId, provider_payment_status: providerStatus,
    provider_price_amount: priceAmount, provider_price_currency: priceCurrency,
    provider_pay_amount: payAmount, provider_pay_currency: payCurrency,
    provider_actually_paid: actuallyPaid, provider_actually_paid_currency: actuallyPaidCurrency,
    updated_at: new Date().toISOString(),
  }).eq("id", order.id).neq("status", "settled");
  if (readyError) {
    console.error("NOWPayments order verification update failed", readyError.code);
    return reply(503, { error: "settlement_temporarily_unavailable" });
  }
  const { data: settlement, error: settleError } = await supabase.rpc("gotradex_nowpayments_settle", {
    p_internal_order_id: internalOrderId,
    p_provider_payment_id: paymentId,
    p_price_amount: priceAmount,
    p_price_currency: priceCurrency,
    p_pay_amount: payAmount,
    p_pay_currency: payCurrency,
    p_actually_paid: actuallyPaid,
    p_actually_paid_currency: actuallyPaidCurrency,
    p_safe_metadata: { provider_status: providerStatus, verified_server_to_server: true },
  });
  if (settleError) {
    console.error("NOWPayments settlement did not complete", settleError.code);
    await supabase.from("gotradex_nowpayments_events").update({
      handled_at: new Date().toISOString(), handling_result: "settlement_failed",
    }).eq("event_fingerprint", fingerprint);
    return reply(503, { error: "settlement_temporarily_unavailable" });
  }
  await supabase.from("gotradex_nowpayments_events").update({
    handled_at: new Date().toISOString(), handling_result: String(settlement?.result ?? "processed"),
  }).eq("event_fingerprint", fingerprint);
  return reply(200, { received: true, result: settlement?.result ?? "processed" });
});
