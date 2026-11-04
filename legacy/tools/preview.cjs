'use strict';
// Development-only WXML adapter. Uses the real page, controller, CSS and assets.
// It is a browser layout/interaction check, not the WeChat compiler or runtime.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function html() {
  const tree = JSON.parse(execFileSync('python3', ['-c', `
import xml.etree.ElementTree as ET, re, json, html
from pathlib import Path
s=Path('miniprogram/pages/index/index.wxml').read_text()
s=re.sub(r'{{[\\s\\S]*?}}', lambda m: html.escape(html.unescape(m.group(0)), quote=False), s)
r=ET.fromstring('<root xmlns:wx="wx">'+s+'</root>')
n=0
def node(e):
 global n
 n+=1
 out={'id':n,'tag':e.tag,'attrs':{k.replace('{wx}', 'wx:'):v for k,v in e.attrib.items()},'children':[]}
 if e.text and e.text.strip(): out['children'].append(e.text)
 for c in e:
  out['children'].append(node(c))
  if c.tail and c.tail.strip(): out['children'].append(c.tail)
 return out
print(json.dumps(node(r), ensure_ascii=False))
`], { cwd: root, encoding: 'utf8' }));
  const sources = {};
  for (const file of ['pages/index/index.js', 'lib/combat.js', 'lib/pangu-animation.js', 'lib/game-audio.js', 'lib/chronicle.js']) sources['/miniprogram/' + file] = fs.readFileSync(path.join(root, 'miniprogram', file), 'utf8');
  const css = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxss'), 'utf8').replace(/\bpage\s*\{/g, 'body {');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>开天一念 · 本地预览</title><style>
  * { box-sizing:border-box; } html,body { margin:0; width:100%; height:100%; } view,scroll-view { display:block; } scroll-view { overflow-y:auto; } text { white-space:pre-line; } image,img { display:block; } button { font:inherit; border:0; cursor:pointer; } input { max-width:100%; } .app-shell { touch-action:none; } ${css}
  </style><body><div id="preview"></div><script>
  const tree=${JSON.stringify(tree)}, sources=${JSON.stringify(sources)};
  const cache={};
  function load(file) { if(cache[file]) return cache[file].exports; const module={exports:{}};cache[file]=module; new Function('require','module','exports',sources[file])((spec)=>load(new URL(spec+'.js','http://preview'+file).pathname),module,module.exports); return module.exports; }
  function expression(source,scope) { try { return new Function('scope','with(scope){return ('+source+')}')(scope); } catch(e) { throw new Error(source+': '+e.message); } }
  function value(text,scope) { if(typeof text!=='string') return text; const match=text.match(/^{{([^{}]*?)}}$/); if(match) return expression(match[1],scope); return text.replace(/{{([\\s\\S]*?)}}/g,(_,code)=>String(expression(code,scope)??'')); }
  function vnodes(node,scope,prefix='') {
    if(typeof node==='string') return [{key:prefix+':text:'+node, text:value(node,scope)}];
    const a=node.attrs;
    if(a['wx:if'] && !value(a['wx:if'],scope)) return [];
    if(a['wx:for']) return (value(a['wx:for'],scope)||[]).flatMap((item,index)=>{const local={...scope,item,index}; const copy={...node,attrs:{...a}};delete copy.attrs['wx:for'];return vnodes(copy,local,prefix+':'+(a['wx:key']==='*this'?item:a['wx:key']==='index'?index:item[a['wx:key']]??index));});
    const attrs={}; for(const [k,v] of Object.entries(a)) if(!k.startsWith('wx:')) attrs[k]=value(v,scope);
    return [{key:prefix+':'+node.id,tag:node.tag,attrs,children:node.children.flatMap(child=>vnodes(child,scope,prefix+':'+node.id))}];
  }
  const tags={root:'div',image:'img',switch:'input',slider:'input'};
  let rendering=false;
  function patch(parent, nodes) {
    const existing=new Map(Array.from(parent.childNodes).map(n=>[n.__key,n]));
    for(let i=0;i<nodes.length;i++) {
      const v=nodes[i]; let node=existing.get(v.key); existing.delete(v.key);
      if(!node) {node=v.text!==undefined?document.createTextNode(''):document.createElement(tags[v.tag]||v.tag);node.__key=v.key;}
      if(parent.childNodes[i]!==node) parent.insertBefore(node,parent.childNodes[i]||null);
      if(v.text!==undefined) { if(node.nodeValue!==String(v.text)) node.nodeValue=String(v.text); continue; }
      const attrs=v.attrs; node.__bindings={};
      for(const old of Array.from(node.attributes)) if(!(old.name in attrs)&&!['type'].includes(old.name)) node.removeAttribute(old.name);
      if(v.tag==='switch') {node.type='checkbox';node.checked=!!attrs.checked;}
      if(v.tag==='slider') {node.type='range';node.value=attrs.value;}
      for(let [key,val] of Object.entries(attrs)) {
        if(/^(bind|catch)/.test(key)) {node.__bindings[key.replace(/^(bind|catch)/,'')]=val;continue;}
        if(key==='disabled') {node.disabled=!!val;continue;}
        if(key==='src') val=new URL(val,'http://preview/miniprogram/pages/index/index.wxml').pathname;
        if(key==='mode') {node.style.objectFit=val==='aspectFit'?'contain':'cover';continue;}
        if(val!==undefined && val!==null && node.getAttribute(key)!==String(val)) node.setAttribute(key,String(val));
      }
      patch(node,v.children);
    }
    for(const node of existing.values()) node.remove();
  }
  function render() { if(rendering||!window.game)return; rendering=true;patch(document.getElementById('preview'),vnodes(tree,game.data));rendering=false; }
  const wx={getWindowInfo:()=>({windowWidth:innerWidth,windowHeight:innerHeight}),getStorageSync:key=>JSON.parse(localStorage.getItem(key)||'null'),setStorageSync:(key,val)=>localStorage.setItem(key,JSON.stringify(val)),vibrateShort(){},createInnerAudioContext:()=>({play(){},stop(){},destroy(){}})};
  function Page(definition) { window.game={...definition,data:structuredClone(definition.data),setData(patch,cb){Object.assign(this.data,structuredClone(patch));render();if(cb)cb();},createSelectorQuery(){let selector;const query={select(s){selector=s;return query;},boundingClientRect(cb){const el=document.querySelector(selector);const r=el?.getBoundingClientRect();cb(r?{left:r.left,top:r.top,width:r.width,height:r.height}:null);return query;},exec(){}};return query;}}; }
  new Function('require','Page','wx',sources['/miniprogram/pages/index/index.js'])(spec=>load(new URL(spec+'.js','http://preview/miniprogram/pages/index/index.js').pathname),Page,wx);
  function invoke(el,type,touches=[]) { const handler=el?.__bindings?.[type];if(handler)game[handler]({currentTarget:{dataset:{...el.dataset}},touches,detail:{value:el.type==='checkbox'?el.checked:Number(el.value)}}); }
  function binding(el,type) {while(el && !el.__bindings?.[type]) el=el.parentElement;return el;}
  let active=null;
  document.addEventListener('pointerdown',event=>{const el=binding(event.target,'touchstart');if(el){active=el;el.setPointerCapture?.(event.pointerId);invoke(el,'touchstart',[{clientX:event.clientX,clientY:event.clientY,identifier:event.pointerId}]);}});
  document.addEventListener('pointermove',event=>{if(active)invoke(active,'touchmove',[{clientX:event.clientX,clientY:event.clientY,identifier:event.pointerId}]);});
  document.addEventListener('pointerup',()=>{if(active)invoke(active,'touchend',[]);active=null;});
  document.addEventListener('pointercancel',()=>{if(active)invoke(active,'touchcancel',[]);active=null;});
  document.addEventListener('click',event=>{const el=binding(event.target,'tap');if(el)invoke(el,'tap');});
  document.addEventListener('change',event=>invoke(binding(event.target,'change'),'change'));
  window.addEventListener('resize',()=>game.onResize()); window.addEventListener('pagehide',()=>game.onUnload());
  game.onLoad();render();
  </script></body></html>`;
}
function serve(port = 0) {
  const server = http.createServer((request, response) => {
    try {
      if (request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); return response.end(html()); }
      const file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
      if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
      const ext = path.extname(file); response.setHeader('Content-Type', ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav' })[ext] || 'text/plain');
      response.end(fs.readFileSync(file));
    } catch (error) { response.writeHead(500); response.end(error.stack); }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
if (require.main === module) serve(Number(process.argv[2]) || 4173).then(server => console.log('Preview: http://127.0.0.1:' + server.address().port));
module.exports = { serve };
