// D-4 Penguin visual controller. Headless policy, same UI hooks as hamster but separate actor clock.
export const PENGUIN_PRESETS=Object.freeze({normal:{duration:0,symbol:''},happy:{duration:2.5,symbol:'♥'},surprise:{duration:1.6,symbol:'‼'},sad:{duration:3,symbol:'…'},sleepy:{duration:4,symbol:'Zzz'},panic:{duration:2,symbol:'⁉'}});
export const LIFE_TO_PENGUIN=Object.freeze({pc_work:'normal',relax:'happy',sleep:'sleepy',greet:'happy',read_news:'surprise'});
export class PenguinFaceController{
 constructor(){this.reset()}
 reset(){this.base='normal';this.overlay=null;this.clock=0;this.blink=true;this.enabled=true;this.lastAction=null}
 get current(){return this.overlay?.key||this.base}
 get symbol(){return PENGUIN_PRESETS[this.current].symbol}
 setBase(key){if(!(key in PENGUIN_PRESETS))throw Error('Invalid expression: '+key);this.base=key}
 trigger(key,duration=PENGUIN_PRESETS[key]?.duration){if(!(key in PENGUIN_PRESETS))throw Error('Invalid expression: '+key);if(key==='normal'){this.overlay=null;return true;}if(!Number.isFinite(duration)||duration<0)throw Error('Invalid duration');this.overlay={key,remaining:duration};return true}
 step(dt){if(!Number.isFinite(dt)||dt<0)throw Error('Invalid delta');this.clock+=dt;if(this.overlay){this.overlay.remaining-=dt;if(this.overlay.remaining<=0)this.overlay=null}}
 isBlinking(){if(!this.blink||this.current==='happy'||this.current==='sleepy')return false;return this.clock%2.6<.18}
 activityEvent(ev,simulation){if(!this.enabled||ev.id!=='penguin'||ev.type!=='activity-start')return;const spot=simulation.comp.spots.get(ev.spotId);if(!spot)return;this.lastAction=spot.action;this.base=spot.action==='sleep'?'sleepy':'normal';if(spot.action!=='sleep'){const expression=LIFE_TO_PENGUIN[spot.action];if(expression&&expression!=='normal'&&!this.overlay)this.trigger(expression)} }
 syncActor(actor){if(this.enabled&&actor.spot==='bed'&&(actor.mode==='acting'||actor.mode==='at'))this.base='sleepy';else if(this.base==='sleepy'&&(actor.mode==='travel'||actor.mode==='waiting'||actor.mode==='idle'||actor.spot!=='bed'))this.base='normal'}
 setEnabled(value){this.enabled=!!value;if(!this.enabled){this.base='normal';this.lastAction=null}}
 frame(actor){const walk=actor.mode==='travel';const cycle=walk?Math.floor(actor.walkClock/.3)%4:0;const pose=['F0','F1','F0','F3'][cycle];return {pose,expression:this.current,blink:this.isBlinking(),symbol:this.symbol,walk}}
 snapshot(actor){return {...this.frame(actor),base:this.base,manual:!!this.overlay,remaining:this.overlay?Math.max(0,this.overlay.remaining):null,clock:this.clock,enabled:this.enabled}}
}
