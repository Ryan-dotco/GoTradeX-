(function(){
"use strict";
function boot(){
 const api=window.GoTradeXLiveChart, s=api&&api.state;
 if(!api||!s||!s.chart||!s.candleSeries){setTimeout(boot,500);return}
 if(api.__toolLayer)return;api.__toolLayer=1;
 const original=api.setChartTool, active=new Set(), lines=new Map();
 const tools=["Alligator","Fractals","Patterns","EMA / SMA","Bollinger Bands","Supertrend","Ichimoku Cloud","Parabolic SAR","Kangaroo","Lion","Kenkley’s Lines","Support & Resistance","Trend Line","Horizontal Line","Vertical Line","Fibonacci Retracement","Fibonacci Extension","Awesome Oscillator","ADX","RSI","MACD","Stochastic","CCI","Williams %R","ATR","Keltner Channels","Donchian Channels"];
 const c=()=>s.candles||[],v=()=>c().map(x=>+x.c),m=()=>c().map(x=>(+x.h+ +x.l)/2);
 function avg(a,p){let o=[];for(let i=p-1;i<a.length;i++)o.push({time:Math.floor(c()[i].t/1000),value:a.slice(i-p+1,i+1).reduce((x,y)=>x+y,0)/p});return o}
 function ema(a,p){if(a.length<p)return[];let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p,o=[{time:Math.floor(c()[p-1].t/1000),value:e}],k=2/(p+1);for(let i=p;i<a.length;i++){e=a[i]*k+e*(1-k);o.push({time:Math.floor(c()[i].t/1000),value:e})}return o}
 function smma(a,p,sh){if(a.length<p)return[];let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p,o=[];for(let i=p-1;i<a.length;i++){if(i>=p)e=(e*(p-1)+a[i])/p;o.push({time:Math.floor(c()[Math.min(i+sh,a.length-1)].t/1000),value:e})}return o}
 function atr(p){let q=[];for(let i=1;i<c().length;i++)q.push(Math.max(c()[i].h-c()[i].l,Math.abs(c()[i].h-c()[i-1].c),Math.abs(c()[i].l-c()[i-1].c)));return avg(q,p).map((x,i)=>({time:Math.floor(c()[i+p].t/1000),value:x.value}))}
 function add(k,d,color,w){if(!d.length)return;const z=s.chart.addLineSeries({color,lineWidth:w||1,priceLineVisible:false,lastValueVisible:false});z.setData(d);lines.set(k,z)}
 function clear(){for(const z of lines.values())try{s.chart.removeSeries(z)}catch(_){}lines.clear();s.candleSeries.setMarkers([])}
 function fract(){let z=[];for(let i=2;i<c().length-2;i++){if(c()[i].h>c()[i-1].h&&c()[i].h>c()[i-2].h&&c()[i].h>c()[i+1].h&&c()[i].h>c()[i+2].h)z.push({time:Math.floor(c()[i].t/1000),position:"aboveBar",color:"#ff9f43",shape:"arrowDown",text:"F"});if(c()[i].l<c()[i-1].l&&c()[i].l<c()[i-2].l&&c()[i].l<c()[i+1].l&&c()[i].l<c()[i+2].l)z.push({time:Math.floor(c()[i].t/1000),position:"belowBar",color:"#48dbfb",shape:"arrowUp",text:"F"})}return z}
 function draw(){
  if(!s.chart)return;clear();const a=v(),b=m(),q=c();
  if(active.has("Alligator")){add("j",smma(b,13,8),"#4da3ff",2);add("t",smma(b,8,5),"#efc44f",2);add("l",smma(b,5,3),"#ef6a6a",2)}
  if(active.has("EMA / SMA")){add("e9",ema(a,9),"#f5c542",2);add("e21",ema(a,21),"#5ea7ff",2);add("s50",avg(a,50),"#b58cff",1)}
  if(active.has("Lion"))add("lion",ema(a,8),"#f97316",2);
  if(active.has("Kenkley’s Lines")){add("kf",ema(a,34),"#22c55e",2);add("ks",ema(a,89),"#f59e0b",2)}
  if(active.has("Bollinger Bands")&&a.length>=20){const mid=avg(a,20),up=[],dn=[];for(let i=19;i<a.length;i++){const x=a.slice(i-19,i+1),u=mid[i-19].value,d=Math.sqrt(x.reduce((r,n)=>r+(n-u)*(n-u),0)/20),t=Math.floor(q[i].t/1000);up.push({time:t,value:u+2*d});dn.push({time:t,value:u-2*d})}add("bu",up,"#9c7cff");add("bd",dn,"#9c7cff")}
  if(active.has("Support & Resistance")&&q.length){const hi=Math.max(...q.slice(-50).map(x=>x.h)),lo=Math.min(...q.slice(-50).map(x=>x.l));add("hi",q.map(x=>({time:Math.floor(x.t/1000),value:hi})),"#ef4444",2);add("lo",q.map(x=>({time:Math.floor(x.t/1000),value:lo})),"#22c55e",2)}
  if(active.has("Horizontal Line")&&q.length)add("hl",q.map(x=>({time:Math.floor(x.t/1000),value:s.price})),"#f5a623",2);
  if(active.has("Trend Line")&&q.length>1){const d=q.slice(-60);add("tr",[{time:Math.floor(d[0].t/1000),value:d[0].c},{time:Math.floor(d[d.length-1].t/1000),value:d[d.length-1].c}],"#38bdf8",2)}
  let mk=[];if(active.has("Fractals")||active.has("Kangaroo"))mk=mk.concat(fract());if(active.has("Patterns"))mk=mk.concat(fract());if(active.has("Parabolic SAR"))mk=mk.concat(fract());if(mk.length)s.candleSeries.setMarkers(mk.slice(-160))
 }
 api.setChartTool=function(tool){if(!tools.includes(tool))return original(tool);if(active.has(tool))active.delete(tool);else active.add(tool);draw()};
 setInterval(()=>{if(active.size&&s.candles.length)draw()},3000);draw();
}
boot();
})();