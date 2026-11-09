'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Combat, WEAPONS, segmentDistance } = require('../game/core/combat');
const { readArchive, duration } = require('../game/core/chronicle');
function fresh(weapon = 'bell') { const c = new Combat(weapon, () => 0.5); c.remaining = 0; c.phase = 3; c.phaseTime = 0; c.drainEvents(); return c; }
function target(c, x = 55, y = 55, kind = 'wraith') {
  const e = c.spawn(kind); Object.assign(e, { x, y, hp: 100, maxHp: 100, speed: 0, cooldown: 100 }); return e;
}
function simulate(c, seconds, attack = true) { for (let i = 0; i < Math.ceil(seconds / 0.025); i++) c.update(0.025, attack); }
function closeTo(a, b, tolerance = 1e-7) { assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`); }

function strike(c, attack) { c.strike(attack); if (c.weapon === 'bell') c.updateBellWaves(0.26); }

test('enemy movement uses equal physical speed horizontally and vertically in a wide arena', () => {
  const c = fresh(); c.configureArena(844, 280, 0.52);
  const horizontal = target(c, 80, 55), vertical = target(c, 50, 85); horizontal.speed = vertical.speed = 52;
  const startH = { ...horizontal }, startV = { ...vertical }; simulate(c, 0.5, false);
  closeTo(c.distance(startH, horizontal), 26); closeTo(c.distance(startV, vertical), 26);
});
test('bell waits for windup, then its traveling front reaches near targets before the outer boundary', () => {
  const c = fresh(); const a = target(c, 55), b = target(c, 45), edge = target(c, 50 + WEAPONS.bell.range / c.width * 100), outside = target(c, edge.x + 0.001);
  c.update(0.025); assert.ok(c.pendingAttack); closeTo(a.hp, 100); simulate(c, 0.125); closeTo(a.hp, 100);
  simulate(c, 0.05); closeTo(a.hp, 100); assert.equal(c.bellWaves.length, 1);
  simulate(c, 0.125, false); closeTo(a.hp, 97); closeTo(b.hp, 97); closeTo(edge.hp, 100);
  simulate(c, 0.175, false); closeTo(edge.hp, 96.1); closeTo(outside.hp, 100);
});
test('distant enemies never start attacks or consume cooldown', () => {
  const c = fresh(); const e = target(c, 95); simulate(c, 1); assert.equal(c.pendingAttack, null); closeTo(e.hp, 100); closeTo(c.attackCd, 0);
});
test('a moving target can escape the windup; the hit does not home beyond range', () => {
  const c = fresh(); const e = target(c, 55); c.update(0.025); e.x = 95; simulate(c, 0.2);
  closeTo(e.hp, 100); assert.ok(c.bellWaves.some(w => w.kind === 'normal'));
});
test('banner blades travel before impact, pierce a line once each and leave the rear and distant targets safe', () => {
  const c = fresh('banner'); const forward = target(c, 57), second = target(c, 65), behind = target(c, 44), far = target(c, 90);
  strike(c, { direction: { x: 1, y: 0 } }); closeTo(forward.hp, 100); assert.equal(c.projectiles.length, 1);
  for (let i = 0; i < 24; i++) c.updateArtifacts(0.025);
  closeTo(forward.hp, 96.4); closeTo(second.hp, 96.4); closeTo(behind.hp, 100); closeTo(far.hp, 100); assert.equal(c.strikeCount, 1);
  const overlap = target(c, c.player.x, c.player.y); strike(c, { direction: { x: 1, y: 0 } }); c.updateArtifacts(0.025); closeTo(overlap.hp, 96.4);
});
test('stacked haste always changes continuous intervals until the explicit cap', () => {
  const c = fresh(); c.attackCd = 1;
  for (let i = 0; i < 5; i++) { const old = c.interval(); assert.ok(c.upgrade('haste')); assert.ok(c.interval() < old); }
  closeTo(c.interval(), 0.52); assert.equal(c.upgrade('haste'), false); assert.ok(!c.upgradePool().some(u => u.kind === 'haste'));
});
test('repeated fire upgrades strengthen burn rather than unrelated base damage', () => {
  const c = fresh(); c.upgrade('fire'); const e = target(c); strike(c, { direction: { x: 1, y: 0 } }); const dps = e.burnDps;
  const initialHp = e.hp; simulate(c, 1, false); closeTo(e.hp, initialHp - dps);
  c.upgrade('fire'); strike(c, { direction: { x: 1, y: 0 } }); assert.ok(e.burnDps > dps); closeTo(c.power, 1);
  assert.equal(c.upgradePool().find(u => u.kind === 'fire').change, '灼烧 26% → 33% / 秒');
});
test('water controls enemy speed, strengthens with tiers, and expires without changing base speed', () => {
  const c = fresh(); c.upgrade('water'); const e = target(c, 59); e.speed = 52; strike(c, { direction: { x: 1, y: 0 } });
  const before = { ...e }; simulate(c, 0.25, false); closeTo(c.distance(e, before), 52 * 0.58 * 0.25);
  e.slowTime = 0; const after = { ...e }; simulate(c, 0.25, false); closeTo(c.distance(e, after), 13); closeTo(e.speed, 52);
  c.upgrade('water'); strike(c, { direction: { x: 1, y: 0 } }); const third = { ...e }; simulate(c, 0.25, false); closeTo(c.distance(e, third), 52 * 0.51 * 0.25);
});
test('earth expands real splash radius and knockback across repeated upgrades', () => {
  const c = fresh('banner'); c.upgrade('earth'); const main = target(c, 57), splash = target(c, 57, 67), distant = target(c, 95);
  strike(c, { direction: { x: 1, y: 0 } }); for (let i = 0; i < 12; i++) c.updateArtifacts(0.025); assert.ok(main.hp < 96); assert.ok(splash.hp < 100); closeTo(distant.hp, 100);
  const firstRadius = c.effects.find(f => f.type === 'earth').radius; c.upgrade('earth'); strike(c, { direction: { x: 1, y: 0 } }); for (let i = 0; i < 12; i++) c.updateArtifacts(0.025);
  assert.ok(c.effects.filter(f => f.type === 'earth').at(-1).radius > firstRadius);
});
test('steam damages an area once per attack even when many struck enemies overlap', () => {
  const c = fresh(); c.upgrade('fire'); c.upgrade('water'); const a = target(c, 55), b = target(c, 56);
  strike(c, { direction: { x: 1, y: 0 } }); closeTo(a.hp, 95.5); closeTo(b.hp, 95.5);
  assert.equal(c.effects.filter(f => f.type === 'steam').length, 1);
});
test('earth/fire and earth/water form distinct persistent fields with bounded accumulation', () => {
  for (const element of ['fire', 'water']) {
    const c = fresh(); c.upgrade('earth'); c.upgrade(element); const e = target(c);
    strike(c, { direction: { x: 1, y: 0 } }); const hp = e.hp; simulate(c, 0.1, false);
    const field = c.hazards.find(h => h.friendly); assert.equal(field.kind, element === 'fire' ? 'lava' : 'mud');
    if (element === 'fire') assert.ok(e.hp < hp); else assert.ok(e.slowTime > 0);
    for (let i = 0; i < 20; i++) strike(c, { direction: { x: 1, y: 0 } }); assert.ok(c.hazards.filter(h => h.friendly).length <= 1); assert.ok(c.effects.length <= 40);
  }
});
test('element cap removes exhausted choices; each offer contains unique, usable upgrades', () => {
  const c = fresh(); for (let i = 0; i < 4; i++) c.upgrade('fire'); assert.equal(c.upgrade('fire'), false);
  for (let i = 0; i < 30; i++) { const choices = c.choices(); assert.equal(choices.length, 3); assert.equal(new Set(choices.map(u => u.id)).size, 3); assert.ok(!choices.some(u => u.kind === 'fire')); }
  c.elements.water = c.elements.earth = 4; while (c.upgrade('haste')) {}
  for (const kind of ['range', 'echo', 'resonance']) while (c.upgrade(kind)) {}
  assert.equal(c.choices().length, 2); // Honest two choices if the entire finite pool is exhausted.
});
test('health changes both maximum and current HP with a cap', () => {
  const c = fresh(); c.hp = 40; c.upgrade('health'); assert.equal(c.maxHp, 120); assert.equal(c.hp, 65);
  c.hp = 120; c.upgrade('health'); assert.equal(c.maxHp, 140); assert.equal(c.hp, 140);
});
test('ranged casters maintain distance and show a harmless warning before a damaging line', () => {
  const c = fresh(); const e = target(c, 65, 55, 'ranged'); e.cooldown = 0; c.update(0.025, false);
  assert.ok(e.castTime > 0); assert.equal(c.hazards[0].shape, 'line'); assert.equal(c.hp, 100);
  simulate(c, 0.75, false); assert.equal(c.hp, 100); simulate(c, 0.2, false); assert.equal(c.hp, 93);
});
test('chargers lock a lane and physically dash only after the warning', () => {
  const c = fresh(); const e = target(c, 75, 55, 'charger'); e.cooldown = 0; const start = e.x; c.update(0.025, false);
  simulate(c, 0.8, false); closeTo(e.x, start); assert.equal(c.hp, 100);
  simulate(c, 0.3, false); assert.notEqual(e.x, start); assert.equal(c.hp, 100);
  simulate(c, 0.3, false); assert.equal(c.hp, 91);
});
test('warning shape matches the collision geometry for circles, rings and diagonal lines', () => {
  const c = fresh(); const h = { shape: 'ring', x: 50, y: 55, radius: 200, inner: 120 };
  assert.equal(c.contains(h, c.player), false); assert.equal(c.contains(h, { x: 50 + 150 / c.width * 100, y: 55 }), true);
  closeTo(segmentDistance({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
  const line = { shape: 'line', x: 40, y: 40, end: { x: 60, y: 70 }, width: 40 }; assert.ok(c.contains(line, { x: 50, y: 55 }));
  c.hazard({ ...line, delay: 1, duration: 1, kind: 'slash' });
  const shown = c.snapshot().hazards[0]; closeTo(shown.width, c.distance(line, line.end) + line.width); closeTo(shown.height, line.width);
});
test('each boss has a distinct base pattern and second phase adds a meaningful threat', () => {
  const signatures = [];
  for (let stage = 1; stage <= 5; stage++) {
    const c = fresh(); c.stage = stage; const boss = c.spawn('boss'); boss.cooldown = 0; c.update(0.025, false);
    const first = c.hazards.map(h => h.kind + ':' + h.shape); signatures.push(first.join(','));
    assert.ok(c.hazards.length); assert.ok(c.hazards.every(h => h.delay >= 0.85)); assert.equal(c.hp, 100);
    c.hazards = []; boss.castTime = boss.recoverTime = boss.cooldown = 0; boss.hp = boss.maxHp * 0.49; c.update(0.025, false);
    assert.ok(c.enrage); assert.equal(c.hazards.length, 0); c.invulnerable = 100;
    simulate(c, 2.6, false);
    assert.equal(boss.phase2, true); assert.ok(c.drainEvents().some(e => e.type === 'boss-phase'));
    assert.ok(c.hazards.length >= first.length);
  }
  assert.equal(new Set(signatures).size, 5);
});
test('tortoise closes its shell while gathering waves and opens it during recovery', () => {
  const c = fresh(); c.stage = 4; const e = target(c, 55, 55, 'boss'); e.bossType = 4; e.hp = 40; e.maxHp = 100; e.cooldown = 0;
  c.invulnerable = 100; simulate(c, 2.6, false); assert.equal(e.shielded, true);
  const hp = e.hp; c.deal(e, 10); closeTo(e.hp, hp - 5.5);
  e.bossPattern.age = e.bossPattern.castEnd + 0.01; c.update(0.025, false); assert.equal(e.shielded, false);
});
test('heaven composes roots and pursuit, then meteor fire and outward sea waves', () => {
  const c = fresh(); c.stage = 5; const e = c.spawn('boss'); const seen = new Set();
  c.invulnerable = 1000;
  for (let i = 0; i < 2; i++) {
    c.hazards = []; c.castPattern(5, e, true); e.cooldown = 100;
    for (let step = 0; step < 360; step++) { c.update(0.025, false); c.hazards.filter(h => h.kind !== 'order').forEach(h => seen.add(h.kind)); }
  }
  assert.deepEqual([...seen].sort(), ['flame', 'root', 'slash', 'tide']);
});
test('escaping a fixed warning avoids damage; standing inside honors invulnerability', () => {
  const c = fresh(); c.circle(c.player, 70, 1, 1.5, '羽', 'flame'); simulate(c, 0.8, false); c.player.x = 80; simulate(c, 1, false); assert.equal(c.hp, 100);
  c.circle(c.player, 70, 1, 1.5, '羽', 'flame'); simulate(c, 1.1, false); assert.equal(c.hp, 90); simulate(c, 0.3, false); assert.equal(c.hp, 90);
});
test('a hit cancels the pending strike and prevents an invisible attack during the hurt clip', () => {
  const c = fresh(); const e = target(c); c.update(0.025); assert.ok(c.pendingAttack); c.hurt(5, 'test'); simulate(c, 0.3, false); closeTo(e.hp, 100); assert.equal(c.pendingAttack, null);
});
test('clearing a wave early advances; timed waves remain bounded and elite then boss appear', () => {
  const c = new Combat('bell', () => 0.5); c.remaining = 0; c.enemies = []; c.update(0.025, false); assert.equal(c.phase, 1);
  c.enemies = []; c.remaining = 0; c.update(0.025, false); assert.equal(c.phase, 2); c.update(0.025, false); assert.ok(c.enemies.some(e => e.kind === 'elite'));
  c.remaining = 0; c.enemies = []; c.update(0.025, false); assert.equal(c.phase, 3); assert.ok(c.enemies.some(e => e.boss));
  const count = c.enemies.length; simulate(c, 0.5, false); assert.equal(c.enemies.length, count);
});
test('death rewards commit once, boss clear removes threats, and next stage retains build with healing', () => {
  const c = fresh(); c.stage = 2; c.phase = 3; c.upgrade('fire'); c.hp = 30;
  const boss = c.spawn('boss'); boss.hp = 0; target(c); c.pendingAttack = {}; c.circle(c.player, 90, 1, 1, '羽', 'flame'); c.collectDeaths();
  assert.equal(c.xp, 5); assert.equal(c.enemies.length, 0); assert.equal(c.hazards.length, 0); assert.equal(c.pendingAttack, null);
  c.collectDeaths(); assert.equal(c.xp, 5); assert.ok(c.advanceStage()); assert.equal(c.stage, 3); assert.equal(c.elements.fire, 1); assert.equal(c.hp, 45);
  assert.equal(c.advanceStage(), false);
});
test('simulation stops after death and does not skip warnings on delayed frames', () => {
  const c = fresh(); c.circle(c.player, 100, 1, 1, '劫', 'arcane'); c.update(10, false); closeTo(c.time, 0.1); assert.equal(c.hp, 100);
  c.hp = 1; c.hurt(5, 'test'); const time = c.time; simulate(c, 5); closeTo(c.time, time); assert.equal(c.lastDamageName, 'test');
});
test('archive tolerates corrupt storage and keeps only valid bounded records without spoilers', () => {
  assert.deepEqual(readArchive({ getStorageSync() { throw Error('unavailable'); } }), { memories: [], enemies: [], runs: [] });
  const archive = readArchive({ getStorageSync: () => ({ memories: [1, 1, 9, '2', 4], enemies: ['wraith', 'bad', 'wraith'], runs: [{}, null, { won: true, weaponId: 'bell', seconds: 125.9, kills: 20, stage: 5, build: '离火1重' }] }) });
  assert.deepEqual(archive.memories, [1, 4]); assert.deepEqual(archive.enemies, ['wraith']); assert.equal(archive.runs.length, 1); assert.equal(archive.runs[0].seconds, 125); assert.equal(duration(125.9), '2:05');
});

test('both weapons can complete all five stages with ordinary HP and actual offered upgrades', () => {
  const { run } = require('./combat-journey.cjs');
  for (const weapon of ['bell', 'banner']) for (const seed of [1, 17, 42]) {
    const result = run(weapon, seed);
    assert.equal(result.won, true, JSON.stringify(result)); assert.equal(result.stages.length, 5);
    assert.ok(result.hp > 0); assert.ok(result.seconds < 900); assert.ok(result.kills > 80);
  }
});


test('weak enemies condense individually away from the player and still die to one basic bell hit', () => {
  const c = new Combat('bell', () => 0.5); c.update(0.025, false);
  assert.equal(c.enemies.length, 1); const e = c.enemies[0]; c.spawnCd = 100;
  assert.ok(e.fodder); assert.ok(c.distance(e, c.player) >= 150); assert.ok(e.hp <= c.damage()); assert.ok(e.spawnTime > 0);
  simulate(c, e.spawnDuration + 0.1, false);
  c.player.x = e.x; c.player.y = e.y; strike(c, { direction: { x: 1, y: 0 } }); c.collectDeaths();
  assert.equal(c.kills, 1); closeTo(c.xp, 0.5); c.collectDeaths(); closeTo(c.xp, 0.5);
});

test('mixed waves interleave single ranged and charging threats among individual weak enemies', () => {
  const c = fresh(); c.phase = 0; c.nextWave(); const kinds = new Set();
  for (let i = 0; i < 10; i++) {
    const before = c.enemies.length; c.spawnCd = 0; c.advanceWaves(0.025);
    assert.equal(c.enemies.length, before + 1); c.enemies.forEach(e => kinds.add(e.kind));
  }
  assert.deepEqual([...kinds].sort(), ['charger', 'ranged', 'wraith']);
});

test('individual spawns reserve a boss slot and leave the queue intact at the cap', () => {
  const c = fresh(); for (let i = 0; i < 31; i++) assert.ok(c.spawnFodder());
  assert.equal(c.spawnFodder(), null); c.phase = 0; c.remaining = 5; c.spawnCd = 0; c.advanceWaves(0.025);
  assert.equal(c.remaining, 5); assert.ok(c.spawn('boss')); assert.equal(c.enemies.length, 32); assert.equal(c.spawn('wraith'), null);
});

test('impact feedback reports effective damage while burns remain quiet and boss timing stays intact', () => {
  const c = fresh(), boss = target(c, 55, 55, 'boss');
  boss.bossType = 4; boss.shielded = true; boss.castTime = 1;
  c.deal(boss, 10, 'skill');
  const number = c.effects.find(f => f.type === 'damage');
  closeTo(number.amount, 5.5); assert.equal(number.heavy, true);
  closeTo(boss.castTime, 1); assert.ok(boss.hitDirection);
  const count = c.effects.length, impacts = c.events.filter(e => e.type === 'impact').length;
  c.deal(boss, 1, 'burn', false);
  assert.equal(c.effects.length, count); assert.equal(c.events.filter(e => e.type === 'impact').length, impacts);
  for (let i = 0; i < 100; i++) { boss.hitTime = 0; c.deal(boss, 0.01); }
  assert.ok(c.effects.length <= 40);
});

test('enemy roles use separate atlas rows and charge, dash and recovery poses follow combat state', () => {
  const { advanceEnemyAnimation, enemyFrame } = require('../game/core/enemy-animation');
  for (const [kind, row] of Object.entries({ wraith: 0, ranged: 1, charger: 2, elite: 3 })) {
    const e = { id: 1, kind, castTime: 0, recoverTime: 0, freezeTime: 0 };
    advanceEnemyAnimation(e, 0.025);
    assert.equal(Math.floor(enemyFrame(e) / 6), row);
    if (kind === 'wraith') {
      const first = enemyFrame(e); advanceEnemyAnimation(e, 0.2); assert.notEqual(enemyFrame(e), first);
      continue;
    }
    e.castTime = 1; advanceEnemyAnimation(e, 0.025); assert.equal(enemyFrame(e), row * 6 + 2);
    advanceEnemyAnimation(e, 0.5); assert.equal(enemyFrame(e), row * 6 + 2);
    if (kind === 'charger') { e.dashing = true; advanceEnemyAnimation(e, 0.025); assert.equal(enemyFrame(e), row * 6 + 3); }
    e.dashing = false; e.castTime = 0; e.recoverTime = 1;
    advanceEnemyAnimation(e, 0.025); assert.ok(enemyFrame(e) % 6 < 2);
    advanceEnemyAnimation(e, 0.3); assert.ok(enemyFrame(e) % 6 < 2);
    e.hitTime = 0.16; assert.equal(enemyFrame(e), row * 6 + 4);
  }
});

test('enemy animation freezes with controller pauses and with enemy ice control', () => {
  const { setup } = require('./game-harness.cjs');
  const { game, simulate } = setup();
  simulate(0.2); const e = game.combat.enemies.find(e => e.fodder); assert.ok(e);
  const age = e.visualAge;
  game.openSettings(); simulate(2); assert.equal(e.visualAge, age);
  game.closeSettings(); e.freezeTime = 2; simulate(0.3); assert.equal(e.visualAge, age);
  e.freezeTime = 0; simulate(0.2); assert.ok(e.visualAge > age);
});

test('enemy animation atlas contains four roles, six frames and actual PNG transparency within content budget', () => {
  const fs = require('node:fs'), path = require('node:path');
  const png = fs.readFileSync(path.join(__dirname, '../cocos-project/assets/game-content/images/enemy-actions.png'));
  assert.equal(png.readUInt32BE(16), 1152); assert.equal(png.readUInt32BE(20), 768);
  assert.ok(png.includes(Buffer.from('tRNS')), 'Enemy sprites need transparency');
  assert.ok(png.length < 300 * 1024, 'Avoid enlarging the content bundle for common enemies');
});

test('all five bosses anticipate, release with their actual hazard, and freeze their animation under ice control', () => {
  const { bossFrame } = require('../game/core/enemy-animation');
  for (let stage = 1; stage <= 5; stage++) {
    const c = fresh(); c.stage = stage;
    const boss = c.spawn('boss'); boss.cooldown = 0;
    c.update(0.025, false); assert.equal(bossFrame(boss), 2);
    simulate(c, 0.5, false); assert.equal(bossFrame(boss), 2);
    simulate(c, 0.75, false); assert.equal(bossFrame(boss), 3, 'release pose follows live hazard for boss ' + stage);
    const age = boss.visualAge, frame = bossFrame(boss);
    boss.freezeTime = 1; simulate(c, 0.2, false);
    assert.equal(boss.visualAge, age); assert.equal(bossFrame(boss), frame);
  }
});

test('boss and spell atlas has five six-frame bosses plus six transparent spell sprites', () => {
  const fs = require('node:fs'), path = require('node:path');
  const png = fs.readFileSync(path.join(__dirname, '../cocos-project/assets/game-content/images/boss-actions.png'));
  assert.equal(png.readUInt32BE(16), 768); assert.equal(png.readUInt32BE(20), 768);
  assert.ok(png.includes(Buffer.from('tRNS'))); assert.ok(png.length < 300 * 1024);
});

test('condensation delays movement, contact and weapon targeting until the body becomes solid', () => {
  const c = fresh(); const e = c.spawn('charger', true); Object.assign(e, { x: 50, y: 55, cooldown: 0 });
  const hp = c.hp, position = { x: e.x, y: e.y };
  c.deal(e, 999); assert.equal(e.hp, e.maxHp);
  simulate(c, 0.2); assert.deepEqual({ x: e.x, y: e.y }, position); assert.equal(c.hp, hp);
  assert.equal(c.hazards.length, 0); assert.equal(c.pendingAttack, null);
  simulate(c, e.spawnDuration); assert.equal(e.spawnTime, 0); assert.ok(c.hazards.length > 0);
});

test('dead bodies are visual only, grant rewards once, expire, and remain bounded during mass kills', () => {
  const c = fresh(); for (let i = 0; i < 10; i++) c.spawnFodder(); for (const e of c.enemies) { e.spawnTime = 0; c.deal(e, 999); }
  c.collectDeaths(); assert.equal(c.enemies.length, 0); assert.equal(c.remnants.length, 10); assert.equal(c.kills, 10); assert.equal(c.xp, 5);
  c.collectDeaths(); assert.equal(c.kills, 10); assert.equal(c.xp, 5);
  c.advanceRemnants(0.7); assert.equal(c.remnants.length, 0);
  c.leaveRemnant({ id: 100, x: 50, y: 50, kind: 'boss', boss: true, bossType: 1 });
  for (let i = 0; i < 80; i++) c.leaveRemnant({ id: i, x: 10, y: 10, kind: 'wraith' });
  assert.equal(c.remnants.length, 28); assert.ok(c.remnants.some(e => e.boss));
  c.advanceRemnants(2); assert.equal(c.remnants.length, 0);
});

test('the new boss and chaos mist atlas keeps all five silhouettes and six VFX within the art budget', () => {
  const png = require('node:fs').readFileSync(require('node:path').join(__dirname, '../cocos-project/assets/game-content/images/chaos-boss-actions.png'));
  assert.equal(png.readUInt32BE(16), 1152); assert.equal(png.readUInt32BE(20), 1152);
  assert.ok(png.includes(Buffer.from('tRNS'))); assert.ok(png.length < 550 * 1024);
});

test('single-spawn cadence consumes one queued enemy and never backfills a group on delayed frames', () => {
  const c = new Combat('bell', () => 0.5); c.update(0.025, false);
  assert.equal(c.enemies.length, 1); assert.equal(c.remaining, 16);
  simulate(c, 0.2, false); assert.equal(c.enemies.length, 1);
  c.spawnCd = 0; c.update(0.1, false); assert.equal(c.enemies.length, 2); assert.equal(c.remaining, 15);
  assert.ok(c.enemies.every(e => e.hp <= c.damage()));
});

test('map spawns occupy distinct interior positions while keeping a player exclusion radius', () => {
  const { random } = require('./journey-policy.cjs'); const c = new Combat('bell', random(42));
  for (let i = 0; i < 12; i++) { c.spawnCd = 0; c.remaining = 20; c.advanceWaves(0.025); }
  assert.equal(c.enemies.length, 12);
  for (const e of c.enemies) {
    assert.ok(c.distance(e, c.player) >= 150); assert.ok(e.x > 4 && e.x < 96 && e.y > 8 && e.y < 92);
  }
  assert.ok(c.enemies.some(e => e.x > 25 && e.x < 75 && e.y > 25 && e.y < 75), 'Spawns must not be confined to map edges');
  for (let i = 0; i < c.enemies.length; i++) for (let j = i + 1; j < c.enemies.length; j++) assert.ok(c.distance(c.enemies[i], c.enemies[j]) >= 60);
});

test('vines spread outwards before damage and bind, block movement briefly, and cannot repeatedly bind', () => {
  const c = fresh(), start = { ...c.player };
  c.circle({ x: c.player.x - 60 / c.width * 100, y: c.player.y }, 80, 0.5, 2.1, '藤', 'root', 9);
  const h = c.hazards[0]; h.age = 0.5 + 0.325;
  c.updateHazards(0); assert.equal(c.hp, 100); assert.equal(c.rootTime, 0);
  c.updateHazards(0.3); assert.equal(c.hp, 91); assert.ok(c.rootTime > 0); assert.equal(c.snapshot().rooted, true);
  c.move(c.player, { x: 1, y: 0 }, 100); assert.deepEqual(c.player, start);
  assert.equal(c.useSkill(), true, 'Movement-only control must not block active skills');
  simulate(c, 0.9, false); assert.equal(c.rootTime, 0); c.updateHazards(0); assert.equal(c.rootTime, 0);
  assert.equal(c.events.filter(e => e.type === 'rooted').length, 1);
  c.move(c.player, { x: 1, y: 0 }, 10); assert.ok(c.player.x > start.x);
});

test('root growth matches the rendered radial front and never fills a ring safe hole', () => {
  const { vineGrowth, vineRadius, vinePaths } = require('../game/core/vines'); const c = fresh();
  const h = { id: 1, kind: 'root', shape: 'ring', x: 50, y: 55, radius: 200, inner: 145, delay: 1, age: 1.325 };
  closeTo(vineGrowth(h), 0.5); closeTo(vineRadius(h), 172.5);
  assert.equal(c.contains(h, h), false);
  assert.equal(c.contains(h, { x: h.x + 160 / c.width * 100, y: h.y }), true);
  assert.equal(c.contains(h, { x: h.x + 190 / c.width * 100, y: h.y }), false);
  for (const path of vinePaths(h)) for (const p of path.points) assert.ok(Math.hypot(p.x, p.y) >= 145 - 1e-6 && Math.hypot(p.x, p.y) <= 200 + 1e-6);
});

test('invulnerability prevents vine binding and losing its source releases existing roots', () => {
  const c = fresh(), caster = c.spawn('boss');
  c.circle(c.player, 66, 0.1, 2, '藤', 'root', 9, caster.id);
  c.invulnerable = 0.5; c.updateHazards(0.2); assert.equal(c.rootTime, 0); assert.equal(c.hp, 100);
  c.invulnerable = 0; c.updateHazards(0.1); assert.ok(c.rootTime > 0);
  caster.hp = 0; c.collectDeaths(); assert.equal(c.rootTime, 0);
  c.startStage(); assert.equal(c.rootTime, 0); assert.equal(c.rootImmunity, 0);
});

test('phoenix meteors lock harmless warnings, impact once, and leave weaker persistent burning ground', () => {
  const c = fresh(); c.castPattern(3, null, false); const h = c.hazards[0];
  assert.equal(c.hazards.length, 3); assert.ok(c.hazards.every(h => h.meteor && h.kind === 'flame'));
  c.hazards = [h]; h.age = h.delay - 0.1; c.updateHazards(0.01); assert.equal(c.hp, 100);
  c.updateHazards(0.1); assert.equal(c.hp, 89); assert.equal(h.impactHit, true);
  c.invulnerable = 0; c.updateHazards(0.1); assert.equal(c.hp, 89, 'The same meteor cannot hit twice during its impact window');
  c.updateHazards(0.3); assert.equal(c.hp, 85); assert.equal(c.lastDamageName, '余烬焚地');
  c.player.x = 90; c.player.y = 20; c.invulnerable = 0; c.updateHazards(0.2); assert.equal(c.hp, 85);
  c.updateHazards(h.duration); assert.equal(c.hazards.length, 0);
});

test('entering an existing fire patch causes burn damage without a delayed meteor impact', () => {
  const c = fresh(); c.castPattern(3, null, true); assert.equal(c.hazards.filter(h => h.meteor).length, 5);
  const h = c.hazards[0]; c.hazards = [h]; h.age = h.delay + 0.6;
  c.updateHazards(0); assert.equal(c.hp, 96); assert.equal(c.lastDamageName, '余烬焚地');
  assert.equal(h.impactHit, undefined);
  const { meteorPhase } = require('../game/core/meteor');
  assert.equal(meteorPhase({ age: 0.9, delay: 1 }), 'falling');
  assert.equal(meteorPhase({ age: 1.1, delay: 1 }), 'impact');
  assert.equal(meteorPhase({ age: 1.4, delay: 1 }), 'burning');
});
