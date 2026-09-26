/* =========================================================
   GOTRADEX
   CLEAN LIVE TRADING DASHBOARD
   VERSION 3.0.0
   ========================================================= */

"use strict";


/* =========================================================
   CONFIG
   ========================================================= */

const APP_VERSION = "3.0.3";
const APP_NAME = "GoTradeX";

const CONFIG = {
  SUPABASE_URL:
    window.GOTRADEX_CONFIG?.SUPABASE_URL || "",

  SUPABASE_KEY:
    window.GOTRADEX_CONFIG?.SUPABASE_KEY || "",

  BINANCE_API:
    "https://api.binance.com/api/v3",

  FRANKFURTER_API:
    "https://api.frankfurter.app"
};


/* =========================================================
   STATE
   ========================================================= */

const state = {

  supabase: null,

  user: null,

  profile: null,

  isAdmin: false,

  currentPage: "dashboard",

  currentCategory: "crypto",

  currentTimeframe: "1H",

  chart: null,

  markets: {},

  signals: [],

  robotRunning: false,

  robotRisk: "conservative",

  maxDrawdown: 10,

  mt5AccountId: "",

  robotStatus: {
    connected: false,
    running: false,
    balance: 0,
    equity: 0,
    dailyPL: 0,
    openTrades: 0,
    lastHeartbeat: null,
    lastError: ""
  },

  lastQueuedSignalKey: "",
  lastQueuedAt: 0,

  robotStatusTimer: null,

  supportChannel: null,

  liveRefreshTimer: null,

  settings: {

    telegramWebhook: "",

    whatsappWebhook: ""

  }

};


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function showToast(message, type = "success") {

  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.className =
    `toast show ${type}`;

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {

    toast.className = "toast";

  }, 3500);

}


function setAuthMessage(message, type = "") {

  const box = $("authMessage");

  if (!box) return;

  box.textContent = message;

  box.className =
    `auth-message ${type}`;

}


function formatMoney(value) {

  const number = Number(value) || 0;

  return number.toLocaleString(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    }
  );

}


function formatPrice(value) {

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  if (number >= 1000) {
    return number.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );
  }

  if (number >= 1) {
    return number.toFixed(4);
  }

  return number.toFixed(6);

}


function initials(name) {

  const clean =
    String(name || "Trader")
      .trim();

  if (!clean) return "T";

  const parts = clean.split(/\s+/);

  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();

}


function getUserName() {

  return (
    state.user?.user_metadata?.full_name ||
    state.user?.email?.split("@")[0] ||
    "Trader"
  );

}


function generateReferralCode(userId) {

  const part =
    String(userId || "")
      .replaceAll("-", "")
      .substring(0, 8)
      .toUpperCase();

  return `GTX-${part}`;

}


/* =========================================================
   SUPABASE
   ========================================================= */

function initializeSupabase() {

  if (
    !CONFIG.SUPABASE_URL ||
    !CONFIG.SUPABASE_KEY
  ) {

    console.error(
      "GoTradeX: Supabase configuration missing."
    );

    setAuthMessage(
      "Supabase configuration is missing.",
      "error"
    );

    return false;
  }


  if (
    typeof window.supabase === "undefined" ||
    typeof window.supabase.createClient !== "function"
  ) {

    console.error(
      "GoTradeX: Supabase library was not loaded."
    );

    setAuthMessage(
      "Supabase library could not be loaded.",
      "error"
    );

    return false;
  }


  try {

    state.supabase =
      window.supabase.createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_KEY
      );

    console.log(
      `GoTradeX Supabase connected. ${APP_VERSION}`
    );

    return true;

  } catch (error) {

    console.error(
      "Supabase initialization error:",
      error
    );

    setAuthMessage(
      "Supabase could not be initialized.",
      "error"
    );

    return false;
  }

}


/* =========================================================
   AUTH SCREEN
   ========================================================= */

function showLoginForm() {

  $("loginForm")?.classList.remove("hidden");
  $("registerForm")?.classList.add("hidden");
  $("resetForm")?.classList.add("hidden");

  $("loginTab")?.classList.add("active");
  $("registerTab")?.classList.remove("active");

  setAuthMessage("");

}


function showRegisterForm() {

  $("loginForm")?.classList.add("hidden");
  $("registerForm")?.classList.remove("hidden");
  $("resetForm")?.classList.add("hidden");

  $("loginTab")?.classList.remove("active");
  $("registerTab")?.classList.add("active");

  setAuthMessage("");

}


function showResetForm() {

  $("loginForm")?.classList.add("hidden");
  $("registerForm")?.classList.add("hidden");
  $("resetForm")?.classList.remove("hidden");

  $("loginTab")?.classList.remove("active");
  $("registerTab")?.classList.remove("active");

  setAuthMessage("");

}


function showAuthScreen() {

  $("authScreen")?.classList.remove("hidden");
  $("appScreen")?.classList.add("hidden");

}


function showAppScreen() {

  $("authScreen")?.classList.add("hidden");
  $("appScreen")?.classList.remove("hidden");

}


/* =========================================================
   LOGIN
   ========================================================= */

async function handleLogin(event) {

  event.preventDefault();

  if (!state.supabase) {

    showToast(
      "Supabase is not connected.",
      "error"
    );

    return;
  }


  const email =
    $("loginEmail")?.value
      .trim()
      .toLowerCase();

  const password =
    $("loginPassword")?.value || "";


  if (!email || !password) {

    setAuthMessage(
      "Enter your email and password.",
      "error"
    );

    return;
  }


  const button =
    event.submitter ||
    $("loginForm")?.querySelector(
      'button[type="submit"]'
    );

  const originalText =
    button?.textContent || "Login";

  if (button) {
    button.disabled = true;
    button.textContent = "Logging in...";
  }


  setAuthMessage("Connecting...");


  try {

    const { data, error } =
      await state.supabase.auth
        .signInWithPassword({
          email,
          password
        });


    if (error) {
      throw error;
    }


    state.user =
      data?.user || null;


    if (!state.user) {
      throw new Error(
        "Login succeeded but no user session was returned."
      );
    }


    await loadProfile();

    showAppScreen();

    updateUserInterface();

    await initializeLiveApp();

    showPage("dashboard");

    showToast(
      "Login successful.",
      "success"
    );


  } catch (error) {

    console.error(
      "Login error:",
      error
    );

    setAuthMessage(
      error.message ||
      "Login failed.",
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;
      button.textContent = originalText;

    }

  }

}


/* =========================================================
   REGISTER
   ========================================================= */

async function handleRegister(event) {

  event.preventDefault();

  if (!state.supabase) {

    showToast(
      "Supabase is not connected.",
      "error"
    );

    return;
  }


  const name =
    $("registerName")?.value.trim();

  const email =
    $("registerEmail")?.value
      .trim()
      .toLowerCase();

  const password =
    $("registerPassword")?.value || "";

  const referral =
    $("registerReferral")?.value.trim() || "";


  if (!name || !email || !password) {

    setAuthMessage(
      "Complete all required fields.",
      "error"
    );

    return;
  }


  if (password.length < 6) {

    setAuthMessage(
      "Password must contain at least 6 characters.",
      "error"
    );

    return;
  }


  if (!$("registerTerms")?.checked) {

    setAuthMessage(
      "You must accept the terms and conditions.",
      "error"
    );

    return;
  }


  const button =
    event.submitter ||
    $("registerForm")?.querySelector(
      'button[type="submit"]'
    );

  const originalText =
    button?.textContent || "Create Account";

  if (button) {

    button.disabled = true;
    button.textContent = "Creating account...";

  }


  setAuthMessage(
    "Creating your GoTradeX account..."
  );


  try {

    const redirectUrl =
      window.location.origin +
      window.location.pathname;


    const { data, error } =
      await state.supabase.auth.signUp({

        email,

        password,

        options: {

          emailRedirectTo:
            redirectUrl,

          data: {

            full_name: name,

            referral_code:
              referral || null

          }

        }

      });


    if (error) {
      throw error;
    }


    if (data?.session && data?.user) {

      state.user = data.user;

      await createOrUpdateProfile();

      showAppScreen();

      updateUserInterface();

      await initializeLiveApp();

      showPage("dashboard");

      showToast(
        "Account created successfully.",
        "success"
      );

    } else {

      showLoginForm();

      $("loginEmail").value =
        email;

      setAuthMessage(
        "Account created. Check your email to confirm your account, then log in.",
        "success"
      );

    }


  } catch (error) {

    console.error(
      "Registration error:",
      error
    );

    setAuthMessage(
      error.message ||
      "Registration failed.",
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;
      button.textContent = originalText;

    }

  }

}


