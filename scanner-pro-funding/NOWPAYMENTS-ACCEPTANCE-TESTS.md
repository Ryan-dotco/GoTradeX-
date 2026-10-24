# NOWPayments Testing-only acceptance checklist

This is a test plan, not evidence that any case has passed. Run only against an isolated Supabase test project with test credentials and a provider sandbox/test mode if available. Never use real funds during these tests.

## Safety gates
- [ ] Confirm Supabase project is an isolated test project; confirm project ref before applying migration.
- [ ] Configure secrets through the Supabase secret manager only: NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, GOTRADEX_PUBLIC_APP_URL, GOTRADEX_NOWPAYMENTS_IPN_URL, NOWPAYMENTS_ALLOWED_CURRENCIES.
- [ ] Confirm public app URL and IPN URL are HTTPS and point to Testing only.
- [ ] Confirm live trading/order execution remains disabled.
- [ ] Review migration against actual wallet, wallet transaction, deposit and finance schemas before applying.
- [ ] Do not enable funding in the UI until every required test below is recorded with evidence.

## Invoice creation
- [ ] Unauthenticated request returns 401 and creates no order.
- [ ] Authenticated user creates an order bound to the authenticated UUID, ignoring any client-supplied user_id.
- [ ] Amount below USD 10, over USD 100,000, nonnumeric, NaN, Infinity, and excessive decimal precision are rejected.
- [ ] Unsupported currency/network is rejected server-side.
- [ ] Provider/API timeout or non-2xx response creates no usable invoice and exposes no provider body, key, or secret.
- [ ] Invoice URL is HTTPS and provider-issued; browser return/cancel never credits funds.
- [ ] No API key or IPN secret appears in browser bundles, repository, response bodies, or logs.

## Webhook authentication and provider validation
- [ ] Missing signature is rejected.
- [ ] Invalid HMAC-SHA512 signature is rejected and no wallet/order is credited.
- [ ] Correct signature using recursively sorted JSON is accepted for processing.
- [ ] Unknown internal order, unknown payment ID, wrong order_id, wrong price currency, wrong expected USD amount, wrong pay currency, and provider lookup failure are sent to manual review/no credit.
- [ ] Pending, waiting, confirming, confirmed, expired, cancelled, and failed callbacks never credit.
- [ ] Finished status is confirmed by server-to-server NOWPayments lookup before settlement.
- [ ] Underpayment is not credited; overpayment is held for manual review.
- [ ] Provider payment ID cannot be attached to two orders.

## Exactly-once / concurrency
- [ ] Replaying the same signed callback does not create a second credit.
- [ ] Sending semantically identical callbacks with different JSON key ordering does not create a second credit.
- [ ] Fire at least 20 concurrent callbacks for one finished payment; exactly one wallet transaction and one balance increase must result.
- [ ] A second order attempting to use the same provider payment ID fails the unique constraint and does not credit.
- [ ] Callback retry after temporary DB/API outage safely completes once when retried.
- [ ] Out-of-order pending callback after settlement does not downgrade settled status.
- [ ] Verify order, wallet balance, wallet transaction, deposit row, event row and settlement timestamp agree.

## Review before merge/deploy
- [ ] Validate actual wallet transaction column names and constraints against this draft.
- [ ] Confirm configured NOWPayments endpoint/response schema against current provider documentation and test environment.
- [ ] Confirm provider status mapping and under/overpayment policy with the account's supported payment flow.
- [ ] Run SQL lint/parse and Deno type-check; execute integration tests against isolated test data.
- [ ] Confirm no code path activates AutoBot, places an order, or changes live-order settings.
- [ ] Record test output and reviewer approval. Keep live funding disabled until all items pass.

## Known draft limitation
The migration/function code has not been applied or executed. It must be schema-reviewed and tested before deployment; a Git commit is not proof of a safe settlement path.
