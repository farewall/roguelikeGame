'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Combat}=require('../game/core/combat');
const {SWORDS,sweptBladeContact}=require('../game/core/swords');
const {startEnrage}=require('../game/core/boss-patterns');
const {setup}=require('./game-harness.cjs');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function fresh(world=false){const c=new Combat('swords',()=>.5,{exploration:world});c.phase=3;c.remaining=0;c.enemies=[];c.invulnerable=1000;c.drainEvents();return c;}
function enemy(c,x,y=0,extra={}){const e=c.spawn('ranged');assert.ok(e);Object.assign(e,{x:c.player.x+x/c.width*100,y:c.player.y+y/c.height*100,hp:1000,maxHp:1000,speed:0,cooldown:100,spawnTime:0,...extra});return e;}
function advance(c,seconds,step=.025){for(let t=0;t<seconds-1e-7;t+=step)c.update(Math.min(step,seconds-t),false);}
function one(c){assert.ok(c.strike({direction:{x:1,y:0}}));for(const f of c.flyingSwords.slice(1)){f.state='idle';f.attack=null;}return c.flyingSwords[0];}
function until(c,fn,seconds=3){for(let i=0;i<seconds/.01&&!fn();i++)c.update(.01,false);assert.ok(fn());}

test('four upright physical swords float independently without idle damage or duplicate projectiles',()=>{
 const c=fresh(),e=enemy(c,90),before=c.swordPoses();advance(c,.4);const after=c.swordPoses();
 assert.deepEqual(after.map(p=>p.name),SWORDS.names);assert.equal(new Set(after.map(p=>p.index)).size,4);near(e.hp,1000);
 assert.ok(after.every(p=>Math.abs(p.angle)<7&&p.width<p.height*.6));assert.notDeepEqual(after,before);assert.equal(c.projectiles.length,0);assert.equal(c.bellWaves.length,0);
 c.move(c.player,{x:1,y:0},60);advance(c,.3);assert.ok(Math.hypot(c.swordAnchor.x-c.point(c.player).x,c.swordAnchor.y-c.point(c.player).y)<2);
});
test('automatic attacks release four actual swords in staggered flights and settle back into four slots',()=>{
 const c=fresh(),e=enemy(c,300);c.update(.025,true);assert.ok(c.pendingAttack);advance(c,.2);assert.equal(c.swordPoses().length,4);
 const states=c.flyingSwords.map(f=>f.state);assert.ok(new Set(states).size>1);assert.ok(states.includes('waiting'));
 advance(c,.45);assert.ok(c.flyingSwords.some(f=>Math.hypot(f.position.x-c.point(c.player).x,f.position.y-c.point(c.player).y)>180));assert.ok(e.hp<1000);
 advance(c,2);assert.ok(c.flyingSwords.every(f=>f.state==='idle'));assert.equal(c.swordPoses().length,4);assert.equal(c.strikeCount,1);
});
test('real swept metal covers interior rotation and relative motion but not a distant empty region',()=>{
 const a={base:{x:80,y:0},tip:{x:140,y:0}},b={base:{x:0,y:80},tip:{x:0,y:140}};
 assert.equal(sweptBladeContact({x:55,y:55},a,b,2),true);assert.equal(sweptBladeContact({x:0,y:0},a,b,18),false);assert.equal(sweptBladeContact({x:220,y:0},a,b,18),false);
});
test('a close sword cleave catches multiple bodies while a distant side target and forming enemies stay safe',()=>{
 const c=fresh(),targets=[enemy(c,240),enemy(c,260,-30),enemy(c,260,30)],far=enemy(c,240,190),forming=enemy(c,230,0,{spawnTime:5});one(c);advance(c,1.7);
 assert.ok(targets.filter(e=>e.hp<1000).length>=2);near(far.hp,1000);near(forming.hp,1000);assert.equal(c.strikeCount,1);
});
test('returning sword hits a new straggler once and never damages its outbound victim twice',()=>{
 const c=fresh(),primary=enemy(c,300),f=one(c);until(c,()=>f.state==='return');const hp=primary.hp;advance(c,.06);
 const a=f.trail.at(-2),b=f.trail.at(-1),d=Math.hypot(b.x-a.x,b.y-a.y)||1,origin=c.point(c.player);
 const e=enemy(c,b.x-origin.x+(b.x-a.x)/d*18,b.y-origin.y+(b.y-a.y)/d*18);advance(c,1);
 near(primary.hp,hp);assert.ok(e.hp<1000);assert.ok(1000-e.hp<=c.damage()*SWORDS.returnDamage+1e-6);assert.ok(c.damageBySource['sword-return']>0);assert.equal(f.state,'idle');
});
test('a sword retargets a victim killed by someone else once, then returns if no target remains',()=>{
 const c=fresh(),first=enemy(c,290),next=enemy(c,350,65),f=one(c);advance(c,.16);assert.equal(f.targetId,first.id);first.hp=0;c.collectDeaths();advance(c,.03);assert.equal(f.targetId,next.id);assert.equal(f.retargets,1);
 advance(c,1.8);assert.ok(next.hp<1000);assert.equal(f.state,'idle');
 const other=fresh(),victim=enemy(other,300),s=one(other);advance(other,.15);victim.hp=0;other.collectDeaths();advance(other,1.5);assert.equal(s.state,'idle');
});
test('screen visibility, range and formation gate autonomous targets and empty skills preserve charge',()=>{
 const c=fresh();enemy(c,600);enemy(c,0,-400);enemy(c,100,0,{spawnTime:3});assert.equal(c.swordTargets().length,0);assert.equal(c.strike({direction:{x:1,y:0}}),false);assert.equal(c.useSkill(),false);near(c.energy,100);
 const e=enemy(c,280);assert.deepEqual(c.swordTargets().map(e=>e.id),[e.id]);assert.ok(c.useSkill());
});
test('one four-sword round grants one charge and reaction, snapshots upgrades and tempers repeated focus hits',()=>{
 const c=fresh(),e=enemy(c,300);c.energy=0;let steam=0;const effect=c.effect;c.effect=function(type,...args){if(type==='steam')steam++;return effect.call(this,type,...args);};c.elements.fire=c.elements.water=1;c.strike({direction:{x:1,y:0}});advance(c,1.8);
 assert.equal(c.strikeCount,1);near(c.energy,12+2.5*1.8);assert.equal(steam,1);
 const plain=fresh(),victim=enemy(plain,300);plain.strike({direction:{x:1,y:0}});plain.upgrade('power');plain.upgrade('fire');advance(plain,1.8);
 near(1000-victim.hp,SWORDS.damage*(1+3*SWORDS.repeatDamage));assert.equal(victim.burnTime,0);assert.ok(e.hp<victim.hp);
});
test('four swords return to the moving player rather than teleporting to an old launch location',()=>{
 const c=fresh(),e=enemy(c,300),f=one(c);until(c,()=>f.state==='return');const old={...c.point(c.player)};c.move(c.player,{x:-1,y:0},150);
 let previous={...f.position};for(let i=0;i<100;i++){advance(c,.01);assert.ok(Math.hypot(f.position.x-previous.x,f.position.y-previous.y)<50);previous={...f.position};}
 assert.equal(f.state,'idle');assert.ok(Math.hypot(c.swordAnchor.x-c.point(c.player).x,c.swordAnchor.y-c.point(c.player).y)<1);assert.ok(c.point(c.player).x<old.x-100);
});
test('single-target skill gathers the same four swords then splits one total damage budget across them',()=>{
 const c=fresh(),e=enemy(c,300);assert.ok(c.useSkill());assert.equal(c.swordSkill.mode,'single');advance(c,.1);near(e.hp,1000);assert.equal(c.swordPoses().length,4);
 let maxDistance=0;for(let i=0;i<180;i++){advance(c,.01);for(const f of c.flyingSwords)maxDistance=Math.max(maxDistance,Math.hypot(f.position.x-c.point(c.player).x,f.position.y-c.point(c.player).y));}
 near(1000-e.hp,c.damage()*3.5);assert.ok(maxDistance>200);assert.equal(c.swordSkill,null);assert.equal(c.strikeCount,0);assert.ok(c.flyingSwords.every(f=>f.state==='idle'));assert.equal(c.projectiles.length,0);assert.equal(c.bellWaves.length,0);
});
test('crowd skill crosses several distinct bodies and caps overlapping cuts and returns per target',()=>{
 const c=fresh(),targets=[];for(const [x,y]of [[230,-65],[300,-50],[330,30],[245,55],[300,100],[380,100]])targets.push(enemy(c,x,y));const far=enemy(c,610);
 assert.ok(c.useSkill());assert.equal(c.swordSkill.mode,'crowd');advance(c,2);
 assert.ok(targets.filter(e=>e.hp<1000).length>=4);for(const e of targets)assert.ok(1000-e.hp<=c.damage()*3.5+1e-6);near(far.hp,1000);assert.equal(c.strikeCount,0);assert.equal(c.swordSkill,null);
});
test('skill recalls existing flights, spends only once, and cannot duplicate four physical swords',()=>{
 const c=fresh();enemy(c,300);c.strike({direction:{x:1,y:0}});advance(c,.35);const before=c.swordPoses().map(p=>c.point(p));assert.ok(c.useSkill());
 const after=c.swordPoses().map(p=>c.point(p));for(let i=0;i<4;i++)near(Math.hypot(before[i].x-after[i].x,before[i].y-after[i].y),0);
 c.energy=100;assert.equal(c.useSkill(),false);for(let i=0;i<200;i++){advance(c,.01);assert.equal(c.swordPoses().length,4);assert.equal(new Set(c.swordPoses().map(p=>p.index)).size,4);}assert.equal(c.skillUses,1);assert.equal(c.swordSkill,null);
});
test('pause, upgrade and boss enrage freeze active sword paths, while restart and stage transitions discard them',()=>{
 const h=setup({weapon:'swords',nativeLayout:true}),g=h.game,c=g.combat;c.enemies=[];c.phase=3;c.remaining=0;enemy(c,300);c.strike({direction:{x:1,y:0}});h.simulate(.3);g.pauseGame();let before=JSON.stringify(c.swordPoses());h.simulate(.5);assert.equal(JSON.stringify(c.swordPoses()),before);
 g.resumeGame();c.xp=c.xpNeed;g.levelUp();before=JSON.stringify(c.swordPoses());h.simulate(.5);assert.equal(JSON.stringify(c.swordPoses()),before);g.setData({showChoice:false});const boss=c.spawn('boss');Object.assign(boss,{hp:500,maxHp:1000,spawnTime:0});startEnrage(c,boss);before=JSON.stringify(c.swordPoses());advance(c,.3);assert.equal(JSON.stringify(c.swordPoses()),before);
 g.restart();assert.equal(g.combat.swordSkill,null);assert.ok(g.combat.flyingSwords.every(f=>f.state==='idle'));g.combat.cleared=true;g.combat.advanceStage();assert.ok(g.combat.flyingSwords.every(f=>f.state==='idle'&&!f.attack));g.onUnload();
});
test('idle and flying sprite rectangles remain inside arena edges at both phone sizes',()=>{
 for(const [width,height]of [[844,390],[667,320]]){const h=setup({weapon:'swords',nativeLayout:true,windowInfo:{windowWidth:width,windowHeight:height}}),c=h.game.combat,b=h.game.playerBounds();c.enemies=[];c.phase=3;c.remaining=0;c.invulnerable=1000;
  for(const [x,y]of [[b.xMin,b.yMin],[b.xMax,b.yMin],[b.xMin,b.yMax],[b.xMax,b.yMax]]){Object.assign(c.player,{x,y});c.resetSwords();c.enemies=[];const dx=x<50?230:-230,dy=y<50?120:-120;enemy(c,dx,dy);c.useSkill();
   for(let i=0;i<200;i++){advance(c,.01);for(const p of c.swordPoses()){const point=c.point(p),a=p.angle*Math.PI/180,hx=Math.abs(Math.cos(a))*p.width/2+Math.abs(Math.sin(a))*p.height/2,hy=Math.abs(Math.sin(a))*p.width/2+Math.abs(Math.cos(a))*p.height/2;assert.ok(point.x-hx>=-1e-6&&point.x+hx<=c.width+1e-6&&point.y-hy>=-1e-6&&point.y+hy<=c.height+1e-6,JSON.stringify({width,height,state:p.state,point,hx,hy}));}}
  }h.game.onUnload();
 }
});
test('bounded coarse updates preserve full flight contact and one-round accounting',()=>{
 const a=fresh(),b=fresh(),ea=enemy(a,300),eb=enemy(b,300);a.strike({direction:{x:1,y:0}});b.strike({direction:{x:1,y:0}});advance(a,2,.1);advance(b,2,.01);near(ea.hp,eb.hp);assert.equal(a.strikeCount,1);assert.equal(b.strikeCount,1);
});
test('relative swept collision catches a fast enemy crossing between sword samples',()=>{
 const c=fresh();enemy(c,300);const f=one(c);until(c,()=>f.state==='slash');const pose=c.swordPose(f),point={x:(pose.blade.base.x+pose.blade.tip.x)/2,y:(pose.blade.base.y+pose.blade.tip.y)/2},origin=c.point(c.player);
 const e=enemy(c,point.x-origin.x-100,point.y-origin.y);c.swordEnemyPrevious.set(e.id,c.point(e));e.x+=200/c.width*100;c.updateSwords(.002);assert.ok(e.hp<1000);const hp=e.hp;c.updateSwords(.002);near(e.hp,hp);
});
test('skill respects shell armor and a vanished target cannot strand a recall',()=>{
 const c=fresh(),e=enemy(c,280,0,{boss:true,bossType:4,shielded:true});assert.ok(c.useSkill());for(let i=0;i<200;i++)c.updateSwords(.01);near(1000-e.hp,c.damage()*3.5*.55);
 const other=fresh(),victim=enemy(other,250);other.useSkill();victim.hp=0;other.collectDeaths();advance(other,1);assert.equal(other.swordSkill,null);assert.ok(other.flyingSwords.every(f=>f.state==='idle'));
});
test('world viewport resizing preserves active swords and empty controller skills explain why no charge was spent',()=>{
 const c=fresh(true);enemy(c,250);one(c);advance(c,.25);const bodies=c.flyingSwords,before=c.swordPoses();c.configureArena(1500,606,1);assert.equal(c.flyingSwords,bodies);assert.deepEqual(c.swordPoses(),before);
 const h=setup({weapon:'swords',nativeLayout:true});h.game.combat.enemies=[];h.game.combat.phase=3;h.game.combat.remaining=0;assert.equal(h.game.castSkill(),false);near(h.game.combat.energy,100);assert.match(h.game.data.message,/暂无目标/);h.game.onUnload();
});
test('all three ordinary-HP core sword journeys finish every stage and controller progression retains its upgrades',()=>{
 const {run}=require('./combat-journey.cjs');for(const seed of [1,17,42]){const r=run('swords',seed,'');assert.equal(r.won,true,JSON.stringify(r));assert.equal(r.stages.length,5);}
 const {runPage}=require('./page-journey.cjs'),r=runPage('swords',42,'');assert.equal(r.ending,true,JSON.stringify(r));assert.equal(r.won,true,JSON.stringify(r));assert.ok(r.choices>=16);assert.deepEqual(r.stages,[1,2,3,4]);assert.ok(r.skills>0);assert.match(r.build,/自动御剑/);
});
