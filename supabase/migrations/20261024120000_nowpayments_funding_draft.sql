-- DEVELOPMENT DRAFT ONLY. Do not apply to a shared/live Supabase project until reviewed.
-- NOWPayments isolated order ledger. No trading permissions are granted by deposits.
create extension if not exists pgcrypto;

create table if not exists public.gotradex_nowpayments_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  internal_order_id uuid not null default gen_random_uuid(),
  provider_payment_id text,
  provider_invoice_id text,
  expected_usd numeric(18,2) not null check (expected_usd >= 10 and expected_usd <= 100000),
  expected_pay_currency text not null check (expected_pay_currency ~ '^[a-z0-9]{2,20}$'),
  provider_price_amount numeric(30,12),
  provider_price_currency text,
  provider_pay_amount numeric(30,12),
  provider_pay_currency text,
  provider_actually_paid numeric(30,12),
  provider_actually_paid_currency text,
  provider_payment_status text,
  status text not null default 'creating' check (status in
    ('creating','waiting','confirming','confirmed','settling','settled','underpaid','overpaid','expired','cancelled','failed','manual_review')),
  invoice_url text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint gotradex_nowpayments_internal_order_uq unique (internal_order_id),
  constraint gotradex_nowpayments_provider_payment_uq unique (provider_payment_id),
  constraint gotradex_nowpayments_provider_invoice_uq unique (provider_invoice_id)
);

create table if not exists public.gotradex_nowpayments_events (
  id bigint generated always as identity primary key,
  provider_payment_id text,
  event_fingerprint text not null unique,
  event_status text,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  handled_at timestamptz,
  handling_result text,
  safe_metadata jsonb not null default '{}'::jsonb
);

alter table public.gotradex_nowpayments_orders enable row level security;
alter table public.gotradex_nowpayments_events enable row level security;
revoke all on public.gotradex_nowpayments_orders from anon, authenticated;
revoke all on public.gotradex_nowpayments_events from anon, authenticated;
grant select on public.gotradex_nowpayments_orders to authenticated;
create policy "users read own NOWPayments orders"
  on public.gotradex_nowpayments_orders for select to authenticated
  using (user_id = auth.uid());

