/* GoTradeX - unified frontend
   Clean single-file version
   Authentication uses Supabase.
*/

const APP_VERSION = "1.0.0";

function togglePassword() {
  const input = document.getElementById("auth-password");
  const eye = document.getElementById("password-eye");

  if (!input) return;

  const showPassword = input.type === "password";
  input.type = showPassword ? "text" : "password";

  if (eye) {
    eye.classList.toggle("fa-eye", !showPassword);
    eye.classList.toggle("fa-eye-slash", showPassword);
  }
}


const GOTRADEX_CONFIG = window.GOTRADEX_CONFIG || {};

let supabaseClient = null;

function initSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.warn("GoTradeX: Supabase library is not available.");
    return null;
  }

  const url =
    GOTRADEX_CONFIG.SUPABASE_URL ||
    "https://glffecggusetzklmyukv.supabase.co";

  const key =
    GOTRADEX_CONFIG.SUPABASE_KEY ||
    GOTRADEX_CONFIG.SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    console.warn(
      "GoTradeX: Supabase configuration is missing."
    );
    return null;
  }

  try {
    supabaseClient = window.supabase.createClient(url, key);
    console.log("GoTradeX Supabase client ready.");
  } catch (error) {
    console.error(
      "GoTradeX Supabase initialization failed:",
      error
    );
  }

  return supabaseClient;
}


/* =========================================================
   CONFIG
   ========================================================= */

const CONFIG = {
  LATENODE_WEBHOOK:
    localStorage.getItem("gotradex_latenode_webhook") || "",

  WHATSAPP_PHONE:
    localStorage.getItem("gotradex_wa_phone") || "27619902202",

  WHATSAPP_API_KEY:
    localStorage.getItem("gotradex_wa_key") || "",

  TELEGRAM_CHAT_ID:
    localStorage.getItem("gotradex_tg_chat") || "8945602816",

  TELEGRAM_BOT_TOKEN:
    localStorage.getItem("gotradex_tg_token") || ""
};


/* =========================================================
   DEMO MARKETS
   ========================================================= */

const DEMO_MARKETS = [
  {
    symbol: "BTCUSDT",
    type: "crypto",
    price: 64231.50,
    change30d: 2.40
  },
  {
    symbol: "ETHUSDT",
    type: "crypto",
    price: 3450.20,
    change30d: -1.20
  },
  {
    symbol: "XAUUSD",
    type: "commodity",
    price: 2340.10,
    change30d: 0.80
  },
  {
    symbol: "EURUSD",
    type: "forex",
    price: 1.0821,
    change30d: -0.05
  },
  {
    symbol: "GBPUSD",
    type: "forex",
    price: 1.2630,
    change30d: 0.12
  }
];


/* =========================================================
   APPLICATION STATE
   ========================================================= */

const state = {
  isLoggedIn: false,
  user: null,

  isBotRunning: true,

  balance: 10000,
  startingBalance: 10000,

  activeSymbol: "BTCUSDT",
  timeframe: "1H",

  markets: [],
  candles: [],
  signals: [],
  positions: [],

  lastSignal: null
};


/* =========================================================
   HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

const money = (n, digits = 2) =>
  n == null || Number.isNaN(Number(n))
    ? "N/A"
    : "$" +
      Number(n).toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      });


function showToast(message, type = "success") {
  const toast =
    $("toast") ||
    $("toast-container");

  if (!toast) return;

  toast.textContent = message;

  if (type === "error") {
    toast.style.background = "var(--bearish)";
  } else if (type === "warning") {
    toast.style.background = "var(--warning)";
  } else {
    toast.style.background = "var(--accent)";
  }

  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}


function getAuthElement(...ids) {
  for (const id of ids) {
    const element = $(id);

    if (element) {
      return element;
    }
  }

  return null;
}


function setHidden(element, hidden) {
  if (!element) return;

  element.classList.toggle("hidden", !!hidden);
  element.style.display = hidden ? "none" : "";
}


function getAppRoot() {
  return getAuthElement(
    "main-app",
    "app"
  );
}


function getAuthOverlay() {
  return getAuthElement(
    "auth-overlay"
  );
}


/* =========================================================
   LOCAL STATE
   ========================================================= */

function loadLocalState() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(
        "gotradex_state"
      ) || "null"
    );

    if (!saved) return;

    state.balance =
      Number(saved.balance) || 10000;

    state.startingBalance =
      Number(saved.startingBalance) || 10000;

    state.positions =
      Array.isArray(saved.positions)
        ? saved.positions
        : [];

    state.signals =
      Array.isArray(saved.signals)
        ? saved.signals
        : [];

    /*
      Do not use the old local login
      as authentication.

      Supabase is now responsible for
      the actual login session.
    */

    state.user =
      saved.user || null;
  } catch (error) {
    console.warn(
      "GoTradeX local state warning:",
      error
    );
  }
}


function persist() {
  localStorage.setItem(
    "gotradex_state",
    JSON.stringify({
      balance: state.balance,
      startingBalance:
        state.startingBalance,

      positions:
        state.positions,

      signals:
        state.signals,

      user:
        state.user,

      isLoggedIn:
        state.isLoggedIn
    })
  );
}


/* =========================================================
   AUTH MODE
   ========================================================= */

function getAuthMode() {
  const mode =
    $("auth-mode");

  if (mode && mode.value) {
    return String(
      mode.value
    ).toLowerCase();
  }

  const registerTab =
    $("register-tab");

  if (registerTab) {
    return registerTab.classList.contains(
      "active"
    )
      ? "signup"
      : "login";
  }

  return "login";
}


function switchAuth(type) {
  const login =
    String(type || "login")
      .toLowerCase() === "login";

  const mode =
    $("auth-mode");

  if (mode) {
    mode.value =
      login
        ? "login"
        : "signup";
  }

  const loginTab =
    $("login-tab");

  const registerTab =
    $("register-tab");

  if (loginTab) {
    loginTab.classList.toggle(
      "active",
      login
    );
  }

  if (registerTab) {
    registerTab.classList.toggle(
      "active",
      !login
    );
  }

  const title =
    $("auth-title");

  if (title) {
    title.textContent =
      login
        ? "Welcome Back"
        : "Create Account";
  }

  const nameGroup =
    $("name-group");

  if (nameGroup) {
    nameGroup.classList.toggle(
      "hidden",
      login
    );
  }

  const signupContainer = $("signup-fields");
  if (signupContainer) {
    signupContainer.style.display = login ? "none" : "";
  }

  const submitLabel = $("auth-submit-label");
  if (submitLabel) {
    submitLabel.textContent = login ? "Log In" : "Create Account";
  }

  const submitButton = $("auth-submit-button");
  if (submitButton) {
    submitButton.title = login ? "Log in to GoTradeX" : "Create your GoTradeX account";
  }

  const subtitle = $("auth-subtitle");
  if (subtitle) {
    subtitle.textContent = login
      ? "Sign in to continue to GoTradeX"
      : "Create your account to continue to GoTradeX";
  }

  const signupFields = [
    "signup-name",
    "signup-country",
    "signup-age",
    "signup-gender",
    "signup-looking",
    "signup-terms"
  ];

  signupFields.forEach((id) => {
    const element = $(id);

    if (!element) return;

    const wrapper =
      element.closest(
        ".input-group,.form-group,.field,.auth-field"
      );

    if (wrapper) {
      wrapper.classList.toggle(
        "hidden",
        login
      );
    }
  });

  const password =
    $("auth-password");

  if (password) {
    password.autocomplete =
      login
        ? "current-password"
        : "new-password";
  }

  clearAuthMessages();
}


/* =========================================================
   FORGOT PASSWORD
   ========================================================= */

function showForgotPassword() {
  const overlay =
    getAuthOverlay();

  if (overlay) {
    overlay.classList.remove(
      "hidden"
    );
  }

  const loginForm =
    $("auth-form");

  const forgotForm =
    $("forgot-password-form");

  if (loginForm) {
    loginForm.classList.add(
      "hidden"
    );
  }

  if (forgotForm) {
    forgotForm.classList.remove(
      "hidden"
    );
  }

  const email =
    $("forgot-email");

  if (email) {
    setTimeout(() => {
      email.focus();
    }, 100);
  }
}


function showLoginPage() {
  const forgotForm =
    $("forgot-password-form");

  if (forgotForm) {
    forgotForm.classList.add(
      "hidden"
    );
  }

  const form =
    $("auth-form");

  if (form) {
    form.classList.remove(
      "hidden"
    );
  }

  switchAuth("login");
}


