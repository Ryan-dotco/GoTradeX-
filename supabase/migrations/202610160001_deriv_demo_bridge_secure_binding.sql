-- GoTradeX Deriv demo bridge v3: secure user binding and idempotency.
-- DRAFT ONLY: do not apply to the shared/production database until reviewed.
create schema if not exists private;

create table if not exists private.deriv_oauth_states_v3 (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists private.deriv_connections_v3 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.deriv_demo_executions_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  account_id text not null,
  symbol text not null,
  contract_type text not null check (contract_type in ('CALL','PUT')),
  stake numeric not null check (stake > 0 and stake <= 10000),
  duration integer not null check (duration between 5 and 86400),
  status text not null default 'STARTED'
    check (status in ('STARTED','PROPOSAL_RECEIVED','BUY_SUBMITTED','CONFIRMED','REJECTED','UNKNOWN')),
  proposal_id text,
  contract_id bigint,
  provider_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

alter table private.deriv_oauth_states_v3 enable row level security;
alter table private.deriv_connections_v3 enable row level security;
alter table private.deriv_demo_executions_v1 enable row level security;
revoke all on private.deriv_oauth_states_v3, private.deriv_connections_v3, private.deriv_demo_executions_v1 from anon, authenticated, public;

create or replace function public.deriv_demo_bridge_db(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r jsonb;
  jwt_role text;
  v_user uuid;
  v_key text;
  v_rows integer := 0;
begin
  jwt_role := coalesce(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  );
  if jwt_role <> 'service_role' then raise exception 'forbidden'; end if;

  if p_action = 'save_state' then
    insert into private.deriv_oauth_states_v3(state_hash,user_id,code_verifier,expires_at)
    values (p_data->>'state_hash',(p_data->>'user_id')::uuid,p_data->>'code_verifier',(p_data->>'expires_at')::timestamptz);
    return jsonb_build_object('ok',true);
  elsif p_action = 'consume_state' then
    delete from private.deriv_oauth_states_v3
      where state_hash=p_data->>'state_hash' and expires_at>now()
      returning jsonb_build_object('user_id',user_id,'code_verifier',code_verifier) into r;
    return coalesce(r,'null'::jsonb);
  elsif p_action = 'save_connection' then
    insert into private.deriv_connections_v3(user_id,access_token,refresh_token,expires_at,updated_at)
    values ((p_data->>'user_id')::uuid,p_data->>'access_token',nullif(p_data->>'refresh_token',''),(p_data->>'expires_at')::timestamptz,now())
    on conflict(user_id) do update set access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,updated_at=now();
    return jsonb_build_object('ok',true);
  elsif p_action = 'get_connection' then
    select jsonb_build_object('access_token',access_token,'refresh_token',refresh_token,'expires_at',expires_at,'updated_at',updated_at)
      into r from private.deriv_connections_v3 where user_id=(p_data->>'user_id')::uuid;
    return coalesce(r,'null'::jsonb);
  elsif p_action = 'delete_connection' then
    delete from private.deriv_connections_v3 where user_id=(p_data->>'user_id')::uuid;
    return jsonb_build_object('ok',true);
  elsif p_action = 'reserve_execution' then
    v_user := (p_data->>'user_id')::uuid;
    v_key := p_data->>'idempotency_key';
    insert into private.deriv_demo_executions_v1(user_id,idempotency_key,account_id,symbol,contract_type,stake,duration)
    values(v_user,v_key,p_data->>'account_id',p_data->>'symbol',p_data->>'contract_type',(p_data->>'stake')::numeric,(p_data->>'duration')::integer)
    on conflict(user_id,idempotency_key) do nothing;
    get diagnostics v_rows = row_count;
    select jsonb_build_object('id',id,'status',status,'created_at',created_at,'contract_id',contract_id,'provider_status',provider_status,'created',v_rows=1)
      into r from private.deriv_demo_executions_v1 where user_id=v_user and idempotency_key=v_key;
    return coalesce(r,'null'::jsonb);
  elsif p_action = 'update_execution' then
    update private.deriv_demo_executions_v1
      set status=p_data->>'status',
          proposal_id=coalesce(p_data->>'proposal_id',proposal_id),
          contract_id=coalesce(nullif(p_data->>'contract_id','')::bigint,contract_id),
          provider_status=coalesce(p_data->>'provider_status',provider_status),
          details=details || coalesce(p_data->'details','{}'::jsonb),
          updated_at=now()
      where id=(p_data->>'id')::uuid and user_id=(p_data->>'user_id')::uuid
      returning jsonb_build_object('id',id,'status',status,'contract_id',contract_id,'provider_status',provider_status,'updated_at',updated_at) into r;
    return coalesce(r,'null'::jsonb);
  end if;
  raise exception 'unknown action';
end
$function$;

revoke all on function public.deriv_demo_bridge_db(text,jsonb) from public, anon, authenticated;
grant execute on function public.deriv_demo_bridge_db(text,jsonb) to service_role;
