'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), os = require('node:os');
const { setup, touch } = require('./game-harness.cjs');
const { NativeInput } = require('../game/src/input');
const { main, safeError } = require('./wechat-ci/upload.cjs');
const root = path.resolve(__dirname, '..');
function fakeView(h, regions = []) { return { regions }; }
function event(t, remaining = []) { return { changedTouches: [t], touches: remaining }; }
function pointFor(h, x, y, id = 0) { return touch(x * h.game.rpxScale, y * h.game.rpxScale, id); }

test('Creator project declares a landscape WeChat target and a separate content bundle', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')));
  assert.equal(config.compileType, 'game'); assert.equal(config.miniprogramRoot, 'minigame/');
  const { compressed } = require('./cocos/prepare.cjs'); assert.equal(compressed('69e93e92-878c-44af-95c7-6494cf4c23e0'), '69e936Sh4xEr5XHZJTPTCPg');
  const scene = JSON.parse(fs.readFileSync(path.join(root, 'cocos-project/assets/Main.scene'))); const mainMeta = JSON.parse(fs.readFileSync(path.join(root, 'cocos-project/assets/scripts/Main.ts.meta'))); assert.ok(scene.some(item => item.__type__ === compressed(mainMeta.uuid)));
  const creator = JSON.parse(fs.readFileSync(path.join(root, 'cocos-project/package.json'))); assert.equal(creator.creator.version, '3.8.8');
  const target = JSON.parse(fs.readFileSync(path.join(root, 'cocos-project/build-config/wechatgame.json'))); assert.equal(target.platform, 'wechatgame'); assert.equal(target.engineModulesConfigKey, 'kaitian2d'); assert.equal(target.bundleConfigs[0].compressionType, 'subpackage'); assert.equal(target.packages.wechatgame.orientation, 'landscape');
  const content = JSON.parse(fs.readFileSync(path.join(root, 'cocos-project/assets/game-content.meta'))); assert.equal(content.userData.bundleName, 'game-content'); assert.equal(content.userData.compressionType.wechatgame, 'subpackage');
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
test('portrait safe-area data cannot shrink a landscape battle to half the screen for any weapon', () => {
  for (const weapon of ['bell', 'banner', 'swords']) {
    const raw = { windowWidth: 844, windowHeight: 390, safeArea: { left: 0, top: 47, right: 390, bottom: 810, width: 390, height: 763 }, menuButton: { left: 296, right: 383, top: 10, bottom: 42 } };
    const original = structuredClone(raw), h = setup({ weapon, exploration: true, nativeLayout: true, windowInfo: raw }), c = h.game, a = c.arenaRect, s = c.rpxScale;
    assert.ok(a.width > raw.windowWidth * 0.85, JSON.stringify(a));
    assert.ok(a.left >= 47 && a.left + a.width <= raw.windowWidth - 47);
    assert.ok(c.layout.skill.x * s > raw.windowWidth * 0.75);
    assert.equal(c.viewport.menuButton, null); assert.deepEqual(raw, original);
    const world = c.combat.world, player = { ...c.player };
    c.resize({ windowWidth: 844, windowHeight: 390, safeArea: { left: 34, top: 0, right: 797, bottom: 390 } });
    assert.equal(c.combat.world, world); assert.deepEqual(c.player, player); assert.ok(c.arenaRect.width > 730);
    c.resize(raw); assert.ok(c.arenaRect.width > 730); assert.equal(c.combat.world, world); h.game.onUnload();
  }
});
test('a banner joystick and aimed skill remain independently usable on both sides with stale phone insets', () => {
  const h = setup({ weapon: 'banner', exploration: true, nativeLayout: true, windowInfo: { windowWidth: 844, windowHeight: 390, safeArea: { left: 0, top: 47, right: 390, bottom: 810 } } }), c = h.game;
  const skill = { id: 'skill', type: 'skill', ...c.layout.skill }, input = new NativeInput(h.api, c, fakeView(h, [skill]));
  const joy = pointFor(h, c.layout.joystick.x + 164, c.layout.joystick.y + 100, 0), press = pointFor(h, skill.x + skill.width / 2, skill.y + 100, 1), aim = { ...press, clientX: press.clientX - 70 };
  assert.ok(press.clientX > 844 * 0.8);
  input.start(event(joy, [joy])); input.start(event(press, [joy, press])); input.move(event(aim, [joy, aim]));
  const before = c.player.x; h.frame(50); assert.ok(c.player.x > before); assert.ok(c.data.skillAim.x < -.99);
  input.end(event(aim, [joy])); assert.equal(c.combat.skillUses, 1); assert.equal(input.joyId, 0); input.end(event(joy)); assert.equal(c.data.joystick.active, false); input.destroy(); c.onUnload();
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
test('Creator owns input, audio and frame scheduling without the legacy renderer adapter', () => {
  const source = fs.readFileSync(path.join(root, 'cocos-project/assets/scripts/Platform.ts'), 'utf8');
  assert.ok(source.includes('Input.EventType.TOUCH_START')); assert.ok(source.includes('Game.EVENT_HIDE')); assert.ok(source.includes('AudioSource'));
  assert.ok(!fs.existsSync(path.join(root, 'game/platform/wechat.js')));
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
  }, async upload(options) { assert.ok(options.project); assert.equal(options.useCOS, false); uploaded = true; }, async preview(options) { assert.ok(uploaded); assert.equal(options.useCOS, false); assert.equal('pagePath' in options, false); previewed = true; } };
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-upload-fixture-')); fs.mkdirSync(path.join(fixture, 'minigame')); fs.copyFileSync(path.join(root, 'project.config.json'), path.join(fixture, 'project.config.json'));
  for (const [file, content] of Object.entries({ 'game.js': 'require("./cocos-js/cc")', 'game.json': JSON.stringify({ deviceOrientation: 'landscape' }), 'build-info.json': JSON.stringify({ framework: 'Cocos Creator 3.8.8', builder: 'official Creator CLI', platform: 'wechatgame' }) })) fs.writeFileSync(path.join(fixture, 'minigame', file), content);
  await main({ root: fixture, env: { WECHAT_APPID: 'wx0123456789abcdef', WECHAT_PRIVATE_KEY: privateKey, WECHAT_VERSION: '0.2.test' }, sdk, log() {} });
  assert.ok(uploaded && previewed); assert.equal(fs.existsSync(temporary), false); fs.rmSync(fixture, { recursive: true, force: true });
});
test('upload validation rejects wrong IDs and missing builds before calling the SDK and sanitizes errors', async () => {
  await assert.rejects(() => main({ env: { WECHAT_APPID: 'bad' }, sdk: {} }), /missing or invalid/);
  const key = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'; assert.ok(!safeError(new Error('failed ' + key), key).includes('abc'));
});
