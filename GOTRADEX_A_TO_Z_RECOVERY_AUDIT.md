# GoTradeX A-to-Z Recovery Audit
Date: 2026-10-17
Target branch: repair/gotradex-a-to-z-recovery-2026-10-17
Baseline: main (read-only; no changes made to main)

## Confirmed findings from repository/backend inspection

1. The main dashboard is a very large single HTML file with many inline runtime patches and button handlers. Presence of a button or handler does not prove its action works end-to-end.
2. The current main HTML has no Telegram Bot API URL, Telegram bot-token setting, Telegram chat-ID setting, CallMeBot API URL, or WhatsApp webhook setting. The current social-share grid is referral-link sharing, not automated trading-signal delivery.
3. The earlier `stable-approved` implementation has a substantial `script.js` with admin controls and connection settings, but its Telegram/WhatsApp fields are webhook URLs and its text says the automation backend must be ready. It is a recovery reference, not proof of a complete working integration.
4. The current deployed Supabase function `gotradex-chart-vision` returns HTTP 410 / `CHART_AI_RESET`; screenshot analysis is disabled at the backend.
5. The current `gotradex-market-data` function contains a Twelve Data dependency for non-crypto data, contrary to the user's no-Twelve-Data constraint.
6. The current `gotradex-otc-engine` code derives OTC prices and candles deterministically from constants/hash functions. Those values must not be labelled verified live market prices.
7. Supabase has deployed market-data, OTC, trade-engine, scheduler, Bybit, Deriv test/OAuth, and other functions. Deployed status alone is not a functional test.
8. Backup references exist for portal audit, social sharing, Chat AI image scanning, chart/market repairs, profile/wallet, settings, and other changes. Restore individual features by comparing behavior; do not replace the whole main UI with an old branch.

## Recovery order

- Preserve main. All fixes stay on this recovery branch until tested and approved.
- Restore and test navigation/portal routing and every admin section/button; distinguish UI-only/localStorage controls from backend-backed actions and label unavailable server actions honestly.
- Restore the prior screenshot/share portal and wire actual image analysis through a verified no-cost Gemini option only if its free quota/key is available; do not substitute a fabricated signal or paid provider.
- Reconnect Telegram bot delivery and the existing CallMeBot WhatsApp destination without exposing credentials in public source. Verify actual send responses before showing “connected”. Restore Viber/other share destinations as share intents/links where supported; don't promise automatic bot delivery where no bot/API exists.
- Remove Twelve Data dependence from the live feed path and use only provider-confirmed Deriv/Bybit feeds for supported symbols. Mark unavailable symbols unavailable; never substitute generated OTC candles as live data.
- Test forex, crypto, indices, commodities, OTC, charts, trade markers, AutoBot, wallet, registration/profile, settings/security, admin, sharing, and alerts in a regression matrix.
- Verify deployment/publication configuration only after the recovery candidate passes checks. Do not merge to main without user approval.

## Verification status

This is an initial source audit, not a completed repair. No live Telegram send, WhatsApp send, screenshot-analysis request, market-feed request, browser interaction test, or production publish has been claimed as successful.
