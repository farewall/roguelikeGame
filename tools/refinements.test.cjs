'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Combat, WEAPONS, PLAYER_SPEED } = require('../game/core/combat');
const { setup, touch } = require('./game-harness.cjs');
const { runPage } = require('./page-journey.cjs');
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
function fresh(weapon = 'bell') { const c = new Combat(weapon, () => 0.5); c.phase = 3; c.remaining = 0; c.enemies = []; c.drainEvents(); return c; }
function enemy(c, x = 55, y = 55, kind = 'wraith') { const e = c.spawn(kind); Object.assign(e, { x, y, hp: 100, maxHp: 100, speed: 0, cooldown: 99 }); return e; }
function advance(c, seconds) { for (let i = 0; i < Math.ceil(seconds / 0.025); i++) c.update(0.025, false); }
const hit = (c, targetId) => { c.strike({ direction: { x: 1, y: 0 }, targetId }); if (c.weapon === 'bell') c.updateBellWaves(0.26); };
function path(c, id) { c.stage = 1; c.cleared = true; assert.ok(c.choosePath(id)); c.cleared = false; }

test('player travel and relative enemy speed are invariant across both viewport sizes', () => {
  const ratios = [];
  for (const [w, h] of [[844, 390], [667, 320]]) {
    const { game, advance: frame } = setup({ windowInfo: { windowWidth: w, windowHeight: h }, arenaRect: { left: 20, top: 50, width: w - 40, height: h - 100 } });
    const start = { ...game.player }; game.onTouchStart({ touches: [touch(100, 200)] }); game.onTouchMove({ touches: [touch(148, 200)] }); frame();
    const travel = game.combat.distance(start, game.player); near(travel, PLAYER_SPEED * 0.032);
    const e = enemy(game.combat, 85); e.speed = 52; const before = { ...e }; game.combat.updateEnemy(e, 0.032);
    ratios.push(travel / game.combat.distance(before, e)); game.onUnload();
  }
  near(ratios[0], ratios[1]); near(ratios[0], PLAYER_SPEED / 52);
});
test('bell reactions follow first physical wave contact, independently of target ID and spawn order', () => {
  for (const reversed of [false, true]) for (const lockFar of [false, true]) {
    const c = fresh(); c.elements = { fire: 1, water: 1, earth: 1 };
    const a = enemy(c, 54), b = enemy(c, 60), outside = enemy(c, 65); c.enemies = reversed ? [b, a, outside] : [a, b, outside];
    hit(c, lockFar ? b.id : a.id); const center = c.effects.find(f => f.type === 'steam'); near(center.x, 54);
    near(outside.hp, 100); assert.ok(a.fractureTime > 0 && b.fractureTime > 0);
  }
});
test('fallback targeting is deterministic if the original locked enemy dies before impact', () => {
  const c = fresh(); c.elements.fire = c.elements.water = 1; const a = enemy(c, 54), b = enemy(c, 60); a.hp = 0;
  hit(c, a.id); near(c.effects.find(f => f.type === 'steam').x, 60);
});
test('third element preserves both area damage and area slow, including enemies outside the basic attack', () => {
  const c = fresh(); c.elements.earth = c.elements.water = 1; const a = enemy(c, 57), outside = enemy(c, 63);
  hit(c, a.id); assert.equal(c.hazards[0].kind, 'mud'); c.upgrade('fire'); hit(c, a.id);
  const field = c.hazards.find(h => h.friendly); assert.equal(field.kind, 'confluence'); assert.equal(field.slow, true); assert.ok(field.dps > 0);
  outside.slowTime = 0; const hp = outside.hp; c.updateHazards(0.1); assert.ok(outside.slowTime > 0); assert.ok(outside.hp < hp);
  assert.equal(c.snapshot().comboName, '蒸腾 + 熔沼'); assert.ok(c.upgradePool().filter(u => ['fire', 'water', 'earth'].includes(u.kind)).every(u => u.combo.includes('三元同效')));
});
test('tortoise armor treats direct, burn, field and followup damage uniformly', () => {
  const c = fresh(); const e = enemy(c, 55, 55, 'boss'); Object.assign(e, { bossType: 4, phase2: true, castTime: 3, shielded: true });
  c.deal(e, 10); near(100 - e.hp, 5.5); e.hp = 100; e.hitTime = 0; e.burnTime = 1; e.burnDps = 10;
  c.updateEnemy(e, 0.1); near(100 - e.hp, 0.55); assert.equal(e.hitTime, 0);
  e.hp = 100; c.hazard({ shape: 'circle', x: e.x, y: e.y, radius: 100, delay: 0, duration: 1, friendly: true, dps: 10 });
  c.updateHazards(0.1); near(100 - e.hp, 0.55); e.hp = 100;
  c.followups = [{ kind: 'echo', center: { ...e }, radius: 100, remaining: 0, damage: 10 }]; c.updateFollowups(0.01); near(100 - e.hp, 5.5);
});
test('fire tier two spreads burning on death and tier four can chain without duplicate rewards', () => {
  const c = fresh(); c.elements.fire = 2; const a = enemy(c), b = enemy(c, 60), far = enemy(c, 90); a.hp = 0; a.burnTime = 2; a.burnDps = 1;
  c.collectDeaths(); assert.ok(b.burnTime > 0); assert.equal(far.burnTime, 0); assert.equal(c.xp, 1);
  const chain = fresh(); chain.elements.fire = 4; const first = enemy(chain, 54), second = enemy(chain, 59), third = enemy(chain, 64);
  first.hp = 0; first.burnTime = 2; first.burnDps = 2; second.hp = third.hp = 1;
  chain.collectDeaths(); assert.equal(chain.enemies.length, 0); assert.equal(chain.xp, 3); chain.collectDeaths(); assert.equal(chain.xp, 3);
  assert.ok(chain.damageBySource.ignite > 0);
});
test('water tier two reaches enemies with a third-hit pulse and tier four briefly freezes them', () => {
  for (const tier of [2, 4]) {
    const c = fresh(); c.elements.water = tier; const a = enemy(c, 54), outside = enemy(c, 50 + (c.attackRange() + 10) / c.width * 100, 55, 'ranged');
    hit(c, a.id); hit(c, a.id); assert.equal(outside.slowTime, 0); hit(c, a.id); assert.ok(outside.slowTime > 0);
    if (tier === 4) { assert.ok(outside.freezeTime > 0); outside.cooldown = 0; const hazards = c.hazards.length; c.updateEnemy(outside, 0.1); assert.equal(c.hazards.length, hazards); }
  }
});
test('bell earth fractures enemies for stronger echoes, with tier-four echo stagger', () => {
  for (const tier of [2, 4]) {
    const c = fresh(); c.elements.earth = tier; const a = enemy(c); hit(c, a.id);
    assert.ok(a.fractureTime > 2); const hp = a.hp;
    c.launchBellWave({ ...c.player }, { kind: 'echo', damage: 1 }); c.updateBellWaves(0.26);
    near(hp - a.hp, 1 + a.fractureStrength);
    if (tier === 4) assert.ok(a.freezeTime > 0);
  }
});
test('milestone descriptions announce the new mechanism before selection', () => {
  const c = fresh();
  for (const tier of [1, 3]) {
    c.elements = { fire: tier, water: tier, earth: tier };
    const pool = c.upgradePool(); assert.ok(pool.find(u => u.kind === 'fire').desc.includes(tier === 1 ? '传火' : '爆燃'));
    assert.ok(pool.find(u => u.kind === 'water').desc.includes(tier === 1 ? '水环' : '冰封'));
    assert.ok(pool.find(u => u.kind === 'earth').desc.includes(tier === 1 ? '碎甲' : '震慑'));
  }
});
test('bell echo and ward paths have distinct behavior and cannot be switched or stacked', () => {
  for (const id of ['echo', 'ward']) {
    const c = fresh(); path(c, id); assert.equal(c.choosePath(id), false); const a = enemy(c, 54);
    hit(c, a.id); hit(c, a.id);
    if (id === 'echo') { assert.equal(c.followups.length, 1); advance(c, 0.55); assert.ok(c.damageBySource.echo > 0); }
    else { assert.equal(c.wardTime, 0); hit(c, a.id); assert.equal(c.wardTime, 5); c.hurt(10, 'test'); near(c.hp, 94); assert.equal(c.wardTime, 0); c.invulnerable = 0; c.hurt(10, 'test'); near(c.hp, 84); }
  }
});
test('banner crowd path widens the flying volley while rend specializes against elites', () => {
  const degrees = 40 * Math.PI / 180;
  for (const id of ['sweep', 'rend']) {
    const c = fresh('banner'); path(c, id); const diagonal = enemy(c, 50 + Math.cos(degrees) * 120 / c.width * 100, 55 + Math.sin(degrees) * 120 / c.height * 100);
    const normal = enemy(c, 55), elite = enemy(c, 56, 55, 'elite'); hit(c, normal.id);
    const count = c.projectiles[0].bolts.length; for (let i = 0; i < 24; i++) c.updateArtifacts(0.025);
    assert.equal(diagonal.hp < 100, id === 'sweep'); near(100 - normal.hp, WEAPONS.banner.damage); near(100 - elite.hp, WEAPONS.banner.damage * (id === 'rend' ? 1.3 : 1));
    assert.equal(count, id === 'sweep' ? 5 : 1);
  }
});
test('tiger exposes a damage window only when its charge misses the player', () => {
  for (const dodge of [true, false]) {
    const c = fresh(); c.stage = 2; const boss = enemy(c, 75, 55, 'boss'); boss.cooldown = 0; c.update(0.025, false);
    if (dodge) c.player.y = 80; advance(c, 1.5); assert.equal(boss.chargeHit, !dodge);
    const hp = boss.hp; c.deal(boss, 10); near(hp - boss.hp, dodge ? 13.5 : 10);
    assert.equal(c.snapshot().boss.state.includes('易伤'), dodge);
  }
});
test('phoenix locks each falling feather and lets its persistent fire fade before the next wave', () => {
  const c = fresh(); c.stage = 3; const boss = enemy(c, 80, 50, 'boss'); c.castPattern(3, boss, true);
  const h = c.hazards[0]; near(h.x, c.player.x); near(h.y, c.player.y); assert.ok(h.duration >= 2);
  const locked = { x: h.x, y: h.y }; c.player.x = 10; advance(c, 2.7); assert.ok(c.hazards.includes(h)); assert.deepEqual({ x: h.x, y: h.y }, locked);
});
test('camp event is fixed once drawn and both blood payment and duplicate resolution are guarded', () => {
  const c = fresh(); c.stage = 2; c.cleared = true; c.random = () => 0.45; c.hp = 12;
  const event = c.createEncounter(); c.random = () => 0.9; assert.equal(c.createEncounter(), event); assert.equal(c.resolveEncounter('offering'), false);
  assert.ok(c.resolveEncounter('insight')); assert.equal(c.resolveEncounter('insight'), false); assert.equal(c.elements.earth, 1);
});
test('optional elite trial adds a real encounter and awards its bonus only once', () => {
  const c = fresh(); c.stage = 2; c.cleared = true; c.random = () => 0.9; c.hp = 50;
  c.createEncounter(); assert.ok(c.resolveEncounter('trial')); assert.ok(c.advanceStage()); const trial = c.enemies.find(e => e.trial); assert.ok(trial);
  trial.hp = 0; c.collectDeaths(); assert.equal(c.xp, 9); assert.equal(c.hp, 75); assert.equal(c.trialCleared, true); c.collectDeaths(); assert.equal(c.xp, 9);
});
test('memory rewards pause the world, reject invalid IDs and apply once before continuation', () => {
  const { game } = setup(); game.combat.cleared = true; game.completeStage();
  game.continueStage(); assert.equal(game.combat.stage, 1); game.selectMemoryReward({ currentTarget: { dataset: { reward: 'rend' } } }); assert.equal(game.combat.path, '');
  game.selectMemoryReward({ currentTarget: { dataset: { reward: 'ward' } } }); assert.equal(game.combat.path, 'ward');
  game.selectMemoryReward({ currentTarget: { dataset: { reward: 'echo' } } }); assert.equal(game.combat.path, 'ward');
  game.continueStage(); assert.equal(game.combat.stage, 2);
});
test('pausing freezes delayed echoes and quakes without losing or duplicating them', () => {
  const { game, simulate } = setup(); const c = game.combat; c.followups.push({ kind: 'echo', center: { ...c.player }, radius: 100, remaining: 0.4, damage: 1 });
  game.openSettings(); simulate(10); near(c.followups[0].remaining, 0.4); game.closeSettings(); simulate(0.5); assert.equal(c.followups.length, 0);
});
test('controller snapshots contain only display fields and use no native page bridge or intervals', () => {
  const { game, simulate, dataWrites } = setup(); const c = game.combat; c.attackCd = 100; simulate(0.1);
  assert.ok(dataWrites.some(p => 'enemies' in p));
  assert.ok(!Object.hasOwn(game.data.enemies[0] || {}, 'cooldown'));
  assert.equal(typeof game.createSelectorQuery, 'undefined');
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../game/src/controller.js'), 'utf8');
  assert.ok(!source.includes('setInterval(')); assert.ok(!source.includes('Page('));
});
test('summary reports damage sources and hurt causes, caps overkill, and persists details', () => {
  const { game, storage } = setup(); const c = game.combat; const e = enemy(c); e.hp = 2; c.deal(e, 10, 'steam'); c.hurt(5, '火羽焚地'); game.finish(false);
  assert.equal(game.data.runReport.total, 2); assert.ok(game.data.runReport.damage.includes('蒸腾 100%')); assert.equal(game.data.runReport.cause, '主要受伤：火羽焚地');
  assert.ok(storage['pangu.archive.v1'].runs[0].detail.includes('蒸腾')); assert.ok(!game.data.endingCopy.includes('重演地火风水'));
});
test('a delayed page frame caps both movement and simulation at the same elapsed time', () => {
  const { game, elapse } = setup(); game.onTouchStart({ touches: [touch(100, 200)] }); game.onTouchMove({ touches: [touch(148, 200)] });
  const start = { ...game.player }; elapse(250); game.tick(); game.moveFrame();
  near(game.combat.time, 0.05); near(game.combat.distance(start, game.player), PLAYER_SPEED * 0.05);
});
test('a caster killed by burning cannot land its expiring warning in the same step', () => {
  const c = fresh(); const caster = enemy(c, 80, 55, 'ranged'); caster.hp = 0.01; caster.burnDps = 10; caster.burnTime = 1;
  c.circle(c.player, 100, 0.01, 1, '劫', 'arcane', 10, caster.id); advance(c, 0.025);
  assert.equal(c.hp, 100); assert.equal(c.hazards.length, 0); assert.equal(c.xp, 1);
});
test('incoming damage statistics count lost HP and not lethal overkill', () => {
  const c = fresh(); c.hp = 1; c.hurt(15, '裂界扑杀'); assert.equal(c.damageTaken, 1); assert.equal(c.damageByCause['裂界扑杀'], 1);
});
test('four weapon routes exercise actual page wins and losses across the same three seeds', () => {
  for (const [weapon, id, build] of [['bell', 'echo', 'fire'], ['bell', 'ward', 'water'], ['banner', 'sweep', 'earth'], ['banner', 'rend', 'balanced']]) {
    let wins = 0;
    for (const seed of [1, 17, 42]) {
      const r = runPage(weapon, seed, id, build); assert.ok(r.ending, JSON.stringify(r)); assert.equal(r.path, id); assert.ok(r.wallSeconds > r.seconds);
      if (r.won) { wins++; assert.deepEqual(r.stages, [1, 2, 3, 4]); assert.equal(r.rewards, 2); assert.ok(r.choices >= 12); assert.ok(r.skills >= 5); }
      else assert.ok(r.cause);
    }
    assert.ok(wins > 0, id + ' had no complete ordinary-HP runs');
  }
});
