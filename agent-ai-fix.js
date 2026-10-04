(function(){
  function installAgentFix(){
    const fab=document.getElementById("agentFab");
    const widget=document.getElementById("agentWidget");
    if(fab&&widget){
      fab.style.setProperty("position","fixed","important");
      fab.style.setProperty("right","16px","important");
      fab.style.setProperty("bottom","92px","important");
      fab.style.setProperty("left","auto","important");
      fab.style.setProperty("top","auto","important");
      fab.style.setProperty("z-index","120","important");
      fab.style.setProperty("display","grid","important");
      fab.style.setProperty("pointer-events","auto","important");
      widget.style.setProperty("position","fixed","important");
      widget.style.setProperty("right","12px","important");
      widget.style.setProperty("bottom","84px","important");
      widget.style.setProperty("z-index","121","important");
      let dragging=false,moved=false,startX=0,startY=0,startLeft=0,startTop=0;
      fab.addEventListener("pointerdown",function(e){
        dragging=true;moved=false;startX=e.clientX;startY=e.clientY;
        const r=fab.getBoundingClientRect();startLeft=r.left;startTop=r.top;
        fab.setPointerCapture?.(e.pointerId);
      },true);
      fab.addEventListener("pointermove",function(e){
        if(!dragging)return;
        const dx=e.clientX-startX,dy=e.clientY-startY;
        if(Math.abs(dx)>6||Math.abs(dy)>6)moved=true;
        if(!moved)return;
        const size=fab.offsetWidth;
        const left=Math.max(4,Math.min(window.innerWidth-size-4,startLeft+dx));
        const top=Math.max(4,Math.min(window.innerHeight-size-4,startTop+dy));
        fab.style.setProperty("left",left+"px","important");
        fab.style.setProperty("top",top+"px","important");
        fab.style.setProperty("right","auto","important");
        fab.style.setProperty("bottom","auto","important");
      },true);
      fab.addEventListener("pointerup",function(e){
        if(!dragging)return;
        dragging=false;fab.releasePointerCapture?.(e.pointerId);
        if(moved){fab.dataset.dragged="1";setTimeout(()=>delete fab.dataset.dragged,120);e.preventDefault();}
      },true);
      fab.onclick=function(e){
        if(fab.dataset.dragged==="1")return;
        e.preventDefault();e.stopPropagation();
        if(widget.classList.contains("open")){
          if(typeof window.closeAgentAI==="function")window.closeAgentAI();else widget.classList.remove("open");
        }else{
          if(typeof window.openAgentAI==="function")window.openAgentAI();
          else{fab.classList.add("open");widget.classList.add("open");document.getElementById("agentInput")?.focus();}
        }
      };
      document.addEventListener("click",function(e){
        const b=e.target?.closest?.(".menuItem[data-section='Agent AI']");
        if(!b)return;
        e.preventDefault();e.stopImmediatePropagation();
        document.getElementById("menuDrawer")?.classList.remove("open");
        if(typeof window.openAgentAI==="function")window.openAgentAI();
      },true);
    }

    function closeMenu(){document.getElementById("menuDrawer")?.classList.remove("open")}
    function openAssetDrawer(){closeMenu();document.getElementById("assetDrawer")?.classList.add("open")}
    function makePanel(id,title,body){
      let p=document.getElementById(id);
      if(!p){
        p=document.createElement("div");p.id=id;p.className="drawer";p.innerHTML='<div class="panel"><button class="close" type="button">Close</button><h2></h2><div class="gtxNextBody"></div></div>';
        document.body.appendChild(p);
        p.querySelector(".close").onclick=()=>p.classList.remove("open");
        p.addEventListener("click",e=>{if(e.target===p)p.classList.remove("open")});
      }
      p.querySelector("h2").textContent=title;p.querySelector(".gtxNextBody").innerHTML=body;p.classList.add("open");return p;
    }
    function esc(v){return String(v??"").replace(/[&<>\"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]))}
    function readArray(keys){
      for(const k of keys){try{const v=JSON.parse(localStorage.getItem(k)||"null");if(Array.isArray(v))return v}catch(e){}}
      return [];
    }
    function openPortfolio(){
      const mode=localStorage.getItem("gotradex_account_mode")==="REAL"?"LIVE":"DEMO";
      const balance=mode==="LIVE"?0:10000;
      const positions=readArray(["gotradex_positions","gotradex_open_positions","gotradex_paper_positions"]);
      const history=readArray(["gotradex_trade_history","gotradex_trades","gotradex_paper_trades"]);
      const pnl=history.reduce((n,t)=>n+(Number(t?.pnl??t?.profit??0)||0),0);
      const rows=positions.length?positions.slice(0,20).map(p=>'<div class="gtxNextRow"><strong>'+esc(p.symbol||p.pair||"Position")+'</strong><span>'+esc(p.side||p.direction||"—")+' • '+esc(p.amount??p.size??"—")+' • P/L $'+(Number(p.pnl??p.profit??0)||0).toFixed(2)+'</span></div>').join(""):'<div class="gtxNextEmpty">No recorded paper positions yet.</div>';
      makePanel("gtxPortfolioNext","Portfolio",'<div class="gtxNextGrid"><div><span>ACCOUNT</span><strong>'+mode+'</strong></div><div><span>BALANCE</span><strong>$'+balance.toLocaleString("en-US",{minimumFractionDigits:2})+'</strong></div><div><span>OPEN POSITIONS</span><strong>'+positions.length+'</strong></div><div><span>RECORDED P/L</span><strong>$'+pnl.toFixed(2)+'</strong></div></div><h3 class="gtxNextSub">Open paper positions</h3><div class="gtxNextRows">'+rows+'</div><div class="gtxNextNotice">'+(mode==="LIVE"?'LIVE balance is shown as $0.00 until a verified live account connection supplies the balance.':'DEMO uses $10,000.00 virtual funds. This portfolio does not represent real money.')+'</div>');
    }
    function openAbout(){
      makePanel("gtxAboutNext","About GoTradeX",'<div class="gtxNextCard"><strong>GoTradeX</strong><span>AI-assisted market analysis &amp; paper trading</span></div><div class="gtxNextCard"><strong>Market modes</strong><span>LIVE uses a verified market-data feed when connected. OTC is clearly identified as GoTradeX Synthetic 24/7.</span></div><div class="gtxNextCard"><strong>Trading safety</strong><span>Real-money broker execution remains disabled until a verified live-trading connection is configured.</span></div><div class="gtxNextCard"><strong>Version</strong><span>GoTradeX dashboard • 2026</span></div>');
    }
    function openSettings(kind){
      const title=kind||"Settings";
      const body=kind==="Security"?'<div class="gtxNextCard"><strong>Security</strong><span>Authentication and account security remain controlled by the configured account/authentication layer.</span></div><div class="gtxNextNotice">Do not enter broker passwords, API secrets or private keys into this local settings panel.</div>':kind==="Notifications"?'<div class="gtxNextCard"><strong>Notifications</strong><span>Notification preferences are ready for connection to the account notification service.</span></div><label class="gtxNextToggle"><input type="checkbox" id="gtxNotifyLocal"> <span>Enable local app notifications</span></label><div class="gtxNextNotice">This preference is stored on this device only until a notification backend is connected.</div>':'<div class="gtxNextCard"><strong>Account settings</strong><span>Manage your local GoTradeX preferences without changing balances or trading connections.</span></div><div class="gtxNextCard"><strong>Account mode</strong><span>Use the DEMO / LIVE account control on the trading screen. DEMO is virtual; LIVE remains $0.00 until verified.</span></div><div class="gtxNextCard"><strong>Privacy</strong><span>Local preferences are stored in this browser/device. Payment and payout actions require a verified backend provider.</span></div>';
      makePanel("gtxSettingsNext",title,body);
      const n=document.getElementById("gtxNotifyLocal");if(n)n.checked=localStorage.getItem("gotradex_local_notifications")==="1";if(n)n.onchange=()=>localStorage.setItem("gotradex_local_notifications",n.checked?"1":"0");
    }
    const style=document.createElement("style");style.textContent='.gtxNextBody{display:grid;gap:10px;color:#dbe9f7}.gtxNextGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.gtxNextGrid>div,.gtxNextCard{background:#102945;border:1px solid #23466d;border-radius:10px;padding:11px}.gtxNextGrid span,.gtxNextCard span{display:block;color:#8fa8c4;font-size:10px;line-height:1.45}.gtxNextGrid strong{display:block;font-size:16px;margin-top:4px}.gtxNextSub{font-size:13px;margin:4px 0 0}.gtxNextRows{display:grid;gap:7px}.gtxNextRow{background:#091f3a;border:1px solid #143453;border-radius:9px;padding:10px}.gtxNextRow strong{display:block;font-size:12px}.gtxNextRow span{display:block;color:#8fa8c4;font-size:10px;margin-top:3px}.gtxNextEmpty,.gtxNextNotice{background:#081b33;border:1px dashed #23466d;border-radius:9px;padding:10px;color:#8fa8c4;font-size:10px;line-height:1.45}.gtxNextToggle{display:flex;align-items:center;gap:8px;background:#102945;border:1px solid #23466d;border-radius:9px;padding:12px;font-size:11px}';document.head.appendChild(style);

    document.addEventListener("click",function(e){
      const menu=e.target?.closest?.(".menuItem[data-section]");
      if(menu){
        const s=menu.dataset.section;
        if(s==="Markets"||s==="Portfolio"||s==="About"){
          e.preventDefault();e.stopImmediatePropagation();
          if(s==="Markets")openAssetDrawer();
          if(s==="Portfolio"){closeMenu();openPortfolio()}
          if(s==="About"){closeMenu();openAbout()}
          return;
        }
      }
      const prof=e.target?.closest?.("[data-profile-action]");
      if(prof){
        const a=prof.dataset.profileAction;
        if(["settings","security","notifications"].includes(a)){
          e.preventDefault();e.stopImmediatePropagation();closeMenu();openSettings(a==="security"?"Security":a==="notifications"?"Notifications":"Settings");
        }
      }
    },true);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installAgentFix,{once:true});
  else installAgentFix();
})();