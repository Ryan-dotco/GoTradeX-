# Deriv Demo Bridge — Validation Pass
Date: 2026-10-16
Branch: `test/ai-otc-demo-execution-bridge-20261016`
Scope: source review, official-documentation comparison, and local mocked guard tests. No live provider/database actions.

## What was checked

- Reviewed the isolated Edge Function, migration draft, browser adapter, and main-branch `index.html`.
- Compared the OAuth PKCE and Options API OTP/WebSocket flow with Deriv's current official documentation.
- Confirmed the documented demo WebSocket URL shape is `wss://api.derivws.com/trading/v1/options/ws/demo?otp=...`.
- Tightened the source validator to require the exact demo endpoint and a single OTP query parameter; it rejects real/public endpoints, other hosts, credentials, ports, fragments, and extra query parameters.
- Updated the browser adapter to accept an injected authenticated Supabase client, so a future integration can reuse GoTradeX's established session instead of necessarily creating another client.
- Extracted pure demo-bridge guards into `supabase/functions/deriv-demo-bridge/demo-bridge-guards.mjs` so security decisions can be tested without Deno, Supabase, or Deriv.
- Added Node built-in test cases at `tests/deriv-demo-bridge.test.mjs` for OAuth-state single use/expiry, demo-account restrictions, duplicate idempotency reservations, OTP URL rejection, and uncertain execution outcomes.
- Ran the equivalent five pure/mock scenarios locally under Node v22.16.0: **5 passed, 0 failed**. The repository test also includes a source-invariant check; that sixth repository test has not been run against a local checkout because this environment could not clone GitHub. Source invariants were checked separately by fetching the branch files.

## Findings / blockers

1. **OAuth callback registration is now confirmed by the user's screenshot.** Both `https://glffecggusetzklmyukv.supabase.co/functions/v1/deriv-oauth` and `https://glffecggusetzklmyukv.supabase.co/functions/v1/deriv-demo-bridge` appear in the Deriv app's registered Redirect URLs. The new bridge is still not deployed.
2. **Main app auth client is not exposed as one clear shared client.** The main `index.html` creates multiple Supabase clients in separate sections. The adapter now supports explicit client injection, but it is not wired into the app. Before wiring, select/reuse the actual signed-in GoTradeX client deliberately; do not assume an unrelated global is the correct session.
3. **Migration and function are a coordinated pair.** The function calls `public.deriv_demo_bridge_db`, which only exists after the draft migration is applied. Neither has been applied/deployed. Do not deploy the function alone.
4. **Provider execution remains unverified.** No Deriv demo OAuth session was used in this pass. The official REST schema confirms account listing returns `data` as an array and account fields include `account_id`, `status` (`active`/`inactive`), and `account_type` (`demo`/`real`). The OTP response is documented as `data.url`. Proposal and buy are WebSocket operations, but their runtime response shapes, active-symbol compatibility, and contract-status response still need a demo-session integration test.
5. **Expiry and recovery:** the draft stores refresh tokens but does not implement refresh; when the access token expires it asks the user to reconnect. Unknown outcomes after a buy submission remain locked against automatic retries, which is safer than risking duplicate contracts.
6. **Runtime verification is incomplete.** This environment has not compiled the function with Deno or run it against Deriv's WebSocket. Source inspection is not a substitute for runtime testing.

## Security checks that look correct in source

- OAuth state is random, hashed in storage, expires, and is consumed once; PKCE is used.
- The OAuth callback maps the consumed state back to the authenticated GoTradeX user instead of trusting a browser-supplied installation ID.
- Status, account, disconnect, and execution actions require a valid GoTradeX Supabase user JWT.
- The selected account must be returned for that user's Deriv token and have `account_type=demo` and active status.
- Orders require CALL/PUT, positive bounded stake, duration bounds, USD currency, and an idempotency key.
- Duplicate keys are rejected. If a buy may have reached Deriv but the response is uncertain, the execution is recorded as UNKNOWN and is not automatically retried.
- The bridge confirms only when Deriv returns a contract ID; this is not treated as a settled result or profit.
- Compared the one-shot `proposal_open_contract` request with Deriv's current schema: `subscribe` is optional and, if supplied, only `1` is allowed. Removed the unsupported `subscribe: 0` field and added a regression assertion.
- The migration draft enables RLS and revokes public/anon/authenticated access on its new private tables; the RPC checks for the `service_role` claim and grants execute only to `service_role`.
- Tightened the security-definer RPC to use an empty `search_path`, avoiding reliance on a mutable schema search path.

## Mock test results

- Demo WebSocket URL allowlist: pass for valid demo OTP URL; invalid host, path, scheme, credentials, port, fragment, and extra query parameter rejected.
- Demo account guard: pass for active matching demo account; real, inactive, mismatched, and missing accounts rejected.
- OAuth state model: pass for one-time consumption and expiry.
- Idempotency model: pass for duplicate rejection within one user and key scoping between users.
- Uncertain execution classification: pass; after buy submission is `UNKNOWN`, before buy submission is `REJECTED`.

These are mocked/unit checks, not proof of actual Supabase RPC behavior or provider execution.

## Official documentation reviewed

- Deriv OAuth 2.0 / PKCE: https://developers.deriv.com/docs/intro/oauth/
- Deriv Options API OTP and WebSocket endpoint: https://developers.deriv.com/docs/options/websocket/
- Deriv Options API overview: https://developers.deriv.com/docs/options/
- Deriv trading operations: https://developers.deriv.com/docs/trading/

## Status

- Source-only edits on the test branch.
- Main app unchanged.
- No SQL run; no settings changed; no migration applied.
- No Edge Function deployed.
- No orders submitted; no live-money path invoked.
- No paid services or new Supabase branch/project created.

## Next safe sequence

1. Complete the full repository test suite and compile/type-check the Edge Function in a Deno-compatible environment; this has not been run in this pass.
2. Review the migration diff, including the empty `search_path`, before any database action.
3. Apply the migration only after an explicit go-ahead and a coordinated deployment plan.
4. Deploy the function only after the migration exists and callback registration is confirmed.
5. Test connect/status/accounts first with a Deriv demo account. Only after those pass, test a minimal demo contract and verify the provider's contract ID/status.
6. Wire the adapter into the UI only after those checks pass and the correct existing Supabase auth client is identified.
