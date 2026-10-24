# Commission settlement reconciliation — Testing only

Status: investigation note; no migration applied and no Edge Function deployed.

## Confirmed live finance row (read-only inspection, 2026-10-24)
- `profitable_trade_commission_pct = 10.000`
- `referral_level_1_pct = 10.000`
- `referral_level_2_pct = 2.000`
- `min_deposit = 10.00`
- `min_withdrawal = 10.00`
- `withdrawal_fee_pct = 1.000`

Do not modify these values. The live withdrawal fee is 1%, not the previously mentioned 5%; preserve the current database value unless the owner explicitly authorizes a policy change.

## Referral relationship
- `profiles.referral_code` is nullable text and has a unique constraint.
- `profiles.referred_by` is nullable text, not a declared FK in the inspected constraints.
- Resolve `referred_by` to a profile's `referral_code` with exact, normalized matching and detect missing/self/cyclic links. Do not assume it stores a UUID.

## Critical settlement finding
The current `gotradex-trade-scheduler` writes the result/P&L to `gotradex_user_trades` via an update filtered by `result = OPEN`. That protects the trade row from a simple duplicate update, but it does not atomically create commission ledger rows. Commission rows written separately can be omitted if a later operation fails.

## Required implementation before enabling
1. Inspect the deployed schema and exact constraints for commission and wallet tables in an isolated test project.
2. Add a single database transaction/RPC that locks the open trade, validates eligible settled status and account mode, writes final outcome and commission rows atomically, and returns an idempotent result.
3. Owner reward = 10% of positive realized gross profit, only if this matches the documented policy. Affiliate L1/L2 = 10%/2% of the platform fee, not gross profit. The fee base/rate must be derived from the verified existing server-side policy; never guess or double-charge.
4. Resolve at most two referral ancestors for these two affiliate tiers, with cycle protection. The separate "unlimited admin referral depth" requirement needs a clearly defined owner/admin reward model before coding; do not recursively pay unlimited affiliate rewards by default.
5. Keep demo trades, losses, draws, pending/failed trades, unverified prices, and duplicate settlements out of payable commissions.
6. Add integration tests for win/loss/draw/demo, no referrer, invalid/missing referrer, referral cycle, repeat calls, concurrent calls, and failure rollback.
7. Test webhook retry behavior against the migration in an isolated database before considering deployment.

## Explicit non-actions
No production schema/data/config was changed. No balance, deposit, withdrawal, payout, real order, or Main dashboard behavior was changed. This document does not authorize deployment.
