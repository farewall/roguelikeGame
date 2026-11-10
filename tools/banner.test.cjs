'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Combat } = require('../game/core/combat');
const { BANNER, firstContact } = require('../game/core/banner');
const { startEnrage } = require('../game/core/boss-patterns');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function core() { const c = new Combat('banner', () => 0.5); c.phase = 3; c.remaining = 0; c.enemies = []; c.drainEvents(); return c; }
function enemy(c, dx, dy = 0, extra = {}) {
  const e = c.spawn('ranged'); Object.assign(e, { x: c.player.x + dx / c.width * 100, y: c.player.y + dy / c.height * 100,
    hp: 1000, maxHp: 1000, speed: 0, cooldown: 100, spawnTime: 0 }, extra); return e;
}
const fire = c => c.strike({ direction: { x: 1, y: 0 } });
const travel = (c, seconds) => { for (let t = 0; t < seconds - 1e-7; t += 0.025) c.updateArtifacts(Math.min(0.025, seconds - t)); };

test('blade count adds two per tier on every path, preserves aim symmetry, and caps at three', () => {
  for (const [path, base] of [['', 3], ['sweep', 5], ['rend', 1]]) {
    const c = core(); c.path = path;
    for (let tier = 0; tier <= 3; tier++) {
      near(c.bladeCount(), base + 2 * tier); const angles = c.bladeAngles();
      near(angles.reduce((a, b) => a + b), 0); near(angles[(angles.length - 1) / 2], 0);
      fire(c); assert.equal(c.projectiles.at(-1).bolts.length, base + 2 * tier);
      assert.equal(c.upgrade('blades'), tier < 3);
    }
    assert.ok(!c.upgradePool().some(u => u.kind === 'blades'));
  }
  const bell = new Combat('bell'); assert.equal(bell.upgrade('blades'), false); assert.equal(bell.upgrade('split'), false);
  assert.ok(!bell.upgradePool().some(u => ['blades', 'split'].includes(u.kind)));
});
test('banner offers teach count and splitting early while retaining stats, elements, and emergency healing', () => {
  const c = core(); assert.equal(c.choices()[0].kind, 'blades'); c.level = 2; assert.equal(c.choices()[0].kind, 'split');
  for (let level = 1; level < 18; level++) {
    c.level = level; const offers = c.choices();
    assert.equal(new Set(offers.map(u => u.id)).size, 3);
    assert.ok(offers.some(u => ['blades', 'split'].includes(u.kind)));
    assert.ok(offers.some(u => ['power', 'haste', 'health'].includes(u.kind)));
    assert.ok(offers.some(u => ['fire', 'water', 'earth'].includes(u.kind)));
  }
  c.hp = 20; assert.ok(c.choices().some(u => u.kind === 'health'));
  for (let i = 0; i < 3; i++) assert.ok(c.upgrade('split')); assert.equal(c.upgrade('split'), false);
  assert.ok(!c.upgradePool().some(u => u.kind === 'split'));
});
test('swept contacts use entry order, include tangency, and reject misses behind or beyond the segment', () => {
  const start = { x: 0, y: 0 }, end = { x: 100, y: 0 };
  near(firstContact({ x: 50, y: 0 }, start, end, 10), 0.4);
  near(firstContact({ x: 50, y: 10 }, start, end, 10), 0.5);
  near(firstContact(start, start, start, 10), 0);
  for (const p of [{ x: -20, y: 0 }, { x: 120, y: 0 }, { x: 50, y: 11 }]) assert.equal(firstContact(p, start, end, 10), null);
});
test('every mother blade splits at its first solid contact independently of volley hit deduplication', () => {
  const c = core(); c.upgrade('split'); enemy(c, 50);
  fire(c); const parent = c.projectiles[0]; c.updateArtifacts(0.1);
  assert.equal(c.projectiles.filter(v => v.split).length, 3);
  assert.ok(parent.bolts.every(b => b.splitUsed)); assert.equal(c.strikeCount, 1);
  assert.ok(c.projectiles.filter(v => v.split).every(v => v.bolts.length === 2 && v.traveled === 0));
  assert.equal(c.effects.filter(f => f.type === 'blade-split').length, 3);
});
test('splitting selects the earliest body rather than spawn order and ignores forming or dead enemies', () => {
  const c = core(); c.path = 'rend'; c.upgrade('split');
  enemy(c, 30, 0, { spawnTime: 1 }); enemy(c, 40, 0, { hp: 0 }); const far = enemy(c, 180), close = enemy(c, 90);
  fire(c); c.updateArtifacts(0.3);
  const child = c.projectiles.find(v => v.split); assert.equal(child.ignoreId, close.id);
  near(c.point(child.origin).x - c.point(c.player).x, 90 - 28);
  near(far.hp, 1000 - c.damage()); near(close.hp, far.hp);
});
test('mother keeps piercing, children exclude the struck body, and each tier has actual fragment count and damage', () => {
  for (let tier = 1; tier <= 3; tier++) {
    const c = core(); c.path = 'rend'; for (let i = 0; i < tier; i++) c.upgrade('split');
    const trigger = enemy(c, 90); fire(c); c.updateArtifacts(0.1);
    const child = c.projectiles.find(v => v.split); assert.equal(child.bolts.length, tier + 1);
    near(child.damage, c.damage() * (0.4 + tier * 0.05)); near(child.range, 180 + tier * 20);
    const side = enemy(c, 62 + Math.cos(-32 * Math.PI / 180) * 150, Math.sin(-32 * Math.PI / 180) * 150);
    const behind = enemy(c, 320); travel(c, 0.4);
    near(trigger.hp, 1000 - c.damage()); near(side.hp, 1000 - child.damage); near(behind.hp, 1000 - c.damage());
    assert.ok(c.battleReport().damage.includes('裂刃')); assert.equal(c.effects.filter(f => f.type === 'blade-split').length, 1);
  }
});
test('children share one additional hit per enemy and never add charge, hit count, or repeated elemental reactions', () => {
  const c = core(); c.upgrade('split'); c.energy = 0; c.elements = { fire: 1, water: 1, earth: 2 };
  enemy(c, 50); fire(c); c.updateArtifacts(0.1);
  const fragments = c.projectiles.filter(v => v.split), side = enemy(c, 0);
  // Put one untouched body inside every child segment to exercise overlapping children.
  for (const v of fragments) for (const b of v.bolts) Object.assign(b, { x: side.x, y: side.y });
  const count = c.strikeCount, charge = c.energy, reactions = c.effects.filter(f => f.type === 'steam').length, aftershocks = c.followups.length;
  c.updateArtifacts(0.025);
  near(side.hp, 1000 - c.damage() * 0.45); assert.equal(c.strikeCount, count); near(c.energy - charge, 2.5 * 0.025);
  assert.equal(c.effects.filter(f => f.type === 'steam').length, reactions); assert.equal(c.followups.length, aftershocks);
  assert.ok(side.burnTime > 0 && side.slowTime > 0); assert.equal(c.projectiles.filter(v => v.split).length, fragments.length);
});
test('release snapshots damage, elements, count and splitting, and fragments never weaken an existing burn', () => {
  const c = core(); c.path = 'rend'; const e = enemy(c, 120); fire(c); const old = c.projectiles[0];
  c.upgrade('power'); c.upgrade('fire'); c.upgrade('split'); c.upgrade('blades'); c.updateArtifacts(0.2);
  near(e.hp, 1000 - 3.6); assert.equal(e.burnTime, 0); assert.equal(old.bolts.length, 1); assert.ok(!c.projectiles.some(v => v.split));
  fire(c); c.updateArtifacts(0.2); const fragment = c.projectiles.find(v => v.split), burn = e.burnDps;
  fragment.ignoreId = null; fragment.hitIds.clear(); for (const b of fragment.bolts) Object.assign(b, { x: e.x, y: e.y });
  c.updateArtifacts(0.025); near(e.burnDps, burn);
});
test('maxed blade builds stay bounded, expire, persist upgrades across stages and reset on a new run', () => {
  const c = core(); c.path = 'sweep'; c.bannerUpgrades = { blades: 3, split: 3 };
  for (const offset of c.bladeAngles()) { const a = offset * Math.PI / 180; enemy(c, Math.cos(a) * 60, Math.sin(a) * 60); }
  fire(c); let peak = 0;
  for (let t = 0; t < 1; t += 0.025) {
    c.updateArtifacts(0.025); const count = c.projectiles.reduce((n, v) => n + v.bolts.length, 0); peak = Math.max(peak, count);
    assert.ok(count <= BANNER.maxBolts);
  }
  assert.ok(peak > 11); assert.equal(c.projectiles.length, 0);
  c.cleared = true; c.advanceStage(); assert.deepEqual(c.bannerUpgrades, { blades: 3, split: 3 }); assert.equal(c.projectiles.length, 0);
  assert.deepEqual(core().bannerUpgrades, { blades: 0, split: 0 });
  assert.match(c.snapshot().bannerUpgradeLabel, /11道.*4道/);
});
test('burst spawning respects the shared bolt budget and enrage freezes both generations without consuming a skill', () => {
  const c = core(); c.path = 'sweep'; c.bannerUpgrades = { blades: 3, split: 3 };
  for (let i = 0; i < 3; i++) fire(c); enemy(c, 40); c.updateArtifacts(0.1);
  assert.ok(c.projectiles.some(v => v.split));
  for (let i = 0; i < 20; i++) fire(c);
  assert.ok(c.projectiles.reduce((n, v) => n + v.bolts.length, 0) <= BANNER.maxBolts);
  const boss = c.spawn('boss'); Object.assign(boss, { hp: 500, maxHp: 1000, spawnTime: 0 }); startEnrage(c, boss);
  const before = JSON.stringify(c.projectiles.map(v => ({ traveled: v.traveled, bolts: v.bolts }))), energy = c.energy;
  c.update(0.1); assert.equal(c.useSkill({ x: 1, y: 0 }), false); near(c.energy, energy);
  assert.equal(JSON.stringify(c.projectiles.map(v => ({ traveled: v.traveled, bolts: v.bolts }))), before);
});
