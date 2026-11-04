'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const build = path.resolve(__dirname, '../../cocos-project/build/web-mobile'), output = '/tmp/pangu-cocos';
(async () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(build, 'build-info.json'))).builder, 'official Creator CLI'); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } }), errors = [];
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
      await page.evaluate(async () => {
        window.pointerTrace=[]; window.engineTrace=[]; const cc = await System.import('cc');
        for (const name of ['TouchStart','TouchMove','TouchEnd']) kaitian.api['on'+name](event => pointerTrace.push({name,event}));
        for (const type of [cc.Input.EventType.TOUCH_START,cc.Input.EventType.TOUCH_MOVE,cc.Input.EventType.MOUSE_DOWN,cc.Input.EventType.MOUSE_MOVE]) cc.input.on(type,event=>engineTrace.push({type, point:event.getUILocation(), touches:event.getTouches?event.getTouches().map(t=>({id:t.getID(),point:t.getUILocation()})):null}));
        window.domTrace=[]; for (const type of ['mousedown','mousemove','mouseup','pointermove','touchstart','touchmove']) document.addEventListener(type,event=>domTrace.push({type,x:event.clientX,y:event.clientY,buttons:event.buttons,target:event.target.id}),true);
      });
      await click('start'); await click('weapon-bell'); await click('intro-enter');
      await page.evaluate(()=>{const c=kaitian.controller;c.combat.attackCd=100;c.combat.invulnerable=100;});
      const joy = await page.evaluate(()=>{const r=kaitian.controller.joystickRect;return{x:r.left+r.width/2,y:r.top+r.height/2};});
      await page.mouse.move(joy.x,joy.y);await page.mouse.down();await page.mouse.move(joy.x+30,joy.y,{steps:5});await page.waitForTimeout(300);
      console.log('MOUSE DIAG',JSON.stringify(await page.evaluate(()=>({dom:domTrace.slice(-20),engine:engineTrace.slice(-20),api:pointerTrace.slice(-20),move:kaitian.controller.moveVector,joy:kaitian.controller.data.joystick,player:kaitian.controller.player,blocked:kaitian.controller.isBlocked(),canvas:document.getElementById('GameCanvas').getBoundingClientRect().toJSON()}))));
      await page.mouse.up();
      const cdp=await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:joy.x,y:joy.y,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:joy.x+30,y:joy.y,id:1}]});await page.waitForTimeout(300);
      console.log('TOUCH DIAG',JSON.stringify(await page.evaluate(()=>({dom:domTrace.slice(-10),engine:engineTrace.slice(-10),api:pointerTrace.slice(-10),move:kaitian.controller.moveVector,player:kaitian.controller.player}))));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.screenshot({path:output+'/diagnostic.png'});
    } catch (error) { await page.screenshot({ path: output + '/failure.png' }); console.error('Creator browser errors:', errors); console.error(await page.evaluate(() => window.kaitian ? { ready: kaitian.presentation.ready, error: kaitian.presentation.error, view: kaitian.controller.data.view, data: { paused: kaitian.controller.data.paused, choice: kaitian.controller.data.showChoice, joystick: kaitian.controller.data.joystick }, joyId: kaitian.input.joyId, touchId: kaitian.controller.touchId, origin: kaitian.controller.touchOrigin, move: kaitian.controller.moveVector, player: kaitian.controller.player } : { runtime: false })); throw error; }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
