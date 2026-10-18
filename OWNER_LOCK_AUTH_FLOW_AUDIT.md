# GoTradeX Owner Lock — Authentication and Repository Flow Audit

Status: READ-ONLY SOURCE REVIEW. This document records observations from the main branch and does not change application code, database state, Edge Functions, deployment settings, or GitHub rules.

## Scope and baseline

- Repository: `Ryan-dotco/GoTradeX-`
- Reviewed main commit: `2415ea5107924f8ab96a2f725fad64b1f2523b3b` (baseline recorded in the owner-lock design/audit).
- Test branch: `test/owner-controlled-lock-2026-10-18`.
- Reviewed `index.html` (3140 lines at the time of review), the existing `.github/workflows/gotradex-chart-check.yml`, and the existing owner-lock planning documents.
- Guessed root paths such as `package.json`, `supabase/config.toml`, `README.md`, and `CODEOWNERS` were not found at those paths. This does not prove that no equivalent configuration exists elsewhere.
- The workflow file currently visible is the chart/asset-sync check. It runs for pushes and pull requests targeting `main`, checks selected JavaScript syntax, and verifies selected chart/feed invariants. It does not validate owner authorization.

## Authentication and Admin Portal observations

- Supabase Auth is initialized from browser-side code with a publishable key. A publishable key is not a service-role secret; privileged access must remain enforced by server-side authorization and RLS.
- The Admin Portal's visibility helper `gtxIsAdminUser()` reads browser local-storage entries (including profile/session-like keys) and accepts local role fields, `isAdmin`, or `gotradex_admin_mode=true` as UI signals. The UI visibility helper is therefore not suitable as an authorization boundary.
- `refreshGtxAdminAccess()` also checks the current Supabase user and reads role/isAdmin metadata before showing the menu. Client metadata and local storage must not be treated as proof of project-owner identity.
- Some Admin Portal data operations call backend RPCs, including `gotradex_admin_list_users`. The RPC's server-side checks must be reviewed independently; this source review does not claim that every backend admin operation is vulnerable.
- The Users panel includes local-storage-only status toggling/removal paths that label the result as local. Those paths are not proof of server-side account changes. Do not use browser UI state as a basis for project-lock authorization.
- The app contains existing account and withdrawal-security flows. The project lock must have its own owner-only credential and approval records. It must not reuse the withdrawal PIN or trust the existing Admin Portal role as owner identity.

## Required design consequences

1. The project-lock owner must be identified by a server-verified, stable authenticated user ID on an explicit allowlist. Email text, user-editable metadata, browser storage, DOM state, and admin-menu visibility are insufficient.
2. PIN verification must occur only on the backend. Use a dedicated project-lock credential, salted password hash, strict attempt throttling/backoff, expiry, audit logging that excludes the PIN, and a safe owner recovery path.
3. Approval must be server-recorded and scoped to the repository, pull request, exact head SHA, allowed changed paths, feature scope, and expiry. A changed commit or scope must require fresh approval.
4. The required CI check must independently verify the server-side approval for the current PR head and fail closed if it cannot verify it. It must not trust workflow input, PR text, browser state, or an untrusted status artifact.
5. Keep app authorization and GitHub repository rules as separate enforcement layers. A successful app PIN check alone must not permit merging; GitHub rules and required checks must still pass.
6. Because the current GitHub integration could not inspect/configure branch protection, the repository owner must verify rules directly in GitHub Settings and test bypass behavior. Do not mark the lock active until an unauthorized test PR is demonstrably blocked.
7. The new lock must not alter existing login, Admin Portal, Wallet, trading, chart, registration, or withdrawal flows as a side effect. Regression checks remain required before any merge.

## Audit limits

This is a scoped source review, not a complete security audit of every Edge Function or SQL function. The relevant RPC implementations, grants, RLS policies, owner identity source, isolated backend availability, and all deployment paths must be confirmed before implementation. No production change is authorized by this document.

## Read-only database verification of selected authorization controls

A read-only SQL inspection was performed against the active Supabase project. No SQL writes were run.

- `public.gotradex_admin_list_users()` is `SECURITY DEFINER`, has an empty `search_path` setting, and explicitly checks that `auth.uid()` exists in `public.admin_users` before returning user records.
- The inspected function was executable by `authenticated` and not executable by `anon` at the time of the check.
- `public.gotradex_security_status()` was also executable by `authenticated` and not by `anon`; its definition scopes returned profile security fields to `p.id = auth.uid()` and requires a non-null authenticated user.
- The `public.admin_users` table had an RLS SELECT policy named `Admins can view own admin record`, restricted to the authenticated user whose `auth.uid()` matches `user_id`.
- These results support preserving existing backend checks, but do not establish the owner-lock itself. The new project-lock authorization must use a separate owner allowlist and dedicated credential/approval records. Do not change the existing admin membership or withdrawal PIN.

