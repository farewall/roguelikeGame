'use strict';
// The adapter is for WeChat MINIGAMES: wx.createCanvas/createImage, not WXML canvas nodes.
// Only the small DOM surface required by Pixi/Eva is exposed; all input uses native wx events.
function installPlatform(api, host = globalThis) {
  const info = api.getWindowInfo ? api.getWindowInfo() : api.getSystemInfoSync();
  const canvas = api.createCanvas(), imageSet = new WeakSet(), canvasSet = new WeakSet();
  const listeners = new Map();
  function events(target) {
    const map = new Map();
    target.addEventListener = (name, fn) => { const list = map.get(name) || []; list.push(fn); map.set(name, list); };
    target.removeEventListener = (name, fn) => map.set(name, (map.get(name) || []).filter(f => f !== fn));
    target.dispatchEvent = event => (map.get(event.type) || []).slice().forEach(fn => fn(event));
    return target;
  }
  function decorateCanvas(c) {
    canvasSet.add(c); c.style = c.style || {}; c.style.width = info.windowWidth + 'px'; c.style.height = info.windowHeight + 'px';
    c.getBoundingClientRect = () => ({ left: 0, top: 0, width: info.windowWidth, height: info.windowHeight, right: info.windowWidth, bottom: info.windowHeight });
    c.setAttribute = (key, value) => { if (key !== 'style') c[key] = value; };
    c.getAttribute = key => c[key]; c.removeAttribute = () => {}; c.focus = () => {}; if (!('parentNode' in c)) c.parentNode = null;
    return events(c);
  }
  decorateCanvas(canvas);
  function Image() {
    const image = api.createImage(); imageSet.add(image); const map = new Map();
    image.addEventListener = (name, fn) => {
      const list = map.get(name) || []; list.push(fn); map.set(name, list);
      image['on' + name] = event => { if (name === 'load') { try { image.complete = true; } catch (_) {} } (map.get(name) || []).slice().forEach(f => f(event)); };
    };
    image.removeEventListener = (name, fn) => map.set(name, (map.get(name) || []).filter(f => f !== fn));
    return image;
  }
  function CanvasElement() { return decorateCanvas(api.createCanvas()); }
  if (typeof Symbol !== 'undefined' && Symbol.hasInstance) {
    Object.defineProperty(Image, Symbol.hasInstance, { value: value => imageSet.has(value) });
    Object.defineProperty(CanvasElement, Symbol.hasInstance, { value: value => canvasSet.has(value) });
  }
  function element(tag) {
    if (tag === 'canvas') return new CanvasElement();
    if (tag === 'img' || tag === 'image') return new Image();
    const e = events({ tagName: tag.toUpperCase(), style: {}, children: [], setAttribute() {}, getAttribute() { return null; } });
    e.appendChild = child => { e.children.push(child); child.parentNode = e; return child; };
    e.removeChild = child => { e.children = e.children.filter(c => c !== child); child.parentNode = null; };
    return e;
  }
  const document = events({ createElement: element, createElementNS: (_, tag) => element(tag), getElementById: () => canvas, querySelector: () => canvas, body: element('body'), documentElement: { style: {} }, readyState: 'complete', baseURI: 'game.js', hidden: false });
  const window = { document, navigator: { userAgent: 'WeChat MiniGame', platform: info.platform || '', appVersion: '1', language: 'zh-CN', msPointerEnabled: false }, location: { href: 'game.js', protocol: 'file:', origin: '' }, devicePixelRatio: info.pixelRatio || 1, innerWidth: info.windowWidth, innerHeight: info.windowHeight,
    addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
    removeEventListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(f => f !== fn)); },
    dispatchEvent(event) { (listeners.get(event.type) || []).slice().forEach(fn => fn(event)); },
    Image, HTMLImageElement: Image, HTMLCanvasElement: CanvasElement, HTMLElement: function HTMLElement() {},
    performance: api.getPerformance ? api.getPerformance() : { now: () => Date.now() }
  };
  const raf = host.requestAnimationFrame || canvas.requestAnimationFrame && canvas.requestAnimationFrame.bind(canvas) || (fn => setTimeout(() => fn(Date.now()), 16));
  const caf = host.cancelAnimationFrame || canvas.cancelAnimationFrame && canvas.cancelAnimationFrame.bind(canvas) || clearTimeout;
  Object.assign(window, { requestAnimationFrame: raf, cancelAnimationFrame: caf, setTimeout, clearTimeout, setInterval, clearInterval, console });
  Object.assign(host, { window, document, navigator: window.navigator, Image, HTMLImageElement: Image, HTMLCanvasElement: CanvasElement, HTMLElement: window.HTMLElement, requestAnimationFrame: raf, cancelAnimationFrame: caf });
  if (!host.performance) host.performance = window.performance;
  if (typeof host.self === 'undefined') host.self = window;
  return { canvas, info, window, createImage: () => new Image() };
}
module.exports = { installPlatform };