function showSignupPage() {
  const forgotForm =
    $("forgot-password-form");

  if (forgotForm) {
    forgotForm.classList.add(
      "hidden"
    );
  }

  const form =
    $("auth-form");

  if (form) {
    form.classList.remove(
      "hidden"
    );
  }

  switchAuth("signup");
}


/* =========================================================
   AUTH MESSAGES
   ========================================================= */

function showAuthError(message) {
  const element =
    getAuthElement(
      "auth-error",
      "auth-message"
    );

  if (element) {
    element.textContent =
      message || "";

    element.classList.remove(
      "hidden"
    );
  }

  showToast(
    message || "Authentication error",
    "error"
  );
}


function clearAuthMessages() {
  [
    "auth-error",
    "auth-success",
    "forgot-message"
  ].forEach((id) => {
    const element = $(id);

    if (element) {
      element.textContent = "";
    }
  });
}


/* =========================================================
   SUPABASE AUTHENTICATION
   ========================================================= */

async function handleAuth(event) {
  if (event) {
    event.preventDefault();
  }

  clearAuthMessages();

  const client =
    initSupabaseClient();

  if (!client) {
    showAuthError(
      "Supabase is not connected. Check the Supabase configuration in index.html."
    );

    return false;
  }

  const emailElement =
    getAuthElement(
      "auth-email",
      "signup-email"
    );

  const passwordElement =
    getAuthElement(
      "auth-password",
      "signup-password"
    );

  const email =
    (emailElement?.value || "")
      .trim()
      .toLowerCase();

  const password =
    passwordElement?.value || "";

  const registering =
    [
      "signup",
      "register"
    ].includes(
      getAuthMode()
    );

  const name =
    (
      getAuthElement(
        "signup-name",
        "auth-name"
      )?.value || ""
    ).trim() ||
    email.split("@")[0];

  if (!email) {
    showAuthError(
      "Please enter your email address."
    );

    return false;
  }

  if (password.length < 6) {
    showAuthError(
      "Password must be at least 6 characters."
    );

    return false;
  }

  try {
    if (registering) {
      const country =
        (
          $("signup-country")
            ?.value ||
          "Worldwide"
        ).trim();

      const age =
        Number(
          $("signup-age")
            ?.value || 0
        );

      const gender =
        $("signup-gender")
          ?.value || "";

      const looking =
        $("signup-looking")
          ?.value || "";

      const terms =
        $("signup-terms");

      if (
        terms &&
        !terms.checked
      ) {
        showAuthError(
          "Please accept the terms and rules."
        );

        return false;
      }

      if (age && age < 18) {
        showAuthError(
          "You must be 18 or older."
        );

        return false;
      }

      const {
        data,
        error
      } =
        await client.auth.signUp({
          email,
          password,

          options: {
            data: {
              name,
              country,
              age:
                age || null,
              gender,
              looking_for:
                looking
            }
          }
        });

      if (error) {
        throw error;
      }

      if (
        data?.session &&
        data?.user
      ) {
        applySupabaseUser(
          data.user
        );

        openApp();

        showToast(
          `Welcome, ${name}!`
        );
      } else {
        const message =
          getAuthElement(
            "auth-success",
            "auth-message"
          );

        if (message) {
          message.textContent =
            "Account created. Check your email if confirmation is required, then log in.";
        }

        showToast(
          "Account created. Check your email if confirmation is required.",
          "success"
        );

        switchAuth("login");
      }
    } else {
      const {
        data,
        error
      } =
        await client.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        throw error;
      }

      if (!data?.user) {
        throw new Error(
          "Login succeeded but no user was returned."
        );
      }

      applySupabaseUser(
        data.user
      );

      state.isLoggedIn = true;

      state.user = {
        name:
          getUserName(
            data.user
          ),

        email:
          data.user.email,

        id:
          data.user.id
      };

      persist();

      openApp();

      showToast(
        `Welcome, ${state.user.name}!`
      );
    }
  } catch (error) {
    console.error(
      "GoTradeX authentication error:",
      error
    );

    showAuthError(
      error?.message ||
      "Authentication failed. Please try again."
    );
  }

  return false;
}


/* =========================================================
   PASSWORD RESET
   ========================================================= */

async function resetPassword(event) {
  if (event) event.preventDefault();

  const client =
    initSupabaseClient();

  if (!client) {
    showAuthError(
      "Supabase is not connected."
    );

    return;
  }

  const email =
    (
      $("forgot-email")
        ?.value ||
      $("auth-email")
        ?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  if (!email) {
    const message =
      $("forgot-message");

    if (message) {
      message.textContent =
        "Enter your email address first.";
    }

    return;
  }

  try {
    await client.auth.resetPasswordForEmail(
      email,
      {
        redirectTo:
          window.location.origin +
          window.location.pathname
      }
    );

    const message =
      $("forgot-message");

    if (message) {
      message.textContent =
        "Password reset email sent. Check your inbox.";
    }
  } catch (error) {
    const message =
      $("forgot-message");

    if (message) {
      message.textContent =
        error?.message ||
        "Could not send reset email.";
    }
  }
}


function getUserName(user) {
  return (
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Trader_Pro"
  );
}


function applySupabaseUser(user) {
  if (!user) return;

  state.user = {
    id: user.id,
    email: user.email,
    name: getUserName(user)
  };

  state.isLoggedIn = true;

  persist();
}


/* =========================================================
   OPEN MAIN APPLICATION
   ========================================================= */

function openApp() {
  const overlay =
    getAuthOverlay();

  const app =
    getAppRoot();

  setHidden(
    overlay,
    true
  );

  setHidden(
    app,
    false
  );

  const username =
    getAuthElement(
      "sidebar-username",
      "dashboard-user-name",
      "settings-name"
    );

  if (username) {
    username.textContent =
      state.user?.name ||
      "Trader_Pro";
  }

  try {
    renderAll();
  } catch (error) {
    console.warn(
      "GoTradeX render warning:",
      error
    );
  }

  try {
    refreshMarkets();
  } catch (error) {
    console.warn(
      "GoTradeX market refresh warning:",
      error
    );
  }

  try {
    loadCandles(
      state.activeSymbol,
      state.timeframe
    );
  } catch (error) {}
}


function openMainApp() {
  openApp();
}


/* =========================================================
   RESTORE SUPABASE SESSION
   ========================================================= */

async function restoreSupabaseSession() {
  const client =
    initSupabaseClient();

  if (!client) {
    return false;
  }

  try {
    const {
      data
    } =
      await client.auth.getSession();

    if (
      data?.session?.user
    ) {
      applySupabaseUser(
        data.session.user
      );

      openApp();

      return true;
    }
  } catch (error) {
    console.warn(
      "GoTradeX session restore warning:",
      error
    );
  }

  return false;
}


/* =========================================================
   AUTH STATE LISTENER
   ========================================================= */

function setupSupabaseAuthListener() {
  const client =
    initSupabaseClient();

  if (
    !client ||
    window.__gotradexAuthListener
  ) {
    return;
  }

  window.__gotradexAuthListener =    true;

  client.auth.onAuthStateChange(
    (event, session) => {
      if (session?.user) {
        applySupabaseUser(
          session.user
        );

        openApp();
      } else if (
        event === "SIGNED_OUT"
      ) {
        state.isLoggedIn = false;
        state.user = null;

        persist();

        const app =
          getAppRoot();

        setHidden(
          app,
          true
        );

        const overlay =
          getAuthOverlay();

        setHidden(
          overlay,
          false
        );
      }
    }
  );
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {
  try {
    const client =
      initSupabaseClient();

    if (client) {
      await client.auth.signOut({
        scope: "local"
      });
    }
  } catch (error) {
    console.warn(
      "GoTradeX sign-out warning:",
      error
    );
  }

  state.isLoggedIn = false;
  state.user = null;

  persist();

  setHidden(
    getAppRoot(),
    true
  );

  setHidden(
    getAuthOverlay(),
    false
  );

  showLoginPage();

  showToast(
    "Signed out."
  );
}

const logoutAccount =
  logout;


/* =========================================================
   INITIALIZATION
   ========================================================= */

function init() {
  console.log(
    "GoTradeX initializing..."
  );

  loadLocalState();

  restoreNotificationSettings();

  bindNavigation();

  bindSearch();

  bindTimeframes();

  setupSupabaseAuthListener();

  restoreSupabaseSession()
    .then((restored) => {

      if (
        !restored &&
        !state.isLoggedIn
      ) {
        setHidden(
          getAppRoot(),
          true
        );

        setHidden(
          getAuthOverlay(),
          false
        );

        showLoginPage();
      } else if (
        !restored &&
        state.isLoggedIn
      ) {
        openApp();
      }

      renderAll();

      console.log(
        "GoTradeX initialized.",
        APP_VERSION
      );
    });
}


document.addEventListener(
  "DOMContentLoaded",
  init,
  { once: true }
);
/* =========================================================
   NAVIGATION
   ========================================================= */

function bindNavigation() {
  document.querySelectorAll(".nav-links li").forEach((li) => {
    li.addEventListener("click", () => {
      openSection(li.dataset.section);
    });
  });
}

function openSection(section) {
  document
    .querySelectorAll(".nav-links li")
    .forEach((li) => {
      li.classList.toggle(
        "active",
        li.dataset.section === section
      );
    });

  document
    .querySelectorAll(".content-section")
    .forEach((s) => {
      s.classList.add("hidden");
    });

  const target = $(section + "-section");

  if (target) {
    target.classList.remove("hidden");
  }

  renderAll();
}


/* =========================================================
   SEARCH
   ========================================================= */

function bindSearch() {
  const search = $("asset-search");

  if (!search) return;

  search.addEventListener("input", (e) => {
    const q = e.target.value.trim().toUpperCase();
    renderMarkets(q);
  });
}


/* =========================================================
   TIMEFRAME CONTROLS
   ========================================================= */

function bindTimeframes() {
  document
    .querySelectorAll("#timeframe-controls button")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("#timeframe-controls button")
          .forEach((b) => {
            b.classList.remove("active");
          });

        btn.classList.add("active");

        state.timeframe = btn.dataset.timeframe;

        loadCandles(
          state.activeSymbol,
          state.timeframe
        );
      });
    });
}


