'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/index/index.js'), 'utf8');

function setup(options = {}) {
  let definition, now = 1000, nextTimer = 0;
  const timers = new Map(), writes = [], audioCalls = [];
  const windowInfo = { windowWidth: 400, ...options.windowInfo };
  vm.runInNewContext(source, {
    Page(page) { definition = page; },
    Date: { now: () => now },
    require: createRequire(path.join(__dirname, '../miniprogram/pages/index/index.js')),
    wx: { vibrateShort() {}, getWindowInfo: () => windowInfo,
      getStorageSync: () => options.saved || {}, setStorageSync: (key, value) => writes.push(structuredClone(value)),
      createInnerAudioContext: () => ({ src: '', volume: 1, stop() {}, play() { audioCalls.push({ src: this.src, volume: this.volume }); }, destroy() { audioCalls.push({ destroyed: true }); } }) },
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
    let selector;
    const query = {
      select(value) { selector = value; return query; },
      boundingClientRect(callback) { callback(selector === '.joystick-pad' ? { left: 44, top: 144, width: 112, height: 112 } : { left: 20, top: 110, width: 400, height: 600 }); return query; },
      exec() {}
    };
    return query;
  };
  game.onLoad();game.beginGame();
  game.setData({ enemies: [] });
  return { game, timers, writes, audioCalls, windowInfo, advance(ms = 32) { now += ms; game.moveFrame(); }, elapse(ms) { now += ms; }, fireTimer(id) { const callback = timers.get(id); timers.delete(id); callback(); } };
}

function enemy(id = 1, patch = {}) {
  return { id, x: 70, y: 55, hp: 20, maxHp: 20, hpPct: 100, speed: 0, boss: false, ...patch };
}
function choose(game, kind) {
  game.choiceSequence = (game.choiceSequence || 0) + 1;
  game.setData({ showChoice: true, choices: [{ id: kind, kind, name: kind }], choiceToken: game.choiceSequence, xp: game.data.xpNeed });
  game.chooseUpgrade(upgradeEvent(game));
}
function upgradeEvent(game, index = 0) { return { type: 'tap', currentTarget: { dataset: { upgradeId: game.data.choices[index] ? game.data.choices[index].id : 'invalid', choiceToken: String(game.data.choiceToken) } }, target: { dataset: {} } }; }
function touch(x, y, identifier = 1) { return { clientX: x, clientY: y, identifier }; }
function closeTo(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test('joystick input does not teleport; dragging walks continuously until release', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] });
  advance();
  assert.deepEqual(game.data.player, { x: 50, y: 55 });
  game.onTouchMove({ touches: [touch(148, 200)] });
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
  assert.deepEqual(game.data.player, { x: 87.2, y: 90 });
});

test('touch cancellation, backgrounding and upgrades stop movement; delayed frames cannot jump', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] });
  game.onTouchMove({ touches: [touch(148, 200)] });
  advance(10000);
  closeTo(game.player.x, 52.25); // At most 50 ms of movement after a stall.
  game.onTouchEnd({ touches: [] });
  advance();
  closeTo(game.player.x, 52.25);
  game.onTouchStart({ touches: [touch(100, 200)] });
  game.onTouchMove({ touches: [touch(148, 200)] });
  game.onHide();
  advance();
  closeTo(game.player.x, 52.25);
  game.levelUp();
  game.onTouchStart({ touches: [touch(100, 200)] });
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

test('dash is removed from both gameplay and touch controls', () => {
  const { game } = setup();
  assert.equal(game.dash, undefined);
  const template = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/index/index.wxml'), 'utf8');
  assert.ok(!template.includes('bindtap="dash"'));
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
  game.chooseUpgrade(upgradeEvent(game));
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
  game.chooseUpgrade(upgradeEvent(game));
  assert.equal(game.data.level, level);
  game.levelUp();
  game.chooseUpgrade(upgradeEvent(game, -1));
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
  game.chooseUpgrade(upgradeEvent(game));
  game.tick();
  assert.equal(game.data.stage, 2);
  assert.equal(game.data.xp, 0);
});

