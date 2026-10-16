/* GoTradeX Deriv demo connection client.
 * Isolated test-branch adapter. Does not add UI or connect until explicitly called.
 * Requires an authenticated Supabase session and deployed deriv-demo-bridge function.
 */
(function (root) {
  "use strict";
  const SUPABASE_URL = "https://glffecggusetzklmyukv.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_I5HYnrxveFXIrvj0NvL1eA_GHIWEDe5";
  const ENDPOINT = SUPABASE_URL + "/functions/v1/deriv-demo-bridge";
  let clientPromise = null;

  function client() {
    if (!root.supabase || typeof root.supabase.createClient !== "function") {
      throw new Error("Supabase client is unavailable.");
    }
    if (!clientPromise) {
      clientPromise = Promise.resolve(root.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
      ));
    }
    return clientPromise;
  }

  async function sessionToken() {
    const sb = await client();
    const result = await sb.auth.getSession();
    if (result.error) throw new Error("Could not read the signed-in GoTradeX session.");
    const token = result.data && result.data.session && result.data.session.access_token;
    if (!token) throw new Error("Sign in to GoTradeX before connecting Deriv.");
    return token;
  }

  async function request(action, method, payload) {
    const token = await sessionToken();
    const response = await fetch(ENDPOINT + "?action=" + encodeURIComponent(action), {
      method: method || "GET",
      headers: {
        "Authorization": "Bearer " + token,
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json"
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Deriv demo connection request failed.");
      error.status = response.status;
      error.details = data.execution || null;
      throw error;
    }
    return data;
  }

  const api = Object.freeze({
    async connect() {
      const data = await request("start", "GET");
      if (!data.authorization_url) throw new Error("Deriv did not return an authorization URL.");
      root.location.assign(data.authorization_url);
    },
    status() { return request("status", "GET"); },
    accounts() { return request("accounts", "GET"); },
    disconnect() { return request("disconnect", "POST", {}); },
    placeDemoOrder(order) {
      if (!order || typeof order !== "object") throw new Error("A demo order payload is required.");
      return request("demo-order", "POST", order);
    }
  });

  root.GoTradeXDerivDemoConnection = api;
})(window);
