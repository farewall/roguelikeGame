'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Combat } = require('../game/core/combat');
const { experienceNeed, waveQuota } = require('../game/core/progression');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fresh(weapon = 'bell') { const c = new Combat(weapon, () => 0.5); c.phase = 3; c.remaining = 0; c.enemies = []; c.drainEvents(); return c; }
function enemy(c, distance) { const e = c.spawn('ranged'); Object.assign(e, { x: c.player.x + distance / c.width * 100, y: c.player.y, hp: 1000, maxHp: 1000, speed: 0, cooldown: 100 }); return e; }

test('range upgrades extend actual targeting and collision, cap at three, and remain bell-specific', () => {
  const c = fresh(), e = enemy(c, 200); near(c.attackRange(), 180);
  c.update(0.025); assert.equal(c.pendingAttack, null);
  assert.equal(c.upgrade('range'), true); c.update(0.025); assert.equal(c.pendingAttack.targetId, e.id); near(c.snapshot().attackRange, 207);
  assert.equal(c.upgrade('range'), true); assert.equal(c.upgrade('range'), true); assert.equal(c.upgrade('range'), false);
  near(c.attackRange(), 180 * 1.15 ** 3); assert.ok(!c.upgradePool().some(u => u.kind === 'range'));
  const banner = fresh('banner'); assert.equal(banner.upgrade('range'), false); near(banner.attackRange(), 360);
});

test('upgrading mid-flight never expands an old wave or retroactively increases its resonance', () => {
  const c = fresh(), e = enemy(c, 200); const old = c.launchBellWave(c.player);
  for (const kind of ['range', 'echo', 'resonance']) for (let i = 0; i < 3; i++) assert.ok(c.upgrade(kind));
  near(old.range, 180); near(old.resonanceStart, 0.75); near(old.resonanceMultiplier, 1.3); assert.equal(old.echoTier, 0);
  c.updateBellWaves(0.6); near(e.hp, 1000);
  const next = c.launchBellWave(c.player); c.updateBellWaves(0.5);
  near(next.range, c.attackRange()); near(next.resonanceStart, 0.6); near(e.hp, 1000 - 3 * 1.75);
});

test('echo milestones reduce trigger count and add a non-recursive half-power second echo', () => {
  const c = fresh(); c.path = 'echo'; const e = enemy(c, 70);
  for (const kind of ['range', 'echo']) for (let i = 0; i < 3; i++) c.upgrade(kind);
  assert.equal(c.bellThreshold(), 1); c.launchBellWave(c.player); c.updateBellWaves(0.5);
  assert.equal(c.followups.length, 2); const [first, second] = c.followups;
  near(first.radius, c.attackRange() * 1.2); near(first.damage, 3 * 0.95); near(second.damage, first.damage * 0.5); near(second.remaining - first.remaining, 0.18);
  c.updateFollowups(0.4); c.updateBellWaves(0.7); assert.equal(c.strikeCount, 1); assert.equal(c.followups.length, 0); near(e.hp, 1000 - 3 - first.damage - second.damage);
});

test('water pulses extend beyond upgraded ordinary waves rather than falling behind them', () => {
  const c = fresh(); for (let i = 0; i < 3; i++) c.upgrade('range'); c.elements.water = 2;
  enemy(c, 80); const outside = enemy(c, c.attackRange() + 10);
  for (let i = 0; i < 2; i++) { c.launchBellWave(c.player); c.updateBellWaves(0.5); }
  assert.equal(outside.slowTime, 0); c.launchBellWave(c.player); c.updateBellWaves(0.5); assert.ok(outside.slowTime > 0);
});

test('offers expose weapon mechanics, core stats and elements without starving damage or emergency healing', () => {
  const c = fresh();
  for (let level = 1; level <= 16; level++) {
    c.level = level; const choices = c.choices(); assert.equal(choices.length, 3);
    assert.equal(new Set(choices.map(u => u.id)).size, 3);
    assert.ok(choices.some(u => ['power', 'haste', 'health'].includes(u.kind)));
    assert.ok(choices.some(u => ['range', 'echo', 'resonance'].includes(u.kind)));
    if (level === 1) assert.ok(choices.some(u => u.kind === 'range'));
  }
  c.hp = 30; assert.ok(c.choices().some(u => u.kind === 'health'));
});

test('enemy growth follows world progress, never player upgrades, and leaves old enemies unchanged', () => {
  const c = fresh(); c.stage = 3; c.phase = 1; c.stageTime = 10;
  const old = c.spawn('ranged'), hp = old.maxHp, speed = old.speed;
  c.level = 30; c.power = 100; c.upgrade('range'); const sameWorld = c.spawn('ranged'); near(sameWorld.maxHp, hp);
  c.stageTime = 70; const later = c.spawn('ranged'); assert.ok(later.maxHp > hp);
  c.stage = 5; const final = c.spawn('ranged'); assert.ok(final.maxHp > later.maxHp); assert.ok(final.damageScale > old.damageScale);
  near(old.maxHp, hp); near(old.speed, speed); const fodder = c.spawnFodder(); assert.ok(fodder.maxHp < 4);
});

test('higher quotas and gentler experience costs yield sixteen meaningful upgrades in a full run budget', () => {
  let enemies = 5; for (let stage = 1; stage <= 5; stage++) for (let phase = 0; phase < 3; phase++) enemies += waveQuota(stage, phase);
  assert.equal(enemies, 289); assert.ok(enemies > 170 * 1.5 && enemies < 170 * 2);
  let xp = 200, upgrades = 0; while (xp >= experienceNeed(upgrades + 1)) { xp -= experienceNeed(upgrades + 1); upgrades++; }
  assert.equal(upgrades, 16); near(experienceNeed(1), 5); near(experienceNeed(2), 6);
});

test('bell growth persists across stages and resets on a new run', () => {
  const c = fresh(); c.upgrade('range'); c.upgrade('echo'); c.cleared = true; assert.ok(c.advanceStage());
  near(c.attackRange(), 207); assert.equal(c.bellUpgrades.echo, 1); near(fresh().attackRange(), 180);
});