/* =========================================================
   PASSWORD RESET
   ========================================================= */

async function handlePasswordReset(event) {

  event.preventDefault();

  if (!state.supabase) {

    setAuthMessage(
      "Supabase is not connected.",
      "error"
    );

    return;
  }


  const email =
    $("resetEmail")?.value
      .trim()
      .toLowerCase();


  if (!email) {

    setAuthMessage(
      "Enter your email address.",
      "error"
    );

    return;
  }


  const button =
    event.submitter;

  if (button) {

    button.disabled = true;
    button.textContent = "Sending...";

  }


  try {

    const redirectTo =
      window.location.origin +
      window.location.pathname;


    const { error } =
      await state.supabase.auth
        .resetPasswordForEmail(
          email,
          {
            redirectTo
          }
        );


    if (error) {
      throw error;
    }


    setAuthMessage(
      "If the email is registered, a password reset link has been sent.",
      "success"
    );


  } catch (error) {

    console.error(
      "Password reset error:",
      error
    );

    setAuthMessage(
      error.message ||
      "Unable to send reset email.",
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;
      button.textContent = "Send Reset Link";

    }

  }

}


/* =========================================================
   AUTH STATE
   ========================================================= */

function listenForAuthChanges() {

  if (!state.supabase) {
    return;
  }


  state.supabase.auth.onAuthStateChange(
    async (event, session) => {

      console.log(
        "GoTradeX auth event:",
        event
      );


      if (
        event === "PASSWORD_RECOVERY"
      ) {

        handlePasswordRecovery();

        return;
      }


      if (
        event === "SIGNED_IN" &&
        session?.user
      ) {

        state.user =
          session.user;

        await loadProfile();

        showAppScreen();

        updateUserInterface();

        await initializeLiveApp();

        return;
      }


      if (event === "SIGNED_OUT") {

        state.user = null;
        state.profile = null;

        showAuthScreen();

        showLoginForm();

      }

    }
  );

}


/* =========================================================
   PASSWORD RECOVERY
   ========================================================= */

async function handlePasswordRecovery() {

  const password =
    window.prompt(
      "Enter your new GoTradeX password:"
    );


  if (!password) {
    return;
  }


  if (password.length < 6) {

    showToast(
      "Password must contain at least 6 characters.",
      "error"
    );

    return;
  }


  const { error } =
    await state.supabase.auth
      .updateUser({
        password
      });


  if (error) {

    showToast(
      error.message,
      "error"
    );

    return;
  }


  showToast(
    "Password updated successfully.",
    "success"
  );

}


/* =========================================================
   SESSION RESTORE
   ========================================================= */

async function restoreSession() {

  if (!state.supabase) {
    return;
  }


  try {

    const { data, error } =
      await state.supabase.auth
        .getSession();


    if (error) {
      throw error;
    }


    if (data?.session?.user) {

      state.user =
        data.session.user;

      await loadProfile();

      showAppScreen();

      updateUserInterface();

      await initializeLiveApp();

    } else {

      showAuthScreen();

    }


  } catch (error) {

    console.error(
      "Session restore error:",
      error
    );

    showAuthScreen();

  }

}


/* =========================================================
   PROFILE
   ========================================================= */

async function loadProfile() {

  if (!state.user) {
    return;
  }


  const fallback = {

    id: state.user.id,

    email:
      state.user.email || "",

    full_name:
      getUserName(),

    referral_code:
      generateReferralCode(
        state.user.id
      ),

    referred_by:
      state.user.user_metadata
        ?.referral_code || null

  };


  state.profile =
    fallback;


  try {

    const { data, error } =
      await state.supabase
        .from("profiles")
        .select("*")
        .eq("id", state.user.id)
        .maybeSingle();


    if (!error && data) {

      state.profile = {

        ...fallback,

        ...data

      };

    } else {

      await createOrUpdateProfile();

    }


  } catch (error) {

    console.warn(
      "Profile load warning:",
      error
    );

  }

  await loadAdminAccess();

}


/* =========================================================
   ADMIN ACCESS
   ========================================================= */

async function loadAdminAccess() {

  state.isAdmin = false;

  const button = $("adminNavButton");

  if (button) {
    button.classList.add("hidden");
  }

  if (!state.supabase || !state.user) {
    return;
  }

  try {

    const { data, error } =
      await state.supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", state.user.id)
        .maybeSingle();

    if (error) {
      throw error;
    }

    state.isAdmin =
      Boolean(data && data.user_id === state.user.id);

    if (button) {
      button.classList.toggle(
        "hidden",
        !state.isAdmin
      );
    }

    if (state.isAdmin) {
      await loadAdminFinanceSettings();
    }

    if ($("adminAccessStatus")) {
      $("adminAccessStatus").textContent =
        state.isAdmin
          ? "Verified Admin"
          : "Not Authorized";
    }

  } catch (error) {

    console.warn(
      "Admin access check failed:",
      error
    );

    state.isAdmin = false;

  }

}


async function createOrUpdateProfile() {

  if (!state.user) {
    return;
  }


  const profile = {

    id: state.user.id,

    email:
      state.user.email || "",

    full_name:
      getUserName(),

    referral_code:
      generateReferralCode(
        state.user.id
      ),

    referred_by:
      state.user.user_metadata
        ?.referral_code || null

  };


  try {

    const { data, error } =
      await state.supabase
        .from("profiles")
        .upsert(
          profile,
          {
            onConflict: "id"
          }
        )
        .select()
        .single();


    if (!error && data) {

      state.profile = data;

    } else {

      state.profile = profile;

    }

  } catch (error) {

    console.warn(
      "Profile creation warning:",
      error
    );

    state.profile = profile;

  }

}


/* =========================================================
   UI USER DATA
   ========================================================= */

function updateUserInterface() {

  const name =
    state.profile?.full_name ||
    getUserName();

  const email =
    state.user?.email || "";


  const avatar =
    initials(name);


  if ($("sidebarName")) {
    $("sidebarName").textContent = name;
  }

  if ($("sidebarEmail")) {
    $("sidebarEmail").textContent = email;
  }

  if ($("welcomeName")) {
    $("welcomeName").textContent = name;
  }

  if ($("sidebarAvatar")) {
    $("sidebarAvatar").textContent = avatar;
  }

  if ($("topProfileButton")) {
    $("topProfileButton").textContent = avatar;
  }

  if ($("settingsName")) {
    $("settingsName").value = name;
  }

  if ($("settingsEmail")) {
    $("settingsEmail").value = email;
  }


  const referral =
    state.profile?.referral_code ||
    generateReferralCode(
      state.user?.id
    );


  if ($("referralCode")) {
    $("referralCode").textContent =
      referral;
  }


  if ($("referralLink")) {

    const url =
      new URL(
        window.location.href
      );

    url.searchParams.set(
      "ref",
      referral
    );

    $("referralLink").value =
      url.toString();

  }

}


/* =========================================================
   NAVIGATION
   ========================================================= */

const pageTitles = {

  dashboard: [
    "Dashboard",
    "Live market information and account overview."
  ],

  markets: [
    "Markets",
    "Live market information."
  ],

  signals: [
    "Signal Analyzer",
    "Live technical analysis."
  ],

  portfolio: [
    "Portfolio",
    "Your connected trading account overview."
  ],

  robot: [
    "Trading Robot",
    "Automated trading control centre."
  ],

  affiliates: [
    "My Team",
    "Referral and affiliate centre."
  ],

  support: [
    "Live Chat",
    "Contact GoTradeX support."
  ],

  settings: [
    "Settings",
    "Manage your GoTradeX account."
  ],

  admin: [
    "Admin Portal",
    "Private platform administration and control centre."
  ]

};


function showPage(page) {

  if (
    page === "admin" &&
    state.isAdmin !== true
  ) {
    showToast(
      "Admin access is required.",
      "error"
    );
    page = "dashboard";
  }

  if (!pageTitles[page]) {
    page = "dashboard";
  }


  state.currentPage =
    page;


  document
    .querySelectorAll(".app-page")
    .forEach(section => {

      section.classList.toggle(
        "active-page",
        section.id ===
        `page-${page}`
      );

    });


  document
    .querySelectorAll(".nav-item")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );

    });


  const title =
    pageTitles[page][0];

  const subtitle =
    pageTitles[page][1];


  if ($("pageTitle")) {
    $("pageTitle").textContent =
      title;
  }

  if ($("pageSubtitle")) {
    $("pageSubtitle").textContent =
      subtitle;
  }


  if (
    window.innerWidth <= 850
  ) {

    $("sidebar")?.classList.remove(
      "open"
    );

  }


  if (page === "support") {
    loadSupportMessages();
  }

}