-- No client policy on events. Service-role only.
create or replace function public.gotradex_nowpayments_settle(
  p_internal_order_id uuid,
  p_provider_payment_id text,
  p_price_amount numeric,
  p_price_currency text,
  p_pay_amount numeric,
  p_pay_currency text,
  p_actually_paid numeric,
  p_actually_paid_currency text,
  p_safe_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.gotradex_nowpayments_orders%rowtype;
  v_balance numeric;
  v_minimum numeric;
begin
  if p_provider_payment_id is null or length(trim(p_provider_payment_id)) = 0 then
    raise exception 'provider payment id required';
  end if;

  select * into o
    from public.gotradex_nowpayments_orders
    where internal_order_id = p_internal_order_id
    for update;

  if not found then raise exception 'order not found'; end if;
  if o.status = 'settled' then
    if o.provider_payment_id = p_provider_payment_id then
      return jsonb_build_object('result','already_settled','order_id',o.internal_order_id);
    end if;
    raise exception 'settled order provider mismatch';
  end if;
  if o.status not in ('confirmed','settling','underpaid','overpaid','manual_review') then
    raise exception 'order not eligible for settlement';
  end if;
  if o.provider_payment_id is not null and o.provider_payment_id <> p_provider_payment_id then
    update public.gotradex_nowpayments_orders set status='manual_review', updated_at=now()
      where id=o.id;
    return jsonb_build_object('result','manual_review','reason','provider_payment_id_mismatch');
  end if;
  if lower(coalesce(p_price_currency,'')) <> 'usd'
     or abs(coalesce(p_price_amount,0) - o.expected_usd) > 0.01
     or lower(coalesce(p_pay_currency,'')) <> lower(o.expected_pay_currency)
     or lower(coalesce(p_actually_paid_currency,'')) <> lower(o.expected_pay_currency)
     or coalesce(p_actually_paid,0) <= 0 then
    update public.gotradex_nowpayments_orders
      set status='manual_review', provider_payment_id=p_provider_payment_id,
          provider_price_amount=p_price_amount, provider_price_currency=p_price_currency,
          provider_pay_amount=p_pay_amount, provider_pay_currency=p_pay_currency,
          provider_actually_paid=p_actually_paid, provider_actually_paid_currency=p_actually_paid_currency,
          safe_metadata=safe_metadata || coalesce(p_safe_metadata,'{}'::jsonb), updated_at=now()
      where id=o.id;
    return jsonb_build_object('result','manual_review','order_id',o.internal_order_id);
  end if;

  -- Underpayment is never credited. Overpayment is held for manual review.
  if p_actually_paid + 0.000000000001 < coalesce(p_pay_amount,0) then
    update public.gotradex_nowpayments_orders set status='underpaid',
      provider_payment_id=p_provider_payment_id, provider_price_amount=p_price_amount,
      provider_price_currency=p_price_currency, provider_pay_amount=p_pay_amount,
      provider_pay_currency=p_pay_currency, provider_actually_paid=p_actually_paid,
      provider_actually_paid_currency=p_actually_paid_currency,
      safe_metadata=safe_metadata || coalesce(p_safe_metadata,'{}'::jsonb), updated_at=now()
      where id=o.id;
    return jsonb_build_object('result','underpaid','order_id',o.internal_order_id);
  end if;
  if p_actually_paid > coalesce(p_pay_amount,0) * 1.02 then
    update public.gotradex_nowpayments_orders set status='overpaid',
      provider_payment_id=p_provider_payment_id, provider_price_amount=p_price_amount,
      provider_price_currency=p_price_currency, provider_pay_amount=p_pay_amount,
      provider_pay_currency=p_pay_currency, provider_actually_paid=p_actually_paid,
      provider_actually_paid_currency=p_actually_paid_currency,
      safe_metadata=safe_metadata || coalesce(p_safe_metadata,'{}'::jsonb), updated_at=now()
      where id=o.id;
    return jsonb_build_object('result','overpaid','order_id',o.internal_order_id);
  end if;

  -- Unique provider_payment_id is the database-level final duplicate barrier.
  update public.gotradex_nowpayments_orders set status='settling',
    provider_payment_id=p_provider_payment_id, provider_price_amount=p_price_amount,
    provider_price_currency=p_price_currency, provider_pay_amount=p_pay_amount,
    provider_pay_currency=p_pay_currency, provider_actually_paid=p_actually_paid,
    provider_actually_paid_currency=p_actually_paid_currency,
    safe_metadata=safe_metadata || coalesce(p_safe_metadata,'{}'::jsonb), updated_at=now()
    where id=o.id;

  select min_deposit into v_minimum from public.gotradex_platform_finance limit 1;
  if o.expected_usd < coalesce(v_minimum,10) then
    update public.gotradex_nowpayments_orders set status='manual_review', updated_at=now() where id=o.id;
    return jsonb_build_object('result','manual_review','reason','minimum_deposit_policy');
  end if;

  insert into public.gotradex_wallets (user_id, capital_balance, updated_at)
    values (o.user_id, 0, now()) on conflict (user_id) do nothing;
  select capital_balance into v_balance from public.gotradex_wallets where user_id=o.user_id for update;
  update public.gotradex_wallets set capital_balance=capital_balance + o.expected_usd, updated_at=now()
    where user_id=o.user_id;

  insert into public.gotradex_wallet_transactions
    (user_id, transaction_type, amount, balance_before, balance_after, reference_id, metadata, created_at)
  values
    (o.user_id, 'deposit', o.expected_usd, v_balance, v_balance + o.expected_usd,
     o.id,
     jsonb_build_object('provider','nowpayments','provider_payment_id',p_provider_payment_id,'order_id',o.internal_order_id), now());

  insert into public.gotradex_deposits
    (user_id, amount, payment_method, payment_reference, status, requested_at, reviewed_at, metadata)
  values
    (o.user_id, o.expected_usd, 'nowpayments', p_provider_payment_id, 'approved', now(), now(),
     jsonb_build_object('order_id',o.internal_order_id));

  update public.gotradex_nowpayments_orders set status='settled', settled_at=now(), updated_at=now()
    where id=o.id;
  return jsonb_build_object('result','settled','order_id',o.internal_order_id);
end;
$;

revoke all on function public.gotradex_nowpayments_settle(uuid,text,numeric,text,numeric,text,numeric,text,jsonb) from public, anon, authenticated;
grant execute on function public.gotradex_nowpayments_settle(uuid,text,numeric,text,numeric,text,numeric,text,jsonb) to service_role;
