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

test('enemy movement uses equal physical speed horizontally and vertically in a wide arena', () => {
  const c = fresh(); c.configureArena(844, 280, 0.52);
  const horizontal = target(c, 80, 55), vertical = target(c, 50, 85); horizontal.speed = vertical.speed = 52;
  const startH = { ...horizontal }, startV = { ...vertical }; simulate(c, 0.5, false);
  closeTo(c.distance(startH, horizontal), 26); closeTo(c.distance(startV, vertical), 26);
});
test('damage waits for frame 2 and bell hits every enemy in its ring, including boundary', () => {
  const c = fresh(); const a = target(c, 55), b = target(c, 45), edge = target(c, 50 + WEAPONS.bell.range / c.width * 100), outside = target(c, edge.x + 0.001);
  c.update(0.025); assert.ok(c.pendingAttack); closeTo(a.hp, 100); simulate(c, 0.125); closeTo(a.hp, 100);
  simulate(c, 0.05); closeTo(a.hp, 97); closeTo(b.hp, 97); closeTo(edge.hp, 97); closeTo(outside.hp, 100);
});
test('distant enemies never start attacks or consume cooldown', () => {
  const c = fresh(); const e = target(c, 95); simulate(c, 1); assert.equal(c.pendingAttack, null); closeTo(e.hp, 100); closeTo(c.attackCd, 0);
});
test('a moving target can escape the windup; the hit does not home beyond range', () => {
  const c = fresh(); const e = target(c, 55); c.update(0.025); e.x = 95; simulate(c, 0.2);
  closeTo(e.hp, 100); assert.ok(c.effects.some(f => f.type === 'bell'));
});
test('banner blades travel before impact, pierce a line once each and leave the rear and distant targets safe', () => {
  const c = fresh('banner'); const forward = target(c, 57), second = target(c, 65), behind = target(c, 44), far = target(c, 90);
  c.strike({ direction: { x: 1, y: 0 } }); closeTo(forward.hp, 100); assert.equal(c.projectiles.length, 1);
  for (let i = 0; i < 24; i++) c.updateArtifacts(0.025);
  closeTo(forward.hp, 96.4); closeTo(second.hp, 96.4); closeTo(behind.hp, 100); closeTo(far.hp, 100); assert.equal(c.strikeCount, 1);
  const overlap = target(c, c.player.x, c.player.y); c.strike({ direction: { x: 1, y: 0 } }); c.updateArtifacts(0.025); closeTo(overlap.hp, 96.4);
});
test('stacked haste always changes continuous intervals until the explicit cap', () => {
  const c = fresh(); c.attackCd = 1;
  for (let i = 0; i < 6; i++) { const old = c.interval(); assert.ok(c.upgrade('haste')); assert.ok(c.interval() < old); }
  closeTo(c.interval(), 0.52); assert.equal(c.upgrade('haste'), false); assert.ok(!c.upgradePool().some(u => u.kind === 'haste'));
});
test('repeated fire upgrades strengthen burn rather than unrelated base damage', () => {
  const c = fresh(); c.upgrade('fire'); const e = target(c); c.strike({ direction: { x: 1, y: 0 } }); const dps = e.burnDps;
  const initialHp = e.hp; simulate(c, 1, false); closeTo(e.hp, initialHp - dps);
  c.upgrade('fire'); c.strike({ direction: { x: 1, y: 0 } }); assert.ok(e.burnDps > dps); closeTo(c.power, 1);
  assert.equal(c.upgradePool().find(u => u.kind === 'fire').change, '灼烧 26% → 33% / 秒');
});
test('water controls enemy speed, strengthens with tiers, and expires without changing base speed', () => {
  const c = fresh(); c.upgrade('water'); const e = target(c, 59); e.speed = 52; c.strike({ direction: { x: 1, y: 0 } });
  const before = { ...e }; simulate(c, 0.25, false); closeTo(c.distance(e, before), 52 * 0.58 * 0.25);
  e.slowTime = 0; const after = { ...e }; simulate(c, 0.25, false); closeTo(c.distance(e, after), 13); closeTo(e.speed, 52);
  c.upgrade('water'); c.strike({ direction: { x: 1, y: 0 } }); const third = { ...e }; simulate(c, 0.25, false); closeTo(c.distance(e, third), 52 * 0.51 * 0.25);
});
test('earth expands real splash radius and knockback across repeated upgrades', () => {
  const c = fresh('banner'); c.upgrade('earth'); const main = target(c, 57), splash = target(c, 57, 67), distant = target(c, 95);
  c.strike({ direction: { x: 1, y: 0 } }); for (let i = 0; i < 12; i++) c.updateArtifacts(0.025); assert.ok(main.hp < 96); assert.ok(splash.hp < 100); closeTo(distant.hp, 100);
  const firstRadius = c.effects.find(f => f.type === 'earth').radius; c.upgrade('earth'); c.strike({ direction: { x: 1, y: 0 } }); for (let i = 0; i < 12; i++) c.updateArtifacts(0.025);
  assert.ok(c.effects.filter(f => f.type === 'earth').at(-1).radius > firstRadius);
});
test('steam damages an area once per attack even when many struck enemies overlap', () => {
  const c = fresh(); c.upgrade('fire'); c.upgrade('water'); const a = target(c, 55), b = target(c, 56);
  c.strike({ direction: { x: 1, y: 0 } }); closeTo(a.hp, 95.5); closeTo(b.hp, 95.5);
  assert.equal(c.effects.filter(f => f.type === 'steam').length, 1);
});
test('earth/fire and earth/water form distinct persistent fields with bounded accumulation', () => {
  for (const element of ['fire', 'water']) {
    const c = fresh(); c.upgrade('earth'); c.upgrade(element); const e = target(c);
    c.strike({ direction: { x: 1, y: 0 } }); const hp = e.hp; simulate(c, 0.1, false);
    const field = c.hazards.find(h => h.friendly); assert.equal(field.kind, element === 'fire' ? 'lava' : 'mud');
    if (element === 'fire') assert.ok(e.hp < hp); else assert.ok(e.slowTime > 0);
    for (let i = 0; i < 20; i++) c.strike({ direction: { x: 1, y: 0 } }); assert.ok(c.hazards.filter(h => h.friendly).length <= 1); assert.ok(c.effects.length <= 40);
  }
});
test('element cap removes exhausted choices; each offer contains unique, usable upgrades', () => {
  const c = fresh(); for (let i = 0; i < 4; i++) c.upgrade('fire'); assert.equal(c.upgrade('fire'), false);
  for (let i = 0; i < 30; i++) { const choices = c.choices(); assert.equal(choices.length, 3); assert.equal(new Set(choices.map(u => u.id)).size, 3); assert.ok(!choices.some(u => u.kind === 'fire')); }
  c.elements.water = c.elements.earth = 4; while (c.upgrade('haste')) {}
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
  simulate(c, 0.3, false); assert.notEqual(e.x, start); assert.equal(c.hp, 91);
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
    c.hazards = []; boss.castTime = boss.recoverTime = boss.cooldown = 0; boss.hp = boss.maxHp * 0.49; c.update(0.025, false); simulate(c, 0.85, false);
    assert.equal(boss.phase2, true); assert.ok(c.drainEvents().some(e => e.type === 'boss-phase'));
    assert.ok(c.hazards.length >= first.length);
  }
  assert.equal(new Set(signatures).size, 5);
});
test('tortoise takes reduced damage only during second-phase cast armor', () => {
  const c = fresh(); c.stage = 4; const e = target(c, 55, 55, 'boss'); e.bossType = 4; e.hp = 40; e.maxHp = 100; e.cooldown = 0;
  simulate(c, 0.85, false); assert.equal(e.shielded, true);
  const hp = e.hp; c.deal(e, 10); closeTo(e.hp, hp - 5.5); e.castTime = 0; c.update(0.025, false); assert.equal(e.shielded, false);
});
test('heaven cycles all four guardian patterns instead of repeating one attack', () => {
  const c = fresh(); c.stage = 5; const e = c.spawn('boss'); const seen = new Set();
  for (let i = 0; i < 4; i++) { c.hazards = []; c.castPattern(5, e, true); c.hazards.filter(h => h.kind !== 'order').forEach(h => seen.add(h.kind)); }
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


test('weak enemies enter as a compact group, stay away from the player, and die to a basic bell hit', () => {
  const c = new Combat('bell', () => 0.5);
  c.update(0.025, false);
  const pack = c.enemies.filter(e => e.fodder);
  assert.equal(pack.length, 3);
  for (const e of pack) {
    assert.ok(c.distance(e, c.player) >= 150);
    assert.ok(e.hp <= c.damage());
    assert.ok(c.distance(pack[0], e) < 100);
  }
  const anchor = { ...pack[1] }; c.player.x = anchor.x; c.player.y = anchor.y;
  c.strike({ direction: { x: 1, y: 0 } }); c.collectDeaths();
  assert.equal(c.kills, 3); closeTo(c.xp, 1.5);
  c.collectDeaths(); closeTo(c.xp, 1.5);
});

test('mixed waves still spawn ranged and charging threats between weak packs', () => {
  const c = fresh(); c.phase = 0; c.nextWave();
  const kinds = new Set();
  for (let i = 0; i < 3; i++) {
    c.spawnCd = 0; c.advanceWaves(0.025);
    c.enemies.forEach(e => kinds.add(e.kind));
  }
  assert.deepEqual([...kinds].sort(), ['charger', 'ranged', 'wraith']);
});

test('a full swarm reserves a boss slot and does not consume queued enemies when full', () => {
  const c = fresh(); c.enemies = [];
  assert.equal(c.spawnSwarm(99), 23);
  c.phase = 0; c.remaining = 5; c.spawnCd = 0; c.advanceWaves(0.025);
  assert.equal(c.remaining, 5);
  const boss = c.spawn('boss'); assert.ok(boss); assert.equal(c.enemies.length, 24);
  assert.equal(c.spawn('wraith'), null);
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
    advanceEnemyAnimation(e, 0.5); assert.equal(enemyFrame(e), row * 6 + (kind === 'charger' ? 2 : 3));
    if (kind === 'charger') { e.dashing = true; advanceEnemyAnimation(e, 0.025); assert.equal(enemyFrame(e), row * 6 + 3); }
    e.dashing = false; e.castTime = 0; e.recoverTime = 1;
    advanceEnemyAnimation(e, 0.025); assert.equal(enemyFrame(e), row * 6 + 4);
    advanceEnemyAnimation(e, 0.3); assert.equal(enemyFrame(e), row * 6 + 5);
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
  assert.equal(png.readUInt32BE(16), 768); assert.equal(png.readUInt32BE(20), 512);
  assert.ok(png.includes(Buffer.from('tRNS')), 'Enemy sprites need transparency');
  assert.ok(png.length < 200 * 1024, 'Avoid enlarging the content bundle for common enemies');
});

test('all five bosses anticipate, release with their actual hazard, and freeze their animation under ice control', () => {
  const { bossFrame } = require('../game/core/enemy-animation');
  for (let stage = 1; stage <= 5; stage++) {
    const c = fresh(); c.stage = stage;
    const boss = c.spawn('boss'); boss.cooldown = 0;
    c.update(0.025, false); assert.equal(bossFrame(boss), 2);
    simulate(c, 0.5, false); assert.equal(bossFrame(boss), 3);
    simulate(c, 0.75, false); assert.equal(bossFrame(boss), 4, 'release pose follows live hazard for boss ' + stage);
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
