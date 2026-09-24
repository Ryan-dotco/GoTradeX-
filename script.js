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