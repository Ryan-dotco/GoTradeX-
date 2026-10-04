(function(){
  function installAgentFix(){
    const fab=document.getElementById("agentFab");
    const widget=document.getElementById("agentWidget");
    if(!fab||!widget)return;

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
      /* Do not preventDefault here: Android needs the click event to open Agent AI. */
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
      dragging=false;
      fab.releasePointerCapture?.(e.pointerId);
      if(moved){
        fab.dataset.dragged="1";
        setTimeout(()=>delete fab.dataset.dragged,120);
        e.preventDefault();
      }
    },true);

    fab.onclick=function(e){
      if(fab.dataset.dragged==="1")return;
      e.preventDefault();
      e.stopPropagation();
      if(widget.classList.contains("open")){
        if(typeof window.closeAgentAI==="function")window.closeAgentAI();
        else widget.classList.remove("open");
      }else{
        if(typeof window.openAgentAI==="function")window.openAgentAI();
        else{
          fab.classList.add("open");
          widget.classList.add("open");
          const input=document.getElementById("agentInput");
          if(input)input.focus();
        }
      }
    };

    document.addEventListener("click",function(e){
      const b=e.target?.closest?.(".menuItem[data-section='Agent AI']");
      if(!b)return;
      e.preventDefault();
      e.stopImmediatePropagation();
      document.getElementById("menuDrawer")?.classList.remove("open");
      if(typeof window.openAgentAI==="function")window.openAgentAI();
    },true);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installAgentFix,{once:true});
  else installAgentFix();
})();