function bindNavigation() {

  document
    .querySelectorAll(".nav-item")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          showPage(
            button.dataset.page
          );

        }
      );

    });


  document
    .querySelectorAll("[data-page-link]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          showPage(
            button.dataset.pageLink
          );

        }
      );

    });

}


/* =========================================================
   PASSWORD VISIBILITY
   ========================================================= */

function bindPasswordToggle(
  buttonId,
  inputId
) {

  const button = $(buttonId);
  const input = $(inputId);

  if (!button || !input) {
    return;
  }


  button.addEventListener(
    "click",
    () => {

      const isPassword =
        input.type === "password";


      input.type =
        isPassword
          ? "text"
          : "password";


      button.textContent =
        isPassword
          ? "Hide"
          : "Show";

    }
  );

}


/* =========================================================
   LIVE MARKETS
   ========================================================= */


async function fetchBinanceTicker(symbol) {
  const response=await fetch(`${CONFIG.BINANCE_API}/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,{cache:"no-store"});
  if(!response.ok)throw new Error(`Market request failed: ${response.status}`);
  const data=await response.json();
  return {symbol,price:Number(data.lastPrice),change:Number(data.priceChangePercent),volume:Number(data.volume),source:"Binance"};
}

async function fetchBinanceAllTickers() {
  const response=await fetch(`${CONFIG.BINANCE_API}/ticker/24hr`,{cache:"no-store"});
  if(!response.ok)throw new Error(`Binance market request failed: ${response.status}`);
  const data=await response.json(),map={};
  if(Array.isArray(data))data.forEach(item=>{if(item?.symbol)map[item.symbol]={symbol:item.symbol,price:Number(item.lastPrice),change:Number(item.priceChangePercent),volume:Number(item.volume),source:"Binance"};});
  return map;
}

async function fetchForexRates() {
  const response=await fetch(`${CONFIG.FRANKFURTER_API}/latest?from=USD`,{cache:"no-store"});
  if(!response.ok)throw new Error("Forex feed unavailable.");
  const data=await response.json();
  return data.rates||{};
}

const marketCatalog={
  crypto:[
    ["BTCUSDT","Bitcoin / USD"],["ETHUSDT","Ethereum / USD"],["BNBUSDT","BNB / USD"],["SOLUSDT","Solana / USD"],["XRPUSDT","XRP / USD"],
    ["ADAUSDT","Cardano / USD"],["DOGEUSDT","Dogecoin / USD"],["AVAXUSDT","Avalanche / USD"],["DOTUSDT","Polkadot / USD"],["LINKUSDT","Chainlink / USD"],
    ["LTCUSDT","Litecoin / USD"],["BCHUSDT","Bitcoin Cash / USD"],["TRXUSDT","TRON / USD"],["SHIBUSDT","Shiba Inu / USD"],["TONUSDT","Toncoin / USD"],
    ["XLMUSDT","Stellar / USD"],["ATOMUSDT","Cosmos / USD"],["ETCUSDT","Ethereum Classic / USD"],["FILUSDT","Filecoin / USD"],["APTUSDT","Aptos / USD"],
    ["NEARUSDT","NEAR / USD"],["ALGOUSDT","Algorand / USD"],["ICPUSDT","Internet Computer / USD"],["HBARUSDT","Hedera / USD"],
    ["VETUSDT","VeChain / USD"],["UNIUSDT","Uniswap / USD"],["AAVEUSDT","Aave / USD"],["MKRUSDT","Maker / USD"],["SANDUSDT","The Sandbox / USD"],
    ["MANAUSDT","Decentraland / USD"],["PEPEUSDT","Pepe / USD"]
  ],
  forex:["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD","EURGBP","EURJPY","EURCHF","EURAUD","EURCAD","EURNZD","GBPJPY","GBPCHF","GBPAUD","GBPCAD","GBPNZD","AUDJPY","AUDCHF","AUDCAD","AUDNZD","CADJPY","CADCHF","NZDJPY","NZDCHF","CHFJPY","USDZAR","USDMXN","USDTRY","USDSEK","USDNOK","USDDKK","USDPLN","USDHUF","USDCZK","EURSEK","EURNOK","EURDKK","EURPLN","EURHUF","EURCZK","EURZAR","GBPSEK","GBPNOK","GBPPLN","GBPZAR","AUDSGD","AUDZAR","CADZAR","NZDSEK","NZDZAR"],
  commodities:[["XAUUSD","Gold / USD"],["XAGUSD","Silver / USD"],["WTIUSD","WTI Crude Oil"],["BRENTUSD","Brent Crude Oil"],["NATGASUSD","Natural Gas"],["COPPERUSD","Copper"],["PLATINUMUSD","Platinum"],["PALLADIUMUSD","Palladium"]],
  indices:[["US500","S&P 500"],["NAS100","Nasdaq 100"],["US30","Dow Jones"],["GER40","DAX 40"],["UK100","FTSE 100"],["JPN225","Nikkei 225"],["FRA40","CAC 40"],["AUS200","ASX 200"],["HK50","Hang Seng"],["CHINA50","China A50"]]
};

const demoMarketPrices={
  BTCUSDT:64231.5,ETHUSDT:3450.2,BNBUSDT:610.2,SOLUSDT:148.4,XRPUSDT:2.4,ADAUSDT:.82,DOGEUSDT:.17,AVAXUSDT:38.1,DOTUSDT:4.9,LINKUSDT:18.2,LTCUSDT:96.2,BCHUSDT:540,TRXUSDT:.31,SHIBUSDT:.000012,TONUSDT:3.2,XLMUSDT:.3,ATOMUSDT:4.6,ETCUSDT:18.7,FILUSDT:2.1,APTUSDT:4.2,NEARUSDT:2.6,ALGOUSDT:.21,ICPUSDT:5.2,HBARUSDT:.22,VETUSDT:.03,UNIUSDT:7,AAVEUSDT:250,MKRUSDT:1800,SANDUSDT:.25,MANAUSDT:.24,PEPEUSDT:.000009,
  EURUSD:1.0821,GBPUSD:1.263,USDJPY:150.2,USDCHF:.85,AUDUSD:.66,USDCAD:1.37,NZDUSD:.6,EURGBP:.86,EURJPY:162.5,EURCHF:.92,EURAUD:1.64,EURCAD:1.48,EURNZD:1.8,GBPJPY:189.7,GBPCHF:1.07,GBPAUD:1.91,GBPCAD:1.73,GBPNZD:2.1,AUDJPY:99.1,AUDCHF:.56,AUDCAD:.9,AUDNZD:1.1,CADJPY:109.6,CADCHF:.62,NZDJPY:90.1,NZDCHF:.51,CHFJPY:176.7,USDZAR:17.5,USDMXN:19.3,USDTRY:41,USDSEK:9.35,USDNOK:10,USDDKK:6.6,USDPLN:3.7,USDHUF:335,USDCZK:21.2,EURSEK:11,EURNOK:11.2,EURDKK:7.46,EURPLN:4.25,EURHUF:400,EURCZK:24,EURZAR:18.9,GBPSEK:12,GBPNOK:12.6,GBPPLN:4.67,GBPZAR:22.1,AUDSGD:.86,AUDZAR:11.6,CADZAR:12.8,NZDSEK:5.6,NZDZAR:10.5,
  XAUUSD:2340.1,XAGUSD:28.5,WTIUSD:78.2,BRENTUSD:82.1,NATGASUSD:3.1,COPPERUSD:4.2,PLATINUMUSD:980,PALLADIUMUSD:930,US500:5200,NAS100:18200,US30:39000,GER40:18500,UK100:8300,JPN225:39000,FRA40:8200,AUS200:7900,HK50:18000,CHINA50:13500
};

function buildMarketEntry(symbol,name,type,live){
  const livePrice=Number(live?.price),fallback=Number(demoMarketPrices[symbol]),price=Number.isFinite(livePrice)&&livePrice>0?livePrice:fallback;
  return {symbol,name,type,price,change:Number.isFinite(Number(live?.change))?Number(live.change):0,source:Number.isFinite(livePrice)&&livePrice>0?(live.source||"Live API"):"Demo fallback"};
}

async function loadLiveMarkets(){
  const previous={...state.markets},results={...previous};
  let cryptoTickers={},forexRates={};
  try{cryptoTickers=await fetchBinanceAllTickers();}catch(error){console.warn("Crypto feed unavailable; using fallback data.",error);}
  try{forexRates=await fetchForexRates();}catch(error){console.warn("Forex feed unavailable; using fallback data.",error);}

  marketCatalog.crypto.forEach(([symbol,name])=>{results[symbol]=buildMarketEntry(symbol,name,"crypto",cryptoTickers[symbol]);});

  marketCatalog.forex.forEach(symbol=>{
    const base=symbol.slice(0,3),quote=symbol.slice(3,6),baseRate=base==="USD"?1:Number(forexRates[base]),quoteRate=quote==="USD"?1:Number(forexRates[quote]);
    let live=null;
    if(baseRate>0&&quoteRate>0){const price=quoteRate/baseRate;live={price,change:previous[symbol]?.price?((price-previous[symbol].price)/previous[symbol].price)*100:0,source:"Frankfurter"};}
    results[symbol]=buildMarketEntry(symbol,`${base} / ${quote}`,"forex",live);
  });

  for(const [symbol,name] of marketCatalog.commodities){
    let live=null;
    if(symbol==="XAUUSD"||symbol==="XAGUSD"){
      try{
        const metal=symbol==="XAUUSD"?"XAU":"XAG",response=await fetch(`https://api.gold-api.com/price/${metal}`,{cache:"no-store"});
        if(response.ok){const data=await response.json(),price=Number(data?.price);if(price>0)live={price,change:previous[symbol]?.price?((price-previous[symbol].price)/previous[symbol].price)*100:0,source:"Gold API"};}
      }catch(error){console.warn(symbol+" live feed unavailable.");}
    }
    results[symbol]=buildMarketEntry(symbol,name,"commodity",live);
  }

  for(const [symbol,name] of marketCatalog.indices)results[symbol]=buildMarketEntry(symbol,name,"index",null);

  state.markets=results;
  state.marketsUpdatedAt=new Date().toISOString();
  renderDashboardMarkets();
  renderMarketsList();
  updateDashboardPrice();
  updateSignalFromMarket();
}

