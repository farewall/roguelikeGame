'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/index/index.js'), 'utf8');

function setup() {
  let definition, now = 1000, nextTimer = 0;
  const timers = new Map();
  vm.runInNewContext(source, {
    Page(page) { definition = page; },
    Date: { now: () => now },
    wx: { vibrateShort() {} },
    setInterval(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    clearTimeout(id) { timers.delete(id); }
  });
  const game = { ...definition, data: structuredClone(definition.data) };
  game.setData = function(patch, callback) {
    // Emulate mini-program serialization rather than sharing model objects with the view.
    Object.assign(this.data, structuredClone(patch));
    if (callback) callback();
  };
  game.createSelectorQuery = () => {
    const query = {
      select() { return query; },
      boundingClientRect(callback) { callback({ left: 20, top: 110, width: 400, height: 600 }); return query; },
      exec() {}
    };
    return query;
  };
  game.beginGame();
  game.setData({ enemies: [] });
  return { game, timers, advance(ms = 32) { now += ms; game.moveFrame(); } };
}

function enemy(id = 1, patch = {}) {
  return { id, x: 70, y: 55, hp: 20, maxHp: 20, hpPct: 100, speed: 0, boss: false, ...patch };
}
function choose(game, kind) {
  game.setData({ showChoice: true, choices: [{ kind, name: kind }], xp: game.data.xpNeed });
  game.chooseUpgrade({ currentTarget: { dataset: { index: '0' } } });
}
function touch(x, y, identifier = 1) { return { clientX: x, clientY: y, identifier }; }
function closeTo(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test('touching a distant point does not teleport; dragging walks continuously until release', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(350, 500)] });
  advance();
  assert.deepEqual(game.data.player, { x: 50, y: 55 });
  game.onTouchMove({ touches: [touch(398, 500)] });
  advance();
  closeTo(game.player.x, 51.44); // 180 px/s * 32 ms / 400 px.
  const first = game.player.x;
  advance();
  closeTo(game.player.x - first, 1.44);
  game.onTouchEnd({ touches: [] });
  const stopped = { ...game.player };
  advance();
  assert.deepEqual(game.data.player, stopped);
});

test('diagonal movement has the same physical speed and clamps to arena bounds', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] });
  game.onTouchMove({ touches: [touch(148, 248)] });
  advance();
  closeTo(Math.hypot((game.player.x - 50) * 4, (game.player.y - 55) * 6), 180 * 0.032);
  for (let i = 0; i < 300; i++) advance();
  assert.deepEqual(game.data.player, { x: 95, y: 90 });
});

test('touch cancellation, backgrounding and upgrades stop movement; delayed frames cannot jump', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(10, 100)] });
  game.onTouchMove({ touches: [touch(100, 100)] });
  advance(10000);
  closeTo(game.player.x, 52.25); // At most 50 ms of movement after a stall.
  game.onTouchEnd({ touches: [] });
  advance();
  closeTo(game.player.x, 52.25);
  game.onTouchStart({ touches: [touch(10, 100)] });
  game.onTouchMove({ touches: [touch(100, 100)] });
  game.onHide();
  advance();
  closeTo(game.player.x, 52.25);
  game.levelUp();
  game.onTouchStart({ touches: [touch(10, 100)] });
  game.dash();
  advance();
  closeTo(game.player.x, 52.25);
});

test('a second finger does not take over movement or stop the first finger', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] });
  game.onTouchMove({ touches: [touch(148, 200), touch(0, 0, 2)] });
  game.onTouchEnd({ touches: [touch(148, 200)] });
  advance();
  closeTo(game.player.x, 51.44);
  game.onTouchEnd({ touches: [touch(0, 0, 2)] });
  advance();
  closeTo(game.player.x, 51.44);
});

test('dash travels over multiple frames in the last direction and respects cooldown', () => {
  const { game, advance } = setup();
  game.dash();
  closeTo(game.player.x, 50);
  advance();
  closeTo(game.player.x, 54.32);
  const remaining = game.dashRemaining;
  game.dash();
  closeTo(game.dashRemaining, remaining);
  for (let i = 0; i < 8; i++) advance();
  const stopped = { ...game.player };
  advance();
  assert.deepEqual(game.data.player, stopped);
});

test('level-up commits enemy deaths once and resumes combat after selection', () => {
  const { game } = setup();
  game.setData({ xp: 4, enemies: [enemy(1, { hp: 1 }), enemy(2, { x: 85 })] });
  game.tick();
  assert.equal(game.data.showChoice, true);
  assert.equal(game.data.choices.length, 3);
  assert.equal(game.data.xp, 5);
  assert.equal(game.data.enemies.length, 1);
  assert.equal(game.data.enemies[0].id, 2);
  game.tick(); // Choice pauses both combat and experience gain.
  assert.equal(game.data.xp, 5);
  game.chooseUpgrade({ currentTarget: { dataset: { index: '0' } } });
  assert.equal(game.data.level, 2);
  assert.equal(game.data.xp, 0);
  assert.equal(game.data.showChoice, false);
  const ticks = game.stageTicks;
  game.tick();
  assert.equal(game.stageTicks, ticks + 1);
  assert.equal(game.data.xp, 0);
  assert.equal(game.data.enemies.length, 1);
  assert.ok(game.data.message.includes('已生效'));
});

