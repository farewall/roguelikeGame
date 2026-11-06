'use strict';
// All combat geometry uses short-edge UI units, all clocks use seconds.
// The page only supplies input, renders snapshots, and handles modal pauses.
const { ArtifactCombat } = require('./artifacts');
const { BELL } = require('./bell');
const { VINES, vineRadius } = require('./vines');
const { METEOR, meteorPhase } = require('./meteor');
const { advanceEnemyAnimation } = require('./enemy-animation');
const STAGES = ['东方·初生之野', '西方·白骨战场', '南方·焚天熔界', '北方·归墟寒海', '天道之庭'];
const BOSSES = ['青龙法相', '白虎法相', '朱雀法相', '玄武法相', '天道化身'];
const PLAYER_SPEED = 300; // Short-edge UI units per second on every device.
const WEAPONS = {
  bell: { name: '混沌钟', range: BELL.range, interval: BELL.interval, damage: 3, desc: '扩散钟鸣 · 外缘共鸣增伤，居中回响追击' },
  banner: { name: '盘古幡', range: 360, interval: 1.8, damage: 3.6, desc: '贯穿飞刃 · 远距御敌，拖动裂天定向爆发' }
};
const PATHS = {
  echo: { id: 'echo', weapon: 'bell', name: '万壑回声', desc: '每两次有效钟鸣，从自身中心释放更强更远的回响', change: '回响：三击 → 两击 · 范围 160 → 190' },
  ward: { id: 'ward', weapon: 'bell', name: '玄钟护念', desc: '每三次有效钟鸣获得护体，抵伤后震退身边普通敌人', change: '抵伤40% · 护体持续5秒 · 触发震退' },
  sweep: { id: 'sweep', weapon: 'banner', name: '横扫八荒', desc: '每轮发射五道飞刃，覆盖更宽的敌群', change: '三道飞刃 → 五道飞刃，展开至 80°' },
  rend: { id: 'rend', weapon: 'banner', name: '破劫裂空', desc: '飞刃汇聚为一道，对精英与首领额外造成伤害', change: '凝聚贯穿 · 精英/首领伤害 +30%' }
};
const ELEMENTS = { fire: '离火', water: '坎水', earth: '厚土' };
const ENEMIES = [
  { id: 'wraith', name: '初生浊兽', hint: '混沌初凝，薄皮小体。结群近身，初始至宝即可击散；死后复归混沌。' },
  { id: 'ranged', name: '吞灵囊兽', hint: '宽腹喉囊蓄气，沿预警方向喷吐。锁定后横向离开吐息路线。' },
  { id: 'charger', name: '裂界奔兽', hint: '长肢收拢蓄势，再沿锁定路线扑杀。横移躲开，趁落地停顿反击。' },
  { id: 'elite', name: '镇劫重兽', hint: '厚胸巨爪与肩部骨盾，蓄力引发落点震击。远离预警后再近身，击败得更多灵气。' },
  ...BOSSES.map((name, i) => ({ id: 'boss-' + (i + 1), name,
    hint: ['藤蔓从落点中心向外生长，触及后短暂缠足。提前离开预警；半血后追加环形封路。', '扑杀前出现宽线预警。横向让开，半血后注意二连扑。', '陨火先锁定落点，再砸地爆燃并留下燃烧区。半血后落点更多，避开火区寻找通道。', '潮汐以环形扩散，向内或向外脱离。蓄力护甲结束后集中输出。', '轮换四象招式并以秩序封锁两侧。每次观察形状再寻找空隙。'][i] }))
];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Number(value.toFixed(2));
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