function renderDashboardMarkets(){
  const container=$("dashboardMarkets");if(!container)return;
  const symbols=["BTCUSDT","ETHUSDT","XAUUSD","EURUSD","GBPUSD","USDZAR"];
  container.innerHTML=symbols.filter(symbol=>state.markets[symbol]).map(symbol=>{
    const market=state.markets[symbol],change=Number(market.change)||0,className=change>=0?"positive":"negative";
    return `
      <div class="market-card">
        <div class="market-card-top"><span class="market-symbol">${escapeHTML(symbol)}</span><span class="${className}">${change>=0?"+":""}${change.toFixed(2)}%</span></div>
        <div class="market-name">${escapeHTML(market.name||symbol)}</div>
        <div class="market-price">${formatPrice(market.price)}</div>
        <div class="market-change ${className}">${escapeHTML(market.source||"—")}</div>
      </div>
    `;
  }).join("");
}

function renderMarketsList(){
  const container=$("marketsList");if(!container)return;
  const query=$("marketSearch")?.value.trim().toUpperCase()||"",category=state.currentCategory;
  let entries=[];
  if(category==="crypto")entries=marketCatalog.crypto.map(([symbol,name])=>({symbol,name,type:"crypto"}));
  else if(category==="forex")entries=marketCatalog.forex.map(symbol=>({symbol,name:`${symbol.slice(0,3)} / ${symbol.slice(3,6)}`,type:"forex"}));
  else if(category==="commodities"||category==="metals")entries=marketCatalog.commodities.map(([symbol,name])=>({symbol,name,type:"commodity"}));
  else if(category==="indices")entries=marketCatalog.indices.map(([symbol,name])=>({symbol,name,type:"index"}));

  const filtered=entries.filter(entry=>{const market=state.markets[entry.symbol],text=`${entry.symbol} ${entry.name}`.toUpperCase();return(!query||text.includes(query))&&market;});
  if(!filtered.length){container.innerHTML=`<div class="empty-state">No markets match your search.</div>`;return;}

  container.innerHTML=filtered.map(entry=>{
    const market=state.markets[entry.symbol],change=Number(market.change)||0,className=change>=0?"positive":"negative";
    return `
      <div class="market-row">
        <div><strong>${escapeHTML(entry.symbol)}</strong><span>${escapeHTML(entry.name)}</span></div>
        <div><span>Price</span><strong>${formatPrice(market.price)}</strong></div>
        <div><span>24h</span><strong class="${className}">${change>=0?"+":""}${change.toFixed(2)}%</strong></div>
        <div><span>Source</span><strong>${escapeHTML(market.source||"—")}</strong></div>
      </div>
    `;
  }).join("");
}

function updateDashboardPrice(){
  const btc=state.markets.BTCUSDT;
  if(btc&&$("btcPrice"))$("btcPrice").textContent=`$${formatPrice(btc.price)}`;
}

async function fetchBinanceKlines(symbol,interval,limit=60){
  const response=await fetch(`${CONFIG.BINANCE_API}/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`,{cache:"no-store"});
  if(!response.ok)throw new Error(`Chart request failed: ${response.status}`);
  const rows=await response.json();
  return rows.map(row=>({time:Number(row[0]),close:Number(row[4])}));
}

function chartIntervalForTimeframe(timeframe){
  const intervals={"1m":"1m","5m":"5m","15m":"15m","30m":"30m","1H":"1h","4H":"4h","12H":"12h","1D":"1d","1W":"1w","1M":"1M"};
  return intervals[timeframe]||null;
}

function createSyntheticChartPoints(currentPrice,timeframe="1H",count=60){
  const step={"5s":5000,"15s":15000,"30s":30000,"1m":60000,"5m":300000,"15m":900000,"30m":1800000,"1H":3600000,"4H":14400000,"12H":43200000,"1D":86400000,"1W":604800000,"1M":2592000000,"6M":15552000000,"1Y":31536000000}[timeframe]||3600000;
  const points=[],base=Number(currentPrice)||1;
  for(let i=0;i<count;i++)points.push({time:Date.now()-((count-i)*step),close:Number((base*(1+Math.sin(i/3)*.004)).toFixed(6))});
  return points;
}

async function createChart(){
  const canvas=$("mainChart");if(!canvas||typeof Chart==="undefined")return;
  if(state.chart){state.chart.destroy();state.chart=null;}
  const tf=state.currentTimeframe,currentPrice=state.markets.BTCUSDT?.price||0,interval=chartIntervalForTimeframe(tf);
  let candles=[];
  try{if(!interval)throw new Error("Synthetic timeframe");candles=await fetchBinanceKlines("BTCUSDT",interval,60);}
  catch(error){console.warn("Live chart unavailable; using timeframe fallback:",error);candles=createSyntheticChartPoints(currentPrice,tf,60);}
  const labels=candles.map(c=>new Date(c.time).toLocaleString([],tf==="5s"||tf==="15s"||tf==="30s"?{hour:"2-digit",minute:"2-digit",second:"2-digit"}:{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}));
  state.chart=new Chart(canvas.getContext("2d"),{type:"line",data:{labels,datasets:[{data:candles.map(c=>c.close),borderColor:"#4f7cff",backgroundColor:"rgba(37,99,235,0.10)",fill:true,tension:.35,pointRadius:0,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{grid:{color:"rgba(145,164,189,0.10)"},ticks:{color:"#91a4bd",font:{size:9}}}}}});
}


/* =========================================================
   SIGNAL ENGINE
   ========================================================= */

async function fetchSignalKlines(symbol) {
  if (!["BTCUSDT", "ETHUSDT"].includes(symbol)) return [];
  try { return await fetchBinanceKlines(symbol, "1h", 60); }
  catch (error) { console.warn("Live signal candles unavailable:", error); return []; }
}

function calculateEMA(values, period) {
  if (!values.length) return null;
  const multiplier = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) ema = (values[i] - ema) * multiplier + ema;
  return ema;
}

function calculateRSI(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change; else losses += Math.abs(change);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
  }
  if (averageLoss === 0) return 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - (100 / (1 + relativeStrength));
}

