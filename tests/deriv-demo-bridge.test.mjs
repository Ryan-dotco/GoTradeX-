import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { safeWsUrl, isAllowedDemoAccount, classifyUncertainExecution } from "../supabase/functions/deriv-demo-bridge/demo-bridge-guards.mjs";

test("accepts only the exact Deriv demo OTP socket URL", () => {
  assert.equal(
    safeWsUrl("wss://api.derivws.com/trading/v1/options/ws/demo?otp=abc123"),
    "wss://api.derivws.com/trading/v1/options/ws/demo?otp=abc123"
  );
  for (const bad of [
    "https://api.derivws.com/trading/v1/options/ws/demo?otp=x",
    "wss://api.derivws.com/trading/v1/options/ws/real?otp=x",
    "wss://evil.example/trading/v1/options/ws/demo?otp=x",
    "wss://user:pass@api.derivws.com/trading/v1/options/ws/demo?otp=x",
    "wss://api.derivws.com:444/trading/v1/options/ws/demo?otp=x",
    "wss://api.derivws.com/trading/v1/options/ws/demo?otp=x&account=real",
    "wss://api.derivws.com/trading/v1/options/ws/demo#fragment",
    "not a URL"
  ]) assert.equal(safeWsUrl(bad), "", `should reject ${bad}`);
});

test("only an active demo account matching the requested ID is allowed", () => {
  const demo = { account_id: "VRTC123", account_type: "demo", status: "active" };
  assert.equal(isAllowedDemoAccount(demo, "VRTC123"), true);
  assert.equal(isAllowedDemoAccount({ ...demo, account_type: "real" }, "VRTC123"), false);
  assert.equal(isAllowedDemoAccount({ ...demo, status: "disabled" }, "VRTC123"), false);
  assert.equal(isAllowedDemoAccount(demo, "VRTC999"), false);
  assert.equal(isAllowedDemoAccount(null, "VRTC123"), false);
});

test("uncertain outcomes are UNKNOWN after buy submission and REJECTED before it", () => {
  assert.equal(classifyUncertainExecution(true), "UNKNOWN");
  assert.equal(classifyUncertainExecution(false), "REJECTED");
});

test("mock OAuth state is single-use and expires", () => {
  const states = new Map([["state-hash", { user_id: "user-1", code_verifier: "verifier", expires_at: 2000 }]]);
  function consume(hash, now) {
    const item = states.get(hash);
    if (!item || item.expires_at <= now) return null;
    states.delete(hash);
    return item;
  }
  assert.equal(consume("state-hash", 1000).user_id, "user-1");
  assert.equal(consume("state-hash", 1000), null, "second use must fail");
  states.set("expired", { user_id: "user-1", code_verifier: "v", expires_at: 1000 });
  assert.equal(consume("expired", 1000), null, "expired state must fail");
});

test("mock idempotency store prevents duplicate execution reservations", () => {
  const ledger = new Map();
  function reserve(user, key) {
    const compound = user + ":" + key;
    if (ledger.has(compound)) return { created: false, ...ledger.get(compound) };
    const record = { id: "mock-execution-1", status: "STARTED" };
    ledger.set(compound, record);
    return { created: true, ...record };
  }
  assert.equal(reserve("user-1", "key-123456789012").created, true);
  assert.equal(reserve("user-1", "key-123456789012").created, false);
  assert.equal(reserve("user-2", "key-123456789012").created, true, "keys are scoped per user");
});

test("production bridge source retains state consumption, unique reservation, and unknown-outcome lock", async () => {
  const source = await readFile(new URL("../supabase/functions/deriv-demo-bridge/index.ts", import.meta.url), "utf8");
  assert.match(source, /db\("consume_state",\s*\{\s*state_hash:/);
  assert.match(source, /db\("reserve_execution",/);
  assert.match(source, /if\s*\(!reservation\.created\)/);
  assert.match(source, /status:\s*buySent\s*\?\s*"UNKNOWN"\s*:\s*"REJECTED"/);
  assert.match(source, /locked against retry to prevent duplicate contracts/i);
});
