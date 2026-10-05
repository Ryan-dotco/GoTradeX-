create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'gotradex-server-trade-heartbeat',
  '5 seconds',
  $$
    select net.http_post(
      url := 'https://glffecggusetzklmyukv.supabase.co/functions/v1/gotradex-trade-scheduler',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey','sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5'
      ),
      body := jsonb_build_object('source','supabase-cron','time',now()),
      timeout_milliseconds := 5000
    ) as request_id;
  $$
);