'use strict';
// Idle layer: inherits the 11a4 mixer, leaves renderer and parent source untouched.
class IdleMixer extends MotionMixer {
 reset(){super.reset();this.idleRng=seededRng((this.seed^0x9e3779b9)>>>0);this.idleWeight=1;this.breathCycle={at:0,dur:this.rand(3.5,5.8),amp:this.rand(.23,.42)};this.glance=null;this.nextGlance=this.rand(3.5,6.5);this.idleGaze=0;this.idleTilt=0;this.idleHair=0;this.manualUntil=0;this.blinkDue=this.rand(2.8,5.8);this.blinkRequestedAt=null;this.accessory={cords:0,ribbon:0,pendant:0};this.lastDrive={p:0,a:0,tilt:0,breath:0};this.stats={blinks:0,speechBlinks:0,glances:0,breaths:0,maxBlinkWait:0};}
 rand(a,b){return a+(b-a)*this.idleRng();}
 look(x,seconds=1.2){super.look(x,seconds);this.manualUntil=this.t+seconds;}
 blink(){super.blink();if(this.blinkRequestedAt===null)this.blinkRequestedAt=this.t;}
 speech(){const s=super.speech();if(!this.voice)return s;const u=((this.t-this.voice.at)/.31)%1;return {...s,mouth:s.mouth*smooth(u/.12)*smooth((.80-u)/.15)};}
 breath(){const c=this.breathCycle,u=clamp((this.t-c.at)/c.dur,0,1);return c.amp*Math.sin(2*Math.PI*u)*Math.sin(Math.PI*u)**2;}
 step(dt){if(!Number.isFinite(dt)||dt<0||dt>.1)throw Error('invalid dt');if(dt===0)return this.sample();const oldBlink=this.blinkAt;this.nextBlink=Infinity; if(this.t+dt>=this.blinkDue)this.blink();super.step(dt);
  const e=this.expr.base,sp=this.speech(),a=this.arm(),eligible=e.blink<.65;
  // After a short grace period, a quiet syllable boundary may host a blink even in longer speech.
  if(this.blinkPending&&this.blinkAt===null&&this.voice&&eligible&&this.blinkRequestedAt!==null&&this.t-this.blinkRequestedAt>=.65&&sp.weight*sp.mouth<.06){this.blinkAt=this.t;this.blinkPending=false;this.log('blink in speech gap');}
  if(this.blinkAt!==null&&this.blinkAt!==oldBlink){this.stats.blinks++;if(this.voice)this.stats.speechBlinks++;if(this.blinkRequestedAt!==null)this.stats.maxBlinkWait=Math.max(this.stats.maxBlinkWait,this.t-this.blinkRequestedAt);this.blinkRequestedAt=null;this.blinkDue=this.t+this.rand(2.8,6.2);}
  const quiet=!this.g&&!this.pending&&!this.voice&&this.t>=this.manualUntil&&Math.abs(this.gaze)<.03&&!this.expr.transitioning;
  const approach=(x,y,tau)=>y+(x-y)*Math.exp(-dt/tau);
  this.idleWeight=approach(this.idleWeight,quiet?1:0,quiet?.75:.19);
  if(this.t>=this.breathCycle.at+this.breathCycle.dur){this.breathCycle={at:this.breathCycle.at+this.breathCycle.dur,dur:this.rand(3.5,5.8),amp:this.rand(.23,.42)};this.stats.breaths++;}
  if(this.glance&&this.t>=this.glance.at+this.glance.dur){this.glance=null;this.nextGlance=this.t+this.rand(3,7);}
  if(!this.glance&&quiet&&this.t>=this.nextGlance){this.glance={at:this.t,dur:this.rand(1.1,2.1),amp:this.rand(.20,.48)*(this.rand(0,1)<.5?-1:1)};this.stats.glances++;this.log('idle glance');}
  let g=0;if(this.glance){const u=(this.t-this.glance.at)/this.glance.dur;g=this.glance.amp*smooth(u/.23)*smooth((1-u)/.35);}
  this.idleGaze=approach(this.idleGaze,g*this.idleWeight,.11);this.idleTilt=approach(this.idleTilt,this.idleGaze*.27,.32);this.idleHair=approach(this.idleHair,this.idleTilt*.38,.45);
  const breath=this.breath(),tilt=a.tilt+this.idleTilt;
  const d=this.lastDrive,travel=clamp((a.p-d.p)/dt/2.5,-1,1),wrist=clamp((a.angle-d.a)/dt/140,-1,1),head=clamp((tilt-d.tilt)/dt/2,-1,1),air=clamp((breath-d.breath)/dt,-.4,.4);this.lastDrive={p:a.p,a:a.angle,tilt,breath};
  const targets={cords:-1.5*travel+.27*wrist+.25*head+.52*air,ribbon:-1.75*travel+.23*wrist+.38*head+.68*air,pendant:-1.6*travel+.32*wrist+.48*head+.73*air};
  const taus={cords:.16,ribbon:.27,pendant:.20};for(const k of Object.keys(targets)){const lim=this.m.accessoryMotion.warps[k].limit;this.accessory[k]=approach(this.accessory[k],clamp(targets[k],-lim,lim),taus[k]);}
  return this.sample();
 }
 sample(){const s=super.sample();if(!this.breathCycle)return s;const a=this.arm(),voice=this.speech();s.params.breath=clamp(this.breath()*(1-.55*voice.weight)*(0.45+.55*this.idleWeight),-1,1);s.params.gaze=clamp(s.params.gaze+this.idleGaze,-1,1);s.params.tilt=clamp(s.params.tilt+this.idleTilt,-1,1);s.params.hair=clamp(s.params.hair+this.idleHair,-1,1);s.secondary={...s.secondary,body:clamp(s.secondary.body+this.idleTilt*.18,-.34,.34),...this.accessory};s.idleWeight=this.idleWeight;s.glance=!!this.glance;s.blinkDue=this.blinkDue;return s;}
}
window.IdleMixer=IdleMixer;
