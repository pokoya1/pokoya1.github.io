// H5.5 / Pure deterministic simulation. No DOM references.
export function compileScene(scene){
  if(scene.schemaVersion!=='h5.5-1.0') throw Error('schema version');
  if(scene.canvas?.width!==450||scene.canvas?.height!==800) throw Error('canvas');
  const furniture=new Map(), spots=new Map(), actors=new Map(), graph=new Map();
  for(const f of scene.furniture){
    if(furniture.has(f.id))throw Error('duplicate furniture '+f.id);furniture.set(f.id,f);
    if(!f.fixture && f.render && (!f.render.source||!Number.isFinite(f.render.width)||!Number.isFinite(f.render.height)))throw Error('render '+f.id);
    const inx=f.interaction;
    if(inx?.spotId){const id=inx.spotId; if(spots.has(id))throw Error('duplicate spot');
      if(!scene.activities[inx.action])throw Error('unknown activity '+id);
      if(inx.slots.length!==inx.capacity||inx.capacity<1)throw Error('invalid slots '+id);
      spots.set(id,{id,name:f.name,x:f.position.x+inx.approachOffset.x,y:f.position.y+inx.approachOffset.y,slots:inx.slots,capacity:inx.capacity,action:inx.action,face:inx.face});
    }
  }
  for(const ac of scene.actors){if(!ac.speed||actors.has(ac.id))throw Error('bad actor');actors.set(ac.id,ac)}
  const coordinates={...scene.floor.waypointGraph.nodes};
  for(const [id,s] of spots)coordinates[id]=[s.x,s.y];
  for(const [a,b] of scene.floor.waypointGraph.edges){if(!coordinates[a]||!coordinates[b]) throw Error('unknown edge');
    if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a).add(b);graph.get(b).add(a);
  }
  // all destinations connected in graph, independent of currently placed characters
  for(const s of spots.keys()){if(!graph.has(s))throw Error('disconnected spot '+s);}
  for(const id of spots.keys()){let visited=new Set([id]),q=[id];for(let i=0;i<q.length;i++)for(const v of graph.get(q[i])||[])if(!visited.has(v)){visited.add(v);q.push(v)}for(const other of spots.keys())if(!visited.has(other))throw Error('unreachable: '+id+'->'+other);}
  return {scene,furniture,spots,actors,graph,coords:coordinates};
}
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}
function dSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return dist(p,[a[0]+t*dx,a[1]+t*dy]);}
function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const x=poly[i][0],y=poly[i][1],u=poly[j][0],v=poly[j][1];if((y>p[1])!==(v>p[1]) && p[0]<(u-x)*(p[1]-y)/(v-y)+x)yes=!yes}return yes;}
function collision(p, q, scene, radius=0){
  const floor=scene.floor.walkablePolygon;
  for(let i=0;i<=12;i++){const f=i/12,pt=[p[0]+(q[0]-p[0])*f,p[1]+(q[1]-p[1])*f];if(!inside(pt,floor))return true;}
  for(const f of scene.furniture){if(!f.footprintLocal?.length)continue;const poly=f.footprintLocal.map(z=>[z[0]+f.position.x,z[1]+f.position.y]);
    // Expanded footprint approximation. Ignore if endpoint itself is inside (legacy placements).
    if(inside(p,poly)||inside(q,poly))continue;
    for(let i=0;i<=18;i++){const t=i/18,pt=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];if(inside(pt,poly))return true;
      if(radius && poly.some((v,k)=>dSegment(pt,v,poly[(k+1)%poly.length])<radius))return true;
    }
  }
  return false;
}
export function route(comp,start,spotId,slot=0){
 const dest=comp.spots.get(spotId);if(!dest)return null;const goal=[dest.x+dest.slots[slot][0],dest.y+dest.slots[slot][1]], initial=[start.x,start.y];
 // Nearest *reachable* graph connector, not forced via hub. An actor positioned at a spot can start at its spot node.
 const entries=[];for(const [id,loc] of Object.entries(comp.coords))if(comp.graph.has(id)&&!collision(initial,loc,comp.scene,comp.scene.floor.effectiveCharacterRadius||0))entries.push([id,dist(initial,loc)]);
 entries.sort((a,b)=>a[1]-b[1]);
 const cost=new Map(), prev=new Map(),todo=new Set(comp.graph.keys());for(const n of todo)cost.set(n,Infinity);
 for(const [id,d] of entries)if(d<cost.get(id)){cost.set(id,d);prev.set(id,null)}
 while(todo.size){let n=null,best=Infinity;for(const k of todo)if(cost.get(k)<best){best=cost.get(k);n=k}if(!n)break;todo.delete(n);if(n===spotId)break;
  for(const v of comp.graph.get(n)||[]){if(!todo.has(v))continue;const a=comp.coords[n],b=comp.coords[v];if(collision(a,b,comp.scene,comp.scene.floor.effectiveCharacterRadius||0))continue;const nd=best+dist(a,b);if(nd<cost.get(v)){cost.set(v,nd);prev.set(v,n)}}
 }
 if(!Number.isFinite(cost.get(spotId)))return null;
 const names=[];let cur=spotId;while(cur!==null){names.unshift(cur);cur=prev.get(cur);if(cur===undefined)return null}
 const coords=names.map(n=>comp.coords[n]);coords.push(goal);
 const points=coords.filter((p,i)=>i===0||dist(p,coords[i-1])>0.01).map(p=>({x:p[0],y:p[1]}));
 // All segments, including current position to connector and last segment to slot.
 let last=initial;for(const p of points){if(collision(last,[p.x,p.y],comp.scene,comp.scene.floor.effectiveCharacterRadius||0))return null;last=[p.x,p.y]}
 return points;
}
export class DollhouseSimulation{
 constructor(scene, opts={}){this.comp=compileScene(scene);this.rng=opts.rng||Math.random;this.events=[];this.reset()}
 reset(){const c=this.comp;this.actors=Object.fromEntries([...c.actors].map(([id,p])=>[id,{id,x:p.spawn.x,y:p.spawn.y,mode:'idle',reserved:null,request:null,target:null,spot:null,slot:null,path:[],walkClock:0,face:1,auto:false,idleTime:3,activityElapsed:0,activityCount:0,history:[]}]));this.seats=Object.fromEntries([...c.spots].map(([id,s])=>[id,{occupants:[],queue:[],slots:Array(s.capacity).fill(null)}]));this.events=[];this.time=0;this.paused=false;this.verify();}
 snapshot(){return structuredClone({time:this.time,actors:this.actors,seats:this.seats,events:this.events.slice(-30)})}
 emit(type,id,details={}){const ev={time:Math.round(this.time*100)/100,type,id,...details};this.events.push(ev);if(this.events.length>120)this.events.shift()}
 removeQueue(id){for(const st of Object.values(this.seats))st.queue=st.queue.filter(x=>x!==id)}
 release(id){const a=this.actors[id];if(!a.reserved)return;const st=this.seats[a.reserved];const i=st.occupants.indexOf(id);if(i!==-1)st.occupants.splice(i,1);if(a.slot!==null)st.slots[a.slot]=null;a.reserved=null;a.slot=null;a.spot=null;this.grant();}
 chooseSlot(spotId){return this.seats[spotId].slots.findIndex(s=>s===null)}
 reserveAndTravel(id,spotId){const a=this.actors[id],st=this.seats[spotId],slot=this.chooseSlot(spotId);if(slot<0)return false;
   const path=route(this.comp,a,spotId,slot);if(!path){this.emit('unreachable',id,{spotId});return false;}
   st.occupants.push(id);st.slots[slot]=id;a.reserved=spotId;a.slot=slot;a.target=spotId;a.mode='travel';a.path=path;a.request=null;a.activityElapsed=0;
   this.emit('reserved',id,{spotId,slot});return true;
 }
 request(id,spotId,{manual=true}={}){if(!this.actors[id]||!this.seats[spotId])return false;const a=this.actors[id];if(manual)a.auto=false;
   if(a.reserved===spotId && ['travel','acting','at'].includes(a.mode))return true;
   this.removeQueue(id);this.release(id); // explicit retarget frees old seat; release can grant waiting actor
   a.path=[];a.spot=null;a.request=null;a.target=null;a.mode='idle';
   if(this.chooseSlot(spotId)<0){if(!manual){a.idleTime=5;this.emit('auto-skip-full',id,{spotId});return false;}
      a.mode='waiting';a.request=spotId;this.seats[spotId].queue.push(id);this.emit('queued',id,{spotId});this.verify();return true;}
   if(!this.reserveAndTravel(id,spotId)){a.mode='idle';a.idleTime=5;this.verify();return false;}
   this.verify();return true;
 }
 grant(){for(const [spotId,st] of Object.entries(this.seats)){let limit=st.queue.length;while(this.chooseSlot(spotId)!==-1&&st.queue.length&&limit-- >0){const id=st.queue.shift(),a=this.actors[id];if(a.mode!=='waiting'||a.request!==spotId)continue;
      if(!this.reserveAndTravel(id,spotId)){a.mode='idle';a.request=null;a.idleTime=5;this.emit('queue-route-failed',id,{spotId});}
   }} }
 selectAuto(id){const a=this.actors[id];if(!a.auto||!['idle','at'].includes(a.mode))return;
   const options=[...this.comp.spots.keys()].filter(s=>s!==a.spot && !a.history.slice(-2).includes(s) && this.chooseSlot(s)>=0 && route(this.comp,a,s,this.chooseSlot(s)));
   if(!options.length){a.idleTime=5;this.emit('no-free-destination',id);return;}
   const s=options[Math.floor(this.rng()*options.length)];this.request(id,s,{manual:false});
 }
 setAuto(id,on){const a=this.actors[id];a.auto=Boolean(on);if(a.auto&&a.mode==='waiting'){this.removeQueue(id);a.mode='idle';a.request=null;}
   if(a.auto&&['idle','at'].includes(a.mode))a.idleTime=Math.min(a.idleTime,2);
 }
 advance(seconds){const tick=.04;let n=Math.ceil(seconds/tick);for(let i=0;i<n;i++)this.step(seconds/n);this.verify();}
 step(dt){if(this.paused)return;this.time+=dt;for(const [id,a] of Object.entries(this.actors)){
   if(a.mode==='travel'){a.walkClock+=dt;let amount=this.comp.actors.get(id).speed*dt;while(amount>0&&a.path.length){const p=a.path[0],dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy);if(d<=amount+1e-5){a.x=p.x;a.y=p.y;a.path.shift();amount-=d;}else{a.x+=dx/d*amount;a.y+=dy/d*amount;amount=0;}if(Math.abs(dx)>1)a.face=dx>0?1:-1;}
      if(!a.path.length){a.mode='acting';a.spot=a.target;a.activityElapsed=0;a.activityCount++;a.history.push(a.spot);a.history=a.history.slice(-4);this.emit('activity-start',id,{spotId:a.spot});}
   }else if(a.mode==='acting'){a.activityElapsed+=dt;const spot=this.comp.spots.get(a.spot),act=this.comp.scene.activities[spot.action];if(a.activityElapsed>=act.seconds){a.mode='at';a.idleTime=a.auto?4+6*this.rng():Infinity;this.emit('activity-end',id,{spotId:a.spot});}}
   else if(a.auto&&['at','idle'].includes(a.mode)){a.idleTime-=dt;if(a.idleTime<=0)this.selectAuto(id)}
  }
 }
 verify(){const held=new Map();for(const [s,st] of Object.entries(this.seats)){const cap=this.comp.spots.get(s).capacity;
   if(st.occupants.length>cap||st.slots.length!==cap||new Set(st.occupants).size!==st.occupants.length)throw Error('capacity '+s);
   if(st.occupants.length!==st.slots.filter(Boolean).length)throw Error('slot mismatch '+s);
   for(const id of st.occupants){if(held.has(id))throw Error('multi seat '+id);held.set(id,s);if(!st.slots.includes(id))throw Error('slot owner '+id);const a=this.actors[id];if(a.reserved!==s||!['travel','acting','at'].includes(a.mode))throw Error('orphan reservation '+id);}
   if(new Set(st.queue).size!==st.queue.length)throw Error('duplicate queue '+s);
   for(const id of st.queue){const a=this.actors[id];if(a.mode!=='waiting'||a.request!==s||a.reserved)throw Error('queue state '+id);}
 }
 for(const [id,a] of Object.entries(this.actors)){let count=Object.values(this.seats).filter(st=>st.queue.includes(id)).length;
   if(a.mode==='waiting'&&count!==1)throw Error('orphan waiting '+id);
   if(a.mode!=='waiting'&&count!==0)throw Error('unwanted queue '+id);
   if(a.reserved && held.get(id)!==a.reserved)throw Error('orphan occupant '+id);
 }
 return true;
 }
}
