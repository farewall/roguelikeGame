'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Combat } = require('../game/core/combat');
const { BELL } = require('../game/core/bell');
const { setup } = require('./game-harness.cjs');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fresh() { const c = new Combat('bell', () => 0.5); c.phase = 3; c.remaining = 0; c.enemies = []; c.drainEvents(); return c; }
function enemy(c, dx, kind = 'wraith') { const e = c.spawn(kind); Object.assign(e, { x: c.player.x + dx / c.width * 100, y: c.player.y, hp: 100, maxHp: 100, speed: 0, cooldown: 100 }); return e; }
function strike(c) { c.strike({ direction: { x: 1, y: 0 } }); }

test('bell wave propagates, hits once, and reserves the outer quarter for resonance damage', () => {
  const c = fresh(), a = enemy(c, 80), outer = enemy(c, 120), edge = enemy(c, 160), outside = enemy(c, 161);
  strike(c); near(a.hp, 100); c.updateBellWaves(0.1); near(a.hp, 100);
  c.updateBellWaves(0.025); near(a.hp, 97); near(outer.hp, 100);
  c.updateBellWaves(0.125); near(outer.hp, 96.1); near(edge.hp, 96.1); near(outside.hp, 100);
  c.updateBellWaves(0.1); near(a.hp, 97); near(edge.hp, 96.1); assert.equal(c.strikeCount, 1);
  assert.ok(c.battleReport().damage.includes('共鸣'));
});
test('moving away can escape a wave and new enemies appearing behind its front are not hit', () => {
  const c = fresh(), escaped = enemy(c, 120); strike(c); c.updateBellWaves(0.1);
  escaped.x = c.player.x + 200 / c.width * 100; const newborn = enemy(c, 20);
  c.updateBellWaves(0.2); near(escaped.hp, 100); near(newborn.hp, 100); assert.equal(c.strikeCount, 0);
});
test('normal sound waves keep their release origin and damage snapshot, and do not push bosses', () => {
  const c = fresh(), boss = enemy(c, 80, 'boss'), origin = { ...c.player }, position = { x: boss.x, y: boss.y };
  strike(c); c.player.x += 25; c.power = 10; c.updateBellWaves(0.2);
  near(boss.hp, 97); near(boss.x, position.x); near(boss.y, position.y); assert.deepEqual(c.bellWaves[0].origin, origin);
});
test('effective normal waves count once each and empty casts cannot earn charge or echoes', () => {
  const c = fresh(); c.energy = 0; strike(c); c.updateBellWaves(0.26); near(c.energy, 0); assert.equal(c.strikeCount, 0);
  const a = enemy(c, 40), b = enemy(c, 120); strike(c);
  c.updateBellWaves(0.1); near(c.energy, 12); c.updateBellWaves(0.15); near(c.energy, 12); assert.equal(c.strikeCount, 1);
  near(a.hp, 97); near(b.hp, 96.1);
});
test('third effective bell releases its echo from the current player center after retreating', () => {
  const c = fresh(), e = enemy(c, 45);
  for (let i = 0; i < 3; i++) { strike(c); c.updateBellWaves(0.26); }
  const f = c.followups.find(f => f.kind === 'bell-echo'); assert.ok(f); assert.equal(c.snapshot().bellMarks, 0);
  const origin = { ...f.center }, hp = e.hp; c.player.x = 90;
  c.updateFollowups(BELL.echoDelay); c.updateBellWaves(0.26);
  near(e.hp, hp); assert.equal(c.strikeCount, 3); assert.equal(c.followups.length, 0);
  const echo = c.bellWaves.find(w => w.kind === 'echo'); assert.ok(echo); assert.deepEqual(echo.origin, c.player); assert.notDeepEqual(echo.origin, origin);
});
test('echo path uses two hit marks and a wider stronger echo; ward reduces one hit and repels nearby ordinary enemies', () => {
  const c = fresh(); c.path = 'echo'; enemy(c, 50);
  for (let i = 0; i < 2; i++) { strike(c); c.updateBellWaves(0.26); }
  assert.equal(c.followups[0].radius, 190); near(c.followups[0].damage, c.damage() * 0.65);
  const ward = fresh(); ward.path = 'ward'; const a = enemy(ward, 35), boss = enemy(ward, 90, 'boss');
  for (let i = 0; i < 3; i++) { strike(ward); ward.updateBellWaves(0.26); }
  near(ward.wardTime, 5); const before = { ...a }, bossX = boss.x; ward.hurt(10, 'test');
  near(ward.hp, 94); assert.ok(ward.distance(a, before) > 20); near(boss.x, bossX); near(ward.wardTime, 0);
});
test('dominion protects immediately then releases a traveling interrupt; released boss hazards survive', () => {
  const c = fresh(), caster = enemy(c, 100, 'ranged'), boss = enemy(c, 200, 'boss'); caster.castTime = boss.castTime = 2;
  c.circle(c.player, 40, 1, 2, '符', 'arcane', 7, caster.id); c.circle(c.player, 50, 1, 2, '藤', 'root', 9, boss.id);
  c.useSkill(); assert.ok(c.invulnerable >= 0.55); c.hurt(10, 'test'); near(c.hp, 100); near(caster.hp, 100);
  c.updateFollowups(0.1); assert.equal(c.bellWaves.length, 0); c.updateFollowups(0.025); near(caster.hp, 100);
  c.updateBellWaves(0.1); near(caster.hp, 91.6); assert.equal(caster.castTime, 0); assert.ok(!c.hazards.some(h => h.owner === caster.id));
  c.updateBellWaves(0.1); near(boss.hp, 91.6); assert.equal(boss.castTime, 2); assert.ok(c.hazards.some(h => h.owner === boss.id));
});
test('bell fire and water retain their identities while earth makes subsequent echoes stronger', () => {
  const c = fresh(); c.elements = { fire: 1, water: 1, earth: 1 }; const e = enemy(c, 60);
  strike(c); c.updateBellWaves(0.26); assert.ok(e.burnTime > 0 && e.slowTime > 0 && e.fractureTime > 0);
  const burn = e.burnDps, hp = e.hp;
  c.launchBellWave({ ...c.player }, { kind: 'echo', damage: 1 }); c.updateBellWaves(0.26);
  near(hp - e.hp, 1.12); near(e.burnDps, burn); assert.equal(c.strikeCount, 1);
});
test('pause freezes wave travel and delayed dominion; restart and stage transitions clear every bell entity', () => {
  const h = setup(), c = h.game.combat; c.phase = 3; c.remaining = 0; c.enemies = []; enemy(c, 100);
  strike(c); h.frame(25); const radius = c.bellWaves[0].radius; h.game.openSettings(); h.simulate(2); near(c.bellWaves[0].radius, radius);
  h.game.closeSettings(); h.frame(25); assert.ok(c.bellWaves[0].radius > radius);
  c.useSkill(); const delay = c.followups.find(f => f.kind === 'dominion').remaining; h.game.openSettings(); h.simulate(2); near(c.followups.find(f => f.kind === 'dominion').remaining, delay);
  h.game.restart(); assert.equal(h.game.combat.bellWaves.length, 0); assert.equal(h.game.combat.followups.length, 0);
  const next = h.game.combat; strike(next); next.startStage(); assert.equal(next.bellWaves.length, 0); assert.equal(next.followups.length, 0);
});

test('renamed Chaos Bell centers delayed dominion on the player when it actually releases', () => {
  const c = fresh(); assert.equal(c.snapshot().weaponName, '混沌钟');
  const cast = { ...c.player }; c.useSkill(); c.player.x += 10; c.player.y += 5;
  c.updateFollowups(0.13); const wave = c.bellWaves.find(w => w.kind === 'skill');
  assert.deepEqual(wave.origin, c.player); assert.notDeepEqual(wave.origin, cast);
  const released = { ...wave.origin }; c.player.x += 5; c.updateBellWaves(0.05);
  assert.deepEqual(wave.origin, released);
});

test('Chaos Bell reserves enough top clearance to keep its overhead body inside the arena', () => {
  const { game } = setup({ nativeLayout: true });
  const bounds = game.playerBounds(); assert.ok(bounds.yMin / 100 * game.arenaRect.height / game.rpxScale >= 165.9);
});