class Combat extends ArtifactCombat {
  constructor(weapon = 'bell', random = Math.random) {
    super();
    this.weapon = Object.keys(WEAPONS).includes(weapon) ? weapon : 'bell'; this.random = random;
    this.width = 1400; this.height = 550;
    this.player = { x: 50, y: 55 }; this.hp = 100; this.maxHp = 100;
    this.power = 1; this.haste = 1; this.elements = { fire: 0, water: 0, earth: 0 };
    this.level = 1; this.xp = 0; this.xpNeed = 5;
    this.stage = 1; this.time = 0; this.kills = 0; this.damageTaken = 0;
    this.enemies = []; this.hazards = []; this.effects = []; this.events = [];
    this.nextId = 0; this.attackCd = 0; this.pendingAttack = null; this.invulnerable = 0; this.attackLock = 0;
    this.ended = false; this.cleared = false; this.lastDamageName = '';
    this.strikeCount = 0; this.followups = []; this.path = ''; this.wardTime = 0;
    this.damageBySource = {}; this.damageByCause = {}; this.eventsTaken = []; this.trialCleared = false;
    this.encounter = null; this.trialPending = false;
    this.startStage();
  }
  configureArena(width, height, scale) {
    if (width > 0 && height > 0 && scale > 0) { this.width = width / scale; this.height = height / scale; }
  }
  point(p) { return { x: p.x * this.width / 100, y: p.y * this.height / 100 }; }
  percent(p) { return { x: p.x / this.width * 100, y: p.y / this.height * 100 }; }
  distance(a, b) { const p = this.point(a), q = this.point(b); return Math.hypot(p.x - q.x, p.y - q.y); }
  vector(a, b) {
    const p = this.point(a), q = this.point(b), d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
  }
  move(entity, direction, distance) {
    if (entity === this.player && this.rootTime > 0) return;
    entity.x = clamp(entity.x + direction.x * distance / this.width * 100, 4, 96);
    entity.y = clamp(entity.y + direction.y * distance / this.height * 100, 8, 92);
  }
  emit(type, extra = {}) { this.events.push({ type, ...extra }); }
  drainEvents() { return this.events.splice(0); }
  effect(type, point, radius = 35, extra = {}) {
    this.effects.push({ id: ++this.nextId, type, x: point.x, y: point.y, radius, age: 0, life: 0.5, ...extra });
    if (this.effects.length > 40) this.effects.shift();
  }
  damage() { return WEAPONS[this.weapon].damage * this.power; }
  interval() { return Math.max(0.52, WEAPONS[this.weapon].interval * this.haste); }
  startStage() {
    this.rootTime = 0; this.rootImmunity = 0; this.rootSourceId = null;
    this.phase = -1; this.phaseTime = 0; this.stageTime = 0; this.climateCd = 9;
    this.enemies = []; this.hazards = []; this.effects = []; this.remnants = []; this.projectiles = []; this.bellWaves = []; this.pendingAttack = null; this.followups = [];
    this.cleared = false; this.attackCd = 0; this.nextWave();
    if (this.trialPending) { const e = this.spawn('elite', true); if (e) e.trial = true; this.trialPending = false; }
  }
  nextWave() {
    this.phase++; this.phaseTime = 0; this.spawnCd = 0; this.waveSpawns = 0;
    this.remaining = [8 + this.stage * 2, 10 + this.stage * 2, 3, 0][this.phase];
    this.emit('wave', { name: this.phaseLabel() });
    if (this.phase === 3) { this.spawn('boss', true); this.emit('boss', { name: BOSSES[this.stage - 1] }); }
  }
  phaseLabel() { return ['一 · 初劫', '二 · 群劫', '三 · 精英', '四 · 守关'][this.phase]; }
  nearest(enemies, origin = this.player) {
    return enemies.reduce((a, b) => !a || this.distance(origin, b) < this.distance(origin, a) - 1e-6 || (Math.abs(this.distance(origin, a) - this.distance(origin, b)) < 1e-6 && b.id < a.id) ? b : a, null);
  }
  choosePath(id) { if (!this.cleared || this.stage !== 1 || this.path || !PATHS[id] || PATHS[id].weapon !== this.weapon) return false; this.path = id; return true; }
  pathChoices() { return Object.values(PATHS).filter(p => p.weapon === this.weapon); }
  coneAngle() { return this.path === 'sweep' ? 80 : this.path === 'rend' ? 40 : 60; }
  createEncounter() {
    if (!this.cleared || this.stage !== 2 || this.encounter) return this.encounter;
    const kind = Math.floor(this.random() * 3);
    const element = Object.keys(ELEMENTS).filter(k => this.elements[k] < 4).sort((a, b) => this.elements[b] - this.elements[a] || a.localeCompare(b))[0];
    const list = [
      { title: '偶遇 · 混沌清泉', choices: [{ id: 'rest', name: '饮泉养元', desc: '恢复 35 元气', change: `元气 ${Math.ceil(this.hp)} → ${Math.ceil(Math.min(this.maxHp, this.hp + 35))}` }, { id: 'focus', name: '凝泉入宝', desc: '放弃恢复，本局至宝伤害提高 10%', change: `伤害 ${round(this.damage())} → ${round(this.damage() * 1.1)}` }] },
      { title: '偶遇 · 圣人残卷', element, choices: [{ id: 'insight', name: element ? ELEMENTS[element] + '感悟' : '参悟道行', desc: element ? '本局该元素提升一重' : '本局至宝伤害提高 10%', change: element ? `${this.elements[element]} → ${this.elements[element] + 1} 重` : '伤害 +10%' }, { id: 'offering', name: '以血问道', desc: '消耗 12 元气，换取本局伤害 +18%', change: '危险选择 · 元气须高于 12', disabled: this.hp <= 12 }] },
      { title: '偶遇 · 执念邀战', choices: [{ id: 'trial', name: '应下试炼', desc: '下一境多一名精英，击败额外得 6 灵气', change: '风险换成长 · 击败另恢复 10 元气' }, { id: 'rest', name: '静心整备', desc: '不接受试炼，恢复 35 元气', change: '稳步前行' }] }
    ];
    this.encounter = { ...list[kind], resolved: false }; return this.encounter;
  }
  resolveEncounter(id) {
    const event = this.encounter;
    if (!this.cleared || this.stage !== 2 || !event || event.resolved) return false;
    const choice = event.choices.find(c => c.id === id); if (!choice || choice.disabled) return false;
    if (id === 'rest') this.hp = Math.min(this.maxHp, this.hp + 35);
    if (id === 'focus') this.power *= 1.1;
    if (id === 'offering') { if (this.hp <= 12) return false; this.hp -= 12; this.power *= 1.18; }
    if (id === 'insight') { if (event.element) this.upgrade(event.element); else this.power *= 1.1; }
    if (id === 'trial') this.trialPending = true;
    event.resolved = true; this.eventsTaken.push(choice.name); return true;
  }
  spawn(kind, forming = false) {
    if (this.enemies.length >= 32 || this.cleared || this.ended) return null;
    const edge = Math.floor(this.random() * 4);
    const p = { x: edge < 2 ? (edge ? 94 : 6) : 15 + this.random() * 70,
      y: edge >= 2 ? (edge === 2 ? 10 : 90) : 20 + this.random() * 60 };
    // Keep newly appearing enemies away from the player's contact radius.
    if (this.distance(p, this.player) < 150) p.x = this.player.x > 50 ? 8 : 92;
    const boss = kind === 'boss';
    const hp = boss ? 65 + this.stage * 18 : (3 + this.stage) * (kind === 'elite' ? 3 : 1);
    const e = { id: ++this.nextId, ...p, kind, boss, bossType: boss ? this.stage : 0, name: boss ? BOSSES[this.stage - 1] : ENEMIES.find(x => x.id === kind).name,
      hp, maxHp: hp, hpPct: 100, speed: boss ? 42 : kind === 'charger' ? 66 : 52,
      cooldown: boss ? 2 : kind === 'ranged' ? 1.3 : 2.5, castTime: 0, recoverTime: 0,
      burnTime: 0, slowTime: 0, freezeTime: 0, hitTime: 0, sequence: 0, phase2: false, chargeHit: false };
    e.spawnDuration = boss ? 0.8 : kind === 'elite' ? 0.5 : 0.3; e.spawnTime = forming ? e.spawnDuration : 0;
    this.enemies.push(e); this.emit('discover', { id: boss ? 'boss-' + this.stage : kind }); return e;
  }
  spawnSwarm(count) {
    // A shared edge and tight formation make the group readable and pierceable.
    // Reserve one entity slot for the next wave's elite or boss.
    const size = Math.min(count, 31 - this.enemies.length);
    let anchor = null, spawned = 0;
    for (let i = 0; i < size; i++) {
      const e = this.spawn('wraith', true); if (!e) break;
      if (!anchor) anchor = { x: e.x, y: e.y };
      const offset = (i - (size - 1) / 2) * 24;
      const p = { x: anchor.x, y: anchor.y };
      if (anchor.x <= 10 || anchor.x >= 90) p.y = clamp(p.y + offset / this.height * 100, 10, 90);
      else p.x = clamp(p.x + offset / this.width * 100, 6, 94);
      if (this.distance(p, this.player) >= 150) Object.assign(e, p);
      e.fodder = true; e.hp = e.maxHp = 1.8 + this.stage * 0.3;
      e.speed = 58 + this.random() * 10;
      spawned++;
    }
    return spawned;
  }
  update(dt, canAttack = true) {
    if (this.ended || this.cleared) return;
    // Bound delayed frames; simulation never jumps through a full warning window.
    dt = clamp(dt, 0, 0.1);
    while (dt > 0.000001 && !this.ended && !this.cleared) { const step = Math.min(0.025, dt); this.step(step, canAttack); dt -= step; }
  }
  advanceRemnants(dt) {
    for (const body of this.remnants) body.age += Math.max(0, dt);
    this.remnants = this.remnants.filter(body => body.age < body.life);
  }
  step(dt, canAttack) {
    this.advanceRemnants(dt);
    this.rootTime = Math.max(0, this.rootTime - dt); this.rootImmunity = Math.max(0, this.rootImmunity - dt);
    if (this.rootSourceId && !this.hazards.some(h => h.id === this.rootSourceId && (h.owner === null || this.enemies.some(e => e.id === h.owner && e.hp > 0)))) this.rootTime = 0;
    if (!this.rootTime) this.rootSourceId = null;
    this.time += dt; this.phaseTime += dt; this.stageTime += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.attackLock = Math.max(0, this.attackLock - dt);
    this.wardTime = Math.max(0, this.wardTime - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.effects.forEach(f => { f.age += dt; }); this.effects = this.effects.filter(f => f.age < f.life);
    this.advanceWaves(dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.collectDeaths(); if (this.cleared) return;
    this.updateHazards(dt);
    if (this.ended) return;
    this.updateArtifacts(dt);
    this.updateFollowups(dt);
    if (this.pendingAttack) {
      this.pendingAttack.remaining -= dt;
      if (this.pendingAttack.remaining <= 0) { const attack = this.pendingAttack; this.pendingAttack = null; this.strike(attack); }
    }
    this.collectDeaths();
    if (this.cleared) return;
    if (!this.pendingAttack && canAttack && this.attackLock <= 0 && this.attackCd <= 0 && this.enemies.length) {
      const reachable = this.enemies.filter(e => e.hp > 0 && !e.spawnTime && this.distance(this.player, e) <= WEAPONS[this.weapon].range + 1e-6);
      if (reachable.length) {
        const target = this.nearest(reachable);
        const direction = this.vector(this.player, target);
        this.pendingAttack = { direction, targetId: target.id, remaining: 2 / 12 }; // Hit on frame 2.
        this.attackCd = this.interval(); this.emit('attack', { direction });
      }
    }
    for (const e of this.enemies) {
      if (e.hp > 0 && !e.spawnTime && this.distance(this.player, e) < (e.boss ? 45 : e.fodder ? 22 : 28)) { this.hurt(e.boss ? 12 : e.kind === 'elite' ? 9 : e.fodder ? 3 : 5, e.name); break; }
    }
    if (this.phase === 2 && this.enemies.length) {
      this.climateCd -= dt;
      if (this.climateCd <= 0) { this.climateCd = 10; this.castPattern(this.stage, null, false); }
    }
    for (const e of this.enemies) {
      const releasing = this.hazards.some(h => h.owner === e.id && h.age >= h.delay && h.age < h.delay + 0.25);
      advanceEnemyAnimation(e, dt, releasing);
    }
  }
  advanceWaves(dt) {
    if (this.phase >= 3) return;
    this.spawnCd -= dt;
    if (this.remaining > 0 && this.spawnCd <= 0 && this.enemies.length < 31) {
      const kind = this.phase === 2 && this.remaining === 3 ? 'elite'
        : this.phase === 0 ? (this.stage > 1 && this.waveSpawns % 3 === 2 ? 'charger' : 'wraith')
        : ['wraith', 'ranged', 'charger'][this.waveSpawns % 3];
      if (kind === 'wraith') {
        this.remaining -= this.spawnSwarm(Math.min(this.remaining, this.stage < 3 ? 5 : 7));
        this.spawnCd = 1.5;
      } else {
        if (this.spawn(kind, true)) this.remaining--;
        this.spawnCd = 0.9;
      }
      this.waveSpawns++;
    }
    if (!this.remaining && (!this.enemies.length || this.phaseTime >= [18, 22, 22][this.phase])) this.nextWave();
  }
  updateEnemy(e, dt) {
    if (e.spawnTime > 0) { e.spawnTime = Math.max(0, e.spawnTime - dt); return; }
    e.hitTime = Math.max(0, e.hitTime - dt);
    e.fractureTime = Math.max(0, (e.fractureTime || 0) - dt);
    e.castTime = Math.max(0, e.castTime - dt); e.recoverTime = Math.max(0, e.recoverTime - dt);
    e.shielded = e.bossType === 4 && e.phase2 && e.castTime > 0;
    const slow = e.slowTime > 0 ? Math.max(0.25, 0.65 - this.elements.water * 0.07) : 1;
    if (e.burnTime > 0) this.deal(e, (e.burnDps || 0) * Math.min(dt, e.burnTime), 'burn', false);
    e.burnTime = Math.max(0, e.burnTime - dt); e.slowTime = Math.max(0, e.slowTime - dt);
    if (e.hp <= 0) return;
    if (e.freezeTime > 0) { e.freezeTime = Math.max(0, e.freezeTime - dt); return; }
    if (e.boss && !e.phase2 && e.hp <= e.maxHp * 0.5) {
      e.phase2 = true; e.cooldown = Math.min(e.cooldown, 0.8); this.emit('boss-phase', { name: e.name });
    }
    e.cooldown -= dt;
    if (e.cooldown <= 0 && !e.castTime && !e.recoverTime) {
      if (e.boss) { this.castPattern(e.bossType, e, e.phase2); e.cooldown = e.phase2 ? 3.5 : 4.5; }
      else if (e.kind === 'ranged') { this.lineAtPlayer(e, 34, 0.85, 0.18, '息', 'arcane', 7); e.castTime = 1.1; e.recoverTime = 1.6; e.cooldown = 3; this.emit('cast', { name: e.name }); }
      else if (e.kind === 'charger') { this.charge(e, false); e.cooldown = 4.4; }
      else if (e.kind === 'elite') { this.circle(this.player, 78, 1, 1.3, '劫', 'arcane', 9, e.id); e.castTime = 1; e.recoverTime = 1.6; e.cooldown = 4; }
    }
    if (!e.castTime && !e.recoverTime && !e.dashing) {
      const d = this.distance(e, this.player), direction = this.vector(e, this.player);
      if (e.kind === 'ranged' && d < 180) this.move(e, direction, -e.speed * slow * dt);
      else if (e.kind !== 'ranged' || d > 260) this.move(e, direction, e.speed * slow * dt);
    }
    e.shielded = e.bossType === 4 && e.phase2 && e.castTime > 0;
  }
  hazard(data) {
    if (this.hazards.length >= 16 && !data.skill) return;
    const hazard = { id: ++this.nextId, age: 0, active: false, damage: 10, owner: null, friendly: false, ...data };
    this.hazards.push(hazard); return hazard;
  }
  circle(point, radius, delay, duration, label, kind, damage = 10, owner = null) {
    this.hazard({ shape: 'circle', x: point.x, y: point.y, radius, delay, duration, label, kind, damage, owner });
  }
  lineAtPlayer(e, width, delay, duration, label, kind, damage, dash = false) {
    const origin = { x: e.x, y: e.y }, start = this.point(origin), direction = this.vector(e, this.player);
    const end = this.percent({ x: start.x + direction.x * Math.max(260, Math.min(800, this.distance(e, this.player) + 130)),
      y: start.y + direction.y * Math.max(260, Math.min(800, this.distance(e, this.player) + 130)) });
    return this.hazard({ shape: 'line', x: origin.x, y: origin.y, end, width, delay, duration, label, kind, damage, owner: e.id, dash });
  }
  charge(e, twice) {
    e.chargeHit = false;
    if (!e.boss) this.emit('cast', { name: e.name });
    const first = this.lineAtPlayer(e, e.boss ? 85 : 52, 0.95, 0.4, '冲', 'slash', e.boss ? 15 : 9, true);
    if (twice && first) this.lineAtPlayer({ ...e, x: clamp(first.end.x, 4, 96), y: clamp(first.end.y, 8, 92) }, 85, 1.95, 0.4, '再', 'slash', 15, true);
    e.castTime = twice ? 2.35 : 1.35; e.recoverTime = e.boss ? (twice ? 3.7 : 2.7) : 1.9;
  }
  castPattern(stage, e, phase2) {
    const owner = e ? e.id : null, center = e || { x: 50, y: 48 };
    if (e) { e.castTime = 1.3; e.recoverTime = 1.9; }
    if (stage === 5) {
      if (e) { e.sequence++; this.castPattern(1 + (e.sequence - 1) % 4, e, phase2); }
      for (const x of [6, 94]) this.hazard({ shape: 'line', x, y: 0, end: { x, y: 100 }, width: phase2 ? 140 : 90, delay: 1.25, duration: 1.4, label: '封', kind: 'order', owner });
    } else if (stage === 1) {
      for (const offset of [-65, 65]) this.circle({ x: clamp(this.player.x + offset / this.width * 100, 10, 90), y: this.player.y }, 66, 1.05, 2.1, '藤', 'root', 9, owner);
      if (phase2) this.hazard({ shape: 'ring', x: center.x, y: center.y, radius: 200, inner: 145, delay: 1.4, duration: 1.3, label: '生', kind: 'root', owner });
    } else if (stage === 2) {
      if (e) this.charge(e, phase2);
      else this.hazard({ shape: 'line', x: 0, y: this.player.y, end: { x: 100, y: this.player.y }, width: 65, delay: 1.1, duration: 0.4, label: '斩', kind: 'slash' });
    } else if (stage === 3) {
      const count = phase2 ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count;
        this.hazard({ shape: 'circle', x: clamp(this.player.x + (i ? Math.cos(angle) * 115 / this.width * 100 : 0), 8, 92), y: clamp(this.player.y + (i ? Math.sin(angle) * 115 / this.height * 100 : 0), 12, 88), radius: 62, delay: 1.1 + i * 0.13, duration: phase2 ? 3.2 : 2.4, label: '陨', kind: 'flame', meteor: true, damage: METEOR.damage, burnDamage: METEOR.burnDamage, owner });
      }
      if (phase2) this.hazard({ shape: 'line', x: 0, y: 50, end: { x: 100, y: 50 }, width: 52, delay: 1.8, duration: 1.1, label: '焚', kind: 'flame', owner });
    } else {
      this.hazard({ shape: 'ring', x: center.x, y: center.y, radius: 225, inner: 150, delay: 1.25, duration: 1.3, label: '潮', kind: 'tide', damage: 10, owner, push: true });
      if (phase2) this.hazard({ shape: 'line', x: 0, y: this.player.y, end: { x: 100, y: this.player.y }, width: 60, delay: 1.6, duration: 1, label: '涌', kind: 'tide', owner, push: true });
    }
    this.emit('cast', { name: e ? e.name : '劫境', pattern: ['藤蔓生长', '扑杀', '陨火坠地', '潮汐扩散', '秩序封锁'][stage - 1] });
  }
  contains(h, point) {
    if (h.shape === 'line') return segmentDistance(this.point(point), this.point(h), this.point(h.end)) <= h.width / 2;
    const d = this.distance(point, h);
    return d <= (h.kind === 'root' && h.age >= h.delay ? vineRadius(h) : h.radius) && (h.shape !== 'ring' || d >= h.inner);
  }
  updateHazards(dt) {
    for (const h of this.hazards) {
      h.age += dt; h.active = h.age >= h.delay;
      if (h.owner !== null && !this.enemies.some(e => e.id === h.owner && e.hp > 0)) continue;
      if (!h.active || h.age > h.delay + h.duration) continue;
      if (h.friendly) {
        for (const enemy of this.enemies) if (enemy.hp > 0 && !enemy.spawnTime && this.contains(h, enemy)) {
          this.deal(enemy, (h.dps || 0) * dt, h.skill ? 'skill' : 'field', false);
          if (h.slow || h.kind === 'mud') enemy.slowTime = Math.max(enemy.slowTime, 0.3);
        }
      } else {
        if (h.dash) {
          const e = this.enemies.find(enemy => enemy.id === h.owner);
          if (e) { const t = clamp((h.age - h.delay) / h.duration, 0, 1); e.x = clamp(h.x + (h.end.x - h.x) * t, 4, 96); e.y = clamp(h.y + (h.end.y - h.y) * t, 8, 92); e.dashing = true; }
        }
        if (this.contains(h, this.player)) {
          if (h.kind === 'root' && !h.boundPlayer && this.invulnerable <= 0 && this.rootImmunity <= 0) {
            this.rootTime = VINES.bind; this.rootImmunity = VINES.immunity; this.rootSourceId = h.id; h.boundPlayer = true; this.emit('rooted');
          }
          if (h.dash) { const owner = this.enemies.find(e => e.id === h.owner); if (owner) owner.chargeHit = true; }
          if (h.meteor) {
            if (meteorPhase(h) === 'impact') {
              if (!h.impactHit) { h.impactHit = true; this.hurt(h.damage, '陨火撞击'); }
            } else this.hurt(h.burnDamage, '余烬焚地');
          } else this.hurt(h.damage, h.label === '息' ? '吞灵吐息' : ({ root: '生息藤蔓', slash: '裂界扑杀', flame: '天火焚地', tide: '归墟潮汐', order: '秩序封锁', arcane: '镇劫震击' }[h.kind] || '劫境法则'));
          if (h.push) this.move(this.player, this.vector(h, this.player), 85 * dt);
        }
      }
    }
    this.hazards = this.hazards.filter(h => h.age < h.delay + h.duration && (h.owner === null || this.enemies.some(e => e.id === h.owner && e.hp > 0)));
    for (const e of this.enemies) e.dashing = this.hazards.some(h => h.dash && h.owner === e.id && h.active);
  }
  hurt(amount, cause) {
    if (this.invulnerable > 0 || this.ended) return;
    if (this.wardTime > 0) { amount *= 0.6; this.wardTime = 0; this.breakBellWard(); }
    amount = Math.min(this.hp, amount);
    this.hp = Math.max(0, this.hp - amount); this.damageTaken += amount; this.lastDamageName = cause;
    this.damageByCause[cause] = (this.damageByCause[cause] || 0) + amount;
    this.invulnerable = 0.9; this.attackLock = 0.38; this.pendingAttack = null;
    this.emit('hurt'); if (!this.hp) { this.ended = true; this.emit('death'); }
  }
  strike(attack) {
    const weapon = WEAPONS[this.weapon], origin = { ...this.player }, damage = this.damage();
    if (this.weapon === 'banner') { this.launchBlades(attack, origin, weapon.range); return; }
    this.lastAimDirection = this.skillDirection(attack.direction);
    this.launchBellWave(origin, { targetId: attack.targetId });
  }
  applyStrike(attack, targets, origin) {
    const weapon = WEAPONS[this.weapon], damage = attack.bellWave ? attack.damage : this.damage(), firstImpact = !attack.registered;
    if (firstImpact) { attack.registered = true; this.strikeCount++; this.gainEnergy(12); this.emit('hit', { weapon: this.weapon }); }
    const levels = attack.bellWave ? attack.elements : this.elements;
    const primary = attack.bellWave ? this.nearest(targets, origin) : targets.find(e => e.id === attack.targetId) || this.nearest(targets, origin);
    const center = { x: primary.x, y: primary.y };
    for (const e of targets) {
      const resonance = attack.bellWave && this.distance(origin, e) >= attack.range * BELL.resonanceStart;
      this.deal(e, damage * (resonance ? BELL.resonanceMultiplier : 1), resonance ? 'resonance' : 'direct'); this.effect(resonance ? 'resonance' : 'impact', e, resonance ? 38 : 25);
      if (attack.bellWave) {
        if (!e.boss) this.move(e, this.vector(origin, e), Math.min(14, Math.max(0, attack.range - this.distance(origin, e) - 3)));
        this.applyBellElements(e, damage, attack.elements);
      } else if (e.fodder) this.move(e, attack.direction, 14);
      if (!attack.bellWave && levels.fire) { e.burnTime = 2 + levels.fire * 0.65; e.burnDps = damage * (0.12 + levels.fire * 0.07); }
      if (!attack.bellWave && levels.water) e.slowTime = 2 + levels.water * 0.55;
    }
    if (!firstImpact) return;
    if (attack.bellWave) this.registerBellHit(attack);
    if (levels.water >= 2 && this.strikeCount % 3 === 0) {
      const radius = weapon.range + 35;
      for (const e of this.enemies) if (e.hp > 0 && !e.spawnTime && this.distance(origin, e) <= radius) {
        this.deal(e, damage * (0.2 + levels.water * 0.08), 'tide');
        e.slowTime = Math.max(e.slowTime, 2.5);
        if (levels.water >= 4) e.freezeTime = Math.max(e.freezeTime, e.boss ? 0.25 : 0.7);
      }
      this.effect('water-pulse', origin, radius);
    }
    if (levels.earth && !attack.bellWave) {
      const radius = 65 + levels.earth * 15;
      for (const e of this.enemies) if (e.hp > 0 && !e.spawnTime && this.distance(center, e) <= radius) {
        this.deal(e, damage * (0.15 + levels.earth * 0.12), 'earth');
        this.move(e, this.vector(origin, e), 8 + levels.earth * 5);
      }
      this.effect('earth', center, radius);
      if (levels.earth >= 2) this.followups.push({ kind: 'aftershock', center, radius, remaining: 0.45, damage: damage * 0.35, freeze: levels.earth >= 4 });
    }
    // Once per attack: overlapping targets cannot multiply a reaction's damage.
    if (levels.fire && levels.water) {
      const radius = 80 + levels.water * 8;
      for (const e of this.enemies) if (e.hp > 0 && !e.spawnTime && this.distance(center, e) <= radius) this.deal(e, damage * (0.4 + levels.fire * 0.1), 'steam');
      this.effect('steam', center, radius);
    }
    if (levels.earth && (levels.fire || levels.water)) {
      const kind = levels.fire && levels.water ? 'confluence' : levels.fire ? 'lava' : 'mud';
      // Refresh one field rather than accumulating unbounded per-hit zones.
      this.hazards = this.hazards.filter(h => !h.friendly || h.skill);
      this.circle(center, 80 + levels.earth * 10, 0, 2, kind === 'confluence' ? '熔沼' : kind === 'lava' ? '熔' : '沼', kind, 0);
      const h = this.hazards[this.hazards.length - 1];
      if (h && h.kind === kind) { h.friendly = true; h.dps = levels.fire ? damage * 0.25 : 0; h.slow = Boolean(levels.water); }
    }
  }
  updateFollowups(dt) {
    for (const f of this.followups) {
      f.remaining -= dt; if (f.remaining > 0) continue;
      if (f.kind === 'dominion') { this.releaseDominion(f); continue; }
      if (f.kind === 'bell-echo') { this.launchBellWave(this.player, { kind: 'echo', range: f.radius, damage: f.damage, elements: f.elements }); continue; }
      if (f.kind === 'rift') { this.resolveRift(f); continue; }
      for (const e of this.enemies) if (e.hp > 0 && !e.spawnTime && this.distance(f.center, e) <= f.radius) {
        this.deal(e, f.damage, f.kind);
        if (f.freeze) e.freezeTime = Math.max(e.freezeTime, e.boss ? 0.2 : 0.55);
      }
      this.effect(f.kind === 'echo' ? 'bell' : 'earth', f.center, f.radius);
    }
    this.followups = this.followups.filter(f => f.remaining > 0);
  }
  deal(e, amount, source = 'direct', flash = true) {
    if (amount <= 0 || e.hp <= 0 || e.spawnTime > 0) return;
    const exposed = e.bossType === 2 && e.castTime <= 0 && e.recoverTime > 0 && !e.chargeHit;
    const multiplier = (e.shielded ? 0.55 : 1) * (exposed ? 1.35 : 1) * (this.path === 'rend' && (e.boss || e.kind === 'elite') ? 1.3 : 1);
    const damage = amount * multiplier * (e.fractureTime > 0 ? 1 + e.fractureStrength : 1), effective = Math.min(e.hp, damage);
    e.hp -= damage; e.lastDamageSource = source; this.damageBySource[source] = (this.damageBySource[source] || 0) + effective;
    if (flash) {
      // Continuous burns/fields do not spam numbers or retrigger the hit pose.
      if (e.hitTime <= 0) {
        this.effect('damage', e, 0, { amount: Math.round(effective * 10) / 10, life: 0.55, heavy: source === 'skill' || source === 'resonance' });
        this.emit('impact');
      }
      e.hitTime = 0.16;
      e.hitDirection = this.vector(this.player, e);
    }
  }
  collectDeaths() {
    const dead = [], processed = new Set();
    // Bounded by the enemy count: chain ignitions award XP exactly once per ID.
    for (;;) {
      const batch = this.enemies.filter(e => e.hp <= 0 && !processed.has(e.id)); if (!batch.length) break;
      for (const e of batch) {
        processed.add(e.id); dead.push(e);
        if ((e.burnTime > 0 || e.lastDamageSource === 'burn') && this.elements.fire >= 2) {
          for (const other of this.enemies) if (other.hp > 0 && !other.spawnTime && this.distance(e, other) <= 115) {
            other.burnTime = Math.max(other.burnTime, 1.8); other.burnDps = Math.max(other.burnDps || 0, (e.burnDps || this.damage() * 0.26) * 0.8);
            if (this.elements.fire >= 4) this.deal(other, this.damage() * 0.6, 'ignite');
          }
          this.effect('ember', e, 115);
        }
      }
    }
    if (!dead.length) return;
    this.enemies = this.enemies.filter(e => e.hp > 0); this.kills += dead.length;
    for (const e of dead) {
      this.xp += e.boss ? 5 : e.kind === 'elite' ? 3 : e.fodder ? 0.5 : 1;
      this.gainEnergy(e.boss ? 12 : e.kind === 'elite' ? 6 : e.fodder ? 1 : 2);
      if (e.trial) { this.xp += 6; this.hp = Math.min(this.maxHp, this.hp + 10); this.trialCleared = true; this.emit('trial-clear'); }
      this.leaveRemnant(e);
      this.hazards = this.hazards.filter(h => h.owner !== e.id);
    }
    if (dead.some(e => e.boss)) {
      for (const e of this.enemies) this.leaveRemnant(e);
      this.cleared = true; this.rootTime = 0; this.rootSourceId = null; this.enemies = []; this.hazards = []; this.projectiles = []; this.bellWaves = []; this.pendingAttack = null; this.followups = [];
      this.emit('stage-clear', { stage: this.stage });
    }
  }
  leaveRemnant(e) {
    this.remnants.push({ id: e.id, kind: e.kind, boss: e.boss, bossType: e.bossType, fodder: e.fodder, x: e.x, y: e.y, hitDirection: e.hitDirection || this.vector(this.player, e), age: 0, life: e.boss ? 1.8 : e.kind === 'elite' ? 1.2 : e.fodder ? 0.65 : 0.9 });
    // Retain boss silhouettes when a screenful of fodder is cleared at once.
    if (this.remnants.length > 28) this.remnants.splice(Math.max(0, this.remnants.findIndex(body => !body.boss)), 1);
  }
  advanceStage() {
    if (!this.cleared || this.stage >= 5) return false;
    this.stage++; this.hp = Math.min(this.maxHp, this.hp + 15); this.player.x = 50; this.player.y = 55;
    this.invulnerable = 1; this.startStage(); return true;
  }
  upgrade(kind) {
    if (!['power', 'haste', 'health', ...Object.keys(ELEMENTS)].includes(kind)) return false;
    if (ELEMENTS[kind] && this.elements[kind] >= 4) return false;
    if (kind === 'haste' && this.interval() <= 0.520001) return false;
    if (kind === 'power') this.power *= 1.25;
    if (kind === 'haste') { this.haste *= 0.82; this.attackCd *= 0.82; }
    if (kind === 'health') { this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 25); }
    if (ELEMENTS[kind]) this.elements[kind]++;
    return true;
  }
  upgradePool() {
    const damage = this.damage(), interval = this.interval();
    return [
      { id: 'power', kind: 'power', name: '开天劲', desc: '至宝伤害提升 25%', change: `伤害 ${round(damage)} → ${round(damage * 1.25)}`, tag: '强化输出' },
      { id: 'haste', kind: 'haste', name: '疾风法', desc: '至宝攻击间隔缩短 18%', change: `间隔 ${interval.toFixed(2)} → ${Math.max(0.52, interval * 0.82).toFixed(2)} 秒`, tag: '更快出招' },
      { id: 'health', kind: 'health', name: '玄黄护体', desc: '恢复 25 元气，生命上限增加 20', change: `上限 ${this.maxHp} → ${this.maxHp + 20}`, tag: '生存补给' },
      ...Object.keys(ELEMENTS).map(kind => {
        const tier = this.elements[kind], next = tier + 1;
        const changes = { fire: `灼烧 ${12 + tier * 7}% → ${12 + next * 7}% / 秒`, water: `减速 ${35 + tier * 7}% → ${35 + next * 7}%`, earth: `震荡半径 ${65 + tier * 15} → ${65 + next * 15}` };
        const descs = { fire: '二重：灼烧击杀传火；四重：传火爆燃', water: '二重：每三击潮涌；四重：潮涌短暂冰封', earth: '二重：追加余震；四重：余震附带震慑' };
        const combos = { fire: this.elements.water && this.elements.earth ? '三元同效：蒸腾 + 熔沼，不丢失减速' : this.elements.water ? '水火 · 蒸腾爆发' : this.elements.earth ? '地火 · 熔流区域' : '可组合：水 → 蒸腾；地 → 熔流', water: this.elements.fire && this.elements.earth ? '三元同效：蒸腾 + 熔沼，不丢失灼烧' : this.elements.fire ? '水火 · 蒸腾爆发' : this.elements.earth ? '地水 · 泥沼控制' : '可组合：火 → 蒸腾；地 → 泥沼', earth: this.elements.fire && this.elements.water ? '三元同效：蒸腾 + 熔沼，灼烧与减速并存' : this.elements.fire ? '地火 · 熔流区域' : this.elements.water ? '地水 · 泥沼控制' : '可组合：火 → 熔流；水 → 泥沼' };
        const milestone = next === 2 ? { fire: '解锁 · 灼烧击杀后传火', water: '解锁 · 每三击释放减速水环', earth: '解锁 · 命中后追加二段余震' }[kind] : next === 4 ? { fire: '解锁 · 传火引发连锁爆燃', water: '解锁 · 潮涌冰封，首领减效', earth: '解锁 · 余震震慑，首领减效' }[kind] : '';
        return { id: kind, kind, name: ELEMENTS[kind] + (tier ? '精进' : '附魔'), desc: milestone || descs[kind], change: tier ? changes[kind] : ({ fire: '解锁灼烧：伤害的 19% / 秒', water: '解锁减速：移动速度降低 42%', earth: '解锁震荡：80 范围伤害与击退' }[kind]), tag: `${tier ? '精进' : '新领悟'} ${tier} → ${next} 重`, combo: combos[kind] };
      })
    ].map(u => {
      if (this.weapon !== 'bell' || !ELEMENTS[u.kind]) return u;
      const tier = this.elements[u.kind];
      u.name = { fire: '焚音', water: '潮鸣', earth: '裂岳' }[u.kind] + (tier ? '精进' : '附魔');
      if (u.kind === 'earth') {
        u.change = `碎甲易伤 ${tier ? 8 + tier * 4 : 0}% → ${12 + tier * 4}%`;
        u.desc = tier === 3 ? '四重：回响命中附带短暂震慑，首领减效' : '波面使敌人碎甲，强化后续回响；二重更持久，四重回响震慑';
      }
      return u;
    }).filter(u => !(ELEMENTS[u.kind] && this.elements[u.kind] >= 4) && !(u.kind === 'haste' && interval <= 0.520001));
  }
  choices() {
    const pool = this.upgradePool(), choices = [];
    const take = list => { if (!list.length) return; const u = list[Math.floor(this.random() * list.length)]; choices.push(u); pool.splice(pool.indexOf(u), 1); };
    take(pool.filter(u => ELEMENTS[u.kind] && this.elements[u.kind] === 0));
    take(pool.filter(u => ELEMENTS[u.kind] && this.elements[u.kind] > 0));
    while (choices.length < 3 && pool.length) take(pool);
    return choices;
  }
  elementLabel() { const names = this.weapon === 'bell' ? { fire: '焚音', water: '潮鸣', earth: '裂岳' } : ELEMENTS; return Object.keys(ELEMENTS).filter(k => this.elements[k]).map(k => names[k] + this.elements[k] + '重').join(' · ') || '未附魔'; }
  buildLabel() { return (this.path ? PATHS[this.path].name + ' · ' : '') + this.elementLabel(); }
  battleReport() {
    const names = { resonance: '外缘共鸣', direct: '直击', burn: '灼烧', field: '区域', earth: '震荡', steam: '蒸腾', tide: '潮涌', echo: '回响', aftershock: '余震', ignite: '爆燃', skill: this.weapon === 'bell' ? '镇界' : '裂天' };
    const total = Object.values(this.damageBySource).reduce((a, b) => a + b, 0);
    const top = Object.entries(this.damageBySource).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, damage]) => names[key] + ' ' + Math.round(damage / (total || 1) * 100) + '%').join(' · ');
    const cause = Object.entries(this.damageByCause).sort((a, b) => b[1] - a[1])[0];
    return { damage: top || '本局尚未造成伤害', cause: cause ? '主要受伤：' + cause[0] : '未受伤', total: Math.round(total), events: this.eventsTaken.join(' · ') };
  }
  snapshot() {
    const boss = this.enemies.find(e => e.boss);
    const exposed = boss && boss.bossType === 2 && boss.castTime <= 0 && boss.recoverTime > 0 && !boss.chargeHit;
    const hint = boss ? ['提前移出藤蔓落点，触及后会缠足', '横向诱导扑空，抓住破绽反打', '火区会持续存在，规划下一次落脚', '躲进潮环内圈，仍须避开水带', '先避两侧封锁，再判断四象招式'][boss.bossType - 1] : '';
    return {
      rooted: this.rootTime > 0, rootTime: round(this.rootTime), hp: Math.ceil(this.hp), maxHp: this.maxHp, hpPct: this.hp / this.maxHp * 100,
      level: this.level, xp: this.xp, xpNeed: this.xpNeed, xpPct: Math.min(100, this.xp / this.xpNeed * 100),
      stage: this.stage, stageName: STAGES[this.stage - 1], phaseName: this.phaseLabel(),
      objective: this.phase === 3 ? '击败' + BOSSES[this.stage - 1] : `剩余 ${this.enemies.length + this.remaining} 敌 · ${Math.max(0, Math.ceil([18, 22, 22][this.phase] - this.phaseTime))}秒后增援`,
      progress: this.cleared ? 100 : Math.floor(Math.min(95, this.phase * 25 + (this.phase === 3 && boss ? (1 - boss.hp / boss.maxHp) * 25 : Math.min(1, this.phaseTime / [18, 22, 22][this.phase]) * 25))),
      enemies: this.enemies.map(e => ({ id: e.id, kind: e.kind, boss: e.boss, bossType: e.bossType, trial: Boolean(e.trial), x: round(e.x), y: round(e.y), hpPct: round(Math.max(0, e.hp / e.maxHp * 100)),
        burnTime: e.burnTime > 0 ? 1 : 0, slowTime: e.slowTime > 0 ? 1 : 0, freezeTime: e.freezeTime > 0 ? 1 : 0, hitTime: e.hitTime > 0 ? 1 : 0, casting: e.castTime > 0, recovering: e.castTime <= 0 && e.recoverTime > 0, shielded: Boolean(e.shielded), exposed: e.bossType === 2 && e.castTime <= 0 && e.recoverTime > 0 && !e.chargeHit })),
      hazards: this.hazards.map(h => {
        const line = h.shape === 'line', a = this.point(h), b = line ? this.point(h.end) : a;
        return { id: h.id, x: line ? (h.x + h.end.x) / 2 : h.x, y: line ? (h.y + h.end.y) / 2 : h.y,
          shape: h.shape, kind: h.kind, label: h.label, active: h.active, friendly: h.friendly,
          width: line ? Math.hypot(b.x - a.x, b.y - a.y) + h.width : h.radius * 2,
          height: line ? h.width : h.radius * 2, border: h.shape === 'ring' ? h.radius - h.inner : 2,
          angle: line ? Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI : 0 };
      }),
      effects: this.effects.map(f => ({ id: f.id, type: f.type, x: f.x, y: f.y, radius: f.radius, angle: f.angle || 0, cone: f.cone || 60 })),
      boss: boss ? { name: boss.name, hpPct: round(Math.max(0, boss.hp / boss.maxHp * 100)), phase: boss.phase2 ? '二阶段' : '一阶段', state: boss.shielded ? '护甲 · 全伤害减免45%' : exposed ? '扑空破绽 · 易伤35%' : boss.castTime > 0 ? '正在蓄力' : boss.recoverTime > 0 ? '收招 · 输出机会' : '游走', hint } : null,
      weaponName: WEAPONS[this.weapon].name, weaponId: this.weapon, attackRange: WEAPONS[this.weapon].range,
      elementName: this.elementLabel(), combatStats: `伤害 ${round(this.damage())} · 间隔 ${this.interval().toFixed(2)}秒`, pathName: this.path ? PATHS[this.path].name : '', warded: this.wardTime > 0,
      comboName: this.elements.fire && this.elements.water && this.elements.earth ? '蒸腾 + 熔沼' : this.elements.fire && this.elements.water ? '水火 · 蒸腾' : this.elements.earth && this.elements.fire ? '地火 · 熔流' : this.elements.earth && this.elements.water ? '地水 · 泥沼' : '',
      bellMarks: this.strikeCount % (this.path === 'echo' ? 2 : 3), bellThreshold: this.path === 'echo' ? 2 : 3,
      energy: Math.floor(this.energy), skillReady: this.energy >= 100 && this.skillCooldown <= 0, skillName: this.weapon === 'bell' ? '镇界' : '裂天', skillUses: this.skillUses,
      kills: this.kills
    };
  }
}
module.exports = { Combat, WEAPONS, STAGES, BOSSES, ELEMENTS, PATHS, PLAYER_SPEED, ENEMIES, segmentDistance };
