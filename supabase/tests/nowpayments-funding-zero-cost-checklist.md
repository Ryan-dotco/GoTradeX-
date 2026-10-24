# NOWPayments funding — zero-cost test checklist

Scope: Testing branch only. No production deployment, production SQL, live trading, or real wallet crediting.

## UI/API contract
- [x] Funding page sends `amount_usd` and `pay_currency`, matching the Edge Function request contract.
- [x] UI rejects amounts below USD 10, over USD 100,000, and amounts with more than two decimal places.
- [x] UI accepts only HTTPS checkout URLs hosted by `nowpayments.io` or its subdomains.
- [ ] Browser test on phone: form layout and error states.
- [ ] Verify missing auth returns a clear error and no invoice is created.
- [ ] Verify missing service configuration returns unavailable and no invoice is created.

## Backend and database — NOT YET VERIFIED
- [ ] Confirm wallet table has a unique constraint on `user_id` before using `ON CONFLICT (user_id)`.
- [ ] Review the existing Supabase `config.toml` before merging any function config; preserve all existing function settings.
- [ ] Review migration against current table constraints and transaction semantics.
- [ ] Run Deno type checks and unit tests for invoice creation and IPN signature verification.
- [ ] Verify NOWPayments signature algorithm and payment response fields against current official documentation.
- [ ] Test duplicate, out-of-order, underpaid, overpaid, expired, mismatched-currency, mismatched-order, and unknown-order events.
- [ ] Prove two concurrent callbacks cannot credit the same provider payment twice.
- [ ] Verify wallet credit, wallet transaction, deposit ledger, and order settlement commit or roll back atomically.
- [ ] Verify funding never enables or places trades.

## Activation gate
No deployment or real deposits until all backend checks pass, the owner configures NOWPayments secrets privately, and an isolated backend is available at zero cost. Do not paste API keys or IPN secrets into chat. Do not use the existing GoTradeX production Supabase project for experiments.
