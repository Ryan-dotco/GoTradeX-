(() => {
  "use strict";

  const assets = {
    Forex: [["EURUSD","EUR / USD"],["GBPUSD","GBP / USD"],["USDJPY","USD / JPY"],["USDZAR","USD / ZAR"],["AUDUSD","AUD / USD"],["USDCAD","USD / CAD"],["EURGBP","EUR / GBP"],["GBPJPY","GBP / JPY"]],
    Indices: [["US500","S&P 500"],["NAS100","Nasdaq 100"],["US30","Dow Jones 30"],["GER40","DAX 40"],["UK100","FTSE 100"],["JPN225","Nikkei 225"],["SA40","South Africa 40"]],
    Commodities: [["WTIUSD","WTI Crude Oil"],["BRENTUSD","Brent Crude Oil"],["NATGASUSD","Natural Gas"],["COPPERUSD","Copper"],["COFFEEUSD","Coffee"]],
    Metals: [["XAUUSD","Gold / USD"],["XAGUSD","Silver / USD"],["XPTUSD","Platinum / USD"],["XPDUSD","Palladium / USD"]],
    Crypto: [["BTCUSDT","Bitcoin / USD"],["ETHUSDT","Ethereum / USD"],["BNBUSDT","BNB / USD"],["SOLUSDT","Solana / USD"],["XRPUSDT","XRP / USD"],["ADAUSDT","Cardano / USD"],["DOGEUSDT","Dogecoin / USD"]]
  };

  const prices = {BTCUSDT:64231.5,ETHUSDT:3450.2,BNBUSDT:610.2,SOLUSDT:148.4,XRPUSDT:2.4,ADAUSDT:.82,DOGEUSDT:.17,EURUSD:1.0821,GBPUSD:1.263,USDJPY:150.2,USDZAR:17.5,AUDUSD:.66,USDCAD:1.37,EURGBP:.86,GBPJPY:189.7,US500:5200,NAS100:18200,US30:39000,GER40:18500,UK100:8300,JPN225:39000,SA40:7600,WTIUSD:78.2,BRENTUSD:82.1,NATGASUSD:3.1,COPPERUSD:4.2,COFFEEUSD:290,XAUUSD:2340.1,XAGUSD:28.5,XPTUSD:980,XPDUSD:930};

  const state = { symbol:"BTCUSDT", category:"Crypto", timeframe:"1m" };
  const $ = id => document.getElementById(id);

  function nameOf(symbol) {
    for (const list of Object.values(assets)) {
      const x = list.find(v => v[0] === symbol);
      if (x) return x[1];
    }
    return symbol;
  }

  function candles(symbol) {
    const base = prices[symbol] || 100, out = [];
    let close = base;
    for (let i=0;i<80;i++) {
      const open = close;
      close = Math.max(base*.0001, close * (1 + Math.sin(i/4.5)*.002 + Math.sin(i/9)*.001));
      const spread = Math.max(base*.001, Math.abs(close-open)*2);
      out.push({open,close,high:Math.max(open,close)+spread,low:Math.min(open,close)-spread});
    }
    return out;
  }

  function draw() {
    const canvas=$("gtxDashboardCanvas"), wrap=canvas?.parentElement;
    if (!canvas || !wrap) return;
    const r=wrap.getBoundingClientRect(), dpr=devicePixelRatio||1, w=Math.max(320,r.width), h=Math.max(260,r.height);
    canvas.width=w*dpr; canvas.height=h*dpr; canvas.style.width="100%"; canvas.style.height="100%";
    const c=canvas.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,w,h);
    const data=candles(state.symbol), hi=Math.max(...data.map(x=>x.high)), lo=Math.min(...data.map(x=>x.low));
    const pad=8, right=58, top=10, bottom=18, range=(hi-lo)||1, plotW=w-pad-right, plotH=h-top-bottom;
    const x=i=>pad+(i+.5)*plotW/data.length, y=v=>top+(hi-v)/range*plotH, body=Math.max(2,Math.min(14,plotW/data.length*.7));
    c.fillStyle="#07111f"; c.fillRect(0,0,w,h); c.font="10px Arial";
    for(let i=0;i<=5;i++){const yy=top+plotH*i/5;c.strokeStyle="rgba(145,164,189,.10)";c.beginPath();c.moveTo(pad,yy);c.lineTo(w-right,yy);c.stroke();c.fillStyle="#91a4bd";c.fillText((hi-range*i/5).toFixed(2),w-right+5,yy+3);}
    data.forEach((v,i)=>{const up=v.close>=v.open; c.strokeStyle=up?"#22c55e":"#ef4444";c.fillStyle=c.strokeStyle;c.lineWidth=1;c.beginPath();c.moveTo(x(i),y(v.high));c.lineTo(x(i),y(v.low));c.stroke();c.fillRect(x(i)-body/2,Math.min(y(v.open),y(v.close)),body,Math.max(1,Math.abs(y(v.close)-y(v.open))));});
    $("gtxPriceLabel").textContent=nameOf(state.symbol);
    $("gtxFeedLabel").textContent="Demo market feed";
  }

  function closeMenus() {
    document.querySelectorAll(".gtx-dash-menu,.gtx-wallet-menu").forEach(x=>x.hidden=true);
  }

  function setupAssetMenu() {
    const list=$("gtxAssetList");
    document.querySelectorAll("[data-asset-category]").forEach(btn=>btn.onclick=()=>{
      const cat=btn.dataset.assetCategory, rows=assets[cat]||[];
      list.innerHTML=rows.map(x=>'<button type="button" data-pair="'+x[0]+'"><strong>'+x[0]+'</strong><span>'+x[1]+'</span></button>').join("");
      list.querySelectorAll("[data-pair]").forEach(b=>b.onclick=()=>{
        state.symbol=b.dataset.pair;
        $("gtxSelectedAsset").textContent=nameOf(state.symbol);
        $("gtxAssetMenu").hidden=true;
        draw();
      });
    });
    document.querySelector("[data-asset-category='Crypto']")?.click();
  }

  function setup() {
    if (!$("gtxDashboardCanvas") || $("page-dashboard").dataset.gtxBuilt) return;
    $("page-dashboard").dataset.gtxBuilt="1";

    $("gtxWalletButton").onclick=e=>{e.stopPropagation(); $("gtxWalletMenu").hidden=!$("gtxWalletMenu").hidden;};
    $("gtxDepositButton").onclick=()=>{ $("gtxWalletMenu").hidden=true; $("gtxWalletModal").hidden=false; $("gtxDepositPanel").hidden=false; $("gtxWithdrawPanel").hidden=true; $("gtxWalletModalTitle").textContent="Deposit"; };
    $("gtxWithdrawButton").onclick=()=>{ $("gtxWalletMenu").hidden=true; $("gtxWalletModal").hidden=false; $("gtxDepositPanel").hidden=true; $("gtxWithdrawPanel").hidden=false; $("gtxWalletModalTitle").textContent="Withdrawal"; };
    $("gtxWalletClose").onclick=()=>{$("gtxWalletModal").hidden=true;};
    $("gtxAssetButton").onclick=e=>{e.stopPropagation();$("gtxAssetMenu").hidden=!$("gtxAssetMenu").hidden;};
    $("gtxTimeframeButton").onclick=e=>{e.stopPropagation();$("gtxTimeframeMenu").hidden=!$("gtxTimeframeMenu").hidden;};
    document.querySelectorAll("[data-timeframe]").forEach(b=>b.onclick=()=>{state.timeframe=b.dataset.timeframe;$("gtxTimeframeButton").textContent=b.textContent+" ▾";$("gtxDurationDisplay").textContent=b.textContent;$("gtxTimeframeMenu").hidden=true;});
    $("gtxQuickDepositSubmit").onclick=async()=>{const amount=$("gtxQuickDepositAmount").value;if($("depositAmount"))$("depositAmount").value=amount;if(typeof window.requestDeposit==="function")await window.requestDeposit();};
    $("gtxQuickWithdrawSubmit").onclick=async()=>{const amount=$("gtxQuickWithdrawAmount").value, wallet=$("gtxQuickWithdrawWallet").value;if($("withdrawalAmount"))$("withdrawalAmount").value=amount;if($("withdrawalWalletAddress"))$("withdrawalWalletAddress").value=wallet;if(typeof window.requestWithdrawal==="function")await window.requestWithdrawal();};
    setupAssetMenu(); draw(); addEventListener("resize",draw);
    document.addEventListener("click",e=>{if(!e.target.closest(".gtx-dash-head,.gtx-dash-profile"))closeMenus();});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true}); else setup();
})();