'use strict';
const PIXI = require('pixi.js');
const { ARTIFACT_COLUMNS } = require('../core/artifact-animation');
const paths = { title: 'titile-bg.png', wraith: 'enemy-wraith.png', ending: 'ending-dawn.jpg' };
for (let i = 1; i <= 5; i++) { paths['arena' + i] = 'arena-' + i + '.jpg'; paths['boss' + i] = 'boss-' + i + '.png'; }
for (const kind of ['power', 'haste', 'health', 'fire', 'water', 'earth']) paths['upgrade-' + kind] = 'upgrade-' + kind + '.png';
for (const action of ['idle', 'move', 'attack', 'hurt', 'awaken', 'death']) paths[action] = 'pangu/' + action + '.png';
paths.artifact = 'pangu/artifact-cast.png';
async function loadAssets(createImage, progress = () => {}) {
  const textures = {}, frames = {}; let loaded = 0;
  await Promise.all(Object.entries(paths).map(([id, file]) => new Promise((resolve, reject) => {
    const image = createImage();
    image.onload = () => {
      try { image.complete = true; } catch (_) {}
      textures[id] = new PIXI.Texture(new PIXI.BaseTexture(image)); progress(++loaded / Object.keys(paths).length); resolve();
    };
    image.onerror = () => reject(new Error('无法读取资源：assets/images/' + file));
    image.src = 'assets/images/' + file;
  })));
  for (const action of ['idle', 'move', 'attack', 'hurt', 'awaken', 'death']) {
    frames[action] = [];
    for (let row = 0; row < 4; row++) for (let index = 0; index < 6; index++) frames[action].push(new PIXI.Texture(textures[action].baseTexture, new PIXI.Rectangle(index * 128, row * 128, 128, 128)));
  }
  frames.artifact = {};
  for (const [action, columns] of Object.entries(ARTIFACT_COLUMNS)) {
    frames.artifact[action] = [];
    for (let row = 0; row < 4; row++) for (const column of columns) frames.artifact[action].push(new PIXI.Texture(textures.artifact.baseTexture, new PIXI.Rectangle(column * 128, row * 128, 128, 128)));
  }
  return { textures, frames };
}
module.exports = { paths, loadAssets };
