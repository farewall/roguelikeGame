'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Combat}=require('../game/core/combat');
const {tigerClawSegment,tigerVulnerable}=require('../game/core/white-tiger');
const {makeCheckpoint,restoreCheckpoint,validCheckpoint}=require('../game/core/checkpoint');
const {isFree}=require('../game/core/world-geometry');
function scene(phase2=false,exploration=false){
  const c=new Combat('bell',()=>.5,{exploration});c.stage=2;c.startStage();if(c.world)c.world.prepareNavigation(Infinity);
  c.enemies=[];c.hazards=[];c.events=[];c.phase=3;c.remaining=0;c.invulnerable=1000;
  const e=c.spawn('boss');Object.assign(e,{x:18,y:45,spawnTime:0,hp:1000,maxHp:1000,speed:0,cooldown:100,phase2});c.player.x=65;c.player.y=55;
  return {c,e};
}
function until(c,predicate,seconds=16){for(let i=0;i<seconds/.025&&!predicate();i++)c.update(.025,false);assert.ok(predicate(),'Expected tiger phase within '+seconds+' seconds');}
function advance(c,t){for(let i=0;i<t/.025;i++)c.update(.025,false);}
function firstPounce(c,e,phase2=false){c.castPattern(2,e,phase2);until(c,()=>c.hazards.some(h=>h.tigerPounce));return c.hazards.find(h=>h.tigerPounce);}