async function generateLiveSignal(symbol = "BTCUSDT") {
  const fallback = generateSignal(symbol);
  const candles = await fetchSignalKlines(symbol);
  if (candles.length < 22) return fallback;
  const closes = candles.map(c => Number(c.close)).filter(Number.isFinite);
  if (closes.length < 22) return fallback;
  const price = closes[closes.length - 1];
  const ema9 = calculateEMA(closes.slice(-40), 9);
  const ema21 = calculateEMA(closes.slice(-40), 21);
  const rsiValue = calculateRSI(closes, 14);
  const lookback = closes[Math.max(0, closes.length - 11)];
  const momentumPercent = lookback ? ((price - lookback) / lookback) * 100 : 0;
  let score = 0;
  if (ema9 > ema21) score += 1; else if (ema9 < ema21) score -= 1;
  if (rsiValue >= 55) score += 1; else if (rsiValue <= 45) score -= 1;
  if (momentumPercent > 0.15) score += 1; else if (momentumPercent < -0.15) score -= 1;
  let direction = "HOLD";
  if (score >= 2) direction = "BUY"; else if (score <= -2) direction = "SELL";
  let confidence = direction === "HOLD" ? 50 + Math.min(Math.round(Math.abs(momentumPercent) * 2), 10) : 55 + Math.abs(score) * 10;
  confidence = Math.min(confidence, 85);
  const entry = price;
  const target = direction === "BUY" ? price * 1.01 : direction === "SELL" ? price * 0.99 : price;
  const stop = direction === "BUY" ? price * 0.995 : direction === "SELL" ? price * 1.005 : price;
  return {
    direction, confidence, entry, target, stop,
    ema: ema9 > ema21 ? "Bullish" : ema9 < ema21 ? "Bearish" : "Neutral",
    rsi: rsiValue !== null ? rsiValue.toFixed(1) : "Waiting",
    momentum: momentumPercent > 0.15 ? "Positive" : momentumPercent < -0.15 ? "Negative" : "Neutral"
  };
}
function generateSignal(symbol = "BTCUSDT") {

  const market =
    state.markets[symbol];


  if (!market) {

    return {

      direction: "HOLD",

      confidence: 0,

      entry: null,

      target: null,

      stop: null,

      ema: "Waiting",

      rsi: "Waiting",

      momentum: "Waiting"

    };

  }


  const price =
    Number(market.price);


  const change =
    Number(market.change) || 0;


  let direction =
    "HOLD";


  let confidence =
    55;


  if (change > 1) {

    direction = "BUY";
    confidence = 76;

  } else if (change < -1) {

    direction = "SELL";
    confidence = 74;

  } else if (change > 0) {

    direction = "BUY";
    confidence = 64;

  } else if (change < 0) {

    direction = "SELL";
    confidence = 63;

  }


  const entry =
    price;


  const target =
    direction === "BUY"
      ? price * 1.01
      : direction === "SELL"
        ? price * 0.99
        : price;


  const stop =
    direction === "BUY"
      ? price * 0.995
      : direction === "SELL"
        ? price * 1.005
        : price;


  return {

    direction,

    confidence,

    entry,

    target,

    stop,

    ema:
      direction === "BUY"
        ? "Bullish"
        : direction === "SELL"
          ? "Bearish"
          : "Neutral",

    rsi:
      direction === "BUY"
        ? "58"
        : direction === "SELL"
          ? "42"
          : "50",

    momentum:
      direction === "BUY"
        ? "Positive"
        : direction === "SELL"
          ? "Negative"
          : "Neutral"

  };

}


async function updateSignalFromMarket() {
  const symbol = "BTCUSDT";
  const signal = await generateLiveSignal(symbol);
  if ($("signalDirection")) {
    $("signalDirection").textContent = signal.direction;
    $("signalDirection").className = "signal-direction " + (signal.direction === "BUY" ? "buy" : signal.direction === "SELL" ? "sell" : "hold");
  }
  if ($("signalConfidence")) $("signalConfidence").textContent = signal.confidence + "%";
  if ($("signalEntry")) $("signalEntry").textContent = signal.entry ? "$" + formatPrice(signal.entry) : "—";
  if ($("signalTarget")) $("signalTarget").textContent = signal.target ? "$" + formatPrice(signal.target) : "—";
  if ($("signalStop")) $("signalStop").textContent = signal.stop ? "$" + formatPrice(signal.stop) : "—";
  if ($("emaSignal")) $("emaSignal").textContent = signal.ema;
  if ($("rsiSignal")) $("rsiSignal").textContent = signal.rsi;
  if ($("momentumSignal")) $("momentumSignal").textContent = signal.momentum;
  if ($("activeSignalsValue")) $("activeSignalsValue").textContent = signal.confidence > 0 ? "1" : "0";
  const now = new Date().toISOString();
  const latest = state.signals[0];
  if (!latest || latest.symbol !== symbol || latest.direction !== signal.direction || Date.now() - new Date(latest.time).getTime() > 60000) {
    state.signals.unshift({ symbol, ...signal, time: now });
    state.signals = state.signals.slice(0, 10);
  } else {
    state.signals[0] = { ...latest, ...signal, symbol, time: now };
  }
  renderSignals();
  await queueRobotSignal({ symbol, ...signal });
}

/* =========================================================
   SIGNAL PAGE
   ========================================================= */

async function runAnalyzer() {
  const symbol = $("signalAsset")?.value || "BTCUSDT";
  const button = $("analyzeButton");
  if (button) { button.disabled = true; button.textContent = "Analyzing..."; }
  try {
    const signal = await generateLiveSignal(symbol);
    if ($("analysisDirection")) $("analysisDirection").textContent = signal.direction;
    if ($("analysisConfidence")) $("analysisConfidence").textContent = signal.confidence + "%";
    if ($("analysisEMA")) $("analysisEMA").textContent = signal.ema;
    if ($("analysisRSI")) $("analysisRSI").textContent = signal.rsi;
    if ($("analysisMomentum")) $("analysisMomentum").textContent = signal.momentum;
    showToast(symbol + " live analysis updated.", "success");
  } catch (error) {
    console.error("Signal analyzer error:", error);
    showToast("Signal analysis failed.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Analyze"; }
  }
}

function renderSignals() {

  const container =
    $("signalsList");

  if (!container) {
    return;
  }


  if (!state.signals.length) {

    container.innerHTML = `

      <div class="empty-state">
        No signals yet.
      </div>

    `;

    return;
  }


  container.innerHTML =
    state.signals
      .map(signal => {

        const directionClass =
          signal.direction === "BUY"
            ? "positive"
            : signal.direction === "SELL"
              ? "negative"
              : "";


        return `

          <div class="market-row">

            <div>
              <strong>
                ${escapeHTML(
                  signal.symbol
                )}
              </strong>

              <span>
                ${new Date(
                  signal.time
                ).toLocaleTimeString()}
              </span>
            </div>

            <div>
              <span>Signal</span>
              <strong class="${directionClass}">
                ${escapeHTML(
                  signal.direction
                )}
              </strong>
            </div>

            <div>
              <span>Confidence</span>
              <strong>
                ${signal.confidence}%
              </strong>
            </div>

            <div>
              <span>RSI</span>
              <strong>
                ${escapeHTML(
                  signal.rsi
                )}
              </strong>
            </div>

          </div>

        `;

      })
      .join("");

}


/* =========================================================
   ROBOT
   ========================================================= */

function setRobotRisk(risk) {

  state.robotRisk =
    risk;


  document
    .querySelectorAll(".risk-button")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.risk === risk
      );

    });


  if ($("robotRiskText")) {

    $("robotRiskText").textContent =
      risk.charAt(0).toUpperCase() +
      risk.slice(1);

  }

}


function renderRobotStatus() {

  const running =
    state.robotRunning === true;

  const connected =
    state.robotStatus.connected === true;

  if ($("robotStatusValue")) {
    $("robotStatusValue").textContent =
      running ? "Running" : "Stopped";
  }

  if ($("robotLabel")) {
    $("robotLabel").textContent =
      running ? "RUNNING" : (connected ? "CONNECTED" : "STOPPED");
  }

  if ($("robotIndicator")) {
    $("robotIndicator").style.background =
      running
        ? "var(--green)"
        : connected
          ? "var(--yellow)"
          : "var(--red)";
  }

  if ($("brokerStatus")) {
    $("brokerStatus").textContent =
      connected ? "AvaTrade MT5 Connected" : "Not Connected";
  }

  if ($("robotAccountStatus")) {
    $("robotAccountStatus").textContent =
      state.mt5AccountId || "Not Set";
  }

  if ($("robotOpenTrades")) {
    $("robotOpenTrades").textContent =
      String(state.robotStatus.openTrades || 0);
  }

  if ($("robotDailyPL")) {
    $("robotDailyPL").textContent =
      formatMoney(state.robotStatus.dailyPL || 0);
  }

  const heartbeatTime =
    state.robotStatus.lastHeartbeat
      ? new Date(state.robotStatus.lastHeartbeat)
      : null;

  const heartbeatAge =
    heartbeatTime && !Number.isNaN(heartbeatTime.getTime())
      ? Date.now() - heartbeatTime.getTime()
      : Infinity;

  const fresh =
    connected &&
    heartbeatAge <= 30000;

  if ($("robotConnectionHealth")) {
    $("robotConnectionHealth").textContent =
      fresh
        ? "Ready"
        : connected
          ? "Stale"
          : "Waiting";
    $("robotConnectionHealth").className =
      fresh
        ? "robot-health-good"
        : connected
          ? "robot-health-warn"
          : "robot-health-bad";
  }

  if ($("robotHeartbeat")) {
    $("robotHeartbeat").textContent =
      heartbeatTime && !Number.isNaN(heartbeatTime.getTime())
        ? heartbeatTime.toLocaleTimeString()
        : "No heartbeat";
  }

  if ($("robotErrorMessage")) {
    $("robotErrorMessage").textContent =
      state.robotStatus.lastError ||
      (
        fresh
          ? "MT5/VPS bridge is connected and reporting normally."
          : connected
            ? "MT5/VPS is connected, but the heartbeat is stale."
            : "Waiting for MT5/VPS connection."
      );
  }

  if ($("startRobotButton")) {
    $("startRobotButton").classList.toggle("hidden", running);
  }

  if ($("stopRobotButton")) {
    $("stopRobotButton").classList.toggle("hidden", !running);
  }

  setRobotRisk(state.robotRisk);
}


