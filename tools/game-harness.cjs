'use strict';
const { createController } = require('../game/src/controller');
function setup(options = {}) {
  let now = 1000, nextTimer = 0;
  const timers = new Map(), writes = [], audioCalls = [], dataWrites = [], events = {};
  const storage = { 'pangu.settings.v1': options.saved || {}, 'pangu.archive.v1': options.archive || {} };
  const windowInfo = { windowWidth: 400, windowHeight: 400, ...options.windowInfo };
  const api = { vibrateShort() {}, getWindowInfo: () => windowInfo,
    getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = structuredClone(value); writes.push({ key, value: storage[key] }); },
    createInnerAudioContext: () => ({ src: '', volume: 1, stop() {}, play() { audioCalls.push({ src: this.src, volume: this.volume }); }, destroy() { audioCalls.push({ destroyed: true }); } }) };
  for (const key of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel']) { api['on' + key] = fn => { events[key] = fn; }; api['off' + key] = () => { delete events[key]; }; }
  const clock = { setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  const game = createController(api, { viewport: windowInfo, Date: { now: () => now }, clock });
  const originalSetData = game.setData; game.setData = function(patch, callback) { dataWrites.push(structuredClone(patch)); originalSetData.call(this, patch, callback); };
  if (options.weapon) game.selectWeapon({ currentTarget: { dataset: { weapon: options.weapon } } });
  game.beginGame();
  // Existing geometry regression fixtures retain their explicit measured arena/joystick.
  // Native-layout integration tests opt into the controller's real safe-area layout.
  if (!options.nativeLayout) {
    game.arenaRect = options.arenaRect || { left: 20, top: 110, width: 400, height: 600 };
    game.joystickRect = { left: 44, top: 144, width: 112, height: 112 };
    game.combat.configureArena(game.arenaRect.width, game.arenaRect.height, game.rpxScale);
  }
  return { game, api, events, timers, writes, storage, audioCalls, windowInfo, dataWrites,
    advance(ms = 32) { now += ms; game.moveFrame(); }, elapse(ms) { now += ms; },
    frame(ms = 25) { now += ms; game.frame(ms / 1000); },
    fireTimer(id) { const callback = timers.get(id); if (!callback) throw new Error('No timer ' + id); timers.delete(id); callback(); },
    simulate(seconds) { for (let i = 0; i < Math.ceil(seconds / 0.025); i++) { now += 25; game.frame(0.025); } }
  };
}
function upgradeEvent(game, index = 0) { return { currentTarget: { dataset: { upgradeId: game.data.choices[index] ? game.data.choices[index].id : 'invalid', choiceToken: String(game.data.choiceToken) } } }; }
function choose(game, kind) {
  game.combat.xp = game.combat.xpNeed; game.syncCombat(); game.levelUp();
  const option = game.combat.upgradePool().find(u => u.kind === kind); game.setData({ choices: [option] }); game.chooseUpgrade(upgradeEvent(game));
}
function touch(x, y, identifier = 1) { return { clientX: x, clientY: y, identifier }; }
module.exports = { setup, upgradeEvent, choose, touch };
