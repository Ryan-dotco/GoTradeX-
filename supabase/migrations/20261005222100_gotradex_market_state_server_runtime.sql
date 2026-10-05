create table if not exists public.gotradex_market_state (
  symbol text primary key,
  asset text not null,
  provider text not null,
  provider_symbol text not null,
  price numeric not null,
  tick_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.gotradex_market_state enable row level security;

drop policy if exists "authenticated can read market state" on public.gotradex_market_state;
create policy "authenticated can read market state"
  on public.gotradex_market_state
  for select
  to authenticated
  using (true);

create index if not exists gotradex_market_state_updated_idx
  on public.gotradex_market_state(updated_at desc);