async function loadRobotState() {

  if (!state.supabase || !state.user) {
    return;
  }

  try {
    const { data: control, error: controlError } =
      await state.supabase
        .from("gotradex_bot_control")
        .select("*")
        .eq("user_id", state.user.id)
        .maybeSingle();

    if (controlError) throw controlError;

    if (control) {
      state.robotRunning = Boolean(control.running);
      state.robotRisk = control.risk || "conservative";
      state.maxDrawdown = Number(control.max_drawdown) || 10;
      state.mt5AccountId =
        control.mt5_account_id
          ? String(control.mt5_account_id)
          : "";

      if ($("mt5AccountId")) {
        $("mt5AccountId").value = state.mt5AccountId;
      }
    }

    const { data: status, error: statusError } =
      await state.supabase
        .from("gotradex_bot_status")
        .select("*")
        .eq("user_id", state.user.id)
        .maybeSingle();

    if (statusError) throw statusError;

    if (status) {
      state.robotStatus = {
        connected: Boolean(status.connected),
        running: Boolean(status.running),
        balance: Number(status.balance) || 0,
        equity: Number(status.equity) || 0,
        dailyPL: Number(status.daily_pl) || 0,
        openTrades: Number(status.open_trades) || 0,
        lastHeartbeat: status.last_heartbeat || null,
        lastError: status.last_error || ""
      };
    }

    renderRobotStatus();
    updatePortfolio();

  } catch (error) {
    console.warn("Robot state load warning:", error);
  }
}


async function refreshRobotStatus() {

  if (!state.supabase || !state.user) {
    return;
  }

  try {

    const [
      { data: control, error: controlError },
      { data: status, error: statusError }
    ] = await Promise.all([
      state.supabase
        .from("gotradex_bot_control")
        .select("running,risk,max_drawdown,mt5_account_id")
        .eq("user_id", state.user.id)
        .maybeSingle(),

      state.supabase
        .from("gotradex_bot_status")
        .select("*")
        .eq("user_id", state.user.id)
        .maybeSingle()
    ]);

    if (controlError) throw controlError;
    if (statusError) throw statusError;

    if (control) {
      state.robotRunning = Boolean(control.running);
      state.robotRisk = control.risk || state.robotRisk;
      state.maxDrawdown =
        Number(control.max_drawdown) || state.maxDrawdown;
      state.mt5AccountId =
        control.mt5_account_id
          ? String(control.mt5_account_id)
          : state.mt5AccountId;

      if ($("mt5AccountId")) {
        $("mt5AccountId").value = state.mt5AccountId;
      }
    }

    if (status) {
      state.robotStatus = {
        connected: Boolean(status.connected),
        running: Boolean(status.running),
        balance: Number(status.balance) || 0,
        equity: Number(status.equity) || 0,
        dailyPL: Number(status.daily_pl) || 0,
        openTrades: Number(status.open_trades) || 0,
        lastHeartbeat: status.last_heartbeat || null,
        lastError: status.last_error || ""
      };
    }

    renderRobotStatus();
    updatePortfolio();

  } catch (error) {
    console.warn("Robot status refresh warning:", error);
  }
}


function startRobotStatusRefresh() {

  clearInterval(state.robotStatusTimer);

  state.robotStatusTimer =
    setInterval(refreshRobotStatus, 5000);
}


async function saveRobotControl(running) {

  if (!state.supabase || !state.user) {
    throw new Error("Trading account session is not available.");
  }

  const accountId =
    Number($("mt5AccountId")?.value || state.mt5AccountId);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("Enter your AvaTrade MT5 Account ID first.");
  }

  state.mt5AccountId = String(accountId);

  const payload = {
    user_id: state.user.id,
    broker: "AvaTrade MT5",
    mode: "LIVE",
    running,
    risk: state.robotRisk,
    max_drawdown: state.maxDrawdown,
    mt5_account_id: accountId,
    updated_at: new Date().toISOString()
  };

  const { error } =
    await state.supabase
      .from("gotradex_bot_control")
      .upsert(payload, { onConflict: "user_id" });

  if (error) throw error;
}


async function startRobot() {

  try {

    if (!state.supabase || !state.user) {
      throw new Error("Please log in before starting AutoBot.");
    }

    const accountId =
      Number(state.mt5AccountId);

    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error("A valid AvaTrade MT5 account ID is required.");
    }

    if (
      !["conservative", "moderate", "aggressive"]
        .includes(state.robotRisk)
    ) {
      throw new Error("Invalid AutoBot risk setting.");
    }

    const drawdown =
      Number(state.maxDrawdown);

    if (
      !Number.isFinite(drawdown) ||
      drawdown <= 0 ||
      drawdown > 100
    ) {
      throw new Error("Max drawdown must be between 0 and 100.");
    }

    if (!isBrokerStatusFresh()) {
      throw new Error(
        "AvaTrade MT5/VPS is not connected with a fresh heartbeat. AutoBot cannot start yet."
      );
    }

    await saveRobotControl(true);

    state.robotRunning = true;
    state.lastQueuedSignalKey = "";
    state.lastQueuedAt = 0;

    renderRobotStatus();

    showToast(
      "AutoBot started. AvaTrade MT5 will continue running through the MT5/VPS bridge.",
      "success"
    );

  } catch (error) {

    state.robotRunning = false;
    renderRobotStatus();

    console.error("Start robot error:", error);

    showToast(
      error.message || "Unable to start the robot.",
      "error"
    );

  }

}


async function stopRobot() {

  try {

    await saveRobotControl(false);

    state.robotRunning = false;

    renderRobotStatus();

    showToast(
      "AutoBot stopped. No new trades will be submitted.",
      "success"
    );

  } catch (error) {

    console.error("Stop robot error:", error);

    showToast(
      error.message || "Unable to stop the robot.",
      "error"
    );

  }

}


async function queueRobotSignal(signal) {

  if (!state.robotRunning || !state.user) {
    return;
  }

  const lastHeartbeat =
    state.robotStatus.lastHeartbeat
      ? new Date(state.robotStatus.lastHeartbeat).getTime()
      : 0;

  const heartbeatAge =
    lastHeartbeat
      ? Date.now() - lastHeartbeat
      : Infinity;

  if (
    state.robotStatus.connected !== true ||
    heartbeatAge > 30000
  ) {
    return;
  }

  const accountId =
    Number(state.mt5AccountId);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return;
  }

  if (!signal || !["BUY", "SELL"].includes(signal.direction)) {
    return;
  }

  if (Number(signal.confidence) < 70) {
    return;
  }

  const brokerSymbol =
    signal.symbol === "BTCUSDT"
      ? "BTCUSD"
      : signal.symbol;

  const now = Date.now();
  const key =
    [
      brokerSymbol,
      signal.direction,
      Number(signal.entry).toFixed(2),
      Number(signal.stop).toFixed(2),
      Number(signal.target).toFixed(2)
    ].join(":");

  if (
    key === state.lastQueuedSignalKey &&
    now - state.lastQueuedAt < 300000
  ) {
    return;
  }

  const { error } =
    await state.supabase
      .from("gotradex_trade_commands")
      .insert({
        user_id: state.user.id,
        mt5_account_id: accountId,
        symbol: brokerSymbol,
        direction: signal.direction,
        entry: signal.entry,
        stop_loss: signal.stop,
        take_profit: signal.target,
        confidence: signal.confidence,
        risk: state.robotRisk
      });

  if (error) {
    console.error("Robot signal queue error:", error);
    return;
  }

  state.lastQueuedSignalKey = key;
  state.lastQueuedAt = now;

  showToast(
    "AutoBot queued " +
      signal.direction +
      " " +
      brokerSymbol +
      " (" +
      signal.confidence +
      "% confidence).",
    "success"
  );
}