test('restart resets boss/animation/element state and unload clears all timers', () => {
  const { game, timers } = setup();
  game.bossSpawned = true;
  choose(game, 'fire');
  game.restart();
  assert.equal(game.bossSpawned, false);
  assert.equal(game.data.actorFrame.action, 'idle');
  assert.equal(game.elements.length, 0);
  assert.equal(game.power, 1);
  assert.equal(timers.size, 3);
  game.onUnload();
  assert.equal(timers.size, 0);
});

test('the game plays movement frames and faces the real movement direction', () => {
  const { game, advance } = setup();
  assert.equal(game.data.actorFrame.action, 'idle');
  game.onTouchStart({ touches: [touch(100, 200)] });
  game.onTouchMove({ touches: [touch(148, 200)] });
  advance();
  assert.equal(game.data.actorFrame.action, 'move');
  assert.equal(game.data.actorFrame.direction, 'right');
  closeTo(game.data.actorFrame.top, -307.2);
  for (let i = 0; i < 4; i++) advance();
  assert.equal(game.data.actorFrame.index, 1);
  game.onTouchEnd({ touches: [] });advance();
  assert.equal(game.data.actorFrame.action, 'idle');
  assert.equal(game.data.actorFrame.direction, 'right');
});

test('attacks face their target while moving, then return to the current travel direction', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] });
  game.onTouchMove({ touches: [touch(148, 200)] });advance();
  game.setData({ enemies: [enemy(1, { x: game.player.x, y: 45 })] });
  game.tick();
  assert.equal(game.data.actorFrame.action, 'attack');
  assert.equal(game.data.actorFrame.direction, 'up');
  game.onTouchMove({ touches: [touch(52, 200)] });
  const before = game.player.x;advance();
  assert.ok(game.player.x < before);
  assert.equal(game.data.actorFrame.direction, 'up');
  for (let i = 0; i < 16; i++) advance();
  assert.equal(game.data.actorFrame.action, 'move');
  assert.equal(game.data.actorFrame.direction, 'left');
});

test('target facing uses the measured arena aspect ratio', () => {
  const { game } = setup();
  game.setData({ enemies: [enemy(1, { x: 60, y: 64 })] });
  game.tick(); // 10% * 400px is less than 9% * 600px.
  assert.equal(game.data.actorFrame.direction, 'down');
});

test('damage and upgrade selection trigger their own six-frame clips', () => {
  const { game, advance } = setup();
  game.attackCd = 100;
  game.setData({ enemies: [enemy(1, { x: 50, y: 55 })] });
  game.tick();
  assert.equal(game.data.actorFrame.action, 'hurt');
  for (let i = 0; i < 13; i++) advance();
  assert.equal(game.data.actorFrame.action, 'idle');
  choose(game, 'power');
  assert.equal(game.data.actorFrame.action, 'awaken');
  for (let i = 0; i < 33; i++) advance();
  assert.equal(game.data.actorFrame.action, 'idle');
});

test('death plays before the ending modal; combat and movement remain stopped', () => {
  const { game, advance, fireTimer, timers } = setup();
  game.finish(false);
  assert.equal(game.data.ended, true);
  assert.equal(game.data.showEnding, false);
  assert.equal(game.data.actorFrame.action, 'death');
  assert.ok(!timers.has(game.gameTimer));
  assert.ok(!timers.has(game.spawnTimer));
  for (let i = 0; i < 30; i++) advance();
  assert.equal(game.data.actorFrame.index, 5);
  assert.deepEqual(game.data.player, { x: 50, y: 55 });
  fireTimer(game.endingTimer);
  assert.equal(game.data.showEnding, true);
  assert.equal(timers.size, 0);
});

