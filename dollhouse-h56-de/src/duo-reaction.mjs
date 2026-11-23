// E-2: additive cooperative choreography; simulation, seating and paths are read-only.
export const E1_REACTIONS=Object.freeze({
 greet:{expression:'happy',seconds:2.5,label:'共同挨拶',symbol:'♥'},
 surprise:{expression:'surprise',seconds:1.6,label:'一緒に驚く',symbol:'‼'},
 chat:{expression:'happy',seconds:2.4,label:'会話風リアクション',symbol:'♪',phases:[
  {label:'ハムスターから',seconds:0.8,hamster:'happy',penguin:'normal',symbol:'♪'},
  {label:'ペンギンが応答',seconds:0.8,hamster:'normal',penguin:'happy',symbol:'♪'},
  {label:'一緒に喜ぶ',seconds:0.8,hamster:'happy',penguin:'happy',symbol:'♥'},
 ]},
});
export const E2_AUTO_COOLDOWN_SECONDS=6;
export class DuoReactionController {
 constructor(){this.reset()}
 reset(){this.enabled=true;this.active=null;this.togetherLatch=false;this.serial=0;this.reason='reset';this.cooldownRemaining=0;this.startedCount=0}
 isTogether(sim){
  const a=sim.actors.hamster,b=sim.actors.penguin;
  return !!(a&&b&&['acting','at'].includes(a.mode)&&['acting','at'].includes(b.mode)&&a.spot==='rug'&&b.spot==='rug'&&a.reserved==='rug'&&b.reserved==='rug');
 }
 setEnabled(v){this.enabled=Boolean(v);return this.enabled}
 begin(kind,sim,{manual=false}={}){
  if(!Object.hasOwn(E1_REACTIONS,kind))throw Error('Invalid duo reaction');
  if(!this.isTogether(sim))return false;
  if(!manual&&(this.cooldownRemaining>0||this.togetherLatch))return false;
  const p=E1_REACTIONS[kind];
  this.active={kind,expression:p.expression,label:p.label,symbol:p.symbol,remaining:p.phases?p.phases[0].seconds:p.seconds,duration:p.phases?p.phases[0].seconds:p.seconds,totalDuration:p.seconds,manual,phase:0,phaseLabel:p.phases?p.phases[0].label:p.label,
  hamster:p.phases?p.phases[0].hamster:p.expression,penguin:p.phases?p.phases[0].penguin:p.expression};
  this.serial++;this.startedCount++;this.togetherLatch=true;
  this.cooldownRemaining=E2_AUTO_COOLDOWN_SECONDS;this.reason='started';return true;
 }
 sync(sim){
  const together=this.isTogether(sim);
  if(!together){const canceled=!!this.active;this.active=null;this.togetherLatch=false;this.reason='not-together';return {started:false,canceled}}
  if(this.enabled&&!this.togetherLatch&&!this.active&&this.cooldownRemaining<=0){
   const started=this.begin('greet',sim);return {started,canceled:false};
  }
  if(this.enabled&&(this.active||this.cooldownRemaining<=0))this.togetherLatch=true;
  return {started:false,canceled:false};
 }
 step(dt){
  if(!Number.isFinite(dt)||dt<0)throw RangeError('Invalid delta');
  this.cooldownRemaining=Math.max(0,this.cooldownRemaining-dt);
  if(!this.active)return false;
  this.active.remaining-=dt;
  while(this.active&&this.active.remaining<=0){
   const old=this.active;const phases=E1_REACTIONS[old.kind].phases;
   if(phases&&old.phase+1<phases.length){
    const over=-old.remaining,p=phases[old.phase+1];old.phase++;old.phaseLabel=p.label;old.hamster=p.hamster;old.penguin=p.penguin;old.symbol=p.symbol;old.remaining=p.seconds-over;old.duration=p.seconds;this.serial++;this.reason='phase';
   }else{this.active=null;this.reason='expired';return true}
  }
  return false;
 }
 cancel(reason='manual-override'){const had=!!this.active;this.active=null;this.reason=reason;return had}
 snapshot(sim){return {enabled:this.enabled,together:this.isTogether(sim),active:this.active?{...this.active}:null,latch:this.togetherLatch,serial:this.serial,reason:this.reason,cooldownRemaining:this.cooldownRemaining,startedCount:this.startedCount}}
}
