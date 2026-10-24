-- DEVELOPMENT DRAFT ONLY. Testing branch; do not apply to production.
-- Records owner/admin commission and two-level referral rewards for successful PROFITABLE settled trades.
-- Inputs must come from trusted server-side trade settlement, never from client-reported results.

create table if not exists public.gotradex_commission_settings (
  id boolean primary key default true check (id),
  owner_profit_share_pct numeric(7,4) not null default 10.0000 check (owner_profit_share_pct between 0 and 100),
  referral_level_1_pct_of_platform_fee numeric(7,4) not null default 10.0000 check (referral_level_1_pct_of_platform_fee between 0 and 100),
  referral_level_2_pct_of_platform_fee numeric(7,4) not null default 2.0000 check (referral_level_2_pct_of_platform_fee between 0 and 100),
  platform_fee_pct_of_gross_profit numeric(7,4) check (platform_fee_pct_of_gross_profit is null or platform_fee_pct_of_gross_profit between 0 and 100),
  admin_referral_depth integer not null default 2147483647 check (admin_referral_depth >= 1),
  min_withdrawal_usd numeric(18,2) not null default 10 check (min_withdrawal_usd >= 10),
  updated_at timestamptz not null default now()
);
insert into public.gotradex_commission_settings(id) values(true) on conflict(id) do nothing;
alter table public.gotradex_commission_settings enable row level security;
revoke all on public.gotradex_commission_settings from anon, authenticated;

create table if not exists public.gotradex_trade_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  trade_id text not null,
  trader_user_id uuid not null references auth.users(id) on delete restrict,
  beneficiary_user_id uuid references auth.users(id) on delete restrict,
  beneficiary_type text not null check (beneficiary_type in ('owner','affiliate_l1','affiliate_l2')),
  referral_level integer,
  currency text not null default 'USD' check (currency='USD'),
  gross_profit_usd numeric(18,8) not null check (gross_profit_usd > 0),
  platform_fee_usd numeric(18,8) not null default 0 check (platform_fee_usd >= 0),
  commission_rate_pct numeric(7,4) not null check (commission_rate_pct between 0 and 100),
  commission_amount_usd numeric(18,8) not null check (commission_amount_usd >= 0),
  status text not null default 'pending' check (status in ('pending','payable','paid','reversed','manual_review')),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  check ((beneficiary_type='owner' and beneficiary_user_id is null and referral_level is null)
      or (beneficiary_type='affiliate_l1' and beneficiary_user_id is not null and referral_level=1)
      or (beneficiary_type='affiliate_l2' and beneficiary_user_id is not null and referral_level=2))
);
create index if not exists gotradex_commission_trade_idx on public.gotradex_trade_commission_ledger(trade_id);
create index if not exists gotradex_commission_beneficiary_idx on public.gotradex_trade_commission_ledger(beneficiary_user_id,status);
alter table public.gotradex_trade_commission_ledger enable row level security;
revoke all on public.gotradex_trade_commission_ledger from anon, authenticated;
create policy "users read own affiliate commissions"
  on public.gotradex_trade_commission_ledger for select to authenticated
  using (beneficiary_user_id=(select auth.uid()));

-- Integration contract; this draft intentionally does not wire itself to production trade tables.
-- Owner/admin commission: default 10% of gross realized profit on successful profitable trades.
-- Affiliate L1: 10% of platform fee; L2: 2% of platform fee (not gross profit).
-- Platform fee rate remains NULL pending confirmation of the server-enforced existing fee policy.
-- Losses, breakeven, failed/pending, demo trades, and signals without broker settlement earn no commission.
-- Idempotency key must uniquely cover trade + beneficiary + commission type to prevent duplicate payouts.
-- Payout is NOT implemented here; NOWPayments invoice collection is not an outbound payout mechanism.
-- Map real trade settlement + referral-tree schema and test concurrency before enabling any settlement writer.
