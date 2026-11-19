import { Asset, assetManager, AssetManager, AudioClip, ImageAsset, Rect, Size, SpriteFrame, Texture2D } from 'cc';
import { ARTIFACT_COLUMNS } from './generated/game-core';
import { artEntries, artGroups } from './generated/art-catalog';

type Definition = { bundle: string; path: string; audio?: boolean; target?: (string | number)[]; rects?: number[][] };
type AssetEntry = { key: string; spec: Definition; source: Asset; texture?: Texture2D; full?: SpriteFrame; slices?: SpriteFrame[] };
type BundleEntry = { bundle: AssetManager.Bundle; assets: AssetEntry[] };
const entries = Object.entries(artEntries) as [string, Definition][];

export const realmGroups = (stage: number): string[] => artGroups.realms[stage - 1] || [];

export function visualGroups(c: any): string[] {
  if (c.data.view !== 'game' || !c.combat) return [artGroups.shell];
  const core = c.combat, realms = new Set<number>([core.stage, core.world?.stage || core.stage]);
  for (const e of [...core.enemies, ...core.remnants]) if (e.boss) realms.add(e.bossType);
  if (c.data.showMemory) realms.add(c.data.memory.id);
  const names = [artGroups.shell, artGroups.common, artGroups.weapons[core.weapon], ...Array.from(realms).flatMap(realmGroups)];
  if (core.hazards.some(h => h.kind === 'tide')) names.push(...realmGroups(4).filter(n => n === 'game-tides'));
  return Array.from(new Set(names)).sort();
}

export function frame(texture: Texture2D, rect?: Rect) {
  const sprite = new SpriteFrame();
  sprite.texture = texture;
  if (rect) { sprite.rect = rect; sprite.originalSize = new Size(rect.width, rect.height); }
  return sprite;
}

function setFrame(frames: any, [key, index]: (string|number)[], value: any) {
  if (index === undefined) frames[key] = value;
  else (frames[key] ||= [])[index] = value;
}

function dispose(entry: BundleEntry) {
  for (const asset of entry.assets) {
    asset.slices?.forEach(f => f.destroy());
    asset.full?.destroy();
    asset.texture?.destroy();
    asset.source.decRef();
  }
  assetManager.removeBundle(entry.bundle);
}

async function loadEntry(bundle: AssetManager.Bundle, key: string, spec: Definition): Promise<AssetEntry> {
  if (spec.audio) {
    const source = await new Promise<AudioClip>((resolve,reject) => bundle.load(spec.path,AudioClip,(err,value)=>err?reject(err):resolve(value)));
    source.addRef();
    return {key,spec,source};
  }
  const source = await new Promise<ImageAsset>((resolve,reject) => bundle.load(spec.path,ImageAsset,(err,value)=>err?reject(err):resolve(value)));
  source.addRef();
  const entry: AssetEntry = {key,spec,source,texture:new Texture2D(),slices:[]};
  try {
    entry.texture.image = source;
    entry.full = frame(entry.texture);
    for (const rect of spec.rects || []) entry.slices.push(frame(entry.texture,new Rect(rect[0],rect[1],rect[2],rect[3])));
    return entry;
  } catch (error) {
    entry.slices.forEach(sprite => sprite.destroy());
    entry.full?.destroy(); entry.texture.destroy(); source.decRef();
    throw error;
  }
}

export class GameAssets {
  private loaded = new Map<string,BundleEntry>();
  private pending = new Map<string,Promise<BundleEntry>>();
  private mounted = new Set<string>();
  private requested = new Set<string>();
  private warming = new Set<string>();
  private destroyed = false;

  private acquire(name: string): Promise<BundleEntry> {
    const loaded = this.loaded.get(name);
    if (loaded) return Promise.resolve(loaded);
    const pending = this.pending.get(name);
    if (pending) return pending;
    const request = this.download(name).finally(() => this.pending.delete(name));
    this.pending.set(name,request);
    return request;
  }

  private async download(name: string) {
    const bundle = await new Promise<AssetManager.Bundle>((resolve,reject) => assetManager.loadBundle(name,(err,value)=>err?reject(err):resolve(value)));
    const settled = await Promise.allSettled(entries.filter(([,spec])=>spec.bundle===name).map(([key,spec])=>loadEntry(bundle,key,spec)));
    const assets = settled.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
    const failure = settled.find(result=>result.status==='rejected');
    const result = {bundle,assets};
    if (failure || this.destroyed || !this.needed(name)) dispose(result);
    else this.loaded.set(name,result);
    if (failure?.status==='rejected') throw failure.reason;
    return result;
  }

  private needed(name: string) {
    return this.mounted.has(name) || this.requested.has(name) || this.warming.has(name);
  }

  private prune() {
    for (const [key,entry] of this.loaded) {
      if (this.needed(key)) continue;
      this.loaded.delete(key);
      dispose(entry);
    }
  }

  async request(names: string[], progress: (value: number) => void) {
    this.requested = new Set(names);
    this.warming.clear();
    this.prune();
    let done = 0;
    const result = await Promise.allSettled(names.map(async name=>{
      await this.acquire(name);
      progress(++done / names.length);
    }));
    const failure = result.find(entry=>entry.status==='rejected');
    if (failure?.status==='rejected') throw failure.reason;
  }

  async prefetch(names: string[]) {
    this.warming = new Set(names);
    this.prune();
    await Promise.allSettled(names.map(name=>this.acquire(name)));
  }

  mount(names: string[], detach: (textures: Set<Texture2D>) => void) {
    const next = new Set(names);
    const removed = new Set<Texture2D>();
    for (const name of this.mounted) {
      if (next.has(name)) continue;
      for (const asset of this.loaded.get(name)?.assets || []) if (asset.texture) removed.add(asset.texture);
    }
    detach(removed);
    this.mounted = next;
    const frames: any = {}, textures: Record<string,SpriteFrame> = {}, audio: Record<string,AudioClip> = {};
    for (const name of next) {
      for (const entry of this.loaded.get(name).assets) {
        const {key,spec,full,slices,source} = entry;
        if (spec.audio) { audio[key.slice(6)] = source as AudioClip; continue; }
        textures[key] = full;
        if (spec.target) setFrame(frames,spec.target,slices.length?slices:full);
      }
    }
    if (frames.hero) {
      frames.artifact = {};
      const columnsPerDirection = frames.hero.length / 4;
      for (const [action, columns] of Object.entries(ARTIFACT_COLUMNS) as [string, number[]][]) {
        frames.artifact[action] = Array.from({length:4},(_,row)=>columns.map(col=>frames.hero[row*columnsPerDirection+col])).flat();
      }
    }
    this.prune();
    return {frames,textures,audio};
  }

  residentGroups() { return Array.from(this.loaded.keys()).sort(); }

  destroy() {
    this.destroyed = true;
    this.mounted.clear(); this.requested.clear(); this.warming.clear();
    this.prune();
  }
}
