import { Color, Graphics, HorizontalTextAlignment, Label, Layers, Mask, Node, Rect, Sprite, SpriteFrame, UITransform, VerticalTextAlignment } from 'cc';
import { DrawList, rgba } from './DrawList';
import { frame } from './GameAssets';
import { enemyFrame, bossFrame } from './generated/game-core';
import { drawHazard } from './HazardVfx';
import { drawPlayerBind } from './VineVfx';
import { creatureSize, drawCondensation, drawRemnant, condensationOpacity } from './CreatureVfx';
const GOLD = 0xe3c88b, INK = 0x14262d, LIGHT = 0xe4e2ce, MUTE = 0x9fb8ac;
const ROWS = { down: 0, up: 1, left: 2, right: 3 };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export class CocosPresentation {
  c: any; ready = false; progress = 0; error = ''; assets: any;
  layers: Record<string, any> = {}; regions: any[] = []; root: Node; worldClip: Node; private lastVersion = -1; private lastReady = false;
  constructor(owner: Node, controller: any) {
    this.c = controller; this.root = this.makeNode('GameLayers'); owner.addChild(this.root);
    for (const name of ['background', 'world', 'hud', 'overlay']) {
      const node = this.makeNode(name);
      if (name === 'world') { this.worldClip = this.makeNode('ArenaClip'); this.root.addChild(this.worldClip); this.worldClip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT; this.worldClip.addChild(node); }
      else this.root.addChild(node);
      this.layers[name] = { node, g: new DrawList(node.addComponent(Graphics)), nodes: new Map(), used: new Set() };
    }
  }
  finishLayers() {
    for (const layer of Object.values(this.layers) as any[]) {
      layer.g.flush(); for (const [id, node] of layer.nodes) if (!layer.used.has(id)) node.active = false;
    }
  }
  makeNode(name: string) { const node = new Node(name); node.layer = Layers.Enum.UI_2D; node.addComponent(UITransform).setAnchorPoint(0, 1); return node; }
  begin(name: string) {
    const layer = this.layers[name]; layer.g.clear(); layer.used.clear(); return layer;
  }
  use(layer: any, id: string, make: () => Node) {
    let node = layer.nodes.get(id); if (!node) { node = make(); node.name = id; layer.nodes.set(id, node); layer.node.addChild(node); }
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
    const node = this.use(layer, id, () => { const n = this.makeNode(id); n.addComponent(Label); return n; });
    const label = node.getComponent(Label), ui = node.getComponent(UITransform), key = JSON.stringify([size, color, options.serif, options.bold, options.center, options.wrap, options.leading, options.alpha]);
    let dirty = false;
    if ((node as any).styleKey !== key) {
      dirty = true;
      label.useSystemFont = true; label.fontFamily = options.serif ? 'serif' : 'sans-serif'; label.fontSize = size; label.lineHeight = size * (options.leading || 1.5); label.isBold = Boolean(options.bold);
      label.horizontalAlign = options.center ? HorizontalTextAlignment.CENTER : HorizontalTextAlignment.LEFT; label.verticalAlign = options.center ? VerticalTextAlignment.CENTER : VerticalTextAlignment.TOP;
      label.overflow = options.wrap ? Label.Overflow.RESIZE_HEIGHT : Label.Overflow.NONE; label.enableWrapText = Boolean(options.wrap);
      ui.setAnchorPoint(options.center ? 0.5 : 0, options.center ? 0.5 : 1); if (options.wrap) ui.setContentSize(options.wrap, size * 2);
      label.color = rgba(color, options.alpha === undefined ? 1 : options.alpha); (node as any).styleKey = key;
    }
    const content = String(value === undefined || value === null ? '' : value); if (label.string !== content) { label.string = content; dirty = true; }
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
    });
    const sprite: any = node.getComponent(Sprite); (node as any).imageAlpha = alpha;
    if (cover) {
      const key = texture.uuid + ':' + w + ':' + h;
      if ((node as any).coverKey !== key) {
        const source = texture.rect, ratio = w / h, sw = source.width, sh = source.height;
        const cw = sw / sh > ratio ? sh * ratio : sw, ch = sw / sh > ratio ? sh : sw / ratio;
        (node as any).coverFrame = frame(texture.texture, new Rect(source.x + (sw - cw) / 2, source.y + (sh - ch) / 2, cw, ch)); (node as any).coverKey = key;
      }
      sprite.spriteFrame = (node as any).coverFrame;
    } else sprite.spriteFrame = texture;
    node.getComponent(UITransform).setContentSize(w, h); this.place(layer, node, x, y); sprite.tint = 0xffffff; return sprite;
  }
  button(layer, id, label, x, y, width, height, action, options = {}) {
    const enabled = options.enabled !== false;
    this.rect(layer, x, y, width, height, options.primary ? GOLD : options.selected ? 0x354a43 : 0x192e34, enabled ? 1 : 0.45, options.primary || options.selected ? GOLD : 0x6d8172, 4);
    this.text(layer, id + '-label', label, x + width / 2, y + height / 2, options.size || 26, options.primary ? 0x1d2a29 : GOLD, { center: true, alpha: enabled ? 1 : 0.5 });
    this.regions.push({ id, x, y, width, height, action, enabled });
  }
  modal(width, height) {
    const { w, h } = this.c.layout, layer = this.begin('overlay'); this.regions = [];
    this.rect(layer, 0, 0, w, h, 0x050e14, 0.9, null, 0);
    const box = { x: (w - width) / 2, y: (h - height) / 2, width, height };
    this.rect(layer, box.x, box.y, width, height, INK, 1, 0x9e966d, 7); return { layer, ...box };
  }
  render() {
    const c = this.c, d = c.data, { w, h } = c.layout;
    if (this.ready && this.lastReady && c.isBlocked() && this.lastVersion === c.version) return;
    this.lastVersion = c.version; this.lastReady = this.ready; this.regions = [];
    this.begin('background'); this.begin('world'); this.begin('hud'); this.begin('overlay');
    this.root.setPosition(-w / 2, h / 2);
    const arena = c.layout.arena;
    this.worldClip.setPosition(arena.x, -arena.y); this.worldClip.getComponent(UITransform).setContentSize(arena.width, arena.height);
    this.layers.world.node.setPosition(-arena.x, arena.y);
    if (!this.ready) {
      const layer = this.layers.hud; this.rect(layer, 0, 0, w, h, 0x101f28);
      this.text(layer, 'loading-title', '开天一念', w / 2, h / 2 - 75, 65, GOLD, { center: true, serif: true });
      this.text(layer, 'loading-progress', this.error || '山河正在苏醒 · ' + Math.round(this.progress * 100) + '%', w / 2, h / 2 + 20, 25, MUTE, { center: true });
      if (this.error) this.button(layer, 'retry-content', '重新载入', w / 2 - 130, h / 2 + 90, 260, 64, () => c.retryAssets(), { primary: true });
      this.finishLayers(); return;
    }
    if (d.view === 'home') this.home(); else this.battle();
    if (d.showIntro) this.intro();
    if (d.showChoice) this.upgrades();
    if (d.showMemory) this.memory();
    if (d.showEnding) this.ending();
    if (d.showArchive) this.archive();
    if (d.showSettings) this.settings();
    this.finishLayers();
    // Entity-specific display nodes are destroyed after leaving the arena, preventing run-length growth.
    const world = this.layers.world;
    for (const [id, node] of world.nodes) if (!world.used.has(id)) { node.destroy(); world.nodes.delete(id); }
  }
  home() {
    const { w, h } = this.c.layout, bg = this.layers.background, layer = this.layers.hud, c = this.c;
    this.image(bg, 'title', this.assets.textures.title, 0, 0, w, h, 0.8, true);
    const veil = this.use(bg, 'home-veil', () => { const n = this.makeNode('home-veil'); n.addComponent(Graphics); return n; });
    const shade = veil.getComponent(Graphics); shade.clear(); shade.fillColor = rgba(0x0a1921, 0.38); shade.rect(0, -h, w, h); shade.fill();
    this.text(layer, 'home-mark', '混沌纪 · 山河未醒', 60, 40, 21, MUTE);
    const x = w * 0.32, y = h * 0.39;
    this.text(layer, 'home-kicker', '天地重归混沌', x, y - 88, 23, 0xc0cebd, { center: true });
    this.text(layer, 'home-title', '开天一念', x, y, 82, GOLD, { center: true, serif: true });
    this.text(layer, 'home-subtitle', '一念开天 · 万物新生', x, y + 83, 25, LIGHT, { center: true });
    this.text(layer, 'home-story', '一道神念于混沌中苏醒。循四象遗迹，找回失落的记忆。', w * 0.095, y + 165, 24, LIGHT, { wrap: w * 0.45 });
    const bx = w * 0.66, bw = w * 0.265;
    this.rect(layer, bx - 28, h * 0.28 - 28, bw + 56, 354, INK, 0.8, 0x4f665b);
    this.button(layer, 'start', '踏入混沌', bx, h * 0.28, bw, 76, () => c.openIntro(), { primary: true, size: 29 });
    this.button(layer, 'archive', '山河手记 · ' + c.data.memoryCount + ' / 4', bx, h * 0.28 + 98, bw, 66, () => { c.setData({ archiveScroll: 0 }); c.openArchive(); });
    this.button(layer, 'home-settings', '设置', bx, h * 0.28 + 186, bw, 66, () => c.openSettings());
    this.text(layer, 'home-version', '御宝战斗 · 新版试玩', bx + bw / 2, h * 0.28 + 289, 19, MUTE, { center: true });
  }
  intro() {
    const c = this.c, width = Math.min(c.layout.w - 100, 1220), panel = this.modal(width, 570), { layer, x, y } = panel;
    this.text(layer, 'intro-kicker', '序章 · 混沌初醒', x + width / 2, y + 44, 21, MUTE, { center: true });
    this.text(layer, 'intro-title', '选择一件至宝', x + width / 2, y + 99, 42, GOLD, { center: true, serif: true });
    this.text(layer, 'intro-story', '远处传来天地崩裂的回声。你忘记了来处，只记得仍有一件事未曾完成。', x + 40, y + 148, 24, LIGHT, { wrap: width - 80 });
    const gap = 24, cardW = (width - 104) / 2;
    c.data.weapons.forEach((weapon, i) => {
      const cx = x + 40 + i * (cardW + gap), cy = y + 225, selected = c.data.selectedWeapon === weapon.id;
      this.rect(layer, cx, cy, cardW, 212, selected ? 0x2d443c : 0x192d34, 1, selected ? GOLD : 0x5a7065);
      this.text(layer, 'weapon-' + i, weapon.name, cx + cardW / 2, cy + 44, 32, GOLD, { center: true, serif: true });
      this.text(layer, 'weapon-desc-' + i, weapon.desc, cx + 20, cy + 87, 23, LIGHT, { wrap: cardW - 40 });
      this.text(layer, 'weapon-state-' + i, selected ? '已选定' : '选择至宝', cx + cardW / 2, cy + 179, 21, MUTE, { center: true });
      this.regions.push({ id: 'weapon-' + weapon.id, x: cx, y: cy, width: cardW, height: 212, action: () => c.selectWeapon({ currentTarget: { dataset: { weapon: weapon.id } } }) });
    });
    this.button(layer, 'intro-back', '返回', x + 40, y + 470, (width - 104) / 2, 62, () => c.closeIntro());
    this.button(layer, 'intro-enter', '循光而行', x + 64 + cardW, y + 470, cardW, 62, () => c.beginGame(), { primary: true });
  }
  battle() {
    const c = this.c, d = c.data, { w, h, arena: a, joystick: joy } = c.layout, bg = this.layers.background, world = this.layers.world, hud = this.layers.hud, g = world.g;
    this.rect(bg, 0, 0, w, h, 0x10202a);
    this.image(bg, 'arena', this.assets.textures['arena' + d.stage], a.x, a.y, a.width, a.height, 0.68, true);
    this.rect(bg, a.x, a.y, a.width, a.height, 0x09171c, 0.15, 0x756f51, 7);
    const point = p => ({ x: a.x + p.x * a.width / 100, y: a.y + p.y * a.height / 100 });
    for (const hazard of c.combat.hazards) drawHazard(this, world, hazard, point);
    const player = point(d.player);
    if (!d.ended && d.weaponId === 'bell') {
      g.lineStyle(d.attackRange * 0.25, GOLD, 0.055); g.drawCircle(player.x, player.y, d.attackRange * 0.875);
      g.lineStyle(1.5, GOLD, 0.25); g.drawCircle(player.x, player.y, d.attackRange);
      g.lineStyle(1, GOLD, 0.15); g.drawCircle(player.x, player.y, d.attackRange * 0.75);
    }
    for (const wave of c.combat.bellWaves) this.bellWave(world, wave, point);
    for (const effect of c.combat.effects) this.drawEffect(world, effect, point);
    for (const volley of c.combat.projectiles) for (const bolt of volley.bolts) {
      const p = point(bolt), dx = bolt.direction.x, dy = bolt.direction.y, trail = Math.min(64, volley.traveled);
      g.lineStyle(10, 0x8bcdd5, 0.14); g.moveTo(p.x - dx * trail, p.y - dy * trail); g.lineTo(p.x, p.y);
      g.lineStyle(3, 0xd5f4df, 0.85); g.moveTo(p.x - dx * trail * 0.7, p.y - dy * trail * 0.7); g.lineTo(p.x + dx * 12, p.y + dy * 12);
      g.lineStyle(1, 0xe9f7d9, 0.9); g.beginFill(0xa9dfd0, 0.8);
      g.drawPolygon([p.x + dx * 24, p.y + dy * 24, p.x - dy * 10 - dx * 12, p.y + dx * 10 - dy * 12, p.x - dx * 4, p.y - dy * 4, p.x + dy * 10 - dx * 12, p.y - dx * 10 - dy * 12]); g.endFill();
    }
    if (d.skillAim && !c.isBlocked()) {
      const q = { x: player.x + d.skillAim.x * 650, y: player.y + d.skillAim.y * 650 };
      this.beam(g, player, q, 100, 0x99e4dc, 0.07);
      g.lineStyle(2, 0xc5f6df, 0.75); g.moveTo(player.x, player.y); g.lineTo(q.x, q.y); g.drawCircle(q.x, q.y, 17);
      this.text(hud, 'aim-help', '拖动调整方向 · 松手裂天', a.x + a.width / 2, a.y + 112, 24, 0xbcead8, { center: true });
    }
    for (const body of c.combat.remnants) drawRemnant(this, world, body, point(body));
    for (const enemy of c.combat.enemies) {
      const p = point(enemy), size = creatureSize(enemy);
      const forming = enemy.spawnTime > 0, solidity = condensationOpacity(enemy);
      if (forming) drawCondensation(this, world, enemy, p, size);
      const hit = clamp(enemy.hitTime / 0.16, 0, 1), punch = Math.sin(hit * Math.PI), direction = enemy.hitDirection || { x: 0, y: 0 };
      const sw = size * (0.85 + solidity * 0.15) * (1 + punch * 0.13), sh = size * (0.8 + solidity * 0.2) * (1 - punch * 0.1), recoil = punch * (enemy.boss ? 2 : 8);
      const texture = enemy.boss ? this.assets.frames.bosses[enemy.bossType - 1][bossFrame(enemy)] : this.assets.frames.enemies[enemyFrame(enemy)];
      // Keep a charging creature facing its locked lane, even if the player
      // crosses behind it during the warning. Only the sprite is mirrored.
      const charging = enemy.kind === 'charger' || enemy.bossType === 2;
      const lane = charging && c.combat.hazards.find(h => h.dash && h.owner === enemy.id && h.age < h.delay + h.duration);
      const flipped = enemy.bossType !== 5 && (lane ? lane.end.x - lane.x : c.player.x - enemy.x) > 0;
      const sprite = this.image(world, 'enemy-' + enemy.id, texture, p.x + (flipped ? sw / 2 : -sw / 2) + direction.x * recoil, p.y - sh / 2 + direction.y * recoil, sw, sh, solidity);
      sprite.node.setScale(flipped ? -1 : 1, 1, 1);
      sprite.tint = hit > 0.5 ? 0xffffff : hit > 0 ? 0xffd39a : enemy.freezeTime > 0 ? 0xb5e4f1 : 0xffffff;
      if (hit > 0.5) { g.lineStyle(2, 0xfff1ce, hit * 0.9); g.drawCircle(p.x, p.y, size * 0.36); }
      if (!enemy.boss) {
        if (enemy.kind !== 'wraith') this.text(world, 'role-' + enemy.id, enemy.trial ? '试炼' : enemy.kind === 'ranged' ? '吞灵' : enemy.kind === 'charger' ? '裂界' : '重兽', p.x, p.y - size / 2 - 14, 20, LIGHT, { center: true });
        if (enemy.hp < enemy.maxHp) { this.rect(world, p.x - 26, p.y + size / 2 - 1, 52, 5, 0x24322f); this.rect(world, p.x - 26, p.y + size / 2 - 1, 52 * Math.max(0, enemy.hp / enemy.maxHp), 5, 0xd18b60); }
      }
      if (enemy.castTime > 0 || enemy.freezeTime > 0) { g.lineStyle(2, enemy.freezeTime > 0 ? 0xade0ef : GOLD, 0.8); g.drawCircle(p.x, p.y, size * 0.45); }
      if (enemy.fractureTime > 0) {
        g.lineStyle(2.5, 0xe7bf7e, 0.9);
        for (const side of [-1, 1]) { g.moveTo(p.x + side * 16, p.y + size * 0.3); g.lineTo(p.x + side * 25, p.y + size * 0.22); g.lineTo(p.x + side * 33, p.y + size * 0.33); }
      }
      if (enemy.burnTime > 0) { g.lineStyle(3, 0xf29358, 0.8); g.drawCircle(p.x, p.y + size * 0.2, size * 0.25); }
      if (enemy.slowTime > 0) { g.lineStyle(2, 0xa3d5e4, 0.8); g.drawEllipse(p.x, p.y + size * 0.3, size * 0.4, size * 0.15); }
    }
    const frame = d.actorFrame, atlas = d.ended && d.won ? this.assets.frames[frame.action || 'idle'] : this.assets.frames.artifact[frame.action || 'idle'], texture = atlas[(ROWS[frame.direction || 'down'] || 0) * 6 + (frame.index || 0)];
    const hero = this.image(world, 'hero', texture, player.x - 96, player.y - 104, 192, 192, d.ended && !d.won ? Math.max(0, 1 - (frame.index || 0) / 5) : d.hurt ? 0.65 : 1);
    if (!d.ended) this.artifact(world, player, d.weaponId, c.combat.time, frame.action === 'attack');
    if (!d.ended) drawPlayerBind(this, world, player, c.combat.rootTime, c.combat.time);
    hero.tint = d.hurt ? 0xffd4a8 : 0xffffff;
    if (d.warded) { g.lineStyle(3, 0xbcdfc8, 0.9); g.drawCircle(player.x, player.y, 68); }
    this.text(hud, 'brand', '开天一念', a.x, 22, 31, GOLD, { bold: true });
    this.text(hud, 'phase', d.phaseName, a.x + 200, 16, 23, GOLD);
    this.text(hud, 'objective', d.objective, a.x + 200, 48, 19, MUTE);
    const menu = c.viewport.menuButton, headerRight = Math.max(w - a.x - a.width, menu && menu.left > 0 && menu.left < c.viewport.windowWidth ? w - menu.left / c.rpxScale + 16 : 0);
    const healthX = w - 400 - headerRight;
    this.text(hud, 'hp', '元气 ' + d.hp + ' / ' + d.maxHp + '     境界 ' + d.level, healthX, 23, 22, LIGHT);
    this.rect(hud, healthX, 66, 270, 6, 0x36423b); this.rect(hud, healthX, 66, 270 * d.hpPct / 100, 6, d.hpPct < 30 ? 0xd27b63 : GOLD);
    this.button(hud, 'pause', '暂停', w - 112 - headerRight, 14, 100, 60, () => c.openSettings(), { size: 24 });
    this.rect(hud, a.x, 84, a.width, 3, 0x263a3e); this.rect(hud, a.x, 84, a.width * d.progress / 100, 3, 0xa3b788);
    this.text(hud, 'stage', d.stageName, a.x + 24, a.y + 18, 23, GOLD);
    if (d.boss) {
      const bw = Math.min(630, a.width * 0.43), bx = a.x + a.width / 2 - bw / 2;
      this.rect(hud, bx, a.y + 13, bw, 72, 0x10232b, 0.94, 0x6f755b);
      this.text(hud, 'boss-name', d.boss.name + ' · ' + d.boss.phase, bx + 14, a.y + 21, 23, GOLD);
      this.text(hud, 'boss-state', d.boss.state, bx + bw * 0.49, a.y + 23, 19, MUTE);
      this.rect(hud, bx + 14, a.y + 67, bw - 28, 5, 0x35443d); this.rect(hud, bx + 14, a.y + 67, (bw - 28) * d.boss.hpPct / 100, 5, 0xcd9d71);
    }
    const buildW = 350, buildX = a.x + a.width - buildW - 240, buildY = a.y + a.height - (d.pathName ? 140 : 112);
    this.rect(hud, buildX, buildY, buildW, d.pathName ? 125 : 99, 0x0c1d25, 0.73);
    this.text(hud, 'build-weapon', d.weaponName + (d.comboName ? ' · ' + d.comboName : ''), buildX + 15, buildY + 8, 24, GOLD);
    this.text(hud, 'build-elements', d.elementName, buildX + 15, buildY + (d.pathName ? 64 : 42), 20, LIGHT);
    if (d.pathName) this.text(hud, 'build-path', d.pathName + (d.warded ? ' · 护体中' : ''), buildX + 15, buildY + 40, 20, MUTE);
    this.text(hud, 'build-stats', d.combatStats, buildX + 15, buildY + (d.pathName ? 92 : 70), 19, MUTE);
    if (!d.ended) {
      this.skillControl(hud);
      g.lineStyle(2, 0xc8cdb8, 0.28); g.beginFill(0x142c30, 0.18); g.drawCircle(joy.x + 100, joy.y + 100, 100); g.endFill();
      g.lineStyle(2, GOLD, 0.45); g.beginFill(0xbacabb, 0.12); g.drawCircle(joy.x + 100 + d.joystick.x, joy.y + 100 + d.joystick.y, 38); g.endFill();
    }
    if (d.message) {
      const tw = Math.min(900, a.width * 0.66), tx = a.x + (a.width - tw) / 2;
      this.rect(hud, tx, a.y + 104, tw, 62, 0x0b1d26, 0.9, 0x6a735c); this.text(hud, 'toast', d.message, tx + tw / 2, a.y + 135, 22, GOLD, { center: true });
    } else if (d.hintsOn) this.text(hud, 'hint', d.boss ? d.boss.hint : d.weaponId === 'bell' ? '让外缘扫过敌群 · 居中回响追击 · 镇界解围' : '左手走位 · 至宝自动攻击 · 右下蓄能技', a.x + a.width / 2, a.y + a.height - 20, 19, MUTE, { center: true });
    this.text(hud, 'xp', '灵气 ' + d.xp + ' / ' + d.xpNeed, a.x, h - 39, 21, MUTE);
    this.rect(hud, a.x + 160, h - 28, a.width - 465, 5, 0x2b3e42); this.rect(hud, a.x + 160, h - 28, (a.width - 465) * d.xpPct / 100, 5, 0xafbf8b);
    this.text(hud, 'kills', '击破 ' + d.kills + '       ' + (d.stage === 5 ? '天道终战' : '四象 ' + d.stage + ' / 4'), a.x + a.width - 280, h - 39, 20, MUTE);
  }
  beam(g, p, q, width, color, alpha) {
    const length = Math.hypot(q.x - p.x, q.y - p.y) || 1, nx = -(q.y - p.y) / length * width / 2, ny = (q.x - p.x) / length * width / 2;
    g.lineStyle(1.5, color, Math.min(0.75, alpha * 3)); g.beginFill(color, alpha);
    g.drawPolygon([p.x + nx, p.y + ny, q.x + nx, q.y + ny, q.x - nx, q.y - ny, p.x - nx, p.y - ny]); g.endFill();
    g.lineStyle(0); g.beginFill(color, alpha); g.drawCircle(p.x, p.y, width / 2); g.drawCircle(q.x, q.y, width / 2); g.endFill();
  }
  drawEffect(layer, effect, point) {
    const g = layer.g, p = point(effect), t = clamp(effect.age / effect.life, 0, 1), life = 1 - t;
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
  artifact(layer, player, weapon, time, casting) {
    const g = layer.g;
    if (weapon === 'bell') {
      const pending = this.c.combat.pendingAttack;
      const charge = pending ? 1 - Math.min(1, pending.remaining / (2 / 12)) : 0;
      const summon = this.c.combat.effects.find(effect => effect.type === 'bell-summon');
      const pulse = summon ? Math.sin(Math.PI * summon.age / summon.life) * 0.1 : 0;
      this.bellBody(layer, player.x + Math.sin(time * 65) * charge * 1.5, player.y - 114 + Math.sin(time * 2.2) * 3, 0.7 + pulse, charge, this.c.data.bellMarks || 0, this.c.data.bellThreshold || 3, 1, time * 1.4);
    } else {
      const x = player.x + 69, y = player.y - 38 + Math.sin(time * 2.5) * 5, glow = casting ? 0.34 : 0.1;
      g.lineStyle(0); g.beginFill(0x9be2d3, glow); g.drawCircle(x, y, casting ? 52 : 36); g.endFill();
      const wave = Math.sin(time * 6) * 6;
      g.lineStyle(3, 0xb9d9b4, 0.95); g.moveTo(x - 23, y - 46); g.lineTo(x - 23, y + 48); g.moveTo(x - 30, y - 37); g.lineTo(x + 31, y - 37);
      g.beginFill(0x427b79, 0.9); g.drawPolygon([x - 21, y - 34, x + 30, y - 28 + wave, x + 24, y + 35 + wave, x + 2, y + 24, x - 19, y + 37]); g.endFill();
      g.lineStyle(2, 0xc8e5bd, 0.9); g.moveTo(x + 3, y - 18); g.lineTo(x + 15, y - 2); g.lineTo(x + 2, y + 16); g.lineTo(x - 8, y); g.lineTo(x + 3, y - 18);
    }
  }
  skillControl(layer) {
    const c = this.c, d = c.data, r = c.layout.skill, g = layer.g, x = r.x + 96, y = r.y + 92, ready = d.skillReady && !c.isBlocked(), color = d.weaponId === 'bell' ? GOLD : 0xb1e4d7;
    g.lineStyle(2, color, ready ? 0.9 : 0.35); g.beginFill(0x102a31, 0.92); g.drawCircle(x, y, 77); g.endFill();
    g.lineStyle(7, color, ready ? 0.95 : 0.65); g.arc(x, y, 84, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, d.energy / 100));
    if (ready) { g.lineStyle(1.5, color, 0.3 + Math.sin(c.combat.time * 4) * 0.14); g.drawCircle(x, y, 92); }
    this.text(layer, 'skill-name', d.skillName, x, y - 13, 35, color, { center: true, serif: true, bold: true });
    this.text(layer, 'skill-charge', ready ? '释放' : d.energy + '%', x, y + 29, 22, ready ? LIGHT : MUTE, { center: true });
    this.text(layer, 'skill-help', d.weaponId === 'banner' && ready ? '拖动瞄准 · 松手释放' : ready ? '点击震退 · 打断施法' : '命中与击破蓄能', x, r.y + 193, 17, MUTE, { center: true });
    this.regions.push({ id: 'skill', type: 'skill', ...r, enabled: ready });
  }
  upgrades() {
    const c = this.c, width = Math.min(c.layout.w - 100, 1450), { layer, x, y } = this.modal(width, 505), cardW = (width - 104) / 3;
    this.text(layer, 'choice-title', '境界 ' + (c.data.level + 1) + ' · 选择提升', x + width / 2, y + 48, 36, GOLD, { center: true, serif: true });
    this.text(layer, 'choice-help', '已暂停 · 选择一项，觉醒后继续战斗', x + width / 2, y + 103, 22, MUTE, { center: true });
    c.data.choices.forEach((choice, i) => {
      const cx = x + 28 + i * (cardW + 24), cy = y + 152;
      this.rect(layer, cx, cy, cardW, 322, 0x20363b, 1, ({ fire: 0xd39a70, water: 0x9bceda, earth: 0xc7b987 })[choice.kind] || 0x8f9a78);
      this.text(layer, 'choice-tag-' + i, choice.tag || '', cx + 20, cy + 16, 20, MUTE);
      this.image(layer, 'choice-icon-' + i, this.assets.textures['upgrade-' + (choice.iconKind || choice.kind)], cx + 20, cy + 57, 54, 54);
      this.text(layer, 'choice-name-' + i, choice.name, cx + 86, cy + 67, 28, GOLD);
      this.text(layer, 'choice-change-' + i, choice.change, cx + 20, cy + 131, 23, GOLD, { wrap: cardW - 40 });
      this.text(layer, 'choice-desc-' + i, choice.desc, cx + 20, cy + 191, 21, LIGHT, { wrap: cardW - 40 });
      if (choice.combo) this.text(layer, 'choice-combo-' + i, choice.combo, cx + 20, cy + 260, 19, 0xa3c9bd, { wrap: cardW - 40 });
      this.regions.push({ id: 'upgrade-' + choice.id, x: cx, y: cy, width: cardW, height: 322, action: () => c.chooseUpgrade({ currentTarget: { dataset: { upgradeId: choice.id, choiceToken: c.data.choiceToken } } }) });
    });
  }
  memory() {
    const c = this.c, d = c.data, width = Math.min(c.layout.w - 100, 1420), { layer, x, y, height } = this.modal(width, 650), artW = width * 0.29, bx = x + artW + 30, bw = width - artW - 60;
    this.image(layer, 'story-art', this.assets.textures['arena' + d.memory.id], x + 2, y + 2, artW - 2, height - 4, 0.87, true);
    this.text(layer, 'memory-art-title', '山\n河\n旧\n忆', x + 45, y + 350, 46, GOLD, { serif: true });
    this.text(layer, 'memory-kicker', d.memory.scene + ' · 记忆已收录', bx, y + 30, 21, MUTE);
    this.text(layer, 'memory-title', d.memory.title, bx, y + 70, 39, GOLD, { serif: true });
    this.text(layer, 'memory-copy', d.memory.copy, bx, y + 141, 24, LIGHT, { wrap: bw, leading: 1.65 });
    if (d.rewardChoices.length) {
      this.text(layer, 'reward-title', d.rewardTitle, bx, y + 328, 23, GOLD);
      d.rewardChoices.forEach((choice, i) => {
        const rw = (bw - 18) / 2, rx = bx + i * (rw + 18), ry = y + 371, selected = d.rewardSelectedId === choice.id;
        this.rect(layer, rx, ry, rw, 156, selected ? 0x354d3e : 0x1a3035, 1, selected ? GOLD : 0x6b8270);
        this.text(layer, 'reward-name-' + i, choice.name, rx + 15, ry + 12, 25, GOLD);
        this.text(layer, 'reward-desc-' + i, choice.desc, rx + 15, ry + 51, 20, LIGHT, { wrap: rw - 30 });
        this.text(layer, 'reward-change-' + i, choice.change, rx + 15, ry + 110, 18, MUTE, { wrap: rw - 30 });
        this.regions.push({ id: 'reward-' + choice.id, x: rx, y: ry, width: rw, height: 156, enabled: !choice.disabled && !d.rewardSelectedId, action: () => c.selectMemoryReward({ currentTarget: { dataset: { reward: choice.id } } }) });
      });
    }
    this.text(layer, 'memory-note', d.rewardChoices.length && !d.rewardSelectedId ? '选择一项，再前往下一境' : '记忆可回看 · 下一境恢复 15 元气', bx, y + 548, 20, MUTE);
    this.button(layer, 'memory-continue', d.nextStageLabel, bx, y + 590, bw, 44, () => c.continueStage(), { primary: true, size: 24, enabled: !d.rewardChoices.length || Boolean(d.rewardSelectedId) });
  }
  ending() {
    const c = this.c, d = c.data, width = Math.min(c.layout.w - 100, 1380), { layer, x, y, height } = this.modal(width, 610), artW = width * 0.29, bx = x + artW + 30, bw = width - artW - 60;
    this.image(layer, 'ending-art', this.assets.textures[d.won ? 'ending' : 'arena5'], x + 2, y + 2, artW - 2, height - 4, 0.85, true);
    this.text(layer, 'ending-kicker', d.won ? '万象初生 · 新纪元' : '混沌再起 · 待重生', bx, y + 30, 21, MUTE);
    this.text(layer, 'ending-title', d.endingTitle, bx, y + 69, 46, GOLD, { serif: true });
    this.text(layer, 'ending-copy', d.endingCopy, bx, y + 151, 24, LIGHT, { wrap: bw });
    this.text(layer, 'ending-facts', '战斗 ' + d.runSummary.timeLabel + '     击破 ' + d.runSummary.kills + '     ' + d.runSummary.result, bx, y + 275, 23, GOLD);
    this.text(layer, 'ending-build', d.runSummary.weaponName + ' · ' + d.runSummary.build, bx, y + 329, 23, MUTE, { wrap: bw });
    this.text(layer, 'ending-report', d.runReport.damage + '\n' + d.runReport.cause, bx, y + 409, 21, MUTE, { wrap: bw });
    this.button(layer, 'ending-home', '返回山河', bx, y + 522, (bw - 20) / 2, 60, () => c.exitToHome());
    this.button(layer, 'ending-restart', '再入混沌', bx + (bw + 20) / 2, y + 522, (bw - 20) / 2, 60, () => c.restart(), { primary: true });
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
      this.text(layer, 'exit-copy', '退出会结束当前这局，并返回主菜单。\n已收录的手记会保留。', x + 40, y + 123, 26, LIGHT, { wrap: 600 });
      this.button(layer, 'exit-cancel', '返回设置', x + 40, y + 257, 285, 65, () => c.cancelExit());
      this.button(layer, 'exit-confirm', '确认退出', x + 355, y + 257, 285, 65, () => c.exitToHome(), { primary: true }); return;
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
      this.button(layer, 'settings-exit', '退出本局', x + 355, y + 505, 285, 64, () => c.requestExit());
    } else this.button(layer, 'settings-close', '完成', x + 40, y + 505, 600, 64, () => c.closeSettings(), { primary: true });
  }
}
