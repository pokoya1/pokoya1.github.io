// H5.5 browser adapter; simulation in core.mjs stays DOM independent.
import {DollhouseSimulation} from './core.mjs';
export function launch(scene){
const sim=new DollhouseSimulation(scene),W=scene.canvas.width,H=scene.canvas.height;
const $=id=>document.getElementById(id), stage=$('stage'), guides=$('guides');let chosen='hamster',playing=true,rate=1,last=null;
const actorEls={hamster:$('actor-hamster'),penguin:$('actor-penguin')}, shadow={hamster:$('hamster-shadow'),penguin:$('penguin-shadow')};
const symbols={hamster:$('symbol-hamster'),penguin:$('symbol-penguin')},atlas=$('feet-atlas'),puppet=$('hamster-puppet'),near=$('arm-near'),far=$('arm-far');
const st=$('status'),actorStatus=$('actor-status'),log=$('life-log');
const label=id=>id==='hamster'?'ハムスター':'ペンギン';const logLine=m=>{log.textContent=m+'\n'+log.textContent.split('\n').slice(0,4).join('\n')};
const show=m=>{st.textContent=m;};
const scale=y=>{const p=scene.floor.projection;return p.scaleAtBack+(p.scaleAtFront-p.scaleAtBack)*Math.max(0,Math.min(1,(y-p.scaleBackY)/(p.scaleFrontY-p.scaleBackY)))};
const coords=sim.comp.coords;const ns='http://www.w3.org/2000/svg';
function path(poly){return poly.map((p,i)=>(i?'L':'M')+p.join(',')).join(' ')+'Z'}
function svg(tag,attrs,parent){const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);parent.appendChild(el)}
function paintGuides(){const floor=$('walk-floor'), blocks=$('blocks'), routes=$('routes');floor.setAttribute('d',path(scene.floor.walkablePolygon));blocks.replaceChildren();routes.replaceChildren();
 for(const f of scene.furniture){if(!f.footprintLocal?.length)continue;svg('path',{d:path(f.footprintLocal.map(p=>[p[0]+f.position.x,p[1]+f.position.y])),fill:'#bf856a19',stroke:'#c38d7d','stroke-width':1.3,'stroke-dasharray':'4 6'},blocks)}
 for(const [a,b]of scene.floor.waypointGraph.edges)svg('path',{d:'M'+coords[a].join(',')+'L'+coords[b].join(','),stroke:'#6aacc1','stroke-width':2.8,'stroke-dasharray':'5 6',fill:'none'},routes);
}
function drawFurniture(){for(const f of scene.furniture){const img=document.querySelector('[data-furniture-image="'+f.id+'"]');if(!img||!f.render)continue;img.style.width=(f.render.width/W*100)+'%';img.style.height=(f.render.height/H*100)+'%';img.style.left=((f.position.x-f.render.width/2)/W*100)+'%';img.style.top=((f.position.y-f.render.height)/H*100)+'%';const depth=f.render.layer==='floor'?0:f.render.layer==='wall'?130:Math.round(f.position.y);img.style.zIndex=String(depth);}
 for(const btn of document.querySelectorAll('button.spot')){const s=sim.comp.spots.get(btn.dataset.spot);if(s){btn.style.left=(s.x/W*100)+'%';btn.style.top=(s.y/H*100)+'%';btn.style.zIndex=900;}}
}
function draw(){for(const [id,a]of Object.entries(sim.actors)){const el=actorEls[id],sc=scale(a.y),walking=a.mode==='travel';el.style.left=(a.x/W*100)+'%';el.style.top=(a.y/H*100)+'%';el.style.transform=`translate(-50%,-96%) scale(${sc})`;el.style.zIndex=String(Math.round(a.y)+1);
 shadow[id].style.left=(a.x/W*100)+'%';shadow[id].style.top=(a.y/H*100)+'%';shadow[id].style.transform=`translate(-50%,-50%) scale(${sc})`;shadow[id].style.zIndex=String(Math.round(a.y));
 const sym=symbols[id];if(a.mode==='acting'&&a.spot){const sp=sim.comp.spots.get(a.spot),act=scene.activities[sp.action];sym.classList.add('on');sym.textContent=act.icon;sym.style.left=(a.x/W*100)+'%';sym.style.top=((a.y-115*sc)/H*100)+'%';}else sym.classList.remove('on');
 if(id==='hamster'){const k=Math.sin(a.walkClock*12/8*Math.PI*2);puppet.style.transform=`scaleX(${a.face}) translateY(${walking?-Math.abs(k)*1.1:0}px) rotate(${walking?k*.6:0}deg)`;near.style.transform=`rotate(${walking?k*9:0}deg)`;far.style.transform=`rotate(${walking?-k*9:0}deg)`;let n=walking?Math.floor(a.walkClock*12)%8:0;atlas.style.backgroundPosition=(100*(n%4)/3)+'% '+(100*Math.floor(n/4))+'%';}
 else{el.querySelector('img').style.transform=`scaleX(${a.face}) rotate(${walking?Math.sin(a.walkClock*10)*2.2:0}deg)`;}
 }
 actorStatus.textContent=Object.entries(sim.actors).map(([id,a])=>label(id)+'：'+({idle:'待機',travel:'移動中',waiting:'空席待ち',acting:'行動中',at:'くつろぎ中'}[a.mode])+(a.target?' ('+sim.comp.spots.get(a.target).name+')':'')).join('\n')+'\n'+[...sim.comp.spots].map(([id,s])=>s.name+': '+sim.seats[id].occupants.length+'/'+s.capacity+(sim.seats[id].queue.length?' 待'+sim.seats[id].queue.length:'')).join('　');
}
function go(id,s){const ok=sim.request(id,s);show(ok?label(id)+' → '+sim.comp.spots.get(s).name:'経路が見つかりません。席の予約は行いません');draw();}
function refreshAuto(){for(const id of ['hamster','penguin']){let b=$('auto-'+id);b.textContent=label(id)+'自動：'+(sim.actors[id].auto?'ON':'OFF')}$('autowalk').textContent='2匹自動散歩：'+(Object.values(sim.actors).every(a=>a.auto)?'ON':'OFF')}
for(const b of document.querySelectorAll('[data-actor]'))b.addEventListener('click',()=>{chosen=b.dataset.actor;for(const x of document.querySelectorAll('[data-actor]'))x.classList.toggle('selected',x===b);show(label(chosen)+'を選択')});
for(const b of document.querySelectorAll('[data-spot]'))b.addEventListener('click',()=>go(chosen,b.dataset.spot));
for(const id of ['hamster','penguin'])$('auto-'+id).addEventListener('click',()=>{sim.setAuto(id,!sim.actors[id].auto);refreshAuto();draw()});
$('autowalk').addEventListener('click',()=>{const on=!Object.values(sim.actors).every(a=>a.auto);for(const id of ['hamster','penguin'])sim.setAuto(id,on);refreshAuto();draw()});
function reset(){sim.reset();playing=true;last=null;refreshAuto();draw();show('リセットしました')}
$('life-demo').addEventListener('click',()=>{reset();go('hamster','desk');go('penguin','bed')});
$('queue-demo').addEventListener('click',()=>{reset();go('hamster','desk');go('penguin','desk')});
$('turnover-demo').addEventListener('click',()=>{const id=sim.seats.desk.occupants[0];if(id)go(id,'rug')});
$('same-sofa').addEventListener('click',()=>{reset();go('hamster','sofa');go('penguin','sofa')});
$('free-seat').addEventListener('click',()=>{const id=sim.seats.sofa.occupants[0];if(id)go(id,'rug')});
$('pausewalk').addEventListener('click',e=>{playing=!playing;e.currentTarget.textContent=playing?'一時停止':'再開';last=null});
$('slowwalk').addEventListener('click',e=>{rate=rate===1?.5:1;e.currentTarget.textContent=rate===1?'0.5倍速':'通常速度'});
$('guides-btn').addEventListener('click',e=>{guides.classList.toggle('is-hidden');e.currentTarget.textContent=guides.classList.contains('is-hidden')?'動線：OFF':'動線：ON'});
$('night-btn').addEventListener('click',e=>{stage.classList.toggle('is-night');e.currentTarget.textContent=stage.classList.contains('is-night')?'昼にする':'夜にする'});
$('reset-btn').addEventListener('click',reset);
for(const b of document.querySelectorAll('[data-toggle]'))b.addEventListener('click',()=>{const img=document.querySelector('[data-furniture-image="'+b.dataset.toggle+'"]');if(!img)return;const off=img.style.display!=='none';img.style.display=off?'none':'';b.textContent=b.textContent.split(':')[0]+': '+(off?'OFF':'ON')});
let lastEv=0;function updateEvents(){if(sim.events.length>lastEv){const entries=sim.events.slice(lastEv);for(const e of entries)if(['activity-start','activity-end','queued','reserved','unreachable','queue-route-failed'].includes(e.type))logLine(label(e.id)+'：'+e.type+(e.spotId?' / '+sim.comp.spots.get(e.spotId)?.name:''));lastEv=sim.events.length}if(lastEv>sim.events.length)lastEv=0}
function tick(t){if(last===null)last=t;let dt=Math.min(.05,(t-last)/1000)*rate;last=t;if(playing){sim.step(dt);updateEvents();draw()}requestAnimationFrame(tick)}
document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;$('pausewalk').textContent='再開'}last=null});
paintGuides();drawFurniture();refreshAuto();draw();window.__H55__={get:()=>sim.snapshot(),go:(id,sp)=>{go(id,sp);return sim.actors[id].mode},advance:(sec)=>{sim.advance(sec);updateEvents();draw();return sim.snapshot()},reset,verify:()=>sim.verify(),scene};requestAnimationFrame(tick);
}
