'use strict';
// Offline build only: full-resolution art stays outside the Mini Game package.
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = path.join(root, 'art/pangu-actions');
const target = path.join(root, 'cocos-project/assets/game-content/images/pangu');
const actions = ['idle', 'move', 'attack', 'hurt', 'awaken', 'death'];
(async () => {
  fs.mkdirSync(target, { recursive: true });
  for (const action of actions) {
    const input = path.join(source, action + '.png');
    const meta = await sharp(input).metadata();
    if (meta.width !== 1536 || meta.height !== 1024 || !meta.hasAlpha) throw new Error('Invalid sheet: ' + action);
    const output = path.join(target, action + '.png');
    await sharp(input).resize(768, 512).png({ palette: true, colours: 96, dither: 0.5, effort: 10 }).toFile(output);
    console.log(action + ': ' + fs.statSync(output).size + ' bytes');
  }
  fs.mkdirSync(path.join(root, 'game/core'), { recursive: true });
  fs.copyFileSync(path.join(source, 'controller.cjs'), path.join(root, 'game/core/pangu-animation.js'));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
