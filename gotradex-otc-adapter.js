/* GoTradeX verified OTC adapter compatibility shim.
 * Generated otc_prices/otc_candles and gotradex-otc-engine fallback are disabled.
 * Only symbols returned as verified by the Deriv resolver can be charted as OTC.
 */
(function(){
  "use strict";
  if(window.GoTradeXOTCAdapter)return;
  const feeds=window.GoTradeXMarketFeeds;
  window.GoTradeXOTCAdapter={
    verifiedOnly:true,
    available:!!(feeds&&typeof feeds.resolve==="function"),
    resolve:function(){return feeds&&typeof feeds.resolve==="function"?feeds.resolve():{available:false,provider:"NONE",reason:"Verified feed registry is unavailable."};},
    status:function(){return "Synthetic OTC fallback disabled; verified Deriv OTC symbols only."}
  };
})();
