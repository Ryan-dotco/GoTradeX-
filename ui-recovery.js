/* GoTradeX UI Recovery — keeps core dashboard controls clickable if an earlier script aborts. */
(()=>{"use strict";
function by(id){return document.getElementById(id)}
function open(id){const e=by(id);if(e)e.classList.add("open")}
function close(id){const e=by(id);if(e)e.classList.remove("open")}
function bind(id,fn){const e=by(id);if(!e)return;e.dataset.gtxRecovery="1";e.addEventListener("click",e2=>{if(e2.defaultPrevented)return;try{fn(e2)}catch(err){console.error("GoTradeX UI recovery",err)}},{capture:false})}
function loadLiveChart(){if(window.GoTradeXLiveChart){try{window.GoTradeXLiveChart.boot?.()}catch(_){}return}const s=document.createElement("script");s.src="live-chart.js?v=20261008derivtest1";s.async=true;s.onload=()=>{try{window.GoTradeXLiveChart?.boot?.()}catch(_){}};document.head.appendChild(s)}
function boot(){
 loadLiveChart();
 bind("menuBtn",()=>open("menuDrawer"));
 bind("walletBtn",()=>open("walletDrawer"));
 bind("accountBalanceBar",()=>open("accountDrawer"));
 bind("pairName",()=>open("assetDrawer"));
 bind("assetBtn",()=>open("assetDrawer"));
 bind("timeBtn",()=>open("timeDrawer"));
 bind("timeBtn",()=>{const d=by("timeDrawer");if(d)d.classList.add("open");});
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
 const times=by("times"); if(times&&!times.dataset.gtxRecoveryBound){times.dataset.gtxRecoveryBound="1";times.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const tf=(b.textContent||"").replace(/\s*▾\s*$/,"").trim();if(window.GoTradeXLiveChart?.setTimeframe)window.GoTradeXLiveChart.setTimeframe(tf);const t=by("timeBtn");if(t)t.textContent=tf+" ▾";close("timeDrawer");});}
 const assets=by("assetDrawer"); if(assets&&!assets.dataset.gtxRecoveryBound){assets.dataset.gtxRecoveryBound="1";assets.addEventListener("click",e=>{const b=e.target.closest(".searchableAsset");if(!b)return;const pair=b.querySelector(".gtxAssetName")?.textContent?.trim();const type=b.dataset.assetType||"crypto";if(pair&&window.GoTradeXLiveChart?.setAsset)window.GoTradeXLiveChart.setAsset(pair,type,window.gtxMarketMode||"LIVE");});}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();