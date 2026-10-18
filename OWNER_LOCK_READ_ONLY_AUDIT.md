# GoTradeX Owner Lock — Read-Only Audit Notes

Status: READ-ONLY AUDIT. No production database, Edge Function, app code, or GitHub protection settings were modified by this audit.

## Repository baseline

- Main baseline observed: 2415ea5107924f8ab96a2f725fad64b1f2523b3b.
- Test branch: test/owner-controlled-lock-2026-10-18.
- The test branch contains planning/design documents only; no owner-lock implementation yet.
- Existing workflow sampled: .github/workflows/gotradex-chart-check.yml. It runs on pushes and pull requests targeting main and checks selected chart/feed scripts and invariants. It does not enforce owner authorization.
- Previous GitHub API attempt could not read or administer branch protection with the current integration permissions. Earlier branch metadata reported main protection disabled. Verify directly in GitHub Settings; do not infer that protection is enabled.

## Live Supabase project inventory (read-only)

- Project: GoTradeX, ref glffecggusetzklmyukv, status ACTIVE_HEALTHY, PostgreSQL 17.6.1.166.
- Database migration list reports 40 applied migrations; latest listed migration is gotradex_security_portal_phase4 (20261014031827).
- 33 public tables were returned by the schema inventory. All 33 reported RLS enabled.
- 21 Edge Functions were returned; all were ACTIVE at the time of inspection. Several have verify_jwt=false, which may be intentional for public websocket/OAuth/scheduler paths and must be individually reviewed before changing anything.
- public.admin_users exists and currently reports one row; do not expose user IDs or modify membership as part of this lock project.
- Existing withdrawal_pin_hash and withdrawal PIN RPC are separate from project-change authorization and must not be reused.
- No project-lock schema or exact-commit owner-approval endpoint was identified in the sampled repository/search results. This is not an exhaustive source-code proof.

## Supabase Security Advisor — current findings to track separately

The live project's security advisor returned findings on 2026-10-18. These were observed only; no remediation was applied.

### Security warnings
- RLS enabled with no policies: public.gotradex_payment_orders, public.otc_candles, public.otc_prices (3 findings).
- Function search_path mutable: public.normalize_otc_candle_wicks (1 finding).
- SECURITY DEFINER functions callable by anon: gotradex_block_auth_email_change, gotradex_block_self_email_change, gotradex_block_trades_for_frozen_account, gotradex_enforce_withdrawal_security, gotradex_password_change_freeze (5 findings).
- SECURITY DEFINER functions callable by authenticated users: advisor reported 20 findings, including admin and trade-related RPCs. Many functions may intentionally gate authorization inside their body; each function's grants and guards must be reviewed, not blindly revoked.
- Leaked-password protection is disabled in Supabase Auth.

### Performance / policy findings
- Unindexed foreign keys: 5 findings, including references on email-change requests and security audit.
- RLS auth init-plan warning on gotradex_security_audit policy.
- Multiple permissive SELECT policies reported on deposits, identity verifications, trades, and support messages.
- 28 unused-index informational findings.

These are separate hardening tasks. They are not evidence that the owner-lock implementation exists. Do not combine unrelated security fixes into the owner-lock PR without a separate, explicitly approved scope.

## Safe next steps

1. Finish a repository-wide read-only inventory of workflow files, admin authorization checks, authentication/session flow, and relevant deployment config.
2. Confirm the correct isolated Supabase development branch or disposable test project is available. Do not write schema changes to the active production project for this feature.
3. Implement the owner approval flow only in isolated test resources, with dedicated owner identity allowlisting, server-side PIN hashing/rate limits, approvals bound to a specific PR head SHA and allowed paths, expiry/revocation, and no PIN in logs.
4. Add a required GitHub Actions check that fails closed without a valid matching approval. Test both rejection and authorized paths.
5. Owner must configure/verify GitHub rules in repository settings if the integration cannot manage them. The lock is not active until unauthorized PR tests demonstrate it cannot merge.
6. Keep the existing production findings listed above as separate tasks. No production remediation is authorized by this audit.

## Acceptance evidence still required

- A test PR with no approval is blocked by a required status check.
- Wrong PIN produces no approval and triggers rate limiting.
- Correct PIN grants approval only for the displayed exact SHA and scope.
- A new commit invalidates prior approval.
- Non-owner identity cannot authorize.
- Logs contain no PIN or secrets.
- GitHub branch/ruleset settings and bypass behavior are verified.
- Existing app CI passes and regression tests are reported.
- No merge without explicit owner approval.
