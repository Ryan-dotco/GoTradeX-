# GoTradeX Demo Execution Bridge — Audit

Date: 2026-10-16
Scope: demo execution only. No UI toggle or balance display changes.
Cost rule: zero-cost only. No paid services, no new Supabase project/branch.
Isolation: test branch only; do not merge to main without user approval.

## Confirmed existing components

### Bybit demo connector
- Deployed Supabase Edge Function: `gotradex-bybit` (active, version 17 at audit time).
- Uses the dedicated demo API host `https://api-demo.bybit.com`, not the live API host.
- Has actions for connect/balance, positions, order, cancel, and open-orders.
- Requires Bybit demo API key and secret in the request body.
- The order response includes an order ID and orderLinkId, but the connector currently lacks an explicit order-history/fill-confirmation action. An accepted order request must not be described as a confirmed fill.
- Existing `gotradex-bybit-live` is a separate live connector and must not be used by the demo bridge.

### Deriv OAuth
- Deployed `deriv-oauth` is active and can start OAuth, check status, list option accounts, and request a WebSocket OTP.
- It requests `trade account_manage` scope and uses Deriv's new Options API.
- It does not currently expose a proposal/buy/contract-status action; a Deriv demo order execution path still needs implementation.

### Existing GoTradeX trade engine
- Deployed `gotradex-trade-engine` records `PAPER_ONLY` app trades; it is not a confirmed broker order.
- It rejects REAL mode and rejects OTC execution.
- It maps crypto to Bybit public prices but still uses Twelve Data for non-crypto mapping. That path is not suitable under the zero-cost provider rule and must not be used for the new bridge.
- The scanner currently does not submit orders or connect to persistent broker trade history.

## Safety blockers before Deriv demo execution

1. The current Deriv OAuth connection is keyed by an installation ID. The database RPC stores the installation ID and tokens, but the connection is not bound to the authenticated GoTradeX user. The execution bridge must not accept an arbitrary installation ID as sufficient ownership proof.
2. Deriv's demo account must be selected and validated as `account_type=demo` before obtaining an OTP. Real account IDs must be rejected server-side.
3. The Deriv flow must use the OTP-returned WebSocket URL, request a valid proposal, buy only that proposal, and return a contract ID from the provider response. It must never treat a local signal or a proposal as an executed trade.
4. A persistent idempotency ledger is needed so retrying a timed-out request cannot create duplicate orders.
5. OTC symbols must be verified as tradable by Deriv's active-symbol/contract APIs. An OTC chart label alone is not proof of a real Deriv contract.
6. Bybit spot market orders are not expiry-based binary contracts. They need separate lifecycle/position semantics; they must not be silently treated as Deriv-style expiring contracts.

## Next implementation sequence

1. Securely bind each Deriv OAuth connection to the authenticated GoTradeX user (requires a schema/RPC/function change, reviewed in isolation).
2. Add a demo-only Deriv options adapter: verify account type, obtain OTP, validate symbol/contract, request proposal, buy, and confirm contract ID/status.
3. Add idempotency and server-side execution records before connecting UI actions.
4. Extend the Bybit demo connector with order-history/fill verification, using only `api-demo.bybit.com`.
5. Add automated/static tests and perform broker demo tests only when valid demo credentials/connections are available.
6. Keep the scanner UI, Demo/Real toggle, and balance display unchanged until separately approved.

## Verification status

- Source audit completed for the deployed function code and database schema.
- No orders were submitted.
- No Supabase functions were deployed or modified.
- No schema changes were made.
- No live-money path was invoked.
- Runtime broker execution remains unverified.


## Implementation draft added on the isolated branch

Added (source only; not deployed):
- `supabase/migrations/202610160001_deriv_demo_bridge_secure_binding.sql`
- `supabase/functions/deriv-demo-bridge/index.ts`

### Security design in the draft
- OAuth start requires a valid GoTradeX Supabase JWT and records the authenticated user ID in a one-time PKCE state row.
- The callback consumes a hashed, expiring, one-use state and binds the returned Deriv tokens to that user ID.
- All status/account/order/disconnect actions resolve the connection from the authenticated user, not a client-supplied installation ID.
- Database RPC rejects calls unless the JWT role is `service_role`; the new private tables have RLS enabled and grants revoked from public/anon/authenticated.
- Demo order requests require an active account returned for that OAuth user with `account_type=demo`; the returned OTP URL is accepted only if it points to the Deriv demo WebSocket host/path.
- Orders require a server-side idempotency key. Repeated keys are rejected instead of resubmitted. If the buy request may have reached Deriv but the response is uncertain, the execution is locked as `UNKNOWN` to avoid accidental duplicate orders.
- A Deriv proposal is not treated as an order. The response is marked `CONFIRMED` only after Deriv's buy response contains a contract ID. The contract-status request is queried separately; confirmation does not mean the contract has settled or made a profit.

### Important deployment and verification blockers
- These files are drafts on the GitHub test branch only. The migration has **not** been applied, and the function has **not** been deployed. The existing deployed `deriv-oauth` function is unchanged.
- No valid Deriv demo OAuth session/account was available in this work session, so no broker order was sent and no runtime order confirmation was verified.
- The deployed function's existing private tables (`private.deriv_oauth_states_v2`, `private.deriv_connections_v2`, and other private connection tables) were reported by Supabase tooling as having RLS disabled. This is a separate high-priority exposure to review. I have not automatically altered those live tables because enabling RLS without a reviewed access plan can break existing service access.
- Before deploying, review the draft against the current Deriv Options API schema and test callback, account-type rejection, duplicate idempotency keys, provider rejection, timeout-after-buy, and confirmed contract status in a demo account.
- Runtime compilation/tests and actual demo-account verification are still pending. No production changes, paid services, or real-money orders were made.


### Additional pre-deployment checks
- The draft currently uses the existing Deriv OAuth client ID but a new redirect URI ending in `/functions/v1/deriv-demo-bridge`. Confirm that this exact URI is registered/allowed in the Deriv application before deployment. If not, OAuth will fail; do not deploy or alter the existing callback blindly.
- The current deployed OAuth function remains untouched. Its old installation-ID connection records are not automatically migrated or trusted by the new bridge.
- The function source was reviewed from GitHub after commit, but it has not been compiled with Deno or exercised against a provider WebSocket in this environment.
