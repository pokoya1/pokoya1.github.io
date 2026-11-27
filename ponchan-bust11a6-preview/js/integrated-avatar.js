'use strict';
// Opt-in adapter: original renderer, asset cache and single RAF loop; legacy path untouched.
class IntegratedAvatar extends PonchanAvatar {
  enableIntegrated(seed=42){
    if(!this.ready||this.destroyed||!PoseLab.ready(this.manifest,this.images)||!['hoodie','cardigan'].includes(this.costumeId))return false;
    if(this.mix)return true;
    super.reset(); this.mix=new IdleMixer(this.manifest,seed); this.mixRunning=true; this.mixAcc=0;this.last=0;this.mixTalk=false;this._fpsWindow=[];this.renderOnce();this.onStatus("11a6:integrated");return true;
  }
  disableIntegrated(){if(!this.mix)return false;this.mix=null;this.mixRunning=false;this.mixTalk=false;this.mixAcc=0;this.last=0;super.reset();this._fpsWindow=[];return true;}
  renderOnce(){if(!this.mix)return super.renderOnce();if(!this.ready||this.destroyed)return;const s=this.mix.sample();const r=this.renderer;PoseLab.apply(r,this.manifest,this.costumeId,PoseLab.resolve(this.manifest,this.costumeId,s.id,s.p),s.angle);this.state={...s.params};this.shape=s.shape;const secondary=this.secondaryEnabled?Object.fromEntries(Object.entries(s.secondary).map(([k,v])=>[k,v*this.secondaryStrength])):null;r.render(s.params,s.shape,this.zoom,s.extras,secondary);}
  _tick(t){if(!this.mix)return super._tick(t);if(this.destroyed)return;const dt=this.last?clamp((t-this.last)/1000,0,.1):0;this.last=t;if(this.ready&&!this.hidden&&this.mixRunning){this.mixAcc+=dt;let n=0;while(this.mixAcc>=1/120&&n<12){this.advanceIntegrated(1/120);this.mixAcc-=1/120;n++;}if(n){this.renderOnce();this._fpsWindow.push(t);if(this._fpsWindow.length>240)this._fpsWindow.shift();}}this.rafId=requestAnimationFrame(this._tick);}
  advanceIntegrated(dt){if(!this.mix)throw Error('integrated mode required');if(!Number.isFinite(dt)||dt<0||dt>.1)throw Error('invalid dt');if(this.mixTalk&&!this.mix.voice&&['neutral','happy','joy'].includes(this.mix.expr.name))this.mix.speak(2.8);return this.mix.step(dt);}
  setCostume(id){if(this.mix&&!['hoodie','cardigan'].includes(id))return false;return super.setCostume(id);}
  setExpression(name,internal=false){if(!this.mix)return super.setExpression(name,internal);this.mix.expression(name);if(['concerned','surprised','relaxed'].includes(name))this.mixTalk=false;this.onExpression(name);this.renderOnce();}
  getExpression(){return this.mix?this.mix.expr.name:super.getExpression();}
  setMode(mode){if(!this.mix)return super.setMode(mode);return this.start(mode);}
  start(mode='idle'){if(!this.mix)return super.start(mode);if(!['idle','talk'].includes(mode))throw Error('invalid mode');this.mixRunning=true;this.last=0;this.mixTalk=mode==='talk';if(!this.mixTalk){this.mix.stopSpeech();if(this.mix.voice)this.mix.voice.next=null;}else if(!['neutral','happy','joy'].includes(this.mix.expr.name)){this.mixTalk=false;return false;}return true;}
  stop(){if(!this.mix)return super.stop();this.mixRunning=false;this.last=0;this.mixAcc=0;}
  reset(){if(!this.mix)return super.reset();this.stop();this.mix.reset();this.mixTalk=false;this.renderOnce();this.onExpression('neutral');}
  performGesture(name){if(!this.mix)return super.performGesture(name);if(!this.manifest.gesturePerformance.profiles[name])return false;this.mix.gesture(name);this.mixRunning=true;return true;}
  cancelIntegrated(){if(!this.mix)return false;this.mixTalk=false;this.mix.cancel();this.mixRunning=true;return true;}
  // Legacy-only operations explicitly reject rather than invisibly changing the inactive engine.
  startDirection(){return this.mix?false:super.startDirection();}
  startRandomExpressions(...args){return this.mix?false:super.startRandomExpressions(...args);}
  setGesture(...args){return this.mix?false:super.setGesture(...args);}
  transitionGesture(...args){return this.mix?false:super.transitionGesture(...args);}
  playGesture(...args){return this.mix?false:super.playGesture(...args);}
  stopGesture(){return this.mix?this.cancelIntegrated():super.stopGesture();}
  setParameters(...args){return this.mix?false:super.setParameters(...args);}
  setArmTest(...args){return this.mix?false:super.setArmTest(...args);}
  setWrist(...args){return this.mix?false:super.setWrist(...args);}
  getStats(){const s=super.getStats();if(!this.mix)return s;return {...s,playing:this.mixRunning,mode:this.mixTalk?'talk':'idle',expression:this.mix.expr.name,transitioning:this.mix.expr.transitioning,clockTime:this.mix.t,blinkCount:this.mix.stats.blinks,gazeCount:this.mix.stats.glances,integrated:true};}
  destroy(){this.mix=null;this.mixRunning=false;this.mixTalk=false;super.destroy();}
}
window.IntegratedAvatar=IntegratedAvatar;
