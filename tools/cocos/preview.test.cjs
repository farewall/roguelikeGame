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
      // Keep authored weapon/boss geometry fixtures in a measured arena;
      // production input flows and the five-map traversal suite use exploration.
      await page.evaluate(() => { window.arenaFixture = c => { const core=new c.combat.constructor(c.data.selectedWeapon);core.configureArena(c.layout.arena.width,c.layout.arena.height,1);c.combat=core;c.player=core.player;return core; }; });
      await page.screenshot({ path: output + '/cocos-home.png' });
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) for (const weapon of ['bell', 'banner', 'swords']) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await click('start'); await click('weapon-' + weapon);
        if (weapon === 'swords') await page.screenshot({ path: output + '/swords-' + viewport.width + '-selection.png' });
        await click('intro-enter');
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
        const route = weapon === 'bell' ? 'echo' : weapon === 'banner' ? 'sweep' : '';
        if (route) await click('reward-' + route);
        await click('memory-continue'); assert.equal(await page.evaluate(() => kaitian.controller.combat.path), route);
        await page.evaluate(() => { const c = kaitian.controller; c.stopLoops(); c.combat.cleared = true; c.combat.stage = 2; c.combat.random = () => 0.9; c.completeStage(); });
        await click('reward-trial'); await click('memory-continue'); assert.ok(await page.evaluate(() => kaitian.controller.combat.enemies.some(e => e.trial)));
        await page.evaluate(() => { const c = kaitian.controller.combat; c.invulnerable = 0; c.hurt(1000, '火羽焚地'); });
        await page.waitForFunction(() => kaitian.controller.data.showEnding, null, { timeout: 5000 }); await page.screenshot({ path: output + '/' + prefix + '-ending.png' });
        await click('ending-home'); await click('archive'); await click('archive-runs'); assert.ok(await page.evaluate(() => kaitian.controller.data.archiveRuns.length > 0)); await click('archive-close');
        assert.deepEqual(errors, [], prefix); console.log('PASS Cocos Creator ' + prefix + ': native nodes, joystick, skill, pause/background, upgrades, stage progression, trial, ending, archive');
      }
      for (const viewport of [{ width:844,height:390 },{ width:667,height:320 }]) for (const weapon of ['bell','banner','swords']) {
        await page.setViewportSize(viewport); await page.waitForFunction(w=>kaitian.controller.viewport.windowWidth===w,viewport.width);
        await click('start'); await click('weapon-'+weapon); await click('intro-enter');
        await page.evaluate(() => {
          const c=kaitian.controller, {windowWidth:w,windowHeight:h}=c.viewport, inset=w>800?47:20;
          c.resize({...c.viewport,safeArea:{left:0,top:inset,right:h,bottom:w-20},menuButton:{left:h-94,right:h-7,top:10,bottom:42}});
          c.stopLoops(); c.combat.phase=3; c.combat.remaining=0; c.combat.enemies=[]; c.combat.hazards=[]; c.combat.invulnerable=1000; c.setData({message:''}); c.syncCombat();
          if(c.combat.weapon==='swords'){const core=c.combat,e=core.spawn('ranged');Object.assign(e,{x:core.player.x+200/core.width*100,y:core.player.y,hp:1000,maxHp:1000,speed:0,cooldown:100,spawnTime:0});}
        });
        await page.waitForTimeout(80);
        assert.ok(await page.evaluate(()=>{
          const c=kaitian.controller, s=c.rpxScale, a=c.arenaRect, w=c.viewport.windowWidth, skill=c.layout.skill;
          const mask=kaitian.presentation.worldClip.getComponent('cc.UITransform').contentSize;
          return a.width>w*.85 && Math.abs(mask.width*s-a.width)<.01 && skill.x*s>w*.75 && c.viewport.menuButton===null;
        }),'A portrait safe area must not cut the landscape battle, mask or skill region in half: '+weapon+' '+viewport.width);
        const joy=await page.evaluate(()=>{const r=kaitian.controller.joystickRect;return{x:r.left+r.width/2,y:r.top+r.height/2};});
        const skill=await page.evaluate(()=>{const c=kaitian.controller,r=c.layout.skill,s=c.rpxScale;return{x:(r.x+r.width/2)*s,y:(r.y+r.height/2)*s};});
        const before=await page.evaluate(()=>kaitian.controller.player.x), session=await page.context().newCDPSession(page), moving={x:joy.x+25,y:joy.y,id:1};
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...joy,id:1}]});
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moving]});
        await page.waitForFunction(x=>kaitian.controller.player.x>x,before);
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[moving,{...skill,id:2}]});
        if(weapon==='banner'){
          await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moving,{x:skill.x-65,y:skill.y,id:2}]});
          await page.waitForFunction(()=>kaitian.controller.data.skillAim&&kaitian.controller.data.skillAim.x<-.99);
        }
        await page.screenshot({path:output+'/landscape-insets-'+viewport.width+'-'+weapon+'.png'});
        // CDP names the lifted contacts here; keep the joystick finger down.
        await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:weapon==='banner'?skill.x-65:skill.x,y:skill.y,id:2}]});
        await page.waitForFunction(()=>kaitian.controller.combat.skillUses===1);
        assert.equal(await page.evaluate(()=>kaitian.controller.data.joystick.active),true);
        await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await session.detach();
        assert.equal(await page.evaluate(()=>kaitian.controller.data.joystick.active),false);
        await page.evaluate(()=>{const c=kaitian.controller;c.resize(kaitian.api.getWindowInfo());c.exitToHome();});
        assert.deepEqual(errors,[]); console.log('PASS Creator landscape safe area '+weapon+' '+viewport.width+': full battle width, native mask, right skill, simultaneous two-finger move/aim/release');
      }
      for (const viewport of [{ width:844,height:390 },{ width:667,height:320 }]) {
        await page.setViewportSize(viewport);await page.waitForFunction(w=>kaitian.controller.viewport.windowWidth===w,viewport.width);
        await click('start');await click('weapon-swords');await click('intro-enter');
        for(let stage=1;stage<=5;stage++)for(const mode of ['entry','roam','shrine','map']){
          await page.evaluate(({stage,mode})=>{
            const c=kaitian.controller;c.resetGame();c.pauseGame();const core=c.combat;
            core.stage=stage;core.startStage();core.phase=3;core.remaining=0;core.enemies=[];core.hazards=[];core.effects=[];core.invulnerable=1000;
            core.cameraStart=core.camera();core.travelStart=core.point(core.player);
            if(mode==='roam'){
              const goal=core.world.sites[1];for(let i=0;i<600&&Math.hypot(core.groundPoint(core.player).x-goal.x,core.groundPoint(core.player).y-goal.y)>80;i++){const d=core.world.steer(core.groundPoint(core.player),goal);core.move(core.player,d,15);core.update(.05,false);}
            }
            if(mode==='shrine'){const site=core.world.sites[0];Object.assign(core.player,core.percent(site));core.hp=70;core.energy=40;core.world.update(core);}
            c.setData({message:''});c.syncCombat();kaitian.presentation.render();
          },{stage,mode});
          if(mode==='map'){await page.evaluate(()=>kaitian.controller.resumeGame());await click('world-map');}
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(({stage,mode})=>{
            const c=kaitian.controller,core=c.combat,v=kaitian.presentation,a=c.layout.arena,cam=core.camera();
            if(!core.world||core.world.stage!==stage||core.width*core.height<8*a.width*a.height)return false;
            if(Math.abs(v.layers.world.node.position.x+a.x+cam.x)>.01||Math.abs(v.layers.world.node.position.y-a.y-cam.y)>.01)return false;
            if(![...v.layers.ground.used].some(id=>v.layers.ground.nodes.get(id).getComponent('cc.Sprite').spriteFrame===v.assets.frames.worldGround[stage-1]))return false;
            if([...v.layers.world.used].filter(id=>id.startsWith('zhuxian-sword-')).length!==4)return false;
            if(mode==='roam'&&(Math.hypot(cam.x-core.cameraStart.x,cam.y-core.cameraStart.y)<400||Math.hypot(core.point(core.player).x-core.travelStart.x,core.point(core.player).y-core.travelStart.y)<1100))return false;
            if(mode==='map'&&(!c.data.showWorldMap||!c.data.paused))return false;
            if(mode==='shrine'&&!core.world.sites[0].visited)return false;
            return v.layers.world.nodes.size<220&&v.layers.ground.nodes.size<=30;
          },{stage,mode}),'large world '+stage+' '+mode);
          const frozen=await page.evaluate(()=>JSON.stringify({time:kaitian.controller.combat.time,player:kaitian.controller.player,camera:kaitian.controller.combat.camera()}));await page.waitForTimeout(80);
          assert.equal(await page.evaluate(()=>JSON.stringify({time:kaitian.controller.combat.time,player:kaitian.controller.player,camera:kaitian.controller.combat.camera()})),frozen);
          await page.screenshot({path:output+'/world-'+viewport.width+'-'+stage+'-'+mode+'.png'});
          if(mode==='map'){await click('world-map-close');assert.equal(await page.evaluate(()=>kaitian.controller.data.showWorldMap),false);await page.evaluate(()=>kaitian.controller.pauseGame());}
        }
        await page.evaluate(()=>kaitian.controller.exitToHome());console.log('PASS Creator large worlds '+viewport.width+': five layouts, real terrain, travel across screens, following camera, loot sites, map pause, four swords, bounded nodes');
      }
      for (let stage = 1; stage <= 5; stage++) {
        await page.evaluate(stage => {
          const c = kaitian.controller; c.beginGame(); c.pauseGame(); const core = c.combat;
          core.stage = stage; core.startStage(); core.invulnerable = 1000;
          for (let i = 0; i < 240; i++) core.update(.025, false);
          if (!core.world.bossNav.ready) throw new Error('ordinary waves must prepare boss navigation');
          const nav = core.world.bossNav;
          nav.prepare = () => { throw new Error('boss arrival must not rebuild navigation'); };
          core.enemies = []; core.phase = 2; core.nextWave();
          if (core.bossPending || core.world.bossNav !== nav) throw new Error('boss must use the prepared field');
          c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
        }, stage);
        assert.ok(await page.evaluate(() => {
          const core = kaitian.controller.combat, v = kaitian.presentation, boss = core.enemies.find(e => e.boss);
          return !!boss && boss.spawnTime > 0 && v.layers.hud.nodes.get('boss-name').active && v.layers.world.used.has('enemy-' + boss.id);
        }), 'prepared boss arrival must still show formation and its health bar');
        await page.screenshot({ path: output + '/boss-arrival-' + stage + '.png' });
        await page.evaluate(() => kaitian.controller.exitToHome());
      }
      console.log('PASS Creator boss arrival: five maps warm navigation during ordinary waves, reuse it on arrival, and show forming bosses and health bars');
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await click('start'); await click('weapon-swords'); await click('intro-enter');
        for (const mode of ['idle-a', 'idle-b', 'windup', 'chase', 'cleave', 'return', 'skill-crowd', 'skill-single', 'left', 'right', 'top', 'bottom']) {
          await page.evaluate(mode => {
            const c = kaitian.controller; c.resetGame(); window.arenaFixture(c); c.pauseGame(); const core = c.combat;
            core.phase = 3; core.remaining = 0; core.enemies = []; core.hazards = []; core.effects = []; core.invulnerable = 1000; core.player.x = 48; core.player.y = 54;
            if (['left', 'right', 'top', 'bottom'].includes(mode)) {
              const b = c.playerBounds(); if (mode === 'left') core.player.x = b.xMin; if (mode === 'right') core.player.x = b.xMax; if (mode === 'top') core.player.y = b.yMin; if (mode === 'bottom') core.player.y = b.yMax;
            }
            core.resetSwords();
            if(!mode.startsWith('idle')){
              const edge=['left','right','top','bottom'].includes(mode),dx=edge?(core.player.x<50?200:-200):250,dy=edge?(core.player.y<50?120:-120):0;
              const enemy=(x,y)=>{const e=core.spawn('ranged');Object.assign(e,{x:core.player.x+x/core.width*100,y:core.player.y+y/core.height*100,hp:1000,maxHp:1000,speed:0,cooldown:100,spawnTime:0});};
              enemy(dx,dy);if(mode==='skill-crowd')for(const [x,y]of [[dx-50,-70],[dx+60,-30],[dx-40,60],[dx+60,90]])enemy(x,y);
            }
            if(['windup','chase','cleave','return'].includes(mode)){
              core.strike({direction:{x:1,y:0}});const times={windup:.05,chase:.3,cleave:.5,return:.85};for(let t=0;t<times[mode]-1e-7;t+=.01)core.updateArtifacts(.01);
            }
            if (mode.startsWith('skill-') || ['left', 'right', 'top', 'bottom'].includes(mode)) {
              core.useSkill();for(let i=0;i<100&&!core.flyingSwords.some(f=>f.state==='skill-cut');i++)core.updateArtifacts(.01);for(let i=0;i<12;i++)core.updateArtifacts(.01);
            }
            if(mode==='idle-b')core.updateArtifacts(.7);
            c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
          }, mode);
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(() => {
            const c = kaitian.controller, v = kaitian.presentation, a = c.layout.arena, hero = v.layers.world.nodes.get('hero');
            const ids = [...v.layers.world.used].filter(id => id.startsWith('zhuxian-sword-'));
            if (ids.length !== 4 || v.layers.world.used.has('chaos-bell') || v.layers.world.used.has('pangu-banner')) return false;
            return c.combat.swordPoses().every(pose => {
              const n = v.layers.world.nodes.get('zhuxian-sword-' + pose.index), s = n.getComponent('cc.Sprite'), ui = n.getComponent('cc.UITransform');
              // Dynamic atlas packing moves UVs and changes the texture after rendering.
              const expected = v.assets.frames.swords[pose.index];
              if (s.color.a !== 255 || s.spriteFrame !== expected || expected.originalSize.width !== 256 || expected.originalSize.height !== 256) return false;
              if ((n.getSiblingIndex() > hero.getSiblingIndex()) !== (pose.depth >= 0) || Math.abs(ui.contentSize.width - pose.width) > 0.01 || Math.abs(ui.contentSize.height - pose.height) > 0.01 || Math.abs(n.angle - pose.angle) > 0.01) return false;
              const angle=pose.angle*Math.PI/180,hx=Math.abs(Math.cos(angle))*pose.width/2+Math.abs(Math.sin(angle))*pose.height/2,hy=Math.abs(Math.sin(angle))*pose.width/2+Math.abs(Math.cos(angle))*pose.height/2;
              return n.position.x - hx >= a.x - 0.01 && n.position.x + hx <= a.x + a.width + 0.01 && -n.position.y - hy >= a.y - 0.01 && -n.position.y + hy <= a.y + a.height + 0.01;
            });
          }), 'Four opaque, individually textured swords must follow depth and remain in view: ' + mode);
          const before = await page.evaluate(() => JSON.stringify(kaitian.controller.combat.swordPoses())); await page.waitForTimeout(80);
          assert.equal(await page.evaluate(() => JSON.stringify(kaitian.controller.combat.swordPoses())), before);
          await page.screenshot({ path: output + '/swords-orbit-' + viewport.width + '-' + mode + '.png' });
        }
        await page.evaluate(() => kaitian.controller.exitToHome());
        console.log('PASS Creator four flying swords ' + viewport.width + ': upright hover, staggered chase/cleave/return, crowd/single skills, depth, frozen poses, edge bounds');
      }
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await click('start'); await click('weapon-banner'); await click('intro-enter');
        for (const mode of ['idle', 'flutter', 'release', 'volley', 'split', 'max', 'edge', 'cards-count', 'cards-split']) {
          await page.evaluate(mode => {
            const c = kaitian.controller; c.resetGame(); window.arenaFixture(c); c.pauseGame(); const core = c.combat;
            core.phase = 3; core.remaining = 0; core.enemies = []; core.hazards = []; core.effects = []; core.projectiles = []; core.player.x = 36; core.player.y = 58;
            core.time = mode === 'flutter' ? 0.5 : 0; core.invulnerable = 1000;
            const enemy = (dx, dy = 0) => { const e = core.spawn('ranged'); Object.assign(e, { x: core.player.x + dx / core.width * 100, y: core.player.y + dy / core.height * 100, hp: 1000, maxHp: 1000, speed: 0, cooldown: 100, spawnTime: 0 }); };
            if (mode === 'max') { core.path = 'sweep'; for (const kind of ['blades', 'split']) for (let i = 0; i < 3; i++) core.upgrade(kind); }
            if (mode === 'edge') { core.player.x = 96; core.player.y = 8; }
            if (mode === 'split' || mode === 'max') { core.upgrade('split'); enemy(110); enemy(235, 100); }
            if (['release', 'volley', 'split', 'max'].includes(mode)) {
              core.strike({ direction: { x: 1, y: 0 } }); core.updateArtifacts(0.18);
              for (const effect of core.effects) if (effect.type === 'banner-cast') effect.age = 0.18;
            }
            if (mode.startsWith('cards')) { core.level = mode === 'cards-split' ? 2 : 1; core.xp = core.xpNeed; c.setData({ paused: false }); c.levelUp(); }
            c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
          }, mode);
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(mode => {
            const c = kaitian.controller, v = kaitian.presentation, core = c.combat, n = v.layers.world.nodes.get('pangu-banner'), hero = v.layers.world.nodes.get('hero'), a = c.layout.arena;
            if (!n || !n.active || n.getSiblingIndex() <= hero.getSiblingIndex()) return false;
            const body = n.getComponent('cc.Sprite'), ui = n.getComponent('cc.UITransform');
            if (body.color.a !== 255 || body.spriteFrame.rect.width !== 192 || body.spriteFrame.texture !== v.assets.textures.banner.texture) return false;
            if (ui.contentSize.width !== 176 || ui.contentSize.height !== 192 || n.position.x - 88 < a.x || n.position.x + 88 > a.x + a.width || -n.position.y - 96 < a.y || -n.position.y + 96 > a.y + a.height) return false;
            if (mode === 'idle' && (body.spriteFrame.rect.x !== 0 || body.spriteFrame.rect.y !== 0)) return false;
            if (mode === 'flutter' && body.spriteFrame.rect.y !== 192) return false;
            if (mode === 'release' && (body.spriteFrame.rect.x !== 384 || body.spriteFrame.rect.y !== 384)) return false;
            if (mode === 'split' || mode === 'max') {
              const fragments = core.projectiles.filter(v => v.split); if (!fragments.length || fragments.some(v => v.bolts.length !== (mode === 'max' ? 4 : 2))) return false;
              if (!Array.from(v.layers.world.nodes).some(([id, n]) => id.startsWith('blade-') && n.getComponent('cc.Sprite').spriteFrame.rect.x === 192 && n.getComponent('cc.Sprite').spriteFrame.rect.y === 576)) return false;
            }
            if (mode === 'max' && (c.data.bladeCount !== 11 || c.data.splitCount !== 4)) return false;
            if (mode.startsWith('cards') && (!c.data.showChoice || !c.data.choices.some(u => u.kind === (mode === 'cards-count' ? 'blades' : 'split')))) return false;
            return v.layers.world.nodes.size < 200;
          }, mode), 'banner ' + viewport.width + ' ' + mode);
          const before = await page.evaluate(() => JSON.stringify(kaitian.controller.combat.projectiles.map(v => v.traveled)));
          await page.waitForTimeout(80); assert.equal(await page.evaluate(() => JSON.stringify(kaitian.controller.combat.projectiles.map(v => v.traveled))), before);
          await page.screenshot({ path: output + '/banner-redesign-' + viewport.width + '-' + mode + '.png' });
          if (mode.startsWith('cards')) {
            const kind = mode === 'cards-count' ? 'blades' : 'split'; await click('upgrade-' + kind);
            assert.equal(await page.evaluate(kind => kaitian.controller.combat.bannerUpgrades[kind], kind), 1); await page.evaluate(() => kaitian.controller.pauseGame());
          }
        }
        await page.evaluate(() => kaitian.controller.exitToHome());
        console.log('PASS Creator banner ' + viewport.width + ': solid foreground body, flutter/cast frames, blade/splinter textures, count/split cards, paused flight, edge placement');
      }
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await click('start'); await click('weapon-bell'); await click('intro-enter');
        for (const mode of ['idle-a', 'idle-b', 'plain', 'wide', 'fire', 'water', 'earth', 'echo', 'dominion']) {
          await page.evaluate(mode => {
            const c = kaitian.controller; c.resetGame(); window.arenaFixture(c); c.pauseGame(); const core = c.combat;
            core.phase = 3; core.remaining = 0; core.enemies = []; core.hazards = []; core.effects = []; core.player.x = 50; core.player.y = 55; core.time = mode === 'idle-b' ? 1 : 0;
            if (mode === 'wide') for (const kind of ['range', 'echo', 'resonance']) for (let i = 0; i < 3; i++) core.upgrade(kind);
            if (['fire', 'water', 'earth'].includes(mode)) core.elements[mode] = 2;
            for (const dx of (mode === 'wide' ? [60, 230, -260] : [60, 140, -130])) { const e = core.spawn('wraith'); Object.assign(e, { x: core.player.x + dx / core.width * 100, y: core.player.y, hp: 1000, maxHp: 1000, speed: 0, cooldown: 100 }); }
            if (mode === 'echo') {
              for (let i = 0; i < 3; i++) { core.strike({ direction: { x: 1, y: 0 } }); core.updateBellWaves(0.26); }
              core.player.x += 180 / core.width * 100; core.updateFollowups(0.32); core.updateBellWaves(0.12);
            } else if (mode === 'dominion') { core.useSkill(); core.updateFollowups(0.12); core.updateBellWaves(0.18); }
            else if (!mode.startsWith('idle')) { core.strike({ direction: { x: 1, y: 0 } }); core.updateBellWaves(mode === 'wide' ? 0.4 : 0.225); }
            c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
          }, mode);
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(mode => {
            const controller = kaitian.controller, c = controller.combat, v = kaitian.presentation;
            const clock = v.layers.world.nodes.get('chaos-bell'), arena = controller.layout.arena;
            if (!clock || !clock.active || controller.data.weaponName !== '混沌钟') return false;
            const body = clock.getComponent('cc.Sprite');
            if (!body || body.color.a !== 255 || body.spriteFrame.rect.width !== 192) return false;
            const size = clock.getComponent('cc.UITransform').contentSize; if (size.width > 90 || size.height > 96) return false;
            if (mode === 'wide' && c.snapshot().attackRange < 270) return false;
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
            const c = kaitian.controller; c.resetGame(); window.arenaFixture(c); c.pauseGame();
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
            boss.visualState = state === 'warning' ? 'cast' : 'release'; boss.visualAge = 0.6;
            c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
          }, { stage, state });
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(({ stage, state }) => {
            const v = kaitian.presentation, boss = kaitian.controller.combat.enemies.find(e => e.boss);
            const sprite = v.layers.world.nodes.get('enemy-' + boss.id).getComponent('cc.Sprite');
            const used = [...v.layers.world.used];
            const attack = used.some(id => id.startsWith('spell-') || id.startsWith('vines-') || id.startsWith('meteor-'));
            return sprite.spriteFrame.rect.y === (stage - 1) * 192 && sprite.spriteFrame.rect.x === (state === 'warning' ? 2 : 3) * 192 && (state === 'warning' || attack) && !used.some(id => id.startsWith('hazard-'));
          }, { stage, state }), 'Casting bodies and physical attacks must render without ground markers');
          await page.screenshot({ path: output + '/boss-' + stage + '-' + viewport.width + '-' + state + '.png' });
        }
        await page.evaluate(() => kaitian.controller.exitToHome());
      }
      // Actual production phase transition: the battle freezes, the pause
      // button remains usable during animation, then phase two resumes once.
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        for (let stage = 1; stage <= 5; stage++) {
          await page.evaluate(stage => {
            const c = kaitian.controller; c.beginGame(); const core = c.combat;
            core.stage = stage; core.phase = 3; core.remaining = 0; core.enemies = []; core.hazards = []; core.invulnerable = 100;
            // This cinematic fixture skips ordinary waves and their nav warmup.
            core.world.prepareNavigation(Infinity);
            const e = core.spawn('boss'); Object.assign(e, { x: 60, y: 45, speed: 0, cooldown: 100 }); e.hp = e.maxHp * 0.49;
          }, stage);
          await page.waitForFunction(() => kaitian.controller.data.bossTransition && kaitian.controller.data.bossTransition.age > 0.3);
          const time = await page.evaluate(() => kaitian.controller.combat.time);
          await click('enrage-pause');
          const age = await page.evaluate(() => kaitian.controller.combat.enrage.age);
          await page.waitForTimeout(100); assert.equal(await page.evaluate(() => kaitian.controller.combat.enrage.age), age);
          await click('settings-close');
          await page.waitForFunction(() => kaitian.controller.data.bossTransition && kaitian.controller.data.bossTransition.age >= 0.8);
          await page.screenshot({ path: output + '/enrage-' + stage + '-' + viewport.width + '.png' });
          assert.equal(await page.evaluate(() => kaitian.controller.combat.time), time);
          await page.waitForFunction(() => !kaitian.controller.combat.enrage);
          assert.equal(await page.evaluate(() => kaitian.controller.combat.enemies.find(e => e.boss).phase2), true);
          await page.evaluate(() => kaitian.controller.exitToHome());
        }
      }
      // Each approved silhouette at every lifecycle phase, from the actual export.
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await page.evaluate(() => kaitian.controller.beginGame());
        for (const state of ['mist-only', 'forming', 'solid', 'hit', 'unstable', 'mist', 'return']) {
          await page.evaluate(state => {
            const c = kaitian.controller; c.resetGame(); window.arenaFixture(c); c.pauseGame();
            const core = c.combat; core.phase = 3; core.enemies = []; core.hazards = []; core.effects = []; core.remnants = [];
            const list = ['wraith', 'ranged', 'charger', 'elite', 'boss', 'boss', 'boss', 'boss', 'boss'];
            list.forEach((kind, i) => {
              if (i >= 4) core.stage = i - 3;
              const e = core.spawn(kind); Object.assign(e, { x: 10 + (i < 4 ? i * 25 : (i - 4) * 19.5), y: i < 4 ? 24 : 66, fodder: i === 0, cooldown: 100, visualAge: 0 });
              if (state === 'forming' || state === 'mist-only') e.spawnTime = e.spawnDuration * (state === 'mist-only' ? 0.9 : 0.55);
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
            if (state === 'mist-only') return ids.filter(id => id.startsWith('condense-rise-')).length === 9 && kaitian.controller.combat.enemies.every(e => world.nodes.get('enemy-' + e.id).getComponent('cc.Sprite').color.a === 0);
            if (state === 'forming') return ids.filter(id => id.startsWith('condense-rise-')).length === 9;
            if (state === 'solid' || state === 'hit') return ids.filter(id => id.startsWith('enemy-')).length === 9;
            if (state === 'unstable') return ids.filter(id => id.startsWith('remnant-body-')).length === 9;
            return !ids.some(id => id.startsWith('remnant-body-')) && ids.filter(id => id.startsWith('remnant-eddy-')).length === 9;
          }, state), 'All nine creatures must render lifecycle ' + state);
          await page.screenshot({ path: output + '/chaos-' + viewport.width + '-' + state + '.png' });
        }
        await page.evaluate(() => kaitian.controller.exitToHome());
      }
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await page.evaluate(() => kaitian.controller.beginGame());
        for (const phase of ['warning', 'sprouting', 'spreading', 'grown', 'bound']) {
          await page.evaluate(phase => {
            const c = kaitian.controller; c.resetGame(); window.arenaFixture(c); c.pauseGame(); const core = c.combat;
            core.enemies = []; core.hazards = []; core.effects = []; core.phase = 3; core.stage = 1; core.player.x = 50; core.player.y = 58;
            const boss = core.spawn('boss'); Object.assign(boss, { x: 79, y: 27, cooldown: 100, castTime: 1, visualState: 'cast' });
            core.circle({ x: phase === 'bound' ? 50 : 40, y: 58 }, 100, 1.05, 2.1, '藤', 'root', 9, boss.id);
            const h = core.hazards[0], ages = { warning: 0.7, sprouting: 1.16, spreading: 1.4, grown: 1.85, bound: 1.85 }; h.age = ages[phase]; h.active = h.age >= h.delay;
            core.hazard({ shape: 'ring', x: 23, y: 43, radius: 130, inner: 86, delay: 1.05, duration: 2.1, kind: 'root', owner: boss.id, age: h.age });
            if (phase === 'bound') { core.rootTime = 0.6; core.rootSourceId = h.id; }
            c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
          }, phase);
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(phase => {
            const v = kaitian.presentation, c = kaitian.controller;
            const vines = [...v.layers.world.used].filter(id => id.startsWith('vines-'));
            return vines.length === (phase === 'warning' ? 0 : 2) && c.combat.contains(c.combat.hazards[1], c.combat.hazards[1]) === false && (phase !== 'bound' || v.layers.world.used.has('player-bind') && c.data.rooted);
          }, phase), 'Growing vines and their safe inner hole must render correctly');
          await page.screenshot({ path: output + '/vines-' + viewport.width + '-' + phase + '.png' });
        }
        await page.evaluate(() => kaitian.controller.exitToHome());
      }
      for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 320 }]) {
        await page.setViewportSize(viewport); await page.waitForFunction(w => kaitian.controller.viewport.windowWidth === w, viewport.width);
        await page.evaluate(() => kaitian.controller.beginGame());
        for (const phase of ['warning', 'falling', 'impact', 'burning', 'fading']) {
          await page.evaluate(phase => {
            const c = kaitian.controller; c.resetGame(); window.arenaFixture(c); c.pauseGame(); const core = c.combat;
            core.enemies = []; core.hazards = []; core.effects = []; core.phase = 3; core.stage = 3; core.player.x = 37; core.player.y = 62;
            const boss = core.spawn('boss'); Object.assign(boss, { x: 80, y: 28, cooldown: 100, castTime: 1.3, visualState: phase === 'warning' || phase === 'falling' ? 'cast' : 'release' });
            core.castPattern(3, boss, false);
            for (let i = 0; i < 28; i++) core.update(0.025, false);
            boss.visualState = phase === 'warning' || phase === 'falling' ? 'cast' : 'release';
            for (let i = 0; i < core.hazards.length; i++) {
              const h = core.hazards[i]; h.x = 57 + i * 13; h.y = 65 - i * 16;
              h.age = { warning: h.delay * 0.1, falling: h.delay * 0.75, impact: h.delay + 0.09, burning: h.delay + 0.8, fading: h.delay + h.duration - 0.12 }[phase]; h.active = h.age >= h.delay;
            }
            c.setData({ message: '' }); c.syncCombat(); kaitian.presentation.render();
          }, phase);
          await page.waitForTimeout(80);
          assert.ok(await page.evaluate(phase => {
            const ids = [...kaitian.presentation.layers.world.used].filter(id => id.startsWith('meteor-'));
            if (phase === 'warning') return ids.length === 0;
            const kind = phase === 'falling' ? '-fall' : phase === 'impact' ? '-burst' : '-ground';
            return kaitian.controller.combat.hazards.every(h => h.meteor) && ids.filter(id => id.endsWith(kind)).length === 3;
          }, phase), 'Meteor fall, impact and lingering ground fire must use the new atlas');
          await page.screenshot({ path: output + '/meteor-' + viewport.width + '-' + phase + '.png' });
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
