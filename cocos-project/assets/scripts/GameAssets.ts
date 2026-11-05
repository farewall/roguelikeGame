import { assetManager, AssetManager, AudioClip, ImageAsset, Rect, Size, SpriteFrame, Texture2D } from 'cc';
import { ARTIFACT_COLUMNS } from './generated/game-core';
const paths: Record<string, string> = { title: 'titile-bg', enemies: 'enemy-actions', bosses: 'chaos-boss-actions', spellAtlas: 'boss-actions', ending: 'ending-dawn', artifact: 'pangu/artifact-cast' };
for (let i = 1; i <= 5; i++) { paths['arena' + i] = 'arena-' + i; paths['boss' + i] = 'boss-' + i; }
for (const kind of ['power', 'haste', 'health', 'fire', 'water', 'earth']) paths['upgrade-' + kind] = 'upgrade-' + kind;
for (const action of ['idle', 'move', 'attack', 'hurt', 'awaken', 'death']) paths[action] = 'pangu/' + action;
export function frame(texture: Texture2D, rect?: Rect) {
  const sprite = new SpriteFrame(); sprite.texture = texture; if (rect) { sprite.rect = rect; sprite.originalSize = new Size(rect.width, rect.height); } return sprite;
}
export async function loadAssets(progress: (value: number) => void = () => {}) {
  const bundle = await new Promise<AssetManager.Bundle>((resolve, reject) => assetManager.loadBundle('game-content', (error, value) => error ? reject(error) : resolve(value)));
  const textures: Record<string, SpriteFrame> = {}, frames: any = { artifact: {}, enemies: [], bosses: [], spells: [], chaosMist: [] }, audio: Record<string, AudioClip> = {};
  const sounds = ['attack', 'bell', 'echo', 'banner', 'dominion', 'rift', 'ready', 'warning', 'hurt', 'upgrade', 'victory', 'death'];
  let done = 0; const total = Object.keys(paths).length + sounds.length;
  await Promise.all(Object.entries(paths).map(async ([key, file]) => {
    const image = await new Promise<ImageAsset>((resolve, reject) => bundle.load('images/' + file, ImageAsset, (error, value) => error ? reject(error) : resolve(value)));
    const texture = new Texture2D(); texture.image = image; textures[key] = frame(texture); progress(++done / total);
  }));
  await Promise.all(sounds.map(async key => {
    audio[key] = await new Promise<AudioClip>((resolve, reject) => bundle.load('audio/' + key, AudioClip, (error, value) => error ? reject(error) : resolve(value))); progress(++done / total);
  }));
  for (const action of ['idle', 'move', 'attack', 'hurt', 'awaken', 'death']) {
    frames[action] = []; for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) frames[action].push(frame(textures[action].texture, new Rect(i * 128, row * 128, 128, 128)));
  }
  for (const [action, columns] of Object.entries(ARTIFACT_COLUMNS) as [string, number[]][]) {
    frames.artifact[action] = []; for (let row = 0; row < 4; row++) for (const column of columns) frames.artifact[action].push(frame(textures.artifact.texture, new Rect(column * 128, row * 128, 128, 128)));
  }
  for (let row = 0; row < 4; row++) for (let column = 0; column < 6; column++) {
    frames.enemies.push(frame(textures.enemies.texture, new Rect(column * 128, row * 128, 128, 128)));
  }
  for (let row = 0; row < 6; row++) {
    const target = row === 5 ? frames.chaosMist : (frames.bosses[row] = []);
    for (let column = 0; column < 6; column++) target.push(frame(textures.bosses.texture, new Rect(column * 128, row * 128, 128, 128)));
  }
  for (let column = 0; column < 6; column++) frames.spells.push(frame(textures.spellAtlas.texture, new Rect(column * 128, 5 * 128, 128, 128)));
  return { textures, frames, audio, bundle };
}
