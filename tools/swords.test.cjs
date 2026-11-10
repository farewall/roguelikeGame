'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Combat, WEAPONS } = require('../game/core/combat');
const { SWORDS, sweptBladeContact } = require('../game/core/swords');
const { startEnrage } = require('../game/core/boss-patterns');
const { setup } = require('./game-harness.cjs');
const { readArchive, runView } = require('../game/core/chronicle');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fresh() { const c = new Combat('swords', () => 0.5); c.phase = 3; c.remaining = 0; c.enemies = []; c.drainEvents(); return c; }
function enemy(c, dx, dy = 0, extra = {}) { const e = c.spawn('ranged'); Object.assign(e, { x: c.player.x + dx / c.width * 100, y: c.player.y + dy / c.height * 100, hp: 1000, maxHp: 1000, speed: 0, cooldown: 100, spawnTime: 0 }, extra); return e; }
function advance(c, seconds) { for (let t = 0; t < seconds - 1e-7; t += 0.025) c.update(0.025, false); }
const strike = c => c.strike({ direction: { x: 1, y: 0 } });

test('Zhuxian always contains four distinct physical swords at quarter-orbit spacing', () => {
  const c = fresh(); assert.equal(c.weapon, 'swords'); assert.equal(WEAPONS.swords.name, '诛仙剑');
  for (let i = 0; i < 16; i++) {
    const poses = c.swordPoses(), center = c.point(c.player);
    assert.deepEqual(poses.map(p => p.name), ['诛仙', '戮仙', '陷仙', '绝仙']);
    assert.equal(new Set(poses.map(p => p.index)).size, 4);
    for (const [index, pose] of poses.entries()) {
      const p = c.point(pose), other = c.point(poses[(index + 2) % 4]);
      near(p.x + other.x, center.x * 2); near(p.y + other.y, (center.y - 10) * 2);
      near(((p.x - center.x) / SWORDS.radius) ** 2 + ((p.y - center.y + 10) / (SWORDS.radius * SWORDS.depth)) ** 2, 1);
    }
    c.updateArtifacts(0.1);
  }
  assert.equal(c.projectiles.length, 0); assert.equal(c.bellWaves.length, 0);
});
test('orbit follows the player without chasing a target, and idle blades do not deal hidden damage', () => {
  const c = fresh(), e = enemy(c, 95); const before = c.swordPoses().map(p => c.point(p));
  c.player.x += 10; c.player.y += 8; const after = c.swordPoses().map(p => c.point(p));
  for (let i = 0; i < 4; i++) { near(after[i].x - before[i].x, c.width * 0.1); near(after[i].y - before[i].y, c.height * 0.08); }
  advance(c, 0.4); near(e.hp, 1000); assert.ok(c.swordAngle > 0);
});
test('swept blade contact follows metal edges, includes the swept interior, and excludes the empty array center', () => {
  const a = { base: { x: 80, y: 0 }, tip: { x: 140, y: 0 } }, b = { base: { x: 0, y: 80 }, tip: { x: 0, y: 140 } };
  assert.equal(sweptBladeContact({ x: 55, y: 55 }, a, b, 2), true);
  assert.equal(sweptBladeContact({ x: 110, y: 4 }, a, a, 1), true);
  assert.equal(sweptBladeContact({ x: 0, y: 0 }, a, b, 18), false);
  assert.equal(sweptBladeContact({ x: 220, y: 0 }, a, b, 18), false);
});
test('ordinary slash covers the moving four-sword array once and respects solid bodies, range, and its inner gap', () => {
  const c = fresh(), targets = [];
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; targets.push(enemy(c, Math.cos(a) * 100, Math.sin(a) * 100)); }
  const middle = enemy(c, 0), far = enemy(c, 300), forming = enemy(c, 100, 0, { spawnTime: 5 });
  strike(c); advance(c, 0.4);
  for (const e of targets) near(e.hp, 1000 - c.damage());
  for (const e of [middle, far, forming]) near(e.hp, 1000);
  assert.equal(c.strikeCount, 1); assert.equal(c.swordStrike, null); assert.equal(c.swordPoses().length, 4);
});
test('one sword slash grants one charge/reaction and snapshots damage and elements before upgrades', () => {
  const c = fresh(); c.energy = 0; c.elements.fire = c.elements.water = c.elements.earth = 1;
  enemy(c, 100); enemy(c, -100); strike(c); advance(c, 0.4);
  assert.equal(c.strikeCount, 1); near(c.energy, 12 + 2.5 * 0.4); assert.equal(c.effects.filter(e => e.type === 'steam').length, 1);
  const other = fresh(), e = enemy(other, 100); strike(other); other.upgrade('power'); other.upgrade('fire'); advance(other, 0.4);
  near(e.hp, 1000 - SWORDS.damage); assert.equal(e.burnTime, 0);
});
test('active skill expands the same four swords, waits for release, and uses skill damage once per enemy', () => {
  const c = fresh(), e = enemy(c, 170), far = enemy(c, 300); assert.ok(c.useSkill());
  assert.equal(c.snapshot().skillName, '诛仙'); assert.equal(c.swordStrike, null); advance(c, 0.1); near(e.hp, 1000);
  advance(c, 0.15); assert.ok(c.swordStrike?.skill); assert.equal(c.swordPoses().length, 4);
  const center = c.point(c.player), p = c.point(c.swordPoses()[0]);
  assert.ok(((p.x - center.x) / SWORDS.radius) ** 2 + ((p.y - center.y + 10) / (SWORDS.radius * SWORDS.depth)) ** 2 > 1);
  advance(c, 0.7); near(e.hp, 1000 - c.damage() * 3.5); near(far.hp, 1000); assert.equal(c.strikeCount, 0);
  assert.equal(c.swordStrike, null); assert.equal(c.projectiles.length, 0); assert.equal(c.bellWaves.length, 0); assert.ok(c.battleReport().damage.includes('诛仙'));
});
test('sword poses and live cuts freeze during pause, upgrade modals, and boss enrage', () => {
  const h = setup({ weapon: 'swords', nativeLayout: true }), game = h.game, c = game.combat;
  c.phase = 3; c.remaining = 0; c.enemies = []; enemy(c, 100); strike(c); game.syncCombat();
  game.pauseGame(); const before = JSON.stringify(c.swordPoses()); h.simulate(1); assert.equal(JSON.stringify(c.swordPoses()), before);
  game.resumeGame(); c.xp = c.xpNeed; game.levelUp(); const modal = JSON.stringify(c.swordPoses()); h.simulate(1); assert.equal(JSON.stringify(c.swordPoses()), modal);
  game.setData({ showChoice: false }); const boss = c.spawn('boss'); Object.assign(boss, { hp: 500, maxHp: 1000, spawnTime: 0 }); startEnrage(c, boss);
  const rage = JSON.stringify(c.swordPoses()); advance(c, 0.3); assert.equal(JSON.stringify(c.swordPoses()), rage); assert.equal(c.useSkill(), false);
  game.restart(); assert.equal(game.combat.swordStrike, null); assert.equal(game.combat.swordPoses().length, 4); game.onUnload();
});
test('new weapon uses ordinary upgrades and persists in the archive without banner or bell options', () => {
  const c = fresh(); assert.ok(!c.upgradePool().some(u => ['range', 'echo', 'resonance', 'blades', 'split'].includes(u.kind)));
  const interval = c.interval(); c.upgrade('haste'); assert.ok(c.interval() < interval);
  c.cleared = true; assert.ok(c.advanceStage()); assert.equal(c.swordStrike, null); assert.equal(c.swordPoses().length, 4);
  const archive = readArchive({ getStorageSync: () => ({ runs: [{ won: false, weaponId: 'swords', seconds: 10, kills: 1, stage: 1, build: c.buildLabel() }] }) });
  assert.equal(archive.runs.length, 1); assert.equal(runView(archive.runs[0]).weaponName, '诛仙剑'); assert.match(c.snapshot().swordLabel, /诛.*戮.*陷.*绝/);
});
test('all four sword sprite bounds remain visible throughout the largest orbit at both viewport sizes', () => {
  for (const [width, height] of [[844, 390], [667, 320]]) {
    const h = setup({ weapon: 'swords', nativeLayout: true, windowInfo: { windowWidth: width, windowHeight: height } });
    const c = h.game.combat, b = h.game.playerBounds(); c.swordStrike = { skill: true, age: 0.35, duration: 0.7 };
    for (const [x, y] of [[b.xMin, b.yMin], [b.xMax, b.yMin], [b.xMin, b.yMax], [b.xMax, b.yMax]]) {
      c.player.x = x; c.player.y = y;
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        c.swordAngle = a;
        for (const pose of c.swordPoses()) {
          const p = c.point(pose), r = pose.angle * Math.PI / 180, half = pose.size / 2 * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)));
          assert.ok(p.x - half >= -1e-6 && p.x + half <= c.width + 1e-6 && p.y - half >= -1e-6 && p.y + half <= c.height + 1e-6, JSON.stringify({ width, height, x, y, a, p, half }));
        }
      }
    }
    h.game.onUnload();
  }
});
test('four-sword builds can clear all stages and the controller can progress without a bell/banner route', () => {
  const { run } = require('./combat-journey.cjs');
  for (const seed of [1, 17, 42]) { const r = run('swords', seed, ''); assert.equal(r.won, true, JSON.stringify(r)); assert.equal(r.stages.length, 5); }
  const { runPage } = require('./page-journey.cjs'), r = runPage('swords', 42, '');
  assert.equal(r.won, true, JSON.stringify(r)); assert.equal(r.choices, 16); assert.deepEqual(r.stages, [1, 2, 3, 4]); assert.ok(r.skills > 0); assert.match(r.build, /四剑环绕/);
});