/* =========================================================
   SYMBOL HELPERS
   ========================================================= */

function symbolLabel(symbol) {
  const map = {
    BTCUSDT: "BTC / USD",
    ETHUSDT: "ETH / USD",
    XAUUSD: "GOLD / USD",
    EURUSD: "EUR / USD",
    GBPUSD: "GBP / USD",
    USDJPY: "USD / JPY",
    SOLUSDT: "SOL / USD",
    XRPUSDT: "XRP / USD"
  };

  return map[symbol] || symbol;
}

function apiInst(symbol) {
  if (symbol.endsWith("USDT")) {
    return symbol.replace("USDT", "-USDT");
  }

  if (symbol === "XAUUSD") {
    return "XAU-USDT";
  }

  if (symbol === "EURUSD") {
    return "EUR-USDT";
  }

  if (symbol === "GBPUSD") {
    return "GBP-USDT";
  }

  if (symbol === "USDJPY") {
    return "JPY-USDT";
  }

  return symbol;
}


/* =========================================================
   MARKET REFRESH
   ========================================================= */

async function refreshMarkets() {
  state.loadingMarkets = true;

  renderMarkets();

  try {
    const symbols = Object.keys(DEMO_MARKETS);

    const results = await Promise.all(
      symbols.map((symbol) =>
        fetchOneMarket(symbol)
      )
    );

    results.forEach((market) => {
      if (market && market.symbol) {
        state.markets[market.symbol] = market;
      }
    });
  } catch (error) {
    console.warn(
      "Market refresh failed:",
      error
    );
  } finally {
    state.loadingMarkets = false;

    renderMarkets();

    if (
      state.activeSymbol &&
      state.markets[state.activeSymbol]
    ) {
      updateDashboardMarket(
        state.markets[state.activeSymbol]
      );
    }
  }
}


/* =========================================================
   FETCH SINGLE MARKET
   ========================================================= */

async function fetchOneMarket(symbol) {
  const fallback = DEMO_MARKETS[symbol];

  try {
    const instrument = apiInst(symbol);

    const url =
      "https://www.okx.com/api/v5/market/ticker?instId=" +
      encodeURIComponent(instrument);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Market request failed"
      );
    }

    const json = await response.json();

    const item =
      json &&
      Array.isArray(json.data) &&
      json.data[0]
        ? json.data[0]
        : null;

    if (!item) {
      throw new Error(
        "No market data returned"
      );
    }

    const price = Number(item.last);

    const open24h = Number(
      item.open24h || item.sodUtc0 || price
    );

    const change =
      open24h
        ? ((price - open24h) / open24h) * 100
        : 0;

    return {
      symbol,
      name:
        fallback?.name ||
        symbolLabel(symbol),
      type:
        fallback?.type ||
        "market",
      price:
        Number.isFinite(price)
          ? price
          : fallback.price,
      change:
        Number.isFinite(change)
          ? change
          : fallback.change,
      source: "live",
      updatedAt: Date.now()
    };
  } catch (error) {
    console.warn(
      "Using demo data for",
      symbol
    );

    return {
      ...fallback,
      symbol,
      source: "demo",
      updatedAt: Date.now()
    };
  }
}


/* =========================================================
   MARKET RENDERING
   ========================================================= */

function renderMarkets(filter = "") {
  const container =
    $("markets-list") ||
    $("market-list") ||
    $("markets-grid");

  if (!container) return;

  const query =
    String(filter || "").toUpperCase();

  const markets =
    Object.values(state.markets);

  const filtered = markets.filter((market) => {
    if (!query) return true;

    return (
      market.symbol
        .toUpperCase()
        .includes(query) ||
      String(market.name || "")
        .toUpperCase()
        .includes(query)
    );
  });

  if (!filtered.length) {
    container.innerHTML =
      '<div class="empty-state">No markets found.</div>';

    return;
  }

  container.innerHTML = filtered
    .map((market) => {
      const positive =
        Number(market.change) >= 0;

      return `
        <div
          class="market-card"
          data-symbol="${escapeHtml(
            market.symbol
          )}"
          onclick="selectAsset('${escapeHtml(
            market.symbol
          )}')"
        >
          <div class="market-card-top">
            <div>
              <strong>
                ${escapeHtml(
                  symbolLabel(market.symbol)
                )}
              </strong>

              <span>
                ${escapeHtml(
                  market.type || "market"
                )}
              </span>
            </div>

            <div class="market-symbol">
              ${escapeHtml(
                market.symbol
              )}
            </div>
          </div>

          <div class="market-card-bottom">
            <strong>
              ${formatPrice(market.price)}
            </strong>

            <span class="${
              positive
                ? "positive"
                : "negative"
            }">
              ${positive ? "+" : ""}
              ${Number(market.change || 0).toFixed(2)}%
            </span>
          </div>
        </div>
      `;
    })
    .join("");
}


/* =========================================================
   PRICE FORMATTING
   ========================================================= */

function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  if (number >= 1000) {
    return (
      "$" +
      number.toLocaleString(
        undefined,
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      )
    );
  }

  if (number >= 1) {
    return (
      "$" +
      number.toLocaleString(
        undefined,
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4
        }
      )
    );
  }

  return (
    "$" +
    number.toLocaleString(
      undefined,
      {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6
      }
    )
  );
}


/* =========================================================
   ASSET SELECTION
   ========================================================= */

function selectAsset(symbol) {
  if (!symbol) return;

  state.activeSymbol = symbol;

  const market =
    state.markets[symbol] ||
    DEMO_MARKETS[symbol];

  if (market) {
    updateDashboardMarket(market);
  }

  document
    .querySelectorAll(".market-card")
    .forEach((card) => {
      card.classList.toggle(
        "active",
        card.dataset.symbol === symbol
      );
    });

  loadCandles(
    symbol,
    state.timeframe
  );

  analyzeActiveAsset();
}


/* =========================================================
   CANDLES
   ========================================================= */

