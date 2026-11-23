// H5.6 native-UI derivative adapter; simulation in core.mjs stays DOM independent.
import {DollhouseSimulation} from './core.mjs';
import {createHamsterFaceRig} from './face-engine.mjs';
import {createLifeFaceController} from './life-face-controller.mjs';
import {createPoseController,determineHamsterPose,determinePenguinPose} from './pose-controller.mjs';
import {PenguinFaceController} from './penguin-face.mjs';
import {PenguinGestureController} from './penguin-gesture.mjs';
import {DuoReactionController} from './duo-reaction.mjs';
import {NearbyNewsController} from './nearby-news.mjs';
export function launch(scene){
const sim=new DollhouseSimulation(scene),W=scene.canvas.width,H=scene.canvas.height;
const $=id=>document.getElementById(id), stage=$('stage'), guides=$('guides');let chosen='hamster',playing=true,rate=1,last=null;
const actorEls={hamster:$('actor-hamster'),penguin:$('actor-penguin')}, shadow={hamster:$('hamster-shadow'),penguin:$('penguin-shadow')};
let penguinWidth=119;actorEls.penguin.style.width=(penguinWidth/W*100)+'%';
const symbols={hamster:$('symbol-hamster'),penguin:$('symbol-penguin')},atlas=$('feet-atlas'),puppet=$('hamster-puppet'),near=$('arm-near'),far=$('arm-far');
const st=$('status'),actorStatus=$('actor-status'),log=$('life-log');
const penguinGesture=new PenguinGestureController();
const duo=new DuoReactionController();const news=new NearbyNewsController();let newsAppliedSerial=0;let duoAppliedSerial=0;let jointPenguinOverlay=null;let jointWaveRef=null;let penguinUserPriority=false;const duoVisual={hamster:0,penguin:0};
const penguinFace=new PenguinFaceController(),penguinImg=$('penguin-sprite'),penguinEmotion=$('penguin-emotion');let penguinLastFrame='',penguinSrcChanges=0;
const penguinRearImgs=[$('penguin-rear-view'),$('penguin-rear-view-left')];for(const r of penguinRearImgs)r.style.transformOrigin='50% 92%';
const b3Face=createHamsterFaceRig({layer:$('b3-face-layer'),frontLayer:$('b3-front-face-layer'),symbol:$('b3-emotion'),status:$('b3-face-status')});
const pose=createPoseController(),poseShell=$('hamster-orientation');
const penguinPose=createPoseController(),penguinPoseShell=$('penguin-orientation');
const lifeFace=createLifeFaceController({rig:b3Face,simulation:sim,onState:(data)=>{const el=$('b3-life-status');if(el)el.textContent='生活連動：'+(data.enabled?'ON':'OFF')+'｜'+(data.manual?'手動優先':data.ambient?'睡眠連動':data.action?'前回 '+data.action:'待機')}});
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
function drawFurniture(){for(const f of scene.furniture){const img=document.querySelector('[data-furniture-image="'+f.id+'"]');if(!img||!f.render)continue;img.style.width=(f.render.width/W*100)+'%';img.style.height=(f.render.height/H*100)+'%';img.style.left=((f.position.x-f.render.width/2)/W*100)+'%';img.style.top=((f.position.y-f.render.height)/H*100)+'%';const depth=f.render.layer==='floor'?0:f.render.layer==='wall'?130:(f.occlusion?.mode==='foreground-slice'?f.occlusion.baseDepthY:Math.round(f.position.y));img.style.zIndex=String(depth);
 const front=document.querySelector('[data-foreground-of="'+f.id+'"]');if(front){front.style.width=img.style.width;front.style.height=img.style.height;front.style.left=img.style.left;front.style.top=img.style.top;front.style.zIndex=String(f.occlusion.frontDepthY);front.style.display=img.style.display;}}
 for(const btn of document.querySelectorAll('button.spot')){const s=sim.comp.spots.get(btn.dataset.spot);if(s){btn.style.left=(s.x/W*100)+'%';btn.style.top=(s.y/H*100)+'%';btn.style.zIndex=900;}}
}
// Visual-only separation at the rug. The simulated actor positions and reservations are unchanged.
function stepDuoVisual(dt){const both=duo.isTogether(sim),k=1-Math.exp(-dt/.16);for(const id of ['hamster','penguin'])duoVisual[id]+=((both?(id==='hamster'?-31:31):0)-duoVisual[id])*k;}
function draw(){for(const [id,a]of Object.entries(sim.actors)){const el=actorEls[id],sc=scale(a.y),walking=a.mode==='travel',screenX=a.x+duoVisual[id];el.style.left=(screenX/W*100)+'%';el.style.top=(a.y/H*100)+'%';el.style.transform=`translate(-50%,-96%) scale(${sc})`;el.style.zIndex=String(Math.round(a.y)+1);
 shadow[id].style.left=(screenX/W*100)+'%';shadow[id].style.top=(a.y/H*100)+'%';shadow[id].style.transform=`translate(-50%,-50%) scale(${sc})`;shadow[id].style.zIndex=String(Math.round(a.y));
 const sym=symbols[id];if(a.mode==='acting'&&a.spot){const sp=sim.comp.spots.get(a.spot),act=scene.activities[sp.action];sym.classList.add('on');sym.textContent=act.icon;sym.style.left=(screenX/W*100)+'%';sym.style.top=((a.y-115*sc)/H*100)+'%';if((id==='hamster'&&b3Face.snapshot().expression!=='normal')||(id==='penguin'&&penguinFace.current!=='normal'))sym.classList.remove('on');}else sym.classList.remove('on');
 if(id==='hamster'){
   const want=determineHamsterPose(a,sim.comp.spots);pose.setDesired(want);const p=pose.snapshot();
   poseShell.classList.toggle('is-front',p.view==='front');poseShell.classList.toggle('is-rear',p.view==='rear');
   poseShell.style.transform=`translateY(${p.lift}px) rotate(${p.tilt}deg) scaleX(${p.squeeze})`;
   poseShell.style.opacity=String(p.alpha);
   const k=Math.sin(a.walkClock*12/8*Math.PI*2);
   puppet.style.transform=`scaleX(${p.direction}) translateY(${walking?-Math.abs(k)*1.1:0}px) rotate(${walking?k*.6:0}deg)`;
   near.style.transform=`rotate(${walking?k*9:0}deg)`;far.style.transform=`rotate(${walking?-k*9:0}deg)`;
   let n=walking?Math.floor(a.walkClock*12)%8:0;atlas.style.backgroundPosition=(100*(n%4)/3)+'% '+(100*Math.floor(n/4))+'%';
   $('b3-pose-status').textContent='姿勢：'+(p.view==='front'?'正面':p.view==='rear'?'斜め背面':'3/4')+(p.transition?'（切替中）':'')+'｜'+p.reason;
  }
 else{const pgWanted=determinePenguinPose(a,sim.comp.spots);penguinPose.setDesired(pgWanted);const pgPose=penguinPose.snapshot();
  penguinPoseShell.classList.toggle('is-rear',pgPose.view==='rear');
  penguinPoseShell.classList.toggle('dir-left',pgPose.direction===-1);
  penguinPoseShell.classList.toggle('dir-right',pgPose.direction!==-1);
  penguinPoseShell.style.transform=`translateY(${pgPose.lift}px) rotate(${pgPose.tilt}deg) scaleX(${pgPose.squeeze})`;penguinPoseShell.style.opacity=String(pgPose.alpha);
  const pgst=$('penguin-pose-status');if(pgst)pgst.textContent='姿勢：'+(pgPose.view==='rear'?'斜め背面・'+(pgPose.direction===-1?'左':'右'):'3/4')+(pgPose.transition?'（切替中）':'')+'｜'+pgPose.reason;
  const f=penguinFace.frame(a),gest=penguinGesture.snapshot(a);const wing=gest.wingRaised&&f.pose==='F0'?'_wing':'';const file='assets/penguin_'+f.pose+'_'+f.expression+(f.blink?'_blink':'')+wing+'_v3.png';if(penguinLastFrame!==file){penguinImg.setAttribute('src',file);penguinLastFrame=file;penguinSrcChanges++}const k=Math.sin(a.walkClock/1.2*Math.PI*4);penguinImg.style.transform=`scaleX(${a.face}) translateY(${walking?-Math.abs(k)*1.0:gest.vertical}px) rotate(${walking?k*2.2:gest.roll}deg) scaleY(${gest.scaleY})`;for(const r of penguinRearImgs)r.style.transform=`translateY(${gest.vertical}px) rotate(${gest.roll}deg) scaleY(${gest.scaleY})`;penguinEmotion.textContent=f.symbol;penguinEmotion.classList.toggle('on',!!f.symbol);penguinEmotion.style.left=(screenX/W*100)+'%';penguinEmotion.style.top=((a.y-140*sc)/H*100)+'%';const pf=$('penguin-face-status');if(pf)pf.textContent='ペンギン：'+f.expression+'／'+f.pose+(f.blink?'／まばたき':'')+(penguinFace.overlay?'｜残り'+Math.max(0,penguinFace.overlay.remaining).toFixed(1)+'秒':'');for(const b of document.querySelectorAll('[data-penguin-face]'))b.classList.toggle('selected',b.dataset.penguinFace===f.expression);const gst=$('penguin-gesture-status');if(gst)gst.textContent='仕草：'+gest.kind+(gest.manual?'（手動）':'')+(gest.remaining!==null?'｜残り'+gest.remaining.toFixed(1)+'秒':'');}

 }
 const ha=sim.actors.hamster,hs=scale(ha.y),emotion=$('b3-emotion');emotion.style.left=((ha.x+duoVisual.hamster)/W*100)+'%';emotion.style.top=((ha.y-120*hs)/H*100)+'%';b3Face.render();for(const bt of document.querySelectorAll('[data-b3-face]'))bt.classList.toggle('selected',bt.dataset.b3Face===b3Face.snapshot().expression);
 const duoState=duo.snapshot(sim),newsState=news.snapshot(sim);const ns=$('news-status');if(ns)ns.textContent='ニュース共有：'+(newsState.active?newsState.active.phaseLabel+'（残り'+newsState.active.remaining.toFixed(1)+'秒）':newsState.nearby?'窓辺・デスクに待機':'条件待ち')+'｜自動：'+(newsState.enabled?'ON':'OFF');const jointStatus=$('duo-status'),jointMark=$('duo-mark');if(jointStatus)jointStatus.textContent='共同演出：'+(duoState.active?duoState.active.label+'／'+duoState.active.phaseLabel+'（残り'+duoState.active.remaining.toFixed(1)+'秒）':duoState.together?'2匹がラグで待機中':'待機')+'｜自動：'+(duoState.enabled?'ON':'OFF');if(jointMark){const shared=duoState.active||newsState.active;jointMark.textContent=shared?'2匹の'+shared.label+' '+shared.symbol:'';jointMark.classList.toggle('on',Boolean(shared))};
 actorStatus.textContent=Object.entries(sim.actors).map(([id,a])=>label(id)+'：'+({idle:'待機',travel:'移動中',waiting:'空席待ち',acting:'行動中',at:'くつろぎ中'}[a.mode])+(a.target?' ('+sim.comp.spots.get(a.target).name+')':'')).join('\n')+'\n'+[...sim.comp.spots].map(([id,s])=>s.name+': '+sim.seats[id].occupants.length+'/'+s.capacity+(sim.seats[id].queue.length?' 待'+sim.seats[id].queue.length:'')).join('　');
}

function cancelJoint(reason='manual'){
 const d=duo.cancel(reason),n=news.cancel(reason);
 if(d||n)clearDuoFaces();
 return d||n;
}
function clearDuoFaces(){
 // Clear ONLY overlays created by joint controls, not user-triggered expressions or wing gestures.
 if(['duo','nearby'].includes(b3Face.snapshot().origin))b3Face.setExpression('normal',{origin:'idle'});
 if(jointPenguinOverlay&&penguinFace.overlay===jointPenguinOverlay){penguinFace.overlay=null;penguinFace.syncActor(sim.actors.penguin)}
 if(jointWaveRef&&penguinGesture.effect===jointWaveRef)penguinGesture.effect=null;
 jointPenguinOverlay=null;jointWaveRef=null;duoAppliedSerial=0;newsAppliedSerial=0;
}
function manualHamster(name){cancelJoint('hamster-manual');const ok=lifeFace.manualExpression(name);draw();return ok}
function manualPenguin(name){cancelJoint('penguin-manual');penguinUserPriority=true;const ok=penguinFace.trigger(name);draw();return ok}
function applyDuo(){
 const st=duo.snapshot(sim);if(!st.active||duoAppliedSerial===st.serial)return;
 const f=st.active;b3Face.setExpression(f.hamster,{holdSeconds:f.duration,origin:'duo'});
 penguinFace.trigger(f.penguin,f.duration);jointPenguinOverlay=penguinFace.overlay;
 if(f.kind==='greet'){penguinGesture.trigger('wave',sim.actors.penguin,Math.min(1.2,f.duration));jointWaveRef=penguinGesture.effect;}
 duoAppliedSerial=st.serial;
}
function applyNews(){
 const st=news.snapshot(sim);if(!st.active||newsAppliedSerial===st.serial)return;
 const f=st.active;b3Face.setExpression(f.hamster,{holdSeconds:f.duration,origin:'nearby'});
 penguinFace.trigger(f.penguin,f.duration);jointPenguinOverlay=penguinFace.overlay;newsAppliedSerial=st.serial;
}
function triggerNews(){
 if(!news.isNearby(sim)){show('デスクと窓辺に1匹ずつ到着後、ニュース共有できます');draw();return false}
 if(news.start(sim,{manual:true})){if(duo.cancel('news-manual'))clearDuoFaces();applyNews();draw();return true}return false;
}
function triggerDuo(kind){
 if(!duo.isTogether(sim)){show('2匹がラグに到着してから共同演出を開始できます');draw();return false}
 if(duo.begin(kind,sim,{manual:true})){applyDuo();draw();return true}return false;
}
function go(id,s){const ok=sim.request(id,s);if(id==='hamster')lifeFace.syncActor();if(id==='penguin'){penguinFace.syncActor(sim.actors.penguin);penguinGesture.syncActor(sim.actors.penguin);}const change=duo.sync(sim),newsChange=news.sync(sim,{blocked:!!duo.active||lifeFace.snapshot().manual||penguinUserPriority});if(change.canceled||newsChange.canceled)clearDuoFaces();if(newsChange.started)applyNews();show(ok?label(id)+' → '+sim.comp.spots.get(s).name:'経路が見つかりません。席の予約は行いません');draw();}
function refreshAuto(){for(const id of ['hamster','penguin']){let b=$('auto-'+id);b.textContent=label(id)+'自動：'+(sim.actors[id].auto?'ON':'OFF')}$('autowalk').textContent='2匹自動散歩：'+(Object.values(sim.actors).every(a=>a.auto)?'ON':'OFF')}
for(const b of document.querySelectorAll('[data-actor]'))b.addEventListener('click',()=>{chosen=b.dataset.actor;for(const x of document.querySelectorAll('[data-actor]'))x.classList.toggle('selected',x===b);show(label(chosen)+'を選択')});
for(const b of document.querySelectorAll('[data-spot]'))b.addEventListener('click',()=>go(chosen,b.dataset.spot));
for(const id of ['hamster','penguin'])$('auto-'+id).addEventListener('click',()=>{sim.setAuto(id,!sim.actors[id].auto);refreshAuto();draw()});
$('autowalk').addEventListener('click',()=>{const on=!Object.values(sim.actors).every(a=>a.auto);for(const id of ['hamster','penguin'])sim.setAuto(id,on);refreshAuto();draw()});
function reset(){sim.reset();lifeFace.reset();pose.reset();penguinPose.reset();penguinFace.reset();penguinGesture.reset();duo.reset();news.reset();duoAppliedSerial=0;newsAppliedSerial=0;jointPenguinOverlay=null;jointWaveRef=null;penguinUserPriority=false;duoVisual.hamster=0;duoVisual.penguin=0;penguinLastFrame='';$('penguin-life-toggle').textContent='ペンギン生活連動：ON';$('penguin-life-status').textContent='生活表情連動：ON';lastProcessedEvent=null;playing=true;last=null;refreshAuto();draw();show('リセットしました')}
$('duo-gather').addEventListener('click',()=>{reset();go('hamster','rug');go('penguin','rug');show('2匹が通常の経路を使ってラグへ向かいます')});
$('duo-greet').addEventListener('click',()=>triggerDuo('greet'));
$('duo-surprise').addEventListener('click',()=>triggerDuo('surprise'));
$('duo-chat').addEventListener('click',()=>triggerDuo('chat'));
$('news-gather').addEventListener('click',()=>{reset();go('hamster','desk');go('penguin','window');show('ハムスターはデスク、ペンギンは窓辺に向かいます')});
$('news-trigger').addEventListener('click',triggerNews);
$('news-auto-toggle').addEventListener('click',e=>{news.setEnabled(!news.enabled);e.currentTarget.textContent='自動ニュース共有：'+(news.enabled?'ON':'OFF');draw()});
$('duo-auto-toggle').addEventListener('click',e=>{duo.setEnabled(!duo.enabled);e.currentTarget.textContent='到着時の共同挨拶：'+(duo.enabled?'ON':'OFF');draw()});
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
for(const b of document.querySelectorAll('[data-toggle]'))b.addEventListener('click',()=>{const img=document.querySelector('[data-furniture-image="'+b.dataset.toggle+'"]');if(!img)return;const off=img.style.display!=='none';img.style.display=off?'none':'';const front=document.querySelector('[data-foreground-of="'+b.dataset.toggle+'"]');if(front)front.style.display=img.style.display;b.textContent=b.textContent.split(':')[0]+': '+(off?'OFF':'ON')});
for(const b of document.querySelectorAll('[data-b3-face]'))b.addEventListener('click',()=>{manualHamster(b.dataset.b3Face);for(const z of document.querySelectorAll('[data-b3-face]'))z.classList.toggle('selected',z===b);draw()});
for(const b of document.querySelectorAll('[data-penguin-face]'))b.addEventListener('click',()=>{manualPenguin(b.dataset.penguinFace);draw()});
for(const b of document.querySelectorAll('[data-penguin-gesture]'))b.addEventListener('click',()=>{cancelJoint('gesture-manual');const kind=b.dataset.penguinGesture;if(kind==='none'){penguinGesture.effect=null;penguinGesture.base='none'}else{penguinGesture.trigger(kind,sim.actors.penguin)}draw()});
$('penguin-gesture-toggle').addEventListener('click',e=>{penguinGesture.setEnabled(!penguinGesture.enabled);e.currentTarget.textContent='生活仕草連動：'+(penguinGesture.enabled?'ON':'OFF');draw()});
for(const b of document.querySelectorAll('[data-penguin-width]'))b.addEventListener('click',()=>{penguinWidth=Number(b.dataset.penguinWidth);actorEls.penguin.style.width=(penguinWidth/W*100)+'%';for(const z of document.querySelectorAll('[data-penguin-width]'))z.classList.toggle('selected',z===b);draw()});
$('penguin-life-toggle').addEventListener('click',e=>{const newState=!penguinFace.enabled;penguinFace.setEnabled(newState);penguinFace.syncActor(sim.actors.penguin);e.currentTarget.textContent='ペンギン生活連動：'+(newState?'ON':'OFF');$('penguin-life-status').textContent='生活表情連動：'+(newState?'ON':'OFF');draw()});
$('penguin-life-resume').addEventListener('click',()=>{penguinFace.overlay=null;penguinFace.syncActor(sim.actors.penguin);draw()});
let lastProcessedEvent=null;
function updateEvents(){
  let newEvents=[];
  if(sim.events.length){
    const i=lastProcessedEvent?sim.events.indexOf(lastProcessedEvent):-1;
    newEvents=i>=0?sim.events.slice(i+1):(lastProcessedEvent?sim.events.slice(-1):sim.events.slice());
    lastProcessedEvent=sim.events[sim.events.length-1];
  }
  for(const ev of newEvents){
     if(ev.type==='activity-start'){lifeFace.activityEvent(ev);penguinFace.activityEvent(ev,sim);penguinGesture.activityEvent(ev,sim);}
     if(['activity-start','activity-end','queued','reserved','unreachable','queue-route-failed'].includes(ev.type))logLine(label(ev.id)+'：'+ev.type+(ev.spotId?' / '+sim.comp.spots.get(ev.spotId)?.name:''));
  }
  lifeFace.syncActor();penguinFace.syncActor(sim.actors.penguin);penguinGesture.syncActor(sim.actors.penguin);
  if(penguinUserPriority&&!penguinFace.overlay)penguinUserPriority=false;const jointChange=duo.sync(sim);if(jointChange.canceled)clearDuoFaces();if(jointChange.started){if(lifeFace.snapshot().manual||penguinUserPriority)duo.cancel('manual-priority');else applyDuo();}
  if(duo.active&&duo.serial!==duoAppliedSerial)applyDuo();
  const newsChange=news.sync(sim,{blocked:!!duo.active||lifeFace.snapshot().manual||penguinUserPriority});if(newsChange.canceled)clearDuoFaces();if(newsChange.started||news.active&&news.serial!==newsAppliedSerial)applyNews();
}
function advanceBoth(sec){if(!Number.isFinite(sec)||sec<0)throw new RangeError('advance seconds');const n=Math.max(1,Math.ceil(sec/.04)),dt=sec/n;for(let i=0;i<n;i++){sim.step(dt);penguinPose.setDesired(determinePenguinPose(sim.actors.penguin,sim.comp.spots));b3Face.step(dt);pose.step(dt);penguinPose.step(dt);penguinFace.step(dt);penguinGesture.step(dt);duo.step(dt);news.step(dt);updateEvents();stepDuoVisual(dt)}draw();return sim.snapshot()}
function tick(t){if(last===null)last=t;let dt=Math.min(.05,(t-last)/1000)*rate;last=t;if(playing){sim.step(dt);penguinPose.setDesired(determinePenguinPose(sim.actors.penguin,sim.comp.spots));b3Face.step(dt);pose.step(dt);penguinPose.step(dt);penguinFace.step(dt);penguinGesture.step(dt);duo.step(dt);news.step(dt);updateEvents();stepDuoVisual(dt);draw()}requestAnimationFrame(tick)}
$('b3-life-toggle').addEventListener('click',e=>{const enabled=!lifeFace.snapshot().enabled;lifeFace.setEnabled(enabled);e.currentTarget.textContent='生活表情連動：'+(enabled?'ON':'OFF');draw()});
$('b3-life-resume').addEventListener('click',()=>{lifeFace.resumeAuto();draw()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;$('pausewalk').textContent='再開'}last=null});
paintGuides();drawFurniture();refreshAuto();draw();window.__H55__={get:()=>sim.snapshot(),go:(id,sp)=>{go(id,sp);return sim.actors[id].mode},advance:advanceBoth,reset,verify:()=>sim.verify(),scene};window.__DE_TRIAL__={
   duo:()=>duo.snapshot(sim),news:()=>news.snapshot(sim),face:()=>b3Face.snapshot(),
   penguinFace:()=>penguinFace.snapshot(sim.actors.penguin),penguinGesture:()=>penguinGesture.snapshot(sim.actors.penguin),
   pose:()=>pose.snapshot(),penguinPose:()=>penguinPose.snapshot(),triggerDuo,triggerNews,manualHamster,manualPenguin,
   gatherRug:()=>{reset();go('hamster','rug');go('penguin','rug');return sim.snapshot()},
   gatherNews:()=>{reset();go('hamster','desk');go('penguin','window');return sim.snapshot()},
   advance:advanceBoth,go,reset,version:'H56-native-UI-DE-unpublished'
 };requestAnimationFrame(tick);
}