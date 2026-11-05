'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const build = path.resolve(__dirname, '../../cocos-project/build/web-mobile'), output = '/tmp/pangu-cocos';
(async () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(build, 'build-info.json'))).builder, 'official Creator CLI'); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('http://127.0.0.1:4173/**', async route => {
      try {
        const url = new URL(route.request().url()), relative = decodeURIComponent(url.pathname) === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1), file = path.resolve(build, relative);
        if (!file.startsWith(build + path.sep) || !fs.existsSync(file)) { await route.fulfill({ status: url.pathname === '/favicon.ico' ? 204 : 404 }); return; }
        await route.fulfill({ status: 200, contentType: ({ '.js': 'application/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm' })[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      } catch (error) { await route.fulfill({ status: 500, body: error.message }); }
    });
    async function click(id) {
      await page.waitForFunction(id => window.kaitian && kaitian.presentation.regions.some(r => r.id === id && r.enabled !== false), id, { timeout: 10000 });
      const p = await page.evaluate(id => { const r = kaitian.presentation.regions.find(r => r.id === id), s = kaitian.controller.rpxScale; return { x: (r.x + r.width / 2) * s, y: (r.y + r.height / 2) * s }; }, id);
      await page.mouse.click(p.x, p.y);
    }
    try {
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.kaitian && kaitian.presentation.ready, null, { timeout: 60000 });
      await page.screenshot({ path: output + '/cocos-home.png' });
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) for (const weapon of ['bell', 'banner']) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await click('start'); await click('weapon-' + weapon); await click('intro-enter');
        assert.equal(await page.evaluate(() => kaitian.controller.combat.weapon), weapon);
        const joy = await page.evaluate(() => { const r = kaitian.controller.joystickRect; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        const before = await page.evaluate(() => kaitian.controller.player.x); await page.mouse.move(joy.x, joy.y); await page.mouse.down(); await page.mouse.move(joy.x + 30, joy.y, { steps: 3 });
        await page.waitForFunction(x => kaitian.controller.player.x > x, before, { timeout: 5000 }); await page.mouse.up(); assert.equal(await page.evaluate(() => kaitian.controller.data.joystick.active), false);
        const touchSession = await page.context().newCDPSession(page), touchBefore = await page.evaluate(() => kaitian.controller.player.x);
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joy.x, y: joy.y, id: 1 }] });
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: joy.x + 30, y: joy.y, id: 1 }] });
        await page.waitForFunction(x => kaitian.controller.player.x > x, touchBefore, { timeout: 5000 });
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touchSession.detach();
        assert.equal(await page.evaluate(() => kaitian.controller.data.joystick.active), false);
        await page.evaluate(() => {
          const c = kaitian.controller, core = c.combat; c.stopLoops(); core.phase = 3; core.remaining = 0; core.enemies = []; core.invulnerable = 100; core.player.x = 50; core.player.y = 55;
          for (const dx of [100, 240, -220]) { const e = core.spawn('wraith'); Object.assign(e, { x: core.player.x + dx / core.width * 100, y: core.player.y, hp: 1000, maxHp: 1000, cooldown: 100, speed: 0 }); }
          for (const [kind, dx, dy] of [['ranged', -260, -110], ['charger', 230, 110], ['elite', -60, -135]]) {
            const e = core.spawn(kind); Object.assign(e, { x: core.player.x + Number(dx) / core.width * 100, y: core.player.y + Number(dy) / core.height * 100, hp: 1000, maxHp: 1000, cooldown: 100, speed: 0 });
          }
          c.viewport.menuButton = { left: c.viewport.windowWidth - 88 }; c.setData({ message: '' }); c.syncCombat();
        });
        await page.waitForFunction(() => kaitian.controller.combat.strikeCount > 0);
        assert.ok(await page.evaluate(() => Boolean(kaitian.presentation.layers.world.nodes.get('hero').getComponent('cc.Sprite'))));
        assert.ok(await page.evaluate(() => {
          const rows = { wraith: 0, ranged: 1, charger: 2, elite: 3 };
          return Object.entries(rows).every(([kind, row]) => {
            const enemy = kaitian.controller.combat.enemies.find(e => e.kind === kind);
            const sprite = kaitian.presentation.layers.world.nodes.get('enemy-' + enemy.id).getComponent('cc.Sprite');
            return sprite.spriteFrame.rect.y === row * 192 && sprite.spriteFrame.rect.width === 192;
          });
        }), 'All four enemy roles must render their own atlas row in the real Creator output');
        const prefix = weapon + '-' + viewport.width; await page.screenshot({ path: output + '/' + prefix + '-normal.png' });
        const skill = await page.evaluate(() => { const r = kaitian.presentation.regions.find(r => r.id === 'skill'), s = kaitian.controller.rpxScale; return { x: (r.x + r.width / 2) * s, y: (r.y + r.height / 2) * s }; });
        if (weapon === 'banner') { await page.mouse.move(skill.x, skill.y); await page.mouse.down(); await page.mouse.move(skill.x - 70, skill.y, { steps: 4 }); await page.waitForFunction(() => kaitian.controller.data.skillAim && kaitian.controller.data.skillAim.x < -0.99); await page.screenshot({ path: output + '/' + prefix + '-aim.png' }); await page.mouse.up(); }
        else await page.mouse.click(skill.x, skill.y);
        await page.waitForFunction(() => kaitian.controller.combat.damageBySource.skill > 0); assert.equal(await page.evaluate(() => kaitian.controller.combat.skillUses), 1);
        await page.screenshot({ path: output + '/' + prefix + '-skill.png' });
        assert.ok(await page.evaluate(() => { const r = kaitian.presentation.regions.find(r => r.id === 'pause'); return (r.x + r.width) * kaitian.controller.rpxScale < kaitian.controller.viewport.menuButton.left; }));
        await click('pause'); const paused = await page.evaluate(() => kaitian.controller.combat.time); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => kaitian.controller.combat.time), paused); await click('settings-close');
        await page.evaluate(() => kaitian.api.emit('Hide', {})); const hidden = await page.evaluate(() => kaitian.controller.combat.time); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => kaitian.controller.combat.time), hidden); await page.evaluate(() => kaitian.api.emit('Show', {}));
        await page.evaluate(() => { const c = kaitian.controller; c.combat.xp = c.combat.xpNeed; c.levelUp(); });
        await page.waitForFunction(() => kaitian.presentation.regions.some(r => r.id.startsWith('upgrade-'))); await page.screenshot({ path: output + '/' + prefix + '-upgrade.png' });
        await click(await page.evaluate(() => kaitian.presentation.regions.find(r => r.id.startsWith('upgrade-')).id)); assert.equal(await page.evaluate(() => kaitian.controller.data.level), 2);
        await page.evaluate(() => { const c = kaitian.controller; c.stopLoops(); c.upgradePending = false; c.combat.xp = 0; c.combat.cleared = true; c.combat.stage = 1; c.completeStage(); });
        const route = weapon === 'bell' ? 'echo' : 'sweep'; await click('reward-' + route); await click('memory-continue'); assert.equal(await page.evaluate(() => kaitian.controller.combat.path), route);
        await page.evaluate(() => { const c = kaitian.controller; c.stopLoops(); c.combat.cleared = true; c.combat.stage = 2; c.combat.random = () => 0.9; c.completeStage(); });
        await click('reward-trial'); await click('memory-continue'); assert.ok(await page.evaluate(() => kaitian.controller.combat.enemies.some(e => e.trial)));
        await page.evaluate(() => { const c = kaitian.controller.combat; c.invulnerable = 0; c.hurt(1000, '火羽焚地'); });
        await page.waitForFunction(() => kaitian.controller.data.showEnding, null, { timeout: 5000 }); await page.screenshot({ path: output + '/' + prefix + '-ending.png' });
        await click('ending-home'); await click('archive'); await click('archive-runs'); assert.ok(await page.evaluate(() => kaitian.controller.data.archiveRuns.length > 0)); await click('archive-close');
        assert.deepEqual(errors, [], prefix); console.log('PASS Cocos Creator ' + prefix + ': native nodes, joystick, skill, pause/background, upgrades, route, trial, ending, archive');
      }
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await click('start'); await click('weapon-bell'); await click('intro-enter');
        for (const mode of ['idle-a', 'idle-b', 'plain', 'fire', 'water', 'earth', 'echo', 'dominion']) {
          await page.evaluate(mode => {
            const c = kaitian.controller; c.resetGame(); c.pauseGame(); const core = c.combat;
            core.phase = 3; core.remaining = 0; core.enemies = []; core.hazards = []; core.effects = []; core.player.x = 50; core.player.y = 55; core.time = mode === 'idle-b' ? 1 : 0;
            if (['fire', 'water', 'earth'].includes(mode)) core.elements[mode] = 2;
            for (const dx of [60, 140, -130]) { const e = core.spawn('wraith'); Object.assign(e, { x: core.player.x + dx / core.width * 100, y: core.player.y, hp: 1000, maxHp: 1000, speed: 0, cooldown: 100 }); }
            if (mode === 'echo') {
              for (let i = 0; i < 3; i++) { core.strike({ direction: { x: 1, y: 0 } }); core.updateBellWaves(0.26); }
              core.player.x += 180 / core.width * 100; core.updateFollowups(0.32); core.updateBellWaves(0.12);
            } else if (mode === 'dominion') { core.useSkill(); core.updateFollowups(0.12); core.updateBellWaves(0.18); }
            else if (!mode.startsWith('idle')) { core.strike({ direction: { x: 1, y: 0 } }); core.updateBellWaves(0.225); }
            c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
          }, mode);
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(mode => {
            const controller = kaitian.controller, c = controller.combat, v = kaitian.presentation;
            const clock = v.layers.world.nodes.get('chaos-bell'), arena = controller.layout.arena;
            if (!clock || !clock.active || controller.data.weaponName !== '混沌钟') return false;
            const body = clock.getComponent('cc.Sprite');
            if (!body || body.color.a !== 255 || body.spriteFrame.rect.width !== 192) return false;
            const index = Math.floor(((c.time * 1.4 / (Math.PI * 2)) % 1) * 16) % 16;
            if (body.spriteFrame.rect.x !== (index % 4) * 192 || body.spriteFrame.rect.y !== Math.floor(index / 4) * 192) return false;
            const x = arena.x + c.player.x / 100 * arena.width, y = arena.y + c.player.y / 100 * arena.height;
            if (Math.abs(clock.position.x - x) > 0.01 || clock.position.y < -(y - 110)) return false;
            if (mode.startsWith('idle')) return c.bellWaves.length === 0;
            if (mode === 'echo') { const wave = c.bellWaves.find(w => w.kind === 'echo'); return wave && Math.abs(wave.origin.x - c.player.x) < 0.001 && c.strikeCount === 3; }
            return c.bellWaves.some(w => w.kind === (mode === 'dominion' ? 'skill' : 'normal') && w.radius > 0 && Math.abs(w.origin.x - c.player.x) < 0.001 && Math.abs(w.origin.y - c.player.y) < 0.001);
          }, mode));
          await page.screenshot({ path: output + '/bell-redesign-' + viewport.width + '-' + mode + '.png' });
        }
        await page.evaluate(() => kaitian.controller.exitToHome());
      }
      // Real exported sprites for every boss and every hazard family. These are
      // visual fixtures only; combat timing/collision is covered by core tests.
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await click('start'); await click('intro-enter');
        for (let stage = 1; stage <= 5; stage++) for (const state of ['warning', 'active']) {
          await page.evaluate(({ stage, state }) => {
            const c = kaitian.controller; c.resetGame(); c.pauseGame();
            const core = c.combat; core.enemies = []; core.hazards = []; core.effects = []; core.projectiles = []; core.phase = 3; core.stage = stage; core.player.x = 50; core.player.y = 60;
            const boss = core.spawn('boss'); Object.assign(boss, { x: 73, y: 30, cooldown: 100, castTime: 1.3, recoverTime: 2, phase2: true, visualState: state === 'warning' ? 'cast' : 'release', visualAge: 0.6 });
            core.castPattern(stage, boss, true);
            const caster = core.spawn('ranged'); Object.assign(caster, { x: 20, y: 30, visualState: state === 'warning' ? 'cast' : 'recover', visualAge: 0.6 });
            core.lineAtPlayer(caster, 34, 0.85, 0.18, '符', 'arcane', 7);
            const charger = core.spawn('charger'); Object.assign(charger, { x: 18, y: 79, visualState: state === 'warning' ? 'cast' : 'dash', visualAge: 0.3, dashing: state === 'active' }); core.charge(charger, false);
            core.circle({ x: 35, y: 65 }, 78, 1, 1.3, '劫', 'arcane', 9);
            for (const h of core.hazards) {
              h.age = state === 'warning' ? h.delay * 0.7 : h.delay + h.duration * 0.3; h.active = state === 'active';
              if (h.dash && h.owner === charger.id && state === 'active') { charger.x = h.x + (h.end.x - h.x) * 0.3; charger.y = h.y + (h.end.y - h.y) * 0.3; }
            }
            c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
          }, { stage, state });
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(({ stage, state }) => {
            const v = kaitian.presentation, boss = kaitian.controller.combat.enemies.find(e => e.boss);
            const sprite = v.layers.world.nodes.get('enemy-' + boss.id).getComponent('cc.Sprite');
            const spells = [...v.layers.world.nodes.keys()].filter(id => id.startsWith('spell-'));
            return sprite.spriteFrame.rect.y === (stage - 1) * 192 && sprite.spriteFrame.rect.x === (state === 'warning' ? 2 : 3) * 192 && spells.length > 0 && ![...v.layers.world.nodes.keys()].some(id => id.startsWith('hazard-'));
          }, { stage, state }), 'Boss poses and real spell sprites must replace ground labels');
          await page.screenshot({ path: output + '/boss-' + stage + '-' + viewport.width + '-' + state + '.png' });
        }
        await page.evaluate(() => kaitian.controller.exitToHome());
      }
      // Each approved silhouette at every lifecycle phase, from the actual export.
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await page.evaluate(() => kaitian.controller.beginGame());
        for (const state of ['forming', 'solid', 'hit', 'unstable', 'mist', 'return']) {
          await page.evaluate(state => {
            const c = kaitian.controller; c.resetGame(); c.pauseGame();
            const core = c.combat; core.phase = 3; core.enemies = []; core.hazards = []; core.effects = []; core.remnants = [];
            const list = ['wraith', 'ranged', 'charger', 'elite', 'boss', 'boss', 'boss', 'boss', 'boss'];
            list.forEach((kind, i) => {
              if (i >= 4) core.stage = i - 3;
              const e = core.spawn(kind); Object.assign(e, { x: 10 + (i < 4 ? i * 25 : (i - 4) * 19.5), y: i < 4 ? 24 : 66, fodder: i === 0, cooldown: 100, visualAge: 0 });
              if (state === 'forming') e.spawnTime = e.spawnDuration * 0.55;
              if (state === 'hit') e.hitTime = 0.12;
              if (['unstable', 'mist', 'return'].includes(state)) {
                core.leaveRemnant(e); core.remnants[core.remnants.length - 1].age = core.remnants[core.remnants.length - 1].life * ({ unstable: 0.3, mist: 0.68, return: 0.9 }[state]);
              }
            });
            if (core.remnants.length) core.enemies = [];
            c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
          }, state);
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(state => {
            const world = kaitian.presentation.layers.world, ids = [...world.used];
            if (state === 'forming') return ids.filter(id => id.startsWith('condense-rise-')).length === 9;
            if (state === 'solid' || state === 'hit') return ids.filter(id => id.startsWith('enemy-')).length === 9;
            if (state === 'unstable') return ids.filter(id => id.startsWith('remnant-body-')).length === 9;
            return !ids.some(id => id.startsWith('remnant-body-')) && ids.filter(id => id.startsWith('remnant-eddy-')).length === 9;
          }, state), 'All nine creatures must render lifecycle ' + state);
          await page.screenshot({ path: output + '/chaos-' + viewport.width + '-' + state + '.png' });
        }
        await page.evaluate(() => kaitian.controller.exitToHome());
      }
      const saved = await page.evaluate(() => kaitian.api.getStorageSync('pangu.archive.v1'));
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.kaitian && kaitian.presentation.ready, null, { timeout: 60000 });
      assert.deepEqual(await page.evaluate(() => kaitian.controller.archive.memories), saved.memories);
      assert.deepEqual(await page.evaluate(() => kaitian.controller.archive.enemies), saved.enemies);
      assert.deepEqual(errors, []); console.log('PASS Cocos Creator: archive survives a full reload');
    } catch (error) { await page.screenshot({ path: output + '/failure.png' }); console.error('Creator browser errors:', errors); console.error(await page.evaluate(() => window.kaitian ? { ready: kaitian.presentation.ready, error: kaitian.presentation.error, view: kaitian.controller.data.view, data: { paused: kaitian.controller.data.paused, choice: kaitian.controller.data.showChoice, joystick: kaitian.controller.data.joystick }, joyId: kaitian.input.joyId, touchId: kaitian.controller.touchId, origin: kaitian.controller.touchOrigin, move: kaitian.controller.moveVector, player: kaitian.controller.player } : { runtime: false })); throw error; }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