/* =========================================================
   PORTFOLIO
   ========================================================= */

function isBrokerStatusFresh() {

  const heartbeat =
    state.robotStatus.lastHeartbeat
      ? new Date(state.robotStatus.lastHeartbeat).getTime()
      : 0;

  return (
    state.robotStatus.connected === true &&
    Number.isFinite(heartbeat) &&
    Date.now() - heartbeat <= 30000
  );

}


function updatePortfolio() {

  const fresh =
    isBrokerStatusFresh();

  const balance =
    fresh
      ? Number(state.robotStatus.balance) || 0
      : 0;

  const equity =
    fresh
      ? Number(state.robotStatus.equity) || 0
      : 0;

  const dailyPL =
    fresh
      ? Number(state.robotStatus.dailyPL) || 0
      : 0;

  const openTrades =
    fresh
      ? Number(state.robotStatus.openTrades) || 0
      : 0;

  const invested =
    fresh
      ? Math.max(0, balance - equity)
      : 0;

  if ($("balanceValue")) {
    $("balanceValue").textContent =
      formatMoney(balance);
  }

  if ($("dailyProfitValue")) {
    $("dailyProfitValue").textContent =
      formatMoney(dailyPL);
  }

  if ($("portfolioBalance")) {
    $("portfolioBalance").textContent =
      formatMoney(balance);
  }

  if ($("portfolioAvailable")) {
    $("portfolioAvailable").textContent =
      formatMoney(equity);
  }

  if ($("portfolioInvested")) {
    $("portfolioInvested").textContent =
      formatMoney(invested);
  }

  if ($("portfolioProfit")) {
    $("portfolioProfit").textContent =
      formatMoney(dailyPL);
  }

  const positionsEmpty =
    $("positionsEmpty");

  if (positionsEmpty) {
    positionsEmpty.textContent =
      fresh
        ? openTrades > 0
          ? openTrades + " open trade" + (openTrades === 1 ? "" : "s") + " reported by AvaTrade MT5. Detailed position data will appear when the bridge provides position details."
          : "No open trades reported by AvaTrade MT5."
        : "Waiting for a fresh AvaTrade MT5 connection.";
  }

}

/* =========================================================
   AFFILIATES
   ========================================================= */

function updateAffiliates() {

  const code =
    state.profile?.referral_code ||
    generateReferralCode(
      state.user?.id
    );


  if ($("referralCode")) {

    $("referralCode").textContent =
      code;

  }


  if ($("referralLink")) {

    const url =
      new URL(
        window.location.href
      );

    url.searchParams.set(
      "ref",
      code
    );

    $("referralLink").value =
      url.toString();

  }

}


async function copyText(text) {

  try {

    await navigator.clipboard.writeText(
      text
    );

    showToast(
      "Copied.",
      "success"
    );

  } catch {

    showToast(
      "Copy failed. Select and copy manually.",
      "error"
    );

  }

}


/* =========================================================
   SUPPORT CHAT
   ========================================================= */

async function loadSupportMessages() {

  if (
    !state.supabase ||
    !state.user
  ) {
    return;
  }


  try {

    const { data, error } =
      await state.supabase
        .from("support_messages")
        .select("*")
        .eq("user_id", state.user.id)
        .order("created_at", {
          ascending: true
        });


    if (error) {
      throw error;
    }


    renderChatMessages(
      data || []
    );


  } catch (error) {

    console.error(
      "Support messages error:",
      error
    );

    const container =
      $("chatMessages");

    if (container) {

      container.innerHTML = `

        <div class="empty-state">
          Unable to load live chat.
        </div>

      `;

    }

  }

}


function renderChatMessages(messages) {

  const container =
    $("chatMessages");

  if (!container) {
    return;
  }


  if (!messages.length) {

    container.innerHTML = `

      <div class="empty-state">
        Start a conversation with GoTradeX Support.
      </div>

    `;

    return;

  }


  container.innerHTML =
    messages
      .map(message => {

        const date =
          new Date(
            message.created_at
          );


        return `

          <div class="chat-bubble ${message.sender === "support" ? "support" : "user"}">

            <div>
              ${escapeHTML(
                message.message
              )}
            </div>

            <div class="chat-time">
              ${date.toLocaleString()}
            </div>

          </div>

        `;

      })
      .join("");


  container.scrollTop =
    container.scrollHeight;

}


async function sendChatMessage(event) {

  event.preventDefault();


  if (
    !state.supabase ||
    !state.user
  ) {

    showToast(
      "You must be logged in.",
      "error"
    );

    return;

  }


  const input =
    $("chatInput");

  const message =
    input?.value.trim();


  if (!message) {
    return;
  }


  input.value = "";


  try {

    const { error } =
      await state.supabase
        .from("support_messages")
        .insert({

          user_id:
            state.user.id,

          message,

          sender:
            "user"

        });


    if (error) {
      throw error;
    }


    await loadSupportMessages();


  } catch (error) {

    console.error(
      "Send chat error:",
      error
    );

    showToast(
      error.message ||
      "Message could not be sent.",
      "error"
    );

  }

}


