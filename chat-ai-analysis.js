/* GoTradeX Chat AI Analysis — deterministic, no API credits, no random signals.
 * Uses verified candles already loaded by GoTradeXLiveChart. It does not place trades.
 * Image capture/upload is supported for preview; signal calculations use real chart candles,
 * not visual interpretation of pixels. Never invent candles or claim a screenshot was read by vision AI.
 */
(function(){
  "use strict";
  if(window.GoTradeXChatAnalysis) return;
  const $=id=>document.getElementById(id);
  const fmt=(n)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:6}):"—";
  const styles=`
  #gtxChatAIEntry{display:block;width:calc(100% - 24px);max-width:760px;margin:8px auto 12px;padding:12px;border:1px solid #24517a;border-radius:12px;background:#10243a;color:#fff;font-weight:800}
  #gtxChatAIEntry span{color:#61e7ad}
  #gtxChatAIOverlay{position:fixed;inset:0;z-index:10020;background:rgba(1,7,18,.94);display:none;overflow:auto;color:#f4f7ff;font:14px system-ui,sans-serif;padding:14px}
  #gtxChatAIOverlay.open{display:block}
  #gtxChatAICard{max-width:720px;margin:0 auto;padding:16px;background:#09182a;border:1px solid #234768;border-radius:16px}
  #gtxChatAIOverlay h2{margin:0 0 6px;font-size:20px}
  #gtxChatAIOverlay p{color:#a8bad0;line-height:1.5}
  .gtxCAIactions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
  .gtxCAIactions button,.gtxCAIclose{padding:12px;border:1px solid #345779;border-radius:10px;background:#122b45;color:#fff;font-weight:800}
  #gtxCAIAnalyze{width:100%;background:#087c5a;border-color:#10a77b}
  #gtxCAIImage{display:none;max-width:100%;max-height:280px;margin:10px auto;border-radius:10px}
  #gtxCAIResult{margin-top:12px;padding:14px;border:1px solid #294864;border-radius:12px;background:#0d2034;white-space:normal;line-height:1.6}
  #gtxCAISignal{font-size:23px;font-weight:900}
  .gtxCAIgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
  .gtxCAImetric{padding:9px;background:#10263d;border-radius:8px}
  .gtxCAImetric small{display:block;color:#8faac5}
  .gtxCAIwarning{font-size:12px!important;color:#f6cb7a!important}
  @media(max-width:480px){#gtxChatAIOverlay{padding:8px}.gtxCAIgrid{grid-template-columns:1fr 1fr}}
  `;
  function addStyle(){if($("gtx-chat-analysis-style"))return;const s=document.createElement("style");s.id="gtx-chat-analysis-style";s.textContent=styles;document.head.appendChild(s)}
  function addUI(){
    if($("gtxChatAIOverlay"))return;
    addStyle();
    const button=document.createElement("button");
    button.id="gtxChatAIEntry";button.type="button";
    button.innerHTML="🤖 Chat AI Analysis <span>• FREE technical analysis</span>";
    const chart=document.getElementById("gtxChart")||document.getElementById("gtxLWC");
    if(chart&&chart.parentNode)chart.parentNode.insertBefore(button,chart.nextSibling);
    else document.body.appendChild(button);
    const overlay=document.createElement("div");overlay.id="gtxChatAIOverlay";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","Chat AI chart analysis");
    overlay.innerHTML=`<div id="gtxChatAICard">
      <button class="gtxCAIclose" id="gtxCAIClose" type="button" style="float:right">Close ✕</button>
      <h2>GoTradeX Chat AI Analysis</h2>
      <p>Free local technical analysis. Capture a chart or upload a screenshot for reference, then analyse the currently selected asset's verified candles.</p>
      <div class="gtxCAIactions">
        <button type="button" id="gtxCAICamera">📷 Take a photo</button>
        <button type="button" id="gtxCAIUpload">🖼️ Upload screenshot</button>
      </div>
      <input id="gtxCAICameraInput" type="file" accept="image/*" capture="environment" hidden>
      <input id="gtxCAIUploadInput" type="file" accept="image/*" hidden>
      <img id="gtxCAIImage" alt="Selected chart screenshot preview">
      <p id="gtxCAIFileStatus">No image selected. You can also analyse the active chart directly.</p>
      <button id="gtxCAIAnalyze" type="button">ANALYSE CURRENT CHART</button>
      <div id="gtxCAIResult" aria-live="polite">Waiting for analysis. No trade has been placed.</div>
      <p class="gtxCAIwarning">Important: the uploaded image is previewed but this offline engine does not visually interpret screenshot pixels. Analysis is calculated from the actual candle data loaded for the selected asset. Signals are uncertain and are not a guarantee.</p>
    </div>`;
    document.body.appendChild(overlay);
    button.addEventListener("click",()=>{overlay.classList.add("open");runAnalysis()});
    $("gtxCAIClose").addEventListener("click",()=>overlay.classList.remove("open"));
    overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.classList.remove("open")});
    $("gtxCAICamera").addEventListener("click",()=>$("gtxCAICameraInput").click());
    $("gtxCAIUpload").addEventListener("click",()=>$("gtxCAIUploadInput").click());
    [$("gtxCAICameraInput"),$("gtxCAIUploadInput")].forEach(input=>input.addEventListener("change",()=>{
      const file=input.files&&input.files[0];if(!file)return;
      if(!file.type.startsWith("image/")){$("gtxCAIFileStatus").textContent="Please choose an image file.";return}
      const old=$("gtxCAIImage").dataset.url;if(old)URL.revokeObjectURL(old);
      const url=URL.createObjectURL(file);$("gtxCAIImage").src=url;$("gtxCAIImage").dataset.url=url;$("gtxCAIImage").style.display="block";
      $("gtxCAIFileStatus").textContent="Image loaded: "+file.name+". Running offline visual scan…";
      analyzeScreenshot(file);
    }));
    $("gtxCAIAnalyze").addEventListener("click",runAnalysis);
  }
  function average(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN}
  function ema(values,period){if(values.length<period)return NaN;const k=2/(period+1);let v=average(values.slice(0,period));for(let i=period;i<values.length;i++)v=values[i]*k+v*(1-k);return v}
  function rsi(values,period=14){
    if(values.length<period+1)return NaN;let gain=0,loss=0;
    for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)gain+=d;else loss-=d}
    gain/=period;loss/=period;
    for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(0,d))/period;loss=(loss*(period-1)+Math.max(0,-d))/period}
    return loss===0?100:100-(100/(1+gain/loss));
  }
  function analyze(candles){
    const cs=candles.filter(c=>[c.t,c.o,c.h,c.l,c.c].every(v=>Number.isFinite(Number(v)))).map(c=>({t:+c.t,o:+c.o,h:+c.h,l:+c.l,c:+c.c})).sort((a,b)=>a.t-b.t);
    if(cs.length<20)throw new Error("Not enough verified candles yet ("+cs.length+" available). Wait for chart history to load; at least 20 candles are required.");
    const closes=cs.map(c=>c.c),last=cs[cs.length-1],prev=cs[cs.length-2],r=rsi(closes);
    const e9=ema(closes,9),e21=ema(closes,21),e50=ema(closes,50);
    const fast=ema(closes,12),slow=ema(closes,26);
    const macdLine=fast-slow;
    const macdPrev=ema(closes.slice(0,-1),12)-ema(closes.slice(0,-1),26);
    const momentum=(last.c-closes[Math.max(0,closes.length-6)])/Math.max(Math.abs(closes[Math.max(0,closes.length-6)]),1e-12)*100;
    const ranges=cs.slice(-14).map(c=>c.h-c.l),atr=average(ranges);
    const recent=cs.slice(-30,-1),support=Math.min(...recent.map(c=>c.l)),resistance=Math.max(...recent.map(c=>c.h));
    const bullTrend=e9>e21&&e21>e50,bearTrend=e9<e21&&e21<e50;
    const bullCandle=last.c>last.o&&last.c>prev.h,bearCandle=last.c<last.o&&last.c<prev.l;
    let bull=0,bear=0;
    if(bullTrend)bull+=2;if(bearTrend)bear+=2;
    if(macdLine>0&&macdLine>macdPrev)bull++;if(macdLine<0&&macdLine<macdPrev)bear++;
    if(momentum>0)bull++;if(momentum<0)bear++;
    if(r<35)bull++;if(r>65)bear++;
    if(bullCandle)bull++;if(bearCandle)bear++;
    let signal="WAIT",why="The indicators do not agree strongly enough for a directional setup.";
    if(bull>=4&&bull>=bear+2){signal="BUY";why="Bullish confluence: trend/momentum indicators lean upward. Wait for your own entry confirmation."}
    else if(bear>=4&&bear>=bull+2){signal="SELL";why="Bearish confluence: trend/momentum indicators lean downward. Wait for your own entry confirmation."}
    const score=Math.round(Math.min(88,50+Math.abs(bull-bear)*7+Math.max(bull,bear)*2));
    return {cs,last,prev,r,e9,e21,e50,macdLine,momentum,atr,support,resistance,bull,bear,signal,why,score,bullTrend,bearTrend,bullCandle,bearCandle};
  }
  function runAnalysis(){
    const result=$("gtxCAIResult");if(!result)return;
    try{
      const chart=window.GoTradeXLiveChart;
      const state=chart&&chart.state;
      if(!state||!Array.isArray(state.candles)||state.candles.length<20){
        const img=$("gtxCAIImage");
        if(img&&img.dataset.url){analyzeScreenshotUrl(img.dataset.url);return;}
        throw new Error("No chart candles are loaded yet. Take a chart photo or upload a screenshot to run offline visual analysis.");
      }
      const a=analyze(state.candles),asset=state.assetLabel||state.symbol||"Selected asset",mode=state.mode||"";

      result.innerHTML=`<div><small>${escapeHtml(mode)} • ${escapeHtml(asset)} • ${a.cs.length} candles</small></div>
      <div id="gtxCAISignal" style="color:${a.signal==="BUY"?"#5af0a6":a.signal==="SELL"?"#ff7a83":"#f6d27c"}">${a.signal==="BUY"?"BUY ↑":a.signal==="SELL"?"SELL ↓":"WAIT — NO CLEAR SIGNAL"}</div>
      <div class="gtxCAIgrid">
       <div class="gtxCAImetric"><small>Latest close</small><strong>${fmt(a.last.c)}</strong></div>
       <div class="gtxCAImetric"><small>RSI (14)</small><strong>${fmt(a.r)}</strong></div>
       <div class="gtxCAImetric"><small>EMA 9 / 21</small><strong>${fmt(a.e9)} / ${fmt(a.e21)}</strong></div>
       <div class="gtxCAImetric"><small>Setup score (not win probability)</small><strong>${a.score}/100</strong></div>
       <div class="gtxCAImetric"><small>Support • last 30</small><strong>${fmt(a.support)}</strong></div>
       <div class="gtxCAImetric"><small>Resistance • last 30</small><strong>${fmt(a.resistance)}</strong></div>
      </div>
      <p><b>Trend:</b> ${a.bullTrend?"Bullish (EMA 9 > 21 > 50)":a.bearTrend?"Bearish (EMA 9 < 21 < 50)":"Mixed / sideways"}.</p>
      <p><b>Momentum:</b> ${fmt(a.momentum)}% over the last five candle steps. MACD line: ${fmt(a.macdLine)}.</p>
      <p><b>Recent candle:</b> ${a.bullCandle?"Bullish breakout above prior high":a.bearCandle?"Bearish break below prior low":a.last.c>a.last.o?"Bull candle":a.last.c<a.last.o?"Bear candle":"Doji / flat"}.</p>
      <p><b>Reason:</b> ${escapeHtml(a.why)}</p>
      <p><b>Risk note:</b> ATR-like average range of recent candles is ${fmt(a.atr)}. Support/resistance and indicators can fail; no result guarantees the next price move.</p>`;
    }catch(e){result.textContent=e.message||"Analysis could not run."}
  }
  // Offline screenshot scan: uses canvas pixel colours and candle-position geometry only.
  // It is a visual heuristic, not OCR or a trained vision model.
  function analyzeScreenshot(file){
    const url=$("gtxCAIImage")?.dataset.url;
    if(url)analyzeScreenshotUrl(url);
  }
  function analyzeScreenshotUrl(url){
    const result=$("gtxCAIResult");if(!result)return;
    const img=new Image();
    img.onload=()=>{
      try{
        const w=360,h=Math.max(120,Math.round(img.height*(w/img.width)));
        const canvas=document.createElement("canvas");canvas.width=w;canvas.height=Math.min(h,260);
        const ctx=canvas.getContext("2d",{willReadFrequently:true});
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const W=canvas.width,H=canvas.height;
        const data=ctx.getImageData(0,0,W,H).data;
        const columns=[];
        let green=0,red=0;
        for(let x=0;x<W;x++){
          let gy=0,ry=0,gc=0,rc=0;
          for(let y=Math.floor(H*.12);y<Math.floor(H*.88);y++){
            const i=(y*W+x)*4,R=data[i],G=data[i+1],B=data[i+2],max=Math.max(R,G,B),min=Math.min(R,G,B);
            if(G>90&&G>R*1.28&&G>B*1.08&&G-min>35){gy+=y;gc++;green++}
            else if(R>110&&R>G*1.3&&R>B*1.12&&R-min>40){ry+=y;rc++;red++}
          }
          if(gc+rc>=2)columns.push({x,y:(gy+ry)/(gc+rc),g:gc,r:rc,n:gc+rc});
        }
        if(columns.length<8)throw new Error("I couldn't reliably detect enough coloured candle pixels in this screenshot. Try a clearer chart screenshot with visible red/green candles.");
        const bins=[];
        for(let i=0;i<6;i++){
          const subset=columns.filter(p=>p.x>=W*i/6&&p.x<W*(i+1)/6);
          if(subset.length)bins.push({x:average(subset.map(p=>p.x)),y:average(subset.map(p=>p.y))});
        }
        if(bins.length<4)throw new Error("The screenshot does not show enough clear candle structure for a useful offline estimate.");
        const first=average(bins.slice(0,2).map(b=>b.y)),last=average(bins.slice(-2).map(b=>b.y));
        const move=((first-last)/H)*100;
        const bullish=green>red*1.15,bearish=red>green*1.15;
        let trend="Mixed / unclear",signal="WAIT";
        if(move>3&&bullish){trend="Visual upward move";signal="POSSIBLE BUY";}
        else if(move< -3&&bearish){trend="Visual downward move";signal="POSSIBLE SELL";}
        else if(move>3){trend="Price structure slopes upward, candle colours mixed";}
        else if(move< -3){trend="Price structure slopes downward, candle colours mixed";}
        result.innerHTML=`<div><small>OFFLINE SCREENSHOT SCAN • ${W}×${H} sampled pixels</small></div>
          <div id="gtxCAISignal" style="color:${signal.includes("BUY")?"#5af0a6":signal.includes("SELL")?"#ff7a83":"#f6d27c"}">${signal}</div>
          <div class="gtxCAIgrid">
           <div class="gtxCAImetric"><small>Visual trend</small><strong>${trend}</strong></div>
           <div class="gtxCAImetric"><small>Detected candle columns</small><strong>${columns.length}</strong></div>
           <div class="gtxCAImetric"><small>Green pixel count</small><strong>${green}</strong></div>
           <div class="gtxCAImetric"><small>Red pixel count</small><strong>${red}</strong></div>
          </div>
          <p><b>What this suggests:</b> ${signal==="POSSIBLE BUY"?"The sampled chart pixels lean upward with more green than red candle pixels.":signal==="POSSIBLE SELL"?"The sampled chart pixels lean downward with more red than green candle pixels.":"The image scan does not show a strong enough combined visual pattern to suggest a direction."}</p>
          <p><b>Important limitation:</b> This is a simple offline pixel heuristic. It cannot reliably read price labels, RSI values, support/resistance prices, timeframes, or future movement, and chart themes/indicators can confuse colour detection. Use WAIT if the picture is unclear; this is not a confirmed trade signal.</p>`;
        $("gtxCAIFileStatus").textContent="Offline screenshot scan complete. No API or credits used.";
      }catch(e){result.textContent=e.message||"Could not analyse screenshot offline.";$("gtxCAIFileStatus").textContent="Offline scan could not identify the chart reliably."}
    };
    img.onerror=()=>{result.textContent="Could not read this image. Please try another screenshot.";};
    img.src=url;
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  window.GoTradeXChatAnalysis={analyze:analyze,run:runAnalysis,version:"1.1.0-offline-screenshot-heuristic"};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",addUI,{once:true});else addUI();
})();