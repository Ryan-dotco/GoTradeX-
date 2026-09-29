/* GoTradeX clean chart trading controls */
(function(){
  "use strict";

  const groups = {
    crypto:[["BTCUSDT","BTC / USDT"],["ETHUSDT","ETH / USDT"],["SOLUSDT","SOL / USDT"],["XRPUSDT","XRP / USDT"]],
    forex:[["EURUSD","EUR / USD"],["GBPUSD","GBP / USD"],["USDJPY","USD / JPY"],["AUDUSD","AUD / USD"],["USDCHF","USD / CHF"]],
    commodities:[["USOIL","US Oil"],["UKOIL","UK Oil"],["NATGAS","Natural Gas"]],
    indices:[["US30","US 30"],["US500","US 500"],["NAS100","Nasdaq 100"],["GER40","Germany 40"]],
    metals:[["XAUUSD","Gold / USD"],["XAGUSD","Silver / USD"],["XPTUSD","Platinum / USD"]]
  };

  const chartTimeframes = ["1m","5m","15m","30m","1h","4h"];
  let category = "crypto";
  let symbol = "BTCUSDT";
  let timeframe = "5m";

  function state(){ return window.state || {}; }

  function setState(){
    if (!window.state) return;
    window.state.currentSymbol = symbol;
    window.state.currentTimeframe = timeframe;
    window.state.currentTradeDuration = document.getElementById("gtxDashboardTradeDuration")?.value || "5m";
  }

  function renderAssets(){
    const select = document.getElementById("gtxDashboardAssetSelect");
    if (!select) return;
    const list = groups[category] || [];
    if (!list.some(x => x[0] === symbol)) symbol = list[0]?.[0] || "BTCUSDT";
    select.innerHTML = list.map(([value,label]) => '<option value="'+value+'">'+label+'</option>').join("");
    select.value = symbol;
    setState();
    renderSummary();
  }

  function renderSummary(){
    const market = state().markets?.[symbol] || {};
    const price = Number(market.price);
    const text = Number.isFinite(price) && price > 0
      ? price.toLocaleString(undefined,{maximumFractionDigits:8})
      : "—";

    const priceEl = document.getElementById("gtxDashboardChartPrice");
    const symbolEl = document.getElementById("gtxDashboardChartSymbol");
    const bidEl = document.getElementById("gtxDashboardBidPrice");
    const askEl = document.getElementById("gtxDashboardAskPrice");
    if (symbolEl) symbolEl.textContent = symbol;
    if (priceEl) priceEl.textContent = text;
    if (bidEl) bidEl.textContent = text;
    if (askEl) askEl.textContent = text;
  }

  function setMenu(open){
    const menu = document.getElementById("gtxDashboardAssetsMenu");
    const button = document.getElementById("gtxDashboardAssetsButton");
    if (!menu || !button) return;
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }

  function bind(){
    const assetButton = document.getElementById("gtxDashboardAssetsButton");
    assetButton?.addEventListener("click", function(event){
      event.stopPropagation();
      const menu = document.getElementById("gtxDashboardAssetsMenu");
      setMenu(Boolean(menu?.hidden));
    });

    document.addEventListener("click", function(event){
      if (!event.target.closest(".gtx-trade-top-actions")) setMenu(false);
    });

    document.querySelectorAll("[data-dashboard-category]").forEach(btn => {
      btn.addEventListener("click", function(){
        category = this.dataset.dashboardCategory;
        document.querySelectorAll("[data-dashboard-category]").forEach(b => b.classList.toggle("active", b === this));
        renderAssets();
      });
    });

    document.getElementById("gtxDashboardAssetSelect")?.addEventListener("change", function(){
      symbol = this.value;
      setState();
      renderSummary();
      setMenu(false);
      window.GTXFreshChart?.reload?.();
    });

    document.querySelectorAll("[data-dashboard-timeframe]").forEach(btn => {
      btn.addEventListener("click", function(){
        timeframe = this.dataset.dashboardTimeframe;
        document.querySelectorAll("[data-dashboard-timeframe]").forEach(b => b.classList.toggle("active", b === this));
        setState();
        window.GTXFreshChart?.reload?.();
      });
    });

    document.getElementById("gtxDashboardTradeDuration")?.addEventListener("change", setState);
    document.getElementById("gtxDashboardBuyButton")?.addEventListener("click", function(){
      window.submitManualTrade?.("BUY").catch?.(e => window.showToast?.(e.message || "BUY failed","error"));
    });
    document.getElementById("gtxDashboardSellButton")?.addEventListener("click", function(){
      window.submitManualTrade?.("SELL").catch?.(e => window.showToast?.(e.message || "SELL failed","error"));
    });

    // The Kenghi UI belongs to Support, not the trading screen.
    setState();
    renderAssets();
    setInterval(renderSummary,1000);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();

  window.GTXDashboardControls = { getState:()=>({category,symbol,timeframe}), render:renderSummary };
})();