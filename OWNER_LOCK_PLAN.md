# GoTradeX Owner-Controlled Lock — Implementation Plan

Status: PLANNING ONLY — not implemented, not approved for production, and not merged to main.

## Scope

Protect the entire GoTradeX project using two independent controls:

1. An owner-controlled authorization flow in the application.
2. GitHub repository protection for the `main` branch.

The current baseline was read from GitHub on 2026-10-18:
- Default branch: `main`
- Baseline commit: `2415ea5107924f8ab96a2f725fad64b1f2523b3b`
- GitHub branch metadata reported `protected: false` for `main` at the time of inspection.

No application files, production settings, secrets, or existing features were changed for this planning document.

## Non-negotiable owner rules

- Never ask the owner to paste their PIN, secret key, recovery code, or private token into chat, source files, commits, issue comments, or logs.
- Never store a PIN in plaintext. Use server-side password hashing, rate limits, lockout/backoff, and audit events.
- Keep provider/API secrets in server-side secret storage only. Never ship secret keys to browser JavaScript or HTML.
- An unlock must be explicit, time-limited, auditable, and scoped to the exact change approved by the owner. It is not blanket permission to modify unrelated files.
- If a proposed change could affect a protected feature, stop and obtain approval before editing.
- Test on a separate branch. Never merge to `main` until the owner reviews the test result and explicitly approves.
- Record approved commit SHAs and scope. Preserve a known-good recovery point.
- Do not claim the project is protected until both safeguards have been configured and their enforcement has been tested.

## Intended architecture

### A. App owner authorization

- Reuse the existing authenticated owner/admin identity only after verifying how authentication and authorization currently work.
- Add a server-side owner-lock state and authorization endpoints/functions; never trust a client-side boolean or localStorage value as security enforcement.
- Store only a salted, slow password hash for the PIN, using a suitable password-hashing implementation supported by the server runtime.
- Enforce server-side attempt throttling, progressive delay/lockout, session expiry, CSRF/origin protections where applicable, and audit logging without recording the PIN or secrets.
- Require the owner to approve a precise change summary and scope. The authorization expires and cannot authorize unrelated edits.
- Provide a safe recovery process that does not expose or reset the PIN silently.
- Do not add an app lock overlay that blocks normal trading functionality before the authorization backend and recovery path are ready.

### B. GitHub repository protection

Configure in GitHub repository settings, subject to plan and account permissions:

- Protect `main` with pull requests required.
- Require at least one approving review where repository ownership/collaborator setup supports it.
- Dismiss stale approvals after new commits and require approval of the latest push where available.
- Require passing CI checks once the correct check names have been identified.
- Block force pushes and branch deletion.
- Restrict direct pushes and bypass permissions as tightly as the account allows.
- Use CODEOWNERS for sensitive paths if an appropriate owner/reviewer setup exists.
- Keep secrets in GitHub Actions Secrets or the backend's secret manager, not repository files.
- Document any admin bypass limitations; branch protection cannot guarantee prevention if a repository owner intentionally bypasses or changes the rules.

Important: the connected GitHub integration previously returned a permissions error for branch-protection administration. Therefore these settings must be verified in GitHub itself; this plan does not claim they have been enabled.

## Implementation stages

1. Read-only audit of existing Supabase auth, database migrations, Edge Functions, admin roles, and deployment workflow.
2. Propose minimal data model and server-side authorization design; do not modify existing auth or trading code during the audit.
3. Implement the owner lock only on this isolated test branch, with a migration and server-side checks if appropriate.
4. Configure GitHub branch protection through repository settings, with the owner performing any required UI action.
5. Test unauthorized access, wrong PIN attempts, throttling, expiry, owner approval scope, audit events, recovery, and normal app regression.
6. Verify a test pull request cannot merge without required approval/checks.
7. Present exact changed files, commit SHA, test evidence, and limitations for owner review.
8. Merge only after explicit owner approval.

## Acceptance checklist

- [ ] Owner PIN is never disclosed, logged, or committed.
- [ ] PIN verification occurs server-side and is rate-limited.
- [ ] Unauthorized users cannot unlock or authorize protected changes.
- [ ] Authorization is short-lived and scoped to the approved change.
- [ ] All attempted unlocks and authorizations are auditable without sensitive values.
- [ ] Secret keys remain server-side.
- [ ] `main` has verified GitHub protection and required review/checks.
- [ ] A rejected/unapproved change cannot be merged through the normal workflow.
- [ ] Existing GoTradeX features continue to work in regression testing.
- [ ] Owner explicitly approves the exact final commit before merge.

## Current status

Only this planning file is intended for the test branch. No PIN has been set, no secret has been requested, no production feature has been modified, and no GitHub protection rule has been enabled by this document.