function subscribeToSupportChat() {

  if (
    !state.supabase ||
    !state.user
  ) {
    return;
  }


  if (state.supportChannel) {

    state.supabase
      .removeChannel(
        state.supportChannel
      );

  }


  state.supportChannel =
    state.supabase
      .channel(
        `support-${state.user.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_messages",
          filter:
            `user_id=eq.${state.user.id}`
        },
        () => {

          if (
            state.currentPage ===
            "support"
          ) {

            loadSupportMessages();

          }

        }
      )
      .subscribe();

}


/* =========================================================
   SETTINGS
   ========================================================= */

async function saveProfile(event) {

  event.preventDefault();


  if (
    !state.supabase ||
    !state.user
  ) {
    return;
  }


  const name =
    $("settingsName")
      ?.value
      .trim();


  if (!name) {

    showToast(
      "Enter your name.",
      "error"
    );

    return;
  }


  try {

    const { error: authError } =
      await state.supabase.auth
        .updateUser({

          data: {

            full_name: name

          }

        });


    if (authError) {
      throw authError;
    }


    const { error: profileError } =
      await state.supabase
        .from("profiles")
        .upsert(
          {

            id: state.user.id,

            email:
              state.user.email || "",

            full_name:
              name,

            referral_code:
              state.profile?.referral_code ||
              generateReferralCode(
                state.user.id
              )

          },
          {
            onConflict: "id"
          }
        );


    if (profileError) {
      throw profileError;
    }


    state.user =
      (
        await state.supabase.auth
          .getUser()
      ).data.user;


    await loadProfile();

    updateUserInterface();

    showToast(
      "Profile saved.",
      "success"
    );


  } catch (error) {

    console.error(
      "Profile save error:",
      error
    );

    showToast(
      error.message ||
      "Profile could not be saved.",
      "error"
    );

  }

}


async function changePassword(event) {

  event.preventDefault();


  const password =
    $("newPassword")
      ?.value || "";

  const confirm =
    $("confirmPassword")
      ?.value || "";


  if (password.length < 6) {

    showToast(
      "Password must contain at least 6 characters.",
      "error"
    );

    return;
  }


  if (password !== confirm) {

    showToast(
      "Passwords do not match.",
      "error"
    );

    return;
  }


  try {

    const { error } =
      await state.supabase.auth
        .updateUser({
          password
        });


    if (error) {
      throw error;
    }


    $("passwordForm").reset();


    showToast(
      "Password changed successfully.",
      "success"
    );


  } catch (error) {

    showToast(
      error.message ||
      "Password change failed.",
      "error"
    );

  }

}


function saveConnections() {

  const settings = {

    telegramWebhook:
      $("telegramWebhook")
        ?.value
        .trim() || "",

    whatsappWebhook:
      $("whatsappWebhook")
        ?.value
        .trim() || ""

  };


  localStorage.setItem(
    "gotradex_connections",
    JSON.stringify(settings)
  );


  state.settings =
    settings;


  showToast(
    "Connection settings saved.",
    "success"
  );

}


function loadConnections() {

  try {

    const saved =
      JSON.parse(
        localStorage.getItem(
          "gotradex_connections"
        ) || "{}"
      );


    state.settings = {

      telegramWebhook:
        saved.telegramWebhook || "",

      whatsappWebhook:
        saved.whatsappWebhook || ""

    };


    if ($("telegramWebhook")) {

      $("telegramWebhook").value =
        state.settings.telegramWebhook;

    }


    if ($("whatsappWebhook")) {

      $("whatsappWebhook").value =
        state.settings.whatsappWebhook;

    }

  } catch {

    state.settings = {

      telegramWebhook: "",
      whatsappWebhook: ""

    };

  }

}


/* =========================================================
   REFRESH
   ========================================================= */

async function refreshApplication() {

  const button =
    $("refreshButton");


  if (button) {
    button.disabled = true;
  }


  try {

    await loadLiveMarkets();

    await createChart();

    updatePortfolio();

    await updateSignalFromMarket();

    showToast(
      "Live data refreshed.",
      "success"
    );

  } catch (error) {

    console.error(
      "Refresh error:",
      error
    );

    showToast(
      "Live market refresh failed.",
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
    }

  }

}


/* =========================================================
   LIVE APP
   ========================================================= */

async function initializeLiveApp() {

  loadConnections();

  updatePortfolio();

  updateAffiliates();

  subscribeToSupportChat();

  await loadRobotState();

  startRobotStatusRefresh();

  await loadLiveMarkets();

  await createChart();

  updatePortfolio();

  updateSignalFromMarket();

  startLiveRefresh();

}


function startLiveRefresh() {

  clearInterval(
    state.liveRefreshTimer
  );


  state.liveRefreshTimer =
    setInterval(
      async () => {

        await loadLiveMarkets();

        updatePortfolio();

        if (
          state.currentPage ===
          "dashboard"
        ) {

          await createChart();

        }

      },
      30000
    );

}


/* =========================================================
   ADMIN FINANCE
   ========================================================= */

async function loadAdminFinanceSettings() {

  if (
    !state.isAdmin ||
    !state.supabase
  ) {
    return;
  }

  try {

    const { data, error } =
      await state.supabase
        .from("gotradex_platform_finance")
        .select("*")
        .eq("id", true)
        .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return;
    }

    const allocation =
      Number(data.trade_allocation_amount) || 0;

    const input =
      $("adminTradeAllocation");

    if (input) {
      input.value =
        allocation.toFixed(2);
    }

    if ($("adminTradeAllocationStatus")) {
      $("adminTradeAllocationStatus").textContent =
        formatMoney(allocation);
    }

    if ($("adminTotalFunded")) {
      $("adminTotalFunded").textContent =
        formatMoney(0);
    }

    if ($("adminAllocatedCapital")) {
      $("adminAllocatedCapital").textContent =
        formatMoney(0);
    }

    if ($("adminAvailableCapital")) {
      $("adminAvailableCapital").textContent =
        formatMoney(0);
    }

  } catch (error) {

    console.warn(
      "Admin finance settings load failed:",
      error
    );

    showToast(
      "Finance settings could not be loaded.",
      "error"
    );

  }

}


async function saveAdminFinanceSettings() {

  if (
    !state.isAdmin ||
    !state.supabase
  ) {
    showToast(
      "Admin access is required.",
      "error"
    );
    return;
  }

  const input =
    $("adminTradeAllocation");

  const allocation =
    Number(input?.value);

  if (
    !Number.isFinite(allocation) ||
    allocation < 0
  ) {
    showToast(
      "Enter a valid trading allocation.",
      "error"
    );
    return;
  }

  try {

    const { error } =
      await state.supabase
        .from("gotradex_platform_finance")
        .update({
          trade_allocation_amount:
            allocation,
          updated_at:
            new Date().toISOString(),
          updated_by:
            state.user.id
        })
        .eq("id", true);

    if (error) {
      throw error;
    }

    if ($("adminTradeAllocationStatus")) {
      $("adminTradeAllocationStatus").textContent =
        formatMoney(allocation);
    }

    showToast(
      "Finance settings saved.",
      "success"
    );

  } catch (error) {

    console.error(
      "Admin finance save error:",
      error
    );

    showToast(
      error.message ||
      "Finance settings could not be saved.",
      "error"
    );

  }

}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

  if (!state.supabase) {
    return;
  }


  try {

    const { error } =
      await state.supabase.auth
        .signOut({
          scope: "local"
        });


    if (error) {
      throw error;
    }


    state.user = null;
    state.profile = null;
    state.isAdmin = false;

    $("adminNavButton")?.classList.add("hidden");

    showAuthScreen();

    showLoginForm();

    showToast(
      "Logged out.",
      "success"
    );


  } catch (error) {

    console.error(
      "Logout error:",
      error
    );

    showToast(
      error.message ||
      "Logout failed.",
      "error"
    );

  }

}


/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindEvents() {

  $("loginTab")
    ?.addEventListener(
      "click",
      showLoginForm
    );


  $("registerTab")
    ?.addEventListener(
      "click",
      showRegisterForm
    );


  $("forgotPasswordButton")
    ?.addEventListener(
      "click",
      showResetForm
    );


  $("backToLoginButton")
    ?.addEventListener(
      "click",
      showLoginForm
    );


  $("loginForm")
    ?.addEventListener(
      "submit",
      handleLogin
    );


  $("registerForm")
    ?.addEventListener(
      "submit",
      handleRegister
    );


  $("resetForm")
    ?.addEventListener(
      "submit",
      handlePasswordReset
    );


  bindPasswordToggle(
    "toggleLoginPassword",
    "loginPassword"
  );


  bindPasswordToggle(
    "toggleRegisterPassword",
    "registerPassword"
  );


  bindNavigation();


  $("refreshButton")
    ?.addEventListener(
      "click",
      refreshApplication
    );


  $("topProfileButton")
    ?.addEventListener(
      "click",
      () => showPage("settings")
    );


  $("profileSettingsButton")
    ?.addEventListener(
      "click",
      () => showPage("settings")
    );


  $("settingsLogoutButton")
    ?.addEventListener(
      "click",
      logout
    );


  $("logoutButton")
    ?.addEventListener(
      "click",
      logout
    );


  $("mobileMenuButton")
    ?.addEventListener(
      "click",
      () => {

        $("sidebar")
          ?.classList.toggle("open");

      }
    );


  document
    .querySelectorAll(".timeframe")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(".timeframe")
            .forEach(item =>
              item.classList.remove(
                "active"
              )
            );

          button.classList.add("active");

          state.currentTimeframe =
            button.dataset.timeframe;

          createChart();

        }
      );

    });


  document
    .querySelectorAll(".category-tab")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(".category-tab")
            .forEach(item =>
              item.classList.remove(
                "active"
              )
            );

          button.classList.add("active");

          state.currentCategory =
            button.dataset.category;

          renderMarketsList();

        }
      );

    });


  $("marketSearch")
    ?.addEventListener(
      "input",
      renderMarketsList
    );


  $("analyzeButton")
    ?.addEventListener(
      "click",
      runAnalyzer
    );


  document
    .querySelectorAll(".risk-button")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          setRobotRisk(
            button.dataset.risk
          );

        }
      );

    });


  $("startRobotButton")
    ?.addEventListener(
      "click",
      startRobot
    );


  $("stopRobotButton")
    ?.addEventListener(
      "click",
      stopRobot
    );


  $("copyReferralButton")
    ?.addEventListener(
      "click",
      () => {

        copyText(
          $("referralCode")
            ?.textContent || ""
        );

      }
    );


  $("copyReferralLinkButton")
    ?.addEventListener(
      "click",
      () => {

        copyText(
          $("referralLink")
            ?.value || ""
        );

      }
    );


  $("chatForm")
    ?.addEventListener(
      "submit",
      sendChatMessage
    );


  $("profileForm")
    ?.addEventListener(
      "submit",
      saveProfile
    );


  $("passwordForm")
    ?.addEventListener(
      "submit",
      changePassword
    );


  $("saveConnectionsButton")
    ?.addEventListener(
      "click",
      saveConnections
    );


  $("saveAdminFinanceButton")
    ?.addEventListener(
      "click",
      saveAdminFinanceSettings
    );

}


/* =========================================================
   START
   ========================================================= */

async function initializeApp() {

  console.log(
    `${APP_NAME} initializing... ${APP_VERSION}`
  );


  const connected =
    initializeSupabase();


  bindEvents();


  if (!connected) {

    showAuthScreen();

    return;

  }


  listenForAuthChanges();

  await restoreSession();


  console.log(
    `${APP_NAME} initialized. ${APP_VERSION}`
  );

}


/* =========================================================
   START ONLY ONCE
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp,
    {
      once: true
    }
  );

} else {

  initializeApp();

}