/* GoTradeX Bybit connector
   Credentials are kept in memory only. The server connector must be
   deployed before this module can authenticate to Bybit. */
(function () {
  "use strict";

  const ENDPOINT =
    "https://glffecggusetzklmyukv.supabase.co/functions/v1/gotradex-bybit";

  const MARKET_ENDPOINT =
    "https://glffecggusetzklmyukv.supabase.co/functions/v1/gotradex-bybit-market";

  async function request(payload) {
    if (!window.GOTRADEX_CONFIG?.SUPABASE_URL || !window.GOTRADEX_CONFIG?.SUPABASE_KEY) {
      throw new Error("GoTradeX Supabase configuration is missing.");
    }

    const session = window.gotradexSupabaseSession;
    if (!session?.access_token) {
      throw new Error("GoTradeX session is not available.");
    }

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + session.access_token,
        "apikey": window.GOTRADEX_CONFIG.SUPABASE_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || "Bybit connector request failed.");
    }

    return data;
  }

  window.GTXBybit = {
    request,
    async connect(apiKey, apiSecret, environment = "demo") {
      const data = await request({
        action: "connect",
        api_key: apiKey,
        api_secret: apiSecret,
        environment
      });
      return { ...data, account: data?.account || data };
    },
    async balance(apiKey, apiSecret, environment = "demo") {
      const data = await request({
        action: "balance",
        api_key: apiKey,
        api_secret: apiSecret,
        environment
      });
      return { ...data, account: data?.account || data };
    },
    async positions(apiKey, apiSecret, environment = "demo", category = "linear", symbol = "") {
      return request({
        action: "positions",
        api_key: apiKey,
        api_secret: apiSecret,
        environment,
        category,
        symbol
      });
    },
    async order({apiKey, apiSecret, environment = "demo", category = "spot", symbol, side, orderType = "Market", qty, price, takeProfit, stopLoss, orderLinkId}) {
      return request({
        action: "order",
        api_key: apiKey,
        api_secret: apiSecret,
        environment,
        category,
        symbol,
        side,
        orderType,
        qty,
        price,
        takeProfit,
        stopLoss,
        orderLinkId
      });
    },
    async market(symbol = "BTCUSDT", category = "spot") {
      const session = window.gotradexSupabaseSession;
      if (!session?.access_token) throw new Error("GoTradeX session is not available.");
      const response = await fetch(MARKET_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + session.access_token,
          "apikey": window.GOTRADEX_CONFIG.SUPABASE_KEY
        },
        body: JSON.stringify({ symbol, category })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Bybit market request failed.");
      return data;
    }
  };
})();