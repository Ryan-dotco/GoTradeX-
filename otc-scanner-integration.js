(function(){
'use strict';
const BRANCH_NOTE='AI OTC Scanner Pro (test integration)';
const SCANNER_URL='otc-scanner.html';
function makeButton(label,cls){const b=document.createElement('button');b.type='button';b.className=cls||'option';b.textContent=label;return b}
function openScanner(){const base=location.href.split('#')[0];location.href=new URL(SCANNER_URL,base).href}
function insertDashboardEntry(){
 const menu=document.querySelector('#menuDrawer .gtxNavColumn');
 if(menu&&!document.getElementById('gtxOtcScannerMenuEntry')){
  const b=makeButton('AI OTC Scanner Pro  ›','option gtxOtcScannerEntry');b.id='gtxOtcScannerMenuEntry';b.style.borderColor='#2585f6';b.addEventListener('click',openScanner);
  const title=Array.from(menu.querySelectorAll('.gtxNavTitle')).find(x=>/trading/i.test(x.textContent));
  if(title)title.insertAdjacentElement('afterend',b);else menu.prepend(b);
 }
}
function insertAdminEntry(){
 const grid=document.querySelector('#adminPage .adminGrid');
 if(grid&&!document.getElementById('gtxOtcScannerAdminCard')){
  const b=document.createElement('button');b.className='adminCard';b.id='gtxOtcScannerAdminCard';b.innerHTML='<strong>AI OTC Scanner Pro</strong><span>Scanner status, usage and access</span>';b.addEventListener('click',openAdminScannerSection);grid.appendChild(b);
 }
 const drawer=document.getElementById('adminDrawer');
 if(drawer&&!document.getElementById('gtxOtcScannerAdminNav')){
  const b=makeButton('AI OTC Scanner Pro  ›','adminNav');b.id='gtxOtcScannerAdminNav';b.addEventListener('click',openAdminScannerSection);const panel=drawer.querySelector('.adminPanel');if(panel)panel.appendChild(b);
 }
}
function openAdminScannerSection(){
 const page=document.getElementById('adminPage');if(!page)return;
 page.querySelectorAll('.adminSection').forEach(s=>{s.classList.remove('open');s.style.display='none'});
 let sec=document.getElementById('gtxOtcScannerAdminSection');
 if(!sec){
  sec=document.createElement('section');sec.id='gtxOtcScannerAdminSection';sec.className='adminSection open';
  sec.style.cssText='display:block;margin:14px;padding:14px;border:1px solid #23466d;border-radius:12px;background:#091f3a;color:#fff';
  sec.innerHTML='<div class="adminSectionHead"><strong>AI OTC Scanner Pro</strong><button type="button" id="gtxScannerAdminClose">Close</button></div><p style="color:#a7bdd4">Controls here apply to this browser/device only. They are not server-enforced admin permissions.</p><div style="padding:12px;background:#102945;border-radius:10px;margin-bottom:10px"><strong id="gtxScannerAdminState">Checking scanner setting…</strong><p style="color:#a7bdd4;font-size:12px">Enable or disable the trader menu entry in this browser.</p><button type="button" id="gtxScannerToggle">Loading…</button></div><div style="padding:12px;background:#102945;border-radius:10px"><strong>Local scan history</strong><p id="gtxScannerAdminCount" style="color:#a7bdd4">—</p><button type="button" id="gtxScannerAdminRefresh">Refresh usage</button><button type="button" id="gtxScannerAdminClear" style="margin-left:6px">Clear local usage</button></div><button type="button" id="gtxScannerAdminBack" class="adminBackCard">Back to Admin Portal</button>';
  const body=page.querySelector('.adminBody');if(body)body.appendChild(sec);else page.appendChild(sec);
  sec.querySelector('#gtxScannerAdminClose').addEventListener('click',()=>{sec.classList.remove('open');sec.style.display='none';});
  sec.querySelector('#gtxScannerAdminBack').addEventListener('click',()=>{sec.classList.remove('open');sec.style.display='none';page.querySelectorAll('.adminSection').forEach(s=>{if(s.id==='adminOverview'){s.classList.add('open');s.style.display='block'}})});
  sec.querySelector('#gtxScannerToggle').addEventListener('click',()=>{const next=localStorage.getItem('gtx_otc_scanner_enabled')!=='false';localStorage.setItem('gtx_otc_scanner_enabled',String(!next));renderAdmin();insertDashboardEntry();});
  sec.querySelector('#gtxScannerAdminRefresh').addEventListener('click',renderAdmin);
  sec.querySelector('#gtxScannerAdminClear').addEventListener('click',()=>{localStorage.removeItem('gtx_otc_scanner_history_v1');renderAdmin();});
 }
 sec.classList.add('open');sec.style.display='block';renderAdmin();
}
function renderAdmin(){const enabled=localStorage.getItem('gtx_otc_scanner_enabled')!=='false';const state=document.getElementById('gtxScannerAdminState'),toggle=document.getElementById('gtxScannerToggle'),count=document.getElementById('gtxScannerAdminCount');if(state)state.textContent='Scanner menu: '+(enabled?'Enabled':'Disabled');if(toggle)toggle.textContent=enabled?'Disable trader entry':'Enable trader entry';if(count){let items=[];try{items=JSON.parse(localStorage.getItem('gtx_otc_scanner_history_v1')||'[]')}catch(e){}count.textContent=items.length+' scans recorded locally on this device.'}}
function updateMenuVisibility(){const enabled=localStorage.getItem('gtx_otc_scanner_enabled')!=='false';const b=document.getElementById('gtxOtcScannerMenuEntry');if(b)b.style.display=enabled?'':'none'}
function syncScannerAssets(){
 const buttons=Array.from(document.querySelectorAll('.searchableAsset'));const seen=new Set();const list=[];
 buttons.forEach(b=>{const label=(b.querySelector('.gtxAssetName')?.textContent||b.textContent||'').trim().replace(/\\s+\\d+%$/,'');if(!label)return;const type=b.dataset.assetType||'';const key=label.toUpperCase()+'|'+type;if(seen.has(key))return;seen.add(key);list.push({label,type,base:label.replace(/\\s+OTC$/i,'')})});
 if(list.length){try{localStorage.setItem('gtx_scanner_asset_catalog_v1',JSON.stringify(list));localStorage.setItem('gtx_scanner_asset_catalog_updated_v1',new Date().toISOString())}catch(_){} }
 try{const pair=document.getElementById('bottomAssetPair')?.textContent?.trim();const mode=document.getElementById('bottomAssetMode')?.textContent?.trim();if(pair)localStorage.setItem('gotradex_asset_display',pair+(mode&&mode!=='LIVE'?' '+mode:''));if(mode)localStorage.setItem('gotradex_market_mode',mode)}catch(_){}
}
function init(){insertDashboardEntry();insertAdminEntry();updateMenuVisibility();syncScannerAssets();const admin=document.getElementById('adminPortalMenuItem');if(admin&&!admin.dataset.gtxScannerBound){admin.dataset.gtxScannerBound='1';admin.addEventListener('click',()=>setTimeout(insertAdminEntry,0))}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
new MutationObserver(()=>{insertDashboardEntry();insertAdminEntry();updateMenuVisibility();syncScannerAssets()}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('gotradex:asset-changed',syncScannerAssets);
})();