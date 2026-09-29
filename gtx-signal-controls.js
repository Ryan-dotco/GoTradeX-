/* =========================================================
   GOTRADEX PHASE 3
   SIGNAL ANALYZER CONTROLS
   ========================================================= */

(function () {
  "use strict";

  const groups = {
    commodities: [
      ["USOIL", "US Oil"],
      ["UKOIL", "UK Oil"],
      ["NATGAS", "Natural Gas"]
    ],
    indices: [
      ["US30", "US 30"],
      ["US500", "US 500"],
      ["NAS100", "Nasdaq 100"],
      ["GER40", "Germany 40"]
    ],
    forex: [
      ["EURUSD", "EUR / USD"],
      ["GBPUSD", "GBP / USD"],
      ["USDJPY", "USD / JPY"],
      ["AUDUSD", "AUD / USD"],
      ["USDCHF", "USD / CHF"]
    ],
    crypto: [
      ["BTCUSDT", "BTC / USDT"],
      ["ETHUSDT", "ETH / USDT"],
      ["SOLUSDT", "SOL / USDT"],
      ["XRPUSDT", "XRP / USDT"]
    ],
    metals: [
      ["XAUUSD", "Gold / USD"],
      ["XAGUSD", "Silver / USD"],
      ["XPTUSD", "Platinum / USD"]
    ]
  };

  let category = "crypto";
  let timeframe = "1m";
  const selectedIndicators = new Set(["ema", "rsi", "momentum"]);

  function $(id) {
    return document.getElementById(id);
  }

  function setCategory(next) {
    if (!groups[next]) return;
    category = next;

    document.querySelectorAll("[data-signal-category]").forEach(button => {
      button.classList.toggle("active", button.dataset.signalCategory === category);
    });

    const select = $("signalAsset");
    if (!select) return;

    select.innerHTML = groups[category].map(([value, label]) =>
      '<option value="' + value + '">' + label + "</option>"
    ).join("");

    const preferred = category === "crypto" ? "BTCUSDT" : groups[category][0][0];
    select.value = preferred;
    syncResultHeader();
  }

  function setTimeframe(next) {
    timeframe = next;

    document.querySelectorAll("[data-signal-timeframe]").forEach(button => {
      button.classList.toggle("active", button.dataset.signalTimeframe === timeframe);
    });

    if (window.state && typeof window.state === "object") {
      window.state.currentTimeframe = timeframe;
    }

    syncResultHeader();
  }

  function syncResultHeader() {
    const select = $("signalAsset");
    const instrument = select?.value || "BTCUSDT";
    const output = $("gtxSignalInstrument");
    const tf = $("gtxSignalTimeframe");

    if (output) output.textContent = instrument;
    if (tf) tf.textContent = timeframe;
  }

  function bind() {
    document.querySelectorAll("[data-signal-category]").forEach(button => {
      button.addEventListener("click", () => setCategory(button.dataset.signalCategory));
    });

    document.querySelectorAll("[data-signal-timeframe]").forEach(button => {
      button.addEventListener("click", () => setTimeframe(button.dataset.signalTimeframe));
    });

    document.querySelectorAll("[data-indicator]").forEach(button => {
      button.addEventListener("click", () => {
        const key = button.dataset.indicator;
        if (!key) return;

        if (selectedIndicators.has(key)) {
          selectedIndicators.delete(key);
          button.classList.remove("active");
        } else {
          selectedIndicators.add(key);
          button.classList.add("active");
        }

        window.GTXSignalControls = {
          category,
          timeframe,
          indicators: Array.from(selectedIndicators)
        };
      });
    });

    $("signalAsset")?.addEventListener("change", syncResultHeader);

    setCategory("crypto");
    setTimeframe("1m");

    window.GTXSignalControls = {
      category,
      timeframe,
      indicators: Array.from(selectedIndicators),
      getState: () => ({
        category,
        timeframe,
        indicators: Array.from(selectedIndicators),
        symbol: $("signalAsset")?.value || "BTCUSDT"
      })
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
