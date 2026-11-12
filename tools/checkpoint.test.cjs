'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Combat}=require('../game/core/combat');
const {createController}=require('../game/src/controller');
const {setup,choose}=require('./game-harness.cjs');
const {CHECKPOINT_KEY,makeCheckpoint,validCheckpoint,restoreCheckpoint,saveCheckpoint,readCheckpoint}=require('../game/core/checkpoint');
test('checkpoint round trips build, world progress and enemy HP while discarding unsafe in-flight attacks',()=>{
  const c=new Combat('swords',()=>.7,{exploration:true});c.stage=4;c.startStage();c.world.prepareNavigation(Infinity);c.phase=3;c.remaining=0;c.enemies=[];c.upgrade('sword-return');c.path='sword-guard';c.hp=63;c.level=8;c.xp=3;c.energy=17;
  const e=c.spawn('boss');e.hp=100;e.phase2=true;c.castPattern(4,e,true);c.world.sites[0].visited=true;c.world.sites[0].used=true;c.world.bossBoon=true;c.world.relic.status='complete';c.damageBySource.direct=25;c.time=140;c.kills=72;
  const saved=makeCheckpoint(c);assert.ok(validCheckpoint(saved));const r=restoreCheckpoint(saved,()=>.1);assert.ok(r);assert.equal(r.hp,63);assert.equal(r.energy,17);assert.equal(r.time,140);assert.equal(r.kills,72);assert.equal(r.enemies[0].hp,100);assert.equal(r.enemies[0].phase2,true);assert.equal(r.path,'sword-guard');assert.equal(r.swordUpgrades.return,1);
  assert.equal(r.hazards.length,0);assert.equal(r.pendingAttack,null);assert.equal(r.enemies[0].castTime,0);assert.ok(r.invulnerable>=1);assert.ok(r.world.sites[0].used&&r.world.bossBoon&&r.world.bossNav.ready);assert.equal(r.flyingSwords.length,4);assert.equal(r.world.relic.status,'complete');
});
test('active relic guardians and completed rewards persist without granting the reward twice',()=>{
  const c=new Combat('banner',()=>.7,{exploration:true});c.enemies=[];Object.assign(c.player,c.percent(c.world.relic));assert.ok(c.chooseRelic('challenge'));
  const r=restoreCheckpoint(makeCheckpoint(c),()=>.2);assert.equal(r.world.relic.status,'active');const e=r.enemies.find(e=>e.relicTrial);assert.ok(e);e.hp=0;r.collectDeaths();assert.equal(r.world.relic.status,'complete');const upgrades={...r.bannerUpgrades};
  const again=restoreCheckpoint(makeCheckpoint(r),()=>.3);again.collectDeaths();assert.deepEqual(again.bannerUpgrades,upgrades);assert.equal(again.chooseRelic('challenge'),false);
});
test('malformed, oversized, incompatible and non-finite checkpoints are rejected without throwing',()=>{
  const good=makeCheckpoint(new Combat('bell'));
  for(const change of [s=>s.version++,s=>s.data.weapon='bad',s=>s.data.hp=NaN,s=>s.data.player.x=101,s=>s.data.elements.fire=5,s=>s.data.eventsTaken=['x'.repeat(70000)],s=>s.data.phase=9,s=>s.data.swordUpgrades.return=-1]){
    const s=structuredClone(good);change(s);assert.equal(validCheckpoint(s),false);assert.equal(restoreCheckpoint(s),null);
  }
  assert.equal(readCheckpoint({getStorageSync(){throw Error('unavailable');}}),null);assert.equal(saveCheckpoint({setStorageSync(){throw Error('full');}},new Combat()),false);
});
test('controller persists earned upgrades, resumes through a fresh controller and clears completed runs',()=>{
  const h=setup({weapon:'swords',exploration:true}),g=h.game;g.combat.hp=71;choose(g,'sword-reach');const xp=g.combat.xp,level=g.combat.level;g.onHide();g.onUnload();
  const next=createController(h.api);assert.equal(next.data.hasCheckpoint,true);assert.equal(next.data.view,'home');assert.ok(next.resumeRun());assert.equal(next.combat.hp,71);assert.equal(next.combat.swordUpgrades.reach,1);assert.equal(next.combat.level,level);assert.equal(next.combat.xp,xp);assert.equal(next.data.selectedWeapon,'swords');
  next.finish(false);assert.equal(h.storage[CHECKPOINT_KEY],null);assert.equal(next.data.hasCheckpoint,false);next.onUnload();
});
test('resuming after a stage reward restores the chosen route rather than offering a duplicate reward',()=>{
  const h=setup({weapon:'swords'}),g=h.game;g.combat.cleared=true;g.combat.enemies=[];g.completeStage();g.selectMemoryReward({currentTarget:{dataset:{reward:'sword-hunt'}}});g.exitToHome();
  const next=createController(h.api,{exploration:false});assert.ok(next.resumeRun());assert.equal(next.data.showMemory,true);assert.equal(next.combat.path,'sword-hunt');assert.equal(next.data.rewardChoices.length,0);next.continueStage();assert.equal(next.combat.stage,2);assert.equal(next.combat.path,'sword-hunt');next.onUnload();g.onUnload();
});