test('animation assets fit the main package and retain the required grid', () => {
  const root = path.join(__dirname, '../miniprogram');
  const files = fs.readdirSync(root, { recursive: true }).filter(file => fs.statSync(path.join(root, file)).isFile());
  const size = files.reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0);
  assert.ok(size < 2 * 1024 * 1024, 'Mini-program main package exceeds 2 MiB: ' + size);
  for (const action of ['idle', 'move', 'attack', 'hurt', 'awaken', 'death']) {
    const png = fs.readFileSync(path.join(root, 'images/pangu', action + '.png'));
    assert.equal(png.readUInt32BE(16), 768);
    assert.equal(png.readUInt32BE(20), 512);
    assert.ok(png.includes(Buffer.from('tRNS')), 'Missing alpha transparency: ' + action);
  }
});

test('distant enemies cannot trigger attacks, damage or attack effects', () => {
  const { game } = setup();
  game.setData({ enemies: [enemy(1, { x: 95 })] });
  for (let i = 0; i < 10; i++) game.tick();
  assert.equal(game.data.enemies[0].hp, 20);
  assert.equal(game.data.effects.length, 0);
  assert.equal(game.data.actorFrame.action, 'idle');
  assert.equal(game.attackCd, 0);
});

test('range includes the circle boundary and excludes points just outside it', () => {
  const { game } = setup();
  const boundary = game.player.x + game.data.attackRange * game.rpxScale / 4;
  const target = enemy(1, { x: boundary + 0.01 });
  assert.equal(game.inAttackRange(target), false);
  target.x = boundary;
  assert.equal(game.inAttackRange(target), true);
  game.setData({ enemies: [target] });game.tick();
  assert.equal(game.data.enemies[0].hp, 19);
});

test('targets are selected by screen distance within range on rectangular arenas', () => {
  const { game } = setup();
  game.setData({ enemies: [enemy(1, { x: 69 }), enemy(2, { x: 50, y: 68 })] });
  game.tick();
  assert.equal(game.data.enemies[0].hp, 19);
  assert.equal(game.data.enemies[1].hp, 20);
  assert.equal(game.data.actorFrame.direction, 'right');
});

test('a monster moving into range is attacked as soon as cooldown is ready', () => {
  const { game } = setup();
  const x = game.player.x + (game.data.attackRange * game.rpxScale + 1) / 4;
  game.setData({ enemies: [enemy(1, { x, speed: 0.4 })] });
  game.tick();
  assert.equal(game.data.enemies[0].hp, 19);
});

test('earth splash never starts damage outside the player attack circle', () => {
  const { game } = setup();choose(game, 'earth');
  game.setData({ enemies: [enemy(1, { x: 70 }), enemy(2, { x: 72 })] });game.tick();
  assert.equal(game.data.enemies[0].hp, 19);
  assert.equal(game.data.enemies[1].hp, 20);
});

test('touches outside the visible joystick do not move the character', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(300, 400)] });
  game.onTouchMove({ touches: [touch(350, 400)] });advance();
  assert.deepEqual(game.data.player, { x: 50, y: 55 });
  assert.equal(game.data.joystick.active, false);
});

test('joystick knob stays within its base and recenters when released or a modal opens', () => {
  const { game } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] });
  game.onTouchMove({ touches: [touch(300, 400)] });
  closeTo(Math.hypot(game.data.joystick.x, game.data.joystick.y), 64);
  assert.equal(game.data.joystick.active, true);
  game.onTouchEnd({ touches: [] });
  assert.deepEqual(game.data.joystick, { x: 0, y: 0, active: false });
  game.onTouchStart({ touches: [touch(140, 200)] });
  game.setData({ xp: game.data.xpNeed });game.levelUp();
  assert.deepEqual(game.data.joystick, { x: 0, y: 0, active: false });
});

