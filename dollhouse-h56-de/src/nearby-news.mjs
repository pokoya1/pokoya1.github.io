// E-3: nearby, separate-spot news exchange; read-only simulation adapter.
// No seating, route, market feed or furniture mutation.
export const NEWS_SCENE=Object.freeze({label:'窓辺のニュース共有',seconds:2.3,triggerWindowSeconds:2.0,minDeskElapsedSeconds:2.22,cooldownSeconds:12});
export class NearbyNewsController{
 constructor(){this.reset()}
 reset(){this.enabled=true;this.active=null;this.latch=false;this.cooldownRemaining=0;this.serial=0;this.startedCount=0;this.reason='reset'}
 setEnabled(v){this.enabled=!!v;return this.enabled}
 participants(sim){
  const h=sim?.actors?.hamster,p=sim?.actors?.penguin;
  if(!h||!p)return null;
  const valid=a=>['acting','at'].includes(a.mode)&&a.spot===a.reserved;
  if(!valid(h)||!valid(p))return null;
  if(h.spot==='window'&&p.spot==='desk')return {window:'hamster',desk:'penguin',windowActor:h,deskActor:p};
  if(p.spot==='window'&&h.spot==='desk')return {window:'penguin',desk:'hamster',windowActor:p,deskActor:h};
  return null;
 }
 isNearby(sim){return !!this.participants(sim)}
 start(sim,{manual=false}={}){
  const pair=this.participants(sim);
  if(!pair||this.active)return false;
  if(!manual&&(!this.enabled||this.latch||this.cooldownRemaining>0||pair.windowActor.mode!=='acting'||pair.windowActor.activityElapsed>NEWS_SCENE.triggerWindowSeconds||(pair.deskActor.mode==='acting'&&pair.deskActor.activityElapsed<NEWS_SCENE.minDeskElapsedSeconds)))return false;
  const phases=[
   {label:'窓辺から話題',seconds:.8,hamster:pair.window==='hamster'?'surprise':'normal',penguin:pair.window==='penguin'?'surprise':'normal',symbol:'!'},
   {label:'デスクから返事',seconds:.8,hamster:pair.desk==='hamster'?'surprise':'normal',penguin:pair.desk==='penguin'?'surprise':'normal',symbol:'!!'},
   {label:'情報を共有',seconds:.7,hamster:'normal',penguin:'normal',symbol:'♪'}
  ];
  this.active={kind:'news',context:'desk-window',label:NEWS_SCENE.label,windowActor:pair.window,deskActor:pair.desk,phases,phase:0,phaseLabel:phases[0].label,hamster:phases[0].hamster,penguin:phases[0].penguin,symbol:phases[0].symbol,duration:phases[0].seconds,remaining:phases[0].seconds,totalDuration:NEWS_SCENE.seconds,manual};
  this.latch=true;this.cooldownRemaining=NEWS_SCENE.cooldownSeconds;this.serial++;this.startedCount++;this.reason='started';return true;
 }
 sync(sim,{blocked=false}={}){
  const pair=this.participants(sim);
  if(!pair){const canceled=this.cancel('not-nearby');this.latch=false;return {started:false,canceled}}
  if(this.active){
   if(this.active.windowActor!==pair.window){const canceled=this.cancel('positions-swapped');return {started:false,canceled}}
   return {started:false,canceled:false};
  }
  if(!blocked&&this.enabled&&!this.latch&&this.cooldownRemaining<=0){
   return {started:this.start(sim),canceled:false};
  }
  return {started:false,canceled:false};
 }
 step(dt){
  if(!Number.isFinite(dt)||dt<0)throw RangeError('Invalid dt');
  this.cooldownRemaining=Math.max(0,this.cooldownRemaining-dt);
  if(!this.active)return false;
  this.active.remaining-=dt;
  while(this.active&&this.active.remaining<=0){
   const a=this.active, next=a.phases[a.phase+1];
   if(!next){this.active=null;this.reason='expired';this.serial++;return true}
   const over=-a.remaining;
   a.phase++;a.phaseLabel=next.label;a.hamster=next.hamster;a.penguin=next.penguin;a.symbol=next.symbol;a.duration=next.seconds;a.remaining=next.seconds-over;this.serial++;this.reason='phase';
  }
  return false;
 }
 cancel(reason='manual-override'){const had=!!this.active;this.active=null;if(had)this.serial++;this.reason=reason;return had}
 snapshot(sim){return {enabled:this.enabled,nearby:this.isNearby(sim),active:this.active?{...this.active,phases:undefined}:null,latch:this.latch,cooldownRemaining:this.cooldownRemaining,serial:this.serial,reason:this.reason,startedCount:this.startedCount}}
}
