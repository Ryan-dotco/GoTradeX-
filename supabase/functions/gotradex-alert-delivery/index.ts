import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://glffecggusetzklmyukv.supabase.co";
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGINS = new Set(["https://ryan-dotco.github.io", "https://raw.githack.com"]);

const json = (body: unknown, status = 200, origin = "") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://ryan-dotco.github.io",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  }
});

function text(value: unknown, max = 180) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

async function currentUser(token: string) {
  if (!token || !PUBLISHABLE_KEY) return null;
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: "Bearer " + token },
    cache: "no-store"
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

async function isAdmin(userId: string) {
  if (!SERVICE_ROLE_KEY) throw new Error("Server authorization is not configured.");
  const url = SUPABASE_URL + "/rest/v1/admin_users?select=user_id&user_id=eq." + encodeURIComponent(userId);
  const response = await fetch(url, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: "Bearer " + SERVICE_ROLE_KEY },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Could not verify administrator permissions.");
  const rows = await response.json();
  return Array.isArray(rows) && rows.some((row: { user_id?: string }) => row.user_id === userId);
}

function signalMessage(signal: Record<string, unknown> | null, action: string) {
  if (action === "test") return "GoTradeX bot connection test. This is a test message, not a trade signal.";
  const direction = text(signal?.signal, 8).toUpperCase();
  if (direction !== "BUY" && direction !== "SELL") throw new Error("Only qualifying BUY or SELL signals can be delivered. WAIT is never sent.");
  const asset = text(signal?.asset, 50);
  const timeframe = text(signal?.timeframe, 20);
  const expiry = text(signal?.expiry, 20);
  const entry = text(signal?.entry, 40);
  const momentum = text(signal?.momentum, 30);
  const reason = text(signal?.reason, 240);
  if (!asset || !entry || !timeframe) throw new Error("Signal is missing its asset, entry, or timeframe.");
  return [
    "GoTradeX · VERIFIED MARKET SIGNAL",
    "",
    (direction === "BUY" ? "🟢 BUY" : "🔴 SELL") + " · " + asset,
    "Entry: " + entry,
    "Timeframe: " + timeframe,
    "Expiration: " + (expiry || "Not specified"),
    "Momentum: " + (momentum || "Not specified"),
    "Provider: " + text(signal?.provider, 30) + (text(signal?.mode, 10) === "OTC" ? " · OTC" : ""),
    "Reason: " + (reason || "Technical conditions met."),
    "",
    "Technical signal only; not financial advice."
  ].join("\n");
}

async function sendTelegram(message: string) {
  const token = Deno.env.get("GTX_TELEGRAM_BOT_TOKEN") || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const chatId = Deno.env.get("GTX_TELEGRAM_CHAT_ID") || Deno.env.get("TELEGRAM_CHAT_ID") || "";
  if (!token || !chatId) return { configured: false, ok: false, message: "Telegram bot token or chat ID is missing from server secrets." };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) return { configured: true, ok: false, message: "Telegram rejected the message. Check bot token, chat ID, and that the bot has been started." };
    return { configured: true, ok: true, message: "Telegram confirmed delivery." };
  } catch (_) {
    return { configured: true, ok: false, message: "Telegram request failed or timed out." };
  }
}

async function sendWhatsApp(message: string) {
  const phone = Deno.env.get("GTX_CALLMEBOT_PHONE") || Deno.env.get("CALLMEBOT_PHONE") || "";
  const apiKey = Deno.env.get("GTX_CALLMEBOT_API_KEY") || Deno.env.get("CALLMEBOT_API_KEY") || "";
  if (!phone || !apiKey) return { configured: false, ok: false, message: "CallMeBot phone or API key is missing from server secrets." };
  try {
    const url = new URL("https://api.callmebot.com/whatsapp.php");
    url.searchParams.set("phone", phone);
    url.searchParams.set("text", message);
    url.searchParams.set("apikey", apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(url.toString(), { method: "GET", cache: "no-store", signal: controller.signal });
    const body = (await response.text().catch(() => "")).toLowerCase();
    clearTimeout(timeout);
    if (!response.ok || /invalid api key|not authorized|error:|failed/.test(body)) {
      return { configured: true, ok: false, message: "CallMeBot did not confirm delivery. Check the authorized phone and API key." };
    }
    return { configured: true, ok: true, message: "CallMeBot accepted the request." };
  } catch (_) {
    return { configured: true, ok: false, message: "CallMeBot request failed or timed out." };
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ ok: false, error: "POST required." }, 405, origin);

  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const user = await currentUser(token);
    if (!user) return json({ ok: false, error: "A valid signed-in GoTradeX session is required." }, 401, origin);
    if (!(await isAdmin(user.id))) return json({ ok: false, error: "Only an authorized GoTradeX administrator may use the global bot delivery connection." }, 403, origin);

    const body = await request.json().catch(() => ({}));
    const action = text(body?.action, 20).toLowerCase();
    if (action !== "signal" && action !== "test") return json({ ok: false, error: "Unsupported delivery action." }, 400, origin);
    let message = "";
    try { message = signalMessage(body?.signal && typeof body.signal === "object" ? body.signal : null, action); }
    catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Invalid signal." }, 400, origin); }

    const results = await Promise.all([sendTelegram(message), sendWhatsApp(message)]);
    const channels = { telegram: results[0], whatsapp: results[1] };
    const delivered = results.some(result => result.ok);
    const configured = results.some(result => result.configured);
    return json({
      ok: delivered,
      configured,
      action,
      channels,
      error: delivered ? null : configured ? "No channel confirmed delivery. Check the channel status and provider credentials." : "No bot channel is configured on the server."
    }, 200, origin);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Delivery failed." }, 500, origin);
  }
});
