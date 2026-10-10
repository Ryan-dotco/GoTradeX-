# GoTradeX Chart AI Lab backend setup

This directory belongs to the isolated `chart-ai-lab` branch. It is not deployed by editing the main app and does not place trades.

## Functions included

- `chart-ai-vision`: sends a selected image to the OpenAI Responses API and returns visual analysis.
- `chart-ai-delivery`: sends a test/text message to one fixed Telegram chat or WhatsApp recipient configured as server-side secrets.

## Important security rules

- Never commit real API keys, bot tokens, WhatsApp access tokens, or Supabase secret/service-role keys.
- Set credentials under Supabase Dashboard → Edge Functions → Secrets (or with the Supabase CLI).
- Keep Edge Function JWT verification enabled. These functions expect a valid Supabase user access token in the `Authorization: Bearer ...` header, in addition to the project's publishable/anon `apikey`.
- The standalone HTML test page now includes Supabase email/password sign-in and holds the returned access token in memory only. Enter the GoTradeX test project's URL, publishable/anon key, and your existing Supabase account credentials. The page clears the password field after sign-in. Do not turn JWT verification off on a billable AI endpoint.
- For a production deployment, restrict CORS to the actual deployed site origin and add per-user rate limits/usage controls.
- Telegram/WhatsApp credentials are intentionally not entered into the HTML page. The delivery function sends only to fixed recipients held in server secrets.

## Required secrets

For image analysis:
- `OPENAI_API_KEY`
- Optional: `OPENAI_VISION_MODEL` (defaults to `gpt-6-astra`)

For Telegram:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

For WhatsApp Cloud API:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TO` (recipient number in international format, usually digits only)
- Optional: `WHATSAPP_API_VERSION` (defaults to `v23.0`)

## Configure and deploy

These function files are committed to the isolated GitHub test branch only. They have not been deployed to any Supabase project. Before deploying, confirm the intended test project; do not deploy these functions to production without an explicit decision. Install/use the Supabase CLI from a local checkout of this branch, link the intended test project, set the secrets in the Dashboard or CLI, then deploy both functions:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set OPENAI_API_KEY=YOUR_KEY
supabase secrets set TELEGRAM_BOT_TOKEN=YOUR_TOKEN TELEGRAM_CHAT_ID=YOUR_CHAT_ID
supabase secrets set WHATSAPP_ACCESS_TOKEN=YOUR_TOKEN WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_ID WHATSAPP_TO=YOUR_TEST_RECIPIENT
supabase functions deploy chart-ai-vision
supabase functions deploy chart-ai-delivery
```

Do not place real values in a committed file or paste them into a public issue. Verify the Supabase project and test recipient before sending messages.

## Market-data providers

The HTML lab uses public Bybit spot Kline data for crypto symbols and Deriv public historical candles for supported forex symbols. These are public market-data connections only; they do not connect a trading account, authenticate a Bybit/Deriv account, or enable live orders. The page must show a successful timestamped candle response before analysis is possible.
