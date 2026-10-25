# GoTradeX Withdrawal Fee Backend Review — Testing Only

Status: READ-ONLY REVIEW COMPLETE. No database writes were performed.

## Findings

- The UI preview is configured for a 5% fee and passed manual preview checks:
  - $10.00 gross → $0.50 fee → $9.50 net.
  - $20.00 gross → $1.00 fee → $19.00 net.
- The existing backend function is `public.gotradex_request_withdrawal(numeric, text)`.
- The function enforces a minimum gross withdrawal of $10.00, rejects blank wallet addresses, locks the user's wallet row, checks wallet status and available withdrawable profit, and blocks a second pending request.
- The function calculates fee and net amount from `public.gotradex_platform_finance.withdrawal_fee_pct`; it does not hard-code 5%.
- The live finance setting was previously read as `withdrawal_fee_pct = 1.000`. Therefore the live backend configuration does not currently match the 5% UI preview.
- IMPORTANT: calling the withdrawal function creates a real pending withdrawal request and ledger entries and deducts the gross amount from withdrawable profit. Do not call it for testing.

## Zero-cost next action

Do not create a Supabase branch/project, and do not apply SQL to the live project. Before enabling actual withdrawals, use an already-existing free isolated test database if one is available. If none is available, keep payouts disabled.

The intended backend configuration change, for a future explicitly approved migration only, is to set the finance row's `withdrawal_fee_pct` to `5.000` while preserving the existing minimum-withdrawal check and security logic. This is a proposal only; no update statement has been run.

## Acceptance checks before any live enablement

1. Confirm gross $10.00 → fee $0.50 → net $9.50.
2. Confirm gross $20.00 → fee $1.00 → net $19.00.
3. Confirm amounts below $10.00 are rejected.
4. Confirm fee rounding to cents for awkward values (e.g. $123.45 → $6.17 fee → $117.28 net).
5. Confirm a rejected request creates no withdrawal or ledger rows and does not change balances.
6. Confirm one pending request prevents a second request.
7. Confirm withdrawal freeze/security checks still apply.
8. Keep payout submission disabled until these checks can be safely performed without real balance mutations.

## Protection boundaries

- Testing branch documentation only.
- No Vault or Main changes.
- No live SQL writes, migrations, or payout submissions.
- No paid resources.
