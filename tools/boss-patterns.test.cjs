'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Combat } = require('../game/core/combat');
const { waveBand, attackLine, shellMultiplier } = require('../game/core/boss-patterns');
const { setup, touch } = require('./game-harness.cjs');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function scene(stage) {
  const c = new Combat('bell', () => 0.5); c.stage = stage; c.phase = 3; c.remaining = 0;
  c.enemies = []; c.hazards = []; c.events = []; c.invulnerable = 1000;
  const e = c.spawn('boss'); Object.assign(e, { x: 25, y: 45, hp: 1000, maxHp: 1000, cooldown: 100, speed: 0 });
  c.player.x = 50; c.player.y = 55;
  return { c, e };
}
function advance(c, seconds) { for (let i = 0; i < Math.ceil(seconds / 0.025); i++) c.update(0.025, false); }

test('tiger waits for its landing, reacquires the current player, and locks a fresh second pounce', () => {
  const { c, e } = scene(2); e.phase2 = true; c.castPattern(2, e, true);
  const first = c.hazards[0], firstEnd = { ...first.end };
  assert.equal(c.hazards.length, 1, 'The second lane must not be precomputed at combo start');
  c.player.x = 70; c.player.y = 76;
  advance(c, 1.4); near(e.x, firstEnd.x); near(e.y, firstEnd.y);
  assert.ok(!c.hazards.some(h => h.second));
  const landing = { x: e.x, y: e.y }, target = { ...c.player };
  advance(c, 0.075);
  const second = c.hazards.find(h => h.second); assert.ok(second);
  near(second.x, landing.x); near(second.y, landing.y);
  const aimed = c.vector(landing, second.end), expected = c.vector(landing, target);
  near(aimed.x, expected.x); near(aimed.y, expected.y); assert.ok(second.delay >= 0.7);
  const end = { ...second.end }; c.player.x = 15; c.player.y = 20;
  advance(c, 0.6); assert.deepEqual(second.end, end);
  advance(c, 0.7); assert.ok(!e.dashing); assert.ok(e.castTime <= 0 && e.recoverTime > 0);
});

test('a tiger cannot hit a distant point on its route before its body reaches that point', () => {
  const { c, e } = scene(2); e.x = 20; e.y = c.player.y; c.player.x = 60;
  c.invulnerable = 0; c.castPattern(2, e, false);
  advance(c, 0.975); assert.equal(c.hp, 100, 'Only the leading body has moved, not the whole lane');
  advance(c, 0.4); assert.ok(c.hp < 100); assert.equal(e.chargeHit, true);
});

test('killing a tiger cancels its queued second pounce and removes released claws', () => {
  const { c, e } = scene(2); e.phase2 = true; c.castPattern(2, e, true);
  advance(c, 1.4); e.hp = 0; c.collectDeaths(); advance(c, 2);
  assert.equal(c.hazards.length, 0); assert.equal(c.enemies.length, 0);
});

