'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
async function createPreview(port = 0, options = {}) {
  const result = await esbuild.build({ entryPoints: [path.join(root, 'game/browser.js')], bundle: true, alias: { 'pixi.js': require.resolve('pixi.js/dist/pixi.js') }, platform: 'browser', format: 'iife', target: ['es2017'], define: { 'process.env.NODE_ENV': '"production"' }, write: false });
  const browserJS = result.outputFiles[0].text;
  const template = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>开天一念 · 小游戏预览</title><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#10202a}canvas{display:block;touch-action:none;width:100vw;height:100vh}</style><body><script>
  const listeners={},touches=new Map();let visibleCanvas=null;
  const on=(name,fn)=>(listeners[name]||(listeners[name]=[])).push(fn),off=(name,fn)=>listeners[name]=(listeners[name]||[]).filter(f=>f!==fn),emit=(name,e)=>{for(const fn of listeners[name]||[])fn(e)};
  const real=window;
  function decorate(c){c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);const t={identifier:e.pointerId,clientX:e.clientX,clientY:e.clientY};touches.set(e.pointerId,t);emit('TouchStart',{touches:[...touches.values()],changedTouches:[t]})});c.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;const t={identifier:e.pointerId,clientX:e.clientX,clientY:e.clientY};touches.set(e.pointerId,t);emit('TouchMove',{touches:[...touches.values()],changedTouches:[t]})});for(const [event,name]of [['pointerup','TouchEnd'],['pointercancel','TouchCancel']])c.addEventListener(event,e=>{const t={identifier:e.pointerId,clientX:e.clientX,clientY:e.clientY};touches.delete(e.pointerId);emit(name,{touches:[...touches.values()],changedTouches:[t]})});return c}
  const api={
    getWindowInfo:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{left:0,right:innerWidth,top:0,bottom:innerHeight},platform:'devtools'}),
    getPerformance:()=>performance,
    createCanvas:()=>{const c=document.createElement('canvas');if(!visibleCanvas){visibleCanvas=c;document.body.appendChild(c);decorate(c)}return c},
    createImage:()=>new real.Image(),getStorageSync:key=>JSON.parse(localStorage.getItem(key)||'null'),setStorageSync:(key,value)=>localStorage.setItem(key,JSON.stringify(value)),
    createInnerAudioContext:()=>({src:'',volume:1,play(){},stop(){},destroy(){}}),vibrateShort(){},showModal(options){console.error(options.title+': '+options.content)}
  };
  for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){api['on'+name]=fn=>on(name,fn);api['off'+name]=fn=>off(name,fn)}
  window.addEventListener('resize',()=>emit('WindowResize',{windowWidth:innerWidth,windowHeight:innerHeight}));document.addEventListener('visibilitychange',()=>emit(document.hidden?'Hide':'Show',{}));
  window.testWx=api;window.testEmit=emit;
  </script>BOOT</body></html>`;
  const server = http.createServer((req, res) => {
    try {
      if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (req.url === '/' || req.url === '/native') {
        const native = req.url === '/native';
        const boot = native ? `<script>
          const scope={wx:api,module:{exports:{}},console,setTimeout:real.setTimeout.bind(real),clearTimeout:real.clearTimeout.bind(real),setInterval:real.setInterval.bind(real),clearInterval:real.clearInterval.bind(real),requestAnimationFrame:real.requestAnimationFrame.bind(real),cancelAnimationFrame:real.cancelAnimationFrame.bind(real)};
          const reserved=new Set(['window','document','navigator','Image','HTMLImageElement','HTMLCanvasElement','HTMLElement','self','performance','HTMLVideoElement','HTMLAudioElement','Node','Element','Event','EventTarget','XMLHttpRequest','URL','Audio','fetch','location','CanvasRenderingContext2D','WebGLRenderingContext','PointerEvent']);
          const sandbox=new Proxy(scope,{has:(target,key)=>key in target||reserved.has(key),get:(target,key)=>target[key]});scope.globalThis=sandbox;scope.GameGlobal=sandbox;
          fetch('/native-game.js').then(r=>r.text()).then(source=>{new Function('sandbox','source','with(sandbox){(function(){eval(source)}).call(sandbox)}')(sandbox,source);return scope.module.exports}).then(runtime=>{window.kaitian=runtime;window.nativeScope=scope}).catch(e=>{window.bootError=e.stack;console.error(e)});
        </script>` : `<script src="/browser-game.js"></script><script>startKaitian(api,api.createCanvas()).then(runtime=>window.kaitian=runtime).catch(e=>{window.bootError=e.stack;console.error(e)})</script>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(template.replace('BOOT', boot));
      }
      if (req.url === '/browser-game.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(browserJS); }
      const relative = req.url === '/native-game.js' ? 'minigame/game.js' : 'minigame/' + decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
      const file = path.resolve(root, relative); if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
      res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav' })[path.extname(file)] || 'application/json'); res.end(fs.readFileSync(file));
    } catch (e) { res.writeHead(500); res.end(e.message); }
  });
  if (options.listen === false) { server.address = () => ({ port: 4173 }); return server; }
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
// Fulfil the real preview routes in-process: automated browser checks require no listening socket or external network.
async function previewPage(browser, server, options) {
  const page = await browser.newPage(options);
  await page.route('http://127.0.0.1:' + server.address().port + '/**', async route => {
    const response = await new Promise(resolve => {
      const headers = {}; let status = 200;
      server.emit('request', { url: new URL(route.request().url()).pathname }, {
        setHeader(name, value) { headers[name] = value; }, writeHead(value) { status = value; },
        end(body = '') { resolve({ status, headers, body }); }
      });
    });
    await route.fulfill(response);
  });
  return page;
}
if (require.main === module) createPreview(Number(process.argv[2]) || 4173).then(server => console.log('小游戏预览：http://127.0.0.1:' + server.address().port + '；原生 API 适配检查：/native'));
module.exports = { createPreview, previewPage };
