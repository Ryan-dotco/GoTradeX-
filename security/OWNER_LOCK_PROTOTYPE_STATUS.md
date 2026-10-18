# Owner-lock policy prototype — status and limitations

This is a zero-dependency policy unit-test prototype on the isolated test branch only.

## What the tests establish
- Missing/untrusted approvals are rejected.
- Approval for a different commit SHA is rejected.
- Expired approval is rejected.
- A change outside the approved path scope is rejected.
- A trusted approval matching the exact commit and path scope is accepted.

Run with Node.js 20+: `node --test security/owner-lock-policy.test.mjs`

## Critical limitation
These tests validate decision logic only. They do NOT prove that GitHub blocks a merge, that the approval record is cryptographically/server-side trusted, that a PIN is verified, or that branch protection is active. Do not connect this prototype to production or mark the project protected until a trusted backend issues/verifies approval records and a required GitHub check is enabled and tested against an actual unauthorized pull request.

No PIN or secret belongs in this repository. No production database or app behavior is changed by these files.
