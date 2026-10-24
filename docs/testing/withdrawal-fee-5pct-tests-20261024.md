# Withdrawal fee 5% regression tests — Testing only

Status: test specification and deterministic arithmetic cases. No production writes, database migration, deployment, or payout execution.

## Owner-confirmed rule
Withdrawal fee = 5% of the withdrawal amount submitted (gross withdrawal amount). Net payout = gross amount minus fee. This specification assumes that fee base; verify the existing UI/API contract before implementation if the code currently defines a different base. Never deduct the fee twice.

## Deterministic arithmetic cases
All values are USD, rounded to 2 decimal places using decimal arithmetic (not binary floating point).

| Gross withdrawal | Expected 5% fee | Expected net |
|---:|---:|---:|
| $10.00 | $0.50 | $9.50 |
| $20.00 | $1.00 | $19.00 |
| $50.00 | $2.50 | $47.50 |
| $100.00 | $5.00 | $95.00 |
| $123.45 | $6.17 | $117.28 |
| $999.99 | $50.00 | $949.99 |
| $1,000.00 | $50.00 | $950.00 |

Rounding rule: calculate gross × 0.05, round the fee to cents with the platform's documented decimal rounding policy, then net = gross − fee. Keep the same rule in UI preview, server-side approval, ledger transaction, and payout reconciliation.

## Required test assertions
1. Fee percentage used by Testing is 5.000%, not the currently observed stored live value of 1.000%.
2. Fee and net are nonnegative; fee + net = gross exactly to the cent.
3. Minimum withdrawal validation is applied to the correct amount (confirm whether the $10 minimum refers to gross amount; do not silently reinterpret it).
4. User-facing preview equals server-computed fee/net; server value is authoritative.
5. Repeated approval, duplicate callback, and concurrent approval cannot debit or pay twice.
6. Rejected/cancelled/failed withdrawals do not produce a successful payout ledger entry; retries are idempotent.
7. Any mismatch between stored fee, computed fee, fee ledger entry, and net payout goes to manual review rather than paying a guessed amount.
8. No real payout, wallet mutation, live database update, or Main change is part of this test specification.

## Current blocker
The read-only production finance row previously returned withdrawal_fee_pct = 1.000. Do not run live payout tests. Implement and exercise this in an isolated test database after confirming the exact schema and all withdrawal calculation entry points. This branch does not change that live value.

## Test status
- Arithmetic cases: expected values specified; execution against application code is pending.
- Application/UI/API/database integration: not run.
- Isolated database: not available/confirmed in this workflow.
- Production: untouched.
