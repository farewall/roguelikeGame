'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), os = require('node:os');
const { setup, touch } = require('./game-harness.cjs');
const { NativeInput } = require('../game/src/input');
const { installPlatform } = require('../game/platform/wechat');
const { main, safeError } = require('./wechat-ci/upload.cjs');
const root = path.resolve(__dirname, '..');
function fakeView(h, regions = []) { return { regions }; }
function event(t, remaining = []) { return { changedTouches: [t], touches: remaining }; }
function pointFor(h, x, y, id = 0) { return touch(x * h.game.rpxScale, y * h.game.rpxScale, id); }

test('project is a native landscape Mini Game and ships only built game assets', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')));
  assert.equal(config.compileType, 'game'); assert.equal(config.miniprogramRoot, 'minigame/');
  const game = JSON.parse(fs.readFileSync(path.join(root, 'minigame/game.json'))); assert.equal(game.deviceOrientation, 'landscape');
  assert.ok(fs.existsSync(path.join(root, 'minigame/game.js'))); assert.ok(!fs.existsSync(path.join(root, 'minigame/app.json')));
  const build = JSON.parse(fs.readFileSync(path.join(root, 'minigame/build-info.json'))); assert.ok(build.framework.startsWith('Eva.js'));
  for (const file of build.assets) assert.ok(fs.existsSync(path.join(root, 'minigame', file)), file);
  assert.equal(build.assets.filter(f => /pangu\//.test(f)).length, 6); assert.ok(require('./package-budget.cjs').budget().fits);
});
test('native controller has one externally driven frame loop, without WXML selectors or intervals', () => {
  const h = setup({ nativeLayout: true }); const t = h.game.combat.time; h.frame(25); assert.ok(h.game.combat.time > t);
  assert.equal(h.game.createSelectorQuery, undefined); assert.equal(h.game.gameTimer, undefined); assert.equal(h.game.moveTimer, undefined);
  h.game.onUnload(); assert.equal(h.timers.size, 0);
});
test('safe-area margins, canvas arena and joystick share physical/UI coordinates after resize', () => {
  const h = setup({ nativeLayout: true, windowInfo: { windowWidth: 844, windowHeight: 390, safeArea: { left: 44, right: 810, top: 0, bottom: 390 } } });
  const c = h.game, a = c.layout.arena, s = c.rpxScale;
  assert.ok(a.x * s >= 44); assert.ok((a.x + a.width) * s <= 810); assert.equal(c.arenaRect.left, a.x * s);
  c.resize({ windowWidth: 667, windowHeight: 320 }); assert.equal(c.rpxScale, 320 / 750); assert.ok(Math.abs(c.combat.width - c.layout.arena.width) < 1e-7);
  assert.equal(c.joystickRect.left, c.layout.joystick.x * c.rpxScale);
});
test('native joystick accepts identifier zero, recenters, and ignores touches outside its region', () => {
  const h = setup({ nativeLayout: true }), c = h.game, view = fakeView(h), input = new NativeInput(h.api, c, view), r = c.layout.joystick;
  const center = pointFor(h, r.x + 100, r.y + 100), right = pointFor(h, r.x + 164, r.y + 100);
  input.start(event(center, [center])); input.move(event(right, [right])); const x = c.player.x; h.frame(32); assert.ok(c.player.x > x);
  input.end(event(right)); assert.equal(c.data.joystick.active, false); const stopped = c.player.x; h.frame(32); assert.equal(c.player.x, stopped);
  const outside = pointFor(h, 700, 250); input.start(event(outside, [outside])); h.frame(); assert.equal(c.player.x, stopped); input.destroy();
});
test('second finger can pause while moving, without taking ownership of the joystick', () => {
  const h = setup({ nativeLayout: true }), c = h.game, r = c.layout.joystick;
  const input = new NativeInput(h.api, c, fakeView(h, [{ id: 'pause', x: 600, y: 20, width: 100, height: 70, action: () => c.openSettings() }]));
  const joy = pointFor(h, r.x + 164, r.y + 100, 0); input.start(event(joy, [joy]));
  const pause = pointFor(h, 650, 45, 1); input.start(event(pause, [joy, pause])); assert.equal(input.joyId, 0);
  input.end(event(pause, [joy])); assert.equal(c.data.paused, true); assert.equal(c.data.joystick.active, false); input.destroy();
});
test('cancelled and dragged native upgrade gestures do not choose; a valid release chooses once', () => {
  const h = setup({ nativeLayout: true }), c = h.game; c.combat.xp = 5; c.levelUp(); const choice = c.data.choices[0];
  const view = fakeView(h, [{ id: 'choice', x: 300, y: 200, width: 300, height: 260, action: () => c.chooseUpgrade({ currentTarget: { dataset: { upgradeId: choice.id, choiceToken: c.data.choiceToken } } }) }]);
  const input = new NativeInput(h.api, c, view), press = pointFor(h, 400, 300), drag = pointFor(h, 500, 300);
  input.start(event(press, [press])); input.move(event(drag, [drag])); input.end(event(drag)); assert.equal(c.data.level, 1);
  input.start(event(press, [press])); input.cancel(); input.end(event(press)); assert.equal(c.data.level, 1);
  input.start(event(press, [press])); input.end(event(press)); assert.equal(c.data.level, 2); input.end(event(press)); assert.equal(c.data.level, 2); input.destroy();
});
test('native press from a previous modal cannot activate a replacement modal', () => {
  const h = setup(), c = h.game; let calls = 0; const view = fakeView(h, [{ id: 'same-id', x: 100, y: 100, width: 200, height: 200, action: () => calls++ }]);
  const input = new NativeInput(h.api, c, view), p = pointFor(h, 150, 150); input.start(event(p, [p])); c.openSettings(); input.end(event(p)); assert.equal(calls, 0); input.destroy();
});
test('canvas volume slider persists on release and archive dragging scrolls without accidental taps', () => {
  const h = setup(), c = h.game; c.openSettings(); const view = fakeView(h, [{ id: 'volume', type: 'volume', x: 100, y: 200, width: 200, height: 50 }]);
  const input = new NativeInput(h.api, c, view), a = pointFor(h, 100, 220), b = pointFor(h, 250, 220);
  input.start(event(a, [a])); input.move(event(b, [b])); input.end(event(b)); assert.equal(c.data.effectVolume, 75); assert.equal(h.storage['pangu.settings.v1'].effectVolume, 75);
  c.closeSettings(); c.openArchive(); c.archiveMaxScroll = 300; view.regions = [{ id: 'scroll', type: 'scroll', x: 100, y: 100, width: 400, height: 400 }];
  const p = pointFor(h, 200, 300), q = pointFor(h, 200, 200); input.start(event(p, [p])); input.move(event(q, [q])); input.end(event(q)); assert.ok(c.data.archiveScroll > 0); input.destroy();
});
test('native platform uses wx canvases/images and its shim does not require an existing DOM', () => {
  let canvases = 0, images = 0;
  const api = { getWindowInfo: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 2 }), createCanvas: () => { canvases++; return { width: 844, height: 390, getContext: () => ({}) }; }, createImage: () => { images++; return {}; } };
  const host = { requestAnimationFrame() {}, cancelAnimationFrame() {} }, p = installPlatform(api, host);
  assert.equal(canvases, 1); const other = host.document.createElement('canvas'); assert.equal(canvases, 2); assert.ok(other instanceof host.HTMLCanvasElement);
  const image = p.createImage(); assert.ok(image instanceof host.HTMLImageElement); assert.equal(images, 1); assert.equal(host.window.navigator.userAgent, 'WeChat MiniGame');
  let called = 0; host.window.addEventListener('resize', () => called++); host.window.dispatchEvent({ type: 'resize' }); assert.equal(called, 1);
});
test('uploader packages the Mini Game type and root, omits pagePath, and never writes the key', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  let temporary, uploaded = false, previewed = false;
  const sdk = { Project: class {
    constructor(options) {
      temporary = options.projectPath; assert.equal(options.type, 'miniGame'); assert.equal(options.privateKey, privateKey.trim());
      const config = JSON.parse(fs.readFileSync(path.join(temporary, 'project.config.json'))); assert.equal(config.compileType, 'game'); assert.equal(config.appid, 'wx0123456789abcdef');
      for (const file of fs.readdirSync(temporary, { recursive: true })) { const p = path.join(temporary, file); if (fs.statSync(p).isFile()) assert.ok(!fs.readFileSync(p).includes(Buffer.from('BEGIN PRIVATE KEY')), file); }
    }
  }, async upload(options) { assert.ok(options.project); uploaded = true; }, async preview(options) { assert.ok(uploaded); assert.equal('pagePath' in options, false); previewed = true; } };
  await main({ root, env: { WECHAT_APPID: 'wx0123456789abcdef', WECHAT_PRIVATE_KEY: privateKey, WECHAT_VERSION: '0.2.test' }, sdk, log() {} });
  assert.ok(uploaded && previewed); assert.equal(fs.existsSync(temporary), false);
});
test('upload validation rejects wrong IDs and missing builds before calling the SDK and sanitizes errors', async () => {
  await assert.rejects(() => main({ env: { WECHAT_APPID: 'bad' }, sdk: {} }), /missing or invalid/);
  const key = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'; assert.ok(!safeError(new Error('failed ' + key), key).includes('abc'));
});
