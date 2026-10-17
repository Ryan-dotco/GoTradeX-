-- GoTradeX recovery: disable generated OTC data exposure without deleting history.
begin;

do $$
declare
  job record;
begin
  for job in select jobid from cron.job where jobname = 'gotradex-otc-engine-2s'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

drop policy if exists "OTC prices are publicly readable" on public.otc_prices;
drop policy if exists "OTC candles are publicly readable" on public.otc_candles;

commit;
