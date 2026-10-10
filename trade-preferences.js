/* GoTradeX persistent trading preferences.
 * Keeps the user's selected trade amount and expiration timeframe across refreshes.
 * This stores UI preferences only; it does not execute or authorize trades.
 */
(function(){
  "use strict";
  const TIME_KEY="gotradex_trade_expiration";
  const LEGACY_TIME_KEY="gotradex_trade_timeframe";
  const AMOUNT_KEY="gotradex_trade_amount";
  const TIMES=["5 Seconds","15 Seconds","30 Seconds","1 Minute","2 Minutes","5 Minutes","15 Minutes","30 Minutes","1 Hour","4 Hours","1 Day","1 Month","3 Months","6 Months","1 Year"];

  function cleanTime(v){
    const s=String(v||"").replace(/\s*▾\s*$/,"").trim();
    return TIMES.includes(s)?s:null;
  }
  function cleanAmount(v){
    const n=String(v??"").replace(/[^0-9]/g,"");
    if(!n)return "10";
    return n.slice(0,8);
  }
  function applyTime(){
    const btn=document.getElementById("timeBtn");
    const saved=cleanTime(localStorage.getItem(TIME_KEY)||localStorage.getItem(LEGACY_TIME_KEY));
    if(!btn||!saved)return;
    if(window.GoTradeXTimeframeController&&typeof window.GoTradeXTimeframeController.set==="function"){
      window.GoTradeXTimeframeController.set(saved,"expiry");
    }else{
      btn.textContent=saved+" ▾";
      localStorage.setItem(TIME_KEY,saved);
      localStorage.setItem(LEGACY_TIME_KEY,saved);
    }
  }
  function saveTimeFromButton(){
    const btn=document.getElementById("timeBtn");
    const t=cleanTime(btn?.textContent);
    if(t){
      localStorage.setItem(TIME_KEY,t);
      localStorage.setItem(LEGACY_TIME_KEY,t);
    }
  }
  function applyAmount(){
    const saved=localStorage.getItem(AMOUNT_KEY);
    if(!saved)return;
    const amount=document.getElementById("amountValueText");
    if(!amount)return;
    amount.textContent=cleanAmount(saved);
    const top=document.getElementById("topAmountValue");
    if(top)top.textContent=amount.textContent;
  }
  function saveAmount(){
    const amount=document.getElementById("amountValueText");
    if(amount)localStorage.setItem(AMOUNT_KEY,cleanAmount(amount.textContent));
  }
  function boot(){
    applyTime();
    applyAmount();

    const times=document.getElementById("times");
    if(times){
      // This listener stores trade expiration only; chart timeframe is separate.
      times.addEventListener("click",e=>{
        const b=e.target.closest(".option");
        if(!b)return;
        const t=cleanTime(b.textContent);
        if(t){localStorage.setItem(TIME_KEY,t);localStorage.setItem(LEGACY_TIME_KEY,t);}
      },true);
    }

    const timeBtn=document.getElementById("timeBtn");
    if(timeBtn){
      new MutationObserver(saveTimeFromButton).observe(timeBtn,{childList:true,characterData:true,subtree:true});
      saveTimeFromButton();
    }

    const amount=document.getElementById("amountValueText");
    if(amount){
      new MutationObserver(saveAmount).observe(amount,{childList:true,characterData:true,subtree:true});
      saveAmount();
    }

    window.addEventListener("beforeunload",()=>{saveTimeFromButton();saveAmount()},{passive:true});
    setTimeout(applyTime,250);
    setTimeout(applyTime,1000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();