-- GoTradeX public provider configuration. Deriv app IDs are public identifiers, not account credentials.
begin;

create table if not exists public.gotradex_public_settings (
  key text primary key check (key = 'deriv_app_id'),
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.gotradex_public_settings enable row level security;
drop policy if exists "GoTradeX public market settings readable" on public.gotradex_public_settings;
create policy "GoTradeX public market settings readable"
  on public.gotradex_public_settings
  for select to anon, authenticated
  using (key = 'deriv_app_id');

revoke all on table public.gotradex_public_settings from public, anon, authenticated;
grant select on table public.gotradex_public_settings to anon, authenticated;
grant all on table public.gotradex_public_settings to service_role;

commit;
