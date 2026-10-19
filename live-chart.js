/* GoTradeX LIVE Chart Layer — TradingView Lightweight Charts experiment.
 * Uses the existing verified GoTradeX feed registry; no synthetic/demo candles.
 * The chart timeframe is independent from the trade-expiration timeframe.
 */
(function(){
  "use strict";
  if(window.GoTradeXLiveChart) return;

  const LWC_URLS=["https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js","https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js"];
  const CFG={
    intervals:{
      "5 Seconds":5,"10 Seconds":10,"15 Seconds":15,"30 Seconds":30,"1 Minute":60,
      "3 Minutes":180,"5 Minutes":300,"15 Minutes":900,"30 Minutes":1800,
      "1 Hour":3600,"4 Hours":14400,"1 Day":86400
    }
  };

  const CHART_KEY="gotradex_chart_timeframe";
  const TYPE_KEY="gotradex_chart_type";

  let state={
    tf:"5 Minutes",sec:300,candles:[],price:null,prev:null,ws:null,
    provider:"",symbol:"",assetLabel:"EUR/USD",mode:"LIVE",type:"forex",
    connected:false,tradeStart:null,tradeEnd:null,lastAssetKey:"",connectionId:0,
    chart:null,candleSeries:null,lineSeries:null,areaSeries:null,
    ma50:null,ma100:null,ma200:null,currentPriceLine:null,
    chartType:"candle",historyLoaded:false,initialRangeSet:false,resizeObserver:null,
    booted:false,markersInstalled:false,dateTimeTimer:null
  };

  function timezoneOffsetMinutes(){
    try{
      const raw=localStorage.getItem("gtx_timezone_offset");
      const m=/^([+-])(\d{2}):(\d{2})$/.exec(raw||"");
      if(m)return (m[1]==="-"?-1:1)*(Number(m[2])*60+Number(m[3]));
    }catch(_){}
    return -new Date().getTimezoneOffset();
  }
  function formatChartTime(time,tickMarkType){
    let date;
    if(typeof time==="number")date=new Date((time+timezoneOffsetMinutes()*60)*1000);
    else if(time&&typeof time==="object"&&Number.isFinite(time.year)&&Number.isFinite(time.month)&&Number.isFinite(time.day))date=new Date(Date.UTC(time.year,time.month-1,time.day));
    else return "";
    const C=window.LightweightCharts||{};
    const type=C.TickMarkType||{};
    const pad=n=>String(n).padStart(2,"0");
    if(tickMarkType===type.Year)return String(date.getUTCFullYear());
    if(tickMarkType===type.Month)return new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",month:"short"}).format(date);
    if(tickMarkType===type.DayOfMonth)return pad(date.getUTCDate())+" "+new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",month:"short"}).format(date);
    return pad(date.getUTCHours())+":"+pad(date.getUTCMinutes());
  }
  function feed(){return window.GoTradeXMarketFeeds}
  function selection(){
    const f=feed();
    return f ? f.resolve() : {available:false,reason:"Market feed registry is not loaded."};
  }

  function injectStyle(){
    if(document.getElementById("gtx-lwc-style"))return;
    const s=document.createElement("style");
    s.id="gtx-lwc-style";
    s.textContent=
      "#gtxLiveChart{position:relative;width:100%;height:clamp(330px,52vh,560px);min-height:300px;background:#07111d;border:0;border-radius:0;overflow:hidden;box-sizing:border-box;touch-action:none;user-select:none}"+
      "#gtxLWC{position:absolute;inset:0;width:100%;height:100%}"+
      ".gtxLWCHead{position:absolute;z-index:10;top:7px;left:8px;right:8px;display:flex;align-items:center;gap:6px;pointer-events:none}"+
      ".gtxLWCHead>*{pointer-events:auto}"+
      ".gtxLWCStatus{box-sizing:border-box;display:inline-flex;align-items:center;height:auto;font:800 7px/1 system-ui;color:#35e889;background:transparent;border:0!important;outline:0!important;box-shadow:none!important;border-radius:0;padding:0;margin:0;white-space:nowrap;text-transform:uppercase}"+
      ".gtxLWCControl{margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;min-width:0}"+
      ".gtxLWCDateTime{display:flex!important;flex:0 0 auto;flex-direction:column!important;align-items:flex-start!important;justify-content:flex-start!important;gap:5px!important;color:#f1f7ff!important;font:700 11px/1.25 system-ui!important;white-space:nowrap!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;outline:0!important;box-shadow:none!important;border-radius:0;pointer-events:none;position:relative;z-index:12}.gtxLWCDateClock{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:4px!important;color:#f1f7ff!important;font:700 11px/1.25 system-ui!important;letter-spacing:.01em!important;white-space:nowrap!important;background:transparent!important;border:0!important;outline:0!important;box-shadow:none!important;padding:0!important;margin:0!important;min-height:26px;visibility:visible!important;opacity:1!important}"+
      ".gtxLWCMarketRow{display:flex;align-items:center;gap:13px;min-height:18px;white-space:nowrap}.gtxLWCMarketLabel{display:block!important;order:0!important;position:static!important;box-sizing:border-box!important;font:800 11px/1.2 system-ui!important;color:#35e889!important;letter-spacing:.02em!important;text-transform:none!important;white-space:nowrap!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;border-radius:0!important;outline:0!important;box-shadow:none!important}"+".gtxLWCDateTime{border:0!important;outline:0!important;box-shadow:none!important;background:transparent!important}"+".gtxLWCDateTime #gtxLWCDate{order:1!important;display:block!important;color:#f1f7ff!important;font-size:11px!important;line-height:1.25!important}.gtxLWCDateTime #gtxLWCClock{display:block!important;color:#f1f7ff!important;font-size:11px!important;line-height:1.25!important}"+".gtxLWCDateTime #gtxLWCClock{order:2!important}"+
      ".gtxLWCMarketRow{gap:5px!important}"+
      ".gtxLWCMarketLabel{font-size:9px!important;margin:0!important;color:#35e889!important}"+
      ".gtxLWCDateTime{flex-direction:column!important;align-items:flex-start!important;gap:3px!important}"+
      ".gtxLWCChartTFPicker{position:relative;display:inline-flex;align-items:center;pointer-events:auto;z-index:50}"+
      ".gtxLWCChartTFTrigger{appearance:none!important;border:0!important;outline:0!important;box-shadow:none!important;border-radius:0!important;background:transparent!important;color:#facc15!important;padding:0!important;margin:0 0 0 12px!important;font:900 12px/1.2 system-ui!important;letter-spacing:.04em;min-width:0!important;min-height:0!important;height:auto!important;cursor:pointer!important;white-space:nowrap!important}"+
      ".gtxLWCChartTFMenu{position:absolute;left:0;top:calc(100% + 7px);min-width:118px;max-height:55vh;overflow:auto;display:grid;gap:0;padding:4px;background:#0b2036;border:1px solid #31506d;border-radius:6px;box-shadow:0 8px 24px #0009;z-index:99999}"+
      ".gtxLWCChartTFMenu[hidden]{display:none}"+
      ".gtxLWCChartTFOption{appearance:none;display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px dotted #29435f;border-radius:0;padding:7px 9px;color:#dcecff;font:700 10px/1.2 system-ui;cursor:pointer}"+
      ".gtxLWCChartTFOption.active{color:#facc15;border-bottom-color:#facc15;background:transparent}"+
      ".gtxLWCTypePicker{position:relative}.gtxLWCTypePickerNearMenu{display:inline-flex!important;align-items:center;flex:0 0 auto;margin:0 0 0 5px!important;position:relative;z-index:2147483000!important}.pairbarLeft #gtxLWCTypePicker .gtxLWCTypeButton{display:inline-flex!important;min-height:30px!important;padding:2px 3px!important;margin:0!important;border:0!important;border-radius:0!important;outline:0!important;box-shadow:none!important;background:transparent!important;color:#e5edf7!important;font-size:11px!important;font-weight:800!important;white-space:nowrap!important}.pairbarLeft #gtxLWCTypeMenu{position:absolute!important;left:0!important;right:auto!important;top:calc(100% + 5px)!important;z-index:2147483647!important;min-width:142px!important;max-height:55vh!important;overflow:auto!important;display:grid;gap:2px!important;padding:8px 6px!important;margin:0!important;background:rgba(7,17,29,.98)!important;border:0!important;border-radius:8px!important;outline:0!important;box-shadow:0 12px 28px rgba(0,0,0,.42)!important;opacity:0;transform:translateY(-7px) scale(.97);transform-origin:top left;transition:opacity .16s ease,transform .16s ease;pointer-events:none}.pairbarLeft #gtxLWCTypePicker.is-open #gtxLWCTypeMenu{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}.pairbarLeft #gtxLWCTypeMenu[hidden]{display:none!important}.pairbarLeft #gtxLWCTypeMenu .gtxLWCTypeOption{min-height:32px!important;padding:7px 8px!important;border:0!important;border-radius:5px!important;outline:0!important;box-shadow:none!important;background:transparent!important;color:#e5edf7!important;text-align:left!important;font-size:11px!important;cursor:pointer!important}.pairbarLeft #gtxLWCTypeMenu .gtxLWCTypeOption.active{background:rgba(56,189,248,.13)!important;color:#7dd3fc!important}"+
      ".gtxLWCTypeButton{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:auto;border:0!important;outline:0!important;box-shadow:none!important;background:transparent!important;color:#e5edf7;padding:2px 0;font:800 11px/1.2 system-ui;white-space:nowrap;cursor:pointer}"+
      ".gtxLWCTypeMenu{position:absolute;right:0;top:calc(100% + 7px);min-width:112px;padding:5px 0;background:rgba(7,17,29,.97);border:0!important;border-radius:0;box-shadow:none!important;z-index:9999;display:grid;gap:9px;visibility:visible;opacity:1}"+
      ".gtxLWCTypeMenu[hidden]{display:none}"+
      ".gtxLWCTypeOption{box-sizing:border-box;display:block;width:100%;min-height:24px;border:0!important;outline:0!important;box-shadow:none!important;border-radius:0;text-align:left;padding:2px 4px;background:transparent!important;color:#dcecff;font:700 11px/1.2 system-ui;white-space:nowrap;visibility:visible;opacity:1;cursor:pointer}"+
      ".gtxLWCTypeOption.active{background:transparent!important;border:0!important;color:#38bdf8;font-weight:900}"+
      ".gtxLWCSelect{box-sizing:border-box;height:26px;border:1px solid var(--gtx-accent-border,#31597f);background:#102945;color:var(--gtx-accent-light,#fff);border-radius:5px;padding:5px 7px;font:800 9px/1 system-ui}"+
      ".gtxLWCNotice{position:absolute;z-index:8;left:12px;right:70px;top:50px;display:grid;place-items:center;text-align:center;color:#7695b2;font:800 11px/1.4 system-ui;pointer-events:none}"+
      ".gtxLWCNotice[hidden]{display:none}"+
      "#gtxLWCExpiryLayer{display:block!important;position:absolute!important;inset:0!important;z-index:2147483000!important;overflow:hidden!important;pointer-events:none!important;visibility:visible!important;opacity:1!important}"+
      ".gtxTradeEntryLine{position:absolute;height:2px;min-width:1px;transform:translateY(-50%);opacity:.96}"+
      ".gtxTradeEntryLine.buy{background:#22c58b;box-shadow:0 0 5px rgba(34,197,139,.28)}"+
      ".gtxTradeEntryLine.sell{background:#f16b70;box-shadow:0 0 5px rgba(241,107,112,.28)}"+
      ".gtxTradeTag{position:absolute;transform:translateY(-50%);padding:4px 6px;border-radius:5px;color:#fff;font:800 9px/1.25 system-ui;white-space:nowrap;box-shadow:0 2px 7px rgba(0,0,0,.25)}"+
      ".gtxTradeTag.buy{background:#087d5b;border:1px solid #22c58b}"+
      ".gtxTradeTag.sell{background:#b72d43;border:1px solid #f16b70}"+
      ".gtxTradeTag .gtxTradeCountdown{display:block;text-align:right;font-size:10px;font-variant-numeric:tabular-nums}"+
      ".gtxTradeAB{display:inline-block;margin-right:3px;padding:1px 3px;border-radius:3px;background:#f7c948;color:#15202b;font-size:8px;animation:none!important;transform:none!important;opacity:1!important}"+
      ".gtxLWCWatermark{position:absolute;z-index:2;right:70px;bottom:34px;color:#42627e;font:900 10px system-ui;letter-spacing:.08em;pointer-events:none}"+
      "@media(max-width:600px){#gtxLiveChart{height:clamp(300px,50vh,440px);min-height:300px}.gtxLWCHead{left:5px;right:5px;gap:4px}.gtxLWCStatus,.gtxLWCTypeButton{height:23px;font-size:8px;padding:4px 5px}.gtxLWCChartTFTrigger{font-size:8px!important}.gtxLWCDateTime{font-size:7px}.gtxLWCControl{gap:3px;max-width:78%;}.gtxLWCTypeMenu{right:0;min-width:124px}.gtxLWCWatermark{display:none}}";
    s.textContent +=
      "#gtxLiveChart{outline:none!important}"+
      "#gtxLiveChart{border:0!important;border-radius:0!important;box-shadow:none!important}"+
      "#gtxLWC canvas{border:0!important;outline:0!important;box-shadow:none!important}"+
      "#gtxLiveChart,#gtxLWC,#gtxLWC canvas{border:0!important;border-radius:0!important;outline:0!important;box-shadow:none!important}"+
      "#gtxLWCStatus{position:absolute!important;right:8px!important;bottom:8px!important;top:auto!important;left:auto!important;z-index:20!important;display:block!important;height:auto!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;outline:0!important;box-shadow:none!important;border-radius:0!important;font:800 9px/1.2 system-ui!important;white-space:nowrap!important;text-transform:none!important;pointer-events:none!important}"+
      "#gtxLiveChart .gtxLWCHead{border:0!important;outline:0!important;box-shadow:none!important}"+
      ".gtxLWCStatus{position:absolute!important;right:8px!important;bottom:8px!important;z-index:20!important;display:block!important;height:auto!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;outline:0!important;box-shadow:none!important;border-radius:0!important;font:800 9px/1.2 system-ui!important;white-space:nowrap!important;text-transform:none!important;pointer-events:none!important}"+
      ".gtxLWCTypePicker{position:relative;z-index:35;margin-top:1px}"+
      ".gtxLWCTypeButton{font-size:11px!important;color:#f1f5f9!important}"+
      ".gtxLWCTypeMenu{background:transparent!important;border:0!important;box-shadow:none!important;gap:10px!important;padding:6px 0!important;min-width:104px!important}"+
      ".gtxLWCTypeOption{background:transparent!important;border:0!important;box-shadow:none!important;padding:2px 0!important;font-size:11px!important;color:#e5edf7!important}"+
      ".gtxLWCTypeOption.active{color:#38bdf8!important;font-weight:900!important}"+
      ".gtxLWCChartTFTrigger{font-size:12px!important;margin-left:14px!important;color:#facc15!important}"+
      ".gtxLWCDateClock,#gtxLWCDate,#gtxLWCClock{color:#fff!important;font-size:11px!important}"+
      "@media(max-width:600px){.gtxLWCStatus{font-size:9px!important;right:8px!important;bottom:8px!important}.gtxLWCChartTFTrigger{font-size:12px!important;margin-left:12px!important}.gtxLWCTypeButton,.gtxLWCTypeOption{font-size:10px!important}.gtxLWCControl{max-width:none!important}}"+
      ".gtxLWCMarketLabel{font-size:12px!important;line-height:1.2!important}"+
      ".gtxLWCDateClock,#gtxLWCDate,#gtxLWCClock{font-size:8px!important;line-height:1.15!important}"+
      ".gtxLWCDateClock{gap:2px!important;min-height:0!important}"+
      "html body #gtxChart,html body #gtxLiveChart,html body #gtxLWC,html body #gtxLWC canvas,html body #gtxLWCExpiryLayer,html body #gtxChart *,html body #gtxLiveChart *,html body #gtxLWC *{border-radius:0!important}"+
      "html body #gtxChart,html body #gtxLiveChart,html body #gtxLWC,html body #gtxLWC canvas,html body #gtxLWCExpiryLayer{border:0!important;border-width:0!important;border-radius:0!important;outline:0!important;box-shadow:none!important}"+
      "html body #gtxLWCStatus,html body .gtxLWCStatus{font-size:12px!important;line-height:1.2!important;font-weight:800!important;right:8px!important;bottom:8px!important;top:auto!important;left:auto!important;border:0!important;border-radius:0!important;outline:0!important;box-shadow:none!important;background:transparent!important;padding:0!important;margin:0!important;white-space:nowrap!important}"+
      "@media(max-width:600px){html body #gtxLWCStatus,html body .gtxLWCStatus{font-size:12px!important;line-height:1.2!important;right:8px!important;bottom:8px!important}}";
    document.head.appendChild(s);
  }

  // Keep Trade Expiration in the trading controls; the chart header's candle timeframe is separate.
  function ensureExpiryControlPlacement(){ return true; }
  function mount(){
    if(document.getElementById("gtxLiveChart")){ensureExpiryControlPlacement();return true;}
    const chartHost=document.getElementById("gtxChart");
    const pair=document.querySelector(".pairbar"),bottom=document.querySelector(".bottom");
    if(!chartHost||!pair||!bottom||!bottom.parentNode)return false;
    injectStyle();
    const box=document.createElement("section");
    box.id="gtxLiveChart";
    box.setAttribute("aria-label","GoTradeX verified live candlestick chart");
    box.innerHTML=
      '<div id="gtxLWC"></div>'+
      '<div class="gtxLWCHead">'+
        '<div class="gtxLWCDateTime" aria-label="Selected market"><div class="gtxLWCMarketRow"><span class="gtxLWCMarketLabel" id="gtxLWCMarketLabel">LIVE EUR/USD</span><div class="gtxLWCChartTFPicker" id="gtxLWCChartTFPicker"><button class="gtxLWCChartTFTrigger" id="gtxLWCChartTFTrigger" type="button" aria-label="Chart candle timeframe" aria-haspopup="true" aria-expanded="false">5M ⌄</button><div class="gtxLWCChartTFMenu" id="gtxLWCChartTFMenu" role="menu" aria-label="Chart candle timeframe" hidden></div></div></div><div class="gtxLWCDateClock"><span id="gtxLWCDate"></span><span id="gtxLWCClock"></span></div></div>'+
        '<div class="gtxLWCControl">'+
          '<div class="gtxLWCTypePicker" id="gtxLWCTypePicker"><button class="gtxLWCTypeButton" id="gtxLWCTypeButton" type="button" aria-haspopup="true" aria-expanded="false">Candlestick ⌄</button><div class="gtxLWCTypeMenu" id="gtxLWCTypeMenu" role="menu" aria-label="Chart style" hidden><button class="gtxLWCTypeOption" type="button" data-chart-type="candle" role="menuitem">Candlestick</button><button class="gtxLWCTypeOption" type="button" data-chart-type="heikin" role="menuitem">Heikin Ashi</button><button class="gtxLWCTypeOption" type="button" data-chart-type="line" role="menuitem">Line</button><button class="gtxLWCTypeOption" type="button" data-chart-type="mountain" role="menuitem">Mountain</button></div></div>'+
        '</div></div>'+ '<span class="gtxLWCStatus" id="gtxLWCStatus">Feed connecting</span>'+
      '<div id="gtxLWCExpiryLayer" aria-hidden="true"></div>'+
      '<div class="gtxLWCWatermark">VERIFIED MARKET DATA</div>'+
      '<div class="gtxLWCNotice" id="gtxLWCNotice">Connecting to a verified market-data feed…</div>';
    chartHost.replaceChildren(box);
    ensureExpiryControlPlacement();
    [0,150,500,1200,2500].forEach(delay=>setTimeout(ensureExpiryControlPlacement,delay));
    const expiryPlacementObserver=new MutationObserver(()=>ensureExpiryControlPlacement());
    expiryPlacementObserver.observe(document.body,{childList:true,subtree:true});
    setTimeout(()=>expiryPlacementObserver.disconnect(),15000);
    const typePicker=document.getElementById("gtxLWCTypePicker");
     const moreButton=document.getElementById("marketMoreBtn");
     if(typePicker){typePicker.classList.add("gtxLWCTypePickerNearMenu");const moreGroup=moreButton&&moreButton.parentElement;if(moreGroup&&typePicker.parentElement!==moreGroup)moreButton.insertAdjacentElement("afterend",typePicker);}
    try{const savedWallpaper=localStorage.getItem("gtx_custom_bg_image");if(savedWallpaper)box.style.setProperty("--gtx-chart-wallpaper",'url("'+savedWallpaper+'")');}catch(_){}

    const tfTrigger=document.getElementById("gtxLWCChartTFTrigger");
    const tfMenu=document.getElementById("gtxLWCChartTFMenu");
    function shortChartTf(tf){
      const short={"5 Seconds":"5S","10 Seconds":"10S","15 Seconds":"15S","30 Seconds":"30S","1 Minute":"1M","3 Minutes":"3M","5 Minutes":"5M","15 Minutes":"15M","30 Minutes":"30M","1 Hour":"1H","4 Hours":"4H","1 Day":"1D"};
      return short[tf]||tf;
    }
    function syncChartTfTrigger(){
      if(tfTrigger)tfTrigger.textContent=shortChartTf(state.tf)+" ⌄";
      if(tfMenu)tfMenu.querySelectorAll("[data-chart-timeframe]").forEach(option=>{
        const active=option.dataset.chartTimeframe===state.tf;
        option.classList.toggle("active",active);option.setAttribute("aria-checked",String(active));
      });
    }
    if(tfTrigger&&tfMenu){
      tfMenu.replaceChildren();
      Object.keys(CFG.intervals).forEach(tf=>{
        const option=document.createElement("button");option.type="button";
        option.className="gtxLWCChartTFOption";option.dataset.chartTimeframe=tf;
        option.setAttribute("role","menuitemradio");option.textContent=tf;
        option.addEventListener("click",()=>{
          setTimeframe(tf);tfMenu.hidden=true;tfTrigger.setAttribute("aria-expanded","false");syncChartTfTrigger();
        });
        tfMenu.appendChild(option);
      });
      tfTrigger.addEventListener("click",e=>{
        e.preventDefault();e.stopPropagation();const open=tfMenu.hidden;tfMenu.hidden=!open;tfTrigger.setAttribute("aria-expanded",String(open));
      });
      document.addEventListener("click",e=>{
        if(!e.target.closest("#gtxLWCChartTFPicker")){tfMenu.hidden=true;tfTrigger.setAttribute("aria-expanded","false");}
      });
    }
    syncChartTfTrigger();
    const typeButton=document.getElementById("gtxLWCTypeButton");
    const typeMenu=document.getElementById("gtxLWCTypeMenu");
    if(typeButton&&typeMenu){
      const closeTypeMenu=()=>{
        typeMenu.hidden=true;
        typePicker&&typePicker.classList.remove("is-open");
        typeButton.setAttribute("aria-expanded","false");
      };
      const openTypeMenu=()=>{
        typeMenu.hidden=false;
        typePicker&&typePicker.classList.add("is-open");
        typeButton.setAttribute("aria-expanded","true");
      };
      typeButton.setAttribute("aria-label","Open chart style menu");
      typeButton.textContent="Chart Style ⌄";
      typeButton.addEventListener("click",e=>{
        e.preventDefault();e.stopPropagation();
        if(typeMenu.hidden)openTypeMenu();else closeTypeMenu();
      });
      typeMenu.querySelectorAll("[data-chart-type]").forEach(option=>option.addEventListener("click",e=>{
        e.preventDefault();e.stopPropagation();
        setChartType(option.dataset.chartType);
        closeTypeMenu();
      }));
      document.addEventListener("click",e=>{
        if(!e.target.closest("#gtxLWCTypePicker"))closeTypeMenu();
      });
      document.addEventListener("keydown",e=>{
        if(e.key==="Escape")closeTypeMenu();
      });
    }

    try{
      const saved=localStorage.getItem(CHART_KEY);
      if(CFG.intervals[saved]){state.tf=saved;state.sec=CFG.intervals[saved]}
      const savedType=localStorage.getItem(TYPE_KEY);
      if(["candle","heikin","line","mountain"].includes(savedType))state.chartType=savedType;
    }catch(_){}
    syncChartTfTrigger();
    updateTypeButtons();
    updateDateTime();
    if(!state.dateTimeTimer)state.dateTimeTimer=setInterval(updateDateTime,1000);
    return true;
  }

  function updateDateTime(){
    const now=new Date();
    const dateEl=document.getElementById("gtxLWCDate");
    const clockEl=document.getElementById("gtxLWCClock");
    if(!dateEl||!clockEl)return;
    dateEl.textContent=new Intl.DateTimeFormat("en-ZA",{weekday:"short",day:"2-digit",month:"short",year:"numeric",timeZone:"Africa/Johannesburg"}).format(now);
    clockEl.textContent=new Intl.DateTimeFormat("en-ZA",{hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",timeZone:"Africa/Johannesburg"}).format(now)+" SAST";
  }

  function status(t,ok){
    const e=document.getElementById("gtxLWCStatus");if(!e)return;
    const msg=String(t||"");
    if(ok&&/BYBIT/i.test(msg))e.textContent="Live Bybit";
    else if(ok&&/DERIV/i.test(msg))e.textContent="Live Deriv";
    else if(ok&&/DERIV/i.test(msg))e.textContent="Live Deriv";
    else e.textContent="Feed connecting";
    e.style.color=ok&&(/BYBIT|DERIV/i.test(msg))?"#22c55e":"#94a3b8";
    e.style.border="0";e.style.background="transparent";e.style.outline="0";e.style.boxShadow="none";
  }
  function notice(t,show=true){
    const e=document.getElementById("gtxLWCNotice");if(e){e.textContent=t;e.hidden=!show}
  }
  function assetText(){
    const mode=String(state.mode||"LIVE").toUpperCase()==="OTC"?"OTC":"LIVE";
    const pair=String(state.assetLabel||"EUR/USD").trim().toUpperCase();
    const displayPair=pair;
    const market=document.getElementById("gtxLWCMarketLabel");
    if(market){market.textContent=mode+" "+displayPair;market.style.color="#22c55e";market.style.fontWeight="800";}
  }
  function updateTypeButtons(){
    const button=document.getElementById("gtxLWCTypeButton");
    if(button)button.textContent="Chart Style ⌄";
    document.querySelectorAll("#gtxLiveChart [data-chart-type]").forEach(b=>{
      b.classList.toggle("active",b.dataset.chartType===state.chartType);
    });
    applyChartTypeVisibility();
  }

  function setChartType(type){
    if(!["candle","heikin","line","mountain"].includes(type))return;
    state.chartType=type;
    try{localStorage.setItem(TYPE_KEY,type)}catch(_){}
    if(state.chart){
      state.candleSeries.setData(seriesCandleData());
      const data=seriesLineData();
      if(type==="line"||type==="mountain"){
        if(!state.lineSeries){state.lineSeries=state.chart.addLineSeries({color:"#4da3ff",lineWidth:2,priceLineVisible:false,lastValueVisible:false});}
        if(!state.areaSeries){state.areaSeries=state.chart.addAreaSeries({lineColor:"#38bdf8",topColor:"rgba(56,189,248,.34)",bottomColor:"rgba(56,189,248,.02)",lineWidth:2,priceLineVisible:false,lastValueVisible:false});}
        state.lineSeries.setData(data);state.areaSeries.setData(data);
      }
      applyChartTypeVisibility();
      try{state.chart.timeScale().fitContent()}catch(_){}
    }
    updateTypeButtons();
  }

  function applyChartTypeVisibility(){
    if(state.candleSeries)state.candleSeries.applyOptions({visible:state.chartType==="candle"||state.chartType==="heikin"});
    if(state.lineSeries)state.lineSeries.applyOptions({visible:state.chartType==="line"});
    if(state.areaSeries)state.areaSeries.applyOptions({visible:state.chartType==="mountain"});
  }
  function bucket(ms,sec){return Math.floor(ms/1000/sec)*sec*1000}

  function addTick(ts,price,volume){
    if(!Number.isFinite(price)||!Number.isFinite(ts))return;
    const b=bucket(ts,state.sec);
    let c=state.candles[state.candles.length-1];
    if(!c||c.t!==b){
      c={t:b,o:price,h:price,l:price,c:price,v:Number(volume||0)};
      state.candles.push(c);
      if(state.candles.length>500)state.candles.shift();
    }else{
      c.h=Math.max(c.h,price);
      c.l=Math.min(c.l,price);
      c.c=price;
      c.v+=Number(volume||0);
    }
    state.prev=state.price;
    state.price=price;
    updateLiveSeries(c);
  }

  function closeSocket(){
    if(state.ws){try{state.ws.close()}catch(_){}state.ws=null}
  }

  async function loadBybitHistory(){
    // Keep the 604 "100% perfect" chart UI/behavior, but route history through
    // GoTradeX's verified server adapter instead of exposing exchange calls in the browser.
    if(!feed()||typeof feed().bybitHistory!=="function"){
      throw new Error("Verified crypto market-data adapter is not loaded.");
    }
    state.candles=await feed().bybitHistory(state.symbol,state.sec);
    state.candles=(Array.isArray(state.candles)?state.candles:[])
      .map(x=>({t:Number(x.t),o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v||0)}))
      .filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite))
      .sort((a,b)=>a.t-b.t);
    if(state.candles.length)state.price=state.candles[state.candles.length-1].c;
  }

  function historyReady(){
    // A failed history request must not leave the chart blank while waiting for
    // twelve completed timeframe buckets (which could take an hour for 5M).
    // The first real provider tick creates one genuine, updating candle; never
    // synthesize prices or require a full historical window before rendering.
    return state.candles.length >= 1;
  }

  function connectBybit(){
    const id=++state.connectionId;
    closeSocket();
    const f=selection();
    if(!f.available||f.provider!=="BYBIT"){
      state.connected=false;status("NO VERIFIED LIVE FEED",false);
      notice(f.reason||"Selected asset is not available on the verified Bybit Spot feed.",true);
      return;
    }
    state.provider=f.provider;state.symbol=f.symbol;state.assetLabel=f.label;assetText();
    state.connected=false;status("LOADING • BYBIT",false);
    notice("Loading verified historical candles…",true);

    loadBybitHistory().catch(e=>{
      // Short intervals can still form valid candles from the real-time stream
      // even when the provider's recent-trade history is temporarily unavailable.
      if(state.sec>=60)throw e;
      state.candles=[];state.price=null;state.historyLoaded=false;
      status("COLLECTING VERIFIED TICKS",false);
      notice("Short-interval history is unavailable; checking the verified live trade stream…",true);
      return [];
    }).then(()=>{
      if(id!==state.connectionId)return;
      if(!historyReady() && state.sec>=60){
        state.connected=false;
        status("WAITING FOR HISTORY",false);
        notice("Waiting for enough verified historical candles before displaying the chart…",true);
        setTimeout(()=>{if(id===state.connectionId)connect()},2500);
        return;
      }
      if(state.candles.length)renderHistory();
      else{
        state.historyLoaded=false;
        status("COLLECTING VERIFIED TICKS",false);
        notice("Waiting for verified live trades to build the first candle…",true);
      }
      const ws=new WebSocket("wss://stream.bybit.com/v5/public/spot");
      state.ws=ws;
      ws.onopen=()=>{
        if(id!==state.connectionId){try{ws.close()}catch(_){}return}
        state.connected=true;
        status("LIVE • BYBIT WEBSOCKET",true);
        notice("",false);
        ws.send(JSON.stringify({op:"subscribe",args:["publicTrade."+state.symbol]}));
      };
      ws.onmessage=e=>{
        if(id!==state.connectionId)return;
        try{
          const j=JSON.parse(e.data);
          if(Array.isArray(j.data))j.data.forEach(t=>addTick(Number(t.T||Date.now()),Number(t.p),Number(t.v)));
        }catch(_){}
      };
      ws.onerror=()=>{
        if(id!==state.connectionId)return;
        state.connected=false;status("FEED ERROR",false);notice("Bybit live stream error. Retrying…",true);
      };
      ws.onclose=()=>{
        if(id!==state.connectionId)return;
        state.connected=false;status("RECONNECTING • BYBIT",false);
        setTimeout(()=>{if(id===state.connectionId)connect()},2500);
      };
    }).catch(e=>{
      if(id!==state.connectionId)return;
      state.connected=false;status("FEED ERROR",false);
      notice(e.message||"Verified Bybit historical data unavailable.",true);
    });
  }


  function connectDeriv(){
    const id=++state.connectionId;
    closeSocket();
    const f=selection();
    if(!f.available||f.provider!=="DERIV"){
      state.connected=false;status("NO VERIFIED DERIV FEED",false);
      notice(f.reason||"Selected FX pair is not available through the verified Deriv feed.",true);
      return;
    }
    state.provider=f.provider;state.symbol=f.symbol;state.assetLabel=f.label;assetText();
    state.connected=false;status(state.mode==="OTC"?"OTC • LOADING • DERIV":"LOADING • DERIV",false);
    notice(state.mode==="OTC"?"Loading verified Deriv OTC historical candles…":"Loading verified Deriv historical candles…",true);
    feed().derivCandleHistory(f.symbol,state.sec).catch(e=>{
      // Historical data is optional: a history error must not block the live tick stream.
      if(id===state.connectionId){
        state.candles=[];state.price=null;state.historyLoaded=false;
        status(state.mode==="OTC"?"OTC • COLLECTING CANDLES":"COLLECTING VERIFIED TICKS",false);
        notice("Historical data unavailable ("+(e&&e.message?e.message:"provider error")+"). Connecting to verified live ticks; no candles will be fabricated.",true);
      }
      return [];
    }).then(async history=>{
      if(id!==state.connectionId)return;
      state.candles=Array.isArray(history)?history:[];
      if(state.candles.length)state.price=state.candles[state.candles.length-1].c;
      if(state.mode==="OTC"){
        if(historyReady()){
          renderHistory();
        }else{
          state.connected=false;status("OTC • COLLECTING CANDLES",false);
          notice("No usable OTC history returned. Waiting for verified Deriv ticks to build the chart…",true);
        }
      }else{
        if(!historyReady() && state.sec>=60){
          state.connected=false;status("COLLECTING VERIFIED TICKS",false);
          notice("Historical candles are incomplete. Keeping the live subscription active while verified ticks arrive.",true);
        }else if(state.candles.length){
          renderHistory();
        }else{
          state.historyLoaded=false;
          status("COLLECTING VERIFIED TICKS",false);
          notice("Waiting for verified Deriv ticks to build the first candle…",true);
        }
      }
      const socket=feed().derivSocket(f.symbol,
        tick=>{
          if(id!==state.connectionId)return;
          addTick(tick.time,tick.price,0);
        },
        (msg,ok)=>{
          if(id!==state.connectionId)return;
          state.connected=!!ok;
          const displayMsg=state.mode==="OTC"?String(msg).replace(/^LIVE • DERIV$/,"OTC • DERIV").replace(/^CONNECTING • DERIV$/,"CONNECTING • DERIV OTC").replace(/^RECONNECTING • DERIV$/,"RECONNECTING • DERIV OTC"):msg;
          status(displayMsg,!!ok);
          if(ok){
            if(state.historyLoaded)notice("",false);
            else if(state.mode==="OTC")notice("Connected to Deriv; waiting for the first verified tick to build candles…",true);
            else notice("",false);
          }
        }
      );
      if(id!==state.connectionId){try{socket.close()}catch(_){}return}
      state.ws=socket;
    }).catch(e=>{
      if(id!==state.connectionId)return;
      state.connected=false;status("DERIV FEED ERROR",false);
      notice(e.message||"Unable to read verified Deriv market data.",true);
    });
  }

  function connectOTC(){
    const id=++state.connectionId;
    closeSocket();
    const f=selection();
    if(!f.available||f.provider!=="GOTRADEX_OTC"){
      state.connected=false;status("OTC FEED UNAVAILABLE",false);
      notice(f.reason||"The selected OTC asset is not available.",true);
      return;
    }
    state.provider=f.provider;state.symbol=f.symbol;state.assetLabel=f.label;assetText();
    state.connected=false;status("OTC • LOADING",false);notice("Loading isolated OTC candles…",true);
    feed().otcHistory(f.symbol,state.sec).then(async history=>{
      if(id!==state.connectionId)return;
      state.candles=Array.isArray(history)?history:[];
      if(state.candles.length)state.price=state.candles[state.candles.length-1].c;
      if(state.candles.length)renderHistory();
      const socket=await feed().otcSocket(f.symbol,
        tick=>{
          if(id!==state.connectionId)return;
          addTick(tick.time,tick.price,0);
          if(!state.historyLoaded && state.candles.length)try{renderHistory()}catch(_){}
        },
        (msg,ok)=>{
          if(id!==state.connectionId)return;
          state.connected=!!ok;status(msg,!!ok);
          if(ok)notice("",false);
        }
      );
      if(id!==state.connectionId){try{socket.close()}catch(_){}return}
      state.ws=socket;
    }).catch(e=>{
      if(id!==state.connectionId)return;
      state.connected=false;status("OTC FEED ERROR",false);
      notice(e.message||"Unable to read isolated OTC chart data.",true);
    });
  }

  function connect(){
    ++state.connectionId;
    const f=selection();
    let savedMode="LIVE";try{savedMode=String(localStorage.getItem("gotradex_market_mode")||"LIVE").toUpperCase()}catch(_){}
    state.mode=String(f.mode||savedMode).toUpperCase()==="OTC"?"OTC":"LIVE";
    state.type=f.type||"";
    state.assetLabel=f.label||"";
    state.candles=[];state.price=null;state.prev=null;state.tradeStart=null;state.tradeEnd=null;
    state.historyLoaded=false;state.initialRangeSet=false;assetText();
    if(state.mode==="OTC"){
      if(f.provider==="DERIV")connectDeriv();
      else if(f.provider==="GOTRADEX_OTC")connectOTC();
      else{closeSocket();state.connected=false;status("OTC FEED UNAVAILABLE",false);notice(f.reason||"The selected OTC asset is not available.",true)}
      return;
    }
    if(f.provider==="BYBIT")connectBybit();
    else if(f.provider==="DERIV")connectDeriv();
    else{closeSocket();state.connected=false;status("NO VERIFIED LIVE FEED",false);notice(f.reason||"No verified live feed is connected for this asset.",true)}
  }

  function setTimeframe(tf){
    if(!CFG.intervals[tf])return;
    const changed=state.tf!==tf||state.sec!==CFG.intervals[tf];
    state.tf=tf;state.sec=CFG.intervals[tf];
    // Chart timeframe is independent: never overwrite trade expiration.
    try{localStorage.setItem(CHART_KEY,tf)}catch(_){}
    const s=document.getElementById("gtxLWCChartTF");if(s)s.value=tf;
    // Preferences can initialize before the chart is mounted. Boot will use the
    // saved interval; only reconnect an already-running chart when it truly changes.
    if(changed&&state.booted)connect();
  }

  function precisionForPrice(p){
    const n=Math.abs(Number(p)||0);
    if(n>=1000)return 2;
    if(n>=100)return 3;
    if(n>=1)return state.type==="forex"||state.type==="metals"?5:4;
    return 6;
  }

  function sma(period){
    const out=[];
    for(let i=period-1;i<state.candles.length;i++){
      let sum=0;
      for(let j=i-period+1;j<=i;j++)sum+=state.candles[j].c;
      out.push({time:Math.floor(state.candles[i].t/1000),value:sum/period});
    }
    return out;
  }

  function seriesCandleData(){
    if(state.chartType==="heikin"){
      let previousOpen=null,previousClose=null;
      return state.candles.map(c=>{
        const open=Number(c.o),high=Number(c.h),low=Number(c.l),close=Number(c.c);
        const haClose=(open+high+low+close)/4;
        const haOpen=previousOpen===null?(open+close)/2:(previousOpen+previousClose)/2;
        const item={time:Math.floor(c.t/1000),open:haOpen,high:Math.max(high,haOpen,haClose),low:Math.min(low,haOpen,haClose),close:haClose};
        previousOpen=haOpen;previousClose=haClose;
        return item;
      });
    }
    return state.candles.map(c=>({
      time:Math.floor(c.t/1000),
      open:Number(c.o),high:Number(c.h),low:Number(c.l),close:Number(c.c)
    }));
  }

  function seriesLineData(){
    return state.candles.map(c=>({time:Math.floor(c.t/1000),value:Number(c.c)}));
  }

  function removeSeriesSafe(s){
    if(!s||!state.chart)return;
    try{state.chart.removeSeries(s)}catch(_){}
  }

  function buildChart(){
    if(state.chart)return;
    observeTradeMarkers();
    const C=window.LightweightCharts;
    const host=document.getElementById("gtxLWC");
    if(!C||!host)throw new Error("Lightweight Charts library did not load.");
    state.chart=C.createChart(host,{
      autoSize:true,
      layout:{background:{type:C.ColorType.Solid,color:"rgba(0,0,0,0)"},textColor:"#a9bdd0",fontFamily:"Inter,system-ui,sans-serif",fontSize:11},
      grid:{vertLines:{color:"#16283a",style:C.LineStyle.Solid},horzLines:{color:"#16283a",style:C.LineStyle.Solid}},
      rightPriceScale:{visible:true,borderVisible:false,minimumWidth:66,ticksVisible:true,entireTextOnly:false,alignLabels:true,autoScale:true,scaleMargins:{top:.08,bottom:.12}},
      leftPriceScale:{visible:false,borderVisible:false},
      timeScale:{visible:true,borderVisible:false,timeVisible:true,secondsVisible:false,barSpacing:9,minBarSpacing:3,rightOffset:5,fixLeftEdge:false,tickMarkFormatter:formatChartTime},
      localization:{timeFormatter:function(time){return formatChartTime(time,(window.LightweightCharts&&window.LightweightCharts.TickMarkType&&window.LightweightCharts.TickMarkType.Time)||0);}},
      crosshair:{mode:C.CrosshairMode.Normal,vertLine:{color:"#58718a",width:1,style:C.LineStyle.Dashed,labelBackgroundColor:"#263d53"},horzLine:{color:"#58718a",width:1,style:C.LineStyle.Dashed,labelBackgroundColor:"#263d53"}},
      handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
      handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}
    });
    if(window.__gtxChartTheme&&window.GoTradeXLiveChart&&typeof window.GoTradeXLiveChart.applyTheme==="function")window.GoTradeXLiveChart.applyTheme(window.__gtxChartTheme);

    state.candleSeries=state.chart.addCandlestickSeries({
      upColor:"#22c55e",downColor:"#ef4444",
      borderVisible:false,borderUpColor:"#22c55e",borderDownColor:"#ef4444",
      wickUpColor:"#a7f3c2",wickDownColor:"#fca5a5",
      priceLineVisible:false,lastValueVisible:false,
      priceFormat:{type:"price",precision:state.type==="forex"?5:state.type==="metals"?3:4,minMove:state.type==="forex"?0.00001:state.type==="metals"?0.001:0.0001}
    });
    // Alternate chart styles are created only when selected from the single chart-style menu.
    // No automatic green overlay or orange LIVE price-line is created.
    state.lineSeries=null;state.areaSeries=null;
    state.ma50=null;state.ma100=null;state.ma200=null;
    state.currentPriceLine=null;
    applySeriesVisibility();
    state.chart.timeScale().subscribeSizeChange(()=>positionTradeOverlay());
    state.chart.timeScale().subscribeVisibleLogicalRangeChange(()=>positionTradeOverlay());
  }

  function applySeriesVisibility(){
    if(!state.chart)return;
    // Keep the verified candlesticks visible; no automatic line/mountain overlays.
    state.candleSeries?.applyOptions({visible:true});
    const ind=true;
    state.ma50?.applyOptions({visible:ind});
    state.ma100?.applyOptions({visible:ind});
    state.ma200?.applyOptions({visible:ind});
  }

  function renderHistory(){
    if(!state.chart)buildChart();
    const candles=seriesCandleData();
    state.candleSeries.setData(candles);
    if(state.chartType==="line"||state.chartType==="mountain"){
      if(!state.lineSeries)state.lineSeries=state.chart.addLineSeries({color:"#4da3ff",lineWidth:2,priceLineVisible:false,lastValueVisible:false});
      if(!state.areaSeries)state.areaSeries=state.chart.addAreaSeries({lineColor:"#38bdf8",topColor:"rgba(56,189,248,.34)",bottomColor:"rgba(56,189,248,.02)",lineWidth:2,priceLineVisible:false,lastValueVisible:false});
      state.lineSeries.setData(seriesLineData());state.areaSeries.setData(seriesLineData());
    }
    applyChartTypeVisibility();
    refreshChartTools();
    state.historyLoaded=candles.length>0;
    state.initialRangeSet=false;
    applySeriesVisibility();
    updateCurrentPriceLine();
    if(candles.length){
      const from=Math.max(0,candles.length-60);
      state.chart.timeScale().setVisibleLogicalRange({from,to:candles.length+4});
      state.initialRangeSet=true;
    }
    positionTradeOverlay();
    notice("",false);
  }

  function smaValue(period){
    if(state.candles.length<period)return null;
    let sum=0;
    for(let i=state.candles.length-period;i<state.candles.length;i++)sum+=Number(state.candles[i].c);
    return sum/period;
  }

  function updateLiveSeries(c){
    if(!state.chart||!state.historyLoaded){
      if(historyReady()){try{buildChart();renderHistory()}catch(e){notice(e.message||"Chart engine error.",true)}}
      return;
    }
    const item={time:Math.floor(c.t/1000),open:Number(c.o),high:Number(c.h),low:Number(c.l),close:Number(c.c)};
    if(state.chartType==="heikin")state.candleSeries.setData(seriesCandleData());
    else state.candleSeries.update(item);
    if(state.lineSeries)state.lineSeries.update({time:item.time,value:item.close});
    if(state.areaSeries)state.areaSeries.update({time:item.time,value:item.close});
    applyChartTypeVisibility();
    // No automatic SMA overlays: do not add background moving-average lines to the chart.
    refreshChartTools();
    state.price=c.c;
    updateCurrentPriceLine();
    positionTradeOverlay();
  }

  function updateCurrentPriceLine(){
    if(!state.candleSeries)return;
    const raw=Number(state.price ?? state.candles[state.candles.length-1]?.c);
    if(!Number.isFinite(raw)||raw<=0)return;
    // Yellow live-market price line, separate from fixed manual/AutoBot trade-entry lines.
    // Recreate it at the latest verified price so its horizontal level and right-axis label track ticks.
    try{
      if(state.currentPriceLine)state.candleSeries.removePriceLine(state.currentPriceLine);
      state.currentPriceLine=state.candleSeries.createPriceLine({
        price:raw,
        color:"#facc15",
        lineWidth:2,
        lineStyle:0,
        axisLabelVisible:true,
        axisLabelColor:"#facc15",
        axisLabelTextColor:"#111827",
        lineVisible:true,
        title:""
      });
    }catch(_){}
  }

  const expiryTrades=[];
  const pendingTradeIntents=[];
  const resultCards=[];
  let expiryTimer=null;
  let expiryTradeCounter=0;
  let nextTradeSource="MANUAL";

  function selectedExpirySeconds(){
    const values={"5 Seconds":5,"1 Minute":60,"3 Minutes":180,"5 Minutes":300,"15 Minutes":900,"30 Minutes":1800,"1 Hour":3600,"4 Hours":14400,"1 Day":86400};
    // Strip the dropdown chevron before mapping the exact visible selection.
    const visible=String(document.getElementById("timeBtn")?.textContent||"")
      .replace(/[▾▼]/g,"").trim().replace(/\s+/g," ");
    if(values[visible])return values[visible];
    try{
      const saved=String(localStorage.getItem("gotradex_trade_expiration")||"").trim();
      if(values[saved])return values[saved];
    }catch(_){}
    const m=visible.match(/(\d+)\s*(Seconds?|Minutes?|Hours?|Days?)/i);
    if(m){
      const n=Number(m[1]),u=m[2].toLowerCase();
      return n*(u.startsWith("second")?1:u.startsWith("minute")?60:u.startsWith("hour")?3600:86400);
    }
    return 300;
  }
  function selectedAssetFlag(){
    const label=String(state.assetLabel||state.symbol||"BTC/USD").replace(/\s+OTC$/i,"").trim();
    const flags={"EUR/USD":"🇪🇺","GBP/USD":"🇬🇧","USD/JPY":"🇯🇵","AUD/USD":"🇦🇺","USD/CAD":"🇨🇦","USD/CHF":"🇨🇭","NZD/USD":"🇳🇿","BTC/USD":"₿","BTC/USDT":"₿","ETH/USD":"Ξ","ETH/USDT":"Ξ"};
    return {label,flag:flags[label]||"🏳️"};
  }
  function parseTimestamp(value,fallback){
    if(value===undefined||value===null||value==="")return fallback;
    const n=Number(value);
    if(Number.isFinite(n)&&n>0)return n<1e12?n*1000:n;
    const parsed=Date.parse(value);
    return Number.isFinite(parsed)?parsed:fallback;
  }
  function priceForTrade(raw,intent){
    const candidates=[raw.entry_price,raw.entryPrice,raw.open_price,raw.openPrice,raw.price_at_entry,raw.entry_rate,raw.open_rate,raw.price];
    for(const v of candidates){const n=Number(v);if(Number.isFinite(n)&&n>0)return n;}
    if(intent&&Number.isFinite(intent.entryPrice)&&intent.entryPrice>0)return intent.entryPrice;
    const last=state.candles&&state.candles.length?Number(state.candles[state.candles.length-1].c):NaN;
    return Number.isFinite(last)&&last>0?last:null;
  }
  function sourceForTrade(raw,intent){
    const source=String(raw.source||raw.origin||raw.trade_source||raw.source_type||raw.strategy_source||"").toLowerCase();
    if(raw.is_autobot===true||raw.autobot===true||raw.isAutoBot===true||/\b(auto.?bot|autobot|^ab$)\b/i.test(source))return "AB";
    return intent&&intent.source==="AB"?"AB":"MANUAL";
  }
  function directionForTrade(raw){
    return String(raw.direction||raw.side||raw.action||"BUY").toUpperCase().includes("SELL")?"SELL":"BUY";
  }
  function assetForTrade(raw){
    const label=String(raw.asset||raw.symbol||state.assetLabel||state.symbol||"BTC/USD").replace(/\s+(LIVE|OTC)$/i,"").trim();
    const flags={"EUR/USD":"🇪🇺","GBP/USD":"🇬🇧","USD/JPY":"🇯🇵","AUD/USD":"🇦🇺","USD/CAD":"🇨🇦","USD/CHF":"🇨🇭","NZD/USD":"🇳🇿","BTC/USD":"₿","BTC/USDT":"₿","ETH/USD":"Ξ","ETH/USDT":"Ξ"};
    return {label,flag:flags[label]||"🏳️"};
  }
  function rememberIntent(side,source){
    const now=Date.now();
    const expiryAt=now+selectedExpirySeconds()*1000;
    const lastCandle=state.candles&&state.candles.length?state.candles[state.candles.length-1]:null;
    const latest=lastCandle?Number(lastCandle.c):NaN;
    const livePrice=Number(state.price);
    const entryPrice=Number.isFinite(latest)&&latest>0?latest:(Number.isFinite(livePrice)&&livePrice>0?livePrice:null);
    // Anchor to the original candle's body edge, in chart data coordinates:
    // bullish candle = body top (close); bearish candle = body bottom (close).
    // Keep its candle time so zoom/scroll can reposition the same anchor.
    const markerTime=lastCandle&&Number.isFinite(Number(lastCandle.t))?Math.floor(Number(lastCandle.t)/1000):null;
    const markerPrice=entryPrice;
    const intent={at:now,side:String(side||"BUY").toUpperCase(),source:source==="AB"?"AB":"MANUAL",asset:selectedAssetFlag().label,entryPrice,markerTime,markerPrice,amount:null,expiryAt,marker:null};
    try{
      const amountEl=document.getElementById("amountValueText");
      if(amountEl)intent.amount=Number(String(amountEl.textContent).replace(/[^0-9.]/g,""));
    }catch(_){}
    // Show a visible provisional entry line immediately on the button press.
    // The server response will confirm/update it; a rejected order removes it.
    intent.marker={
      id:"pending-trade-"+(++expiryTradeCounter),serverId:null,entryAt:now,expiryAt,
      entryPrice:intent.entryPrice,markerTime:intent.markerTime,markerPrice:intent.markerPrice,asset:{label:intent.asset,flag:selectedAssetFlag().flag},
      side:intent.side,source:intent.source,amount:intent.amount,raw:{},completed:false,pending:true
    };
    expiryTrades.push(intent.marker);
    renderExpiryMarkers();
    pendingTradeIntents.push(intent);
    while(pendingTradeIntents.length>20)pendingTradeIntents.shift();
    nextTradeSource="MANUAL";
  }
  function clearPendingIntent(side){
    const normalized=String(side||"").toUpperCase();
    // A failed/open-rejected event may arrive after the provisional marker is
    // drawn. Do not tear the marker off the chart; let its visible countdown
    // finish so the user never sees a one-second flash.
    for(let i=pendingTradeIntents.length-1;i>=0;i--){
      if(pendingTradeIntents[i].side===normalized){
        pendingTradeIntents.splice(i,1);
        break;
      }
    }
    renderExpiryMarkers();
  }
  function matchIntent(raw,side,asset){
    const now=Date.now();
    for(let i=pendingTradeIntents.length-1;i>=0;i--){
      const it=pendingTradeIntents[i];
      if(now-it.at>30000){pendingTradeIntents.splice(i,1);continue;}
      if(it.side===side&&(!asset||it.asset===asset||String(asset).replace(/\s+(LIVE|OTC)$/i,"")===it.asset||now-it.at<3000)){
        pendingTradeIntents.splice(i,1);
        return it;
      }
    }
    return null;
  }
  function normalizeServerTrade(raw){
    if(!raw||typeof raw!=="object")return null;
    const id=String(raw.id||raw.trade_id||raw.tradeId||"");
    const side=directionForTrade(raw);
    const asset=assetForTrade(raw);
    const intent=matchIntent(raw,side,asset.label);
    const createdAt=parseTimestamp(raw.created_at||raw.opened_at||raw.openedAt||raw.createdAt, intent?intent.at:Date.now());
    const expiryAt=parseTimestamp(raw.expires_at||raw.expiry_at||raw.expiresAt||raw.expiryAt, intent&&intent.expiryAt?intent.expiryAt:createdAt+Number(raw.expiry_seconds||raw.expirySeconds||selectedExpirySeconds())*1000);
    const entryPrice=priceForTrade(raw,intent);
    if(!entryPrice)return null;
    const amountRaw=Number(raw.amount||raw.stake||raw.trade_amount||(intent&&intent.amount));
    const confirmed={
      id:id||("server-trade-"+(++expiryTradeCounter)),
      serverId:id||null,
      entryAt:createdAt,
      expiryAt,
      entryPrice,
      asset,
      side,
      source:sourceForTrade(raw,intent),
      amount:Number.isFinite(amountRaw)&&amountRaw>0?amountRaw:null,
      raw,
      completed:false,
      pending:false
    };
    if(intent&&intent.marker){
      Object.assign(intent.marker,confirmed);
      return intent.marker;
    }
    return confirmed;
  }
  function upsertServerTrade(raw){
    const id=String(raw&& (raw.id||raw.trade_id||raw.tradeId)||"");
    let existing=id?expiryTrades.find(t=>t.serverId===id||t.id===id):null;
    if(existing){
      const updatedExpiry=parseTimestamp(raw.expires_at||raw.expiry_at||raw.expiresAt||raw.expiryAt,existing.expiryAt);
      existing.expiryAt=updatedExpiry;
      existing.raw=raw;
      const p=Number(raw.entry_price||raw.entryPrice||raw.open_price||raw.openPrice||raw.price_at_entry||raw.entry_rate);
      if(Number.isFinite(p)&&p>0)existing.entryPrice=p;
      return existing;
    }
    const t=normalizeServerTrade(raw);
    if(!t)return null;
    if(!expiryTrades.includes(t))expiryTrades.push(t);
    return t;
  }
  function onServerSync(event){
    const detail=event&&event.detail||{};
    const open=Array.isArray(detail.open)?detail.open:[];
    // Do not resurrect stale markers for a different pair from background server sync.
    const selected=String(selectedAssetFlag().label||"").replace(/\\s+(LIVE|OTC)$/i,"").trim().toUpperCase();
    open.filter(t=>String(t.result||t.status||"OPEN").toUpperCase()==="OPEN")
      .filter(t=>assetForTrade(t).label.replace(/\\s+(LIVE|OTC)$/i,"").trim().toUpperCase()===selected)
      .forEach(upsertServerTrade);
    // Server sync may update trade details, but it must never make the
    // entry line/countdown page vanish before its own countdown reaches zero.
    const completed=Array.isArray(detail.recent)?detail.recent:(Array.isArray(detail.history)?detail.history:[]);
    completed.forEach(raw=>{
      const id=String(raw&&(raw.id||raw.trade_id||raw.tradeId)||"");
      const trade=expiryTrades.find(t=>t.serverId===id||t.id===id);
      if(trade)trade.raw=raw;
    });
    renderExpiryMarkers();
  }
  function coordinateForTimestamp(timestampMs){
    if(!state.chart||!state.candles.length)return null;
    const ts=timestampMs/1000, scale=state.chart.timeScale();
    const exact=scale.timeToCoordinate(Math.floor(ts));
    if(exact!==null&&exact!==undefined)return exact;
    const lastIndex=state.candles.length-1;
    const last=state.candles[lastIndex];
    const lastTime=Math.floor(Number(last.t)/1000);
    const logical=lastIndex+(ts-lastTime)/(Number(state.sec)||300);
    return scale.logicalToCoordinate(logical);
  }
  function formatRemaining(ms){
    const s=Math.max(0,Math.ceil(ms/1000));
    if(s<60)return "00:"+String(s).padStart(2,"0");
    if(s<3600)return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
    const hours=Math.floor(s/3600),minutes=Math.floor((s%3600)/60),seconds=s%60;
    if(hours<24)return String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0");
    const days=Math.floor(hours/24);
    return days+"d "+String(hours%24).padStart(2,"0")+":"+String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0");
  }
  // Keep the trade marker visible for 3 seconds after expiry.
  // Do not replace it with a separate result card during this retention window.
  function addResultCard(trade,now){
    if(!trade||trade.resultCardQueued)return;
    trade.resultCardQueued=true;
    const raw=trade.raw||{};
    const valueCandidates=[raw.profit,raw.net_profit,raw.pnl,raw.profit_loss,raw.profit_amount,raw.return_amount];
    let amount=null;
    for(const v of valueCandidates){const n=Number(v);if(v!==null&&v!==undefined&&v!==""&&Number.isFinite(n)){amount=n;break;}}
    const status=String(raw.result||raw.status||raw.outcome||"").toUpperCase();
    const card={id:"gtx-result-"+trade.id,trade,amount,status,showAt:(trade.completedAt||now)+3000,removeAt:(trade.completedAt||now)+8000};
    resultCards.push(card);
  }
  function renderResultCard(layer,card){
    const el=document.createElement("div");
    el.className="gtxTradeResultCard";
    el.style.cssText="position:absolute;z-index:8;left:50%;top:50%;transform:translate(-50%,-50%);min-width:150px;max-width:calc(100% - 24px);padding:14px 18px;border-radius:12px;background:#0b2038;border:1px solid #2b5279;color:#fff;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.38);font:800 13px/1.4 system-ui";
    const title=document.createElement("div");title.textContent="TRADE RESULT";title.style.cssText="font-size:10px;letter-spacing:.12em;color:#9eb9d6;margin-bottom:5px";
    const asset=document.createElement("div");asset.textContent=(card.trade.asset?.label||"ASSET");asset.style.cssText="font-size:12px;margin-bottom:6px";
    const amount=document.createElement("div");
    const n=card.amount;
    amount.textContent=n===null?"Trade finished":(n>0?"+":"")+(Number.isFinite(n)?n.toFixed(2):"");
    amount.style.cssText="font-size:22px;color:"+(n===null?"#fff":n>0?"#22c58b":n<0?"#f16b70":"#fff");
    const status=document.createElement("div");status.textContent=card.status&&card.status!=="OPEN"?card.status:"EXPIRED";status.style.cssText="font-size:10px;color:#9eb9d6;margin-top:4px";
    el.append(title,asset,amount,status);layer.appendChild(el);
  }
  function renderExpiryMarkers(){
    const layer=document.getElementById("gtxLWCExpiryLayer");
    if(!layer)return;
    const now=Date.now();
    // Keep the entry marker pinned to its original candle and exact entry price throughout the trade,
    // then leave it visible for 3 more seconds.
    // Never rebuild the layer on each tick: that caused visible flashing.
    for(let i=expiryTrades.length-1;i>=0;i--){
      const t=expiryTrades[i];
      if(now>=Number(t.expiryAt)+3000){
        if(t.markerNode&&t.markerNode.parentNode)t.markerNode.parentNode.removeChild(t.markerNode);
        expiryTrades.splice(i,1);
      }
    }
    const plotRight=Math.max(20,layer.clientWidth-70);
    const liveIds=new Set();
    expiryTrades.forEach(t=>{
      const key=String(t.markerKey||(t.markerKey="marker-"+t.entryAt+"-"+(++expiryTradeCounter)));
      liveIds.add(key);
      let node=t.markerNode;
      if(!node||node.parentNode!==layer){
        node=document.createElement("div");
        node.className="gtxTradeMarkerGroup";
        node.dataset.tradeMarker=key;
        node.style.cssText="position:absolute;inset:0;pointer-events:none;visibility:visible;opacity:1";
        const line=document.createElement("div");
        line.className="gtxTradeEntryLine "+(t.side==="SELL"?"sell":"buy");
        line.style.cssText="position:absolute;display:block;visibility:visible;opacity:.96;z-index:1;height:2px;min-width:1px;transform:translateY(-50%);";
        const tag=document.createElement("div");
        tag.className="gtxTradeTag "+(t.side==="SELL"?"sell":"buy");
        tag.style.cssText="position:absolute;display:block;visibility:visible;opacity:1;z-index:2;transform:translateY(-50%);padding:4px 6px;border-radius:5px;color:#fff;border:1px solid "+(t.side==="SELL"?"#f16b70":"#22c58b")+";font:800 9px/1.25 system-ui;white-space:nowrap;box-shadow:0 2px 7px rgba(0,0,0,.25);";
        if(t.source==="AB"){
          const ab=document.createElement("b");ab.className="gtxTradeAB";ab.textContent="AB";
          ab.style.cssText="position:absolute;right:3px;top:-17px;min-width:22px;text-align:center;padding:2px 4px;border-radius:4px;background:#f8fafc;color:#087d5b;font:900 10px/1.2 system-ui;animation:gtxAbPulse 1s steps(2,end) infinite";
          tag.appendChild(ab);
        }
        const label=document.createElement("span");label.className="gtxTradeAssetLabel";label.textContent=(t.asset.flag||"🏳️")+" "+t.asset.label;tag.appendChild(label);
        const countdown=document.createElement("span");countdown.className="gtxTradeCountdown";tag.appendChild(countdown);
        node.append(line,tag);
        layer.appendChild(node);
        t.markerNode=node;
      }
      const line=node.querySelector(".gtxTradeEntryLine");
      const tag=node.querySelector(".gtxTradeTag");
      const countdown=node.querySelector(".gtxTradeCountdown");
      // Resolve the original candle timestamp on every chart update. The marker
      // follows that candle horizontally through zoom/scroll, while its entry-price
      // level stays fixed; newer candles never steal it.
      let anchorTime=Number(t.markerTime);
      let anchorPrice=Number(t.markerPrice||t.entryPrice);
      let candleIndex=-1;
      const hasCandleAnchor=t.markerTime!==null&&t.markerTime!==undefined&&t.markerTime!==""&&Number.isFinite(anchorTime);
      if(hasCandleAnchor&&state.candles.length){
        candleIndex=state.candles.findIndex(c=>Math.floor(Number(c.t)/1000)===anchorTime);
      }
      // A known candle anchor is immutable: never transfer this marker to a
      // newer candle just because its original candle is outside the viewport
      // or no longer present in the loaded history.
      if(hasCandleAnchor&&candleIndex<0){
        node.style.display="none";
        return;
      }
      if(candleIndex>=0){
        // Keep the entry at the exact trade-entry price captured on BUY/SELL.
        // Do not recalculate it from the candle body or wick as live ticks arrive:
        // the horizontal price level and original candle identity stay fixed
        // for the life of this trade.
        anchorPrice=Number(t.markerPrice);
        if(!Number.isFinite(anchorPrice))anchorPrice=Number(t.entryPrice);
        if(!Number.isFinite(anchorPrice)){
          node.style.display="none";
          return;
        }
      }else if(!hasCandleAnchor&&state.candles.length){
        // Legacy/server markers without an original candle identity are pinned
        // once to the current candle and its saved entry price.
        const last=state.candles[state.candles.length-1];
        anchorTime=Math.floor(Number(last.t)/1000);
        anchorPrice=Number(t.markerPrice||t.entryPrice);
        t.markerTime=anchorTime;
        t.markerPrice=anchorPrice;
      }
      let x=null,y=null;
      try{
        if(state.chart&&Number.isFinite(anchorTime))x=state.chart.timeScale().timeToCoordinate(anchorTime);
        // Capture the body's wick-connection height once, at trade entry.
        // Keep that screen-space Y fixed while the live candle body/wick changes,
        // preventing the line from shaking up and down on every incoming tick.
        if(Number.isFinite(Number(t.markerY))){
          y=Number(t.markerY);
        }else if(state.candleSeries&&Number.isFinite(anchorPrice)){
          const initialY=state.candleSeries.priceToCoordinate(anchorPrice);
          if(initialY!==null&&initialY!==undefined&&Number.isFinite(initialY)){
            t.markerY=initialY;
            y=initialY;
          }
        }
      }catch(_){}
      // Lightweight Charts returns null coordinates when the anchored candle
      // is outside the visible range. Hide the whole marker with that candle.
      if(y===null||y===undefined||!Number.isFinite(y)||x===null||x===undefined||!Number.isFinite(x)||x<0||x>layer.clientWidth){
        node.style.display="none";
        return;
      }
      node.style.display="";
      const barSpacing=state.chart?Number(state.chart.timeScale().options().barSpacing)||9:9;
      // timeToCoordinate is the original candle center. Start the fixed entry-price
      // line there so it remains visibly connected to the original candle.
      const bodyCenterX=x;
      const tagLeft=Math.max(bodyCenterX+barSpacing*0.5+8,plotRight-148);
      line.style.left=bodyCenterX+"px";line.style.top=y+"px";line.style.width=Math.max(1,tagLeft-bodyCenterX)+"px";
      line.style.background=t.side==="SELL"?"#f16b70":"#22c58b";
      tag.style.left=tagLeft+"px";tag.style.top=y+"px";tag.style.background=t.side==="SELL"?"#b72d43":"#087d5b";
      const label=tag.querySelector(".gtxTradeAssetLabel");
      if(label)label.textContent=(t.asset.flag||"🏳️")+" "+t.asset.label;
      if(countdown)countdown.textContent=formatRemaining(Math.max(0,Number(t.expiryAt)-now));
    });
    // Remove only orphaned marker DOM; active markers are never cleared wholesale.
    Array.from(layer.querySelectorAll("[data-trade-marker]")).forEach(node=>{
      if(!liveIds.has(node.dataset.tradeMarker))node.remove();
    });
  }
  function observeTradeMarkers(){
    if(state.markersInstalled)return;
    state.markersInstalled=true;
    if(!document.getElementById("gtx-ab-pulse-style")){const s=document.createElement("style");s.id="gtx-ab-pulse-style";s.textContent="@keyframes gtxAbPulse{0%,100%{opacity:1}50%{opacity:.35}}";document.head.appendChild(s);}
    window.addEventListener("gotradex:trade-intent",event=>{
      const detail=event&&event.detail||{};
      nextTradeSource=String(detail.source||"").toUpperCase()==="AB"?"AB":"MANUAL";
    });
    function bindTradeButton(button,side){
      if(!button||button.dataset.gtxMarkerBound==="1")return;
      button.dataset.gtxMarkerBound="1";
      const create=()=>rememberIntent(side,nextTradeSource);
      // Bind directly to the actual controls so other document-level handlers
      // cannot swallow the marker-creation event.
      button.addEventListener("click",create,true);
    }
    function bindTradeButtons(){
      bindTradeButton(document.getElementById("buy"),"BUY");
      bindTradeButton(document.getElementById("sell"),"SELL");
    }
    bindTradeButtons();
    const tradeButtonObserver=new MutationObserver(bindTradeButtons);
    tradeButtonObserver.observe(document.body,{childList:true,subtree:true});
    window.addEventListener("gotradex:server-sync",onServerSync);
    window.addEventListener("gotradex:trade-open-failed",event=>{
      clearPendingIntent(event&&event.detail&&event.detail.direction);
    });
    window.addEventListener("gotradex:trade-opened",event=>{
      const raw=event&&event.detail&&(event.detail.trade||event.detail);
      if(raw)upsertServerTrade(raw);
      renderExpiryMarkers();
    });
    window.addEventListener("gotradex:autobot-trade-opened",event=>{
      const raw=event&&event.detail&&(event.detail.trade||event.detail);
      if(raw){raw.source="AB";upsertServerTrade(raw);}
      renderExpiryMarkers();
    });
    window.addEventListener("resize",renderExpiryMarkers);
    if(!expiryTimer)expiryTimer=setInterval(renderExpiryMarkers,250);
  }
    function positionTradeOverlay(){
    renderExpiryMarkers();
  }

  function installLibraryAndStart(){
    if(window.LightweightCharts){start();return}
    if(window.__gtxLwcPromise){window.__gtxLwcPromise.then(start).catch(e=>{status("CHART ENGINE ERROR",false);notice(e.message||"Lightweight Charts could not load.",true)});return}
    window.__gtxLwcPromise=new Promise((resolve,reject)=>{
      let i=0;
      const tryNext=()=>{
        if(window.LightweightCharts){resolve();return}
        if(i>=LWC_URLS.length){reject(new Error("Could not load the Lightweight Charts library."));return}
        const s=document.createElement("script");
        s.src=LWC_URLS[i++];s.async=true;
        s.onload=()=>window.LightweightCharts?resolve():tryNext();
        s.onerror=()=>tryNext();
        document.head.appendChild(s);
      };
      tryNext();
    });
    window.__gtxLwcPromise.then(start).catch(e=>{
      status("CHART ENGINE ERROR",false);
      notice(e.message||"Lightweight Charts could not load.",true);
    });
  }

  function start(){
    try{
      buildChart();
      connect();
    }catch(e){
      status("CHART ENGINE ERROR",false);
      notice(e.message||"Unable to start the chart engine.",true);
    }
  }

  function watchSelection(){
    const f=selection();
    let savedMode="LIVE";try{savedMode=String(localStorage.getItem("gotradex_market_mode")||"LIVE").toUpperCase()}catch(_){}
    const k=[f.provider,f.symbol,f.label,f.type,String(f.mode||savedMode).toUpperCase()].join("|");
    if(k!==state.lastAssetKey){
      state.lastAssetKey=k;
      connect();
    }
  }

  function boot(){
    if(state.booted)return;
    if(!mount()){setTimeout(boot,300);return}
    state.booted=true;
    installLibraryAndStart();
    observeTradeMarkers();
    setInterval(watchSelection,700);
  }

  function setAsset(label,type,mode){
    const pair=String(label||"EUR/USD").replace(/\s+OTC$/i,"").trim()||"BTC/USD";
    const m=String(mode||"LIVE").toUpperCase()==="OTC"?"OTC":"LIVE";
    const t=String(type||"crypto").toLowerCase();
    try{
      localStorage.setItem("gotradex_market_mode",m);
      localStorage.setItem("gotradex_asset_type",t);
      localStorage.setItem("gotradex_asset_display",pair);
      localStorage.setItem("gotradex_chart_symbol",pair.replace(/[^A-Za-z0-9]/g,"").toUpperCase());
    }catch(_){}
    state.connectionId++;
    closeSocket();
    state.provider="";state.symbol="";state.assetLabel=pair;state.mode=m;state.type=t;
    state.candles=[];state.price=null;state.prev=null;state.connected=false;
    state.historyLoaded=false;state.initialRangeSet=false;state.lastAssetKey="";
    if(state.candleSeries){try{state.candleSeries.setData([])}catch(_){} }
    if(state.lineSeries){try{state.lineSeries.setData([])}catch(_){} }
    if(state.areaSeries){try{state.areaSeries.setData([])}catch(_){} }
    const marketLabel=document.getElementById("gtxLWCMarketLabel");
    if(marketLabel)marketLabel.textContent=m+" "+pair;
    if(document.getElementById("gtxLWCStatus")) document.getElementById("gtxLWCStatus").textContent="CONNECTING";
    if(document.getElementById("gtxLWCNotice")){document.getElementById("gtxLWCNotice").hidden=false;document.getElementById("gtxLWCNotice").textContent="Loading "+pair+" candles…"}
    if(state.booted) connect();
  }


  const chartToolSeries={};
  const chartToolLines={};
  const chartToolMarkers={};
  function refreshToolMarkers(){
    if(!state.candleSeries)return;
    const merged=Object.values(chartToolMarkers).flat().sort((a,b)=>a.time-b.time);
    try{state.candleSeries.setMarkers(merged)}catch(_){}
  }
  function setToolMarkers(name,markers){chartToolMarkers[name]=markers||[];refreshToolMarkers();}
  const activeChartTools=new Set();
  const chartToolParams={};
  function chartToolSMA(period,field="c"){
    const out=[];
    for(let i=period-1;i<state.candles.length;i++){
      let sum=0;for(let j=i-period+1;j<=i;j++)sum+=Number(state.candles[j][field]);
      out.push({time:Math.floor(state.candles[i].t/1000),value:sum/period});
    }return out;
  }
  function chartToolEMA(period){
    const out=[];if(!state.candles.length)return out;
    const k=2/(period+1);let value=Number(state.candles[0].c);
    for(let i=0;i<state.candles.length;i++){const close=Number(state.candles[i].c);value=i===0?close:close*k+value*(1-k);if(i>=period-1)out.push({time:Math.floor(state.candles[i].t/1000),value});}
    return out;
  }
  function chartToolSMMA(period){
    const cs=state.candles,out=[];if(!cs.length)return out;
    let value=0;
    for(let i=0;i<cs.length;i++){
      const median=(Number(cs[i].h)+Number(cs[i].l))/2;
      if(i<period){value+=median;if(i===period-1){value/=period;out.push({time:Math.floor(cs[i].t/1000),value});}}
      else{value=(value*(period-1)+median)/period;out.push({time:Math.floor(cs[i].t/1000),value});}
    }
    return out;
  }
  function chartToolData(name,params={}){
    const cs=state.candles,n=cs.length,out=[];
    if(name==="EMA / SMA"){
      const period=Math.max(2,Math.min(500,Math.floor(Number(params.period)||14)));
      const isSma=String(params.type||"EMA").toUpperCase()==="SMA";
      return [{key:"ma-custom",color:"#22d3ee",data:isSma?chartToolSMA(period):chartToolEMA(period)}];
    }
    if(name==="Alligator"){
      const jaw=Math.max(2,Math.min(200,Math.floor(Number(params.jaw)||13)));
      const teeth=Math.max(2,Math.min(200,Math.floor(Number(params.teeth)||8)));
      const lips=Math.max(2,Math.min(200,Math.floor(Number(params.lips)||5)));
      return [{key:"jaw",color:"#3b82f6",data:chartToolSMMA(jaw)},{key:"teeth",color:"#ef4444",data:chartToolSMMA(teeth)},{key:"lips",color:"#22c55e",data:chartToolSMMA(lips)}];
    }
    if(name==="Bollinger Bands"){
      for(let i=19;i<n;i++){let sum=0;for(let j=i-19;j<=i;j++)sum+=Number(cs[j].c);const mean=sum/20;let variance=0;for(let j=i-19;j<=i;j++)variance+=(Number(cs[j].c)-mean)**2;const sd=Math.sqrt(variance/20),time=Math.floor(cs[i].t/1000);out.push({time,value:mean+2*sd});}
      const lower=[];for(let i=19;i<n;i++){let sum=0;for(let j=i-19;j<=i;j++)sum+=Number(cs[j].c);const mean=sum/20;let v=0;for(let j=i-19;j<=i;j++)v+=(Number(cs[j].c)-mean)**2;lower.push({time:Math.floor(cs[i].t/1000),value:mean-2*Math.sqrt(v/20)});}
      return [{key:"bbUpper",color:"#a78bfa",data:out},{key:"bbLower",color:"#a78bfa",data:lower}];
    }
    if(name==="Supertrend"){
      let upper=0,lower=0,trend=1;
      for(let i=1;i<n;i++){const c=cs[i],prev=cs[i-1],tr=Math.max(c.h-c.l,Math.abs(c.h-prev.c),Math.abs(c.l-prev.c));let atr=tr;
        if(i>=10){let sum=0;for(let j=i-9;j<=i;j++){const q=cs[j],p=cs[j-1]||q;sum+=Math.max(q.h-q.l,Math.abs(q.h-p.c),Math.abs(q.l-p.c));}atr=sum/10;}
        const mid=(Number(c.h)+Number(c.l))/2,bu=mid+3*atr,bl=mid-3*atr;
        upper=i===1?bu:Math.min(bu,upper);lower=i===1?bl:Math.max(bl,lower);
        if(Number(c.c)>upper)trend=1;else if(Number(c.c)<lower)trend=-1;
        out.push({time:Math.floor(c.t/1000),value:trend===1?lower:upper});
      }return [{key:"supertrend",color:"#f97316",data:out}];
    }
    return null;
  }
  function clearChartTool(name){
    const keys=Object.keys(chartToolSeries).filter(k=>k.startsWith(name+"::"));
    keys.forEach(k=>{removeSeriesSafe(chartToolSeries[k]);delete chartToolSeries[k]});
    (chartToolLines[name]||[]).forEach(line=>{try{state.candleSeries?.removePriceLine(line)}catch(_){}});
    delete chartToolLines[name];
    if(chartToolMarkers[name]){delete chartToolMarkers[name];refreshToolMarkers();}
    if(["Candlesticks","Heikin Ashi","Line Chart","Area Chart"].includes(name)&&state.candleSeries){
      state.chartType="candle";
      try{state.candleSeries.setData(seriesCandleData())}catch(_){}
      applySeriesVisibility();
    }
  }
  function drawChartTool(name,params={}){
    if(!state.chart||!state.candleSeries||!state.candles.length)return false;
    if(name==="Candlesticks"||name==="Heikin Ashi"||name==="Line Chart"||name==="Area Chart"){
      state.chartType=name==="Line Chart"?"line":name==="Area Chart"?"mountain":"candle";
      if(name==="Heikin Ashi"){
        let prevO=null,prevC=null;const data=state.candles.map(c=>{const close=(Number(c.o)+Number(c.h)+Number(c.l)+Number(c.c))/4;const open=prevO===null?(Number(c.o)+Number(c.c))/2:(prevO+prevC)/2;prevO=open;prevC=close;return {time:Math.floor(c.t/1000),open,high:Math.max(Number(c.h),open,close),low:Math.min(Number(c.l),open,close),close};});
        state.candleSeries.setData(data);
      }else state.candleSeries.setData(seriesCandleData());
      state.lineSeries.setData(seriesLineData());
      state.areaSeries.setData(seriesLineData());
        applySeriesVisibility();return true;
    }
    if(name==="Fractals"){
      const markers=[];
      for(let i=2;i<state.candles.length-2;i++){const c=state.candles[i];let hi=true,lo=true;for(let j=i-2;j<=i+2;j++){if(j===i)continue;if(Number(state.candles[j].h)>=Number(c.h))hi=false;if(Number(state.candles[j].l)<=Number(c.l))lo=false;}
        if(hi)markers.push({time:Math.floor(c.t/1000),position:"aboveBar",color:"#f59e0b",shape:"arrowDown",text:"F"});if(lo)markers.push({time:Math.floor(c.t/1000),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"F"});}
      setToolMarkers(name,markers);return true;
    }
    if(name==="Patterns"||name==="Kangaroo"||name==="Lion"){
      const markers=[];
      const candles=state.candles;
      const timeOf=c=>Math.floor(c.t/1000);
      for(let i=1;i<candles.length;i++){
        const c=candles[i],p=candles[i-1];
        const o=Number(c.o),h=Number(c.h),l=Number(c.l),cl=Number(c.c);
        const po=Number(p.o),pc=Number(p.c),body=Math.abs(cl-o),range=Math.max(0,h-l),upper=h-Math.max(o,cl),lower=Math.min(o,cl)-l;
        if(name==="Patterns"){
          if(body<=range*0.1&&range>0)markers.push({time:timeOf(c),position:"aboveBar",color:"#a78bfa",shape:"circle",text:"Doji"});
          if(cl>o&&pc<po&&cl>=po&&o<=pc)markers.push({time:timeOf(c),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"Bull Engulf"});
          else if(cl<o&&pc>po&&o>=pc&&cl<=po)markers.push({time:timeOf(c),position:"aboveBar",color:"#ef4444",shape:"arrowDown",text:"Bear Engulf"});
          if(body>0&&lower>=body*2&&upper<=body*0.8)markers.push({time:timeOf(c),position:"belowBar",color:"#34d399",shape:"arrowUp",text:"Pin Bull"});
          if(body>0&&upper>=body*2&&lower<=body*0.8)markers.push({time:timeOf(c),position:"aboveBar",color:"#fb7185",shape:"arrowDown",text:"Pin Bear"});
        } else if(name==="Kangaroo"){
          if(body>0&&lower>=body*2&&lower>upper)markers.push({time:timeOf(c),position:"belowBar",color:"#22c55e",shape:"arrowUp",text:"Kangaroo"});
          else if(body>0&&upper>=body*2&&upper>lower)markers.push({time:timeOf(c),position:"aboveBar",color:"#ef4444",shape:"arrowDown",text:"Kangaroo"});
        } else if(name==="Lion"&&i>=20){
          const prior=candles.slice(i-20,i),priorHigh=Math.max(...prior.map(x=>Number(x.h))),priorLow=Math.min(...prior.map(x=>Number(x.l)));
          if(cl>priorHigh)markers.push({time:timeOf(c),position:"aboveBar",color:"#f59e0b",shape:"arrowUp",text:"Lion Break"});
          else if(cl<priorLow)markers.push({time:timeOf(c),position:"belowBar",color:"#f97316",shape:"arrowDown",text:"Lion Break"});
        }
      }
      setToolMarkers(name,markers);return true;
    }
    if(name==="Support & Resistance"||name==="Kenkley’s Lines"){
      const recent=state.candles.slice(-60);if(!recent.length)return false;
      const high=Math.max(...recent.map(c=>Number(c.h))),low=Math.min(...recent.map(c=>Number(c.l)));
      const lines=[state.candleSeries.createPriceLine({price:high,color:"#f97316",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"Resistance"}),state.candleSeries.createPriceLine({price:low,color:"#22c55e",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"Support"})];
      if(name==="Kenkley’s Lines"){
        const mid=(high+low)/2;
        lines.push(state.candleSeries.createPriceLine({price:mid,color:"#60a5fa",lineWidth:1,lineStyle:1,axisLabelVisible:true,title:"Kenkley Mid"}));
      }
      chartToolLines[name]=lines;return true;
    }
    if(name==="Ichimoku Cloud"){
      const cs=state.candles;
      const mid=(end,period)=>{if(end-period+1<0)return null;let hi=-Infinity,lo=Infinity;for(let j=end-period+1;j<=end;j++){hi=Math.max(hi,Number(cs[j].h));lo=Math.min(lo,Number(cs[j].l));}return (hi+lo)/2;};
      const specs=[{key:"tenkan",color:"#ef4444",data:[]},{key:"kijun",color:"#3b82f6",data:[]},{key:"senkouA",color:"#22c55e",data:[]},{key:"senkouB",color:"#f97316",data:[]}];
      for(let i=0;i<cs.length;i++){
        const t=Math.floor(cs[i].t/1000),ten=mid(i,9),kij=mid(i,26),spanB=mid(i,52);
        if(ten!==null)specs[0].data.push({time:t,value:ten});if(kij!==null)specs[1].data.push({time:t,value:kij});
        if(ten!==null&&kij!==null)specs[2].data.push({time:t,value:(ten+kij)/2});if(spanB!==null)specs[3].data.push({time:t,value:spanB});
      }
      specs.forEach(spec=>{const key=name+"::"+spec.key;let series=chartToolSeries[key];if(!series){series=state.chart.addLineSeries({color:spec.color,lineWidth:1,priceLineVisible:false,lastValueVisible:false});chartToolSeries[key]=series;}series.setData(spec.data);});return true;
    }
    const specs=chartToolData(name,params);
    if(specs){specs.forEach(spec=>{const key=name+"::"+spec.key;let series=chartToolSeries[key];if(!series){series=state.chart.addLineSeries({color:spec.color,lineWidth:2,priceLineVisible:false,lastValueVisible:false});chartToolSeries[key]=series;}series.setData(spec.data);});return true;}
    return false;
  }
  function setChartTool(name,params={}){
    name=String(name||"").trim();if(!name)return {ok:false,message:"Choose a chart tool."};
    const chartTypes=["Candlesticks","Heikin Ashi","Line Chart","Area Chart"];
    if(activeChartTools.has(name)){activeChartTools.delete(name);clearChartTool(name);return {ok:true,active:false,message:name+" removed from chart."};}
    if(chartTypes.includes(name)){
      chartTypes.forEach(type=>{if(activeChartTools.has(type)){activeChartTools.delete(type);clearChartTool(type)}});
    }
    const ok=drawChartTool(name,params);
    if(ok){activeChartTools.add(name);chartToolParams[name]=params||{};return {ok:true,active:true,message:name+" applied to the current chart candles."};}
    return {ok:false,message:name+" is listed in Chart Tools but is not implemented in the current chart engine yet."};
  }
  function refreshChartTools(){
    for(const name of activeChartTools){clearChartTool(name);drawChartTool(name,chartToolParams[name]||{});}
  }

  function setChartToolEnabled(name,enabled,params){
    const active=activeChartTools.has(name);
    if(enabled){
      if(active){clearChartTool(name);activeChartTools.delete(name);}
      const result=setChartTool(name,params||{});
      return result;
    }
    if(active){activeChartTools.delete(name);clearChartTool(name);delete chartToolParams[name];return {ok:true,active:false,message:name+" removed from the selected chart."};}
    return {ok:true,active:false,message:name+" is already removed."};
  }
  const eventToolNames={
    alligator:"Alligator",fractals:"Fractals",ao:"Awesome Oscillator",ema:"EMA / SMA",
    supertrend:"Supertrend",kangaroo:"Kangaroo",lion:"Lion",kenkley:"Kenkley’s Lines",
    rsi:"RSI",macd:"MACD",bb:"Bollinger Bands",ichimoku:"Ichimoku Cloud",
    parabolicsar:"Parabolic SAR",adx:"ADX",patterns:"Patterns",stochastic:"Stochastic",
    cci:"CCI",williamsr:"Williams %R",atr:"ATR",keltnerchannels:"Keltner Channels",
    donchianchannels:"Donchian Channels",supportresistance:"Support & Resistance",
    trendline:"Trend Line",horizontalline:"Horizontal Line",verticalline:"Vertical Line",
    fibonacciretracement:"Fibonacci Retracement",fibonacciextension:"Fibonacci Extension",
    candlesticks:"Candlesticks",chartcandles:"Candlesticks",heikin:"Heikin Ashi",heikinashi:"Heikin Ashi",linechart:"Line Chart",areachart:"Area Chart",sr:"Support & Resistance",sar:"Parabolic SAR",fib:"Fibonacci Retracement",
    pricealert:"Price Alert",indicatoralert:"Indicator Alert",buysellsignalalert:"BUY / SELL Signal Alert",
    chartsettings:"Chart Settings"
  };
  function normalizeToolName(value){
    const raw=String(value||"").trim();
    if(!raw)return "";
    if(eventToolNames[raw.toLowerCase().replace(/[^a-z0-9]/g,"")])return eventToolNames[raw.toLowerCase().replace(/[^a-z0-9]/g,"")];
    const match=Object.values(eventToolNames).find(n=>n.toLowerCase()===raw.toLowerCase());
    return match||raw;
  }
  window.addEventListener("gtx-tool-apply",function(event){
    const d=event&&event.detail?event.detail:{};
    const name=normalizeToolName(d.tool||d.name);
    if(!name)return;
    const result=setChartToolEnabled(name,!!d.enabled,d.params||{});
    const status=document.getElementById("chartToolsStatus");
    if(status)status.textContent=result.message||name+" chart action processed.";
  });
  window.addEventListener("gtx-indicator-toggle",function(event){
    const d=event&&event.detail?event.detail:{};
    const name=normalizeToolName(d.name||d.tool);
    if(!name)return;
    const result=setChartToolEnabled(name,!!d.enabled,d.params||{});
    const status=document.getElementById("chartToolsStatus");
    if(status)status.textContent=result.message||name+" chart action processed.";
  });
  window.addEventListener("gtx-tool-delete",function(event){
    const d=event&&event.detail?event.detail:{};
    const name=normalizeToolName(d.tool||d.name);
    if(!name)return;
    if(activeChartTools.has(name)){activeChartTools.delete(name);clearChartTool(name);delete chartToolParams[name];}
  });

  window.GoTradeXLiveChart={
    boot,setTimeframe,reconnect:connect,setAsset,setChartType,setChartTool,setChartToolEnabled,state,
    setWallpaper:function(data){const box=document.getElementById("gtxLiveChart");if(box)box.style.setProperty("--gtx-chart-wallpaper",data?'url("'+data+'")':"none");},
    applyTheme:function(p){try{if(state.chart)state.chart.applyOptions({rightPriceScale:{borderVisible:false},leftPriceScale:{borderVisible:false},timeScale:{borderVisible:false}});}catch(e){}},
    applyTimezone:function(offset){try{if(offset&&/^([+-])\d{2}:\d{2}$/.test(offset))localStorage.setItem("gtx_timezone_offset",offset);if(state.chart)state.chart.applyOptions({timeScale:{tickMarkFormatter:formatChartTime},localization:{timeFormatter:function(time){return formatChartTime(time,(window.LightweightCharts&&window.LightweightCharts.TickMarkType&&window.LightweightCharts.TickMarkType.Time)||0);}}});}catch(e){}},
    chartVersion:"Lightweight Charts 4.2.2",
    engine:"TradingView Lightweight Charts"
  };

  window.addEventListener("gotradex:asset-changed",function(event){
    const d=event&&event.detail?event.detail:{};
    if(d.source!=="dashboard-assets"||d.chartApplied)return;
    try{setAsset(d.label,d.type,d.mode)}catch(_){}
  });

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
