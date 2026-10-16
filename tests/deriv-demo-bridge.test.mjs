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
  assert.equal(isAllowedDemoAccount({ account_id: "VRTC123", account_type: "demo" }, "VRTC123"), false, "missing status must not be assumed active");
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
  assert.match(source, /status:\s*classifyUncertainExecution\(buySent\)/);
  assert.match(source, /locked against retry to prevent duplicate contracts/i);
  assert.match(source, /proposal_open_contract:\s*1,\s*contract_id:\s*Number\(contractId\)\s*\}/);
  assert.doesNotMatch(source, /proposal_open_contract:\s*1,\s*contract_id:\s*Number\(contractId\),\s*subscribe:\s*0/);
});

test("draft database migration locks down service-only RPC and uses an empty search_path", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202610160001_deriv_demo_bridge_secure_binding.sql", import.meta.url), "utf8");
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /jwt_role <> 'service_role'/);
  assert.match(migration, /revoke all on function public\.deriv_demo_bridge_db\(text,jsonb\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.deriv_demo_bridge_db\(text,jsonb\) to service_role/i);
  assert.match(migration, /unique\(user_id, idempotency_key\)/i);
  assert.match(migration, /enable row level security/i);
});


test("OAuth callback consumes the hashed state before exchanging code and binds to its stored user", async () => {
  const source = await readFile(new URL("../supabase/functions/deriv-demo-bridge/index.ts", import.meta.url), "utf8");
  const consume = source.indexOf('db("consume_state", { state_hash: await hash(rawState) })');
  const exchange = source.indexOf('fetch("https://auth.deriv.com/oauth2/token"');
  const save = source.indexOf('db("save_connection", {', exchange);
  assert.ok(consume >= 0 && exchange > consume && save > exchange, "state must be consumed before token exchange and token storage");
  assert.match(source, /user_id:\s*state\.user_id,\s*access_token:\s*tokenData\.access_token/);
  assert.doesNotMatch(source, /user_id:\s*url\.searchParams/);
});

test("authenticated user lookup guards all non-callback bridge actions", async () => {
  const source = await readFile(new URL("../supabase/functions/deriv-demo-bridge/index.ts", import.meta.url), "utf8");
  const auth = source.indexOf("const user = await authenticatedUser(req)");
  const start = source.indexOf('if (action === "start")');
  const protectedActions = source.indexOf('if (action === "status" || action === "accounts" || action === "disconnect" || action === "demo-order")');
  assert.ok(auth >= 0 && start > auth && protectedActions > auth);
  assert.match(source, /if \(!user\) return json\(\{ error: "Sign in to GoTradeX before connecting or using Deriv\." \}, 401\)/);
});

test("demo-account and active-symbol checks happen before any buy request", async () => {
  const source = await readFile(new URL("../supabase/functions/deriv-demo-bridge/index.ts", import.meta.url), "utf8");
  const accountGuard = source.indexOf("if (!isAllowedDemoAccount(account, accountId))");
  const reserve = source.indexOf('db("reserve_execution",');
  const symbolGuard = source.indexOf("if (!isActive)");
  const proposal = source.indexOf("proposal: 1, amount: stake");
  const buy = source.indexOf("{ buy: String(proposal.id)");
  assert.ok(accountGuard >= 0 && reserve > accountGuard && symbolGuard > reserve && proposal > symbolGuard && buy > proposal);
});

test("execution marks the request uncertain before returning and never automatically retries a buy", async () => {
  const source = await readFile(new URL("../supabase/functions/deriv-demo-bridge/index.ts", import.meta.url), "utf8");
  assert.match(source, /buySent = true;\s*await db\("update_execution", \{ id: reservation\.id, user_id: user\.id, status: "BUY_SUBMITTED" \}\);\s*const buyMsg = await wsRequest\(ws, \{ buy:/);
  assert.match(source, /status: classifyUncertainExecution\(buySent\)/);
  assert.match(source, /This idempotency key was already used\. No retry was sent/);
  assert.match(source, /Execution outcome is uncertain\. The request is locked against retry/);
});
