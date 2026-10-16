import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeWsUrl, isAllowedDemoAccount, classifyUncertainExecution } from "./demo-bridge-guards.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CLIENT_ID = "34wXKQykw2oTavWmY2IRZ";
const REDIRECT_URI = "https://glffecggusetzklmyukv.supabase.co/functions/v1/deriv-demo-bridge";
const RETURN_URL = "https://ryan-dotco.github.io/GoTradeX-/";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function randomString(bytes = 48) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function hash(v: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}
async function db(action: string, data: Record<string, unknown> = {}) {
  const { data: result, error } = await admin.rpc("deriv_demo_bridge_db", { p_action: action, p_data: data });
  if (error) throw new Error("Secure Deriv storage operation failed.");
  return result as Record<string, any> | null;
}
async function authenticatedUser(req: Request) {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${match[1]}` } }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
async function derivFetch(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`https://api.derivws.com${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Deriv request failed (HTTP ${response.status}).`);
  return payload;
}
function asAccounts(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.accounts)) return payload.data.accounts;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  return [];
}
async function wsRequest(ws: WebSocket, payload: Record<string, unknown>, reqId: number, timeoutMs = 12000): Promise<any> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", listener);
      reject(new Error("Deriv demo response timed out; execution status may be unknown."));
    }, timeoutMs);
    const listener = (event: MessageEvent) => {
      let msg: any;
      try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.req_id !== reqId && msg.echo_req?.req_id !== reqId) return;
      clearTimeout(timer);
      ws.removeEventListener("message", listener);
      if (msg.error) reject(new Error(String(msg.error.message || "Deriv rejected the request.")));
      else resolve(msg);
    };
    ws.addEventListener("message", listener);
    ws.send(JSON.stringify({ ...payload, req_id: reqId }));
  });
}
async function openDemoSocket(token: string, accountId: string) {
  const otp = await derivFetch(`/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`, token, { method: "POST" });
  const wsUrl = safeWsUrl(otp?.data?.url);
  if (!wsUrl) throw new Error("Deriv did not return a valid demo-only WebSocket URL.");
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out connecting to Deriv demo socket.")), 10000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not connect to Deriv demo socket.")); }, { once: true });
  });
  return ws;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || (req.method === "POST" ? "demo-order" : "status");

  try {
    // OAuth callback has no GoTradeX JWT: its single-use state maps back to the user.
    if (url.searchParams.has("code") || url.searchParams.has("error")) {
      const errorParam = url.searchParams.get("error");
      if (errorParam) return Response.redirect(`${RETURN_URL}?deriv=error&error=${encodeURIComponent(errorParam)}`, 302);
      const code = url.searchParams.get("code") || "";
      const rawState = url.searchParams.get("state") || "";
      if (!code || rawState.length < 20) throw new Error("Invalid Deriv OAuth callback.");
      const state = await db("consume_state", { state_hash: await hash(rawState) });
      if (!state?.user_id || !state?.code_verifier) throw new Error("OAuth state is invalid, expired, or already used.");
      const body = new URLSearchParams({
        grant_type: "authorization_code", client_id: CLIENT_ID, code,
        code_verifier: state.code_verifier, redirect_uri: REDIRECT_URI
      });
      const tokenResp = await fetch("https://auth.deriv.com/oauth2/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body
      });
      const tokenData = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok || !tokenData.access_token) throw new Error("Deriv OAuth token exchange failed.");
      await db("save_connection", {
        user_id: state.user_id, access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || "",
        expires_at: new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString()
      });
      return Response.redirect(`${RETURN_URL}?deriv=connected`, 302);
    }

    const user = await authenticatedUser(req);
    if (!user) return json({ error: "Sign in to GoTradeX before connecting or using Deriv." }, 401);

    if (action === "start") {
      const state = randomString(32);
      const verifier = randomString(64);
      const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      await db("save_state", {
        state_hash: await hash(state), user_id: user.id, code_verifier: verifier,
        expires_at: new Date(Date.now() + 600000).toISOString()
      });
      const authUrl = new URL("https://auth.deriv.com/oauth2/auth");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", "trade account_manage");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      return json({ ok: true, authorization_url: authUrl.toString() });
    }

    if (action === "status" || action === "accounts" || action === "disconnect" || action === "demo-order") {
      const conn = await db("get_connection", { user_id: user.id });
      if (action === "status") return json({ connected: !!conn, expires_at: conn?.expires_at || null });
      if (action === "disconnect") {
        await db("delete_connection", { user_id: user.id });
        return json({ ok: true, connected: false });
      }
      if (!conn?.access_token) return json({ error: "Deriv is not connected to this signed-in GoTradeX user." }, 401);
      if (Date.parse(String(conn.expires_at)) <= Date.now() + 30000) return json({ error: "Deriv authorization has expired. Reconnect Deriv before trading." }, 401);

      const accountPayload = await derivFetch("/trading/v1/options/accounts", conn.access_token);
      const accounts = asAccounts(accountPayload);
      if (action === "accounts") {
        return json({ ok: true, accounts: accounts.map(a => ({
          account_id: a.account_id, account_type: a.account_type, currency: a.currency,
          status: a.status, balance: a.account_type === "demo" ? a.balance : undefined
        })) });
      }

      if (req.method !== "POST") return json({ error: "POST required for demo orders." }, 405);
      const body = await req.json().catch(() => ({}));
      const accountId = String(body.account_id || "");
      const symbol = String(body.symbol || "");
      const contractType = String(body.contract_type || "").toUpperCase();
      const stake = Number(body.stake);
      const duration = Number(body.duration);
      const currency = String(body.currency || "USD").toUpperCase();
      const idempotencyKey = String(body.idempotency_key || "");
      if (!accountId || !symbol || !["CALL", "PUT"].includes(contractType) ||
          !Number.isFinite(stake) || stake <= 0 || stake > 10000 ||
          !Number.isInteger(duration) || duration < 5 || duration > 86400 ||
          currency !== "USD" || !/^[A-Za-z0-9._-]{16,128}$/.test(idempotencyKey)) {
        return json({ error: "Invalid demo order. Use CALL/PUT, USD stake, duration 5–86400 seconds, and a unique idempotency key." }, 400);
      }
      const account = accounts.find(a => String(a.account_id) === accountId);
      if (!isAllowedDemoAccount(account, accountId)) {
        return json({ error: "Only an active Deriv demo account belonging to this OAuth user is permitted." }, 403);
      }
      const reservation = await db("reserve_execution", {
        user_id: user.id, idempotency_key: idempotencyKey, account_id: accountId,
        symbol, contract_type: contractType, stake, duration
      });
      if (!reservation?.id) return json({ error: "Could not reserve this demo execution." }, 500);
      if (!reservation.created) {
        return json({
          error: "This idempotency key was already used. No retry was sent; reconcile the existing execution first.",
          execution: reservation
        }, 409);
      }

      let ws: WebSocket | null = null;
      let buySent = false;
      try {
        ws = await openDemoSocket(conn.access_token, accountId);
        const active = await wsRequest(ws, { active_symbols: "brief", product_type: "basic" }, 1);
        const activeSymbols = Array.isArray(active.active_symbols) ? active.active_symbols : [];
        const isActive = activeSymbols.some((s: any) => String(s.symbol) === symbol && !s.is_trading_suspended);
        if (!isActive) {
          await db("update_execution", { id: reservation.id, user_id: user.id, status: "REJECTED", details: { reason: "symbol_not_active" } });
          return json({ error: "Deriv does not currently list this symbol as active for trading. No order was placed." }, 422);
        }

        const proposalMsg = await wsRequest(ws, {
          proposal: 1, amount: stake, basis: "stake", contract_type: contractType,
          currency, duration, duration_unit: "s", underlying_symbol: symbol
        }, 2);
        const proposal = proposalMsg.proposal;
        if (!proposal?.id || !Number.isFinite(Number(proposal.ask_price)) || Number(proposal.ask_price) <= 0) {
          await db("update_execution", { id: reservation.id, user_id: user.id, status: "REJECTED", details: { reason: "invalid_proposal" } });
          return json({ error: "Deriv did not return a valid proposal. No order was placed." }, 422);
        }
        await db("update_execution", {
          id: reservation.id, user_id: user.id, status: "PROPOSAL_RECEIVED",
          proposal_id: String(proposal.id), details: { ask_price: Number(proposal.ask_price), symbol, duration }
        });

        buySent = true;
        await db("update_execution", { id: reservation.id, user_id: user.id, status: "BUY_SUBMITTED" });
        const buyMsg = await wsRequest(ws, { buy: String(proposal.id), price: Number(proposal.ask_price) }, 3);
        const contractId = buyMsg.buy?.contract_id;
        if (!contractId) {
          await db("update_execution", { id: reservation.id, user_id: user.id, status: "UNKNOWN", details: { reason: "buy_response_missing_contract_id" } });
          return json({ error: "Deriv's buy response did not include a contract ID. Status is unknown; do not retry with a new key.", execution_id: reservation.id }, 202);
        }

        let contractStatus: any = null;
        try {
          const statusMsg = await wsRequest(ws, { proposal_open_contract: 1, contract_id: Number(contractId), subscribe: 0 }, 4);
          contractStatus = statusMsg.proposal_open_contract || null;
        } catch { /* Contract ID is still the provider's accepted-contract reference. */ }

        const stored = await db("update_execution", {
          id: reservation.id, user_id: user.id, status: "CONFIRMED",
          contract_id: String(contractId),
          provider_status: String(contractStatus?.status || "open"),
          details: { buy_transaction_id: buyMsg.buy?.transaction_id || null, contract_status_received: !!contractStatus }
        });
        return json({
          ok: true, environment: "demo", provider: "Deriv",
          execution_status: "CONFIRMED",
          confirmation_basis: "Deriv returned a contract_id from the buy response",
          execution: stored, contract: {
            contract_id: Number(contractId), status: contractStatus?.status || "open",
            is_sold: contractStatus?.is_sold ?? null, profit: contractStatus?.profit ?? null
          }
        }, 201);
      } catch (e) {
        await db("update_execution", {
          id: reservation.id, user_id: user.id,
          status: classifyUncertainExecution(buySent),
          details: { reason: e instanceof Error ? e.message : "execution_error" }
        });
        return json({
          error: buySent ? "Execution outcome is uncertain. The request is locked against retry to prevent duplicate contracts." : (e instanceof Error ? e.message : "Deriv demo request failed."),
          execution_id: reservation.id, execution_status: classifyUncertainExecution(buySent)
        }, buySent ? 202 : 502);
      } finally {
        try { ws?.close(); } catch { /* no-op */ }
      }
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected bridge error." }, 500);
  }
});
