import { Color, Graphics, HorizontalTextAlignment, Label, Layers, Mask, Node, Rect, Sprite, SpriteFrame, UIOpacity, UITransform, VerticalTextAlignment } from 'cc';
import { DrawList, rgba } from './DrawList';
import { frame } from './GameAssets';
import { enemyFrame, bossFrame } from './generated/game-core';
import { drawHazard } from './HazardVfx';
import { drawPlayerBind } from './VineVfx';
import { creatureSize, drawCondensation, drawRemnant, condensationOpacity } from './CreatureVfx';
import { creatureMotion, bossMotionFrame, drawCreatureTell, drawEnrage } from './BossVfx';
import { drawWorld, drawWorldHud, drawWorldMapPanel } from './WorldVfx';
import {drawBuildPanel,drawRelicPanel} from './HudPanels';
import {drawGroundContact,bodyGroundShift,waveContour,HERO_TOP,BELL_HEIGHT} from './ReleaseArt';
const GOLD = 0xffd889, INK = 0x234035, LIGHT = 0xf9ebcb, MUTE = 0xc1d4ab;
const PAPER = 0xffefc9, JADE = 0x355744, RED = 0xa73f28;
const START_LABELS = { bell: '敲钟出战', banner: '执幡出战', swords: '持剑出战' };
const WEAPON_TRAITS = { bell: '近身震退', banner: '远射贯穿', swords: '飞剑追敌' };
const ROWS = { down: 0, up: 1, left: 2, right: 3 };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export class CocosPresentation {
  c: any; ready = false; progress = 0; error = ''; assets: any;
  layers: Record<string, any> = {}; regions: any[] = []; root: Node; worldClip: Node; private lastVersion = -1; private lastReady = false;
  private overlayTransform: {scale:number; x:number; y:number} | null = null;
  constructor(owner: Node, controller: any) {
    this.c = controller; this.root = this.makeNode('GameLayers'); owner.addChild(this.root);
    for (const name of ['background', 'ground', 'roads', 'terrain', 'world', 'hud', 'overlay']) {
      const node = this.makeNode(name);
      if (['ground','roads','terrain','world'].includes(name)) { if (!this.worldClip) { this.worldClip = this.makeNode('ArenaClip'); this.root.addChild(this.worldClip); this.worldClip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT; } this.worldClip.addChild(node); }
      else this.root.addChild(node);
      this.layers[name] = { node, g: new DrawList(node.addComponent(Graphics),name==='background'), nodes: new Map(), used: new Set(), pools:{sprite:[],label:[],surface:[]} };
    }
  }
  finishLayers() {
    for (const layer of Object.values(this.layers) as any[]) {
      layer.g.commit(); for (const [id, node] of layer.nodes) if (!layer.used.has(id)) node.active = false;
    }
    const t = this.overlayTransform;
    if (t) this.regions = this.regions.map(r=>({...r,x:r.x*t.scale+t.x,y:r.y*t.scale+t.y,width:r.width*t.scale,height:r.height*t.scale,contentScale:t.scale}));
  }
  detachFrames(frames: Set<SpriteFrame>) {
    if (!frames.size) return;
    const usesFrame = (node: Node) => frames.has(node.getComponent(Sprite)?.spriteFrame) ||
      frames.has((node as any).coverSource) || node.children.some(usesFrame);
    const remove = (node: Node) => {
      // Re-enabling a cached Sprite flushes UVs before its new frame is set.
      // Retire the whole node (including masked children) while its frame lives.
      node.active = false;
      node.removeFromParent();
      (node as any).coverFrame?.destroy();
      node.destroy();
    };
    for (const layer of Object.values(this.layers)) {
      for (const [id, node] of layer.nodes as Map<string,Node>) if (usesFrame(node)) {
        remove(node); layer.nodes.delete(id); layer.used.delete(id);
      }
      for (const kind of Object.keys(layer.pools)) layer.pools[kind]=layer.pools[kind].filter((node: Node)=>{
        if (!usesFrame(node)) return true;
        remove(node); return false;
      });
    }
  }
  makeNode(name: string) { const node = new Node(name); node.layer = Layers.Enum.UI_2D; node.addComponent(UITransform).setAnchorPoint(0, 1); return node; }
  begin(name: string) {
    const layer = this.layers[name];
    if (name === 'overlay') { this.overlayTransform = null; layer.node.setScale(1,1,1); layer.node.setPosition(0,0); }
    layer.g.clear(); layer.used.clear(); return layer;
  }
  use(layer: any, id: string, make: () => Node,kind='') {
    let node = layer.nodes.get(id); if (!node) {
      node=(layer===this.layers.world||layer===this.layers.terrain)&&kind?layer.pools[kind]?.pop():null;
      if(node){node.setScale(1,1,1);node.angle=0;node.getComponent(UITransform).setAnchorPoint(0,1);node.styleKey=null;node.worldDepth=undefined;}
      else node=make();
      node.recycleKind=kind;node.name = id; layer.nodes.set(id, node); if(node.parent!==layer.node)layer.node.addChild(node);
    }
    node.active = true; layer.used.add(id); return node;
  }
  place(layer: any, node: Node, x: number, y: number, mask?: Node) {
    const parent = mask || layer.node; if (node.parent !== parent) node.setParent(parent);
    const origin = mask && (mask as any).clipRect;
    node.setPosition(x - (origin ? origin.x : 0), -(y - (origin ? origin.y : 0)));
  }
  rect(layer: any, x: number, y: number, w: number, h: number, fill = INK, alpha = 1, border: number = null, radius = 5) {
    const g = layer.g; g.lineStyle(border === null ? 0 : 1.5, border === null ? 0 : border, 0.8); g.beginFill(fill, alpha); g.drawRoundedRect(x, y, Math.max(0.01, w), Math.max(0.01, h), radius); g.endFill();
  }
  text(layer: any, id: string, value: any, x: number, y: number, size = 24, color = LIGHT, options: any = {}) {
    if (options.minPx) size = Math.max(size,Math.ceil(options.minPx / this.c.rpxScale / (this.overlayTransform?.scale || 1)));
    const node = this.use(layer, id, () => { const n = this.makeNode(id); n.addComponent(Label);n.addComponent(UIOpacity); return n; },'label');
    const label = node.getComponent(Label), ui = node.getComponent(UITransform), key = JSON.stringify([size, color, options.serif, options.bold, options.center, options.wrap, options.leading]);
    let dirty = false;
    if ((node as any).styleKey !== key) {
      dirty = true;
      label.useSystemFont = true; label.fontFamily = options.serif ? 'serif' : 'sans-serif'; label.fontSize = size; label.lineHeight = size * (options.leading || 1.5); label.isBold = Boolean(options.bold);
      label.horizontalAlign = options.center ? HorizontalTextAlignment.CENTER : HorizontalTextAlignment.LEFT; label.verticalAlign = options.center ? VerticalTextAlignment.CENTER : VerticalTextAlignment.TOP;
      label.overflow = options.wrap ? Label.Overflow.RESIZE_HEIGHT : Label.Overflow.NONE; label.enableWrapText = Boolean(options.wrap);
      ui.setAnchorPoint(options.center ? 0.5 : 0, options.center ? 0.5 : 1); if (options.wrap) ui.setContentSize(options.wrap, size * 2);
      label.color = rgba(color); (node as any).styleKey = key;
    }
    const content = String(value === undefined || value === null ? '' : value); if (label.string !== content) { label.string = content; dirty = true; }
    node.getComponent(UIOpacity).opacity=Math.round(255*clamp(options.alpha===undefined?1:options.alpha,0,1));
    this.place(layer, node, x, y, options.mask); if (dirty) label.updateRenderData(true);
    return { height: ui.contentSize.height, node, label };
  }
  mask(layer: any, id: string, x: number, y: number, w: number, h: number) {
    const node = this.use(layer, id, () => { const n = this.makeNode(id); n.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT; return n; });
    node.getComponent(UITransform).setContentSize(w, h); node.setPosition(x, -y); (node as any).clipRect = { x, y }; return node;
  }
  image(layer: any, id: string, texture: SpriteFrame, x: number, y: number, w: number, h: number, alpha = 1, cover = false) {
    if (!texture) return null;
    const node = this.use(layer, id, () => {
      const n = this.makeNode(id), sprite: any = n.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.type = Sprite.Type.SIMPLE;
      Object.defineProperty(sprite, 'tint', { get: () => (n as any).tint || 0xffffff, set: value => { (n as any).tint = value; sprite.color = rgba(value, (n as any).imageAlpha); } }); return n;
    },'sprite');
    const sprite: any = node.getComponent(Sprite); (node as any).imageAlpha = alpha;
    if (cover) {
      const key = texture.uuid + ':' + w + ':' + h;
      if ((node as any).coverKey !== key || (node as any).coverSource !== texture) {
        const source = texture.rect, ratio = w / h, sw = source.width, sh = source.height;
        const cw = sw / sh > ratio ? sh * ratio : sw, ch = sw / sh > ratio ? sh : sw / ratio;
        if ((node as any).coverFrame) (node as any).coverFrame.destroy();
        (node as any).coverFrame = frame(texture.texture, new Rect(source.x + (sw - cw) / 2, source.y + (sh - ch) / 2, cw, ch)); (node as any).coverKey = key; (node as any).coverSource = texture;
      }
      sprite.spriteFrame = (node as any).coverFrame;
    } else sprite.spriteFrame = texture;
    node.getComponent(UITransform).setContentSize(w, h); this.place(layer, node, x, y); sprite.tint = 0xffffff; return sprite;
  }
  button(layer, id, label, x, y, width, height, action, options = {}) {
    const enabled = options.enabled !== false;
    const fill = options.primary ? RED : options.paper ? PAPER : options.selected ? 0x52724b : JADE;
    this.rect(layer, x, y + 5, width, height, 0x152c20, enabled ? .65 : .3, null, 12);
    this.rect(layer, x, y, width, height, fill, enabled ? 1 : .55, options.primary || options.selected ? GOLD : 0x9aab7a, 12);
    this.text(layer, id + '-label', label, x + width / 2, y + height / 2, options.size || 26, options.paper && !options.primary ? INK : LIGHT,
      { center: true, minPx: 11, bold: Boolean(options.primary), alpha: enabled ? 1 : .6 });
    this.regions.push({ id, x, y, width, height, ...options.hit, action, enabled });
  }
  surfaceGroup(layer,id){
    return this.use(layer,'surface-'+id,()=>{
      const n=this.makeNode('surface-'+id);n.addComponent(Mask).type=Mask.Type.GRAPHICS_STENCIL;
      const child=this.makeNode('surface-material'),sprite=child.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.type=Sprite.Type.SIMPLE;child.setParent(n);(n as any).surfaceSprite=sprite;return n;
    },'surface') as any;
  }
  terrainSurface(layer,id,texture,pool,offset){
    const node=this.surfaceGroup(layer,id);
    const w=pool.rx*2.2,h=pool.ry*2.2;
    node.getComponent(UITransform).setContentSize(w,h);node.setPosition(offset.x+pool.x-w/2,-(offset.y+pool.y-h/2));
    if(node.surfacePoints!==pool.points){
      const shape=node.getComponent(Graphics)||node.addComponent(Graphics);shape.clear();shape.fillColor=rgba(0xffffff,0);
      pool.points.forEach((p,i)=>{const x=p.x-pool.x+w/2,y=-(p.y-pool.y+h/2);if(i)shape.lineTo(x,y);else shape.moveTo(x,y);});shape.close();shape.fill();node.surfacePoints=pool.points;
    }
    const sprite=node.surfaceSprite,iw=pool.rx*2.65,ih=pool.ry*2.65;sprite.spriteFrame=texture;
    sprite.node.getComponent(UITransform).setContentSize(iw,ih);sprite.node.setPosition((w-iw)/2,-(h-ih)/2);
    return node;
  }
  waveSurface(layer,h,p,radius,inner,fade){
    const node=this.surfaceGroup(layer,'wave-'+h.id),size=radius*2;
    node.getComponent(UITransform).setContentSize(size,size);node.setPosition(p.x-radius,-(p.y-radius));
    if(node.surfaceHazard!==h||node.surfaceAge!==h.age){
      const shape=node.getComponent(Graphics)||node.addComponent(Graphics);shape.clear();shape.fillColor=rgba(0xffffff,0);
      waveContour(h,radius,inner).forEach((p,i)=>{const x=radius+p.x,y=-(radius+p.y);if(i)shape.lineTo(x,y);else shape.moveTo(x,y);});
      shape.close();shape.fill();node.surfaceHazard=h;node.surfaceAge=h.age;
    }
    const sprite=node.surfaceSprite,imageSize=radius*2.65;sprite.spriteFrame=this.assets.frames.worldPools[0];sprite.color=rgba(0xffffff,fade*.65);
    sprite.node.getComponent(UITransform).setContentSize(imageSize,imageSize);sprite.node.setPosition((size-imageSize)/2,-(size-imageSize)/2);node.worldDepth=-1e6;
    return node;
  }
  modal(width, height) {
    const { w, h, safe } = this.c.layout, layer = this.begin('overlay'); this.regions = [];
    const scale = Math.max(.01,Math.min(1,(safe.width-16)/width,(safe.height-16)/height));
    const tx = safe.x+safe.width/2-scale*w/2, ty = safe.y+safe.height/2-scale*h/2;
    layer.node.setScale(scale,scale,1);layer.node.setPosition(tx,-ty);
    this.overlayTransform = {scale,x:tx,y:ty};
    this.rect(layer, -tx/scale, -ty/scale, w/scale, h/scale, 0x050e14, 0.9, null, 0);
    const box = { x: (w - width) / 2, y: (h - height) / 2, width, height };
    this.rect(layer, box.x, box.y, width, height, INK, 1, 0xc7b27c, 20); return { layer, ...box };
  }
  render() {
    const c = this.c, d = c.data, { w, h } = c.layout;
    if (this.ready && this.lastReady && c.isBlocked() && this.lastVersion === c.version) return;
    this.lastVersion = c.version; this.lastReady = this.ready; this.regions = [];
    this.begin('background'); this.begin('ground'); this.begin('terrain'); this.begin('world'); this.begin('hud'); this.begin('overlay');
    this.root.setPosition(-w / 2, h / 2);
    const arena = c.layout.arena;
    this.worldClip.setPosition(arena.x, -arena.y); this.worldClip.getComponent(UITransform).setContentSize(arena.width, arena.height);
    const cam = c.combat ? c.combat.camera() : {x:0,y:0};
    for (const name of ['ground','roads','terrain','world']) this.layers[name].node.setPosition(-arena.x-cam.x, arena.y+cam.y);
    this.layers.roads.node.active = this.ready && d.view==='game' && Boolean(c.combat?.world);
    if (!this.ready) {
      const layer = this.layers.hud; this.rect(layer, 0, 0, w, h, 0x101f28);
      this.text(layer, 'loading-title', '开天一念', w / 2, h / 2 - 75, 65, GOLD, { center: true, serif: true });
      this.text(layer, 'loading-progress', this.error || '山河正在苏醒 · ' + Math.round(this.progress * 100) + '%', w / 2, h / 2 + 20, 25, MUTE, { center: true });
      if (this.error) this.button(layer, 'retry-content', '重新载入', w / 2 - 130, h / 2 + 90, 260, 64, () => c.retryAssets(), { primary: true });
      this.finishLayers(); return;
    }
    if (d.view === 'home') this.home(); else this.battle();
    if (d.showChoice) this.upgrades();
    if (d.showMemory) this.memory();
    if (d.showEnding) this.ending();
    if (d.showArchive) this.archive();
    if (d.showWorldMap && c.combat.world) drawWorldMapPanel(this);
    if(d.showBuildDetails)drawBuildPanel(this);
    if(d.showRelic)drawRelicPanel(this);
    if (d.bossTransition) drawEnrage(this);
    if (d.showSettings) this.settings();
    this.finishLayers();
    // Reuse a bounded set of transient displays; repeated attacks must not
    // allocate and destroy every sprite and floating label on the main thread.
    for(const layer of [this.layers.world,this.layers.terrain])for (const [id, node] of layer.nodes) if (!layer.used.has(id)) {
      const pool=layer.pools[node.recycleKind],limit=node.recycleKind==='label'?40:node.recycleKind==='surface'?8:112;
      if(pool&&pool.length<limit)pool.push(node);else node.destroy();layer.nodes.delete(id);
    }
  }
  home() {
    const { w, h, safe } = this.c.layout, bg = this.layers.background, layer = this.layers.hud, c = this.c, d = c.data;
    this.image(bg, 'title', this.assets.textures.title, 0, 0, w, h, 1, true);
    const titleSize = Math.min(100, safe.width * .085);
    const titleX = safe.x + safe.width * .23, titleY = safe.y + safe.height * .115;
    this.text(layer, 'home-title-shadow', '开天一念', titleX + 3, titleY + 6, titleSize, 0x472b1d, { center: true, serif: true, bold: true });
    this.text(layer, 'home-title', '开天一念', titleX, titleY, titleSize, PAPER, { center: true, serif: true, bold: true });
    const panelWidth = Math.min(925, safe.width * .55), right = safe.x + safe.width - 22, x = right - panelWidth;
    const touch = 44 / c.rpxScale, footerY = safe.y + safe.height - touch - 17, half = (panelWidth - 20) / 2;
    const y = safe.y + safe.height * .14, cardHeight = footerY - touch - y - 45;
    const choose = !d.hasCheckpoint || d.showIntro;
    if (choose) {
      const cardWidth = (panelWidth - 36) / 3;
      d.weapons.forEach((weapon, i) => {
        const cardX = x + i * (cardWidth + 18), selected = d.selectedWeapon === weapon.id;
        this.rect(layer, cardX, y + 6, cardWidth, cardHeight, 0x213726, .9, null, 18);
        this.rect(layer, cardX, y, cardWidth, cardHeight, selected ? 0xffe7ae : PAPER, 1, selected ? 0xffcf59 : 0xb39d69, 18);
        this.rect(layer, cardX + 7, y + 7, cardWidth - 14, cardHeight - 14, selected ? 0xffe7ae : PAPER, 1, selected ? 0xc58532 : 0xd9c28d, 13);
        const icon = Math.min(cardWidth - 22, cardHeight * .65);
        this.image(layer, 'weapon-icon-' + weapon.id, this.assets.frames.weaponCards[i], cardX + (cardWidth-icon)/2,
          y + Math.max(8, (cardHeight * .64 - icon)/2), icon, icon);
        this.text(layer, 'weapon-name-' + i, weapon.name, cardX + cardWidth / 2, y + cardHeight * .73, 36, INK, { center: true, serif: true, bold: true, minPx: 14 });
        this.text(layer, 'weapon-trait-' + i, WEAPON_TRAITS[weapon.id], cardX + cardWidth / 2, y + cardHeight * .9, 23, 0x567042, { center: true, minPx: 10 });
        if (selected) {
          this.rect(layer, cardX + cardWidth - 42, y + 15, 28, 28, RED, 1, GOLD, 14);
          this.text(layer, 'weapon-selected', '✓', cardX + cardWidth - 28, y + 29, 19, PAPER, { center: true });
        }
        this.regions.push({ id: 'weapon-' + weapon.id, x: cardX, y, width: cardWidth, height: cardHeight,
          action: () => c.selectWeapon({ currentTarget: { dataset: { weapon: weapon.id } } }) });
      });
      const label = d.hasCheckpoint ? '覆盖存档并出战' : START_LABELS[d.selectedWeapon];
      this.button(layer, 'intro-enter', label, x, footerY - touch - 20, panelWidth, touch, () => c.beginGame(), { primary: true, size: 38 });
    } else {
      this.rect(layer, x, y + 30, panelWidth, cardHeight - 12, INK, .93, 0xc8b77a, 20);
      this.text(layer, 'checkpoint', d.checkpointLabel, x + panelWidth/2, y + 75, 30, LIGHT, { center: true });
      this.button(layer, 'resume', '继续修行', x+24, y + 116, panelWidth-48, touch, () => c.resumeRun(), { primary: true, size: 34 });
      this.button(layer, 'start', '开启新一局', x, footerY - touch - 20, panelWidth, touch, () => c.openIntro(), { paper: true, size: 30 });
    }
    if (d.showIntro) this.button(layer, 'intro-back', '返回', x, footerY, half, touch, () => c.closeIntro(), { size: 26 });
    else this.button(layer, 'archive', '山河手记', x, footerY, half, touch, () => { c.setData({ archiveScroll: 0 }); c.openArchive(); }, { size: 26 });
    this.button(layer, 'home-settings', '设置', x + half + 20, footerY, half, touch, () => c.openSettings(), { size: 26 });
  }
  battle() {
    const c = this.c, d = c.data, { w, h, arena: a, joystick: joy } = c.layout, bg = this.layers.background, world = this.layers.world, hud = this.layers.hud, g = world.g;
    this.rect(bg, 0, 0, w, h, 0x253e32);
    if (!c.combat.world) this.image(bg, 'arena', this.assets.textures['arena' + d.stage], a.x, a.y, a.width, a.height, 0.68, true);
    this.rect(bg, a.x, a.y, a.width, a.height, 0x647c52, 0.14, 0xcbb070, 8);
    const core = c.combat, cam = core.camera();
    const point = p => ({ x: a.x + p.x * core.width / 100, y: a.y + p.y * core.height / 100 });
    const inView = (p,padding=120,q=p) => Math.max(p.x,q.x)+padding>=a.x+cam.x && Math.min(p.x,q.x)-padding<=a.x+cam.x+a.width &&
      Math.max(p.y,q.y)+padding>=a.y+cam.y && Math.min(p.y,q.y)-padding<=a.y+cam.y+a.height;
    if (c.combat.world) drawWorld(this,this.layers.ground,this.layers.terrain,world,point);
    for (const hazard of core.hazards) {
      const start=point(hazard), end=point(hazard.end||hazard);
      const range=Math.max(hazard.radius||0,hazard.wave?.to||0,hazard.width||0)+165;
      // A moving attack gets a conservative box that includes both endpoints and its sweep.
      const dx=(hazard.moving?.x||0)*core.width/100,dy=(hazard.moving?.y||0)*core.height/100;
      const lo={x:Math.min(start.x,end.x)+Math.min(0,dx),y:Math.min(start.y,end.y)+Math.min(0,dy)};
      const hi={x:Math.max(start.x,end.x)+Math.max(0,dx),y:Math.max(start.y,end.y)+Math.max(0,dy)};
      if(inView(lo,range,hi)) drawHazard(this, world, hazard, point);
    }
    const player = point(d.player);
    drawGroundContact(this,this.layers.terrain,'hero',player,{},164,54);
    for (const wave of core.bellWaves) if(inView(point(wave.origin),wave.range+90)) this.bellWave(world, wave, point);
    for (const effect of core.effects) if(inView(point(effect),Math.max(160,effect.radius||0))) this.drawEffect(world, effect, point);
    for (const volley of c.combat.projectiles) for (const [index, bolt] of volley.bolts.entries()) {
      const p = point(bolt), dx = bolt.direction.x, dy = bolt.direction.y, trail = Math.min(volley.split ? 26 : 42, volley.traveled);
      if (!inView(p)) continue;
      g.lineStyle(volley.split ? 1 : 2, 0xe2c68d, 0.4); g.moveTo(p.x - dx * trail, p.y - dy * trail); g.lineTo(p.x, p.y);
      const size = volley.split ? 46 : 68;
      const blade = this.image(world, 'blade-' + volley.id + '-' + index, this.assets.frames.banner[volley.split ? 13 : 12], p.x, p.y, size, size);
      blade.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5); blade.node.setPosition(p.x, -p.y);
      blade.node.angle = -Math.atan2(dy, dx) * 180 / Math.PI;
    }
    if (d.skillAim && !c.isBlocked()) {
      const q = { x: player.x + d.skillAim.x * 650, y: player.y + d.skillAim.y * 650 };
      g.lineStyle(2, 0xc5f6df, 0.55); g.moveTo(player.x, player.y); g.lineTo(q.x, q.y);
      this.text(hud, 'aim-help', '拖动调整方向 · 松手裂天', a.x + a.width / 2, a.y + 112, 24, 0xbcead8, { center: true });
    }
    const remnants=core.remnants.filter(body=>inView(point(body),creatureSize(body))).reverse();
    let ordinaryRemnants=0;
    for (const body of remnants) if(body.boss||ordinaryRemnants++<12) drawRemnant(this, world, body, point(body));
    for (const enemy of c.combat.enemies) {
      const p = point(enemy), size = creatureSize(enemy);
      if (c.combat.world) { const camera=c.combat.camera();if(p.x<a.x+camera.x-260 || p.x>a.x+camera.x+a.width+260 || p.y<a.y+camera.y-260 || p.y>a.y+camera.y+a.height+260) continue; }
      const forming = enemy.spawnTime > 0, solidity = condensationOpacity(enemy);
      drawGroundContact(this,this.layers.terrain,String(enemy.id),p,enemy,size,c.combat.world?c.combat.world.footOffset(enemy):size*.3);
      if (forming) drawCondensation(this, world, enemy, p, size);
      const hit = clamp(enemy.hitTime / 0.16, 0, 1), punch = Math.sin(hit * Math.PI)*(enemy.boss&&enemy.castTime>0?.22:1), direction = enemy.hitDirection || { x: 0, y: 0 };
      const motion = creatureMotion(enemy, c.combat.time);
      const sw = size * (0.85 + solidity * 0.15) * (1 + punch * 0.13) * motion.sx, sh = size * (0.8 + solidity * 0.2) * (1 - punch * 0.1) * motion.sy, recoil = punch * (enemy.boss ? 2 : 8);
      const texture = enemy.boss ? bossMotionFrame(this,enemy)||this.assets.frames.bosses[enemy.bossType - 1][bossFrame(enemy)] : this.assets.frames.enemies[enemyFrame(enemy)];
      // Keep a charging creature facing its locked lane, even if the player
      // crosses behind it during the warning. Only the sprite is mirrored.
      const charging = enemy.kind === 'charger' || enemy.bossType === 2;
      const lane = charging && c.combat.hazards.find(h => h.dash && h.owner === enemy.id && h.age < h.delay + h.duration);
      const facing = (enemy.castTime > 0||enemy.tigerHunt) && enemy.attackAngle !== undefined ? Math.cos(enemy.attackAngle) : c.player.x - enemy.x;
      const frontFlight=enemy.bossType===2&&enemy.tigerPose===6&&Math.sin(enemy.attackAngle||0)>=-.28;
      const flipped = enemy.bossType !== 5 && (frontFlight?(lane ? lane.end.x-lane.x:facing)<0:(lane ? lane.end.x - lane.x : facing)>0);
      const sprite = this.image(world, 'enemy-' + enemy.id, texture, p.x + (flipped ? sw / 2 : -sw / 2) + direction.x * recoil, p.y - sh / 2 + direction.y * recoil + motion.dy+bodyGroundShift(enemy,size), sw, sh, solidity);
      sprite.node.setScale(flipped ? -1 : 1, 1, 1); sprite.node.angle = motion.angle * (flipped ? -1 : 1);
      (sprite.node as any).worldDepth=p.y+(c.combat.world?c.combat.world.footOffset(enemy):size*.3);
      sprite.tint = hit > 0.5 ? 0xffffff : hit > 0 ? 0xffd39a : enemy.freezeTime > 0 ? 0xb5e4f1 : 0xffffff;
      drawCreatureTell(this, world, enemy, p, size);
      if (!enemy.boss) {
        if(enemy.trial||enemy.relicTrial||d.hintsOn&&enemy.kind!=='wraith'&&enemy.castTime>0)this.text(world,'role-'+enemy.id,enemy.relicTrial?'守印灵':enemy.trial?'试炼':enemy.kind==='ranged'?'蓄息':enemy.kind==='charger'?'伏身':'抬爪',p.x,p.y-size/2-14,21,LIGHT,{center:true});
        if (enemy.hp < enemy.maxHp) { this.rect(world, p.x - 26, p.y + size / 2 - 1, 52, 5, 0x24322f); this.rect(world, p.x - 26, p.y + size / 2 - 1, 52 * Math.max(0, enemy.hp / enemy.maxHp), 5, 0xd18b60); }
      }
      if (enemy.fractureTime > 0) {
        g.lineStyle(2.5, 0xe7bf7e, 0.9);
        for (const side of [-1, 1]) { g.moveTo(p.x + side * 16, p.y + size * 0.3); g.lineTo(p.x + side * 25, p.y + size * 0.22); g.lineTo(p.x + side * 33, p.y + size * 0.33); }
      }
      if (enemy.burnTime > 0) this.image(world, 'burn-' + enemy.id, this.assets.frames.meteor[12 + Math.floor(c.combat.time * 8) % 4], p.x - size * 0.24, p.y + size * 0.05, size * 0.48, size * 0.4, 0.4);
      if (enemy.slowTime > 0) for (const side of [-1, 1]) { g.lineStyle(2, 0xa3d5e4, 0.65); g.moveTo(p.x + side * size * 0.25, p.y + size * 0.22); g.lineTo(p.x + side * size * 0.2, p.y + size * 0.36); }
    }
    const frame = d.actorFrame, atlas = this.assets.frames.artifact[frame.action || 'idle'];
    const direction = ROWS[frame.direction || 'down'] || 0, index=frame.index||0;
    const showOutcome=d.ended&&(index>=2||d.showEnding);
    const texture=showOutcome?this.assets.frames.heroOutcomes[direction*2+(d.won?1:0)]:atlas[direction*6+index];
    const hero = this.image(world, 'hero', texture, player.x - 96, player.y - HERO_TOP, 192, 192, d.ended && !d.won ? Math.max(.72, 1-index*.055) : d.hurt ? .65 : 1);
    (hero.node as any).worldDepth=player.y+54;
    if (!d.ended) this.artifact(world, player, d.weaponId, c.combat.time, frame);
    if (!d.ended) drawPlayerBind(this, world, player, c.combat.rootTime, c.combat.time);
    hero.tint = d.hurt ? 0xffd4a8 : 0xffffff;
    this.sortWorld();
    if (d.warded) for (const side of [-1, 1]) { g.lineStyle(3, 0xbcdfc8, 0.65); g.moveTo(player.x + side * 45, player.y - 32); g.lineTo(player.x + side * 51, player.y + 20); }
    const uiTop = c.layout.safe.y, uiBottom = uiTop+c.layout.safe.height, utility=c.layout.utility;

    const menu = c.viewport.menuButton, headerRight = Math.max(w - a.x - a.width, menu && menu.left > 0 && menu.left < c.viewport.windowWidth ? w - menu.left / c.rpxScale + 16 : 0);
    const barX = a.x + 34, barW = Math.min(262, a.width * .28);
    this.rect(hud, barX, uiTop+27, barW, 34, 0x342b20, 1, 0xb59c63, 12);
    if (d.hpPct > 0) this.rect(hud, barX+5, uiTop+32, (barW-10)*d.hpPct/100, 24, d.hpPct<30 ? 0xd36047 : 0x658e43, 8);
    this.text(hud, 'hp', '♥', a.x+15, uiTop+43, 30, PAPER, {center:true,bold:true});
    this.text(hud, 'hp-count', d.hp + ' / ' + d.maxHp, barX+barW/2, uiTop+44, 20, PAPER, {center:true,minPx:10});
    if (!d.boss) {
      this.text(hud, 'phase', d.phaseName, barX+barW+24, uiTop+14, 24, GOLD,{minPx:11});
      this.text(hud, 'objective', d.objective, barX+barW+24, uiTop+51, 20, MUTE,{minPx:10});
    }
    const pauseX = w-12-headerRight-Math.max(100,utility.size), pauseW=Math.max(100,utility.size);
    this.button(hud, 'pause', '暂停', pauseX, uiTop+14, pauseW, 60, () => c.openSettings(), { size: 24, hit:{x:pauseX,y:uiTop,width:pauseW,height:utility.size} });
    this.rect(hud, a.x, uiTop+84, a.width, 4, 0x45583d); this.rect(hud, a.x, uiTop+84, a.width * d.progress / 100, 4, 0xbcaa62);
    this.rect(hud,a.x+12,a.y+12,255,67,INK,.88,0xb39d69,10);
    this.text(hud, 'stage', c.combat.world?.name || d.stageName, a.x + 24, a.y + 17, 23, PAPER, {bold:true});
    if (c.combat.world) drawWorldHud(this);
    if (d.boss) {
      const bw = Math.min(630, a.width * 0.43), bx = a.x + a.width / 2 - bw / 2;
      this.rect(hud, bx, a.y + 13, bw, 66, INK, .92, 0xc2a66d, 12);
      this.text(hud, 'boss-name', d.boss.name + ' · ' + d.boss.phase, bx + 14, a.y + 18, 22, GOLD);
      const state=bw*c.rpxScale<250?d.boss.state.split(' · ')[0]:d.boss.state;
      this.text(hud, 'boss-state', state, bx + bw * 0.54, a.y + 18, 20, MUTE,{minPx:10});
      this.rect(hud, bx + 14, a.y + 54, bw - 28, 15, 0x172f24, 1, 0xbc9b5e, 7);
      if (d.boss.hpPct > 0) this.rect(hud, bx + 17, a.y + 57, (bw - 34) * d.boss.hpPct / 100, 9, 0xe58448, 4);
    }
    this.button(hud,'build-open','构筑',utility.x,utility.y+(utility.size-40)/2,utility.size,40,()=>c.openBuild(),
      {size:Math.max(22,11/c.rpxScale),hit:{x:utility.x,y:utility.y,width:utility.size,height:utility.size}});
    const relic=d.worldRelic;
    if(relic?.nearby&&relic.status==='ready')this.button(hud,'relic-open','查看遗迹',a.x+a.width/2-100,a.y+a.height-79,200,52,()=>c.openRelic(),{primary:true,size:25});
    else if(relic?.status==='active')this.text(hud,'relic-active','守印试炼 · 击败守印灵',a.x+a.width/2,a.y+a.height-34,22,GOLD,{center:true});
    else if (d.phoenixSummonReady && !d.ended) {
      const center = a.x + a.width / 2;
      this.button(hud, 'phoenix-summon', '提前迎战朱雀', center-112, a.y+a.height-101, 224, 52, ()=>c.summonPhoenix(), {primary:true,size:24});
      this.text(hud, 'phoenix-cost', '停止精英波增援 · 放弃息火炉庇护', center, a.y+a.height-38, 18, GOLD, {center:true});
    }
    if (!d.ended) {
      this.skillControl(hud);
      const controls = hud.g;
      controls.lineStyle(2, PAPER, .62); controls.beginFill(0x344631, .32); controls.drawCircle(joy.x + 100, joy.y + 100, 100); controls.endFill();
      controls.lineStyle(2, GOLD, .85); controls.beginFill(0xe9d5a4, .68); controls.drawCircle(joy.x + 100 + d.joystick.x, joy.y + 100 + d.joystick.y, 38); controls.endFill();
    }
    if (d.message) {
      const tw=Math.min(720,a.width*.5),tx=a.x+24;
      this.rect(hud,tx,a.y+81,tw,64,INK,.93,0x9aa46d,10);this.text(hud,'toast',d.message,tx+15,a.y+90,23,GOLD,{wrap:tw-30,leading:1.2});
    } else if(d.hintsOn&&c.combat.time<12&&!d.boss&&!relic?.nearby)this.text(hud,'hint','左手走位 · 至宝自动追敌 · 右下主动技',a.x+a.width/2,a.y+a.height-24,21,MUTE,{center:true});
    this.text(hud, 'xp', '境界 ' + d.level + ' · 灵气 ' + d.xp + ' / ' + d.xpNeed, a.x, uiBottom - 39, 21, MUTE,{minPx:10});
    this.rect(hud, a.x + 230, uiBottom - 28, a.width - 535, 5, 0x2b3e42); this.rect(hud, a.x + 160, uiBottom - 28, (a.width - 465) * d.xpPct / 100, 5, 0xafbf8b);
    this.text(hud, 'kills', '击破 ' + d.kills + '       ' + (d.stage === 5 ? '天道终战' : '四象 ' + d.stage + ' / 4'), a.x + a.width - 280, uiBottom - 39, 20, MUTE,{minPx:10});
  }
  beam(g, p, q, width, color, alpha) {
    g.lineStyle(width * 0.28, color, alpha); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
    g.lineStyle(width * 0.09, 0xeaffec, Math.min(0.8, alpha * 3)); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
  }
  sortWorld() {
    const layer=this.layers.world,nodes=[...layer.used].map(id=>layer.nodes.get(id)).filter(Boolean);
    const depth=node=>node.worldDepth===undefined?(node.recycleKind==='label'?1e9:-1e6):node.worldDepth;
    nodes.sort((a,b)=>depth(a)-depth(b));
    const start=layer.node.children.length-nodes.length;
    nodes.forEach((node,i)=>{if(node.getSiblingIndex()!==start+i)node.setSiblingIndex(start+i);});
  }
  drawEffect(layer, effect, point) {
    const g = layer.g, p = point(effect), t = clamp(effect.age / effect.life, 0, 1), life = 1 - t;
    if(effect.type==='tiger-impact'||effect.type==='tiger-crash'){
      const crash=effect.type==='tiger-crash';
      for(let i=0;i<(crash?9:5);i++){
        const a=i*2.399+effect.id,r=(12+t*effect.radius)*(.65+i%3*.12),x=p.x+Math.cos(a)*r,y=p.y+72+Math.sin(a)*r*.38-Math.sin(t*Math.PI)*(crash?42:18);
        g.lineStyle(0);g.beginFill(crash?0xe1d0ad:0x9f8e72,life*.8);g.drawPolygon([x,y-4*life,x+6*life,y,x+2*life,y+4*life,x-4*life,y+2*life]);g.endFill();
      }
      const size=90+t*80;this.image(layer,'tiger-dust-'+effect.id,this.assets.frames.chaosMist[4],p.x-size/2,p.y+45,size,size*.36,life*.24);
      if(crash)this.image(layer,'tiger-bones-'+effect.id,this.assets.frames.tigerPillars[2],p.x-90,p.y-70-t*45,180,180,life*.9);
      return;
    }
    if(effect.type==='root-sever'){
      const alpha=clamp(life*2,0,1),angle=effect.angle,dx=Math.cos(angle),dy=Math.sin(angle);
      const end={x:p.x-dx*29,y:p.y-dy*29};
      g.lineStyle(17,0x435134,alpha);g.moveTo(end.x,end.y+5);g.lineTo(p.x,p.y+5);
      g.lineStyle(13,0x8d6036,alpha);g.moveTo(end.x,end.y);g.lineTo(p.x,p.y);
      g.lineStyle(2,0x9b6e42,alpha);g.beginFill(0xf5cf8b,alpha);g.drawEllipse(p.x,p.y,9,6);g.endFill();
      for(let i=0;i<6;i++){
        const a=angle+(i-2.5)*.51,r=t*(25+i*6),x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r-Math.sin(t*Math.PI)*15;
        g.lineStyle(0);g.beginFill(i%2?0xf7d190:0xb6814c,life);
        g.drawPolygon([x,y-4,x+5,y+2,x-2,y+5]);g.endFill();
      }
      return;
    }
    if(effect.type==='boss-break'||effect.type==='sword-ward'){
      const color=effect.type==='boss-break'?0xffdf9e:0xc5e3db;
      for(let i=0;i<6;i++){const a=i*Math.PI/3+.2,r=10+t*effect.radius;g.lineStyle(2.5,color,life*.85);g.moveTo(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r*.6);g.lineTo(p.x+Math.cos(a)*(r+12*life),p.y+Math.sin(a)*(r+12*life)*.6-8*life);}return;
    }
    if(effect.type==='world-loot'){g.lineStyle(2,0xe5d4a1,life);for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=8+t*30;g.moveTo(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r-t*26);g.lineTo(p.x+Math.cos(a)*(r+7*life),p.y+Math.sin(a)*(r+7*life)-t*26);}return;}
    if (effect.type === 'blade-split' || effect.type === 'banner-cast') {
      const split = effect.type === 'blade-split', size = split ? 45 + t * 48 : 48 + t * 24;
      const sprite = this.image(layer, 'blade-effect-' + effect.id, this.assets.frames.banner[split ? 14 : 15], p.x, p.y, size, size, life * (split ? 0.9 : 0.5));
      sprite.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5); sprite.node.setPosition(p.x, -p.y); sprite.node.angle = -(effect.angle || 0); return;
    }
    if (effect.type === 'bell-summon') {
      g.lineStyle(2, GOLD, life * 0.45); g.drawEllipse(p.x, p.y, 58 + t * 22, 20 + t * 8); return;
    }
    if (effect.type === 'resonance' || effect.type === 'ward-break') {
      g.lineStyle(effect.type === 'resonance' ? 3 : 4, 0xffefc3, life); g.drawCircle(p.x, p.y, effect.radius * (0.2 + t));
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = effect.radius * t; g.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); g.lineTo(p.x + Math.cos(a) * (r + 9 * life), p.y + Math.sin(a) * (r + 9 * life)); } return;
    }
    if (effect.type === 'damage') {
      this.text(layer, 'damage-' + effect.id, effect.amount, p.x, p.y - 38 - t * 48, effect.heavy ? 32 : 23, effect.heavy ? 0xffe6a0 : 0xfff4d4, { center: true, bold: true, alpha: life });
      return;
    }
    if (effect.type === 'impact') {
      const death = false, rays = 4;
      const radius = effect.radius * (0.25 + t * (death ? 1.4 : 1));
      g.lineStyle(death ? 3 * life + 0.5 : 2, death ? 0xe3c88b : 0xfff3da, life);
      for (let i = 0; i < rays; i++) {
        const angle = i * Math.PI * 2 / rays + (effect.id % 7) * 0.37, dx = Math.cos(angle), dy = Math.sin(angle);
        g.moveTo(p.x + dx * radius * 0.5, p.y + dy * radius * 0.5); g.lineTo(p.x + dx * radius, p.y + dy * radius);
      }
      g.lineStyle(1, 0xffebbd, life * 0.65); g.drawCircle(p.x, p.y, radius * (death ? 0.7 : 0.35));
      return;
    }
    const color = ({ steam: 0xd6edf0, earth: 0xc8aa7b, 'water-pulse': 0xace1e8, ember: 0xf3a367, ward: 0xb8dcb4, rift: 0xb9efdc })[effect.type] || GOLD;
    if (effect.type === 'rift' || effect.type === 'rift-windup') {
      const q = point(effect.end), windup = effect.type === 'rift-windup';
      if (windup) return;
      this.beam(g, p, q, effect.width, color, windup ? 0.08 : life * 0.24);
      g.lineStyle(windup ? 2 : 8 * life + 1, windup ? 0xaadcd2 : 0xebfff0, life * 0.9); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
      return;
    }
    if (effect.type === 'dominion') {
      for (let i = 0; i < 3; i++) { const radius = effect.radius * clamp(t * 1.6 - i * 0.14, 0.04, 1); g.lineStyle(6 - i, GOLD, life * (1 - i * 0.2)); g.drawCircle(p.x, p.y, radius); }
      g.lineStyle(0); g.beginFill(GOLD, life * 0.09); g.drawCircle(p.x, p.y, effect.radius); g.endFill();
      for (let i = 0; i < 12; i++) { const angle = i * Math.PI / 6; g.lineStyle(3, GOLD, life); g.moveTo(p.x + Math.cos(angle) * effect.radius * 0.88, p.y + Math.sin(angle) * effect.radius * 0.88); g.lineTo(p.x + Math.cos(angle) * effect.radius, p.y + Math.sin(angle) * effect.radius); }
      return;
    }
    const radius = effect.radius * (effect.type === 'impact' ? 0.7 : clamp(t * 1.4 + 0.15, 0, 1));
    g.lineStyle(effect.type === 'earth' ? 4 : 2, color, life);
    if (effect.type === 'earth') {
      for (let i = 0; i < 7; i++) { const angle = i * Math.PI * 2 / 7, dx = Math.cos(angle), dy = Math.sin(angle); g.moveTo(p.x + dx * 15, p.y + dy * 15); g.lineTo(p.x + dx * radius * 0.55 - dy * 8, p.y + dy * radius * 0.55 + dx * 8); g.lineTo(p.x + dx * radius, p.y + dy * radius); }
    } else { g.drawCircle(p.x, p.y, radius); }
    if (effect.type === 'bell' || effect.type === 'water-pulse') { g.lineStyle(1, color, life * 0.65); g.drawCircle(p.x, p.y, radius * 0.75); g.drawEllipse(p.x, p.y, radius, radius * 0.5); }
    if (effect.type === 'steam' || effect.type === 'impact') { g.beginFill(color, life * 0.16); g.drawCircle(p.x, p.y, radius * 0.7); g.endFill(); }
  }
  bellBody(layer, x, y, scale, charge, marks, threshold, alpha, turn = 0, id = 'chaos-bell') {
    const cycle = ((turn / (Math.PI * 2)) % 1 + 1) % 1;
    const texture = this.assets.frames.bell[Math.floor(cycle * 16) % 16];
    const w = 110 * scale, h = 116 * scale;
    const sprite = this.image(layer, id, texture, x - w / 2, y - h / 2, w, h, alpha);
    sprite.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5);
    sprite.node.setPosition(x, -y);
    // The bronze body stays opaque. Qi and charge are separate, faint accents.
    const g = layer.g;
    g.lineStyle(1, GOLD, alpha * (0.1 + charge * 0.25)); g.drawEllipse(x, y + 12 * scale, 52 * scale, 13 * scale);
    for (let i = 0; i < threshold; i++) {
      g.lineStyle(1, GOLD, alpha * 0.65); g.beginFill(i < marks ? 0xffe5a4 : 0x3a392a, alpha);
      g.drawCircle(x + (i - (threshold - 1) / 2) * 13 * scale, y + 55 * scale, 2.8 * scale); g.endFill();
    }
  }
  bellWave(layer, wave, point) {
    const g = layer.g, p = point(wave.origin), echo = wave.kind === 'echo', skill = wave.kind === 'skill';
    const end = wave.range / wave.speed, fade = wave.age <= end ? 1 : Math.max(0, 1 - (wave.age - end) / 0.14);
    const color = skill ? 0xffe9a6 : echo ? 0xbce6e0 : wave.elements.fire ? 0xf4b16a : wave.elements.water ? 0xa3e3ed : GOLD;
    const radius = Math.max(1, wave.radius), gap = skill ? 30 : 22;
    // The leading crest matches the damage front; quieter trailing ripples
    // make the sound visibly travel out of the character's center.
    g.lineStyle(0); g.beginFill(color, fade * (skill ? 0.055 : 0.025)); g.drawCircle(p.x, p.y, radius); g.endFill();
    for (let i = 2; i >= 0; i--) {
      const r = radius - i * gap; if (r <= 0) continue;
      const alpha = fade * (i === 0 ? 0.85 : i === 1 ? 0.32 : 0.12);
      g.lineStyle(i === 0 ? (skill ? 8 : echo ? 3 : 4) : 1.5, color, alpha); g.drawCircle(p.x, p.y, r);
      if (i === 0) { g.lineStyle(1.3, 0xfff4d2, alpha * 0.8); g.drawCircle(p.x, p.y, Math.max(1, r - 5)); }
    }
    if (wave.age < 0.12) {
      g.lineStyle(2, 0xfff0c6, (1 - wave.age / 0.12) * 0.8); g.drawCircle(p.x, p.y, 7 + wave.age * 90);
    }
    if (radius >= wave.range * 0.75 && !echo && !skill) {
      g.lineStyle(2.5, 0xffefbe, fade * 0.8);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + wave.age * 1.6; g.arc(p.x, p.y, radius + 3, a, a + Math.PI / 3); }
    }
    if (wave.elements.earth) { g.lineStyle(2, 0xc6a779, fade * 0.6); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.drawCircle(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius, 3); } }
  }
  artifact(layer, player, weapon, time, actorFrame) {
    if (weapon === 'swords') { this.swordBodies(layer); return; }
    if (weapon === 'bell') {
      const pending = this.c.combat.pendingAttack;
      const charge = pending ? 1 - Math.min(1, pending.remaining / (2 / 12)) : 0;
      const summon = this.c.combat.effects.find(effect => effect.type === 'bell-summon');
      const pulse = summon ? Math.sin(Math.PI * summon.age / summon.life) * 0.1 : 0;
      this.bellBody(layer, player.x + Math.sin(time * 65) * charge * 1.5, player.y - BELL_HEIGHT + Math.sin(time * 2.2) * 3, 0.64 + pulse, charge, this.c.data.bellMarks || 0, this.c.data.bellThreshold || 3, 1, time * 1.4);
    } else {
      const view = this.c.layout.arena, camera=this.c.combat.camera(), a={...view,x:view.x+camera.x,y:view.y+camera.y}, release = this.c.combat.effects.find(effect => effect.type === 'banner-cast' || effect.type === 'rift-windup' || effect.type === 'rift');
      const castFrame = release ? 8 + Math.min(3, Math.floor(release.age / 0.3 * 4)) : actorFrame.action === 'attack' ? [8, 8, 9, 10, 11, 11][actorFrame.index || 0] : -1;
      const idleFrame = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1][Math.floor(time * 8) % 14];
      const x = clamp(player.x + 98, a.x + 88, a.x + a.width - 88), y = clamp(player.y - 52 + Math.sin(time * 2.5) * 3, a.y + 96, a.y + a.height - 96);
      const banner = this.image(layer, 'pangu-banner', this.assets.frames.banner[castFrame >= 0 ? castFrame : idleFrame], x, y, 176, 192);
      banner.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5); banner.node.setPosition(x, -y);
      (banner.node as any).worldDepth=player.y+55;
      banner.node.setSiblingIndex(layer.node.children.length - 1);
    }
  }
  swordBodies(layer) {
    const c = this.c, a = c.layout.arena, hero = layer.nodes.get('hero');
    const swords = c.combat.swordPoses().sort((a, b) => a.depth - b.depth), bodies = [];
    for (const sword of swords) {
      const x = a.x + sword.x / 100 * c.combat.width, y = a.y + sword.y / 100 * c.combat.height;
      const body = this.image(layer, 'zhuxian-sword-' + sword.index, this.assets.frames.swords[sword.index], x, y, sword.width, sword.height);
      body.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5); body.node.setPosition(x, -y); body.node.angle = sword.angle;
      (body.node as any).worldDepth=(hero as any).worldDepth+sword.depth*65;
      bodies.push({ node: body.node, depth: sword.depth });
      if (!['idle', 'waiting', 'settle'].includes(sword.state)) {
        const base = sword.blade.base, tip = sword.blade.tip, dx = tip.x - base.x, dy = tip.y - base.y, length = Math.hypot(dx, dy) || 1;
        layer.g.lineStyle(sword.skill ? 2.2 : 1.5, 0xf1edcf, sword.state === 'windup' ? 0.72 : 0.48);
        layer.g.moveTo(a.x + tip.x - dx / length * 18, a.y + tip.y - dy / length * 18); layer.g.lineTo(a.x + tip.x, a.y + tip.y);
      }
      for (let i = 1; i < sword.trail.length; i++) {
        const previous = sword.trail[i - 1], next = sword.trail[i];
        layer.g.lineStyle(sword.skill ? 2.8 : 1.8, [0xd6a17f, 0xc9a36f, 0x9cc8d6, 0xa9cbb2][sword.index], next.alpha * (sword.state === 'return' ? 0.35 : 0.58));
        layer.g.moveTo(a.x + previous.x, a.y + previous.y); layer.g.lineTo(a.x + next.x, a.y + next.y);
      }
    }
    // Reorder the whole group so a sword changing sides never covers the wrong half of the hero.
    for (const node of [...bodies.filter(b => b.depth < 0).map(b => b.node), hero, ...bodies.filter(b => b.depth >= 0).map(b => b.node)]) node.setSiblingIndex(layer.node.children.length - 1);
  }
  skillControl(layer) {
    const c = this.c, d = c.data, r = c.layout.skill, g = layer.g, x = r.x + 96, y = r.y + 92, ready = d.skillReady && !c.isBlocked(), color = d.weaponId === 'bell' ? GOLD : d.weaponId === 'swords' ? 0xddbc96 : 0xb1e4d7;
    g.lineStyle(2.5, GOLD, ready ? .95 : .62); g.beginFill(ready ? RED : INK, .92); g.drawCircle(x, y, 77); g.endFill();
    g.lineStyle(4, color, ready ? 0.9 : 0.55); g.arc(x, y, 84, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, d.energy / 100));
    if(d.weaponId==='swords')for(let i=0;i<4;i++){
      const blade=this.image(layer,'skill-emblem-'+i,this.assets.frames.swords[i],x-34+i*12,y-54,32,67,ready?1:.65);blade.node.angle=-18+i*12;
    }else this.image(layer,'skill-emblem',d.weaponId==='bell'?this.assets.frames.bell[0]:this.assets.frames.banner[0],x-32,y-62,64,70,ready?1:.65);
    this.text(layer, 'skill-name', d.skillName, x, y + 28, 24, color, { center: true, serif: true, bold: true });
    this.text(layer, 'skill-charge', ready ? '释放' : d.energy + '%', x, y + 55, 17, ready ? LIGHT : MUTE, { center: true });
    this.text(layer, 'skill-help', d.weaponId === 'banner' && ready ? '拖动瞄准 · 松手释放' : d.weaponId === 'swords' && ready ? '点击御剑 · 清场围杀' : ready ? '点击震退 · 打断施法' : '命中与击破蓄能', x, r.y + 193, 17, MUTE, { center: true });
    this.regions.push({ id: 'skill', type: 'skill', ...r, enabled: ready });
  }
  upgrades() {
    const c = this.c, width = Math.min(c.layout.w - 100, 1450), { layer, x, y } = this.modal(width, 505), cardW = (width - 104) / 3;
    this.text(layer, 'choice-title', '境界 ' + (c.data.level + 1) + ' · 选择提升', x + width / 2, y + 48, 36, GOLD, { center: true, serif: true });
    this.text(layer, 'choice-help', '已暂停 · 选择一项，觉醒后继续战斗', x + width / 2, y + 103, 22, MUTE, { center: true });
    c.data.choices.forEach((choice, i) => {
      const cx = x + 28 + i * (cardW + 24), cy = y + 152;
      this.rect(layer, cx, cy, cardW, 322, PAPER, 1, ({ fire: 0xd39a70, water: 0x9bceda, earth: 0xc7b987 })[choice.kind] || 0x8f9a78);
      this.text(layer, 'choice-tag-' + i, choice.tag || '', cx + 20, cy + 16, 20, 0x557043,{minPx:9});
      this.image(layer, 'choice-icon-' + i, this.assets.textures['upgrade-' + (choice.iconKind || choice.kind)], cx + 20, cy + 57, 54, 54);
      this.text(layer, 'choice-name-' + i, choice.name, cx + 86, cy + 67, 28, INK,{minPx:12});
      const change=this.text(layer, 'choice-change-' + i, choice.change, cx + 20, cy + 126, 23, 0x883e24, { wrap: cardW - 40,minPx:11,leading:1.2 });
      const descY=cy+126+change.height+12;
      const desc=this.text(layer, 'choice-desc-' + i, choice.desc, cx + 20, descY, 21, INK, { wrap: cardW - 40,minPx:10,leading:1.25 });
      if (choice.combo) this.text(layer, 'choice-combo-' + i, choice.combo, cx + 20, descY+desc.height+10, 19, 0x426447, { wrap: cardW - 40,minPx:9,leading:1.2 });
      this.regions.push({ id: 'upgrade-' + choice.id, x: cx, y: cy, width: cardW, height: 322, action: () => c.chooseUpgrade({ currentTarget: { dataset: { upgradeId: choice.id, choiceToken: c.data.choiceToken } } }) });
    });
  }
  memory() {
    const c = this.c, d = c.data,three=d.rewardChoices.length>2,width = Math.min(c.layout.w - 100, 1420), { layer, x, y, height } = this.modal(width,three?700:650), artW = width * 0.29, bx = x + artW + 30, bw = width - artW - 60;
    this.image(layer, 'story-art', this.assets.textures['arena' + d.memory.id], x + 2, y + 2, artW - 2, height - 4, 0.87, true);
    this.text(layer, 'memory-art-title', '山\n河\n旧\n忆', x + 45, y + 350, 46, GOLD, { serif: true });
    this.text(layer, 'memory-kicker', d.memory.scene + ' · 记忆已收录', bx, y + 30, 21, MUTE);
    this.text(layer, 'memory-title', d.memory.title, bx, y + 70, 39, GOLD, { serif: true });
    this.text(layer, 'memory-copy', d.memory.copy, bx, y + 141, 24, LIGHT, { wrap: bw, leading: 1.65 });
    if (d.rewardChoices.length) {
      this.text(layer,'reward-title',d.rewardTitle,bx,y+(three?271:328),23,GOLD);
      d.rewardChoices.forEach((choice, i) => {
        const rw=three?bw:(bw-18)/2,rx=three?bx:bx+i*(rw+18),ry=y+(three?304+i*100:371),rh=three?94:156,selected=d.rewardSelectedId===choice.id;
        this.rect(layer,rx,ry,rw,rh,selected?0x354d3e:0x1a3035,1,selected?GOLD:0x6b8270);
        this.text(layer,'reward-name-'+i,choice.name,rx+15,ry+14,three?27:25,GOLD);
        this.text(layer,'reward-desc-'+i,choice.desc,rx+(three?236:15),ry+(three?12:51),three?23:20,LIGHT,{wrap:rw-(three?253:30),leading:1.25});
        if(!three)this.text(layer,'reward-change-'+i,choice.change,rx+15,ry+110,18,MUTE,{wrap:rw-30});
        this.regions.push({id:'reward-'+choice.id,x:rx,y:ry,width:rw,height:rh,enabled:!choice.disabled&&!d.rewardSelectedId,action:()=>c.selectMemoryReward({currentTarget:{dataset:{reward:choice.id}}})});
      });
    }
    this.text(layer,'memory-note',d.rewardChoices.length&&!d.rewardSelectedId?'选择一项，再前往下一境':'记忆可回看 · 下一境恢复 15 元气',bx,y+(three?609:548),20,MUTE);
    this.button(layer,'memory-continue',d.nextStageLabel,bx,y+(three?643:590),bw,44,()=>c.continueStage(),{primary:true,size:24,enabled:!d.rewardChoices.length||Boolean(d.rewardSelectedId)});
  }
  ending() {
    const c = this.c, d = c.data, width = Math.min(c.layout.w - 100, 1380), { layer, x, y, height } = this.modal(width, 610), artW = width * 0.29, bx = x + artW + 30, bw = width - artW - 60;
    this.image(layer, 'ending-art', this.assets.textures[d.won ? 'ending' : 'arena' + d.stage], x + 2, y + 2, artW - 2, height - 4, 0.85, true);
    this.text(layer, 'ending-kicker', d.won ? '万象初生 · 新纪元' : '混沌再起 · 待重生', bx, y + 30, 21, MUTE);
    this.text(layer, 'ending-title', d.endingTitle, bx, y + 69, 46, GOLD, { serif: true });
    this.text(layer, 'ending-copy', d.endingCopy, bx, y + 151, 24, LIGHT, { wrap: bw });
    this.text(layer, 'ending-facts', '战斗 ' + d.runSummary.timeLabel + '     击破 ' + d.runSummary.kills + '     ' + d.runSummary.result, bx, y + 275, 23, GOLD);
    this.text(layer, 'ending-build', d.runSummary.weaponName + ' · ' + d.runSummary.build, bx, y + 329, 23, MUTE, { wrap: bw });
    this.text(layer, 'ending-report', d.runReport.damage + '\n' + d.runReport.cause, bx, y + 409, 21, MUTE, { wrap: bw });
    if (d.endingHint) this.text(layer, 'ending-hint', d.endingHint, bx, y + 471, 22, GOLD, {wrap:bw});
    const buttonWidth = (bw - 32) / 3;
    this.button(layer, 'ending-home', '返回山河', bx, y+534, buttonWidth, 52, () => c.exitToHome());
    this.button(layer, 'ending-change', '换件至宝', bx+buttonWidth+16, y+534, buttonWidth, 52, () => c.changeWeaponAfterRun());
    this.button(layer, 'ending-restart', '同宝再战', bx+(buttonWidth+16)*2, y+534, buttonWidth, 52, () => c.restart(), {primary:true});
  }
  archive() {
    const c = this.c, d = c.data, width = Math.min(c.layout.w - 100, 1380), { layer, x, y } = this.modal(width, 650);
    this.text(layer, 'archive-kicker', '所见皆留痕', x + 35, y + 22, 20, MUTE);
    this.text(layer, 'archive-title', '山河手记', x + 35, y + 55, 41, GOLD, { serif: true });
    this.button(layer, 'archive-close', '返回', x + width - 150, y + 30, 115, 58, () => c.closeArchive());
    ['memories', 'enemies', 'runs'].forEach((tab, i) => this.button(layer, 'archive-' + tab, ['记忆 ' + d.memoryCount + ' / 4', '图鉴 ' + d.enemyCount + ' / 9', '最近征途'][i], x + 35 + i * (width - 70) / 3, y + 124, (width - 100) / 3, 55, () => { c.selectArchiveTab({ currentTarget: { dataset: { tab } } }); c.setData({ archiveScroll: 0 }); }, { selected: d.archiveTab === tab, size: 24 }));
    const area = { x: x + 35, y: y + 204, width: width - 70, height: 360 }, mask = this.mask(layer, 'archive-mask', area.x, area.y, area.width, area.height);
    const entries = d.archiveTab === 'memories' ? d.archiveMemories.map(m => ({ title: m.title + ' · ' + m.scene, copy: m.copy || '击败对应四象后，旧忆将逐渐苏醒。' })) : d.archiveTab === 'enemies' ? d.archiveEnemies.map(e => ({ title: e.name, copy: e.hint })) : d.archiveRuns.map(r => ({ title: r.result + ' · ' + r.timeLabel + ' · 击破 ' + r.kills, copy: r.weaponName + ' · ' + r.build + (r.detail ? '\n' + r.detail : '') }));
    let cursor = 0;
    if (!entries.length) this.text(layer, 'archive-empty', d.archiveTab === 'enemies' ? '遭遇敌人后，在这里留下应对之法。' : '完成一局后，在这里回顾构筑。保留最近八局。', area.x, area.y + 25, 25, MUTE, { wrap: area.width, mask });
    entries.forEach((entry, i) => {
      const cy = area.y + cursor - (d.archiveScroll || 0);
      this.text(layer, 'archive-title-' + i, entry.title, area.x, cy, 25, GOLD, { mask });
      const body = this.text(layer, 'archive-copy-' + i, entry.copy, area.x, cy + 43, 23, LIGHT, { wrap: area.width - 15, mask });
      cursor += 65 + body.height;
    });
    c.archiveMaxScroll = Math.max(0, cursor - area.height);
    this.regions.push({ id: 'archive-scroll', ...area, type: 'scroll' });
    this.text(layer, 'archive-note', '上下滑动回看 · 手记保存在本机 · 每局重新构筑', area.x, y + 594, 20, MUTE);
  }
  settings() {
    const c = this.c, d = c.data, { layer, x, y } = this.modal(680, d.confirmExit ? 360 : 600);
    this.text(layer, 'settings-title', d.view === 'game' ? '暂停 · 游戏设置' : '游戏设置', x + 340, y + 52, 34, GOLD, { center: true, serif: true });
    if (d.confirmExit) {
      this.text(layer,'exit-copy','保存当前进度并返回主菜单。\n再次进入时可从「继续修行」续玩。',x+40,y+123,26,LIGHT,{wrap:600});
      this.button(layer, 'exit-cancel', '返回设置', x + 40, y + 257, 285, 65, () => c.cancelExit());
      this.button(layer,'exit-confirm','保存并返回',x+355,y+257,285,65,()=>c.exitToHome(),{primary:true});return;
    }
    [['音效', 'soundOn', 'toggleSound'], ['震动反馈', 'vibrationOn', 'toggleVibration'], ['操作提示', 'hintsOn', 'toggleHints']].forEach(([label, key, fn], i) => {
      this.text(layer, 'setting-label-' + key, label, x + 42, y + 122 + i * 74, 27, LIGHT);
      this.button(layer, 'setting-' + key, d[key] ? '开启' : '关闭', x + 465, y + 112 + i * 74, 170, 56, () => c[fn]({ detail: { value: !c.data[key] } }), { selected: d[key], size: 24 });
    });
    this.text(layer, 'volume-label', '音效音量 ' + d.effectVolume + '%', x + 42, y + 355, 26, GOLD);
    this.button(layer, 'sound-preview', '试听', x + 505, y + 342, 130, 52, () => c.previewSound(), { size: 23 });
    this.rect(layer, x + 48, y + 432, 580, 8, 0x52675e); this.rect(layer, x + 48, y + 432, 580 * d.effectVolume / 100, 8, GOLD);
    layer.g.lineStyle(2, GOLD); layer.g.beginFill(GOLD); layer.g.drawCircle(x + 48 + 580 * d.effectVolume / 100, y + 436, 13); layer.g.endFill();
    this.regions.push({ id: 'volume', x: x + 48, y: y + 408, width: 580, height: 56, type: 'volume' });
    if (d.view === 'game') {
      this.button(layer, 'settings-close', '继续游戏', x + 40, y + 505, 285, 64, () => c.closeSettings(), { primary: true });
      this.button(layer,'settings-exit','保存并返回',x+355,y+505,285,64,()=>c.requestExit());
    } else this.button(layer, 'settings-close', '完成', x + 40, y + 505, 600, 64, () => c.closeSettings(), { primary: true });
  }
}