test('tortoise waves originate at its body and only their expanding crest causes damage', () => {
  const { c, e } = scene(4); c.castPattern(4, e, false);
  const h = c.hazards[0]; assert.equal(h.shape, 'ring'); assert.ok(h.wave); near(h.x, e.x); near(h.y, e.y);
  h.age = h.delay + 0.2; const early = waveBand(h);
  h.age = h.delay + 0.8; const later = waveBand(h); assert.ok(later.radius > early.radius);
  assert.equal(c.contains(h, e), false, 'The empty interior behind a crest is safe');
  const angle = h.gapAngle + Math.PI, radius = (later.radius + later.inner) / 2, center = c.point(h);
  const crest = c.percent({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  assert.equal(c.contains(h, crest), true);
  const gap = c.percent({ x: center.x + Math.cos(h.gapAngle) * radius, y: center.y + Math.sin(h.gapAngle) * radius });
  assert.equal(c.contains(h, gap), false);
  h.age = h.delay + 1.4; assert.equal(c.contains(h, crest), false);
});

test('enraged tortoise staggers three outward waves and never creates a horizontal tide strip', () => {
  const { c, e } = scene(4); e.phase2 = true; c.castPattern(4, e, true);
  assert.equal(c.hazards.length, 1); advance(c, 1.05); assert.equal(c.hazards.filter(h => h.kind === 'tide').length, 2);
  advance(c, 1); const waves = c.hazards.filter(h => h.kind === 'tide'); assert.equal(waves.length, 3);
  assert.ok(waves.every(h => h.shape === 'ring' && h.wave.to > h.wave.from));
  assert.ok(waves[0].age > waves[1].age && waves[1].age > waves[2].age);
});

test('tortoise open shell core rewards flanking, and recovery removes armor', () => {
  const { c, e } = scene(4); c.castPattern(4, e, false);
  const center = c.point(e), at = angle => c.percent({ x: center.x + Math.cos(angle) * 120, y: center.y + Math.sin(angle) * 120 });
  near(shellMultiplier(c, e, at(e.coreAngle)), 1.15);
  near(shellMultiplier(c, e, at(e.coreAngle + Math.PI)), 0.55);
  advance(c, 2.8); assert.equal(e.shielded, false); near(shellMultiplier(c, e), 1);
});

test('dragon roots grow along actual branches and leave traversable space between them', () => {
  const { c, e } = scene(1); c.castPattern(1, e, false);
  const roots = c.hazards.filter(h => h.kind === 'root'); assert.equal(roots.length, 3);
  const h = roots[0]; h.age = h.delay + h.growth * 0.2;
  const far = { ...h.end }; assert.equal(c.contains(h, far), false);
  const front = attackLine(h); assert.equal(c.contains(h, front.end), true);
  h.age = h.delay + h.growth; assert.equal(c.contains(h, far), true);
});

test('phoenix locks successive feathers separately and follows the old fires with an open flame wave', () => {
  const { c, e } = scene(3); c.castPattern(3, e, false);
  const first = c.hazards[0], original = { x: first.x, y: first.y };
  c.player.x = 72; c.player.y = 70; advance(c, 0.35);
  const second = c.hazards.filter(h => h.meteor)[1]; assert.ok(second); near(second.x, 72); near(second.y, 70);
  assert.deepEqual({ x: first.x, y: first.y }, original);
  advance(c, 3); const walls = c.hazards.filter(h => h.fireWave); assert.equal(walls.length, 2);
  assert.ok(walls.every(h => h.delay >= 0.95 && h.moving));
  const gapWidth = c.distance({ x: walls[0].x, y: walls[0].end.y }, walls[1]); near(gapWidth, 170);
});

test('all five half-health transitions freeze combat and begin only once', () => {
  for (let stage = 1; stage <= 5; stage++) {
    const { c, e } = scene(stage); e.hp = 490; c.castPattern(stage, e, false); c.update(0.025, false);
    assert.ok(c.enrage); assert.equal(e.phase2, true); assert.equal(c.hazards.filter(h => h.owner === e.id).length, 0);
    const time = c.time, player = { ...c.player }, cooldown = e.cooldown;
    advance(c, 1.1); near(c.time, time); assert.deepEqual(c.player, player); near(e.cooldown, cooldown);
    assert.ok(c.snapshot().bossTransition.age > 1);
    advance(c, 0.75); assert.equal(c.enrage, null); assert.ok(c.invulnerable >= 0.6);
    advance(c, 0.5); assert.equal(c.enrage, null);
    assert.equal(c.events.filter(event => event.type === 'boss-phase').length, 1);
  }
});

test('controller freezes input, projectiles and phase transition while paused or backgrounded', () => {
  const h = setup({ nativeLayout: true, windowInfo: { windowWidth: 844, windowHeight: 390 } }), c = h.game.combat, game = h.game;
  c.enemies = []; c.stage = 2; c.phase = 3; c.remaining = 0;
  const boss = c.spawn('boss'); boss.hp = boss.maxHp * 0.49; h.frame(25);
  assert.ok(c.enrage); assert.equal(game.isBlocked(), true); assert.equal(game.castSkill(), false);
  const player = { ...c.player }, r = game.joystickRect;
  game.onTouchStart({ touches: [touch(r.left + r.width, r.top + r.height / 2)] }); h.frame(50); assert.deepEqual(c.player, player);
  const age = c.enrage.age, time = c.time;
  game.openSettings(); h.simulate(2); near(c.enrage.age, age); near(c.time, time);
  game.closeSettings(); h.frame(50); assert.ok(c.enrage.age > age);
  game.onHide(); const hiddenAge = c.enrage.age; h.simulate(2); near(c.enrage.age, hiddenAge);
  game.onShow(); h.simulate(2); assert.equal(c.enrage, null); assert.equal(game.data.bossTransition, null);
  game.restart(); assert.equal(c.enrage, null); assert.equal(game.combat.enrage, null); game.onUnload();
});

test('casting and released poses remain legible while taking repeated hits', () => {
  const { enemyFrame, bossFrame } = require('../game/core/enemy-animation');
  const caster = { kind: 'ranged', visualState: 'cast', hitTime: 0.16 };
  assert.equal(enemyFrame(caster), 8); caster.visualState = 'release'; assert.equal(enemyFrame(caster), 9);
  const tiger = { boss: true, bossType: 2, visualState: 'dash', hitTime: 0.16 };
  assert.equal(bossFrame(tiger), 3);
});

test('an animated rage transition does not invalidate a press on its pause button every frame', () => {
  const { NativeInput } = require('../game/src/input');
  const h = setup(), game = h.game, c = game.combat;
  c.enemies = []; c.phase = 3; c.remaining = 0;
  const boss = c.spawn('boss'); boss.hp = boss.maxHp * 0.49; h.frame(25);
  const view = { regions: [{ id: 'enrage-pause', x: 100, y: 20, width: 100, height: 50, action: () => game.openSettings() }] };
  const input = new NativeInput(h.api, game, view), finger = touch(140 * game.rpxScale, 40 * game.rpxScale, 7);
  const epoch = game.data.inputEpoch; input.start({ changedTouches: [finger], touches: [finger] });
  h.frame(50); assert.equal(game.data.inputEpoch, epoch);
  input.end({ changedTouches: [finger], touches: [] }); assert.equal(game.data.showSettings, true);
  input.destroy(); game.onUnload();
});

let renderer;
async function hazardRenderer() {
  if (!renderer) {
    renderer = require('esbuild').build({ entryPoints: [require('node:path').join(__dirname, '../cocos-project/assets/scripts/HazardVfx.ts')], bundle: true, format: 'cjs', external: ['cc'], write: false, logLevel: 'silent' }).then(result => {
      const module = { exports: {} }, cc = { UITransform: class {}, Graphics: class {}, Color: class {} };
      require('node:vm').runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require(name) { if (name === 'cc') return cc; throw Error(name); } });
      return module.exports.drawHazard;
    });
  }
  return renderer;
}
function recorder() {
  const geometry = [], pictures = [], g = new Proxy({}, { get: (_, name) => (...args) => geometry.push({ name, args }) });
  const v = { assets: { frames: { spells: Array(6).fill({}), meteor: Array(16).fill({}), chaosMist: Array(6).fill({}) } },
    image(layer, id, frame, ...args) { pictures.push({ id, frame, args }); return { node: { angle: 0, getComponent: () => ({ setAnchorPoint() {} }) } }; } };
  return { v, layer: { g }, geometry, pictures };
}

