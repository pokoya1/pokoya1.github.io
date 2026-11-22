import {DollhouseSimulation} from './src/core.mjs';
import fs from 'fs';
const scene=JSON.parse(fs.readFileSync('scene.json','utf8'));
let seed=42; const rng=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648};
const sim=new DollhouseSimulation(scene,{rng});
sim.setAuto('hamster',true); sim.setAuto('penguin',true);
const spots=['desk','sofa','bed','rug','window'], actors=['hamster','penguin'];
for(let i=0;i<3000;i++){
  if(rng()<0.08) sim.request(actors[Math.floor(rng()*2)], spots[Math.floor(rng()*5)], {manual:rng()<0.7});
  if(rng()<0.03) sim.setAuto(actors[Math.floor(rng()*2)], rng()<0.5);
  sim.advance(0.5); // verify() runs inside advance and throws on invariant break
}
const s=sim.snapshot();
console.log('FUZZ OK time', Math.round(s.time), 'activities', Object.values(s.actors).map(a=>a.activityCount).join('/'), 'modes', Object.values(s.actors).map(a=>a.mode).join(','));