async function loadCandles(
  symbol,
  timeframe = "5m"
) {
  state.candlesLoading = true;

  try {
    const instrument = apiInst(symbol);

    const barMap = {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1h": "1H",
      "4h": "4H",
      "1d": "1D"
    };

    const bar =
      barMap[timeframe] ||
      timeframe ||
      "5m";

    const url =
      "https://www.okx.com/api/v5/market/candles?instId=" +
      encodeURIComponent(instrument) +
      "&bar=" +
      encodeURIComponent(bar) +
      "&limit=100";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Candle request failed"
      );
    }

    const json = await response.json();

    const rows =
      json &&
      Array.isArray(json.data)
        ? json.data
        : [];

    if (!rows.length) {
      throw new Error(
        "No candles returned"
      );
    }

    state.candles = rows
      .reverse()
      .map((row) => ({
        time: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5])
      }));

    state.candleSource = "live";
  } catch (error) {
    console.warn(
      "Using demo candles for",
      symbol
    );

    state.candles =
      makeDemoCandles(symbol);

    state.candleSource = "demo";
  } finally {
    state.candlesLoading = false;

    updateChart();
    updateAI();
  }
}


/* =========================================================
   DEMO CANDLES
   ========================================================= */

function makeDemoCandles(symbol) {
  const market =
    state.markets[symbol] ||
    DEMO_MARKETS[symbol];

  let price =
    Number(market?.price) || 100;

  const candles = [];

  const now = Date.now();

  for (let i = 0; i < 100; i++) {
    const movement =
      (Math.random() - 0.48) *
      price *
      0.008;

    const open = price;

    const close =
      Math.max(
        0.000001,
        price + movement
      );

    const high =
      Math.max(open, close) +
      Math.abs(movement) * 0.4;

    const low =
      Math.min(open, close) -
      Math.abs(movement) * 0.4;

    candles.push({
      time:
        now -
        (100 - i) *
          5 *
          60 *
          1000,
      open,
      high,
      low,
      close,
      volume:
        Math.random() * 1000
    });

    price = close;
  }

  return candles;
}


/* =========================================================
   CHART
   ========================================================= */

function updateChart() {
  const canvas =
    $("price-chart") ||
    $("market-chart") ||
    $("trading-chart");

  if (!canvas) return;

  if (
    typeof Chart === "undefined"
  ) {
    console.warn(
      "Chart.js is not loaded."
    );

    return;
  }

  const labels =
    state.candles.map((candle) =>
      new Date(
        candle.time
      ).toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )
    );

  const values =
    state.candles.map(
      (candle) => candle.close
    );

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart =
    new Chart(canvas.getContext("2d"), {
      type: "line",

      data: {
        labels,

        datasets: [
          {
            label:
              symbolLabel(
                state.activeSymbol
              ),

            data: values,

            borderWidth: 2,

            pointRadius: 0,

            tension: 0.25,

            fill: false
          }
        ]
      },

      options: {
        responsive: true,

        maintainAspectRatio: false,

        animation: false,

        plugins: {
          legend: {
            display: false
          }
        },

        scales: {
          x: {
            display: true
          },

          y: {
            display: true
          }
        }
      }
    });
}


/* =========================================================
   DASHBOARD MARKET DATA
   ========================================================= */

