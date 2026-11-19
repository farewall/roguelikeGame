'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const catalog = require('../../art/catalog.json');
const bundles = [...new Set([catalog.shell, catalog.common, ...Object.values(catalog.weapons), ...catalog.realms.flat()])];
const assetRoot = path.join(root, 'cocos-project/assets');

function assetFile(id) {
  const entry = catalog.assets[id];
  if (!entry) throw new Error('Unknown art key ' + id);
  return path.join(assetRoot, entry.bundle, entry.path);
}

function jpegSize(data) {
  for (let offset = 2; offset < data.length && data[offset] === 255;) {
    const marker = data[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) return [data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5)];
    offset += 2 + data.readUInt16BE(offset + 2);
  }
  throw new Error('JPEG missing size marker');
}

function compileCatalog() {
  const usedFiles = new Set(), slots = new Set(), result = {};
  for (const [key, entry] of Object.entries(catalog.assets)) {
    const {bundle, size, path: relative, target, grid, encoding, source} = entry;
    if (!bundles.includes(bundle) || !/^(images|audio)\/[a-z0-9/-]+\.(png|jpg|wav)$/.test(relative)) throw new Error('Invalid asset path: ' + key);
    const file = assetFile(key);
    if (usedFiles.has(file)) throw new Error('Duplicate runtime art file: ' + file);
    usedFiles.add(file);
    if (source && !fs.existsSync(path.join(root,source))) throw new Error('Missing registered source for ' + key);
    const data = fs.readFileSync(file);
    if (encoding === 'wav-pcm') {
      if (data.toString('ascii',0,4) !== 'RIFF' || data.readUInt16LE(20) !== 1) throw new Error('Invalid PCM audio: ' + key);
      result[key] = {bundle, path:relative.slice(0,-4), audio:true};
      continue;
    }
    const png = encoding.startsWith('png-');
    const actual = png ? [data.readUInt32BE(16),data.readUInt32BE(20)] : jpegSize(data);
    if (size.some((n,i)=>actual[i]!==n) || png && data[25] !== (encoding === 'png-palette' ? 3 : 6)) throw new Error('Art dimensions or encoding changed: ' + key);
    if (target) {
      const id = target.join('.');
      if (slots.has(id)) throw new Error('Duplicate frame slot: ' + id);
      slots.add(id);
    }
    const record = {bundle, path:relative.slice(0,-4), ...(target ? {target} : {})};
    if (grid) {
      const {tile:[w,h], columns, rows, count=columns*rows, inset=0} = grid;
      if (!target || w*columns>size[0] || h*rows>size[1] || count<1 || count>columns*rows || inset*2>=Math.min(w,h)) throw new Error('Art grid outside source: ' + key);
      record.rects = Array.from({length:count},(_,i)=>[i%columns*w+inset,Math.floor(i/columns)*h+inset,w-2*inset,h-2*inset]);
    }
    result[key] = record;
  }
  for (const b of bundles) {
    const dir = path.join(assetRoot,b);
    for (const entry of fs.readdirSync(dir,{recursive:true})) {
      const file = path.join(dir,entry);
      if (!entry.endsWith('.meta') && fs.statSync(file).isFile() && !usedFiles.has(file)) throw new Error('Uncatalogued runtime art: ' + file);
    }
  }
  return result;
}
function generateArtCatalog() {
  const entries = compileCatalog();
  const config = {shell:catalog.shell,common:catalog.common,weapons:catalog.weapons,realms:catalog.realms,bundles};
  const output = path.join(assetRoot,'scripts/generated/art-catalog.ts');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,'// Generated from art/catalog.json by prepare:cocos.\nexport const artGroups = '+JSON.stringify(config)+';\nexport const artEntries = '+JSON.stringify(entries,null,2)+';\n');
}
if (require.main === module) { compileCatalog(); console.log('Runtime art catalog verified ('+Object.keys(catalog.assets).length+' files).'); }
module.exports = { assetFile, assetRoot, bundles, catalog, compileCatalog, generateArtCatalog };
