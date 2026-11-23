// D-5 gesture preview. Independent from travel, reservation and face state.
export const D5_ACTIONS=Object.freeze({pc_work:'none',relax:'breathe',sleep:'breathe',greet:'wave',read_news:'tilt'});
export class PenguinGestureController {
 constructor(){this.reset()}
 reset(){this.enabled=true;this.base='none';this.effect=null;this.clock=0;this.lastAction=null}
 setEnabled(on){this.enabled=!!on;if(!this.enabled){this.base='none';this.effect=null}}
 trigger(kind,actor,duration){
   if(!['wave','tilt','breathe'].includes(kind))throw Error('Invalid gesture');
   if(actor?.mode==='travel')return false;
   const d=duration??({wave:1.2,tilt:1.4,breathe:2.4}[kind]);
   if(!Number.isFinite(d)||d<=0)throw RangeError('Invalid duration');
   this.effect={kind,remaining:d,elapsed:0,manual:true};return true;
 }
 activityEvent(ev,sim){
   if(!this.enabled||ev.id!=='penguin'||ev.type!=='activity-start')return;
   const spot=sim.comp.spots.get(ev.spotId);if(!spot)return;
   this.lastAction=spot.action;
   const kind=D5_ACTIONS[spot.action]||'none';
   this.base=kind==='breathe'?'breathe':'none';
   if((kind==='wave'||kind==='tilt')&&!this.effect)this.effect={kind,remaining:kind==='wave'?1.2:1.4,elapsed:0,manual:false};
 }
 syncActor(actor){
   if(actor.mode==='travel'||actor.mode==='waiting'){
     this.base='none';this.effect=null;return;
   }
   if(actor.mode==='idle'){
     this.base='none';if(this.effect&&!this.effect.manual)this.effect=null;return;
   }
   if(actor.mode==='acting'||actor.mode==='at'){
     if(actor.spot==='bed'||actor.spot==='sofa')this.base='breathe';
     else if(this.base==='breathe')this.base='none';
   }
 }
 step(dt){
   if(!Number.isFinite(dt)||dt<0)throw RangeError('Invalid dt');
   this.clock+=dt;
   if(this.effect){this.effect.elapsed+=dt;this.effect.remaining-=dt;if(this.effect.remaining<=0)this.effect=null}
 }
 snapshot(actor){
   const travel=actor.mode==='travel';
   const kind=!this.enabled||travel?'none':this.effect?.kind||this.base;
   const t=this.effect?.elapsed||this.clock;
   const span=this.effect?.elapsed/(this.effect?.elapsed+this.effect?.remaining||1)||0;
   const tilt=kind==='tilt'?3*Math.sin(Math.PI*Math.min(1,span)):
    kind==='wave'?0.7*Math.sin(t*4*Math.PI):0;
   const breathe=kind==='breathe'?Math.sin(this.clock*2.1):0;
   const wingRaised=kind==='wave'&&Math.sin(t*4*Math.PI)>.25;
   return {kind,wingRaised,roll:tilt,vertical:kind==='breathe'?-0.35*breathe:0,scaleY:kind==='breathe'?1+0.004*breathe:1,manual:!!this.effect?.manual,remaining:this.effect?Math.max(0,this.effect.remaining):null,clock:this.clock,enabled:this.enabled};
 }
}
