-- Harden the server-trade scheduler and enable realtime market-state sync.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gotradex_scheduler_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'gotradex_scheduler_secret',
      'Private secret used only by the GoTradeX server-trade scheduler cron caller.'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.gotradex_verify_scheduler_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, vault
AS $$
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'gotradex_scheduler_secret'
      AND decrypted_secret = p_secret
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gotradex_verify_scheduler_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gotradex_verify_scheduler_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.gotradex_verify_scheduler_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gotradex_verify_scheduler_secret(text) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gotradex_market_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gotradex_market_state;
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('gotradex-server-trade-heartbeat');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'gotradex-server-trade-heartbeat',
  '5 seconds',
  $$
    SELECT net.http_post(
      url := 'https://glffecggusetzklmyukv.supabase.co/functions/v1/gotradex-trade-scheduler',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-gotradex-scheduler-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gotradex_scheduler_secret')
      ),
      body := jsonb_build_object('source','supabase-cron','time',now()),
      timeout_milliseconds := 5000
    ) AS request_id;
  $$
);