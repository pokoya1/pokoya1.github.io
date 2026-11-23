// B-3 v0.9 / 3/4 view face renderer; independent of H5.6 simulation and its walk clock.
const B3_EXPRESSIONS=Object.freeze({
 normal:{label:'通常',eye:'open',mouth:'w',symbol:'',hold:0},
 happy:{label:'喜び',eye:'arc',mouth:'open',symbol:'♥',hold:2.5},
 surprise:{label:'驚き',eye:'big',mouth:'o',symbol:'‼',hold:1.6},
 sad:{label:'しょんぼり',eye:'half',mouth:'sad',symbol:'…',hold:3},
 sleepy:{label:'眠い',eye:'closed',mouth:'yawn',symbol:'Zzz',hold:4},
 panic:{label:'あわてる',eye:'big',mouth:'wavy',symbol:'⁉',hold:2}
});
export function createHamsterFaceRig({layer,frontLayer,symbol,status}){
 let current='normal',elapsed=0,clock=0,activeHold=0,source='idle',lastPaintFrame=-1,lastPaintFace='';
 const NS='http://www.w3.org/2000/svg';
 const configs=[{layer,coords:[{x:230,y:123,rx:18,ry:19},{x:322,y:125,rx:12,ry:17}],mouth:[295,154],view:'three'}];
 if(frontLayer)configs.push({layer:frontLayer,coords:[{x:111,y:123,rx:15,ry:16},{x:222,y:123,rx:15,ry:16}],mouth:[166,163],view:'front'});
 function elt(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n}
 function ellipse(x,y,rx,ry,fill){return elt('ellipse',{cx:x,cy:y,rx:Math.max(.2,rx),ry:Math.max(.2,ry),fill})}
 function path(d,stroke='#805038',width=4){return elt('path',{d,fill:'none',stroke,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'})}
 function setExpression(name,{holdSeconds=null,origin='manual'}={}){if(!(name in B3_EXPRESSIONS))return false;if(holdSeconds!==null&&!(holdSeconds===Infinity||(Number.isFinite(holdSeconds)&&holdSeconds>0)))throw new RangeError('holdSeconds');current=name;elapsed=0;activeHold=holdSeconds??B3_EXPRESSIONS[name].hold;source=origin;render(true);return true}
 function step(dt){if(!Number.isFinite(dt)||dt<0)throw new RangeError('invalid dt');clock+=dt;if(current!=='normal'){elapsed+=dt;if(Number.isFinite(activeHold)&&elapsed>=activeHold){current='normal';elapsed=0;activeHold=0;source='idle'}}}
 function reset(){current='normal';elapsed=0;clock=0;activeHold=0;source='idle';render(true)}
 function render(force=false){
  const f=Math.floor(clock*24);if(!force&&f===lastPaintFrame&&current===lastPaintFace)return;lastPaintFrame=f;lastPaintFace=current;
  const preset=B3_EXPRESSIONS[current];
  const phase=clock%2.6;
  const blink=phase<.18?(phase<.09?1-.88*phase/.09:.12+.88*(phase-.09)/.09):1;
  for(const c of configs){
   const lay=c.layer;lay.replaceChildren();
   for(const p of c.coords){
    const {x,y,rx,ry}=p;
    if(preset.eye==='arc'){lay.append(path(`M${x-rx*.75},${y+2} Q${x},${y-ry*.72} ${x+rx*.75},${y+2}`,'#382820',rx*.22));continue;}
    if(preset.eye==='closed'){lay.append(path(`M${x-rx*.75},${y} Q${x},${y+ry*.5} ${x+rx*.75},${y}`,'#382820',rx*.22));continue;}
    const ey=ry*(preset.eye==='big'?1.16:preset.eye==='half'?.5:1)*blink;
    const ex=rx*(preset.eye==='big'?1.12:1);
    lay.append(ellipse(x,y,ex,ey,'#211713'));
    if(blink>.35)lay.append(ellipse(x-ex*.29,y-ey*.31,Math.max(2.2,ex*.2),Math.max(2.2,ey*.24),'#fffdf5'));
   }
   const [mx,my]=c.mouth;
   if(preset.mouth==='w'){
    if(c.view==='three')lay.append(path(`M${mx},${my-13} V${my-2}`));
    lay.append(path(`M${mx-19},${my-2} Q${mx-10},${my+11} ${mx},${my} Q${mx+10},${my+11} ${mx+19},${my-2}`));
   }else if(preset.mouth==='sad'){
    lay.append(path(`M${mx-12},${my+12} Q${mx},${my-7} ${mx+12},${my+12}`));
   }else if(preset.mouth==='wavy'){
    lay.append(path(`M${mx-19},${my+5} q5,-9 10,0 t10,0 t10,0 t9,0`));
   }else{
    const rx=preset.mouth==='o'?7:preset.mouth==='yawn'?9:12;
    const ry=preset.mouth==='o'?9:preset.mouth==='yawn'?13:10;
    lay.append(ellipse(mx,my+5,rx,ry,'#754133'));
    if(preset.mouth!=='o')lay.append(ellipse(mx,my+10,rx*.58,ry*.27,'#e9a197'));
   }
  }
  symbol.textContent=preset.symbol;
  symbol.classList.toggle('on',Boolean(preset.symbol));
  status.textContent=preset.label+(current==='normal'?'｜待機':Number.isFinite(activeHold)?'｜残り'+Math.max(0,activeHold-elapsed).toFixed(1)+'秒':'｜生活動作中');
 }
 function snapshot(){return {expression:current,elapsed:+elapsed.toFixed(3),remaining:current==='normal'||!Number.isFinite(activeHold)?null:+Math.max(0,activeHold-elapsed).toFixed(3),persistent:current!=='normal'&&!Number.isFinite(activeHold),origin:source,clock:+clock.toFixed(3)}}
 render(true);return {setExpression,step,reset,render,snapshot};
}