test('power changes actual damage and the displayed damage immediately', () => {
  const { game } = setup();
  choose(game, 'power');
  game.setData({ enemies: [enemy()] });
  game.tick();
  closeTo(game.data.enemies[0].hp, 18.75);
  closeTo(game.data.enemies[0].hpPct, 93.75);
  assert.ok(game.data.combatStats.includes('1.25'));
});

test('haste shortens the pending and future attack interval, including stacked upgrades', () => {
  const { game } = setup();
  game.attackCd = 10;
  choose(game, 'haste');
  closeTo(game.attackCd, 8.2);
  game.attackCd = 0;
  game.setData({ enemies: [enemy()] });
  game.tick();
  closeTo(game.attackCd, Math.round(11 * 0.82));
  assert.ok(game.data.combatStats.includes('1.8秒'));
  for (let i = 0; i < 6; i++) choose(game, 'haste');
  game.attackCd = 0;
  game.tick();
  assert.ok(game.attackCd < 5);
});

test('health raises maximum HP and heals immediately without exceeding the cap', () => {
  const { game } = setup();
  game.setData({ hp: 50 });
  choose(game, 'health');
  assert.equal(game.data.maxHp, 120);
  assert.equal(game.data.hp, 75);
  game.setData({ hp: 120 });
  choose(game, 'health');
  assert.equal(game.data.hp, 140);
});

test('fire burns over time even without another attack, then expires', () => {
  const { game } = setup();
  choose(game, 'fire');
  game.setData({ enemies: [enemy()] });
  game.tick();
  closeTo(game.data.enemies[0].hp, 19);
  assert.equal(game.data.enemies[0].burnTicks, 10);
  game.attackCd = 100;
  for (let i = 0; i < 10; i++) game.tick();
  closeTo(game.data.enemies[0].hp, 18.5);
  game.tick();
  closeTo(game.data.enemies[0].hp, 18.5);
});

test('water reduces actual enemy movement temporarily without corrupting base speed', () => {
  const { game } = setup();
  choose(game, 'water');
  game.setData({ enemies: [enemy(1, { speed: 0.4 })] });
  game.tick();
  game.attackCd = 100;
  const before = game.data.enemies[0].x;
  game.tick();
  closeTo(before - game.data.enemies[0].x, 0.2);
  for (let i = 0; i < 14; i++) game.tick();
  const expired = game.data.enemies[0].x;
  game.tick();
  closeTo(expired - game.data.enemies[0].x, 0.4);
});

test('water and fire combine into additional steam damage', () => {
  const { game } = setup();
  choose(game, 'fire'); choose(game, 'water');
  game.setData({ enemies: [enemy()] });
  game.tick();
  closeTo(game.data.enemies[0].hp, 18.5);
  assert.equal(game.data.effects[0].type, 'steam');
});

test('earth damages nearby enemies and leaves distant enemies unaffected', () => {
  const { game } = setup();
  choose(game, 'earth');
  game.setData({ enemies: [enemy(1, { x: 60 }), enemy(2, { x: 65 }), enemy(3, { x: 90 })] });
  game.tick();
  closeTo(game.data.enemies[0].hp, 19);
  closeTo(game.data.enemies[1].hp, 19.7);
  closeTo(game.data.enemies[2].hp, 20);
});

test('repeated elements strengthen damage and invalid/duplicate taps do not grant upgrades', () => {
  const { game } = setup();
  choose(game, 'fire'); choose(game, 'fire');
  closeTo(game.power, 1.12);
  assert.equal(game.elements.length, 1);
  assert.ok(game.data.message.includes('12%'));
  const level = game.data.level;
  game.chooseUpgrade({ currentTarget: { dataset: { index: '0' } } });
  assert.equal(game.data.level, level);
  game.levelUp();
  game.chooseUpgrade({ currentTarget: { dataset: { index: 'invalid' } } });
  assert.equal(game.data.showChoice, true);
});

test('killing a boss on the level-up hit advances the stage and never repeats the reward', () => {
  const { game } = setup();
  game.bossSpawned = true;
  game.setData({ xp: 4, enemies: [enemy(1, { boss: true, hp: 1 })] });
  game.tick();
  assert.equal(game.data.stage, 2);
  assert.equal(game.data.showChoice, true);
  assert.equal(game.data.enemies.length, 0);
  game.chooseUpgrade({ currentTarget: { dataset: { index: '0' } } });
  game.tick();
  assert.equal(game.data.stage, 2);
  assert.equal(game.data.xp, 0);
});

test('restart resets boss/dash/element state and unload clears all timers', () => {
  const { game, timers } = setup();
  game.bossSpawned = true;
  choose(game, 'fire'); game.dash();
  game.restart();
  assert.equal(game.bossSpawned, false);
  assert.equal(game.dashRemaining, 0);
  assert.equal(game.elements.length, 0);
  assert.equal(game.power, 1);
  assert.equal(timers.size, 3);
  game.onUnload();
  assert.equal(timers.size, 0);
});
