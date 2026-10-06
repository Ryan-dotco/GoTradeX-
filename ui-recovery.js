/* GoTradeX UI Recovery — keeps core dashboard controls clickable if an earlier script aborts. */
(()=>{"use strict";
function by(id){return document.getElementById(id)}
function open(id){const e=by(id);if(e)e.classList.add("open")}
function close(id){const e=by(id);if(e)e.classList.remove("open")}
function bind(id,fn){const e=by(id);if(!e)return;e.dataset.gtxRecovery="1";e.addEventListener("click",e2=>{if(e2.defaultPrevented)return;try{fn(e2)}catch(err){console.error("GoTradeX UI recovery",err)}},{capture:false})}
function loadLiveChart(){if(window.GoTradeXChartEngine)return;const s=document.createElement("script");s.src="chart-engine.js?v=gtx-live-candles-scale-20261004d";s.async=true;s.onload=()=>{try{window.GoTradeXChartEngine?.boot?.()}catch(_){}};document.head.appendChild(s)}
function boot(){
 loadLiveChart();
 bind("menuBtn",()=>open("menuDrawer"));
 bind("walletBtn",()=>open("walletDrawer"));
 bind("accountBalanceBar",()=>open("accountDrawer"));
 bind("pairName",()=>open("assetDrawer"));
 bind("assetBtn",()=>open("assetDrawer"));
 bind("timeBtn",()=>open("timeDrawer"));
 bind("amountBtn",()=>open("keypad"));
 bind("marketMoreBtn",()=>open("chartToolsDrawer"));
 bind("mainAutoBotBtn",()=>{close("menuDrawer");open("adminPage");const s=by("adminAutoBot");if(s){document.querySelectorAll(".adminSection").forEach(x=>x.classList.remove("open"));s.classList.add("open");}});
 document.addEventListener("click",e=>{
   const target=e.target?.closest?.("#pairName,#assetBtn");
   if(!target)return;
   const drawer=by("assetDrawer");
   if(!drawer)return;
   e.preventDefault();
   e.stopImmediatePropagation();
   drawer.classList.add("open");
 },true);
 document.querySelectorAll("[data-close]").forEach(b=>{b.addEventListener("click",()=>close(b.dataset.close))});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();