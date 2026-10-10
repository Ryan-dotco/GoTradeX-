const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "Server is missing OPENAI_API_KEY secret." }, 503);

  try {
    const body = await req.json();
    const image = body?.image_data_url;
    const question = typeof body?.question === "string" ? body.question.slice(0, 4000) : "";
    const mime = typeof body?.mime_type === "string" ? body.mime_type : "";
    if (typeof image !== "string" || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(image)) {
      return json({ error: "Provide a supported image as a base64 data URL (PNG, JPEG, WEBP, or GIF)." }, 400);
    }
    if (image.length > 5_700_000) return json({ error: "Image payload is too large; use an image under 4 MB." }, 413);
    if (mime && !/^image\/(png|jpeg|webp|gif)$/i.test(mime)) return json({ error: "Unsupported image type." }, 400);

    const prompt = question || "Analyze this image and clearly state what can and cannot be determined.";
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_VISION_MODEL") || "gpt-6-astra",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt + "\nBe precise. Do not invent details not visible in the image. If this is a trading chart, explain uncertainty and do not promise profit." },
            { type: "input_image", image_url: image, detail: "high" },
          ],
        }],
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = data?.error?.message || `AI provider returned HTTP ${upstream.status}`;
      return json({ error: message }, 502);
    }
    const analysis = typeof data.output_text === "string" ? data.output_text : "";
    if (!analysis.trim()) return json({ error: "AI provider returned no analysis text." }, 502);
    return json({ analysis, provider: "OpenAI Responses API", model: Deno.env.get("OPENAI_VISION_MODEL") || "gpt-6-astra" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
