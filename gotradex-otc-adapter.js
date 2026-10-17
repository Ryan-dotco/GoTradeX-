/* GoTradeX verified OTC adapter compatibility shim.
 * The former adapter read generated otc_prices/otc_candles and polled the
 * synthetic gotradex-otc-engine. That route is intentionally disabled.
 * OTC chart access is now allowed only through symbols verified by the
 * Deriv resolver in market-data.js. Unsupported OTC forex pairs stay unavailable.
 */
(function(){
  "use strict";
  if(window.GoTradeXOTCAdapter)return;
  function install(){
    const feeds=window.GoTradeXMarketFeeds;
    if(!feeds||typeof feeds.resolve!=="function"){
      window.setTimeout(install,50);
      return;
    }
    window.GoTradeXOTCAdapter={
      verifiedOnly:true,
      resolve:function(){return feeds.resolve();},
      status:function(){return "Synthetic OTC table and engine fallback disabled; use verified Deriv OTC symbols only."}
    };
  }
  install();
})();
