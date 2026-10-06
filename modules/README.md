# GoTradeX module boundaries

This refactor is intentionally incremental. Existing working runtime code remains untouched until the module it belongs to is isolated and tested.

## Ownership rules

1. AUTH: registration, verification, login, logout, session restoration only.
2. DASHBOARD: dashboard presentation and navigation only.
3. MARKET: asset registry, feed selection, LIVE/OTC state and market-data adapters only.
4. CHART: chart lifecycle, candle history, live candle updates, chart type and viewport only.
5. INDICATORS: indicator calculations and chart overlays only. Must never replace/delete the candle series.
6. TRADING: trade controls, expiry, order lifecycle and server trade runtime only.
7. WALLET: balance, deposits, withdrawals and wallet transactions only.
8. CHAT_AI: chat UI, chat state and AI interaction only.
9. ADMIN: admin portal sections and admin-only data/actions only.
10. SYSTEM: shared Supabase client, configuration, diagnostics and cross-module contracts only.

## Change protocol

BACKUP -> INSPECT -> ISOLATE -> CHANGE ONE MODULE -> TEST MODULE -> TEST ITS DIRECT INTERFACES -> MERGE.

A module change must not edit unrelated module files or inline runtime sections.

## Current migration strategy

The current index.html contains a large amount of legacy inline code. It will NOT be split in one destructive operation.

Each migration step will:
- extract one self-contained module;
- leave a compatibility bridge for existing global functions;
- verify the extracted module before removing its old implementation;
- preserve the current UI and public function names;
- never touch authentication, wallet, admin, chat, market feed or trading code while another module is being migrated.

## First migration target

Chart/indicator separation is the current target because it is already represented by dedicated files (live-chart.js, chart-engine.js, chart-indicators.js, market-data.js). Authentication, wallet, Chat AI and Admin remain frozen during this phase.
