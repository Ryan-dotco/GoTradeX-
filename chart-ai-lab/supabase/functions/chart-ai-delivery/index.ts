const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const body = await req.json();
    const channel = body?.channel;
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 3000) : "";
    if (!["telegram", "whatsapp"].includes(channel)) return json({ error: "channel must be telegram or whatsapp" }, 400);
    if (!message) return json({ error: "message is required" }, 400);

    if (channel === "telegram") {
      const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
      const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
      if (!token || !chatId) return json({ error: "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as server-side secrets." }, 503);
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.ok !== true) return json({ error: data?.description || `Telegram returned HTTP ${r.status}` }, 502);
      return json({ ok: true, channel: "telegram", delivered: true });
    }

    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const to = Deno.env.get("WHATSAPP_TO");
    const version = Deno.env.get("WHATSAPP_API_VERSION") || "v23.0";
    if (!token || !phoneId || !to) return json({ error: "WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_TO as server-side secrets." }, 503);
    const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: message } }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(data?.messages) || !data.messages.length) return json({ error: data?.error?.message || `WhatsApp returned HTTP ${r.status}` }, 502);
    return json({ ok: true, channel: "whatsapp", delivered: true, message_id: data.messages[0].id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
