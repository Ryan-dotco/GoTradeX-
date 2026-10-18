/**
 * GoTradeX owner-lock policy prototype.
 * This validates a TRUSTED server-issued approval record; it does not verify PINs
 * or signatures and must not be used as a standalone GitHub merge gate.
 */
export function authorizeChange({ repository, headSha, changedPaths, approval, now = Date.now() }) {
  const deny = (reason) => ({ allowed: false, reason });
  if (!repository || !headSha || !Array.isArray(changedPaths) || changedPaths.length === 0) {
    return deny("missing-change-context");
  }
  if (!approval || approval.issuer !== "trusted-owner-approval-service" || approval.verified !== true) {
    return deny("missing-trusted-owner-approval");
  }
  if (approval.repository !== repository) return deny("repository-mismatch");
  if (approval.headSha !== headSha) return deny("head-sha-mismatch");
  if (!Number.isFinite(approval.expiresAt) || approval.expiresAt <= now) return deny("approval-expired");
  if (!Array.isArray(approval.allowedPaths) || approval.allowedPaths.length === 0) {
    return deny("approval-has-no-allowed-paths");
  }
  const allowed = (path) => approval.allowedPaths.some((pattern) => {
    if (pattern.endsWith("/**")) return path.startsWith(pattern.slice(0, -2));
    return path === pattern;
  });
  if (changedPaths.some((path) => !allowed(path))) return deny("change-outside-approved-scope");
  return { allowed: true, reason: "trusted-approval-matches-exact-change" };
}
