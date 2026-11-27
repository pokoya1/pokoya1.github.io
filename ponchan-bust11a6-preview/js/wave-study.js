'use strict';
// Deterministic, independently scrubbable study; production state machine unchanged.
const WaveStudy=(()=>{
 const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
 const pulse=x=>x<=0||x>=1?0:Math.sin(Math.PI*x)**2;
 const schedule={anticipation:.18,raise:.78,swing:1.58,hold:.18,lower:.82,settle:.18};
 const total=Object.values(schedule).reduce((a,b)=>a+b,0);
 function sample(profile,kind,t){
  if(!Number.isFinite(t)||!['legacy','trial'].includes(kind))throw Error('invalid study input');
  t=Math.max(0,Math.min(total,t));
  let p=0,angle=0,tilt=0,gaze=0,body=0,sleeve=0,hair=0,brow=0,phase='rest';
  if(kind==='legacy'){
   const {raise,duration,hold,lower,knots,cycles,amplitude}=profile;
   if(t<raise){let u=t/raise;phase='raise';p=gestureEase(u,knots);tilt=profile.tilt*pulse(u);gaze=profile.gaze*pulse(u);}
   else if(t<raise+duration){let u=(t-raise)/duration;phase='wave';p=1;angle=amplitude*Math.sin(Math.PI*u)*Math.sin(2*Math.PI*u*cycles);tilt=profile.tilt*pulse(u);gaze=profile.gaze*pulse(u);}
   else if(t<raise+duration+hold){phase='hold';p=1;}
   else if(t<raise+duration+hold+lower){let u=1-(t-raise-duration-hold)/lower;phase='lower';p=gestureEase(u,knots);tilt=profile.tilt*pulse(u);gaze=profile.gaze*pulse(u);}
  }else{
   const a=schedule.anticipation,r=a+schedule.raise,w=r+schedule.swing,h=w+schedule.hold,l=h+schedule.lower;
   // Head and glance lead the arm; bounded shoulder transform reuses existing renderer.
   const cue=ease(t/.32)*(1-ease((t-(l-.30))/.48));
   tilt=.25*cue; gaze=-.38*ease(t/.14)*(1-ease((t-.95)/.65)); brow=.10*cue;
   hair=.12*cue;
   if(t<a){phase='anticipation';sleeve=-.7*pulse(t/a);}
   else if(t<r){const u=(t-a)/schedule.raise;phase='raise';p=gestureEase(u,profile.knots);sleeve=.65*pulse(u);body=.20*pulse(u);}
   else if(t<w){const u=(t-r)/schedule.swing;phase='wave';p=1;
    // The terminal sleeve and hand are separate. Three unequal beats, gentle onset and return.
    const timeWarp=u+.035*Math.sin(2*Math.PI*u);const env=ease(u/.16)*(1-ease((u-.72)/.28));
    angle=9.5*env*(1-.38*u)*Math.sin(6*Math.PI*timeWarp);
    sleeve=.38*env*Math.sin(6*Math.PI*timeWarp+.30);body=.10*env*Math.sin(6*Math.PI*timeWarp+.50);hair+=.09*env*Math.sin(6*Math.PI*timeWarp-.35);
   }else if(t<h){phase='hold';p=1;}
   else if(t<l){const u=(t-h)/schedule.lower;phase='lower';p=gestureEase(1-u,profile.knots);sleeve=-.46*pulse(u);body=-.14*pulse(u);hair-=.11*pulse(u);}
   else if(t<total){phase='settle';const u=(t-l)/schedule.settle;sleeve=.24*pulse(u);hair+=.12*pulse(u);}
  }
  if(t===0||t>=total){p=angle=tilt=gaze=body=sleeve=hair=brow=0;phase='rest';}
  return {t,p,angle,phase,params:{...zeroParams(),tilt,gaze,hair,brow},secondary:{body,sleeve}};
 }
 return {sample,total,schedule};
})();
window.WaveStudy=WaveStudy;
