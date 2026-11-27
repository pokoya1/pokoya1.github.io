'use strict';
// Deterministic face/gesture coordination study. No audio input or production state changes.
const ActingStudy=(()=>{
 const ease=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u)};
 const pulse=(t,a,b)=>{const u=(t-a)/(b-a);return u<=0||u>=1?0:Math.sin(Math.PI*u)**2};
 const gate=(t,a,b,attack,release)=>ease((t-a)/attack)*ease((b-t)/release);
 const syllables=[{at:.40,dur:.27,peak:.30},{at:.74,dur:.36,peak:.43},{at:1.24,dur:.32,peak:.58},{at:1.67,dur:.30,peak:.37},{at:2.08,dur:.38,peak:.44}];
 const blinks=[{at:.18,close:.085,hold:.045,open:.15},{at:2.59,close:.09,hold:.045,open:.16}];
 function speech(t){let mouth=0;for(const q of syllables){const u=(t-q.at)/q.dur;if(u>0&&u<1)mouth=q.peak*ease(u/.30)*ease((1-u)/.36);}return mouth;}
 function blink(t){let v=0;for(const q of blinks){const d=t-q.at;v=Math.max(v,ease(d/q.close)*ease((q.close+q.hold+q.open-d)/q.open));}return v;}
 function sample(profile,kind,t,talk=true){
  if(!['base','acting'].includes(kind))throw Error('invalid acting profile');
  const s=WaveStudy.sample(profile,'trial',t);t=s.t;
  const voice=talk?speech(t):0;
  const v={...s.params,mouth:voice};let cheek=0;
  if(kind==='acting'){
    const smile=gate(t,.12,3.50,.50,.65);
    const emphasis=pulse(t,1.03,1.87)* (talk?1:.45);
    // Glance to hand, then return to viewer. Do not move eyes abruptly during a blink.
    v.gaze=Math.max(-1,Math.min(1,v.gaze*.65-.13*pulse(t,.05,.74)+.12*pulse(t,1.25,1.96)));
    v.blink=Math.max(.075*smile,blink(t));
    v.brow=Math.min(1,v.brow+.11*smile+.11*emphasis);
    v.tilt=Math.max(-1,Math.min(1,v.tilt+.22*emphasis-.10*pulse(t,2.43,3.15)));
    v.breath=.18*pulse(t,.03,.39)+.12*pulse(t,2.49,3.33);
    v.hair+=.065*pulse(t,1.21,2.05)-.04*pulse(t,2.62,3.35);
    cheek=.34*smile;
  }
  return {...s,params:v,extras:cheek>0?{cheeks:[{index:34,alpha:cheek}]}:null,cheek,voice,blink:v.blink,talk};
 }
 return {sample,total:WaveStudy.total,syllables,blinks};
})();
window.ActingStudy=ActingStudy;