function updateDashboardMarket(
  market
) {
  if (!market) return;

  const price =
    formatPrice(market.price);

  const change =
    Number(market.change || 0);

  const priceElements = [
    $("dashboard-market-price"),
    $("active-market-price"),
    $("selected-market-price")
  ];

  priceElements.forEach((element) => {
    if (element) {
      element.textContent = price;
    }
  });

  const symbolElements = [
    $("dashboard-market-symbol"),
    $("active-market-symbol"),
    $("selected-market-symbol")
  ];

  symbolElements.forEach((element) => {
    if (element) {
      element.textContent =
        symbolLabel(
          market.symbol
        );
    }
  });

  const changeElements = [
    $("dashboard-market-change"),
    $("active-market-change"),
    $("selected-market-change")
  ];

  changeElements.forEach((element) => {
    if (!element) return;

    element.textContent =
      `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;

    element.classList.toggle(
      "positive",
      change >= 0
    );

    element.classList.toggle(
      "negative",
      change < 0
    );
  });
}


/* =========================================================
   AI ANALYSIS
   ========================================================= */

function analyzeActiveAsset() {
  updateAI();
}

function ema(values, period) {
  if (!Array.isArray(values) || !values.length) {
    return [];
  }

  const multiplier =
    2 / (period + 1);

  const output = [];

  let previous =
    Number(values[0]);

  output.push(previous);

  for (let i = 1; i < values.length; i++) {
    const current =
      Number(values[i]);

    previous =
      (current - previous) *
        multiplier +
      previous;

    output.push(previous);
  }

  return output;
}


function calculateRSI(
  values,
  period = 14
) {
  if (
    !Array.isArray(values) ||
    values.length <= period
  ) {
    return 50;
  }

  let gains = 0;
  let losses = 0;

  for (
    let i = 1;
    i <= period;
    i++
  ) {
    const difference =
      values[i] -
      values[i - 1];

    if (difference >= 0) {
      gains += difference;
    } else {
      losses += Math.abs(
        difference
      );
    }
  }

  let averageGain =
    gains / period;

  let averageLoss =
    losses / period;

  for (
    let i = period + 1;
    i < values.length;
    i++
  ) {
    const difference =
      values[i] -
      values[i - 1];

    const gain =
      difference > 0
        ? difference
        : 0;

    const loss =
      difference < 0
        ? Math.abs(difference)
        : 0;

    averageGain =
      ((averageGain *
        (period - 1)) +
        gain) /
      period;

    averageLoss =
      ((averageLoss *
        (period - 1)) +        loss) /
      period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength =
    averageGain /
    averageLoss;

  return (
    100 -
    100 /
      (1 + relativeStrength)
  );
}


/* =========================================================
   AI SIGNAL UPDATE
   ========================================================= */

function updateAI() {
  const candles =
    state.candles || [];

  if (candles.length < 20) {
    renderSignals(null);
    return;
  }

  const closes =
    candles.map(
      (candle) => candle.close
    );

  const fast =
    ema(closes, 9);

  const slow =
    ema(closes, 21);

  const latest =
    closes[closes.length - 1];

  const fastValue =
    fast[fast.length - 1];

  const slowValue =
    slow[slow.length - 1];

  const rsi =
    calculateRSI(
      closes,
      14
    );

  let direction =
    "NEUTRAL";

  if (
    fastValue > slowValue &&
    rsi >= 50
  ) {
    direction = "BUY";
  } else if (
    fastValue < slowValue &&
    rsi <= 50
  ) {
    direction = "SELL";
  }

  let confidence = 50;

  const distance =
    Math.abs(
      fastValue -
        slowValue
    );

  if (latest) {
    confidence += Math.min(
      25,
      (distance / latest) *
        10000
    );
  }

  if (
    direction === "BUY" &&
    rsi > 55
  ) {
    confidence += 10;
  }

  if (
    direction === "SELL" &&
    rsi < 45
  ) {
    confidence += 10;
  }

  confidence =
    Math.max(
      0,
      Math.min(
        99,
        Math.round(confidence)
      )
    );

  const signal = {
    symbol:
      state.activeSymbol,

    direction,

    confidence,

    price: latest,

    rsi:

      Number.isFinite(rsi)
        ? Number(rsi.toFixed(2))
        : 50,

    fastEMA:
      Number(
        fastValue.toFixed(6)
      ),

    slowEMA:
      Number(
        slowValue.toFixed(6)
      ),

    timeframe:
      state.timeframe,

    createdAt:
      Date.now()
  };

  state.activeSignal =
    signal;

  renderSignals(signal);
}


/* =========================================================
   SIGNAL RENDERING
   ========================================================= */

function renderSignals(signal) {
  const directionElement =
    $("ai-signal-direction");

  const confidenceElement =
    $("ai-signal-confidence");

  const priceElement =
    $("ai-signal-price");

  const rsiElement =
    $("ai-signal-rsi");

  if (!signal) {
    if (directionElement) {
      directionElement.textContent =
        "WAITING";
    }

    if (confidenceElement) {
      confidenceElement.textContent =
        "--";
    }

    return;
  }

  if (directionElement) {
    directionElement.textContent =
      signal.direction;
  }

  if (confidenceElement) {
    confidenceElement.textContent =
      signal.confidence +
      "%";
  }

  if (priceElement) {
    priceElement.textContent =
      formatPrice(
        signal.price
      );
  }

  if (rsiElement) {
    rsiElement.textContent =
      signal.rsi;
  }

  const signalCards =
    document.querySelectorAll(
      "[data-ai-signal]"
    );

  signalCards.forEach((card) => {
    card.dataset.signal =
      signal.direction
        .toLowerCase();

    card.classList.toggle(
      "buy",
      signal.direction ===
        "BUY"
    );

    card.classList.toggle(
      "sell",
      signal.direction ===
        "SELL"
    );

    card.classList.toggle(
      "neutral",
      signal.direction ===
        "NEUTRAL"
    );
  });
}


/* =========================================================
   SIGNAL MESSAGE
   ========================================================= */

function buildSignalMessage(
  signal
) {
  if (!signal) {
    return "";
  }

  return [
    "GoTradeX AI Signal",
    "",
    "Asset: " +
      symbolLabel(
        signal.symbol
      ),
    "Direction: " +
      signal.direction,
    "Confidence: " +
      signal.confidence +
      "%",
    "Price: " +
      formatPrice(
        signal.price
      ),
    "RSI: " +
      signal.rsi,
    "Timeframe: " +
      signal.timeframe,
    "",
    "Paper-trading signal only."
  ].join("\n");
}


/* =========================================================
   BROADCAST SIGNAL
   ========================================================= */

async function broadcastActiveSignal() {
  const signal =
    state.activeSignal;

  if (!signal) {
    showToast(
      "No AI signal available yet."
    );

    return;
  }

  const message =
    buildSignalMessage(signal);

  try {
    await sendSignal(
      message
    );

    showToast(
      "Signal sent successfully."
    );
  } catch (error) {
    console.error(
      "Signal broadcast failed:",
      error
    );

    showToast(
      "Signal could not be sent."
    );
  }
}


/* =========================================================
   SEND SIGNAL
   ========================================================= */

async function sendSignal(
  message
) {
  const webhook =
    String(
      state.settings
        ?.latenodeWebhook ||
      CONFIG.LATENODE_WEBHOOK ||
      ""
    ).trim();

  if (!webhook) {
    console.log(
      "Signal:",
      message
    );

    return {
      demo: true,
      message
    };
  }

  const response =
    await fetch(webhook, {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        message,
        source: "GoTradeX",
        timestamp:
          new Date().toISOString()
      })
    });

  if (!response.ok) {
    throw new Error(
      "Webhook returned " +
        response.status
    );
  }

  return response;
}


/* =========================================================
   NOTIFICATION SETTINGS
   ========================================================= */

function saveNotificationSettings() {
  const settings = {
    notifySignals:
      Boolean(
        $("notify-signals")
          ?.checked
      ),

    notifyBot:
      Boolean(
        $("notify-bot")
          ?.checked
      ),

    notifyMarket:
      Boolean(
        $("notify-market")
          ?.checked
      ),

    telegramChatId:
      $("telegram-chat-id")
        ?.value
        ?.trim() || "",

    telegramBotToken:
      $("telegram-bot-token")
        ?.value
        ?.trim() || "",

    whatsappPhone:
      $("whatsapp-phone")
        ?.value
        ?.trim() || "",

    whatsappApiKey:
      $("whatsapp-api-key")
        ?.value
        ?.trim() || "",

    latenodeWebhook:
      $("latenode-webhook")
        ?.value
        ?.trim() || ""
  };

  state.settings = {
    ...state.settings,
    ...settings
  };

  localStorage.setItem(
    "gotradex_settings",
    JSON.stringify(
      state.settings
    )
  );

  showToast(
    "Notification settings saved."
  );
}


function restoreNotificationSettings() {
  let settings = null;

  try {
    settings =
      JSON.parse(
        localStorage.getItem(
          "gotradex_settings"
        ) || "null"
      );
  } catch {
    settings = null;
  }

  if (!settings) {
    return;
  }

  state.settings = {
    ...state.settings,
    ...settings
  };

  const signalToggle =
    $("notify-signals");

  const botToggle =
    $("notify-bot");

  const marketToggle =
    $("notify-market");

  const telegramChat =
    $("telegram-chat-id");

  const telegramToken =
    $("telegram-bot-token");

  const whatsappPhone =
    $("whatsapp-phone");

  const whatsappKey =
    $("whatsapp-api-key");

  const webhook =
    $("latenode-webhook");

  if (signalToggle) {
    signalToggle.checked =
      Boolean(
        settings.notifySignals
      );
  }

  if (botToggle) {
    botToggle.checked =
      Boolean(
        settings.notifyBot
      );
  }

  if (marketToggle) {
    marketToggle.checked =
      Boolean(
        settings.notifyMarket
      );
  }

  if (telegramChat) {
    telegramChat.value =
      settings.telegramChatId ||
      "";
  }

  if (telegramToken) {
    telegramToken.value =
      settings.telegramBotToken ||
      "";
  }

  if (whatsappPhone) {
    whatsappPhone.value =
      settings.whatsappPhone ||
      "";
  }

  if (whatsappKey) {
    whatsappKey.value =
      settings.whatsappApiKey ||
      "";
  }

  if (webhook) {
    webhook.value =
      settings.latenodeWebhook ||
      "";
  }
}


/* =========================================================
   BACKEND SETTINGS
   ========================================================= */

function saveBackendSettings() {
  saveNotificationSettings();

  showToast(
    "Backend settings saved."
  );
}


/* =========================================================
   BOT CONTROL
   ========================================================= */

function toggleBot() {
  state.bot.enabled =
    !state.bot.enabled;

  localStorage.setItem(
    "gotradex_bot_enabled",
    state.bot.enabled
      ? "true"
      : "false"
  );

  renderAll();

  showToast(
    state.bot.enabled
      ? "AutoBot enabled."
      : "AutoBot disabled."
  );
}


/* =========================================================
   PAPER PORTFOLIO RESET
   ========================================================= */

function resetPaperPortfolio() {
  state.portfolio = {
    balance: 10000,
    equity: 10000,
    profit: 0,
    trades: [],
    openPositions: []
  };

  saveState();

  renderPortfolio();

  showToast(
    "Paper portfolio reset."
  );
}


/* =========================================================
   PORTFOLIO RENDERING
   ========================================================= */

function renderPortfolio() {
  const portfolio =
    state.portfolio;

  if (!portfolio) return;

  const balance =
    Number(
      portfolio.balance || 0
    );

  const equity =
    Number(
      portfolio.equity ||
        balance
    );

  const profit =
    Number(
      portfolio.profit || 0
    );

  const balanceElement =
    $("dashboard-balance");

  const equityElement =
    $("dashboard-equity");

  const profitElement =
    $("dashboard-profit");

  if (balanceElement) {
    balanceElement.textContent =
      "$" +
      balance.toLocaleString(
        undefined,
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }

  if (equityElement) {
    equityElement.textContent =
      "$" +
      equity.toLocaleString(
        undefined,
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }

  if (profitElement) {
    profitElement.textContent =
      (profit >= 0
        ? "+"
        : "") +
      "$" +
      profit.toLocaleString(
        undefined,
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );

    profitElement.classList.toggle(
      "positive",
      profit >= 0
    );

    profitElement.classList.toggle(
      "negative",
      profit < 0
    );
  }

  const botStatus =
    $("dashboard-bot-status");

  if (botStatus) {
    botStatus.textContent =
      state.bot.enabled
        ? "ACTIVE"
        : "OFF";
  }
}


/* =========================================================
   RENDER EVERYTHING
   ========================================================= */

function renderAll() {
  renderMarkets();

  renderPortfolio();

  renderSignals(
    state.activeSignal
  );

  if (
    state.activeSymbol &&
    state.markets[state.activeSymbol]
  ) {
    updateDashboardMarket(
      state.markets[
        state.activeSymbol
      ]
    );
  }

  updateDashboardUser();
}
/* =========================================================
   PAPER TRADE EXECUTION
   ========================================================= */

function executePaperTrade(
  symbol,
  side
) {
  symbol =
    symbol ||
    state.activeSymbol ||
    "BTCUSDT";

  side =
    String(side || "BUY")
      .toUpperCase();

  if (
    side !== "BUY" &&
    side !== "SELL"
  ) {
    showToast(
      "Invalid trade direction."
    );

    return;
  }

  const market =
    state.markets[symbol] ||
    DEMO_MARKETS[symbol];

  if (!market) {
    showToast(
      "Market data is unavailable."
    );

    return;
  }

  const price =
    Number(market.price);

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    showToast(
      "Invalid market price."
    );

    return;
  }

  const riskElement =
    $("risk-level");

  const risk =
    Number(
      riskElement?.value || 1
    );

  const amount =
    Math.max(
      10,
      Math.min(
        state.portfolio.balance,
        state.portfolio.balance *
          (risk / 100)
      )
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    showToast(
      "Insufficient paper balance."
    );

    return;
  }

  const quantity =
    amount / price;

  const trade = {
    id:
      "trade_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .slice(2, 8),

    symbol,

    side,

    price,

    quantity,

    amount,

    timestamp:
      Date.now(),

    status: "OPEN"
  };

  if (!Array.isArray(
    state.portfolio.trades
  )) {
    state.portfolio.trades = [];
  }

  if (!Array.isArray(
    state.portfolio.openPositions
  )) {
    state.portfolio.openPositions = [];
  }

  state.portfolio.trades.unshift(
    trade
  );

  state.portfolio.openPositions.push(
    trade
  );

  /*
   * Paper trading only:
   * reserve the position amount
   * without touching any real funds.
   */

  state.portfolio.balance -= amount;

  state.portfolio.equity =
    state.portfolio.balance +
    state.portfolio.openPositions.reduce(
      (total, position) => {
        const currentMarket =
          state.markets[
            position.symbol
          ] ||
          DEMO_MARKETS[
            position.symbol
          ];

        const currentPrice =
          Number(
            currentMarket?.price ||
            position.price
          );

        const positionValue =
          position.quantity *
          currentPrice;

        return (
          total +
          positionValue
        );
      },
      0
    );

  saveState();

  renderPortfolio();

  showToast(
    `${side} paper trade opened on ${symbolLabel(symbol)}`
  );

  /*
   * Keep the dashboard on the current
   * selected asset after a trade.
   */

  if (
    state.activeSymbol !== symbol
  ) {
    state.activeSymbol =
      symbol;
  }
}


/* =========================================================
   PAPER POSITION REFRESH
   ========================================================= */

function refreshPaperPositions() {
  if (
    !state.portfolio ||
    !Array.isArray(
      state.portfolio.openPositions
    )
  ) {
    return;
  }

  let openValue = 0;
  let floatingProfit = 0;

  state.portfolio.openPositions.forEach(
    (position) => {
      const market =
        state.markets[
          position.symbol
        ] ||
        DEMO_MARKETS[
          position.symbol
        ];

      const currentPrice =
        Number(
          market?.price ||
          position.price
        );

      const value =
        position.quantity *
        currentPrice;

      openValue += value;

      if (
        position.side === "BUY"
      ) {
        floatingProfit +=
          (currentPrice -
            position.price) *
          position.quantity;
      } else {
        floatingProfit +=
          (position.price -
            currentPrice) *
          position.quantity;
      }
    }
  );

  state.portfolio.equity =
    state.portfolio.balance +
    openValue;

  state.portfolio.floatingProfit =
    floatingProfit;

  renderPortfolio();
}


/* =========================================================
   LOCAL STATE PERSISTENCE
   ========================================================= */

function saveState() {
  try {
    const saved = {
      portfolio:
        state.portfolio,

      bot:
        state.bot,

      settings:
        state.settings,

      activeSymbol:
        state.activeSymbol,

      timeframe:
        state.timeframe
    };
    localStorage.setItem(
      "gotradex_state",
      JSON.stringify(saved)
    );
  } catch (error) {
    console.warn(
      "Could not save GoTradeX state:",
      error
    );
  }
}


function restoreLocalState() {
  try {
    const raw =
      localStorage.getItem(
        "gotradex_state"
      );

    if (!raw) {
      return;
    }

    const saved =
      JSON.parse(raw);

    if (
      saved &&
      saved.portfolio
    ) {
      state.portfolio = {
        ...state.portfolio,
        ...saved.portfolio
      };
    }

    if (
      saved &&
      saved.bot
    ) {
      state.bot = {
        ...state.bot,
        ...saved.bot
      };
    }

    if (
      saved &&
      saved.settings
    ) {
      state.settings = {
        ...state.settings,
        ...saved.settings
      };
    }

    if (
      saved &&
      saved.activeSymbol
    ) {
      state.activeSymbol =
        saved.activeSymbol;
    }

    if (
      saved &&
      saved.timeframe
    ) {
      state.timeframe =
        saved.timeframe;
    }
  } catch (error) {
    console.warn(
      "Could not restore GoTradeX state:",
      error
    );
  }

  const botEnabled =
    localStorage.getItem(
      "gotradex_bot_enabled"
    );

  if (
    botEnabled === "true"
  ) {
    state.bot.enabled =
      true;
  }

  if (
    botEnabled === "false"
  ) {
    state.bot.enabled =
      false;
  }
}


/* =========================================================
   DASHBOARD USER
   ========================================================= */

function updateDashboardUser() {
  const element =
    getAuthElement(
      "sidebar-username",
      "dashboard-user-name"
    );

  if (element) {
    element.textContent =
      state.user?.name ||
      "Trader_Pro";
  }

  const emailElement =
    getAuthElement(
      "sidebar-email",
      "dashboard-user-email"
    );

  if (
    emailElement &&
    state.user?.email
  ) {
    emailElement.textContent =
      state.user.email;
  }

  const settingsName =
    $("settings-name");

  if (
    settingsName &&
    state.user?.name &&
    !settingsName.value
  ) {
    settingsName.value =
      state.user.name;
  }

  const settingsEmail =
    $("settings-email");

  if (
    settingsEmail &&
    state.user?.email &&
    !settingsEmail.value
  ) {
    settingsEmail.value =
      state.user.email;
  }

  const settingsCountry =
    $("settings-country");

  if (
    settingsCountry &&
    state.user?.country &&
    !settingsCountry.value
  ) {
    settingsCountry.value =
      state.user.country;
  }
}


/* =========================================================
   PROFILE SETTINGS
   ========================================================= */

async function saveProfileSettings() {
  const name =
    $("settings-name")
      ?.value
      ?.trim() || "";

  const country =
    $("settings-country")
      ?.value
      ?.trim() || "";

  if (!state.user) {
    showToast(
      "Please log in first."
    );

    return;
  }

  state.user.name =
    name ||
    state.user.name ||
    "Trader_Pro";

  state.user.country =
    country;

  localStorage.setItem(
    "gotradex_profile",
    JSON.stringify(
      state.user
    )
  );

  if (
    supabaseClient &&
    state.supabaseUser
  ) {
    try {
      await supabaseClient
        .from("profiles")
        .upsert({
          id:
            state.supabaseUser.id,

          name:
            state.user.name,

          country:
            state.user.country,

          email:
            state.user.email
        });
    } catch (error) {
      console.warn(
        "Profile database update failed:",
        error
      );
    }
  }

  updateDashboardUser();

  showToast(
    "Profile settings saved."
  );
}


/* =========================================================
   BOT STATUS
   ========================================================= */

function updateBotStatus() {
  const status =
    $("dashboard-bot-status");

  if (!status) {
    return;
  }

  status.textContent =
    state.bot.enabled
      ? "ACTIVE"
      : "OFF";

  status.classList.toggle(
    "active",
    state.bot.enabled
  );

  status.classList.toggle(
    "inactive",
    !state.bot.enabled
  );
}


/* =========================================================
   RISK CONTROLS
   ========================================================= */

function bindRiskControls() {
  const risk =
    $("risk-level");

  const drawdown =
    $("max-drawdown");

  if (risk) {
    risk.addEventListener(
      "input",
      () => {
        renderPortfolio();
      }
    );
  }

  if (drawdown) {
    drawdown.addEventListener(
      "input",
      () => {
        renderPortfolio();
      }
    );
  }
}


/* =========================================================
   AUTO REFRESH
   ========================================================= */

let marketRefreshTimer =
  null;

function startMarketRefresh() {
  if (
    marketRefreshTimer
  ) {
    clearInterval(
      marketRefreshTimer
    );
  }

  marketRefreshTimer =
    setInterval(
      async () => {
        if (
          !state.isLoggedIn
        ) {
          return;
        }

        await refreshMarkets();

        refreshPaperPositions();

        if (
          state.activeSymbol
        ) {
          analyzeActiveAsset();
        }
      },
      30000
    );
}


/* =========================================================
   MODAL
   ========================================================= */

function closeModal() {
  const modal =
    $("app-modal");

  if (!modal) {
    return;
  }

  modal.style.display =
    "none";
}

function openModal(
  title,
  body,
  actions = ""
) {
  const modal =
    $("app-modal");

  if (!modal) {
    return;
  }

  const titleElement =
    $("modal-title");

  const bodyElement =
    $("modal-body");

  const actionsElement =
    $("modal-actions");

  if (titleElement) {
    titleElement.textContent =
      title || "";
  }

  if (bodyElement) {
    bodyElement.innerHTML =
      body || "";
  }

  if (actionsElement) {
    actionsElement.innerHTML =
      actions || "";
  }

  modal.style.display =
    "flex";
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message) {
  if (!message) {
    return;
  }

  const container =
    $("toast-container");

  if (!container) {
    console.log(
      "GoTradeX:",
      message
    );

    return;
  }

  const toast =
    document.createElement(
      "div"
    );

  toast.className =
    "toast";

  toast.textContent =
    String(message);

  container.appendChild(
    toast
  );

  setTimeout(() => {
    toast.classList.add(
      "show"
    );
  }, 10);

  setTimeout(() => {
    toast.classList.remove(
      "show"
    );

    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}


/* =========================================================
   SETTINGS SAVE BUTTON
   ========================================================= */

function saveAllSettings() {
  saveNotificationSettings();

  saveProfileSettings();
}


/* =========================================================
   FINAL INITIALIZATION
   ========================================================= */

function finishGoTradeXInitialization() {
  restoreLocalState();

  restoreNotificationSettings();

  updateDashboardUser();

  updateBotStatus();

  renderPortfolio();

  renderMarkets();

  if (
    state.activeSymbol
  ) {
    loadCandles(
      state.activeSymbol,
      state.timeframe
    );
  }

  startMarketRefresh();

  console.log(
    "GoTradeX initialized.",
    APP_VERSION
  );
}


/* =========================================================
   GLOBAL EXPORTS
   ========================================================= */

window.GoTradeX = {
  APP_VERSION,

  state,

  login:
    handleAuth,

  signup:
    handleAuth,

  resetPassword,

  logout,

  restoreSupabaseSession,

  openMainApp
};


/* =========================================================
   AUTH GLOBAL FUNCTIONS
   ========================================================= */

window.switchAuth =
  switchAuth;

window.handleAuth =
  handleAuth;

window.handleAuthSubmit =
  handleAuth;

window.showForgotPassword =
  showForgotPassword;

window.showLoginPage =
  showLoginPage;

window.showSignupPage =
  showSignupPage;

window.resetPassword =
  resetPassword;

window.logout =
  logout;

window.logoutAccount =
  logout;


/* =========================================================
   TRADING GLOBAL FUNCTIONS
   ========================================================= */

window.executePaperTrade =
  executePaperTrade;

window.openMainApp =
  openMainApp;

window.openApp =
  openApp;

window.refreshMarkets =
  refreshMarkets;

window.openSection =
  openSection;

window.toggleBot =
  toggleBot;

window.analyzeActiveAsset =
  analyzeActiveAsset;

window.broadcastActiveSignal =
  broadcastActiveSignal;

window.selectAsset =
  selectAsset;

window.resetPaperPortfolio =
  resetPaperPortfolio;


/* =========================================================
   SETTINGS GLOBAL FUNCTIONS
   ========================================================= */

window.saveNotificationSettings =
  saveNotificationSettings;

window.saveBackendSettings =
  saveBackendSettings;

window.saveProfileSettings =
  saveProfileSettings;

window.saveAllSettings =
  saveAllSettings;

window.closeModal =
  closeModal;

window.openModal =
  openModal;

window.showToast =
  showToast;


/* =========================================================
   FINAL CONTROL BINDINGS
   ========================================================= */

const riskLevel =
  $("risk-level");

if (riskLevel) {
  riskLevel.addEventListener(
    "change",
    () => {
      renderPortfolio();
    }
  );
}


const maxDrawdown =
  $("max-drawdown");

if (maxDrawdown) {
  maxDrawdown.addEventListener(
    "input",
    () => {
      renderPortfolio();
    }
  );
}


/* =========================================================
   GO TRADEX READY
   ========================================================= */

console.log(
  "GoTradeX Part 3 loaded.",
  APP_VERSION
);

/* =========================================================
   GOTRADEX STABILITY REPAIR LAYER
   ========================================================= */
(function () {
  const symbols = ["BTCUSDT","ETHUSDT","XAUUSD","EURUSD","GBPUSD"];

  symbols.forEach((symbol) => {
    const item = DEMO_MARKETS.find((m) => m && m.symbol === symbol);
    if (!item) return;
    item.change = Number(item.change ?? item.change30d ?? 0);
    Object.defineProperty(DEMO_MARKETS, symbol, { value:item, enumerable:false, configurable:true, writable:true });
  });

  state.markets = (state.markets && !Array.isArray(state.markets)) ? state.markets : {};
  state.activeSignal = state.activeSignal || null;
  state.portfolio = { balance:10000,equity:10000,profit:0,floatingProfit:0,trades:[],openPositions:[],...(state.portfolio||{}) };
  state.bot = { enabled:false,symbol:"BTCUSDT",timeframe:"1H",risk:"1",minConfidence:"70",maxDrawdown:10,...(state.bot||{}) };
  state.settings = { notifySignals:true,notifyBot:true,notifyMarket:true,telegramChatId:"",telegramBotToken:"",whatsappPhone:"",whatsappApiKey:"",latenodeWebhook:"",...(state.settings||{}) };

  const escapeHtml = (v)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  window.escapeHtml=escapeHtml;

  function toast(message,type="success"){
    if(!message)return;
    const box=$("toast-container")||$("toast");
    if(!box)return console.log("GoTradeX:",message);
    if(box.id==="toast-container"){
      const el=document.createElement("div"); el.className="toast "+type; el.textContent=String(message); box.appendChild(el);
      requestAnimationFrame(()=>el.classList.add("show"));
      setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.remove(),300);},3000);
    }else{box.textContent=String(message);box.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>box.classList.remove("show"),3500);}
  }
  showToast=toast; window.showToast=toast;

  function saveStable(){
    try{localStorage.setItem("gotradex_state",JSON.stringify({
      portfolio:state.portfolio,bot:state.bot,settings:state.settings,activeSymbol:state.activeSymbol,timeframe:state.timeframe,
      user:state.user,signals:state.signals,activeSignal:state.activeSignal,lastSignal:state.lastSignal
    }));}catch(e){console.warn("Could not save GoTradeX state:",e);}
  }
  function loadStable(){
    try{
      const saved=JSON.parse(localStorage.getItem("gotradex_state")||"null");
      if(saved?.portfolio)state.portfolio={...state.portfolio,...saved.portfolio};
      if(saved?.bot)state.bot={...state.bot,...saved.bot};
      if(saved?.settings)state.settings={...state.settings,...saved.settings};
      if(saved?.activeSymbol)state.activeSymbol=saved.activeSymbol;
      if(saved?.timeframe)state.timeframe=saved.timeframe;
      if(saved?.user)state.user=saved.user;
      if(Array.isArray(saved?.signals))state.signals=saved.signals;
      if(saved?.activeSignal)state.activeSignal=saved.activeSignal;
      if(saved?.lastSignal)state.lastSignal=saved.lastSignal;
      const bot=localStorage.getItem("gotradex_bot_enabled");
      if(bot==="true")state.bot.enabled=true;if(bot==="false")state.bot.enabled=false;
    }catch(e){console.warn("GoTradeX local state warning:",e);}
    state.portfolio.trades=Array.isArray(state.portfolio.trades)?state.portfolio.trades:[];
    state.portfolio.openPositions=Array.isArray(state.portfolio.openPositions)?state.portfolio.openPositions:[];
    state.signals=Array.isArray(state.signals)?state.signals:[];
  }
  loadLocalState=loadStable; restoreLocalState=loadStable; saveState=saveStable; persist=saveStable;

  function botStatus(){
    const active=!!state.bot?.enabled;
    const d=$("dashboard-bot-status");if(d){d.textContent=active?"ACTIVE":"OFF";d.classList.toggle("active",active);d.classList.toggle("inactive",!active);}
    const r=$("robot-page-status");if(r)r.textContent=active?"ONLINE":"OFFLINE";
    const l=$("bot-power-label");if(l)l.textContent=active?"Stop AutoBot":"Start AutoBot";
    const s=$("bot-stat-status");if(s)s.textContent=active?"Running":"Stopped";
    const sy=$("bot-stat-symbol");if(sy)sy.textContent=state.bot?.symbol||state.activeSymbol||"BTCUSDT";
    const tr=$("bot-stat-trades");if(tr)tr.textContent=String(state.portfolio?.trades?.length||0);
    [["bot-symbol",state.bot?.symbol],["bot-timeframe",state.bot?.timeframe],["bot-risk",state.bot?.risk],["bot-min-confidence",state.bot?.minConfidence]].forEach(([id,v])=>{const el=$(id);if(el&&v)el.value=v;});
  }
  updateBotStatus=botStatus;

  async function refreshStable(){
    state.loadingMarkets=true;renderMarkets();
    const results=await Promise.all(symbols.map(fetchOneMarket));
    results.forEach((m)=>{if(m?.symbol)state.markets[m.symbol]=m;});
    state.loadingMarkets=false;renderMarkets();
    if(state.markets[state.activeSymbol])updateDashboardMarket(state.markets[state.activeSymbol]);
  }
  refreshMarkets=refreshStable;window.refreshMarkets=refreshStable;

  function sectionStable(section){
    const name=String(section||"dashboard").replace(/-section$/,"");
    document.querySelectorAll(".nav-item").forEach((b)=>b.classList.toggle("active",b.dataset.section===name));
    document.querySelectorAll(".app-section").forEach((el)=>{const active=el.id===name+"-section";el.classList.toggle("active",active);el.style.display=active?"block":"none";});
    if(name==="markets")renderMarkets();if(name==="signals")renderSignals(state.activeSignal);if(name==="portfolio")renderPortfolio();if(name==="robot")botStatus();
  }
  openSection=sectionStable;window.openSection=sectionStable;

  bindNavigation=function(){document.querySelectorAll(".nav-item").forEach((b)=>{if(b.dataset.navigationBound==="true")return;b.dataset.navigationBound="true";b.addEventListener("click",()=>sectionStable(b.dataset.section));});};
  bindSearch=function(){const input=$("global-market-search")||$("asset-search");if(!input||input.dataset.searchBound==="true")return;input.dataset.searchBound="true";input.addEventListener("input",(e)=>renderMarkets(e.target.value));};

  function appStable(){
    const app=getAppRoot(),overlay=getAuthOverlay();
    const hidden=!!(app?.classList.contains("hidden")||app?.style.display==="none");
    setHidden(overlay,true);setHidden(app,false);updateDashboardUser();botStatus();renderAll();
    if(hidden||!marketRefreshTimer){refreshStable().catch((e)=>console.warn("Market refresh warning:",e));if(state.activeSymbol)loadCandles(state.activeSymbol,state.timeframe);startMarketRefresh();}
  }
  openApp=appStable;openMainApp=appStable;window.openApp=appStable;window.openMainApp=appStable;

  togglePassword=function(){const input=$("auth-password"),eye=$("password-eye");if(!input)return;const show=input.type==="text";input.type=show?"password":"text";if(eye){eye.classList.toggle("fa-eye",show);eye.classList.toggle("fa-eye-slash",!show);}};
  changePassword=async function(){const client=initSupabaseClient();if(!client||!state.isLoggedIn)return toast("Please log in first.","error");const p=window.prompt("Enter your new password (minimum 6 characters):");if(p===null)return;if(p.length<6)return toast("Password must be at least 6 characters.","error");const c=window.prompt("Confirm your new password:");if(c!==p)return toast("Passwords do not match.","error");const{error}=await client.auth.updateUser({password:p});if(error)return toast(error.message||"Could not change password.","error");toast("Password changed successfully.");};
  saveAccountSettings=function(){return saveProfileSettings();};
  saveBotSettings=function(){state.bot={...state.bot,symbol:$("bot-symbol")?.value||state.bot.symbol,timeframe:$("bot-timeframe")?.value||state.bot.timeframe,risk:$("bot-risk")?.value||state.bot.risk,minConfidence:$("bot-min-confidence")?.value||state.bot.minConfidence};state.activeSymbol=state.bot.symbol;state.timeframe=state.bot.timeframe;saveStable();botStatus();toast("AutoBot settings saved.");};
  runAIAnalysis=async function(){if(!state.activeSymbol)state.activeSymbol="BTCUSDT";await loadCandles(state.activeSymbol,state.timeframe);sectionStable("signals");};
  clearSignalHistory=function(){state.signals=[];state.activeSignal=null;state.lastSignal=null;saveStable();renderSignals(null);toast("Signal history cleared.");};
  showNotifications=function(){const panel=$("notification-panel");if(!panel)return;panel.style.display=panel.style.display==="block"?"none":"block";const list=$("notification-list");if(!list)return;const rows=Array.isArray(state.signals)?state.signals.slice(-10).reverse():[];list.innerHTML=rows.length?rows.map((s)=>'<div class="notification-item"><strong>'+escapeHtml(s.symbol||"Market")+'</strong><span>'+escapeHtml(s.direction||"Signal")+'</span></div>').join(""):'<div class="empty-state">No notifications yet.</div>';};
  closeNotifications=function(){const p=$("notification-panel");if(p)p.style.display="none";};
  showRules=function(){openModal("Rules & Regulations","<p>GoTradeX is a paper-trading dashboard and does not place real broker orders.</p><p>Market data may be live or demo fallback data. Signals are analytical outputs, not financial advice.</p>");};
  showHelp=function(){openModal("Help & Support","<p><strong>Dashboard:</strong> paper balance and markets.</p><p><strong>Markets:</strong> select an asset for its chart.</p><p><strong>AI Signals:</strong> run analysis and review signals.</p><p><strong>AutoBot:</strong> paper-trading automation only.</p><p><strong>Settings:</strong> profile, notifications and Latenode webhook.</p>");};
  clearLocalData=function(){if(!window.confirm("Clear saved GoTradeX paper-trading data and settings? Your Supabase account will not be deleted."))return;["gotradex_state","gotradex_settings","gotradex_bot_enabled","gotradex_profile"].forEach((k)=>localStorage.removeItem(k));state.portfolio={balance:10000,equity:10000,profit:0,floatingProfit:0,trades:[],openPositions:[]};state.bot={enabled:false,symbol:"BTCUSDT",timeframe:"1H",risk:"1",minConfidence:"70",maxDrawdown:10};state.signals=[];state.activeSignal=null;state.lastSignal=null;state.settings={notifySignals:true,notifyBot:true,notifyMarket:true,telegramChatId:"",telegramBotToken:"",whatsappPhone:"",whatsappApiKey:"",latenodeWebhook:""};botStatus();renderAll();toast("Local GoTradeX data cleared.");};
  testLatenodeWebhook=async function(){saveNotificationSettings();const url=String(state.settings?.latenodeWebhook||"").trim();if(!url)return toast("Enter a Latenode webhook URL first.","warning");try{const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:"GoTradeX",type:"test",message:"GoTradeX webhook test",timestamp:new Date().toISOString()})});if(!response.ok)throw new Error("Webhook returned "+response.status);toast("Latenode webhook test succeeded.");}catch(e){console.error(e);toast("Webhook test failed. Check the URL and CORS settings.","error");}};

  Object.assign(window,{togglePassword,changePassword,saveAccountSettings,saveBotSettings,runAIAnalysis,clearSignalHistory,showNotifications,closeNotifications,showRules,showHelp,clearLocalData,testLatenodeWebhook,logoutAccount:logout});

  init=function(){
    console.log("GoTradeX initializing...");

    const authForm=$("auth-form");
    if(authForm && authForm.dataset.authBound!=="true"){
      authForm.dataset.authBound="true";
      authForm.addEventListener("submit",(event)=>{handleAuth(event);});
    }

    const forgotForm=$("forgot-password-form");
    if(forgotForm && forgotForm.dataset.resetBound!=="true"){
      forgotForm.dataset.resetBound="true";
      forgotForm.addEventListener("submit",(event)=>{resetPassword(event);});
    }

    const loader=$("app-loader");
    if(loader) loader.style.display="none";

    loadStable();restoreNotificationSettings();bindNavigation();bindSearch();bindTimeframes();setupSupabaseAuthListener();
    restoreSupabaseSession().then((restored)=>{if(restored||state.isLoggedIn)appStable();else{setHidden(getAppRoot(),true);setHidden(getAuthOverlay(),false);showLoginPage();}updateDashboardUser();botStatus();renderAll();console.log("GoTradeX initialized.",APP_VERSION);})
      .catch((e)=>{console.warn("GoTradeX startup warning:",e);setHidden(getAppRoot(),true);setHidden(getAuthOverlay(),false);showLoginPage();});
  };
})();
