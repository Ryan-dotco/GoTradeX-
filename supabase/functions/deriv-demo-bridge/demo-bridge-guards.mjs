export function safeWsUrl(value) {
  try {
    const u = new URL(String(value || ""));
    const queryKeys = Array.from(u.searchParams.keys());
    const otp = u.searchParams.get("otp");
    return u.protocol === "wss:" &&
      u.hostname === "api.derivws.com" &&
      !u.username && !u.password && !u.port && !u.hash &&
      u.pathname === "/trading/v1/options/ws/demo" &&
      queryKeys.length === 1 && queryKeys[0] === "otp" &&
      !!otp && otp.length >= 1
      ? u.toString() : "";
  } catch {
    return "";
  }
}

export function isAllowedDemoAccount(account, requestedAccountId) {
  return !!account &&
    String(account.account_id) === String(requestedAccountId) &&
    String(account.account_type).toLowerCase() === "demo" &&
    String(account.status || "active").toLowerCase() === "active";
}

export function classifyUncertainExecution(buyWasSent) {
  return buyWasSent ? "UNKNOWN" : "REJECTED";
}
