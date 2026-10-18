import test from "node:test";
import assert from "node:assert/strict";
import { authorizeChange } from "./owner-lock-policy.mjs";

const now = 1_800_000_000_000;
const context = {
  repository: "Ryan-dotco/GoTradeX-",
  headSha: "abc123",
  changedPaths: ["admin/owner-lock.js"],
  now,
};
const trustedApproval = {
  issuer: "trusted-owner-approval-service",
  verified: true,
  repository: context.repository,
  headSha: context.headSha,
  allowedPaths: ["admin/**"],
  expiresAt: now + 60_000,
};

test("rejects absent approval", () => {
  assert.deepEqual(authorizeChange({ ...context, approval: null }), {
    allowed: false, reason: "missing-trusted-owner-approval",
  });
});
test("rejects an untrusted approval-shaped object", () => {
  assert.equal(authorizeChange({ ...context, approval: { ...trustedApproval, issuer: "pull-request-input" } }).allowed, false);
});
test("rejects approval for another commit", () => {
  assert.equal(authorizeChange({ ...context, approval: { ...trustedApproval, headSha: "different-sha" } }).reason, "head-sha-mismatch");
});
test("rejects expired approval", () => {
  assert.equal(authorizeChange({ ...context, approval: { ...trustedApproval, expiresAt: now } }).reason, "approval-expired");
});
test("rejects a path outside approved scope", () => {
  assert.equal(authorizeChange({ ...context, changedPaths: ["index.html"], approval: trustedApproval }).reason, "change-outside-approved-scope");
});
test("allows exact commit when trusted approval and path scope match", () => {
  assert.deepEqual(authorizeChange({ ...context, approval: trustedApproval }), {
    allowed: true, reason: "trusted-approval-matches-exact-change",
  });
});