test('enemy wind-up does not render ground circles, boxes, lanes or target markers', async () => {
  const draw = await hazardRenderer();
  for (const h of [
    { shape: 'line', kind: 'slash', end: { x: 400, y: 100 } },
    { shape: 'line', kind: 'arcane', end: { x: 400, y: 100 } },
    { shape: 'line', kind: 'root', end: { x: 400, y: 100 }, growing: true },
    { shape: 'ring', kind: 'tide', radius: 200, inner: 160 }
  ]) {
    const r = recorder(); draw(r.v, r.layer, { x: 100, y: 100, age: 0.6, delay: 1, duration: 1, ...h }, p => p);
    assert.equal(r.geometry.length, 0); assert.equal(r.pictures.length, 0);
  }
  const r = recorder(); draw(r.v, r.layer, { x: 200, y: 100, radius: 58, meteor: true, age: 0.6, delay: 1.1, duration: 2.2, id: 3 }, p => p);
  assert.equal(r.geometry.length, 0); assert.ok(r.pictures.every(p => p.id.endsWith('-fall')));
});

test('a visible sea wave has a water body and foam sprites, with no range outline', async () => {
  const draw = await hazardRenderer(), r = recorder();
  draw(r.v, r.layer, { id: 4, x: 200, y: 150, shape: 'ring', kind: 'tide', age: 1.6, delay: 1.15, duration: 1.55,
    radius: 340, inner: 298, wave: { from: 66, to: 340, width: 42 }, gapAngle: 0, gapHalf: 0.48 }, p => p);
  assert.ok(r.geometry.some(op => op.name === 'drawPolygon')); assert.ok(r.pictures.length > 6);
  assert.ok(!r.geometry.some(op => ['drawCircle', 'drawEllipse', 'drawRect', 'drawRoundedRect'].includes(op.name)));
});
