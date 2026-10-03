(function(){
  function install(){
    const keypad=document.getElementById("keypad");
    const amount=document.getElementById("amountValueText");
    if(!keypad||!amount)return;
    let value=String(amount.textContent||"10").replace(/[^0-9]/g,"")||"10";
    let editing=false;
    let lastTouch=0;
    const render=()=>{
      amount.textContent=value||"0";
      const top=document.getElementById("topAmountValue");
      if(top)top.textContent=value||"0";
    };
    const open=()=>{
      editing=false;
      keypad.classList.add("open");
      if(typeof window.syncGtxKenglyVisibility==="function")window.syncGtxKenglyVisibility();
    };
    const close=()=>{
      keypad.classList.remove("open");
      if(typeof window.syncGtxKenglyVisibility==="function")window.syncGtxKenglyVisibility();
    };
    const handle=(button)=>{
      const key=String(button?.dataset?.key||"");
      if(!key)return;
      if(key==="ok"){close();return}
      if(key==="clear"){value="";editing=true}
      else if(/^\d$/.test(key)){
        if(!editing){value=key;editing=true}
        else if(value==="0")value=key;
        else if(value.length<8)value+=key;
      }
      render();
    };
    const amountBtn=document.getElementById("amountBtn");
    if(amountBtn)amountBtn.onclick=open;
    const topAmountBtn=document.getElementById("topAmountBtn");
    if(topAmountBtn)topAmountBtn.onclick=open;
    keypad.querySelectorAll("button[data-key]").forEach(button=>{
      button.onclick=function(e){
        if(Date.now()-lastTouch<500)return;
        handle(button);
      };
      button.ontouchend=function(e){
        e.preventDefault();
        lastTouch=Date.now();
        handle(button);
      };
    });
    document.addEventListener("pointerdown",function(e){
      if(!keypad.classList.contains("open"))return;
      const t=e.target;
      if(t&&t.closest&&t.closest("#keypad"))return;
      if(t&&t.closest&&t.closest("#amountBtn"))return;
      keypad.classList.remove("open");
      if(typeof window.syncGtxKenglyVisibility==="function")window.syncGtxKenglyVisibility();
    },true);
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();