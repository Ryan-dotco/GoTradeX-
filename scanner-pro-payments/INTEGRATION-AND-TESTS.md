# GoTradeX — NOWPayments account funding (Testing branch)

## Correct product scope
- GoTradeX is intended to remain free to use. There is no paid AI OTC Scanner Pro subscription and no paid-access voucher in this scope.
- NOWPayments is the cryptocurrency deposit gateway for users funding their own GoTradeX trading accounts.
- This isolated Testing portal does not enable live trading and must not be merged into Vault/Main without explicit owner approval.
- The portal is a shell only. It fails closed until authenticated backend integration is configured.

## Frontend contract
The page expects the existing GoTradeX sign-in integration to expose `window.GOTRADEX_AUTH.getAccessToken()`. This is an integration seam, not an implemented auth system. Deposit requests send the session bearer token to:
`POST /functions/v1/nowpayments-create-deposit`
with `{ amount, asset, quote_currency: "usd" }`.
The browser must never supply a user ID or email to choose the destination account. The server derives the user from the validated auth token, checks deposit limits and allow-listed currencies/networks, calculates the quote using server-side rules, creates the NOWPayments invoice and associates its unique internal order ID with that authenticated user. Do not trust client-supplied amounts as authoritative; validate and quote them server-side.

## Required server-side components (not deployed)
1. `nowpayments-create-deposit`: require a valid authenticated GoTradeX/Supabase session; reject anonymous requests; allow-list currencies/networks; apply minimum/maximum limits and abuse protection; create invoice with a unique internal deposit/order ID; persist a pending deposit record before returning a validated HTTPS provider invoice URL.
2. `nowpayments-ipn`: verify NOWPayments IPN signature using the server-side IPN secret (HMAC-SHA512 over the correctly sorted payload as specified by current provider docs); validate order association, provider invoice ID, amount, currency/network, and allowed final status; persist provider events idempotently. Never credit an account from a browser redirect.
3. Account ledger credit: credit only a provider-confirmed deposit, exactly once, in a database transaction guarded by unique provider event/order constraints. Store amount, asset, network, transaction reference, user ID, status and timestamps in an auditable ledger. Handle underpaid, overpaid, failed, expired, pending, duplicate and out-of-order events explicitly.
4. Account balance: derive from or reconcile against an append-only ledger; do not directly trust client-side balance values. Never edit existing wallet/trading tables without review of their current schema and behavior.
5. Automation: a confirmed deposit does not automatically activate live trading. Require explicit user authorization, risk controls and the existing platform's order-enable safeguards.

## Proposed schema (design only; not applied)
- `funding_deposits`: internal UUID, auth user ID, expected fiat amount/currency, expected crypto asset/network, provider invoice ID, internal order reference, state, created/updated timestamps.
- `funding_provider_events`: unique event/idempotency key, internal order reference, provider status, received timestamp, safe diagnostic metadata.
- `account_ledger_entries`: account/user ID, deposit reference, asset/network, crypto amount, valuation snapshot if used, entry type, unique idempotency key, created timestamp.
All exposed tables require suitable RLS/ownership policies. Provider secrets and privileged database keys stay server-side. Any privileged database function must be narrowly scoped, authenticated/verified and reviewed before deployment.

## Acceptance tests before enabling real deposits
1. Unauthenticated request rejected without creating an invoice.
2. Authenticated user receives an invoice associated only with their own account.
3. Invalid amount, unsupported coin/network and values outside configured limits rejected.
4. Correct signed final provider notification credits exactly once.
5. Invalid signature, wrong invoice/order, wrong amount/currency/network, pending, failed, expired and underpaid notifications do not credit funds.
6. Duplicate and out-of-order notifications do not duplicate credits or corrupt balances.
7. Two accounts cannot read or alter each other's deposit/ledger records.
8. Replay and concurrent notification tests show one credit only.
9. Provider credentials are stored only in server secrets; repository and frontend scans show no secrets.
10. Record end-to-end test evidence before enabling production deposits.

## Status (verified as of this branch update)
- Previous subscription/voucher screen is being replaced with a funding-focused Testing screen.
- NOWPayments account credentials have not been configured by this implementation.
- Funding endpoint and webhook are not deployed by this implementation.
- No database migration has been applied.
- No live deposit or end-to-end credit test has passed.
- Vault and Main have not been changed.
