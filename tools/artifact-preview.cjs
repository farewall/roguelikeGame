'use strict';
const assert = require('node:assert/strict');
const { previewPage } = require('./minigame-preview.cjs');
async function checkArtifacts(server, browser, output) {
  for (const route of ['/', '/native']) {
    const page = await previewPage(browser, server, { viewport: { width: 844, height: 390 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://127.0.0.1:' + server.address().port + route);
    await page.waitForFunction(() => window.kaitian && kaitian.presentation.ready, null, { timeout: 15000 });
    async function click(id) {
      await page.waitForFunction(id => kaitian.presentation.regions.some(r => r.id === id && r.enabled !== false), id);
      const p = await page.evaluate(id => { const r = kaitian.presentation.regions.find(r => r.id === id), s = kaitian.controller.rpxScale; return { x: (r.x + r.width / 2) * s, y: (r.y + r.height / 2) * s }; }, id);
      await page.mouse.click(p.x, p.y);
    }
    for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) for (const weapon of ['bell', 'banner']) {
      await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
      await click('start'); await click('weapon-' + weapon); await click('intro-enter');
      await page.evaluate(() => {
        const c = kaitian.controller, core = c.combat; c.stopLoops(); core.phase = 3; core.remaining = 0; core.enemies = []; core.invulnerable = 100;
        for (const dx of [100, 240, -220]) { const e = core.spawn('wraith'); Object.assign(e, { x: core.player.x + dx / core.width * 100, y: core.player.y, speed: 0, cooldown: 100, hp: 1000, maxHp: 1000 }); }
        c.setData({ message: '' }); c.syncCombat();
      });
      await page.waitForFunction(() => kaitian.controller.combat.strikeCount > 0);
      assert.ok(await page.evaluate(() => kaitian.presentation.layers.world.nodes.get('hero').texture.baseTexture === kaitian.presentation.assets.textures.artifact.baseTexture));
      const prefix = (route === '/native' ? 'native-' : '') + weapon + '-' + viewport.width;
      await page.screenshot({ path: output + '/' + prefix + '-normal.png' });
      const control = await page.evaluate(() => { const r = kaitian.presentation.regions.find(r => r.id === 'skill'), s = kaitian.controller.rpxScale; return { x: (r.x + r.width / 2) * s, y: (r.y + r.height / 2) * s, left: r.x * s, top: r.y * s, width: r.width * s, height: r.height * s }; });
      assert.ok(control.left >= 0 && control.top >= 0 && control.left + control.width <= viewport.width && control.top + control.height <= viewport.height);
      if (weapon === 'banner') {
        await page.mouse.move(control.x, control.y); await page.mouse.down(); await page.mouse.move(control.x - 70, control.y, { steps: 4 });
        await page.waitForFunction(() => kaitian.controller.data.skillAim && kaitian.controller.data.skillAim.x < -0.99);
        await page.screenshot({ path: output + '/' + prefix + '-aim.png' }); await page.mouse.up();
      } else await page.mouse.click(control.x, control.y);
      await page.waitForFunction(() => kaitian.controller.combat.damageBySource.skill > 0);
      assert.equal(await page.evaluate(() => kaitian.controller.combat.skillUses), 1); assert.ok(await page.evaluate(() => kaitian.controller.data.energy < 100));
      await page.screenshot({ path: output + '/' + prefix + '-skill.png' });
      await page.mouse.click(control.x, control.y); assert.equal(await page.evaluate(() => kaitian.controller.combat.skillUses), 1);
      await click('pause'); const paused = await page.evaluate(() => ({ time: kaitian.controller.combat.time, energy: kaitian.controller.combat.energy }));
      await page.waitForTimeout(100); assert.deepEqual(await page.evaluate(() => ({ time: kaitian.controller.combat.time, energy: kaitian.controller.combat.energy })), paused);
      await click('settings-close'); await page.evaluate(() => kaitian.controller.exitToHome());
      assert.deepEqual(errors, [], prefix);
    }
    console.log('PASS artifacts ' + route + ': unarmed hero, distinct normal attacks, aimed/tapped skills, energy gate, pause, 844×390 / 667×320');
    await page.close();
  }
}
module.exports = { checkArtifacts };
