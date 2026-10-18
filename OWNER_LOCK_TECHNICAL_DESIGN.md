# GoTradeX Owner Lock — Technical Design

Status: DESIGN ONLY. No application code, database, deployment, or GitHub settings changed by this document.

## Owner requirement

GoTradeX is owner-locked by default. The owner may inspect protected areas without unlocking them. Any edit, addition, deletion, replacement, or behavior change affecting the project must be authorized before it can be merged. Feature-level locks (such as Admin Portal) must include all files and shared dependencies that can change that feature. If impact is uncertain, treat the feature as affected and require authorization.

## Important enforcement boundary

A PIN prompt rendered only in the app cannot intercept a GitHub API write or a coding assistant's repository tool. It must not be represented as doing so. Enforce repository changes with GitHub rules and a required CI check; use the app owner PIN to authorize a specific proposed change through a server-side approval service. Until these controls are deployed and tested, this remains a design, not a functioning lock.

## Proposed workflow

1. A proposed change is prepared on an isolated branch. Read-only inspection does not require unlocking.
2. Before approval, the owner sees the PR/change summary, exact changed paths, protected features affected, test plan, and current head commit SHA.
3. The owner signs in to a dedicated owner-only approval screen and enters the project PIN there, never in chat, source code, URL parameters, browser storage, logs, or commit messages.
4. The server verifies the authenticated owner identity and PIN, enforces rate limits/backoff, and records a short-lived approval bound to the exact repository, PR, head SHA, approved paths/scope, and change summary hash.
5. A required GitHub Actions status check validates that approval server-side, confirms the PR head SHA and changed paths still match, and fails closed if approval is absent, expired, revoked, or mismatched.
6. Any new commit changes the head SHA and invalidates the previous authorization. Scope expansion requires a new approval.
7. Required CI checks and GitHub review/rules must pass. The owner separately reviews the actual test result and explicitly approves merging. No automatic merge.
8. Keep an audit record of who authorized what, for which SHA/scope, when it expires, and whether checks passed. Never record the PIN or secret values.

## Owner identity and PIN handling

- Use a dedicated owner allowlist based on stable authenticated user IDs, not email text alone, browser metadata, or the general admin role.
- Use server-side verification only. Do not store plaintext PINs, client-side hashes, localStorage flags, or long-lived unlock booleans.
- Prefer a 6–8 digit or stronger PIN/passphrase; short numeric PINs have a small search space and require strict throttling. Never ask the owner to reveal it in chat.
- Hash using a suitable password-hashing scheme supported by the backend, with unique salt; use progressive delay/rate limits, lockout alerts, session reauthentication, and audited recovery.
- Bind every approval to a single proposed commit and limited paths/scope; no indefinite global unlock.
- Do not use the existing withdrawal PIN for project code authorization.

## GitHub enforcement

- Protect main and any branch used to stage protected work with rulesets/branch protection: require PRs, prohibit force pushes and deletion, require relevant CI, and restrict bypass/direct-push permissions as tightly as the account supports.
- Add a required check such as owner-lock-authorization that fails unless the backend validates a current owner approval for the exact PR head SHA and allowed scope.
- Add/maintain CODEOWNERS for sensitive paths where a meaningful independent reviewer exists.
- Confirm how the connected GitHub App is treated by bypass rules. Do not claim enforcement until a test PR proves an unauthorized change cannot merge.
- A repository owner or administrator may be able to change rules or bypass them, depending on settings/plan. Document this residual power and protect ruleset administration accordingly.
- Existing CI found in the read-only audit is .github/workflows/gotradex-chart-check.yml; its current checks cover selected chart/feed scripts and asset-sync invariants, not owner authorization.

## Audit observations (read-only, from main baseline 2415ea5107924f8ab96a2f725fad64b1f2523b3b)

- The app uses Supabase Auth and server-side RPCs; public.admin_users is used by existing admin RPCs.
- Existing withdrawal_pin_hash is specifically for withdrawal security and must remain separate.
- Existing security UI notes that email-OTP preference storage and enforcement are distinct; don't infer that a preference is fully enforced merely because it is saved.
- The main branch was reported as unprotected during the audit. The GitHub integration could not administer/read protection settings due to permission limitations; repository settings must be verified directly.
- No existing owner project-lock table, exact-commit approval endpoint, or required owner-authorization CI check was identified in the sampled files/searches. This is a scoped audit, not a claim that every repository file has been exhaustively inspected.

## Implementation phases

A. Finish read-only inventory of current authentication, admin identity source, migrations, edge functions, deployment configuration, and all GitHub workflows.
B. Define and review the exact owner identity, recovery path, protected path/feature registry, approval record schema, and required CI contract.
C. Implement the owner approval backend, dedicated approval UI, and required CI check only on test/owner-controlled-lock-2026-10-18; use an isolated test backend, not production.
D. Configure GitHub rules with the owner in repository settings and verify actual enforcement using both unauthorized and authorized test PRs.
E. Regression-test normal trading, Admin Portal, Wallet, Registration, settings, chart, and existing security functions.
F. Present file list, diff, commit SHA, CI results, authorization test results, and limitations. Merge only after explicit owner approval.

## Acceptance tests

- No approval: required check fails and protected PR cannot merge.
- Wrong PIN: no approval record; rate limits/backoff apply; audit contains no PIN.
- Correct PIN: approval is scoped to one exact SHA and path/scope set.
- New commit or expanded paths: previous approval is rejected.
- Expired/revoked approval: check fails closed.
- Non-owner signed-in user and browser metadata spoofing: cannot authorize.
- Secrets/PIN absent from source, workflow logs, query strings, commits, and audit payloads.
- GitHub rules cannot be bypassed by the connected automation identity under intended settings.
- Existing GoTradeX functions regressions pass.
- Owner explicitly approves the exact final commit before merge.
