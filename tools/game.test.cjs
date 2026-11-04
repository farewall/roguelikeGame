'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, upgradeEvent, choose, touch } = require('./game-harness.cjs');
function closeTo(a, b) { assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`); }

test('joystick walks continuously in screen pixels, stops on release, and never teleports', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] }); advance();
  assert.deepEqual(game.data.player, { x: 50, y: 55 });
  game.onTouchMove({ touches: [touch(148, 200)] }); advance(); closeTo(game.player.x, 51.28);
  advance(); closeTo(game.player.x, 52.56);
  game.onTouchEnd({ touches: [] }); advance(); closeTo(game.player.x, 52.56);
  assert.deepEqual(game.data.joystick, { x: 0, y: 0, active: false });
});
test('diagonal movement retains physical speed and clamps actor to visible arena', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] }); game.onTouchMove({ touches: [touch(148, 248)] }); advance();
  closeTo(Math.hypot((game.player.x - 50) * 4, (game.player.y - 55) * 6), 160 * 0.032);
  for (let i = 0; i < 300; i++) advance();
  assert.deepEqual(game.data.player, { x: 87.2, y: 90 });
});
test('outside touches and a second finger do not take over the joystick', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(300, 400)] }); advance(); closeTo(game.player.x, 50);
  game.onTouchStart({ touches: [touch(100, 200)] }); game.onTouchMove({ touches: [touch(148, 200), touch(0, 0, 2)] });
  game.onTouchEnd({ touches: [touch(148, 200)] }); advance(); closeTo(game.player.x, 51.28);
  game.onTouchEnd({ touches: [touch(0, 0, 2)] }); advance(); closeTo(game.player.x, 51.28);
});
test('stalled movement is bounded and backgrounding resets the joystick', () => {
  const { game, advance } = setup();
  game.onTouchStart({ touches: [touch(100, 200)] }); game.onTouchMove({ touches: [touch(148, 200)] }); advance(10000);
  closeTo(game.player.x, 52); game.onHide(); advance(10000); closeTo(game.player.x, 52);
  assert.equal(game.data.joystick.active, false);
});
test('movement animation faces travel direction; attack faces screen-space target and recovers', () => {
  const { game, advance, simulate } = setup();
  game.combat.remaining = 0; game.combat.phaseTime = -100;
  game.onTouchStart({ touches: [touch(100, 200)] }); game.onTouchMove({ touches: [touch(148, 200)] }); advance();
  assert.equal(game.data.actorFrame.action, 'move'); assert.equal(game.data.actorFrame.direction, 'right');
  const e = game.combat.spawn('wraith'); Object.assign(e, { x: game.player.x, y: 45, speed: 0, hp: 30, maxHp: 30 });
  game.tick(0.025); assert.equal(game.data.actorFrame.action, 'attack'); assert.equal(game.data.actorFrame.direction, 'up');
  game.onTouchMove({ touches: [touch(52, 200)] }); simulate(0.6);
  assert.equal(game.data.actorFrame.action, 'move'); assert.equal(game.data.actorFrame.direction, 'left');
});
test('upgrade pauses combat, includes changes, and a touch-end plus tap applies once', () => {
  const { game, simulate } = setup(); game.combat.xp = 5; game.syncCombat(); game.levelUp();
  assert.equal(game.data.choices.length, 3); assert.ok(game.data.choices.every(c => c.change));
  const t = game.combat.time; simulate(2); closeTo(game.combat.time, t);
  const e = upgradeEvent(game);
  game.onUpgradeTouchStart({ ...e, touches: [touch(200, 300)] }); game.onUpgradeTouchMove({ ...e, touches: [touch(203, 302)] }); game.onUpgradeTouchEnd(e);
  assert.equal(game.data.showChoice, false); assert.equal(game.data.level, 2); assert.equal(game.data.xp, 0);
  assert.equal(game.data.actorFrame.action, 'awaken'); assert.ok(game.data.message.includes('已生效'));
  game.chooseUpgrade(e); assert.equal(game.data.level, 2); simulate(0.5); closeTo(game.combat.time, t);
});
test('dragged, cancelled and invalid upgrade gestures do not apply choices', () => {
  const { game } = setup(); game.combat.xp = 5; game.levelUp(); const e = upgradeEvent(game);
  game.onUpgradeTouchStart({ ...e, touches: [touch(200, 300)] }); game.onUpgradeTouchMove({ ...e, touches: [touch(250, 300)] }); game.onUpgradeTouchEnd(e);
  game.onUpgradeTouchStart({ ...e, touches: [touch(200, 300)] }); game.onUpgradeTouchCancel(); game.onUpgradeTouchEnd(e);
  game.chooseUpgrade(upgradeEvent(game, -1)); assert.equal(game.data.showChoice, true); assert.equal(game.data.level, 1);
});
test('queued upgrades close for awakening then reject the old modal token', () => {
  const { game, fireTimer, advance } = setup(); game.combat.xp = 12; game.levelUp(); const first = upgradeEvent(game);
  game.chooseUpgrade(first); assert.equal(game.data.showChoice, false); assert.equal(game.data.level, 2); assert.equal(game.data.xp, 7);
  for (let i = 0; i < 33; i++) advance(); fireTimer(game.upgradeTimer);
  assert.equal(game.data.showChoice, true); game.chooseUpgrade(first); assert.equal(game.data.level, 2);
  game.chooseUpgrade(upgradeEvent(game)); assert.equal(game.data.level, 3); assert.equal(game.data.xp, 0);
});
test('settings freezes simulation, pending strikes and warning clocks; resume creates no duplicate loops', () => {
  const { game, simulate, timers } = setup(); simulate(0.5); game.combat.circle(game.player, 100, 1, 1, '劫', 'arcane');
  const before = game.combat.time; game.openSettings(); assert.equal(timers.size, 0); simulate(10);
  closeTo(game.combat.time, before); closeTo(game.combat.hazards[0].age, 0);
  game.closeSettings(); const count = timers.size; game.closeSettings(); assert.equal(timers.size, count);
  simulate(0.1); assert.ok(game.combat.time > before);
});
test('pause preserves remaining awakening timer and prevents selection under settings', () => {
  const { game, elapse, fireTimer } = setup(); choose(game, 'fire'); elapse(200); game.openSettings();
  assert.equal(game.pendingTimers.upgradeTimer.remaining, 800); elapse(10000); game.onShow(); assert.equal(game.data.paused, true);
  game.closeSettings(); assert.equal(game.pendingTimers.upgradeTimer.remaining, 800); fireTimer(game.upgradeTimer);
  game.combat.xp = game.combat.xpNeed; game.levelUp(); const e = upgradeEvent(game); game.openSettings(); game.chooseUpgrade(e);
  assert.equal(game.data.level, 2); game.closeSettings(); game.chooseUpgrade(e); assert.equal(game.data.level, 3);
});
test('background resumes once unless settings remains open', () => {
  const { game, timers } = setup(); game.onHide(); assert.equal(timers.size, 0); game.onShow(); const size = timers.size;
  game.onShow(); assert.equal(timers.size, size); game.openSettings(); game.onHide(); game.onShow(); assert.equal(game.data.paused, true);
});
test('boss kill with level-up pauses for memory before offering upgrades and clears the old stage', () => {
  const { game } = setup(); const c = game.combat; c.enemies = []; c.phase = 3; c.xp = 4;
  const boss = c.spawn('boss'); boss.hp = 0; c.spawn('ranged'); c.circle(game.player, 80, 1, 1, '羽', 'flame');
  c.collectDeaths(); game.tick(0.025);
  assert.equal(game.data.showMemory, true); assert.equal(game.data.showChoice, false); assert.equal(c.enemies.length, 0); assert.equal(c.hazards.length, 0);
  assert.deepEqual(game.archive.memories, [1]); game.selectMemoryReward({ currentTarget: { dataset: { reward: 'echo' } } }); game.continueStage(); assert.equal(c.stage, 2); assert.equal(game.data.showChoice, true);
  game.continueStage(); assert.equal(c.stage, 2); assert.deepEqual(game.archive.memories, [1]);
});
test('all four memories survive death/restart, stay hidden until unlocked, and are readable from home', () => {
  const { game, fireTimer } = setup(); assert.ok(game.data.archiveMemories.every(m => !m.copy));
  for (let stage = 1; stage <= 4; stage++) { game.combat.stage = stage; game.combat.cleared = true; game.completeStage(); if (game.data.rewardChoices.length) game.selectMemoryReward({ currentTarget: { dataset: { reward: game.data.rewardChoices[0].id } } }); game.continueStage(); }
  game.finish(false); fireTimer(game.endingTimer); game.exitToHome(); game.openArchive();
  assert.equal(game.data.memoryCount, 4); assert.equal(game.data.archiveRuns.length, 1); assert.ok(game.data.archiveMemories[3].copy.includes('盘古'));
  game.beginGame(); assert.equal(game.combat.stage, 1); assert.equal(game.combat.power, 1); assert.equal(game.archive.memories.length, 4);
});
test('weapon selection changes real attack mechanics; restart preserves selection but resets the build', () => {
  const { game } = setup(); game.selectWeapon({ currentTarget: { dataset: { weapon: 'banner' } } }); game.beginGame();
  assert.equal(game.combat.weapon, 'banner'); assert.equal(game.data.attackRange, 360);
  choose(game, 'fire'); game.restart(); assert.equal(game.combat.elements.fire, 0); assert.equal(game.combat.weapon, 'banner');
});
test('death plays six frames before summary; settings freezes the animation and its timer', () => {
  const { game, elapse, advance, fireTimer, timers } = setup(); game.finish(false);
  assert.equal(game.data.ended, true); assert.equal(game.data.showEnding, false); assert.equal(game.data.actorFrame.action, 'death');
  elapse(150); game.openSettings(); const frame = game.data.actorFrame.index; advance(5000); assert.equal(game.data.actorFrame.index, frame);
  game.closeSettings(); assert.equal(game.pendingTimers.endingTimer.remaining, 900);
  for (let i = 0; i < 33; i++) advance(); assert.equal(game.data.actorFrame.index, 5);
  fireTimer(game.endingTimer); assert.equal(game.data.showEnding, true); assert.equal(timers.size, 0);
  assert.equal(game.archive.runs.length, 1); game.finish(false); assert.equal(game.archive.runs.length, 1);
});
test('victory and recent eight summaries persist; unload and exit clear every timer', () => {
  const { game, timers, storage } = setup();
  for (let i = 0; i < 10; i++) { game.combat.stage = 5; game.combat.time = 125; game.finish(true); game.restart(); }
  assert.equal(storage['pangu.archive.v1'].runs.length, 8); assert.equal(game.archive.runs[0].won, true);
  game.combat.time = 125; game.finish(true); assert.equal(game.data.runSummary.timeLabel, '2:05'); game.exitToHome(); assert.equal(timers.size, 0);
  game.beginGame(); game.onUnload(); assert.equal(timers.size, 0);
});
test('audio settings persist independently of a run and control playback and cleanup', () => {
  const { game, audioCalls, storage } = setup({ saved: { soundOn: false, effectVolume: 25, vibrationOn: false, hintsOn: false } });
  game.previewSound(); assert.equal(audioCalls.length, 0); game.toggleSound({ detail: { value: true } }); game.changeVolume({ detail: { value: 35 } });
  game.previewSound(); closeTo(audioCalls.at(-1).volume, 0.35); game.exitToHome(); game.beginGame(); assert.equal(game.data.effectVolume, 35);
  assert.deepEqual(storage['pangu.settings.v1'], { soundOn: true, effectVolume: 35, vibrationOn: false, hintsOn: false });
  game.onUnload(); assert.ok(audioCalls.at(-1).destroyed);
});
test('short-edge scaling survives resize and the Mini Game remains landscape without dash controls', () => {
  const { game, windowInfo } = setup({ windowInfo: { windowWidth: 844, windowHeight: 390 } });
  closeTo(game.data.uiScale, 390 / 750); windowInfo.windowWidth = 390; windowInfo.windowHeight = 844; game.onResize(); closeTo(game.data.uiScale, 390 / 750);
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '../game/game.json'))); assert.equal(app.deviceOrientation, 'landscape'); assert.equal(game.dash, undefined);
});
test('runtime assets fit the 4 MiB Mini Game budget, preserve animation transparency and contain valid local audio', () => {
  const root = path.join(__dirname, '../minigame');
  const files = fs.readdirSync(root, { recursive: true }).filter(file => fs.statSync(path.join(root, file)).isFile());
  const size = files.reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0); assert.ok(size < 4 * 1024 * 1024, 'Mini Game build exceeds 4 MiB: ' + size);
  assert.ok(require('./package-budget.cjs').budget().fits, 'Keep at least 64 KiB reserved before adding runtime resources');
  for (const action of ['idle', 'move', 'attack', 'hurt', 'awaken', 'death']) {
    const png = fs.readFileSync(path.join(root, 'assets/images/pangu', action + '.png')); assert.equal(png.readUInt32BE(16), 768); assert.equal(png.readUInt32BE(20), 512); assert.ok(png.includes(Buffer.from('tRNS')));
  }
  for (const name of ['attack', 'bell', 'banner', 'dominion', 'rift', 'ready', 'warning', 'hurt', 'upgrade', 'victory', 'death']) {
    const wav = fs.readFileSync(path.join(root, 'assets/audio', name + '.wav')); assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt16LE(34), 16); assert.equal(wav.readUInt32LE(40), wav.length - 44);
  }
});
