'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Combat, WEAPONS } = require('../game/core/combat');
const { setup, touch } = require('./game-harness.cjs');
const { NativeInput } = require('../game/src/input');
const { ARTIFACT_COLUMNS } = require('../game/core/artifact-animation');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function core(weapon = 'bell') { const c = new Combat(weapon, () => 0.5); c.phase = 3; c.remaining = 0; c.enemies = []; c.drainEvents(); return c; }
function enemy(c, dx, dy = 0, kind = 'wraith') { const e = c.spawn(kind); Object.assign(e, { x: c.player.x + dx / c.width * 100, y: c.player.y + dy / c.height * 100, hp: 1000, maxHp: 1000, speed: 0, cooldown: 100 }); return e; }
function advance(c, seconds) { for (let i = 0; i < Math.ceil(seconds / 0.025); i++) c.update(0.025, false); }
test('a flying blade can be dodged after launch and does not track a moved target', () => {
  const c = core('banner'), e = enemy(c, 300); c.strike({ direction: { x: 1, y: 0 }, targetId: e.id });
  c.updateArtifacts(0.1); near(e.hp, 1000); e.y += 180 / c.height * 100;
  for (let i = 0; i < 20; i++) c.updateArtifacts(0.025);
  near(e.hp, 1000); assert.equal(c.projectiles.length, 0);
});
test('multiple piercing blade hits award one normal-hit charge and one elemental reaction per volley', () => {
  const c = core('banner'); c.energy = 0; c.elements.fire = c.elements.water = 1; enemy(c, 80); enemy(c, 160); enemy(c, 240);
  c.strike({ direction: { x: 1, y: 0 } }); for (let i = 0; i < 20; i++) c.updateArtifacts(0.025);
  assert.equal(c.strikeCount, 1); near(c.energy, 12 + 2.5 * 0.5); assert.equal(c.effects.filter(f => f.type === 'steam').length, 1);
  assert.ok(c.enemies.every(e => e.burnTime > 0 && e.slowTime > 0));
});
test('charge caps at full, announces readiness once and clears on skill use', () => {
  const c = core(); c.energy = 90; c.gainEnergy(20); c.gainEnergy(20);
  near(c.energy, 100); assert.equal(c.drainEvents().filter(e => e.type === 'skill-ready').length, 1);
  assert.ok(c.useSkill()); near(c.energy, 0); assert.equal(c.useSkill(), false); assert.equal(c.skillUses, 1);
  c.energy = 100; assert.equal(c.useSkill(), false); advance(c, 1); assert.ok(c.useSkill());
});
test('bell dominion interrupts ordinary casters, knocks them away and preserves released boss threats', () => {
  const c = core(), caster = enemy(c, 100, 0, 'ranged'), boss = enemy(c, 200, 0, 'boss'), outside = enemy(c, -400);
  caster.castTime = boss.castTime = 1; c.circle(c.player, 50, 0.5, 1, '符', 'arcane', 5, caster.id); c.circle(c.player, 60, 0.5, 1, '藤', 'root', 5, boss.id);
  const before = { ...caster }; assert.ok(c.useSkill()); near(caster.hp, 1000 - WEAPONS.bell.damage * 2.8); near(outside.hp, 1000);
  assert.ok(c.distance(before, caster) > 80); assert.equal(caster.castTime, 0); assert.ok(caster.freezeTime >= 1.1);
  assert.equal(boss.castTime, 1); assert.ok(boss.freezeTime <= 0.2); assert.ok(c.hazards.some(h => h.owner === boss.id)); assert.ok(!c.hazards.some(h => h.owner === caster.id));
  assert.ok(c.invulnerable > 0); assert.ok(c.battleReport().damage.includes('镇界'));
});
test('banner rift locks its origin and direction, waits for release, then damages only its corridor', () => {
  const c = core('banner'), a = enemy(c, 200), b = enemy(c, 420), side = enemy(c, 200, 90), rear = enemy(c, -100);
  assert.ok(c.useSkill({ x: 2, y: 0 })); advance(c, 0.2); near(a.hp, 1000); c.player.y += 20;
  advance(c, 0.025); near(a.hp, 1000 - c.damage() * 5); near(b.hp, a.hp); near(side.hp, 1000); near(rear.hp, 1000);
  assert.ok(c.hazards.some(h => h.skill && h.shape === 'line')); assert.ok(c.battleReport().damage.includes('裂天'));
  const hp = a.hp; advance(c, 0.2); assert.ok(a.hp < hp); assert.equal(c.skillUses, 1);
});
test('rift blast and lingering damage both respect tortoise armor', () => {
  const c = core('banner'), e = enemy(c, 200, 0, 'boss'); Object.assign(e, { bossType: 4, phase2: true, shielded: true, castTime: 10 });
  c.useSkill({ x: 1, y: 0 }); c.updateFollowups(0.22); near(1000 - e.hp, c.damage() * 5 * 0.55);
  const hp = e.hp; c.updateHazards(0.1); near(hp - e.hp, c.damage() * 0.8 * 0.1 * 0.55);
});
test('element field refresh retains an existing rift and stage transitions clear traveling attacks', () => {
  const c = core('banner'); enemy(c, 70); c.useSkill({ x: 1, y: 0 }); c.updateFollowups(0.22); c.elements.fire = c.elements.earth = 1;
  c.strike({ direction: { x: 1, y: 0 } }); c.updateArtifacts(0.1); assert.ok(c.hazards.some(h => h.skill)); assert.ok(c.hazards.some(h => h.kind === 'lava'));
  c.startStage(); assert.equal(c.projectiles.length, 0); assert.equal(c.followups.length, 0); assert.equal(c.hazards.length, 0);
});
function inputHarness(weapon = 'banner') {
  const h = setup({ weapon, nativeLayout: true, windowInfo: { windowWidth: 844, windowHeight: 390 } }), c = h.game;
  c.combat.phase = 3; c.combat.remaining = 0; c.combat.enemies = []; c.combat.attackCd = 100; enemy(c.combat, 200); c.syncCombat();
  const view = { regions: [{ id: 'skill', type: 'skill', ...c.layout.skill, enabled: true }] }, input = new NativeInput(h.api, c, view);
  const point = (x, y, id = 1) => touch(x * c.rpxScale, y * c.rpxScale, id), r = c.layout.skill;
  return { ...h, input, view, point, press: point(r.x + 96, r.y + 90) };
}
const event = (t, remaining = []) => ({ changedTouches: [t], touches: remaining });
test('second finger drags a directional skill while identifier-zero joystick retains movement', () => {
  const h = inputHarness(), c = h.game, j = c.layout.joystick;
  const joy = h.point(j.x + 164, j.y + 100, 0); h.input.start(event(joy, [joy])); h.input.start(event(h.press, [joy, h.press]));
  const aim = { ...h.press, clientX: h.press.clientX - 80 }; h.input.move(event(aim, [joy, aim])); assert.ok(c.data.skillAim.x < -0.99);
  const x = c.player.x; h.frame(); assert.ok(c.player.x > x); h.input.end(event(aim, [joy])); assert.equal(c.combat.skillUses, 1); assert.equal(h.input.joyId, 0); assert.equal(c.data.skillAim, null);
  assert.ok(c.combat.followups[0].end.x < c.player.x); h.input.end(event(joy)); assert.equal(c.data.joystick.active, false); h.input.destroy();
});
test('touch cancel and opening a modal discard aimed skills without spending charge', () => {
  const h = inputHarness(), c = h.game; h.input.start(event(h.press, [h.press])); assert.ok(c.data.skillAim); h.input.cancel(); h.input.end(event(h.press));
  assert.equal(c.combat.skillUses, 0); near(c.combat.energy, 100); assert.equal(c.data.skillAim, null);
  h.input.start(event(h.press, [h.press])); c.openSettings(); h.input.end(event(h.press)); assert.equal(c.combat.skillUses, 0); assert.equal(c.data.skillAim, null); h.input.destroy();
});
test('only one finger owns skill aiming and duplicate releases cannot consume a second charge', () => {
  const h = inputHarness(), other = { ...h.press, identifier: 2 };
  h.input.start(event(h.press, [h.press])); h.input.start(event(other, [h.press, other])); assert.equal(h.input.skillId, 1);
  h.input.end(event(other, [h.press])); assert.equal(h.game.combat.skillUses, 0);
  h.input.end(event(h.press)); h.input.end(event(h.press)); assert.equal(h.game.combat.skillUses, 1); h.input.destroy();
});
test('pause freezes skill energy, flying blades and delayed rift; restart resets the skill state', () => {
  const h = inputHarness(), c = h.game; c.castSkill({ x: 1, y: 0 }); c.combat.strike({ direction: { x: 1, y: 0 } });
  const remaining = c.combat.followups[0].remaining; c.openSettings(); h.simulate(2); near(c.combat.energy, 0); near(c.combat.projectiles[0].traveled, 0); near(c.combat.followups[0].remaining, remaining);
  c.closeSettings(); h.simulate(0.1); assert.ok(c.combat.projectiles[0].traveled > 0); assert.ok(c.combat.followups[0].remaining < remaining);
  c.restart(); near(c.combat.energy, 100); assert.equal(c.combat.skillUses, 0); assert.equal(c.combat.projectiles.length, 0); assert.equal(c.data.skillAim, null); h.input.destroy();
});
test('skills cannot fire during upgrades, memories, death or from the home menu', () => {
  for (const state of ['showChoice', 'showMemory', 'ended']) { const h = setup(); h.game.setData({ [state]: true }); assert.equal(h.game.castSkill(), false); assert.equal(h.game.combat.skillUses, 0); }
  const h = setup(); h.game.exitToHome(); assert.equal(h.game.castSkill(), false);
});
test('the unarmed pose atlas maps idle, walking and casting into valid four-direction frames', () => {
  assert.deepEqual(ARTIFACT_COLUMNS.attack.slice(0, 3), [4, 4, 5]); assert.ok(ARTIFACT_COLUMNS.move.includes(2) && ARTIFACT_COLUMNS.move.includes(3));
  const fs = require('node:fs'), path = require('node:path'), png = fs.readFileSync(path.join(__dirname, '../game/assets/images/pangu/artifact-cast.png'));
  assert.equal(png.readUInt32BE(16), 768); assert.equal(png.readUInt32BE(20), 512); assert.ok(png.includes(Buffer.from('tRNS')));
  assert.ok(Object.values(ARTIFACT_COLUMNS).every(columns => columns.length === 6 && columns.every(v => v >= 0 && v < 6)));
});
