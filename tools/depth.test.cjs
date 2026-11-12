'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Combat}=require('../game/core/combat');
const {isFree}=require('../game/core/world-geometry');
const {canCast,tacticDirection}=require('../game/core/enemy-tactics');
const {setup}=require('./game-harness.cjs');
test('boss motion supplement has ten transparent runtime frames within its content budget',()=>{
  const png=require('node:fs').readFileSync(require('node:path').join(__dirname,'../cocos-project/assets/game-content/images/boss-motion.png'));
  assert.equal(png.readUInt32BE(16),384);assert.equal(png.readUInt32BE(20),960);assert.ok(png.includes(Buffer.from('tRNS')));assert.ok(png.length<128*1024);
});
function world(stage=1,roll=.6,weapon='swords'){
  const c=new Combat(weapon,()=>roll,{exploration:true});c.stage=stage;c.startStage();c.world.prepareNavigation(Infinity);c.enemies=[];c.phase=0;c.remaining=0;c.invulnerable=1000;c.drainEvents();return c;
}
function arena(path='') {const c=new Combat('swords',()=>.5);c.phase=3;c.remaining=0;c.enemies=[];c.path=path;c.invulnerable=1000;return c;}
function target(c,kind,x=260,y=0){const e=c.spawn(kind),p=c.point(c.player);assert.ok(e);Object.assign(e,c.percent({x:p.x+x,y:p.y+y}),{hp:1000,maxHp:1000,cooldown:100,speed:0,spawnTime:0});return e;}
function advance(c,t){for(let i=0;i<t/.025;i++)c.update(.025,false);}

