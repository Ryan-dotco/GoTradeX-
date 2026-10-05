-- Server market stream worker state and authenticated asset subscriptions.
CREATE TABLE IF NOT EXISTS public.gotradex_market_registry (
  symbol text PRIMARY KEY,
  asset text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('BYBIT','TWELVE_DATA')),
  provider_symbol text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  last_price numeric,
  last_tick_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gotradex_market_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated can read market registry" ON public.gotradex_market_registry;
CREATE POLICY "authenticated can read market registry" ON public.gotradex_market_registry FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.gotradex_market_subscriptions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES public.gotradex_market_registry(symbol) ON DELETE CASCADE,
  last_requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,symbol)
);
ALTER TABLE public.gotradex_market_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own market subscriptions" ON public.gotradex_market_subscriptions;
CREATE POLICY "users manage own market subscriptions" ON public.gotradex_market_subscriptions FOR ALL TO authenticated USING ((select auth.uid())=user_id) WITH CHECK ((select auth.uid())=user_id);

CREATE TABLE IF NOT EXISTS public.gotradex_market_worker (
  id boolean PRIMARY KEY DEFAULT true CHECK (id=true),
  worker_id uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gotradex_market_worker ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no client access to market worker" ON public.gotradex_market_worker;
CREATE POLICY "no client access to market worker" ON public.gotradex_market_worker FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER PUBLICATION supabase_realtime ADD TABLE public.gotradex_market_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gotradex_user_trades;

CREATE OR REPLACE FUNCTION public.gotradex_touch_market_subscription(p_symbol text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_symbol text := upper(trim(p_symbol)); BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.gotradex_market_registry WHERE symbol=v_symbol AND enabled=true) THEN RETURN false; END IF;
  INSERT INTO public.gotradex_market_subscriptions(user_id,symbol,last_requested_at)
  VALUES ((select auth.uid()),v_symbol,now())
  ON CONFLICT (user_id,symbol) DO UPDATE SET last_requested_at=excluded.last_requested_at;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.gotradex_acquire_market_worker(p_worker_id uuid,p_lease_seconds integer DEFAULT 120)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  INSERT INTO public.gotradex_market_worker(id,worker_id,lease_until,updated_at)
  VALUES(true,p_worker_id,now()+make_interval(secs=>greatest(30,least(p_lease_seconds,300))),now())
  ON CONFLICT (id) DO UPDATE SET worker_id=excluded.worker_id,lease_until=excluded.lease_until,updated_at=excluded.updated_at
  WHERE public.gotradex_market_worker.lease_until IS NULL OR public.gotradex_market_worker.lease_until < now() OR public.gotradex_market_worker.worker_id=p_worker_id;
  RETURN EXISTS(SELECT 1 FROM public.gotradex_market_worker WHERE id=true AND worker_id=p_worker_id);
END $$;
CREATE OR REPLACE FUNCTION public.gotradex_renew_market_worker(p_worker_id uuid,p_lease_seconds integer DEFAULT 120)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN UPDATE public.gotradex_market_worker SET lease_until=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,300))),updated_at=now() WHERE id=true AND worker_id=p_worker_id; RETURN FOUND; END $$;
CREATE OR REPLACE FUNCTION public.gotradex_release_market_worker(p_worker_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN UPDATE public.gotradex_market_worker SET worker_id=NULL,lease_until=NULL,updated_at=now() WHERE id=true AND worker_id=p_worker_id; RETURN FOUND; END $$;

REVOKE ALL ON FUNCTION public.gotradex_touch_market_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gotradex_touch_market_subscription(text) TO authenticated;
REVOKE ALL ON FUNCTION public.gotradex_acquire_market_worker(uuid,integer), public.gotradex_renew_market_worker(uuid,integer), public.gotradex_release_market_worker(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gotradex_acquire_market_worker(uuid,integer), public.gotradex_renew_market_worker(uuid,integer), public.gotradex_release_market_worker(uuid) TO service_role;

INSERT INTO public.gotradex_market_registry(symbol,asset,provider,provider_symbol,priority) VALUES
('BTC/USD','BTC/USD','BYBIT','BTCUSDT',10),('ETH/USD','ETH/USD','BYBIT','ETHUSDT',20),('XRP/USD','XRP/USD','BYBIT','XRPUSDT',30),('SOL/USD','SOL/USD','BYBIT','SOLUSDT',40),
('EUR/USD','EUR/USD','TWELVE_DATA','EUR/USD',10),('GBP/USD','GBP/USD','TWELVE_DATA','GBP/USD',20),('USD/JPY','USD/JPY','TWELVE_DATA','USD/JPY',30),('USD/CHF','USD/CHF','TWELVE_DATA','USD/CHF',40),('AUD/USD','AUD/USD','TWELVE_DATA','AUD/USD',50),('USD/CAD','USD/CAD','TWELVE_DATA','USD/CAD',60),('NZD/USD','NZD/USD','TWELVE_DATA','NZD/USD',70),('EUR/GBP','EUR/GBP','TWELVE_DATA','EUR/GBP',80),('EUR/JPY','EUR/JPY','TWELVE_DATA','EUR/JPY',90),('GBP/JPY','GBP/JPY','TWELVE_DATA','GBP/JPY',100),('USD/ZAR','USD/ZAR','TWELVE_DATA','USD/ZAR',110),('XAU/USD','XAU/USD','TWELVE_DATA','XAU/USD',120),('XAG/USD','XAG/USD','TWELVE_DATA','XAG/USD',130)
ON CONFLICT(symbol) DO UPDATE SET asset=excluded.asset,provider=excluded.provider,provider_symbol=excluded.provider_symbol,priority=excluded.priority,enabled=true,updated_at=now();