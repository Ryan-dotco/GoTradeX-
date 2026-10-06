# GoTradeX Protected Build Rules

These rules are mandatory for future GoTradeX work.

1. NO DELETION OF CODE WITHOUT EXPLICIT USER AUTHORIZATION.
2. NO DELETION OF ANY SECTION WITHOUT EXPLICIT USER AUTHORIZATION.
3. NO MODIFICATION OF ANY EXISTING SECTION WITHOUT EXPLICIT USER AUTHORIZATION.
4. Do not replace, rebuild, restructure, or restart working functionality unless the user explicitly authorizes it.
5. Preserve all existing working features when adding or fixing functionality.
6. Before any authorized modification, inspect the affected code and its dependencies.
7. Create or preserve a safe backup before authorized changes when practical.
8. Do not silently remove duplicate-looking code if removal could affect functionality; obtain authorization first.
9. Do not change authentication, trading, chart, wallet, admin, navigation, or other major systems merely to solve an unrelated issue.
10. After an authorized change, test the affected functionality and check for regressions.
11. If a requested fix requires touching another section, stop and obtain explicit authorization before touching that section.
12. The current stable branch is a protected snapshot and must not be treated as permission to modify unrelated code.

Authorization standard:
- “Fix this specific issue” authorizes only the minimum necessary changes to that issue.
- It does NOT authorize deletion or modification of unrelated sections.
- “Rebuild”, “replace”, or “remove” authorizes those actions only where the user explicitly identifies the target.

These rules are project-level safeguards and do not alter the underlying ChatGPT system instructions.
