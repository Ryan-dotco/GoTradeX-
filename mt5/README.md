# GoTradeX + AvaTrade MT5 AutoBot

This folder contains the MT5 bridge used by GoTradeX.

## Architecture

GoTradeX -> AI signal engine -> risk controls -> Supabase command queue -> MT5 Expert Advisor -> AvaTrade MT5

The browser is only the control panel. MT5/VPS performs the continuous broker-side automation.

## Current protections

- Broker: AvaTrade MT5
- Mode: LIVE control mode
- Default risk: Conservative
- Maximum drawdown: 10%
- Per-trade risk defaults in the EA:
  - Conservative: 0.25%
  - Moderate: 0.50%
  - Aggressive: 1.00%
- One GoTradeX position per symbol at a time
- Every automated trade requires a stop loss and take profit
- The EA can trip the server-side bot OFF when maximum drawdown is reached
- Closing the GoTradeX browser does not stop an already-running MT5/VPS EA

## Supabase secret

The Edge Function requires a server secret named:

GOTRADEX_BOT_KEY

Do not put this secret in GitHub or in the browser.

Set it in the Supabase project under Edge Functions -> Secrets.

After setting the secret, put the same value into the EA's BotKey input in MetaTrader 5. The EA input is intentionally CHANGE_ME in the repository so no secret is committed.

## MT5 setup

1. Open AvaTrade MT5 desktop.
2. Log into the AvaTrade MT5 account.
3. Open MetaEditor and compile: mt5/GoTradeX_AvaTrade_MT5_Bridge.mq5
4. In MT5, go to Tools -> Options -> Expert Advisors.
5. Enable automated trading.
6. Add this URL to Allow WebRequest for listed URL:
   https://glffecggusetzklmyukv.supabase.co
7. Attach the GoTradeX EA to a chart.
8. Set MT5AccountID to your AvaTrade MT5 login number and BotKey to the secret created in Supabase.
9. Confirm the EA shows a running/connected status in its Experts log.

## VPS

For continuous operation, move the MT5 terminal + EA to a VPS. AvaTrade provides a VPS service for eligible clients and states that an EA can continue operating while the trader's own computer is off.

## Important

The current GoTradeX signal engine is the strategy source. The bridge does not invent trades independently; it executes commands that GoTradeX places into the command queue.

Do not put a real-money account into LIVE operation until the complete demo/forward-test path has been verified.