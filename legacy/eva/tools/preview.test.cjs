'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const { createPreview, previewPage } = require('./minigame-preview.cjs');
(async () => {
  const server = await createPreview(0, { listen: false }), output = '/tmp/pangu-minigame'; fs.mkdirSync(output, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    await require('./artifact-preview.cjs').checkArtifacts(server, browser, output);
    for (const route of ['/', '/native']) {
      const page = await previewPage(browser, server, { viewport: { width: 844, height: 390 } }), errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto('http://127.0.0.1:' + server.address().port + route);
      await page.waitForFunction(() => Boolean(window.kaitian && kaitian.presentation.ready) || Boolean(window.bootError), null, { timeout: 15000 });
      const bootError = await page.evaluate(() => window.bootError); assert.ok(!bootError, bootError); assert.deepEqual(errors, []);
      async function click(id) {
        await page.waitForFunction(id => kaitian.presentation.regions.some(r => r.id === id && r.enabled !== false), id, { timeout: 5000 });
        const p = await page.evaluate(id => { const r = kaitian.presentation.regions.find(r => r.id === id); return { x: (r.x + r.width / 2) * kaitian.controller.rpxScale, y: (r.y + r.height / 2) * kaitian.controller.rpxScale }; }, id);
        await page.mouse.click(p.x, p.y);
      }
      const prefix = route === '/native' ? 'native-' : '';
      await page.screenshot({ path: output + '/' + prefix + 'home.png' });
      await click('start'); await click('weapon-banner'); assert.equal(await page.evaluate(() => kaitian.controller.data.selectedWeapon), 'banner');
      await page.screenshot({ path: output + '/' + prefix + 'weapons.png' }); await click('intro-enter');
      const joy = await page.evaluate(() => { const r = kaitian.controller.joystickRect; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const startX = await page.evaluate(() => kaitian.controller.player.x); await page.mouse.move(joy.x, joy.y); await page.mouse.down(); await page.mouse.move(joy.x + 36, joy.y);
      await page.waitForFunction(x => kaitian.controller.player.x > x, startX); await page.mouse.up();
      assert.equal(await page.evaluate(() => kaitian.controller.data.joystick.active), false);
      await click('pause'); const time = await page.evaluate(() => kaitian.controller.combat.time); await page.waitForTimeout(120); assert.equal(await page.evaluate(() => kaitian.controller.combat.time), time);
      await click('settings-close');
      await page.evaluate(() => testEmit('Hide', {})); const hidden = await page.evaluate(() => kaitian.controller.combat.time); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => kaitian.controller.combat.time), hidden);
      await page.evaluate(() => testEmit('Show', {}));
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport);
        await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await page.evaluate(() => {
          const c = kaitian.controller; c.restart(); c.stopLoops(); const core = c.combat; core.stage = 3; core.phase = 3; core.remaining = 0; core.enemies = []; core.invulnerable = 100; core.attackCd = 100;
          core.elements = { fire: 1, water: 1, earth: 1 };
          const boss = core.spawn('boss'); Object.assign(boss, { x: 73, y: 51, phase2: true, cooldown: 100, speed: 0 }); core.castPattern(3, boss, true);
          ['wraith', 'ranged', 'charger'].forEach((kind, i) => { const e = core.spawn(kind); Object.assign(e, { x: 34 + i * 12, y: 40 + i * 14, speed: 0, cooldown: 100 }); });
          c.setData({ message: '' }); c.syncCombat();
        });
        await page.waitForTimeout(60); await page.screenshot({ path: output + '/' + prefix + 'battle-' + viewport.width + '.png' });
        await page.evaluate(() => { const c = kaitian.controller; c.combat.xp = c.combat.xpNeed; c.levelUp(); });
        await page.waitForFunction(() => kaitian.presentation.regions.some(r => r.id.startsWith('upgrade-')));
        await page.screenshot({ path: output + '/' + prefix + 'upgrades-' + viewport.width + '.png' });
        const boxes = await page.evaluate(() => kaitian.presentation.regions.filter(r => r.id.startsWith('upgrade-')).map(r => ({ x: r.x * kaitian.controller.rpxScale, y: r.y * kaitian.controller.rpxScale, width: r.width * kaitian.controller.rpxScale, height: r.height * kaitian.controller.rpxScale })));
        assert.equal(boxes.length, 3); boxes.forEach(b => assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width && b.y + b.height <= viewport.height));
        const choiceId = await page.evaluate(() => kaitian.presentation.regions.find(r => r.id.startsWith('upgrade-')).id); await click(choiceId); assert.equal(await page.evaluate(() => kaitian.controller.data.level), 2);
        await page.evaluate(() => { const c = kaitian.controller; c.stopLoops(); c.upgradePending = false; c.combat.xp = 0; c.combat.cleared = true; c.combat.stage = 1; c.completeStage(); });
        await page.waitForFunction(() => kaitian.presentation.regions.some(r => r.id === 'reward-sweep'));
        assert.equal(await page.evaluate(() => kaitian.presentation.regions.find(r => r.id === 'memory-continue').enabled), false);
        await page.screenshot({ path: output + '/' + prefix + 'path-' + viewport.width + '.png' }); await click('reward-sweep'); await click('memory-continue');
        assert.equal(await page.evaluate(() => kaitian.controller.combat.path), 'sweep');
        await page.evaluate(() => { const c = kaitian.controller; c.stopLoops(); c.combat.cleared = true; c.combat.stage = 2; c.combat.random = () => 0.9; c.completeStage(); });
        await page.waitForFunction(() => kaitian.presentation.regions.some(r => r.id === 'reward-trial'));
        await page.screenshot({ path: output + '/' + prefix + 'encounter-' + viewport.width + '.png' }); await click('reward-trial'); await click('memory-continue');
        assert.equal(await page.evaluate(() => kaitian.controller.combat.enemies.some(e => e.trial)), true);
        await page.evaluate(() => { const core = kaitian.controller.combat; core.invulnerable = 0; core.time = 125; core.hurt(1000, '火羽焚地'); });
        await page.waitForFunction(() => kaitian.controller.data.showEnding, null, { timeout: 5000 });
        await page.screenshot({ path: output + '/' + prefix + 'ending-' + viewport.width + '.png' }); assert.equal(await page.evaluate(() => kaitian.controller.data.runSummary.timeLabel), '2:05');
        await click('ending-home'); await click('archive'); await click('archive-runs');
        assert.ok((await page.evaluate(() => kaitian.controller.data.archiveRuns[0].build)).includes('横扫八荒'));
        await page.screenshot({ path: output + '/' + prefix + 'archive-' + viewport.width + '.png' }); await click('archive-close');
        assert.deepEqual(errors, [], route + ' at ' + viewport.width);
      }
      if (route === '/native') assert.equal(await page.evaluate(() => nativeScope.window.navigator.userAgent), 'WeChat MiniGame');
      console.log('PASS ' + route + ': 844×390 / 667×320, native pointer input, pause/background, sprites, upgrades, paths, event/trial, ending and archive');
      await page.close();
    }
  } finally { if (browser) await browser.close(); if (server.listening) server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
