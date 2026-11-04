-- GoTradeX Testing-only Demo position expiry support.
-- Apply only with the Testing backend release; no existing rows are changed here.
alter table public.gotradex_testing_positions drop constraint if exists gotradex_testing_positions_close_reason_check;
alter table public.gotradex_testing_positions add constraint gotradex_testing_positions_close_reason_check check (close_reason is null or close_reason = any (array['TAKE_PROFIT'::text,'STOP_LOSS'::text,'MANUAL'::text,'EXPIRED'::text]));
