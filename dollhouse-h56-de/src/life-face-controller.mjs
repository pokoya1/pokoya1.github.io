// B-3 v1.0: UI-independent policy. Does not modify the H5.6 simulation.
export const LIFE_TO_EXPRESSION=Object.freeze({pc_work:'normal',relax:'happy',sleep:'sleepy',greet:'happy',read_news:'surprise'});
export function createLifeFaceController({rig,simulation,onState=()=>{}}){
 let enabled=true,manual=false,ambient=null,lastAction=null,lastReport='';
 function report(){const s=snapshot();const digest=[s.enabled,s.manual,s.ambient,s.action,s.face.expression].join('|');if(digest!==lastReport){lastReport=digest;onState(s)}}
 function ambientUpdate(){if(!enabled||manual)return;rig.setExpression(ambient||'normal',{holdSeconds:ambient?Infinity:null,origin:ambient?'life-context':'idle'})}
 function manualExpression(name){if(!rig.setExpression(name,{origin:'manual'}))return false;manual=true;report();return true}
 function resumeAuto(){manual=false;ambientUpdate();report()}
 function activityEvent(ev){
   if(ev.id!=='hamster'||ev.type!=='activity-start')return;
   const sp=simulation.comp.spots.get(ev.spotId);if(!sp)return;
   const action=sp.action;lastAction=action;
   ambient=action==='sleep'?'sleepy':null;
   if(enabled&&!manual){rig.setExpression(LIFE_TO_EXPRESSION[action]||'normal',{holdSeconds:action==='sleep'?Infinity:null,origin:'life-event'})}
   report();
 }
 function syncActor(){
   const a=simulation.actors.hamster;
   // Long-lived sleeping context continues while at the bed; walking/retargeting clears it.
   if(ambient && (a.mode==='travel'||a.mode==='idle'||a.mode==='waiting'||a.spot!=='bed'&&a.mode==='at')){
      ambient=null;lastAction=null;
      if(enabled&&!manual)rig.setExpression('normal',{origin:'idle'});
   }
   // At the end of a manual timed reaction, restore the current life context.
   if(manual&&rig.snapshot().expression==='normal'&&rig.snapshot().origin==='idle'){
     manual=false;ambientUpdate();
   }
   report();
 }
 function reset(){enabled=true;manual=false;ambient=null;lastAction=null;rig.reset();report()}
 function setEnabled(v){enabled=Boolean(v);if(enabled&&!manual)ambientUpdate();report()}
 function snapshot(){return {enabled,manual,ambient,action:lastAction,face:rig.snapshot()}}
 report();
 return {activityEvent,syncActor,manualExpression,resumeAuto,setEnabled,reset,snapshot};
}
