# NOWPayments account-funding backend — Testing only

This is a development specification, not a deployed or live payment integration.

## Required secrets (server-side only)
- NOWPAYMENTS_API_KEY
- NOWPAYMENTS_IPN_SECRET
- GOTRADEX_PUBLIC_APP_URL
- GOTRADEX_NOWPAYMENTS_IPN_URL

Never put these values in browser code, Git, logs, or client-visible errors.

## Before enabling wallet credits
1. Add a dedicated NOWPayments order table with user_id, internal order UUID, provider payment/invoice IDs, expected USD amount, selected pay_currency, provider-reported price/pay amounts and currencies, status, timestamps, and safe metadata.
2. Add database uniqueness constraints for provider payment IDs and internal order IDs. Enforce one settlement per provider payment at the database layer.
3. Restrict table access with RLS: users may read only their own orders; clients must not create, update, or settle orders directly. Only trusted server-side functions may write.
4. Create invoices only for authenticated users. Validate allowed currencies/networks server-side; never trust client-supplied user_id, fee, exchange rate, payment address, or final paid amount.
5. Verify NOWPayments IPN HMAC-SHA512 using the configured IPN secret and recursively sorted JSON, comparing against x-nowpayments-sig with a timing-safe comparison.
6. Fetch payment details from NOWPayments server-to-server where supported; require the expected order, provider payment ID, acceptable terminal status, correct currencies, and sufficient confirmed amount before settlement.
7. Settle through a transaction-safe database function that locks the order and guarantees exactly-once crediting. Never credit from a browser redirect or an unverified webhook.
8. Store event/settlement state and make duplicate or out-of-order callbacks harmless. Reject mismatches and send them to manual review without crediting.
9. Add tests for invalid signatures, duplicate callbacks, concurrent callbacks, wrong user/order, wrong amount/currency, underpayment, overpayment, expired/cancelled payments, and provider/API outages.
10. Keep live orders disabled. A deposit must not activate automated trading or authorize trades.

## Current known blocker
The current generic wallet settlement function is not sufficient by itself to establish exactly-once NOWPayments settlement under concurrency. The database constraints and dedicated order state must be implemented and tested before this is connected.

## Deployment status
No schema migration, secret configuration, Edge Function deployment, invoice creation, wallet credit, Vault update, or Main update has been performed as part of this Testing-only work. Do not enable live funding until all acceptance tests pass.
