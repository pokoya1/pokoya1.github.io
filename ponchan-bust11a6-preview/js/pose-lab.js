"use strict";
// BUST-11a-1: deterministic inspection; no changes to production renderer or assets.
const PoseLab = (()=>{
 const clamp=(x)=>Math.max(0,Math.min(1,x));
 const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
 function resolve(m,costume,gesture,progress){
  if(!Number.isFinite(progress)) throw Error('invalid progress');
  const cfg=m.gestureTransition, end=m.gestures.poses[gesture], seq=cfg.sequences[costume]?.[gesture];
  if(!seq||!end) throw Error('unknown gesture/costume');
  const u=clamp(progress), k=Math.round(u*cfg.steps), q=u*cfg.steps, j=Math.floor(q), neutral=cfg.neutralAnchors;
  const anchors=[neutral,...seq.samples,end];
  const a=anchors[j], b=anchors[Math.min(j+1,cfg.steps)];
  const body={shoulder:[...end.shoulder],elbow:mix(a.elbow,b.elbow,q-j),wrist:mix(a.wrist,b.wrist,q-j)};
  const shown=anchors[k];
  return {progress:u,k,body,shown:{shoulder:[...end.shoulder],elbow:[...shown.elbow],wrist:[...shown.wrist]}, clothing:{combined:k>0&&k<cfg.steps?seq.frames[k-1]:null,sleeve:k===cfg.steps?end.costumes[costume]:null},hand:{slot:k===cfg.steps?end.hand:null,angle:0},end:k===cfg.steps?end:null};
 }
 function apply(renderer,m,costume,pose,angle=0){
  renderer.costume=m.costumes.sets[costume];renderer.transitionFrame=pose.clothing.combined;renderer.gesturePose=pose.end;renderer.gestureAngle=pose.end?angle:0;
 }
 function ready(m,images){return m.layers.every((l,i)=>l.runtimeExcluded||!!images[i]);}
 return {resolve,apply,ready};
})();
window.PoseLab=PoseLab;
