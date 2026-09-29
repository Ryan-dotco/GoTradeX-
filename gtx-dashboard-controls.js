/* GoTradeX first dashboard controls */
(function(){
  "use strict";

  const groups = {
    commodities: [["USOIL","US Oil"],["UKOIL","UK Oil"],["NATGAS","Natural Gas"]],
    forex: [["EURUSD","EUR / USD"],["GBPUSD","GBP / USD"],["USDJPY","USD / JPY"],["AUDUSD","AUD / USD"],["USDCHF","USD / CHF"]],
    crypto: [["BTCUSDT","BTC / USDT"],["ETHUSDT","ETH / USDT"],["SOLUSDT","SOL / USDT"],["XRPUSDT","XRP / USDT"]],
    indices: [["US30","US 30"],["US500","US 500"],["NAS100","Nasdaq 100"],["GER40","Germany 40"]],
    metals: [["XAUUSD","Gold / USD"],["XAGUSD","Silver / USD"],["XPTUSD","Platinum / USD"]]
  };

  const timeframes = ["5s","15s","30s","1m","5m","15m","1h","4h","1D"];
  let category = "commodities";
  let symbol = "USOIL";
  let timeframe = "1m";

  function state(){ return window.state || {}; }
  function setState(){
    if (!window.state) return;
    window.state.currentSymbol = symbol;
    window.state.currentTimeframe = timeframe;
  }

  function renderAssets(){
    const select = document.getElementById("gtxDashboardAssetSelect");
    if (!select) return;
    select.innerHTML = (groups[category] || []).map(([value,label]) =>
      '<option value="'+value+'">'+label+'</option>'
    ).join("");
    const found = (groups[category] || []).some(x => x[0] === symbol);
    if (!found) symbol = groups[category]?.[0]?.[0] || "BTCUSDT";
    select.value = symbol;
    setState();
    renderSummary();
  }

  function renderSummary(){
    const s = state();
    const market = s.markets?.[symbol] || {};
    const price = Number(market.price);
    const priceText = Number.isFinite(price) && price > 0 ? price.toLocaleString(undefined,{maximumFractionDigits:8}) : "—";
    const ids = {
      market:"gtxDashboardSelectedMarket",
      timeframe:"gtxDashboardSelectedTimeframe",
      signal:"gtxDashboardSignal",
      bid:"gtxDashboardBidPrice",
      ask:"gtxDashboardAskPrice"
    };
    const el = id => document.getElementById(id);
    if(el(ids.market)) el(ids.market).textContent = symbol;
    if(el(ids.timeframe)) el(ids.timeframe).textContent = timeframe;
    if(el(ids.bid)) el(ids.bid).textContent = priceText;
    if(el(ids.ask)) el(ids.ask).textContent = priceText;
  }

  function bind(){
    document.querySelectorAll("[data-dashboard-category]").forEach(btn => {
      btn.addEventListener("click", function(){
        category = this.dataset.dashboardCategory;
        document.querySelectorAll("[data-dashboard-category]").forEach(b => b.classList.toggle("active", b === this));
        renderAssets();
      });
    });

    const select = document.getElementById("gtxDashboardAssetSelect");
    select?.addEventListener("change", function(){
      symbol = this.value;
      setState();
      renderSummary();
    });

    document.querySelectorAll("[data-dashboard-timeframe]").forEach(btn => {
      btn.addEventListener("click", function(){
        timeframe = this.dataset.dashboardTimeframe;
        document.querySelectorAll("[data-dashboard-timeframe]").forEach(b => b.classList.toggle("active", b === this));
        setState();
        renderSummary();
      });
    });

    document.getElementById("gtxKenghiChatButton")?.addEventListener("click", function(){
      if(typeof window.showPage === "function") window.showPage("support");
    });

    document.getElementById("gtxDashboardBuyButton")?.addEventListener("click", function(){
      if(typeof window.submitManualTrade === "function") window.submitManualTrade("BUY").catch(e => window.showToast?.(e.message || "BUY failed","error"));
    });
    document.getElementById("gtxDashboardSellButton")?.addEventListener("click", function(){
      if(typeof window.submitManualTrade === "function") window.submitManualTrade("SELL").catch(e => window.showToast?.(e.message || "SELL failed","error"));
    });

    renderAssets();
    setInterval(renderSummary, 1000);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();

  window.GTXDashboardControls = { getState:()=>({category,symbol,timeframe}), render:renderSummary };
})();