test('touch-end selection works without a generated tap and applies exactly once', () => {
  const { game } = setup();
  game.setData({ xp: 5 });game.levelUp();
  const e = upgradeEvent(game);
  game.onUpgradeTouchStart({ ...e, type: 'touchstart', touches: [touch(200, 300)] });
  game.onUpgradeTouchMove({ ...e, touches: [touch(203, 302)] });
  game.onUpgradeTouchEnd({ ...e, type: 'touchend', changedTouches: [touch(203, 302)] });
  assert.equal(game.data.showChoice, false);
  assert.equal(game.data.level, 2);
  assert.equal(game.data.xp, 0);
  assert.ok(game.data.message.includes('已生效'));
  const power = game.power;
  game.chooseUpgrade(e);
  assert.equal(game.data.level, 2);
  closeTo(game.power, power);
});

test('dragged and cancelled upgrade gestures leave the choice open', () => {
  const { game } = setup();game.setData({ xp: 5 });game.levelUp();
  const e = upgradeEvent(game);
  game.onUpgradeTouchStart({ ...e, touches: [touch(200, 300)] });
  game.onUpgradeTouchMove({ ...e, touches: [touch(250, 300)] });
  game.onUpgradeTouchEnd(e);
  assert.equal(game.data.showChoice, true);
  game.onUpgradeTouchStart({ ...e, touches: [touch(200, 300)] });
  game.onUpgradeTouchCancel();game.onUpgradeTouchEnd(e);
  assert.equal(game.data.level, 1);
});

test('queued upgrades visibly close first and reject taps from the previous modal', () => {
  const { game, fireTimer } = setup();game.setData({ xp: 12 });game.levelUp();
  const first = upgradeEvent(game);
  game.chooseUpgrade(first);
  assert.equal(game.data.showChoice, false);
  assert.equal(game.data.level, 2);
  assert.equal(game.data.xp, 7);
  fireTimer(game.upgradeTimer);
  assert.equal(game.data.showChoice, true);
  assert.notEqual(String(game.data.choiceToken), first.currentTarget.dataset.choiceToken);
  game.chooseUpgrade(first);
  assert.equal(game.data.level, 2);
  game.chooseUpgrade(upgradeEvent(game));
  assert.equal(game.data.level, 3);
  assert.equal(game.data.xp, 0);
  assert.equal(game.data.showChoice, false);
});

test('landscape keeps actor and attack range scale tied to the short viewport edge', () => {
  const { game, windowInfo } = setup({ windowInfo: { windowWidth: 844, windowHeight: 390 } });
  closeTo(game.data.uiScale, 390 / 750);
  closeTo(game.data.attackRange * game.rpxScale, 83.2);
  windowInfo.windowWidth = 390;windowInfo.windowHeight = 844;
  game.onResize();
  closeTo(game.data.uiScale, 390 / 750);
  closeTo(game.data.attackRange * game.rpxScale, 83.2);
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '../miniprogram/app.json')));
  assert.equal(app.window.pageOrientation, 'landscape');
});

test('opening settings pauses simulation, spawning, movement and audio; close resumes once', () => {
  const { game, advance, timers } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] });game.onTouchMove({ touches: [touch(148, 200)] });
  const before = { ticks: game.stageTicks, enemies: game.data.enemies.length, player: { ...game.player } };
  game.openSettings();
  assert.equal(game.data.paused, true);assert.equal(game.data.showSettings, true);
  assert.equal(timers.size, 0);
  game.tick();game.spawnEnemy();advance(5000);
  assert.equal(game.stageTicks, before.ticks);assert.equal(game.data.enemies.length, before.enemies);
  assert.deepEqual(game.data.player, before.player);
  game.closeSettings();
  assert.equal(game.data.paused, false);assert.equal(timers.size, 3);
  game.closeSettings();assert.equal(timers.size, 3);
  game.tick();assert.equal(game.stageTicks, before.ticks + 1);
});

