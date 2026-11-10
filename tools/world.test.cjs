'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Combat}=require('../game/core/combat');
const {WorldState}=require('../game/core/world');
const {isFree,segmentDistance,FlowField}=require('../game/core/world-geometry');
const {setup,touch}=require('./game-harness.cjs');
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function fresh(weapon='bell',stage=1){const c=new Combat(weapon,()=>0.5,{exploration:true});c.configureArena(1550,606,1);c.stage=stage;c.startStage();c.enemies=[];c.phase=3;c.remaining=0;c.drainEvents();return c;}
function advance(c,seconds){for(let t=0;t<seconds-1e-7;t+=.025)c.update(.025,false);}

test('each region has its own large layout, terrain family, connected landmarks and safe entrance',()=>{
  const signatures=new Set();
  for(let stage=1;stage<=5;stage++){
    const w=new WorldState(stage);assert.ok(w.width*w.height>1550*606*8);assert.equal(w.sites.length,3);assert.ok(w.props.length>=35&&w.props.length<=62);assert.ok(isFree(w,w.entry,60));
    w.nav.update(w.entry);for(const s of w.sites){assert.ok(isFree(w,s,28));assert.ok(w.nav.cost[w.nav.index(s)]>=0,s.name);}
    assert.ok(w.props.every(p=>p.sprite>=(stage-1)*3&&p.sprite<stage*3));
    signatures.add(JSON.stringify([w.width,w.height,w.roads,w.pools.map(p=>p.points)]));
  }
  assert.equal(signatures.size,5);
});
test('window changes only the camera viewport and never rescales world positions, weapon range or travel speed',()=>{
  const c=fresh(),p={...c.player},point=c.point(p),size={width:c.width,height:c.height},range=c.attackRange();
  c.configureArena(1515,606,1);assert.deepEqual(c.point(p),point);assert.equal(c.width,size.width);assert.equal(c.height,size.height);near(c.attackRange(),range);
  const camera=c.camera();c.move(c.player,{x:0,y:-1},300);near(c.point(c.player).y-point.y,-300);near(c.camera().y-camera.y,-300);
  c.player.x=0;c.player.y=0;assert.equal(c.camera().x,0);assert.equal(c.camera().y,0);
  c.player.x=100;c.player.y=100;near(c.camera().x,c.width-c.viewWidth);near(c.camera().y,c.height-c.viewHeight);
});
test('controller uses world units for joystick travel and a map overlay freezes combat through backgrounding',()=>{
  const h=setup({exploration:true,nativeLayout:true,windowInfo:{windowWidth:844,windowHeight:390}}),g=h.game,c=g.combat;
  c.enemies=[];c.phase=3;c.remaining=0;const before=c.point(c.player),camera=c.camera(),r=g.joystickRect;
  g.onTouchStart({touches:[touch(r.left+r.width/2,r.top+r.height/2)]});g.onTouchMove({touches:[touch(r.left+r.width/2+64*g.rpxScale,r.top+r.height/2)]});h.frame(50);
  near(c.point(c.player).x-before.x,15);near(c.camera().x-camera.x,15);
  g.openWorldMap();assert.ok(g.data.showWorldMap&&g.data.paused);const time=c.time,p={...g.player};h.simulate(.5);near(c.time,time);assert.deepEqual(g.player,p);
  g.onHide();g.onShow();assert.ok(g.data.showWorldMap&&g.data.paused);g.closeWorldMap();assert.equal(g.data.paused,false);g.onUnload();
});
test('actors slide along terrain and cannot tunnel through a solid prop or walk into a pool',()=>{
  const w=new WorldState(1),prop=w.props.find(p=>isFree(w,{x:p.x-p.radius-35,y:p.y},20));assert.ok(prop);
  const start={x:prop.x-prop.radius-35,y:prop.y},end=w.move(start,400,0,20);assert.ok(end.x<prop.x);assert.ok(isFree(w,end,20));
  const clipped=w.clip(start,{x:prop.x+300,y:prop.y},20);assert.ok(clipped.x<=prop.x-prop.radius-20);assert.ok(clipped.x>=start.x);
  for(const pool of w.pools)assert.equal(isFree(w,{x:pool.x,y:pool.y},20),false);
});
test('flow navigation reaches every authored landmark without crossing collision contours',()=>{
  for(let stage=1;stage<=5;stage++){
    const w=new WorldState(stage);
    for(const site of w.sites){let p={...w.entry},i=0;for(;i<1800&&Math.hypot(p.x-site.x,p.y-site.y)>90;i++){const d=w.steer(p,site);p=w.move(p,d.x*12,d.y*12,20);assert.ok(isFree(w,p,19));}
      assert.ok(i<1800,JSON.stringify({stage,site:site.name,p}));}
  }
});
test('local spawning stays reachable, clear of props, and outside player safety even with a fixed RNG',()=>{
  for(let stage=1;stage<=5;stage++){
    const c=fresh('bell',stage);for(let i=0;i<20;i++)c.spawn('ranged',true);
    assert.ok(c.enemies.length>=12,`stage ${stage}: ${c.enemies.length}`);
    for(const e of c.enemies){assert.ok(c.distance(c.player,e)>=180);assert.ok(c.distance(c.player,e)<=710);assert.ok(isFree(c.world,c.groundPoint(e),28));assert.ok(e.spawnTime>0);}
  }
});
test('distant ordinary enemies reform near the player without new identities, rewards, or stale owned hazards',()=>{
  const c=fresh(),e=c.spawn('ranged');Object.assign(e,{x:5,y:5,hp:4,spawnTime:0});const id=e.id,kills=c.kills,xp=c.xp;
  c.hazard({shape:'line',...e,end:{...c.player},width:30,delay:1,duration:1,owner:id});c.world.update(c);
  assert.equal(e.id,id);assert.equal(e.hp,4);assert.equal(c.kills,kills);assert.equal(c.xp,xp);assert.ok(c.distance(c.player,e)<710);assert.ok(e.spawnTime>0);assert.ok(!c.hazards.some(h=>h.owner===id));
});
test('exploration is discovered once; full resources preserve sites, and each reward can only be collected once',()=>{
  const c=fresh(),w=c.world,health=w.sites.find(s=>s.kind==='health');Object.assign(c.player,c.percent(health));w.update(c);assert.ok(health.visited);assert.equal(w.explored,1);assert.equal(health.used,false);
  c.hp=70;w.update(c);near(c.hp,88);w.update(c);near(c.hp,88);assert.equal(health.used,true);assert.equal(w.explored,1);
  const energy=w.sites.find(s=>s.kind==='energy');Object.assign(c.player,c.percent(energy));w.update(c);assert.equal(energy.used,false);c.energy=1;w.update(c);near(c.energy,51);w.update(c);near(c.energy,51);
  const xp=w.sites.find(s=>s.kind==='xp');Object.assign(c.player,c.percent(xp));const before=c.xp;w.update(c);w.update(c);assert.equal(c.xp,before+4);assert.equal(w.explored,3);
  c.cleared=true;c.advanceStage();assert.equal(c.world.stage,2);assert.equal(c.world.explored,0);assert.ok(c.world.sites.every(s=>!s.used));
});
test('ordinary ranged attacks are clipped by real cover and cannot hurt through it',()=>{
  const c=fresh(),s=c.world.props.find(p=>isFree(c.world,{x:p.x-p.radius-60,y:p.y},24)&&isFree(c.world,{x:p.x+p.radius+100,y:p.y},24));assert.ok(s);
  const e=c.spawn('ranged');Object.assign(e,c.percent({x:s.x-s.radius-60,y:s.y}),{spawnTime:0});Object.assign(c.player,c.percent({x:s.x+s.radius+100,y:s.y}));
  const h=c.lineAtPlayer(e,34,.5,.25,'息','arcane',7);assert.ok(c.point(h.end).x<s.x);h.age=.6;h.active=true;assert.equal(c.contains(h,c.player),false);
});
test('boss attacks keep local physical distances in a large world and tiger pounces stop at terrain',()=>{
  const c=fresh('bell',3),boss=c.spawn('boss');boss.bossType=3;boss.speed=0;c.castPattern(3,boss,true);for(let t=0;t<4.1;t+=.025)c.update(.025,false);
  for(const h of c.hazards.filter(h=>h.fireWave)){near(Math.abs(h.moving.x)*c.width/100,780);assert.ok(Math.abs(h.end.y-h.y)*c.height/100<700);near(h.opening*c.height/100,85);}
  assert.ok(c.hazards.some(h=>h.fireWave));
  const tiger=fresh('bell',2),e=tiger.spawn('boss');e.cooldown=100;tiger.castPattern(2,e,true);const h=tiger.hazards.find(h=>h.pounce);assert.ok(tiger.distance(h,h.end)<=690);
  assert.ok(isFree(tiger.world,tiger.groundPoint({...e,...h.end}),39));
});
test('all three weapons retain real hit distances under the following camera',()=>{
  for(const weapon of ['bell','banner','swords']){
    const c=fresh(weapon),p=c.point(c.player),e=c.spawn('ranged');Object.assign(e,c.percent({x:p.x+100,y:p.y}),{hp:1000,maxHp:1000,speed:0,cooldown:100,spawnTime:0});
    c.strike({direction:{x:1,y:0},targetId:e.id});advance(c,.6);near(e.hp,1000-c.damage());assert.equal(c.strikeCount,1);
  }
});
test('unseen creatures approach before starting an attack, so wind-ups remain visible with the camera',()=>{
  for(const kind of ['ranged','charger','elite','boss']){
    const c=fresh(),e=c.spawn(kind),p=c.point(c.player);Object.assign(e,c.percent({x:p.x,y:p.y-650}),{spawnTime:0,cooldown:0});
    c.updateEnemy(e,.025);assert.equal(c.hazards.length,0);assert.equal(e.castTime,0);
    Object.assign(e,c.percent({x:p.x+150,y:p.y}),{cooldown:0});c.updateEnemy(e,.025);assert.ok(c.hazards.length>0,kind);assert.ok(e.castTime>0,kind);
  }
});
test('large-map journeys terminate and every weapon can win across real joystick, upgrades and stage progression',()=>{
  const {runPage}=require('./page-journey.cjs');
  for(const weapon of ['bell','banner','swords']){
    const results=[1,17,42].map(seed=>runPage(weapon,seed,weapon==='bell'?'echo':weapon==='banner'?'sweep':'','balanced',{windowWidth:844,windowHeight:390},true));
    for(const r of results){assert.equal(r.ending,true,JSON.stringify(r));assert.ok(r.seconds<900,JSON.stringify(r));}
    const wins=results.filter(r=>r.won);assert.ok(wins.length>0,JSON.stringify(results));
    for(const r of wins){assert.deepEqual(r.stages,[1,2,3,4]);assert.ok(r.choices>=16);assert.ok(r.skills>0);assert.equal(r.worldName,'天道四阙');}
  }
});
test('tortoise core openings face walkable ground and boss spawning prefers room to dodge',()=>{
  const c=fresh('bell',4),e=c.spawn('boss');assert.ok(e);const origin=c.point(e);
  for(let i=0;i<6;i++){c.castPattern(4,e,i>2);const p={x:origin.x+Math.cos(e.coreAngle)*140,y:origin.y+Math.sin(e.coreAngle)*140+54};assert.ok(isFree(c.world,p,24));c.hazards=[];}
});
test('water blocks movement and pounces while airborne ordinary breath can cross the shoreline',()=>{
  const c=fresh(),pool=c.world.pools[0];c.world.solids=[pool];const from={x:pool.x-pool.rx-80,y:pool.y},to={x:pool.x+pool.rx+80,y:pool.y};
  const e=c.spawn('ranged');Object.assign(e,c.percent(from),{spawnTime:0});Object.assign(c.player,c.percent(to));
  const h=c.lineAtPlayer(e,34,.5,.25,'息','arcane',7);h.age=.6;h.active=true;assert.equal(c.contains(h,c.player),true);
  const ground=c.world.clip(from,to,20);assert.ok(ground.x<pool.x);
});
test('formation validates the actual fodder footprint and deferred bosses retry rather than leaving an empty final wave',()=>{
  const c=fresh();for(let i=0;i<15;i++){const e=c.spawnFodder();if(e)assert.ok(isFree(c.world,c.groundPoint(e),20));}
  c.enemies=[];c.phase=2;const spawn=c.spawnPoint;c.spawnPoint=()=>null;c.nextWave();assert.equal(c.phase,3);assert.ok(c.bossPending);
  c.spawnPoint=spawn;advance(c,.4);assert.equal(c.bossPending,false);assert.equal(c.enemies.filter(e=>e.boss).length,1);advance(c,.4);assert.equal(c.enemies.filter(e=>e.boss).length,1);
});
test('player footprints cannot be pushed inside edge terrain by the character visibility bounds',()=>{
  const h=setup({weapon:'swords',exploration:true,nativeLayout:true,windowInfo:{windowWidth:844,windowHeight:390}}),g=h.game,c=g.combat,b=g.playerBounds();
  Object.assign(c.player,c.percent(c.world.entry));for(let i=0;i<100;i++){c.move(c.player,{x:-1,y:0},15,b);assert.ok(isFree(c.world,c.groundPoint(c.player),19));}assert.ok(c.player.x>=b.xMin);g.onUnload();
});
test('a tiny isolated navigation pocket never removes the mainland from the pursuit or spawning field',()=>{
  const rect=(x,y,w,h)=>({points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],bounds:{left:x,right:x+w,top:y,bottom:y+h}});
  const world={width:768,height:512,solids:[rect(400,128,32,256),rect(592,128,32,256),rect(400,128,224,32),rect(400,352,224,32)]};
  const nav=new FlowField(world);nav.update({x:512,y:256});assert.equal(nav.components[nav.target],nav.mainComponent);assert.ok(nav.cost[nav.index({x:96,y:256})]>=0);
});
