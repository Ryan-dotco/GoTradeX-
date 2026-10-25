# GoTradeX Withdrawal Fee Backend Review — Testing Only

Status: READ-ONLY BACKEND SAFEGUARD REVIEW COMPLETE. No database writes, migration deployments, withdrawal requests, or payout submissions were performed.

## Confirmed UI preview checks

- $10.00 gross → $0.50 fee → $9.50 net.
- $20.00 gross → $1.00 fee → $19.00 net.
- The standalone arithmetic checks also cover awkward cent values and larger amounts.
- These checks validate arithmetic only, not live backend enforcement.

## Backend findings

- The withdrawal function is `public.gotradex_request_withdrawal(numeric, text)`.
- It checks the $10.00 minimum, requires a nonblank wallet address, locks the wallet row, checks wallet status and available withdrawable profit, and blocks a second pending request.
- It calculates fee and net amount from `public.gotradex_platform_finance.withdrawal_fee_pct`.
- The live finance setting was read as `withdrawal_fee_pct = 1.000`, so production backend configuration does not match the 5% UI preview.
- The `gotradex_withdrawals` table has constraints for gross amount >= $10, fee >= $0, net amount >= $0, and valid withdrawal statuses.
- The `gotradex_withdrawal_security_guard` trigger runs before insert and status updates. Its trigger function checks `profiles.withdrawal_frozen_until` and `profiles.account_frozen_at` for pending, approved, or paid states.
- Wallet balance fields have nonnegative constraints, and wallet transaction types are constrained to an allowed list.
- Read-only policy/constraint inspection returned table constraints. It did not return policy rows for the four inspected tables in that query; this alone is not proof that all access paths are secure. RLS enablement, grants, and all API execution paths still need a separate focused audit before enabling withdrawals.

## Critical warning: never use production withdrawal function as a test

Calling `gotradex_request_withdrawal` can deduct the gross amount from withdrawable profit, create a real pending withdrawal, and create wallet ledger entries. Do not invoke it against production for validation.

## Required before real withdrawals can be enabled

1. Change the backend finance setting to 5.000 only through an explicitly approved, reviewed migration/change window. No such change has been made.
2. Keep the minimum withdrawal at $10.00 and verify the function and database constraints agree.
3. Verify the fee and net amount are consistently recorded in withdrawal and ledger rows.
4. Confirm rejection paths produce no withdrawal/ledger rows and no balance changes.
5. Confirm duplicate pending requests are blocked under concurrent requests.
6. Confirm account and withdrawal freezes work on all relevant transitions.
7. Audit RLS enablement, grants, function execute privileges, and direct API write paths.
8. Run end-to-end tests only in an already-existing, free, isolated database that cannot affect real user balances. Do not create a paid Supabase branch/project. If no safe isolated database exists, keep payouts disabled.
9. Keep the UI payout action disabled until backend verification is complete and explicitly approved.

## Zero-cost/protection boundaries

- Changes in this document are Testing-branch documentation only.
- No Supabase branch/project was created.
- No live SQL writes, configuration updates, migrations, balance mutations, or payout submissions were performed.
- Vault and Main remain untouched.
- No paid resources are to be created or used.

## Current verdict

NOT READY FOR LIVE WITHDRAWALS. The preview math is correct, but production fee configuration remains 1%, and end-to-end backend enforcement has not been verified. Maintain preview-only mode.
