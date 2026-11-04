'use strict';
const { GameObject } = require('@eva/eva.js');
const { Graphics } = require('@eva/plugin-renderer-graphics');
const PIXI = require('pixi.js');
const GOLD = 0xe3c88b, INK = 0x14262d, LIGHT = 0xe4e2ce, MUTE = 0x9fb8ac;
const ROWS = { down: 0, up: 1, left: 2, right: 3 };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

class Presentation {
  constructor(game, controller) {
    this.game = game; this.c = controller; this.ready = false; this.progress = 0; this.layers = {}; this.regions = [];
    for (const name of ['background', 'world', 'hud', 'overlay']) {
      const node = new GameObject(name, { position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, origin: { x: 0, y: 0 } });
      const component = node.addComponent(new Graphics()); game.scene.addChild(node);
      this.layers[name] = { node, g: component.graphics, nodes: new Map(), used: new Set() };
    }
    this.worldMask = new PIXI.Graphics(); this.layers.background.g.addChild(this.worldMask); this.layers.world.g.mask = this.worldMask;
  }
  begin(name) {
    const layer = this.layers[name]; layer.g.clear(); layer.used.clear();
    for (const node of layer.nodes.values()) node.visible = false;
    layer.node.transform.scale.x = this.c.rpxScale; layer.node.transform.scale.y = this.c.rpxScale;
    return layer;
  }
  use(layer, id, make) {
    let node = layer.nodes.get(id);
    if (!node) { node = make(); layer.nodes.set(id, node); layer.g.addChild(node); }
    node.visible = true; layer.used.add(id); return node;
  }
  rect(layer, x, y, w, h, fill = INK, alpha = 1, border = null, radius = 5) {
    const g = layer.g; g.lineStyle(border === null ? 0 : 1.5, border === null ? 0 : border, 0.8);
    g.beginFill(fill, alpha); g.drawRoundedRect(x, y, w, h, radius); g.endFill();
  }
  text(layer, id, value, x, y, size = 24, color = LIGHT, options = {}) {
    const node = this.use(layer, id, () => new PIXI.Text('', {}));
    const style = { fontFamily: options.serif ? 'Songti SC, SimSun, serif' : 'PingFang SC, Noto Sans CJK SC, sans-serif', fontSize: size, fill: color,
      fontWeight: options.bold ? 'bold' : 'normal', lineHeight: size * (options.leading || 1.5), wordWrap: Boolean(options.wrap), wordWrapWidth: options.wrap || 2000, breakWords: true, align: options.center ? 'center' : 'left' };
    const key = JSON.stringify(style); if (node._styleKey !== key) { node.style = style; node._styleKey = key; }
    const content = String(value === undefined || value === null ? '' : value); if (node.text !== content) node.text = content;
    node.anchor.set(options.center ? 0.5 : 0, options.center ? 0.5 : 0); node.position.set(x, y); node.alpha = options.alpha === undefined ? 1 : options.alpha;
    node.mask = options.mask || null; return node;
  }
  mask(layer, id, x, y, w, h) {
    const mask = this.use(layer, id, () => new PIXI.Graphics()); mask.clear(); mask.beginFill(0xffffff); mask.drawRect(x, y, w, h); mask.endFill(); return mask;
  }
  image(layer, id, texture, x, y, w, h, alpha = 1, cover = false) {
    if (!texture) return null;
    const sprite = this.use(layer, id, () => new PIXI.Sprite(texture)); sprite.texture = texture; sprite.alpha = alpha; sprite.tint = 0xffffff;
    if (cover) {
      const scale = Math.max(w / texture.orig.width, h / texture.orig.height);
      sprite.anchor.set(0.5); sprite.position.set(x + w / 2, y + h / 2); sprite.width = texture.orig.width * scale; sprite.height = texture.orig.height * scale;
      sprite.mask = this.mask(layer, id + '-mask', x, y, w, h);
    } else { sprite.anchor.set(0); sprite.position.set(x, y); sprite.width = w; sprite.height = h; sprite.mask = null; }
    return sprite;
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
    const c = this.c, d = c.data, { w, h } = c.layout; this.regions = [];
    this.begin('background'); this.begin('world'); this.begin('hud'); this.begin('overlay');
    this.worldMask.clear(); this.worldMask.beginFill(0xffffff); this.worldMask.drawRect(c.layout.arena.x, c.layout.arena.y, c.layout.arena.width, c.layout.arena.height); this.worldMask.endFill();
    if (!this.ready) {
      const layer = this.layers.hud; this.rect(layer, 0, 0, w, h, 0x101f28);
      this.text(layer, 'loading-title', '开天一念', w / 2, h / 2 - 75, 65, GOLD, { center: true, serif: true });
      this.text(layer, 'loading-progress', this.error || '山河正在苏醒 · ' + Math.round(this.progress * 100) + '%', w / 2, h / 2 + 20, 25, MUTE, { center: true }); return;
    }
    if (d.view === 'home') this.home(); else this.battle();
    if (d.showIntro) this.intro();
    if (d.showChoice) this.upgrades();
    if (d.showMemory) this.memory();
    if (d.showEnding) this.ending();
    if (d.showArchive) this.archive();
    if (d.showSettings) this.settings();
    // Entity-specific display nodes are destroyed after leaving the arena, preventing run-length growth.
    const world = this.layers.world;
    for (const [id, node] of world.nodes) if (!world.used.has(id)) { world.g.removeChild(node); node.destroy({ children: true, texture: false, baseTexture: false }); world.nodes.delete(id); }
  }
  home() {
    const { w, h } = this.c.layout, bg = this.layers.background, layer = this.layers.hud, c = this.c;
    this.image(bg, 'title', this.assets.textures.title, 0, 0, w, h, 0.8, true); this.rect(bg, 0, 0, w, h, 0x0a1921, 0.34, null, 0);
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
    this.text(layer, 'home-version', '东方玄幻 · 动作肉鸽', bx + bw / 2, h * 0.28 + 289, 19, MUTE, { center: true });
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
    for (const hazard of c.combat.hazards) {
      const p = point(hazard), color = ({ root: 0xb5d17c, flame: 0xf5aa6a, tide: 0xa4d9ea, slash: 0xebbc82, order: 0xd4afe4, arcane: 0xc2ace0, lava: 0xd2a169, mud: 0x95c6b1, confluence: 0xb8c49d })[hazard.kind] || GOLD;
      const alpha = hazard.friendly ? 0.13 : hazard.active ? 0.34 : 0.1;
      if (hazard.shape === 'line') {
        const q = point(hazard.end), dx = q.x - p.x, dy = q.y - p.y, length = Math.hypot(dx, dy) || 1, nx = -dy / length * hazard.width / 2, ny = dx / length * hazard.width / 2;
        g.lineStyle(1.5, color, 0.8); g.beginFill(color, alpha); g.drawPolygon([p.x + nx, p.y + ny, q.x + nx, q.y + ny, q.x - nx, q.y - ny, p.x - nx, p.y - ny]); g.endFill();
        g.lineStyle(0); g.beginFill(color, alpha); g.drawCircle(p.x, p.y, hazard.width / 2); g.drawCircle(q.x, q.y, hazard.width / 2); g.endFill();
      } else if (hazard.shape === 'ring') {
        g.lineStyle(hazard.radius - hazard.inner, color, hazard.active ? 0.4 : 0.18); g.drawCircle(p.x, p.y, (hazard.radius + hazard.inner) / 2);
        g.lineStyle(2, color, 0.9); g.drawCircle(p.x, p.y, hazard.radius); g.drawCircle(p.x, p.y, hazard.inner);
      } else {
        g.lineStyle(hazard.active ? 3 : 1.5, color, 0.8); g.beginFill(color, alpha); g.drawCircle(p.x, p.y, hazard.radius); g.endFill();
        if (!hazard.active) for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; g.moveTo(p.x + Math.cos(angle) * hazard.radius * 0.8, p.y + Math.sin(angle) * hazard.radius * 0.8); g.lineTo(p.x + Math.cos(angle) * hazard.radius, p.y + Math.sin(angle) * hazard.radius); }
      }
      const label = hazard.shape === 'line' ? { x: (p.x + point(hazard.end).x) / 2, y: (p.y + point(hazard.end).y) / 2 } : p;
      this.text(world, 'hazard-' + hazard.id, (hazard.friendly ? '+' : '') + hazard.label, label.x, label.y - (hazard.shape === 'ring' ? hazard.radius : 0), 23, color, { center: true });
    }
    const player = point(d.player);
    if (!d.ended) { g.lineStyle(1.5, GOLD, 0.2); g.drawCircle(player.x, player.y, d.attackRange); }
    for (const effect of c.combat.effects) {
      const p = point(effect), life = clamp(1 - effect.age / effect.life, 0, 1), radius = effect.radius * (effect.type === 'impact' ? 0.7 : clamp(effect.age / effect.life * 1.4 + 0.15, 0, 1));
      const color = ({ steam: 0xd6edf0, earth: 0xc8aa7b, 'water-pulse': 0xace1e8, ember: 0xf3a367, ward: 0xb8dcb4 })[effect.type] || GOLD;
      g.lineStyle(effect.type === 'earth' ? 4 : 2, color, life);
      if (effect.type === 'blade') {
        const angle = effect.angle * Math.PI / 180, cone = (effect.cone || 60) * Math.PI / 180;
        g.beginFill(color, life * 0.25); g.moveTo(p.x, p.y); g.arc(p.x, p.y, effect.radius, angle - cone, angle + cone); g.lineTo(p.x, p.y); g.endFill();
      } else { g.drawCircle(p.x, p.y, radius); if (effect.type === 'steam' || effect.type === 'impact') { g.beginFill(color, life * 0.16); g.drawCircle(p.x, p.y, radius * 0.7); g.endFill(); } }
    }
    for (const enemy of c.combat.enemies) {
      const p = point(enemy), size = enemy.boss ? (enemy.bossType === 5 ? 205 : 190) : enemy.kind === 'elite' ? 98 : 78;
      const sprite = this.image(world, 'enemy-' + enemy.id, this.assets.textures[enemy.boss ? 'boss' + enemy.bossType : 'wraith'], p.x - size / 2, p.y - size / 2, size, size);
      sprite.tint = enemy.hitTime > 0 ? 0xffe8b5 : enemy.freezeTime > 0 ? 0xb5e4f1 : enemy.kind === 'ranged' ? 0xa4cce4 : enemy.kind === 'charger' ? 0xe0b58f : 0xffffff;
      if (!enemy.boss) {
        if (enemy.kind === 'ranged') { g.lineStyle(4, 0xa4cce4, 1); g.moveTo(p.x + 32, p.y - 25); g.lineTo(p.x + 40, p.y + 30); g.lineStyle(2); g.drawCircle(p.x + 32, p.y - 29, 7); }
        if (enemy.kind === 'charger') { g.lineStyle(3, 0xe0b58f); g.moveTo(p.x + 27, p.y - 13); g.lineTo(p.x + 47, p.y - 21); g.lineTo(p.x + 35, p.y + 6); }
        if (enemy.kind !== 'wraith') this.text(world, 'role-' + enemy.id, enemy.trial ? '试炼' : enemy.kind === 'ranged' ? '祭徒' : enemy.kind === 'charger' ? '冲锋' : '精英', p.x, p.y - size / 2 - 14, 20, LIGHT, { center: true });
        if (enemy.hp < enemy.maxHp) { this.rect(world, p.x - 26, p.y + size / 2 - 1, 52, 5, 0x24322f); this.rect(world, p.x - 26, p.y + size / 2 - 1, 52 * Math.max(0, enemy.hp / enemy.maxHp), 5, 0xd18b60); }
      }
      if (enemy.castTime > 0 || enemy.freezeTime > 0) { g.lineStyle(2, enemy.freezeTime > 0 ? 0xade0ef : GOLD, 0.8); g.drawCircle(p.x, p.y, size * 0.45); }
      if (enemy.burnTime > 0) { g.lineStyle(3, 0xf29358, 0.8); g.drawCircle(p.x, p.y + size * 0.2, size * 0.25); }
      if (enemy.slowTime > 0) { g.lineStyle(2, 0xa3d5e4, 0.8); g.drawEllipse(p.x, p.y + size * 0.3, size * 0.4, size * 0.15); }
    }
    const frame = d.actorFrame, atlas = this.assets.frames[frame.action || 'idle'], texture = atlas[(ROWS[frame.direction || 'down'] || 0) * 6 + (frame.index || 0)];
    const hero = this.image(world, 'hero', texture, player.x - 96, player.y - 104, 192, 192, d.hurt ? 0.65 : 1);
    hero.tint = d.hurt ? 0xffd4a8 : 0xffffff;
    if (d.warded) { g.lineStyle(3, 0xbcdfc8, 0.9); g.drawCircle(player.x, player.y, 68); }
    this.text(hud, 'brand', '开天一念', a.x, 22, 31, GOLD, { bold: true });
    this.text(hud, 'phase', d.phaseName, a.x + 200, 16, 23, GOLD);
    this.text(hud, 'objective', d.objective, a.x + 200, 48, 19, MUTE);
    const healthX = w - 400 - (w - a.x - a.width);
    this.text(hud, 'hp', '元气 ' + d.hp + ' / ' + d.maxHp + '     境界 ' + d.level, healthX, 23, 22, LIGHT);
    this.rect(hud, healthX, 66, 270, 6, 0x36423b); this.rect(hud, healthX, 66, 270 * d.hpPct / 100, 6, d.hpPct < 30 ? 0xd27b63 : GOLD);
    this.button(hud, 'pause', '暂停', w - 112 - (w - a.x - a.width), 14, 100, 60, () => c.openSettings(), { size: 24 });
    this.rect(hud, a.x, 84, a.width, 3, 0x263a3e); this.rect(hud, a.x, 84, a.width * d.progress / 100, 3, 0xa3b788);
    this.text(hud, 'stage', d.stageName, a.x + 24, a.y + 18, 23, GOLD);
    if (d.boss) {
      const bw = Math.min(630, a.width * 0.43), bx = a.x + a.width / 2 - bw / 2;
      this.rect(hud, bx, a.y + 13, bw, 72, 0x10232b, 0.94, 0x6f755b);
      this.text(hud, 'boss-name', d.boss.name + ' · ' + d.boss.phase, bx + 14, a.y + 21, 23, GOLD);
      this.text(hud, 'boss-state', d.boss.state, bx + bw * 0.49, a.y + 23, 19, MUTE);
      this.rect(hud, bx + 14, a.y + 67, bw - 28, 5, 0x35443d); this.rect(hud, bx + 14, a.y + 67, (bw - 28) * d.boss.hpPct / 100, 5, 0xcd9d71);
    }
    const buildW = 380, buildX = a.x + a.width - buildW - 18, buildY = a.y + a.height - (d.pathName ? 140 : 112);
    this.rect(hud, buildX, buildY, buildW, d.pathName ? 125 : 99, 0x0c1d25, 0.73);
    this.text(hud, 'build-weapon', d.weaponName + (d.comboName ? ' · ' + d.comboName : ''), buildX + 15, buildY + 8, 24, GOLD);
    this.text(hud, 'build-elements', d.elementName, buildX + 15, buildY + (d.pathName ? 64 : 42), 20, LIGHT);
    if (d.pathName) this.text(hud, 'build-path', d.pathName + (d.warded ? ' · 护体中' : ''), buildX + 15, buildY + 40, 20, MUTE);
    this.text(hud, 'build-stats', d.combatStats, buildX + 15, buildY + (d.pathName ? 92 : 70), 19, MUTE);
    if (!d.ended) {
      g.lineStyle(2, 0xc8cdb8, 0.28); g.beginFill(0x142c30, 0.18); g.drawCircle(joy.x + 100, joy.y + 100, 100); g.endFill();
      g.lineStyle(2, GOLD, 0.45); g.beginFill(0xbacabb, 0.12); g.drawCircle(joy.x + 100 + d.joystick.x, joy.y + 100 + d.joystick.y, 38); g.endFill();
    }
    if (d.message) {
      const tw = Math.min(900, a.width * 0.66), tx = a.x + (a.width - tw) / 2;
      this.rect(hud, tx, a.y + 104, tw, 62, 0x0b1d26, 0.9, 0x6a735c); this.text(hud, 'toast', d.message, tx + tw / 2, a.y + 135, 22, GOLD, { center: true });
    } else if (d.hintsOn) this.text(hud, 'hint', d.boss ? d.boss.hint : '左下摇杆移动 · 自动攻击 · 清波可提前推进', a.x + a.width / 2, a.y + a.height - 20, 19, MUTE, { center: true });
    this.text(hud, 'xp', '灵气 ' + d.xp + ' / ' + d.xpNeed, a.x, h - 39, 21, MUTE);
    this.rect(hud, a.x + 160, h - 28, a.width - 465, 5, 0x2b3e42); this.rect(hud, a.x + 160, h - 28, (a.width - 465) * d.xpPct / 100, 5, 0xafbf8b);
    this.text(hud, 'kills', '击破 ' + d.kills + '       ' + (d.stage === 5 ? '天道终战' : '四象 ' + d.stage + ' / 4'), a.x + a.width - 280, h - 39, 20, MUTE);
  }
  upgrades() {
    const c = this.c, width = Math.min(c.layout.w - 100, 1450), { layer, x, y } = this.modal(width, 505), cardW = (width - 104) / 3;
    this.text(layer, 'choice-title', '境界 ' + (c.data.level + 1) + ' · 选择提升', x + width / 2, y + 48, 36, GOLD, { center: true, serif: true });
    this.text(layer, 'choice-help', '已暂停 · 选择一项，觉醒后继续战斗', x + width / 2, y + 103, 22, MUTE, { center: true });
    c.data.choices.forEach((choice, i) => {
      const cx = x + 28 + i * (cardW + 24), cy = y + 152;
      this.rect(layer, cx, cy, cardW, 322, 0x20363b, 1, ({ fire: 0xd39a70, water: 0x9bceda, earth: 0xc7b987 })[choice.kind] || 0x8f9a78);
      this.text(layer, 'choice-tag-' + i, choice.tag || '', cx + 20, cy + 16, 20, MUTE);
      this.image(layer, 'choice-icon-' + i, this.assets.textures['upgrade-' + choice.kind], cx + 20, cy + 57, 54, 54);
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
module.exports = { Presentation };
