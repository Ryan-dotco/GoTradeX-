-- Replace the retired Twelve Data registry with verified Deriv/Bybit symbols.
begin;
alter table public.gotradex_market_registry drop constraint if exists gotradex_market_registry_provider_check;

insert into public.gotradex_market_registry(symbol,asset,provider,provider_symbol,enabled,priority,last_price,last_tick_at,last_error,updated_at)
values
  ('EUR/USD','EUR/USD','DERIV','frxEURUSD',true,10,null,null,null,now()),
  ('GBP/USD','GBP/USD','DERIV','frxGBPUSD',true,20,null,null,null,now()),
  ('USD/JPY','USD/JPY','DERIV','frxUSDJPY',true,30,null,null,null,now()),
  ('USD/CHF','USD/CHF','DERIV','frxUSDCHF',true,40,null,null,null,now()),
  ('AUD/USD','AUD/USD','DERIV','frxAUDUSD',true,50,null,null,null,now()),
  ('USD/CAD','USD/CAD','DERIV','frxUSDCAD',true,60,null,null,null,now()),
  ('NZD/USD','NZD/USD','DERIV','frxNZDUSD',true,70,null,null,null,now()),
  ('EUR/GBP','EUR/GBP','DERIV','frxEURGBP',true,80,null,null,null,now()),
  ('EUR/JPY','EUR/JPY','DERIV','frxEURJPY',true,90,null,null,null,now()),
  ('GBP/JPY','GBP/JPY','DERIV','frxGBPJPY',true,100,null,null,null,now()),
  ('EUR/CHF','EUR/CHF','DERIV','frxEURCHF',true,110,null,null,null,now()),
  ('AUD/JPY','AUD/JPY','DERIV','frxAUDJPY',true,120,null,null,null,now()),
  ('AUD/CAD','AUD/CAD','DERIV','frxAUDCAD',true,130,null,null,null,now()),
  ('AUD/CHF','AUD/CHF','DERIV','frxAUDCHF',true,140,null,null,null,now()),
  ('AUD/NZD','AUD/NZD','DERIV','frxAUDNZD',true,150,null,null,null,now()),
  ('CAD/JPY','CAD/JPY','DERIV','frxCADJPY',true,160,null,null,null,now()),
  ('CHF/JPY','CHF/JPY','DERIV','frxCHFJPY',true,170,null,null,null,now()),
  ('EUR/AUD','EUR/AUD','DERIV','frxEURAUD',true,180,null,null,null,now()),
  ('EUR/CAD','EUR/CAD','DERIV','frxEURCAD',true,190,null,null,null,now()),
  ('EUR/NZD','EUR/NZD','DERIV','frxEURNZD',true,200,null,null,null,now()),
  ('GBP/AUD','GBP/AUD','DERIV','frxGBPAUD',true,210,null,null,null,now()),
  ('GBP/CAD','GBP/CAD','DERIV','frxGBPCAD',true,220,null,null,null,now()),
  ('GBP/CHF','GBP/CHF','DERIV','frxGBPCHF',true,230,null,null,null,now()),
  ('GBP/NZD','GBP/NZD','DERIV','frxGBPNZD',true,240,null,null,null,now()),
  ('NZD/JPY','NZD/JPY','DERIV','frxNZDJPY',true,250,null,null,null,now()),
  ('NZD/CAD','NZD/CAD','DERIV','frxNZDCAD',true,260,null,null,null,now()),
  ('CAD/CHF','CAD/CHF','DERIV','frxCADCHF',true,270,null,null,null,now()),
  ('USD/SGD','USD/SGD','DERIV','frxUSDSGD',true,280,null,null,null,now()),
  ('USD/HKD','USD/HKD','DERIV','frxUSDHKD',true,290,null,null,null,now()),
  ('USD/MXN','USD/MXN','DERIV','frxUSDMXN',true,300,null,null,null,now()),
  ('USD/ZAR','USD/ZAR','DERIV','frxUSDZAR',true,310,null,null,null,now()),
  ('EUR/ZAR','EUR/ZAR','DERIV','frxEURZAR',true,320,null,null,null,now()),
  ('GBP/ZAR','GBP/ZAR','DERIV','frxGBPZAR',true,330,null,null,null,now()),
  ('USD/TRY','USD/TRY','DERIV','frxUSDTRY',true,340,null,null,null,now()),
  ('USD/NOK','USD/NOK','DERIV','frxUSDNOK',true,350,null,null,null,now()),
  ('USD/SEK','USD/SEK','DERIV','frxUSDSEK',true,360,null,null,null,now()),
  ('USD/DKK','USD/DKK','DERIV','frxUSDDKK',true,370,null,null,null,now()),
  ('EUR/NOK','EUR/NOK','DERIV','frxEURNOK',true,380,null,null,null,now()),
  ('EUR/SEK','EUR/SEK','DERIV','frxEURSEK',true,390,null,null,null,now()),
  ('EUR/PLN','EUR/PLN','DERIV','frxEURPLN',true,400,null,null,null,now()),
  ('EUR/TRY','EUR/TRY','DERIV','frxEURTRY',true,410,null,null,null,now()),
  ('GBP/SGD','GBP/SGD','DERIV','frxGBPSGD',true,420,null,null,null,now()),
  ('USD/INR','USD/INR','DERIV','frxUSDINR',true,430,null,null,null,now()),
  ('USD/BRL','USD/BRL','DERIV','frxUSDBRL',true,440,null,null,null,now()),
  ('USD/CNH','USD/CNH','DERIV','frxUSDCNH',true,450,null,null,null,now()),
  ('USD/IDR','USD/IDR','DERIV','frxUSDIDR',true,460,null,null,null,now()),
  ('US 500 OTC','US 500 OTC','DERIV','OTC_SPC',true,600,null,null,null,now()),
  ('US Tech 100 OTC','US Tech 100 OTC','DERIV','OTC_NDX',true,610,null,null,null,now()),
  ('Wall Street 30 OTC','Wall Street 30 OTC','DERIV','OTC_DJI',true,620,null,null,null,now()),
  ('Hong Kong 50 OTC','Hong Kong 50 OTC','DERIV','OTC_HSI',true,630,null,null,null,now()),
  ('Euro 50 OTC','Euro 50 OTC','DERIV','OTC_SX5E',true,640,null,null,null,now()),
  ('France 40 OTC','France 40 OTC','DERIV','OTC_FCHI',true,650,null,null,null,now()),
  ('Germany 40 OTC','Germany 40 OTC','DERIV','OTC_GDAXI',true,660,null,null,null,now()),
  ('Netherlands 25 OTC','Netherlands 25 OTC','DERIV','OTC_AEX',true,670,null,null,null,now()),
  ('Swiss 20 OTC','Swiss 20 OTC','DERIV','OTC_SSMI',true,680,null,null,null,now()),
  ('UK 100 OTC','UK 100 OTC','DERIV','OTC_FTSE',true,690,null,null,null,now())
on conflict(symbol) do update set
  asset=excluded.asset,
  provider=excluded.provider,
  provider_symbol=excluded.provider_symbol,
  enabled=excluded.enabled,
  priority=excluded.priority,
  last_price=null,
  last_tick_at=null,
  last_error=null,
  updated_at=now();

update public.gotradex_market_registry
set provider='DERIV', provider_symbol='UNVERIFIED', enabled=false,
    last_price=null, last_tick_at=null,
    last_error='Disabled: no verified Deriv symbol mapping; Twelve Data is disabled.',
    updated_at=now()
where symbol in ('XAU/USD','XAG/USD');

alter table public.gotradex_market_registry
  add constraint gotradex_market_registry_provider_check
  check (provider in ('BYBIT','DERIV'));
commit;
