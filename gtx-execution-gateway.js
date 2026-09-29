/* GoTradeX Phase 6 — unified execution gateway */
(function(){
  "use strict";
  const recent=new Map();
  function key(o){return [o.source,o.symbol,o.direction].join("|");}
  function request(order){
    const o={source:"unknown",symbol:"",direction:"",mode:"simulation",...order};
    const guard=window.GTXTradingCore?.canAcceptOrder?.(o);
    if(guard && !guard.ok) throw new Error(guard.reason||"Order blocked by Trade Control.");
    const k=key(o), now=Date.now();
    if(recent.has(k)&&now-recent.get(k)<1000) throw new Error("Duplicate order blocked.");
    recent.set(k,now);
    window.GTXTradingCore?.recordOrder?.({...o,status:o.status||"REQUESTED",requestedAt:new Date(now).toISOString()});
    return {ok:true,order:o};
  }
  function authorize(source,symbol,direction){
    return window.GTXTradingCore?.canAcceptOrder?.({source,symbol,direction}) || {ok:true};
  }
  window.GTXExecutionGateway={request,authorize};
})();