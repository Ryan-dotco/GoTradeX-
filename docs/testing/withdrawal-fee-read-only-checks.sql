-- GoTradeX withdrawal fee verification queries
-- SAFE / READ-ONLY: this file contains SELECT statements only.
-- It does not call gotradex_request_withdrawal(), change settings, or write ledger rows.
-- Run only against an authorized database. Do not use the live withdrawal function as a test.

-- 1) Inspect the currently configured fee and minimum.
select id, min_withdrawal, withdrawal_fee_pct
from public.gotradex_platform_finance
where id = true;

-- 2) Pure arithmetic expectations for the intended 5% policy.
-- These calculations do not read or mutate wallets or withdrawal tables.
with cases(gross, expected_fee, expected_net) as (
  values
    (10.00::numeric, 0.50::numeric, 9.50::numeric),
    (20.00::numeric, 1.00::numeric, 19.00::numeric),
    (123.45::numeric, 6.17::numeric, 117.28::numeric),
    (999.99::numeric, 50.00::numeric, 949.99::numeric),
    (1000.00::numeric, 50.00::numeric, 950.00::numeric)
)
select
  gross,
  round(gross * 5.00 / 100, 2) as calculated_fee,
  round(gross - round(gross * 5.00 / 100, 2), 2) as calculated_net,
  expected_fee,
  expected_net,
  (
    round(gross * 5.00 / 100, 2) = expected_fee
    and round(gross - round(gross * 5.00 / 100, 2), 2) = expected_net
  ) as passes_expected_5pct_math
from cases;

-- 3) Verify minimum-policy arithmetic only. This does NOT invoke the withdrawal RPC.
select
  amount,
  (amount >= 10.00) as passes_minimum_policy
from (values (9.99::numeric), (10.00::numeric), (10.01::numeric)) as amounts(amount);

-- IMPORTANT:
-- The live request function deducts the gross amount from withdrawable_profit and inserts
-- a pending withdrawal plus ledger transaction(s). Never call it for testing.
-- This script does not prove the function's runtime behavior, RLS, triggers, or payout safety.