test('a tiger has an independent non-damaging intercept while minions retain their ordinary charge',()=>{
  const {c,e}=scene();c.invulnerable=0;c.move(c.player,{x:1,y:0},15);c.castPattern(2,e,false);
  assert.equal(e.tigerHunt.phase,'cutoff-windup');assert.equal(c.hazards.length,0);const locked={...e.tigerHunt.stepTo};
  c.move(c.player,{x:-1,y:0},30);advance(c,.5);assert.deepEqual(e.tigerHunt.stepTo,locked);
  Object.assign(c.player,{x:e.x,y:e.y});c.update(.025,false);assert.equal(c.hp,100,'Crossing the repositioning body cannot hurt');
  const mob=c.spawn('charger');mob.spawnTime=0;c.charge(mob,false);
  assert.ok(!mob.tigerHunt);assert.equal(c.hazards.find(h=>h.owner===mob.id).width,52);
});
test('near combat raises distinct paws with separate locks and no persistent damage lane',()=>{
  const {c,e}=scene();e.x=33;c.player.x=50;c.castPattern(2,e,false);
  until(c,()=>e.tigerHunt.phase==='sweep-windup');assert.equal(e.tigerPose,1);
  const sweep=c.hazards.find(h=>h.tigerClaw);assert.equal(sweep.style,'sweep');assert.equal(c.contains(sweep,c.player),false);
  const oldAngle=sweep.angle;c.player.y=85;until(c,()=>e.tigerHunt.phase==='chop-windup');
  assert.equal(e.tigerPose,3);const chop=c.hazards.find(h=>h.style==='chop');assert.notEqual(chop.angle,oldAngle);
  const angle=chop.angle;c.player.x=10;advance(c,.2);assert.equal(chop.angle,angle);
  assert.ok(c.hazards.every(h=>h.tigerClaw||h.tigerPounce));
});
test('moving claw contact follows the actual swept paw and leaves the empty sector safe',()=>{
  const {c}=scene(),h={shape:'tiger-claw',tigerClaw:true,x:50,y:50,angle:0,style:'sweep',delay:.68,duration:.3,width:24,age:.83,previousAge:.805};
  const paw=tigerClawSegment(h,c.point(h)),mid={x:(paw.x+paw.end.x)/2,y:(paw.y+paw.end.y)/2};
  assert.equal(c.contains(h,c.percent(mid)),true);
  assert.equal(c.contains(h,c.percent({x:paw.end.x+90,y:paw.end.y})),false);
  assert.equal(c.contains(h,c.percent({x:c.point(h).x+45,y:c.point(h).y+150})),false);
  assert.equal(c.contains({...h,age:.5},c.percent(mid)),false);
});
test('each airborne pounce has a fresh windup and a route locked before takeoff',()=>{
  const {c,e}=scene(true);const h=firstPounce(c,e,true),end={...h.end};
  c.player.x=94;c.player.y=85;advance(c,.2);assert.deepEqual(h.end,end);
  until(c,()=>e.tigerHunt.phase==='pounce-flight');assert.equal(e.tigerPose,6);assert.ok(e.tigerAir>0&&e.tigerAir<1);
  until(c,()=>e.tigerHunt.phase==='landing');assert.ok(Math.abs(e.x-end.x)<1e-6&&Math.abs(e.y-end.y)<1e-6);
  until(c,()=>c.hazards.some(h=>h.second));const second=c.hazards.find(h=>h.second),d=c.vector(e,c.player),actual=c.vector(second,second.end);
  assert.ok(d.x*actual.x+d.y*actual.y>.999);assert.ok(second.delay>=.8);
});
test('phase two close branch raises a turning backhand, stays committed, then must recover',()=>{
  const {c,e}=scene(true);firstPounce(c,e,true);until(c,()=>e.tigerHunt.phase==='landing');
  const at=c.point(e);Object.assign(c.player,c.percent({x:at.x-80,y:at.y+50}));
  until(c,()=>e.tigerHunt.phase==='follow-look');assert.equal(e.tigerHunt.follow,'backhand');
  c.player.x=95;c.player.y=85;until(c,()=>e.tigerHunt.phase==='backhand-windup');assert.equal(e.tigerPose,9);
  until(c,()=>e.tigerHunt.phase==='recovery');assert.ok(e.recoverTime>1);assert.ok(!c.hazards.some(h=>h.second));
  until(c,()=>!e.tigerHunt);assert.ok(e.cooldown>=1);
});
test('phase two far branch stays a pounce even if the player returns during the glance',()=>{
  const {c,e}=scene(true);firstPounce(c,e,true);until(c,()=>e.tigerHunt.phase==='landing');c.player.x=e.x>50?5:95;
  until(c,()=>e.tigerHunt.phase==='follow-look');assert.equal(e.tigerHunt.follow,'pounce');
  Object.assign(c.player,{x:e.x,y:e.y+4});until(c,()=>c.hazards.some(h=>h.second));const h=c.hazards.find(h=>h.second);
  const target=c.vector(e,c.player),aim=c.vector(h,h.end);assert.ok(target.x*aim.x+target.y*aim.y>.999);
  until(c,()=>e.tigerHunt.phase==='recovery');assert.equal(e.tigerHunt.followed,true);
});
function pillarScene(){
  const {c,e}=scene(true,true),pillar=c.world.tigerPillars[0],a=Math.PI/8,dx=Math.cos(a),dy=Math.sin(a);
  Object.assign(e,c.percent({x:pillar.x-dx*340,y:pillar.y-dy*340-72}));Object.assign(c.player,c.percent({x:pillar.x+dx*220,y:pillar.y+dy*220-72}));
  assert.ok(isFree(c.world,c.groundPoint(e),40));return {c,e,pillar};
}
test('a real pillar crash breaks the high part, cancels followup and opens a two-second damage window without rebuilding navigation',()=>{
  const {c,e,pillar}=pillarScene(),nav=c.world.bossNav,solids=c.world.solids.length,footprint={radius:pillar.radius,...pillar.bounds};
  c.castPattern(2,e,true);until(c,()=>pillar.broken);
  assert.equal(e.tigerHunt.phase,'recovery');assert.equal(e.tigerPose,8);assert.ok(e.recoverTime>=2&&tigerVulnerable(e));
  assert.equal(c.world.bossNav,nav);assert.equal(c.world.solids.length,solids);assert.deepEqual({radius:pillar.radius,...pillar.bounds},footprint);
  assert.equal(pillar.cover,false);assert.equal(isFree(c.world,pillar,1),false,'Visible stump retains the footprint');
  const hp=e.hp;c.deal(e,10);assert.ok(Math.abs(hp-e.hp-13.5)<1e-6);advance(c,.8);assert.ok(!c.hazards.some(h=>h.second));
});
test('bone pillars are authored only on the bone map and broken stumps survive safe saves and old saves',()=>{
  const {c,e,pillar}=pillarScene();c.castPattern(2,e,true);until(c,()=>pillar.broken);
  const saved=makeCheckpoint(c);assert.ok(validCheckpoint(saved));const restored=restoreCheckpoint(saved,()=>.5);
  assert.equal(restored.world.tigerPillars.find(p=>p.id===pillar.id).broken,true);assert.ok(!restored.enemies[0].tigerHunt);assert.equal(restored.hazards.length,0);
  delete saved.data.world.tigerPillars;assert.ok(validCheckpoint(saved));assert.ok(restoreCheckpoint(saved).world.tigerPillars.every(p=>!p.broken));
  assert.equal(new Combat('bell',()=>.5,{exploration:true}).world.tigerPillars.length,0);
});
test('ordinary terrain and already broken pillars cannot grant repeated crash openings',()=>{
  const {c,e,pillar}=pillarScene();pillar.broken=true;pillar.cover=false;c.castPattern(2,e,true);
  until(c,()=>e.tigerHunt.phase==='landing');assert.ok(!e.tigerHunt.crashed);assert.ok(!c.effects.some(f=>f.type==='tiger-crash'));
});
test('half health cancels the current hunt and freezing cannot move a committed pounce',()=>{
  const {c,e}=scene();const h=firstPounce(c,e);until(c,()=>e.tigerHunt.phase==='pounce-flight');
  const age=h.age,pos={x:e.x,y:e.y},clock=e.tigerHunt.age;e.freezeTime=.5;advance(c,.2);
  assert.equal(h.age,age);assert.deepEqual({x:e.x,y:e.y},pos);assert.equal(e.tigerHunt.age,clock);
  e.freezeTime=0;e.hp=490;c.update(.025,false);assert.ok(c.enrage);assert.equal(e.tigerHunt,null);assert.equal(e.tigerExposed,false);assert.equal(c.hazards.length,0);
  advance(c,1.9);assert.equal(c.enrage,null);assert.ok(e.phase2);
});
test('a full hunt is bounded with delayed frames and an empty map still offers ordinary whiff recovery',()=>{
  const {c,e}=scene(true);firstPounce(c,e,true);c.player.x=95;c.player.y=85;
  for(let i=0;i<100&&e.tigerHunt;i++)c.update(.2,false);
  assert.equal(e.tigerHunt,null);assert.ok(e.x>=4&&e.x<=96&&e.y>=8&&e.y<=92);
  assert.equal(c.hazards.length,0);assert.ok(e.cooldown>0);
});
test('a saturated hazard budget falls back to recovery instead of trapping the tiger in flight',()=>{
  const {c,e}=scene(true);c.hazards=Array.from({length:16},(_,i)=>({id:100+i,owner:null,shape:'circle',x:0,y:0,radius:1,age:0,delay:100,duration:1}));
  c.castPattern(2,e,true);until(c,()=>e.tigerHunt.phase==='recovery');assert.equal(c.hazards.length,16);assert.equal(e.tigerPose,7);
  until(c,()=>!e.tigerHunt);assert.ok(e.cooldown>0);
});
test('tiger and bone atlases have opaque bodies, transparent backgrounds and bounded runtime frames',()=>{
  const fs=require('node:fs'),path=require('node:path');
  for(const [name,w,h,cap] of [['white-tiger',768,768,170000],['tiger-pillars',576,192,24000]]){
    const data=fs.readFileSync(path.join(__dirname,'../cocos-project/assets/game-content/images/'+name+'.png'));
    assert.equal(data.readUInt32BE(16),w);assert.equal(data.readUInt32BE(20),h);assert.ok(data.includes(Buffer.from('tRNS')));assert.ok(data.length<cap);
  }
});
