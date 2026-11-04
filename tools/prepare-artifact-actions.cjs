'use strict';
// Offline compression only; the transparent, unarmed poses are authored in the source atlas.
const fs = require('node:fs'), path = require('node:path'), sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  const source = path.join(root, 'art/pangu-actions/artifact-cast.png');
  const meta = await sharp(source).metadata();
  if (meta.width !== 1536 || meta.height !== 1024 || !meta.hasAlpha) throw new Error('Expected transparent 6×4 artifact pose atlas');
  const out = path.join(root, 'cocos-project/assets/game-content/images/pangu/artifact-cast.png');
  await sharp(source).resize(768, 512).png({ palette: true, colours: 96, dither: 0.5, effort: 10 }).toFile(out);
  console.log('Artifact poses: ' + fs.statSync(out).size + ' bytes');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
