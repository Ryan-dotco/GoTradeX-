/* GoTradeX Chart Tools drawer: expandable vertical category bars. */
(function(){
"use strict";
function init(){
 const drawer=document.getElementById("chartToolsDrawer");
 if(!drawer||drawer.dataset.gtxAccordionReady==="1")return;
 const panel=drawer.querySelector(".panel"); if(!panel)return;
 drawer.dataset.gtxAccordionReady="1";
 const style=document.createElement("style");
 style.id="gtx-chart-tools-accordion-style";
 style.textContent=`
 #chartToolsDrawer{position:fixed!important;inset:0!important;z-index:99990!important;overflow:hidden!important}
 #chartToolsDrawer .panel{width:min(560px,100vw)!important;max-width:100vw!important;height:100dvh!important;max-height:100dvh!important;min-height:0!important;margin:0 auto!important;padding:12px 12px calc(18px + env(safe-area-inset-bottom))!important;overflow-y:auto!important;overscroll-behavior:contain!important;border-radius:0!important;box-sizing:border-box!important}
 #chartToolsDrawer .panel>h2{position:sticky;top:0;z-index:5;margin:0;padding:12px 4px;background:#071426}
 #chartToolsDrawer .panel>.close{position:sticky;top:0;z-index:7;float:right;margin-top:4px}
 #chartToolsDrawer .gtxToolCategory{margin:8px 0;border:1px solid #285077;border-radius:10px;overflow:hidden;background:#091f37}
 #chartToolsDrawer .gtxToolCategoryHead{display:flex;width:100%;min-height:48px;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;text-align:left;background:linear-gradient(100deg,#102d4c,#0b2038);color:#e7f4ff;border:0;border-bottom:1px solid #24496b;font-weight:800;font-size:14px}
 #chartToolsDrawer .gtxToolCategoryHead .gtxToolChevron{font-size:20px;color:#63e6a2;transition:transform .16s}
 #chartToolsDrawer .gtxToolCategoryHead[aria-expanded="true"] .gtxToolChevron{transform:rotate(90deg)}
 #chartToolsDrawer .gtxToolCategoryItems{display:none;padding:4px 8px 8px}
 #chartToolsDrawer .gtxToolCategoryItems.open{display:block}
 #chartToolsDrawer .chartToolOption{display:flex!important;align-items:center;justify-content:space-between;width:100%;min-height:46px;margin:4px 0;padding:11px 12px!important;text-align:left;border:1px solid #214363!important;border-radius:8px!important;background:#0b2945!important;color:#e5f2ff!important;font-size:13px!important}
 #chartToolsDrawer .chartToolOption span{color:#74e8a9;font-size:20px}
 #chartToolsDrawer .chartToolOption.selected{border-color:#42d392!important;background:#0b3a2b!important;box-shadow:inset 3px 0 #42d392}
 #chartToolsDrawer #chartToolsStatus{padding:10px 4px;color:#8decb6;font-size:12px;line-height:1.4}
 @media(min-width:600px){#chartToolsDrawer .panel{width:min(560px,92vw)!important;border-left:1px solid #285077!important;border-right:1px solid #285077!important}}
 `;
 document.head.appendChild(style);
 const title=panel.querySelector("h2");
 const status=panel.querySelector("#chartToolsStatus");
 const close=panel.querySelector(".close");
 const cats=Array.from(panel.querySelectorAll(".category"));
 cats.forEach((cat,index)=>{
   const section=document.createElement("section");section.className="gtxToolCategory";
   const head=document.createElement("button");head.type="button";head.className="gtxToolCategoryHead";head.setAttribute("aria-expanded","false");
   const label=document.createElement("span");label.textContent=cat.textContent.trim();
   const chevron=document.createElement("span");chevron.className="gtxToolChevron";chevron.textContent="›";chevron.setAttribute("aria-hidden","true");
   head.append(label,chevron);
   const items=document.createElement("div");items.className="gtxToolCategoryItems";
   let node=cat.nextElementSibling;
   while(node && !node.classList.contains("category") && node.id!=="chartToolsStatus"){
     const next=node.nextElementSibling;items.appendChild(node);node=next;
   }
   cat.replaceWith(section);section.append(head,items);
   head.addEventListener("click",()=>{
     const willOpen=!items.classList.contains("open");
     panel.querySelectorAll(".gtxToolCategoryItems").forEach(el=>el.classList.remove("open"));
     panel.querySelectorAll(".gtxToolCategoryHead").forEach(el=>el.setAttribute("aria-expanded","false"));
     if(willOpen){items.classList.add("open");head.setAttribute("aria-expanded","true");}
   });
 });
 if(title)title.textContent="Chart Tools";
 if(status)status.setAttribute("aria-live","polite");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();