/* GoTradeX - unified frontend
   Clean single-file version
   Authentication uses Supabase.
*/

const APP_VERSION = "1.0.0";

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

  element.classList.toggle("hidden", hidden);
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

async function resetPassword() {
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

  window.__gotradexAuthListener =

/* =========================================================
   GOTRADEX STABILITY REPAIR LAYER
   ========================================================= */
(function () {
  const symbols = ["BTCUSDT","ETHUSDT","XAUUSD","EURUSD","GBPUSD"];

  symbols.forEach((symbol) => {
    const item = DEMO_MARKETS.find((m) => m && m.symbol === symbol);
    if (!item) return;
    item.change = Number(item.change ?? item.change30d ?? 0);
    Object.defineProperty(DEMO_MARKETS, symbol, {
      value: item, enumerable: false, configurable: true, writable: true
    });
  });

  state.markets = (state.markets && !Array.isArray(state.markets)) ? state.markets : {};
  state.activeSignal = state.activeSignal || null;
  state.portfolio = {
    balance: 10000, equity: 10000, profit: 0, floatingProfit: 0,
    trades: [], openPositions: [], ...(state.portfolio || {})
  };
  state.bot = {
    enabled: false, symbol: "BTCUSDT", timeframe: "1H",
    risk: "1", minConfidence: "70", maxDrawdown: 10, ...(state.bot || {})
  };
  state.settings = {
    notifySignals: true, notifyBot: true, notifyMarket: true,
    telegramChatId: "", telegramBotToken: "", whatsappPhone: "",
    whatsappApiKey: "", latenodeWebhook: "", ...(state.settings || {})
  };

  const escapeHtml = (v) => String(v ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  window.escapeHtml = escapeHtml;

  function toast(message, type = "success") {
    if (!message) return;
    const box = $("toast-container") || $("toast");
    if (!box) return console.log("GoTradeX:", message);
    if (box.id === "toast-container") {
      const el = document.createElement("div");
      el.className = "toast " + type;
      el.textContent = String(message);
      box.appendChild(el);
      requestAnimationFrame(() => el.classList.add("show"));
      setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(),300); }, 3000);
    } else {
      box.textContent = String(message);
      box.classList.add("show");
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => box.classList.remove("show"), 3500);
    }
  }
  showToast = toast;
  window.showToast = toast;

  function saveStable() {
    try {
      localStorage.setItem("gotradex_state", JSON.stringify({
        portfolio: state.portfolio, bot: state.bot, settings: state.settings,
        activeSymbol: state.activeSymbol, timeframe: state.timeframe,
        user: state.user, signals: state.signals,
        activeSignal: state.activeSignal, lastSignal: state.lastSignal
      }));
    } catch (e) { console.warn("Could not save GoTradeX state:", e); }
  }

  function loadStable() {
    try {
      const saved = JSON.parse(localStorage.getItem("gotradex_state") || "null");
      if (saved?.portfolio) state.portfolio = {...state.portfolio,...saved.portfolio};
      if (saved?.bot) state.bot = {...state.bot,...saved.bot};
      if (saved?.settings) state.settings = {...state.settings,...saved.settings};
      if (saved?.activeSymbol) state.activeSymbol = saved.activeSymbol;
      if (saved?.timeframe) state.timeframe = saved.timeframe;
      if (saved?.user) state.user = saved.user;
      if (Array.isArray(saved?.signals)) state.signals = saved.signals;
      if (saved?.activeSignal) state.activeSignal = saved.activeSignal;
      if (saved?.lastSignal) state.lastSignal = saved.lastSignal;
      const bot = localStorage.getItem("gotradex_bot_enabled");
      if (bot === "true") state.bot.enabled = true;
      if (bot === "false") state.bot.enabled = false;
    } catch (e) { console.warn("GoTradeX local state warning:", e); }
    state.portfolio.trades = Array.isArray(state.portfolio.trades) ? state.portfolio.trades : [];
    state.portfolio.openPositions = Array.isArray(state.portfolio.openPositions) ? state.portfolio.openPositions : [];
    state.signals = Array.isArray(state.signals) ? state.signals : [];
  }
  loadLocalState = loadStable;
  restoreLocalState = loadStable;
  saveState = saveStable;
  persist = saveStable;

  function botStatus() {
    const active = !!state.bot?.enabled;
    const d = $("dashboard-bot-status"); if (d) { d.textContent = active ? "ACTIVE":"OFF"; d.classList.toggle("active",active); d.classList.toggle("inactive",!active); }
    const r = $("robot-page-status"); if (r) r.textContent = active ? "ONLINE":"OFFLINE";
    const l = $("bot-power-label"); if (l) l.textContent = active ? "Stop AutoBot":"Start AutoBot";
    const s = $("bot-stat-status"); if (s) s.textContent = active ? "Running":"Stopped";
    const sy = $("bot-stat-symbol"); if (sy) sy.textContent = state.bot?.symbol || state.activeSymbol || "BTCUSDT";
    const tr = $("bot-stat-trades"); if (tr) tr.textContent = String(state.portfolio?.trades?.length || 0);
    [["bot-symbol",state.bot?.symbol],["bot-timeframe",state.bot?.timeframe],["bot-risk",state.bot?.risk],["bot-min-confidence",state.bot?.minConfidence]]
      .forEach(([id,v]) => { const el=$(id); if(el && v) el.value=v; });
  }
  updateBotStatus = botStatus;

  async function refreshStable() {
    state.loadingMarkets = true; renderMarkets();
    const results = await Promise.all(symbols.map(fetchOneMarket));
    results.forEach((m) => { if (m?.symbol) state.markets[m.symbol] = m; });
    state.loadingMarkets = false; renderMarkets();
    if (state.markets[state.activeSymbol]) updateDashboardMarket(state.markets[state.activeSymbol]);
  }
  refreshMarkets = refreshStable;
  window.refreshMarkets = refreshStable;

  function sectionStable(section) {
    const name = String(section || "dashboard").replace(/-section$/,"");
    document.querySelectorAll(".nav-item").forEach((b)=>b.classList.toggle("active",b.dataset.section===name));
    document.querySelectorAll(".app-section").forEach((el)=>{
      const active = el.id === name + "-section";
      el.classList.toggle("active",active); el.style.display=active ? "block":"none";
    });
    if (name==="markets") renderMarkets();
    if (name==="signals") renderSignals(state.activeSignal);
    if (name==="portfolio") renderPortfolio();
    if (name==="robot") botStatus();
  }
  openSection = sectionStable; window.openSection = sectionStable;

  bindNavigation = function () {
    document.querySelectorAll(".nav-item").forEach((b)=>{
      if (b.dataset.navigationBound==="true") return;
      b.dataset.navigationBound="true";
      b.addEventListener("click",()=>sectionStable(b.dataset.section));
    });
  };

  bindSearch = function () {
    const input = $("global-market-search") || $("asset-search");
    if (!input || input.dataset.searchBound==="true") return;
    input.dataset.searchBound="true";
    input.addEventListener("input",(e)=>renderMarkets(e.target.value));
  };

  function appStable() {
    const app=getAppRoot(), overlay=getAuthOverlay();
    const hidden=!!(app?.classList.contains("hidden") || app?.style.display==="none");
    setHidden(overlay,true); setHidden(app,false);
    updateDashboardUser(); botStatus(); renderAll();
    if (hidden || !marketRefreshTimer) {
      refreshStable().catch((e)=>console.warn("Market refresh warning:",e));
      if (state.activeSymbol) loadCandles(state.activeSymbol,state.timeframe);
      startMarketRefresh();
    }
  }
  openApp=appStable; openMainApp=appStable; window.openApp=appStable; window.openMainApp=appStable;

  togglePassword = function () {
    const input=$("auth-password"), eye=$("password-eye"); if(!input) return;
    const show=input.type==="text"; input.type=show?"password":"text";
    if(eye){eye.classList.toggle("fa-eye",show);eye.classList.toggle("fa-eye-slash",!show);}
  };

  changePassword = async function () {
    const client=initSupabaseClient();
    if(!client || !state.isLoggedIn) return toast("Please log in first.","error");
    const p=window.prompt("Enter your new password (minimum 6 characters):");
    if(p===null) return; if(p.length<6) return toast("Password must be at least 6 characters.","error");
    const c=window.prompt("Confirm your new password:");
    if(c!==p) return toast("Passwords do not match.","error");
    const {error}=await client.auth.updateUser({password:p});
    if(error) return toast(error.message || "Could not change password.","error");
    toast("Password changed successfully.");
  };

  saveAccountSettings = function(){ return saveProfileSettings(); };
  saveBotSettings = function(){
    state.bot={...state.bot,
      symbol:$("bot-symbol")?.value || state.bot.symbol,
      timeframe:$("bot-timeframe")?.value || state.bot.timeframe,
      risk:$("bot-risk")?.value || state.bot.risk,
      minConfidence:$("bot-min-confidence")?.value || state.bot.minConfidence
    };
    state.activeSymbol=state.bot.symbol; state.timeframe=state.bot.timeframe;
    saveStable(); botStatus(); toast("AutoBot settings saved.");
  };

  runAIAnalysis = async function(){
    if(!state.activeSymbol) state.activeSymbol="BTCUSDT";
    await loadCandles(state.activeSymbol,state.timeframe);
    sectionStable("signals");
  };

  clearSignalHistory = function(){
    state.signals=[]; state.activeSignal=null; state.lastSignal=null;
    saveStable(); renderSignals(null); toast("Signal history cleared.");
  };

  showNotifications = function(){
    const panel=$("notification-panel"); if(!panel) return;
    panel.style.display=panel.style.display==="block"?"none":"block";
    const list=$("notification-list"); if(!list) return;
    const rows=Array.isArray(state.signals)?state.signals.slice(-10).reverse():[];
    list.innerHTML=rows.length
      ? rows.map((s)=>'<div class="notification-item"><strong>'+escapeHtml(s.symbol||"Market")+'</strong><span>'+escapeHtml(s.direction||"Signal")+'</span></div>').join("")
      : '<div class="empty-state">No notifications yet.</div>';
  };
  closeNotifications = function(){const p=$("notification-panel");if(p)p.style.display="none";};
  showRules = function(){openModal("Rules & Regulations","<p>GoTradeX is a paper-trading dashboard and does not place real broker orders.</p><p>Market data may be live or demo fallback data. Signals are analytical outputs, not financial advice.</p>");};
  showHelp = function(){openModal("Help & Support","<p><strong>Dashboard:</strong> paper balance and markets.</p><p><strong>Markets:</strong> select an asset for its chart.</p><p><strong>AI Signals:</strong> run analysis and review signals.</p><p><strong>AutoBot:</strong> paper-trading automation only.</p><p><strong>Settings:</strong> profile, notifications and Latenode webhook.</p>");};
  clearLocalData = function(){
    if(!window.confirm("Clear saved GoTradeX paper-trading data and settings? Your Supabase account will not be deleted.")) return;
    ["gotradex_state","gotradex_settings","gotradex_bot_enabled","gotradex_profile"].forEach((k)=>localStorage.removeItem(k));
    state.portfolio={balance:10000,equity:10000,profit:0,floatingProfit:0,trades:[],openPositions:[]};
    state.bot={enabled:false,symbol:"BTCUSDT",timeframe:"1H",risk:"1",minConfidence:"70",maxDrawdown:10};
    state.signals=[]; state.activeSignal=null; state.lastSignal=null;
    state.settings={notifySignals:true,notifyBot:true,notifyMarket:true,telegramChatId:"",telegramBotToken:"",whatsappPhone:"",whatsappApiKey:"",latenodeWebhook:""};
    botStatus(); renderAll(); toast("Local GoTradeX data cleared.");
  };
  testLatenodeWebhook = async function(){
    saveNotificationSettings();
    const url=String(state.settings?.latenodeWebhook||"").trim();
    if(!url) return toast("Enter a Latenode webhook URL first.","warning");
    try {
      const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:"GoTradeX",type:"test",message:"GoTradeX webhook test",timestamp:new Date().toISOString()})});
      if(!response.ok) throw new Error("Webhook returned "+response.status);
      toast("Latenode webhook test succeeded.");
    } catch(e) { console.error(e); toast("Webhook test failed. Check the URL and CORS settings.","error"); }
  };

  Object.assign(window,{
    togglePassword,changePassword,saveAccountSettings,saveBotSettings,runAIAnalysis,
    clearSignalHistory,showNotifications,closeNotifications,showRules,showHelp,
    clearLocalData,testLatenodeWebhook,logoutAccount:logout
  });

  init = function(){
    console.log("GoTradeX initializing...");
    loadStable(); restoreNotificationSettings(); bindNavigation(); bindSearch(); bindTimeframes(); setupSupabaseAuthListener();
    restoreSupabaseSession().then((restored)=>{
      if(restored || state.isLoggedIn) appStable();
      else { setHidden(getAppRoot(),true); setHidden(getAuthOverlay(),false); showLoginPage(); }
      updateDashboardUser(); botStatus(); renderAll();
      console.log("GoTradeX initialized.",APP_VERSION);
    }).catch((e)=>{console.warn("GoTradeX startup warning:",e);setHidden(getAppRoot(),true);setHidden(getAuthOverlay(),false);showLoginPage();});
  };
})();
