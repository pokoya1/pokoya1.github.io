// B-3 v1.3 view policy. Smooth turning squeeze with zero endpoint velocity. Does not change simulation actor.face or walkClock.
// 'north' means toward the back wall: a front-facing sprite is NOT a valid rear-view.
export function determineHamsterPose(a,spots){
 if(a.mode==='travel')return {view:'three',direction:a.face,reason:'歩行中'};
 if((a.mode==='acting'||a.mode==='at')&&a.spot){
  const spot=spots.get(a.spot);
  if(spot?.action==='greet')return {view:'front',direction:1,reason:'挨拶：正面'};
  if(spot?.face==='east')return {view:'three',direction:1,reason:'家具に向く：東'};
  if(spot?.face==='west')return {view:'three',direction:-1,reason:'家具に向く：西'};
  if(spot?.face==='north'){
   if(['pc_work','read_news'].includes(spot.action) && a.mode==='acting' && a.activityElapsed<2.0) return {view:'rear',direction:1,reason:'北向き：斜め後ろ（冒頭2秒）'};
   return {view:'three',direction:a.face,reason:'北向き：3/4へ戻る'};
  }
 }
 return {view:'three',direction:a.face,reason:a.mode==='waiting'?'待機':'通常待機'};
}
export function createPoseController({duration=.20}={}){
 if(!Number.isFinite(duration)||duration<=0)throw new RangeError('duration');
 let view='three',from='three',goal='three',elapsed=duration,lastDir=1,reason='通常待機';
 function setDesired(p){if(!['front','three','rear'].includes(p.view))throw Error('view');if(p.direction===-1||p.direction===1)lastDir=p.direction;
  reason=p.reason||'';if(goal!==p.view){from=view;goal=p.view;elapsed=0;}
 }
 function step(dt){if(!Number.isFinite(dt)||dt<0)throw new RangeError('dt');if(elapsed<duration){elapsed=Math.min(duration,elapsed+dt);if(elapsed>=duration/2)view=goal;}}
 function reset(){view='three';from='three';goal='three';elapsed=duration;lastDir=1;reason='通常待機'}
 function snapshot(){let x=elapsed/duration;const turn=elapsed>=duration?0:Math.sin(Math.PI*x);return {view,from,goal,transition:elapsed<duration,progress:elapsed>=duration?1:(1-Math.cos(Math.PI*x))/2,squeeze:1-.08*turn,lift:-2.5*turn,tilt:3*Math.sin(2*Math.PI*x),alpha:1-.18*turn,direction:lastDir,reason}}
 return {setDesired,step,reset,snapshot};
}
