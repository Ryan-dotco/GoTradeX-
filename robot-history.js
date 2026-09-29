/* GoTradeX runtime loader — keeps history and installs the live chart after script.js */
(function(){
  "use strict";
  function load(src){
    const s=document.createElement("script");
    s.src=src+"?v=3.0.48";
    s.async=false;
    document.head.appendChild(s);
  }
  load("robot-history-core.js");
  load("gtx-live-chart-fix.js");
})();