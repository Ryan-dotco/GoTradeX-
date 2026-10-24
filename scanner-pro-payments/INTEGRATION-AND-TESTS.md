# AI OTC Scanner Pro — payment integration (Testing branch)

## Current scope
- Payment method: NOWPayments cryptocurrency checkout.
- Voucher method: one-time code, one successful redemption per code.
- This is an isolated Testing-only portal. It does not enable live trading and must not be merged into Vault/Main without owner approval.
- Frontend contains no provider credentials. It calls a backend configured by setting `window.GOTRADEX_PAYMENT_API_BASE` before this page's script runs.

## Important current limitation
The portal UI is a safe integration shell, not a live payment implementation. Until the backend endpoints exist and are deployed, the page intentionally reports that the secure service is not configured. No paid access is granted from a browser redirect or frontend state.

## Required backend contract
### POST /functions/v1/nowpayments-create-invoice
Input: `{ email, plan_days }` where plan_days is an allow-listed duration.
Backend must authenticate/resolve the account, calculate the amount from server-side pricing, create a NOWPayments invoice with a unique internal order ID, and return only a validated HTTPS `invoice_url` plus a non-secret order reference. Store status as pending. Never accept a client-supplied amount or entitlement.

### NOWPayments IPN/webhook
A separate server-side handler must verify the provider's IPN signature using a server-side secret, validate the internal order ID, currency/amount and expected payment status, and process idempotently. Only the provider's confirmed successful/finished state (according to current NOWPayments docs and configured policy) may activate access. Pending, failed, expired, underpaid, mismatched, and duplicate notifications must not grant additional access. Log events without logging secrets.

### POST /functions/v1/redeem-scanner-voucher
Input: `{ email, code }`. Authenticate/resolve the user server-side; normalize code safely; hash/store voucher codes where practical; validate active/expiry/plan duration; atomically mark the voucher redeemed and attach entitlement in one transaction. Enforce a unique redemption record per voucher. A second or concurrent redemption must fail. Never expose the voucher inventory in public APIs.

## Required tables / records (design only; no database migration applied)
- scanner_orders: internal order ID, user ID, plan days, expected amount/currency, provider invoice ID, state, created/updated timestamps, provider event ID or idempotency key.
- scanner_entitlements: user ID, starts_at, expires_at, source (payment/voucher), source ID, created_at.
- scanner_vouchers: code hash, plan days, active/expiry, redeemed_by, redeemed_at.
- scanner_payment_events: unique provider event/idempotency key, order ID, event status, received_at, safe diagnostic metadata.

## Acceptance tests before calling it ready
1. Confirmed test payment activates only the correct plan once.
2. Pending, failed, cancelled, expired, underpaid, wrong-currency and mismatched-amount events do not activate.
3. Duplicate webhook and out-of-order events cannot extend or duplicate entitlement.
4. Invalid/expired/used voucher rejected.
5. Valid voucher grants configured duration once.
6. Concurrent double-redemption yields exactly one success.
7. Unauthenticated access and cross-account entitlement changes are rejected.
8. Secret scanning confirms no provider keys in frontend, repository, logs or responses.
9. End-to-end test receipts/results recorded; no production credentials or real-money checkout used during initial testing.

## Not done yet
- No NOWPayments credentials configured.
- No webhook endpoint deployed.
- No database schema/migration applied.
- No voucher codes generated.
- No end-to-end payment or redemption test passed yet.
