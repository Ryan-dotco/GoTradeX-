-- GoTradeX bot credentials: store only in Supabase Vault, never in browser storage.
begin;

create or replace function public.gotradex_get_bot_secrets()
returns jsonb
language sql
security definer
set search_path = public, vault
as $$
  select coalesce(
    jsonb_object_agg(name, decrypted_secret),
    '{}'::jsonb
  )
  from vault.decrypted_secrets
  where name in (
    'gtx_telegram_bot_token',
    'gtx_telegram_chat_id',
    'gtx_callmebot_phone',
    'gtx_callmebot_api_key'
  );
$$;

create or replace function public.gotradex_store_bot_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  existing_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service_role required';
  end if;

  if p_name not in (
    'gtx_telegram_bot_token',
    'gtx_telegram_chat_id',
    'gtx_callmebot_phone',
    'gtx_callmebot_api_key'
  ) then
    raise exception 'Unsupported GoTradeX bot secret name';
  end if;

  if p_value is null or btrim(p_value) = '' then
    return;
  end if;

  select id into existing_id
  from vault.decrypted_secrets
  where name = p_name
  limit 1;

  if existing_id is null then
    perform vault.create_secret(p_value, p_name, 'GoTradeX server-side alert delivery credential', null);
  else
    perform vault.update_secret(existing_id, p_value, p_name, 'GoTradeX server-side alert delivery credential', null);
  end if;
end;
$$;

revoke all on function public.gotradex_get_bot_secrets() from public, anon, authenticated;
revoke all on function public.gotradex_store_bot_secret(text, text) from public, anon, authenticated;
grant execute on function public.gotradex_get_bot_secrets() to service_role;
grant execute on function public.gotradex_store_bot_secret(text, text) to service_role;

commit;
