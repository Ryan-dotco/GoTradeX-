-- GoTradeX Security Portal #4
-- Additive migration: no existing tables or records are deleted.
begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists withdrawal_frozen_until timestamptz,
  add column if not exists freeze_reason text,
  add column if not exists withdrawal_pin_hash text,
  add column if not exists require_email_otp boolean not null default false,
  add column if not exists account_frozen_at timestamptz,
  add column if not exists account_frozen_reason text;

create table if not exists public.gotradex_security_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.gotradex_security_audit enable row level security;

drop policy if exists "Users can read own security audit" on public.gotradex_security_audit;
create policy "Users can read own security audit"
  on public.gotradex_security_audit for select
  to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.gotradex_security_audit from anon, authenticated;
grant select on public.gotradex_security_audit to authenticated;

create or replace function public.gotradex_security_audit_write(
  p_user_id uuid, p_event_type text, p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer
set search_path = public, auth
as $$
begin
  insert into public.gotradex_security_audit(user_id, actor_user_id, event_type, details)
  values (p_user_id, auth.uid(), p_event_type, coalesce(p_details, '{}'::jsonb));
end;
$$;
revoke all on function public.gotradex_security_audit_write(uuid,text,jsonb) from public, anon, authenticated;

create or replace function public.gotradex_security_status()
returns table (
  withdrawal_frozen_until timestamptz,
  freeze_reason text,
  has_withdrawal_pin boolean,
  require_email_otp boolean,
  account_frozen_at timestamptz,
  account_frozen_reason text
)
language sql stable security definer
set search_path = public, auth
as $$
  select p.withdrawal_frozen_until, p.freeze_reason,
         (p.withdrawal_pin_hash is not null),
         coalesce(p.require_email_otp, false),
         p.account_frozen_at, p.account_frozen_reason
  from public.profiles p
  where p.id = auth.uid()
    and auth.uid() is not null;
$$;
revoke all on function public.gotradex_security_status() from public, anon;
grant execute on function public.gotradex_security_status() to authenticated;

create or replace function public.gotradex_set_withdrawal_pin(p_pin text)
returns timestamptz
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_until timestamptz := now() + interval '24 hours';
  v_email text;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'Withdrawal PIN must be exactly four digits';
  end if;
  select email into v_email from auth.users where id = v_user;
  insert into public.profiles(id, email, withdrawal_pin_hash, withdrawal_frozen_until, freeze_reason, updated_at)
  values (v_user, v_email, extensions.crypt(p_pin, extensions.gen_salt('bf')), v_until, 'pin_change', now())
  on conflict (id) do update set
    withdrawal_pin_hash = excluded.withdrawal_pin_hash,
    withdrawal_frozen_until = greatest(coalesce(public.profiles.withdrawal_frozen_until, '-infinity'::timestamptz), excluded.withdrawal_frozen_until),
    freeze_reason = 'pin_change',
    updated_at = now();
  perform public.gotradex_security_audit_write(v_user, 'withdrawal_pin_changed', jsonb_build_object('freeze_until', v_until));
  return v_until;
end;
$$;
revoke all on function public.gotradex_set_withdrawal_pin(text) from public, anon;
grant execute on function public.gotradex_set_withdrawal_pin(text) to authenticated;

create or replace function public.gotradex_set_email_otp_requirement(p_enabled boolean)
returns boolean
language plpgsql security definer
set search_path = public, auth
as $$
declare v_user uuid := auth.uid(); v_email text;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  select email into v_email from auth.users where id = v_user;
  insert into public.profiles(id, email, require_email_otp, updated_at)
  values (v_user, v_email, coalesce(p_enabled,false), now())
  on conflict (id) do update set require_email_otp = coalesce(p_enabled,false), updated_at = now();
  perform public.gotradex_security_audit_write(v_user, 'email_otp_requirement_changed', jsonb_build_object('enabled', coalesce(p_enabled,false)));
  return coalesce(p_enabled,false);
end;
$$;
revoke all on function public.gotradex_set_email_otp_requirement(boolean) from public, anon;
grant execute on function public.gotradex_set_email_otp_requirement(boolean) to authenticated;

create or replace function public.gotradex_freeze_my_account()
returns timestamptz
language plpgsql security definer
set search_path = public, auth
as $$
declare v_user uuid := auth.uid(); v_email text; v_now timestamptz := now();
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  select email into v_email from auth.users where id = v_user;
  insert into public.profiles(id, email, account_frozen_at, account_frozen_reason, updated_at)
  values (v_user, v_email, v_now, 'emergency_self_freeze', v_now)
  on conflict (id) do update set account_frozen_at = v_now, account_frozen_reason = 'emergency_self_freeze', updated_at = v_now;
  perform public.gotradex_security_audit_write(v_user, 'account_emergency_frozen', '{}'::jsonb);
  return v_now;
end;
$$;
revoke all on function public.gotradex_freeze_my_account() from public, anon;
grant execute on function public.gotradex_freeze_my_account() to authenticated;

create or replace function public.gotradex_admin_release_withdrawal_freeze(p_target_user uuid, p_reason text)
returns boolean
language plpgsql security definer
set search_path = public, auth
as $$
declare v_admin uuid := auth.uid();
begin
  if v_admin is null or not exists(select 1 from public.admin_users where user_id = v_admin) then
    raise exception 'Admin permission required';
  end if;
  if nullif(trim(coalesce(p_reason,'')), '') is null then raise exception 'A reason is required'; end if;
  update public.profiles
     set withdrawal_frozen_until = null, freeze_reason = null, updated_at = now()
   where id = p_target_user;
  if not found then raise exception 'Trader profile not found'; end if;
  insert into public.gotradex_security_audit(user_id, actor_user_id, event_type, details)
  values (p_target_user, v_admin, 'admin_released_withdrawal_freeze', jsonb_build_object('reason', trim(p_reason)));
  return true;
end;
$$;
revoke all on function public.gotradex_admin_release_withdrawal_freeze(uuid,text) from public, anon;
grant execute on function public.gotradex_admin_release_withdrawal_freeze(uuid,text) to authenticated;

create or replace function public.gotradex_block_self_email_change()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if new.email is distinct from old.email
     and auth.uid() = old.id
     and not exists(select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Email is locked for security. Contact GoTradeX Admin.';
  end if;
  return new;
end;
$$;

drop trigger if exists gotradex_profile_email_locked on public.profiles;
create trigger gotradex_profile_email_locked
before update of email on public.profiles
for each row execute function public.gotradex_block_self_email_change();

create or replace function public.gotradex_block_auth_email_change()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if new.email is distinct from old.email
     and auth.uid() = old.id
     and not exists(select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Email is locked for security. Contact GoTradeX Admin.';
  end if;
  return new;
end;
$$;

drop trigger if exists gotradex_auth_email_locked on auth.users;
create trigger gotradex_auth_email_locked
before update of email on auth.users
for each row execute function public.gotradex_block_auth_email_change();

create or replace function public.gotradex_password_change_freeze()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    insert into public.profiles(id, email, withdrawal_frozen_until, freeze_reason, updated_at)
    values (new.id, new.email, now() + interval '24 hours', 'password_change', now())
    on conflict (id) do update set
      withdrawal_frozen_until = greatest(coalesce(public.profiles.withdrawal_frozen_until, '-infinity'::timestamptz), now() + interval '24 hours'),
      freeze_reason = 'password_change',
      updated_at = now();
    insert into public.gotradex_security_audit(user_id, actor_user_id, event_type, details)
    values (new.id, new.id, 'password_changed_withdrawal_freeze', jsonb_build_object('freeze_until', now() + interval '24 hours'));
  end if;
  return new;
end;
$$;

drop trigger if exists gotradex_password_change_freeze on auth.users;
create trigger gotradex_password_change_freeze
after update of encrypted_password on auth.users
for each row when (new.encrypted_password is distinct from old.encrypted_password)
execute function public.gotradex_password_change_freeze();

create or replace function public.gotradex_enforce_withdrawal_security()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare v_freeze timestamptz; v_account_frozen timestamptz;
begin
  if new.status in ('pending','approved','paid') then
    select withdrawal_frozen_until, account_frozen_at
      into v_freeze, v_account_frozen
      from public.profiles where id = new.user_id;
    if v_account_frozen is not null then
      raise exception 'Account is emergency-frozen. Contact GoTradeX Admin.';
    end if;
    if v_freeze is not null and v_freeze > now() then
      raise exception 'Withdrawals frozen until % for security protection', to_char(v_freeze, 'YYYY-MM-DD HH24:MI:SS TZ');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists gotradex_withdrawal_security_guard on public.gotradex_withdrawals;
create trigger gotradex_withdrawal_security_guard
before insert or update of status on public.gotradex_withdrawals
for each row execute function public.gotradex_enforce_withdrawal_security();


-- Emergency-frozen accounts cannot enqueue new trades. Existing positions are not force-closed.
create or replace function public.gotradex_block_trades_for_frozen_account()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $
begin
  if exists (
    select 1 from public.profiles p
    where p.id = new.user_id and p.account_frozen_at is not null
  ) then
    raise exception 'Account is emergency-frozen. New trades are disabled until Admin review.';
  end if;
  return new;
end;
$;

drop trigger if exists gotradex_frozen_account_trade_guard on public.gotradex_trade_commands;
create trigger gotradex_frozen_account_trade_guard
before insert on public.gotradex_trade_commands
for each row execute function public.gotradex_block_trades_for_frozen_account();

commit;
