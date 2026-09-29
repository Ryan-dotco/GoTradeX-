/* GoTradeX Phase 7 — robot control bridge */
(function(){
 "use strict";
 let timer=null;
 function snapshot(){return window.GTXTradingCore?.snapshot?.()||{};}
 function start(){
   const s=snapshot();
   if(s.emergencyStop) throw new Error("Emergency stop is active.");
   window.GTXTradingCore?.setControl?.("robotEnabled",true);
   window.GTXTradingCore?.setControl?.("signalMode","armed");
   return snapshot();
 }
 function stop(){
   window.GTXTradingCore?.setControl?.("robotEnabled",false);
   return snapshot();
 }
 function evaluate(signal){
   if(!signal) return {allowed:false,reason:"No signal."};
   const s=snapshot();
   if(!s.robotEnabled) return {allowed:false,reason:"Robot is stopped."};
   if(s.emergencyStop) return {allowed:false,reason:"Emergency stop is active."};
   const symbol=signal.symbol||window.state?.currentSymbol||"BTCUSDT";
   const direction=signal.direction;
   if(!["BUY","SELL"].includes(direction)) return {allowed:false,reason:"Signal is not executable."};
   return window.GTXExecutionGateway?.authorize("robot",symbol,direction)||{ok:true};
 }
 function heartbeat(){window.GTXTradingCore?.setControl?.("lastAction","Robot heartbeat");}
 function init(){if(timer)clearInterval(timer);timer=setInterval(heartbeat,5000);}
 window.GTXRobotControl={start,stop,evaluate,snapshot};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();