test('pause preserves scheduled upgrade time and never consumes a selection under settings', () => {
  const { game, elapse, fireTimer } = setup();
  game.setData({ xp: 12 });game.levelUp();game.chooseUpgrade(upgradeEvent(game));
  elapse(200);game.openSettings();
  assert.equal(game.pendingTimers.upgradeTimer.remaining, 400);
  elapse(10000);game.onShow();assert.equal(game.data.paused, true);
  game.closeSettings();
  assert.equal(game.pendingTimers.upgradeTimer.remaining, 400);
  fireTimer(game.upgradeTimer);assert.equal(game.data.showChoice, true);
  const event = upgradeEvent(game);game.openSettings();game.chooseUpgrade(event);
  assert.equal(game.data.level, 2);assert.equal(game.data.showChoice, true);
  game.closeSettings();game.chooseUpgrade(event);
  assert.equal(game.data.level, 3);assert.equal(game.data.showChoice, false);
});

test('background pause resumes only when no settings panel is open', () => {
  const { game, timers } = setup();
  game.onHide();assert.equal(game.data.paused, true);assert.equal(timers.size, 0);
  game.onShow();assert.equal(game.data.paused, false);assert.equal(timers.size, 3);
  game.openSettings();game.onHide();game.onShow();
  assert.equal(game.data.paused, true);assert.equal(game.data.showSettings, true);
});

test('exit returns to the main menu, clears delayed callbacks and starts a fresh game', () => {
  const { game, timers } = setup();
  choose(game, 'fire');game.notify('pause me');game.openSettings();game.requestExit();
  assert.equal(game.data.confirmExit, true);
  game.cancelExit();assert.equal(game.data.confirmExit, false);
  game.requestExit();game.exitToHome();
  assert.equal(game.data.view, 'home');assert.equal(game.data.showSettings, false);
  assert.equal(game.data.showChoice, false);assert.equal(timers.size, 0);
  game.beginGame();
  assert.equal(game.data.level, 1);assert.equal(game.elements.length, 0);assert.equal(game.data.paused, false);
  assert.equal(timers.size, 3);
});

test('sound, volume, vibration and hints are restored and persisted independently of a run', () => {
  const { game, writes } = setup({ saved: { soundOn: false, effectVolume: 25, vibrationOn: false, hintsOn: false } });
  assert.equal(game.data.soundOn, false);assert.equal(game.data.effectVolume, 25);
  assert.equal(game.data.vibrationOn, false);assert.equal(game.data.hintsOn, false);
  game.toggleSound({ detail: { value: true } });game.changeVolume({ detail: { value: 35 } });
  game.exitToHome();game.beginGame();assert.equal(game.data.effectVolume, 35);
  assert.deepEqual(writes.at(-1), { soundOn: true, effectVolume: 35, vibrationOn: false, hintsOn: false });
});

test('audio settings affect actual playback, volume and lifecycle cleanup', () => {
  const { game, audioCalls } = setup();
  game.previewSound();assert.ok(audioCalls.at(-1).src.endsWith('/upgrade.wav'));
  game.toggleSound({ detail: { value: false } });
  const count = audioCalls.length;game.previewSound();assert.equal(audioCalls.length, count);
  game.toggleSound({ detail: { value: true } });game.changeVolume({ detail: { value: 25 } });
  game.previewSound();closeTo(audioCalls.at(-1).volume, 0.25);
  game.onUnload();assert.ok(audioCalls.at(-1).destroyed);
});

test('death animation and its ending timer remain frozen while settings is open', () => {
  const { game, elapse, advance, fireTimer } = setup();
  game.finish(false);elapse(150);game.openSettings();
  const index = game.data.actorFrame.index;
  advance(5000);assert.equal(game.data.actorFrame.index, index);assert.equal(game.data.showEnding, false);
  game.closeSettings();assert.equal(game.pendingTimers.endingTimer.remaining, 900);
  fireTimer(game.endingTimer);assert.equal(game.data.showEnding, true);
});

test('bundled sound cues are valid local mono PCM WAV files', () => {
  for (const name of ['attack', 'hurt', 'upgrade', 'victory', 'death']) {
    const wav = fs.readFileSync(path.join(__dirname, '../miniprogram/audio', name + '.wav'));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt16LE(22), 1);assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
  }
});