test('sword upgrades change real reach, cleave and return packets, stay capped, and preserve exactly four swords',()=>{
  const c=arena();target(c,'ranged',445);assert.equal(c.swordTargets().length,0);assert.ok(c.upgrade('sword-reach'));assert.equal(c.swordTargets().length,1);
  for(const key of ['sword-reach','sword-edge','sword-return']){while(c.upgrade(key)){}assert.equal(c.swordUpgrades[key.slice(6)],3);assert.ok(!c.upgradePool().some(o=>o.kind===key));}
  const stats=c.swordTuning();assert.ok(stats.arc>42&&stats.returning>.5&&stats.speed>1080);assert.equal(c.swordPoses().length,4);
  for(const weapon of ['bell','banner']){const other=new Combat(weapon);assert.equal(other.upgrade('sword-reach'),false);assert.ok(!other.upgradePool().some(o=>o.kind.startsWith('sword-')));}
});
test('sword routes are mutually exclusive and hunt targets strong bodies while roaming spreads across the crowd',()=>{
  const c=arena();c.phase=3;c.cleared=true;assert.equal(c.pathChoices().length,3);assert.ok(c.choosePath('sword-hunt'));assert.equal(c.choosePath('sword-roam'),false);c.cleared=false;
  const mob=target(c,'wraith',110),elite=target(c,'elite',300);assert.equal(c.pickSwordTarget(c.flyingSwords[0],[mob,elite]),elite);
  const roam=arena('sword-roam');assert.ok(roam.swordTuning().arc>c.swordTuning().arc);assert.ok(roam.swordTuning().damage<1);assert.ok(c.swordTuning().side<.7);
});
test('return guard requires an effective returned round and reduces only one incoming hit',()=>{
  const c=arena('sword-guard');target(c,'ranged');c.invulnerable=0;advance(c,.5);assert.equal(c.swordGuardTime,0);
  c.strike({direction:{x:1,y:0}});advance(c,1.8);assert.ok(c.swordGuardTime>0);const hp=c.hp;c.hurt(20,'test');assert.ok(Math.abs(hp-c.hp-13)<1e-6);assert.equal(c.swordGuardTime,0);
  c.invulnerable=0;c.hurt(20,'test');assert.ok(Math.abs(hp-c.hp-33)<1e-6);assert.equal(c.swordPoses().length,4);
});
test('all five relics are accessible, optional and vary their offer without changing the authored geography',()=>{
  for(let stage=1;stage<=5;stage++){
    const a=world(stage,.2),b=world(stage,.8),r=a.world.relic;
    assert.ok(isFree(a.world,r,25),r.name);assert.equal(a.world.nav.components[a.world.nav.index(r)],a.world.nav.mainComponent);
    assert.notEqual(r.variant,b.world.relic.variant);assert.deepEqual(a.world.props,b.world.props);assert.equal(a.world.sites.length,3);
    assert.equal(a.chooseRelic('offering'),false);assert.equal(r.status,'ready');
  }
});
test('relic offering cannot kill the player, grants one real exclusive upgrade and cannot be farmed',()=>{
  const c=world(4,.2),r=c.world.relic;Object.assign(c.player,c.percent(r));c.hp=12;assert.equal(c.chooseRelic('offering'),false);
  c.hp=50;assert.ok(c.chooseRelic('offering'));assert.equal(c.hp,38);assert.ok(c.world.bossBoon);assert.equal(Object.values(c.swordUpgrades).reduce((a,b)=>a+b),1);
  assert.equal(c.chooseRelic('offering'),false);assert.equal(c.chooseRelic('essence'),false);assert.equal(c.hp,38);
});
test('trial rewards require the actual guardian death, survive crowds and never duplicate XP or the boon',()=>{
  const c=world(2,.7),r=c.world.relic;Object.assign(c.player,c.percent(r));assert.ok(c.chooseRelic('challenge'));assert.equal(r.status,'active');assert.equal(c.world.bossBoon,false);
  const e=c.enemies.find(e=>e.relicTrial);assert.ok(e&&e.spawnTime>0);e.hp=0;c.collectDeaths();const xp=c.xp,up={...c.swordUpgrades};assert.equal(r.status,'complete');assert.ok(c.world.bossBoon);c.collectDeaths();assert.equal(c.xp,xp);assert.deepEqual(c.swordUpgrades,up);
  const busy=world(1,.7);Object.assign(busy.player,busy.percent(busy.world.relic));busy.enemies=Array.from({length:32},(_,i)=>({id:i+1,hp:1}));assert.equal(busy.chooseRelic('challenge'),false);assert.equal(busy.world.relic.status,'ready');
});
test('safe essence is a separate one-time choice and each relic changes its own boss rule',()=>{
  const c=world(1,.2);Object.assign(c.player,c.percent(c.world.relic));const xp=c.xp;assert.ok(c.chooseRelic('essence'));assert.equal(c.xp,xp+4);assert.equal(c.world.bossBoon,false);assert.equal(c.chooseRelic('essence'),false);
  for(let stage=1;stage<=5;stage++){
    const plain=world(stage),blessed=world(stage);blessed.world.bossBoon=true;
    const a=target(plain,'boss'),b=target(blessed,'boss');plain.castPattern(stage,a,false);blessed.castPattern(stage,b,false);
    if(stage===1)assert.equal(plain.hazards.length-blessed.hazards.length,1);
    if(stage===2)assert.ok(blessed.hazards[0].delay>plain.hazards[0].delay);
    if(stage===3)assert.ok(blessed.hazards[0].duration<plain.hazards[0].duration);
    if(stage===4)assert.ok(blessed.hazards[0].gapHalf>plain.hazards[0].gapHalf);
    if(stage===5)assert.ok(blessed.hazards[0].delay>plain.hazards[0].delay);
  }
});
test('physical pressure opens one root lane per windup; passive burns do not erase the pattern',()=>{
  const c=world(1),e=target(c,'boss');c.castPattern(1,e,false);assert.equal(c.hazards.length,3);
  c.deal(e,80,'burn',false);assert.ok(c.hazards.every(h=>!h.broken));c.deal(e,46,'direct');assert.equal(c.hazards.filter(h=>h.broken).length,1);
  c.deal(e,60,'skill');assert.equal(c.hazards.filter(h=>h.broken).length,1);c.updateHazards(.025);assert.equal(c.hazards.length,2);assert.ok(c.drainEvents().some(e=>e.type==='boss-break'));
});
test('flanking shell pressure cancels one future wave and exposes armor, while frontal hits do not',()=>{
  const c=world(4),e=target(c,'boss');c.castPattern(4,e,true);const p=c.point(e);
  Object.assign(c.player,c.percent({x:p.x-Math.cos(e.coreAngle)*160,y:p.y-Math.sin(e.coreAngle)*160}));c.deal(e,150,'skill');assert.ok(!e.bossPattern.cues.some(q=>q.cancelled));
  Object.assign(c.player,c.percent({x:p.x+Math.cos(e.coreAngle)*160,y:p.y+Math.sin(e.coreAngle)*160}));c.deal(e,70,'direct');assert.equal(e.bossPattern.cues.filter(q=>q.cancelled).length,1);assert.ok(e.shellBrokenTime>0);assert.equal(e.shielded,false);
  c.deal(e,100,'direct');assert.equal(e.bossPattern.cues.filter(q=>q.cancelled).length,1);advance(c,.5);assert.equal(e.shielded,false);
});
test('enemy formations retain the shared player flow target and limit overlapping windups',()=>{
  const c=world(2),elite=target(c,'elite',240),wraith=target(c,'wraith',400,20),ranged=target(c,'ranged',180,-100),charger=target(c,'charger',340,100);
  c.world.nav.update(c.groundPoint(c.player));const goal=c.world.nav.target;tacticDirection(c,wraith);tacticDirection(c,charger);assert.equal(c.world.nav.target,goal);assert.equal(wraith.tactic,'escort');assert.equal(charger.tactic,'flank');
  elite.castTime=1;ranged.castTime=1;assert.equal(canCast(c,charger),false);elite.castTime=0;assert.equal(canCast(c,charger),true);charger.castTime=1;const second=target(c,'charger',350,-100);assert.equal(canCast(c,second),false);
});
test('boss bodies recover between authored attacks instead of holding one casting pose for the full combo',()=>{
  const c=world(3),e=target(c,'boss');c.castPattern(3,e,false);advance(c,2.6);assert.ok(e.bossPattern);assert.ok(e.castTime>0);assert.equal(e.visualState,'recover');
  advance(c,.8);assert.equal(e.attackType,'fire');assert.equal(e.visualState,'cast');advance(c,1);assert.equal(e.visualState,'release');
});
test('relic and build panels freeze combat and invalidate held combat inputs across hide/show',()=>{
  const h=setup({weapon:'swords',exploration:true}),g=h.game,c=g.combat;c.enemies=[];Object.assign(c.player,c.percent(c.world.relic));g.syncCombat();g.openRelic();assert.ok(g.data.showRelic&&g.data.paused);const time=c.time;h.simulate(.3);assert.equal(c.time,time);g.onHide();g.onShow();assert.equal(g.data.paused,true);g.closeRelic();assert.equal(g.data.paused,false);
  g.openBuild();assert.ok(g.data.showBuildDetails);h.simulate(.3);assert.equal(c.time,time);g.closeBuild();assert.equal(g.data.paused,false);g.onUnload();
});
