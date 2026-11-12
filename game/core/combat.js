'use strict';
// All combat geometry uses short-edge UI units, all clocks use seconds.
// The page only supplies input, renders snapshots, and handles modal pauses.
const { ArtifactCombat } = require('./artifacts');
const { BELL } = require('./bell');
const { SWORDS } = require('./swords');
const { WorldState } = require('./world');
const { VINES, vineRadius } = require('./vines');
const { METEOR, meteorPhase } = require('./meteor');
const { experienceNeed, waveQuota, enemyProfile } = require('./progression');
const { advanceEnemyAnimation } = require('./enemy-animation');
const {canCast,tacticDirection}=require('./enemy-tactics');
const {relicView,chooseRelic,relicDeaths}=require('./world-events');
const {registerPressure}=require('./boss-counterplay');
const { beginBossPattern, advanceBossPattern, startEnrage, advanceEnrage, attackLine, waveBand, sectorAngle, inAngleGap, angleDelta, shellMultiplier } = require('./boss-patterns');
const STAGES = ['东方·初生之野', '西方·白骨战场', '南方·焚天熔界', '北方·归墟寒海', '天道之庭'];
const BOSSES = ['青龙法相', '白虎法相', '朱雀法相', '玄武法相', '天道化身'];
const PLAYER_SPEED = 300; // Short-edge UI units per second on every device.
const WEAPONS = {
  bell: { name: '混沌钟', range: BELL.range, interval: BELL.interval, damage: 3, desc: '扩散钟鸣 · 外缘共鸣增伤，居中回响追击' },
  banner: { name: '盘古幡', range: 360, interval: 1.8, damage: 3.6, desc: '贯穿飞刃 · 远距御敌，拖动裂天定向爆发' },
  swords: { name: '诛仙剑', range: SWORDS.range, interval: SWORDS.interval, damage: SWORDS.damage, desc: '自动御剑 · 追敌掠斩，弧线回剑补漏' }
};
const PATHS = {
  echo: { id: 'echo', weapon: 'bell', name: '万壑回声', desc: '减少回响触发计数，从自身中心释放更强更远的回响', change: '触发计数减少一次 · 回响范围额外扩大20%' },
  ward: { id: 'ward', weapon: 'bell', name: '玄钟护念', desc: '每三次有效钟鸣获得护体，抵伤后震退身边普通敌人', change: '抵伤40% · 护体持续5秒 · 触发震退' },
  sweep: { id: 'sweep', weapon: 'banner', name: '横扫八荒', desc: '基础五道飞刃，刃阵每重再加两道，覆盖更宽的敌群', change: '基础三道 → 五道 · 展开至80° · 保留刃阵加成' },
  rend: { id: 'rend', weapon: 'banner', name: '破劫裂空', desc: '基础飞刃凝为一道窄束，刃阵可增发，对精英与首领增伤', change: '窄束贯穿 · 精英/首领伤害+30% · 保留刃阵与分裂' },
  'sword-roam': { id:'sword-roam',weapon:'swords',name:'游龙御剑',desc:'扩大掠斩弧线，优先穿过密集敌群；单体直击降低14%',change:'掠斩弧度+35% · 旁击增强 · 擅长清群' },
  'sword-hunt': { id:'sword-hunt',weapon:'swords',name:'追魂剑意',desc:'优先追击精英与首领，同轮追击衰减减轻；旁击与覆盖缩小',change:'重复命中35% → 62% · 射程+40 · 直击降低10%' },
  'sword-guard': { id:'sword-guard',weapon:'swords',name:'归锋护身',desc:'回剑从身边穿行，有效剑轮归位后短暂护身；直击降低15%',change:'归位护身1.1秒 · 抵挡一次伤害的35%' }
};
const ELEMENTS = { fire: '离火', water: '坎水', earth: '厚土' };
const ENEMIES = [
  { id: 'wraith', name: '初生浊兽', hint: '混沌初凝，薄皮小体。结群近身，初始至宝即可击散；死后复归混沌。' },
  { id: 'ranged', name: '吞灵囊兽', hint: '宽腹喉囊蓄气，沿预警方向喷吐。锁定后横向离开吐息路线。' },
  { id: 'charger', name: '裂界奔兽', hint: '长肢收拢蓄势，再沿锁定路线扑杀。横移躲开，趁落地停顿反击。' },
  { id: 'elite', name: '镇劫重兽', hint: '厚胸巨爪与肩部骨盾，蓄力引发落点震击。远离预警后再近身，击败得更多灵气。' },
  ...BOSSES.map((name, i) => ({ id: 'boss-' + (i + 1), name,
    hint: ['盘身引出分叉根脉，甩尾前再次蓄势。穿过藤蔓间隙，留意龙身转向。', '伏低身体后扑杀。横移躲开；暴怒后落地重新瞄准，再扑向你的位置。', '振翼后陨火逐次锁定，扇翼推出火浪。沿熄灭的焦痕回转，从火浪缺口穿行。', '缩甲聚水后海浪从本体中心向外推进。穿过浪面缺口，绕向亮起的甲片核心。', '法环聚光后降下敕令，再衔接根脉追扑或陨火重浪。连招结束时法环会暴露。'][i] }))
];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Number(value.toFixed(2));
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

class Combat extends ArtifactCombat {
  constructor(weapon = 'bell', random = Math.random, options = {}) {
    super();
    this.weapon = Object.keys(WEAPONS).includes(weapon) ? weapon : 'bell'; this.random = random;
    this.width = 1400; this.height = 550; this.viewWidth = 1400; this.viewHeight = 550; this.exploration = Boolean(options.exploration); this.world = null;
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
    if (width > 0 && height > 0 && scale > 0) {
      this.viewWidth = width / scale; this.viewHeight = height / scale;
      if (!this.world) { this.width = this.viewWidth; this.height = this.viewHeight; }
    }
  }
  camera() { return this.world ? this.world.camera(this.point(this.player), this.viewWidth, this.viewHeight) : {x:0,y:0,width:this.width,height:this.height}; }
  point(p) { return { x: p.x * this.width / 100, y: p.y * this.height / 100 }; }
  groundPoint(entity) { const p=this.point(entity);if(this.world)p.y+=this.world.footOffset(entity);return p; }
  percent(p) { return { x: p.x / this.width * 100, y: p.y / this.height * 100 }; }
  distance(a, b) { const p = this.point(a), q = this.point(b); return Math.hypot(p.x - q.x, p.y - q.y); }
  vector(a, b) {
    const p = this.point(a), q = this.point(b), d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
  }
  move(entity, direction, distance, bounds) {
    if (entity === this.player && (this.rootTime > 0 || this.enrage)) return;
    if (this.world) { const offset=this.world.footOffset(entity),limits=bounds?{left:bounds.xMin*this.width/100,right:bounds.xMax*this.width/100,top:bounds.yMin*this.height/100+offset,bottom:bounds.yMax*this.height/100+offset}:undefined;
      const p = this.world.move(this.groundPoint(entity), direction.x * distance, direction.y * distance, entity.boss ? 34 : 20,limits);p.y-=offset;Object.assign(entity, this.percent(p)); return; }
    entity.x = clamp(entity.x + direction.x * distance / this.width * 100, 4, 96);
    entity.y = clamp(entity.y + direction.y * distance / this.height * 100, 8, 92);
  }
  emit(type, extra = {}) { this.events.push({ type, ...extra }); }
  drainEvents() { return this.events.splice(0); }
  effect(type, point, radius = 35, extra = {}) {
    this.effects.push({ id: ++this.nextId, type, x: point.x, y: point.y, radius, age: 0, life: 0.5, ...extra });
    if (this.effects.length > 40) this.effects.shift();
  }
  attackRange() { return this.weapon === 'bell' ? this.bellRange() : this.weapon==='swords'?this.swordRange():WEAPONS[this.weapon].range; }
  nextXpNeed() { return experienceNeed(this.level); }
  enemyStats(kind) { return enemyProfile(this.stage, this.phase, this.stageTime, kind); }
  damage() { return WEAPONS[this.weapon].damage * this.power; }
  interval() { return Math.max(0.52, WEAPONS[this.weapon].interval * this.haste); }
  startStage() {
    if (this.exploration) { this.world = new WorldState(this.stage,this.random()); this.width = this.world.width; this.height = this.world.height; Object.assign(this.player, this.percent(this.world.entry)); }
    this.enrage = null;
    this.rootTime = 0; this.rootImmunity = 0; this.rootSourceId = null;
    this.phase = -1; this.phaseTime = 0; this.stageTime = 0;
    this.bossPending=false;
    this.enemies = []; this.hazards = []; this.effects = []; this.remnants = []; this.projectiles = []; this.bellWaves = []; this.pendingAttack = null; this.followups = [];
    this.resetSwords();
    this.cleared = false; this.attackCd = 0; this.nextWave();
    if (this.trialPending) { const e = this.spawn('elite', true); if (e) e.trial = true; this.trialPending = false; }
  }
  nextWave() {
    this.phase++; this.phaseTime = 0; this.spawnCd = 0; this.waveSpawns = 0;
    this.remaining = waveQuota(this.stage, this.phase);
    this.emit('wave', { name: this.phaseLabel() });
    if (this.phase === 3) { const boss=this.spawn('boss',true);this.bossPending=!boss;this.spawnCd=.3;if(boss)this.emit('boss',{name:BOSSES[this.stage-1]}); }
  }
  phaseLabel() { return ['一 · 初劫', '二 · 群劫', '三 · 精英', '四 · 守关'][this.phase]; }
  chooseRelic(id) { return chooseRelic(this,id); }
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
  spawnPoint(kind,fodder=false) {
    if (this.world) return this.world.spawnPoint(this, kind,fodder);
    const margin = kind === 'boss' ? 118 : kind === 'elite' ? 86 : 64;
    const mx = Math.min(38, Math.max(6, margin / this.width * 100));
    const my = Math.min(38, Math.max(12, margin / this.height * 100));
    const gap = kind === 'boss' ? 110 : 60;
    const playerSafe = p => this.distance(p, this.player) >= 150;
    const separation = p => this.enemies.reduce((d, e) => Math.min(d, this.distance(p, e)), Infinity);
    for (let i = 0; i < 18; i++) {
      const p = { x: mx + this.random() * (100 - mx * 2), y: my + this.random() * (100 - my * 2) };
      if (playerSafe(p) && separation(p) >= gap) return p;
    }
    // Bounded fallback also handles a deterministic RNG or a crowded arena.
    // Keep the player exclusion radius even when entity spacing must relax.
    let best = null, score = -1;
    for (let row = 0; row < 7; row++) for (let column = 0; column < 9; column++) {
      const p = { x: mx + column / 8 * (100 - mx * 2), y: my + row / 6 * (100 - my * 2) };
      const d = separation(p);
      if (playerSafe(p) && d > score) { best = p; score = d; }
    }
    return best;
  }
  spawn(kind, forming = false, fodder = false) {
    if (this.enemies.length >= 32 || this.cleared || this.ended) return null;
    const p = this.spawnPoint(kind,fodder); if (!p) return null;
    const boss = kind === 'boss';
    const stats = this.enemyStats(kind), hp = stats.hp;
    const e = { id: ++this.nextId, ...p, kind, boss, bossType: boss ? this.stage : 0, name: boss ? BOSSES[this.stage - 1] : ENEMIES.find(x => x.id === kind).name,
      hp, maxHp: hp, hpPct: 100, damageScale: stats.damageScale, pressure: stats.pressure, speed: (boss ? 42 : kind === 'charger' ? 66 : 52) * stats.speedScale,
      cooldown: boss ? 2 : kind === 'ranged' ? 1.3 : 2.5, castTime: 0, recoverTime: 0,
      burnTime: 0, slowTime: 0, freezeTime: 0, hitTime: 0, sequence: 0, phase2: false, chargeHit: false, fodder };
    e.spawnDuration = boss ? 1.2 : kind === 'elite' ? 0.95 : 0.75; e.spawnTime = forming ? e.spawnDuration : 0;
    this.enemies.push(e); this.emit('discover', { id: boss ? 'boss-' + this.stage : kind }); return e;
  }
  spawnFodder() {
    if (this.enemies.length >= 31) return null;
    const e = this.spawn('wraith', true,true); if (!e) return null;
    e.fodder = true; e.hp = e.maxHp = 1.8 + this.stage * 0.3;
    e.speed = (58 + this.random() * 8) * (1 + (this.stage - 1) * 0.025); return e;
  }
  update(dt, canAttack = true) {
    if (this.ended || this.cleared) return;
    // Bound delayed frames; simulation never jumps through a full warning window.
    dt = clamp(dt, 0, 0.1);
    if (this.enrage) { advanceEnrage(this, dt); return; }
    while (dt > 0.000001 && !this.ended && !this.cleared && !this.enrage) { const step = Math.min(0.025, dt); this.step(step, canAttack); dt -= step; }
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
    if (this.world) this.world.update(this,dt);
    this.advanceWaves(dt);
    for (const e of this.enemies) { this.updateEnemy(e, dt); if (this.enrage) return; }
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
    if (!this.pendingAttack && canAttack && this.attackLock <= 0 && this.attackCd <= 0 && this.enemies.length && (this.weapon !== 'swords' || this.swordCanLaunch())) {
      const reachable = this.weapon === 'swords' ? this.swordTargets() : this.enemies.filter(e => e.hp > 0 && !e.spawnTime && this.distance(this.player, e) <= this.attackRange() + 1e-6);
      if (reachable.length) {
        const target = this.nearest(reachable);
        const direction = this.vector(this.player, target);
        this.pendingAttack = { direction, targetId: target.id, remaining: 2 / 12 }; // Hit on frame 2.
        this.attackCd = this.interval(); this.emit('attack', { direction });
      }
    }
    for (const e of this.enemies) {
      const contact=this.world?Math.hypot(this.groundPoint(this.player).x-this.groundPoint(e).x,this.groundPoint(this.player).y-this.groundPoint(e).y):this.distance(this.player,e);
      if (e.hp > 0 && !e.spawnTime && contact < (e.boss ? 45 : e.fodder ? 22 : 28)) { this.hurt((e.boss ? 12 : e.kind === 'elite' ? 9 : e.fodder ? 3 : 5) * (e.damageScale || 1), e.name); break; }
    }
    // Damage is always announced by a living creature's motion. Ambient level
    // art no longer creates ownerless attacks underneath the player.
    for (const e of this.enemies) {
      const releasing = this.hazards.some(h => h.owner === e.id && h.age >= h.delay && h.age < h.delay + 0.25);
      advanceEnemyAnimation(e, dt, releasing);
    }
  }
  advanceWaves(dt) {
    if(this.phase===3&&this.bossPending){this.spawnCd-=dt;if(this.spawnCd<=0){const boss=this.spawn('boss',true);this.bossPending=!boss;this.spawnCd=.3;if(boss)this.emit('boss',{name:BOSSES[this.stage-1]});}return;}
    if (this.phase >= 3) return;
    this.spawnCd -= dt;
    if (this.remaining > 0 && this.spawnCd <= 0 && this.enemies.length < 31) {
      const kind = this.phase === 2 ? (this.waveSpawns % 4 === 0 ? 'elite' : 'wraith')
        : this.phase === 0 ? (this.stage > 1 && this.waveSpawns % 10 === 9 ? 'charger' : 'wraith')
        : ['wraith', 'wraith', 'wraith', 'wraith', 'ranged', 'wraith', 'wraith', 'wraith', 'wraith', 'charger'][this.waveSpawns % 10];
      const enemy = kind === 'wraith' ? this.spawnFodder() : this.spawn(kind, true);
      if (enemy) {
        this.remaining--; this.waveSpawns++;
        this.spawnCd = this.phase === 2 ? 0.65 : 0.26 - (this.stage - 1) * 0.012 + this.random() * 0.12;
      } else this.spawnCd = 0.15;

    }
    if (!this.remaining && (!this.enemies.length || this.phaseTime >= [18, 22, 22][this.phase])) this.nextWave();
  }
  updateEnemy(e, dt) {
    if (e.spawnTime > 0) { e.spawnTime = Math.max(0, e.spawnTime - dt); return; }
    e.hitTime = Math.max(0, e.hitTime - dt);
    e.staggerVisual=Math.max(0,(e.staggerVisual||0)-dt);e.shellBrokenTime=Math.max(0,(e.shellBrokenTime||0)-dt);
    e.fractureTime = Math.max(0, (e.fractureTime || 0) - dt);
    e.castTime = Math.max(0, e.castTime - dt); e.recoverTime = Math.max(0, e.recoverTime - dt);
    e.shielded = e.bossType === 4 && (Boolean(e.bossPattern) || e.phase2) && e.castTime > 0 && !e.shellBrokenTime;
    const slow = e.slowTime > 0 ? Math.max(0.25, 0.65 - this.elements.water * 0.07) : 1;
    if (e.burnTime > 0) this.deal(e, (e.burnDps || 0) * Math.min(dt, e.burnTime), 'burn', false);
    e.burnTime = Math.max(0, e.burnTime - dt); e.slowTime = Math.max(0, e.slowTime - dt);
    if (e.hp <= 0) return;
    if (e.freezeTime > 0) { e.freezeTime = Math.max(0, e.freezeTime - dt); return; }
    if (e.boss && !e.phase2 && e.hp <= e.maxHp * 0.5) {
      startEnrage(this, e); return;
    }
    advanceBossPattern(this, e, dt);
    e.cooldown -= dt;
    const view = this.world && this.camera(), position = this.world && this.point(e), margin = e.boss ? 64 : 24;
    const visible = !view || position.x >= view.x + margin && position.x <= view.x + view.width - margin && position.y >= view.y + margin && position.y <= view.y + view.height - margin;
    if (visible && e.cooldown <= 0 && !e.castTime && !e.recoverTime && canCast(this,e)) {
      if (e.boss) { this.castPattern(e.bossType, e, e.phase2); e.cooldown = e.phase2 ? 3.5 : 4.5; }
      else if (e.kind === 'ranged') { this.lineAtPlayer(e, 34, 0.95, 0.24, '息', 'arcane', 7); e.castTime = 1.2; e.recoverTime = 1.7; e.cooldown = 3; this.emit('cast', { name: e.name }); }
      else if (e.kind === 'charger') { this.charge(e, false); e.cooldown = 4.4; }
      else if (e.kind === 'elite') { this.hazard({ shape: 'ring', x: e.x, y: e.y, radius: 150, inner: 120, wave: { from: 20, to: 150, width: 30 }, delay: 1.05, duration: 0.55, label: '震', kind: 'arcane', damage: 9, owner: e.id, shockwave: true }); e.castTime = 1.6; e.recoverTime = 2.1; e.cooldown = 4; this.emit('cast', { name: e.name }); }
    }
    if (!e.castTime && !e.recoverTime && !e.dashing) {
      const d = this.distance(e, this.player), direction = this.world ? tacticDirection(this,e) : this.vector(e, this.player);
      if (e.kind === 'ranged' && d < 180 + (this.stage - 1) * 15) this.move(e, direction, -e.speed * slow * dt);
      else if (e.kind !== 'ranged' || d > 260) this.move(e, direction, e.speed * slow * dt);
    }
    e.shielded = e.bossType === 4 && (Boolean(e.bossPattern) || e.phase2) && e.castTime > 0 && !e.shellBrokenTime;
  }
  hazard(data) {
    if (this.hazards.length >= 16 && !data.skill) return;
    const hazard = { id: ++this.nextId, age: 0, active: false, damage: 10, owner: null, friendly: false, ...data };
    if (!hazard.friendly) {
      const owner = this.enemies.find(e => e.id === hazard.owner), scale = owner && owner.damageScale ? owner.damageScale : this.enemyStats('wraith').damageScale;
      hazard.damage *= scale; if (hazard.burnDamage) hazard.burnDamage *= scale;
    }
    this.hazards.push(hazard); return hazard;
  }
  circle(point, radius, delay, duration, label, kind, damage = 10, owner = null) {
    this.hazard({ shape: 'circle', x: point.x, y: point.y, radius, delay, duration, label, kind, damage, owner });
  }
  lineAtPlayer(e, width, delay, duration, label, kind, damage, dash = false) {
    const origin = { x: e.x, y: e.y }, start = this.point(origin), direction = this.vector(e, this.player);
    e.attackAngle = Math.atan2(direction.y, direction.x);
    let end = this.percent({ x: start.x + direction.x * Math.max(260, Math.min(800, this.distance(e, this.player) + 130)),
      y: start.y + direction.y * Math.max(260, Math.min(800, this.distance(e, this.player) + 130)) });
    if (this.world) { const offset=this.world.footOffset(e),goal=this.point(end);goal.y+=offset;const hit=this.world.clip(this.groundPoint(e),goal,dash?34:width*.5,!dash);hit.y-=offset;end=this.percent(hit); }
    return this.hazard({ shape: 'line', x: origin.x, y: origin.y, end, width, delay, duration, label, kind, damage, owner: e.id, dash });
  }
  charge(e, twice) {
    if (e.boss) { beginBossPattern(this, e, 2, twice); return; }
    e.chargeHit = false;
    this.emit('cast', { name: e.name });
    this.lineAtPlayer(e, 52, 0.95, 0.4, '冲', 'slash', 9, true);
    e.castTime = 1.35; e.recoverTime = 1.9;
  }
  castPattern(stage, e, phase2) {
    if (e && e.boss) { beginBossPattern(this, e, stage, phase2); return; }
    // Ownerless forms are retained for isolated geometry fixtures; gameplay
    // dispatches boss-owned action sequences through beginBossPattern above.
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
      for (let i = 0; i < (phase2 ? 3 : 1); i++) this.hazard({ shape: 'ring', x: center.x, y: center.y,
        radius: phase2 ? 390 : 340, inner: 0, wave: { from: 66, to: phase2 ? 390 : 340, width: 42 },
        gapAngle: Math.PI / 2 + (i % 2 ? 0.42 : 0), gapHalf: 0.48,
        delay: 1.15 + i, duration: 1.55, label: '浪', kind: 'tide', damage: 10, owner, push: true });
    }
    this.emit('cast', { name: e ? e.name : '劫境', pattern: ['藤蔓生长', '扑杀', '陨火坠地', '潮汐扩散', '秩序封锁'][stage - 1] });
  }
  contains(h, point) {
    if(h.broken)return false;
    if (h.shape === 'line') {
      const line = h.dash && h.active && h.swept ? h.swept : attackLine(h);
      return segmentDistance(this.point(point), this.point(line), this.point(line.end)) <= h.width / 2;
    }
    const d = this.distance(point, h);
    const p = this.point(point), origin = this.point(h);
    if (h.shape === 'sector') return d >= (h.inner || 0) && d <= h.radius && Math.abs(angleDelta(Math.atan2(p.y - origin.y, p.x - origin.x), sectorAngle(h))) <= (h.sweep ? 0.24 : h.halfAngle);
    if (h.shape === 'ring') {
      const band = waveBand(h);
      if (h.kind === 'root' && h.age >= h.delay) band.radius = vineRadius(h);
      return d <= band.radius && d >= band.inner && !inAngleGap(h, p.x - origin.x, p.y - origin.y);
    }
    return d <= (h.kind === 'root' && h.age >= h.delay ? vineRadius(h) : h.radius);
  }
  updateHazards(dt) {
    for (const h of this.hazards) {
      if(h.broken)continue;
      const previousAge = h.age; h.age += dt; h.active = h.age >= h.delay;
      if (h.owner !== null && !this.enemies.some(e => e.id === h.owner && e.hp > 0)) continue;
      if (!h.active) continue;
      if (h.dash) {
        const e = this.enemies.find(enemy => enemy.id === h.owner);
        const at = age => { const t = clamp((age - h.delay) / h.duration, 0, 1), p = { x: h.x + (h.end.x - h.x) * t, y: h.y + (h.end.y - h.y) * t };
          if (!this.world) { p.x = clamp(p.x, 4, 96); p.y = clamp(p.y, 8, 92); } return p; };
        const previous = at(previousAge), current = at(h.age); h.swept = { ...previous, end: current };
        if (e) { e.x = current.x; e.y = current.y; e.dashing = h.age < h.delay + h.duration; }
      }
      if (h.age > h.delay + h.duration + 1e-6 && (!h.dash || previousAge >= h.delay + h.duration)) continue;
      if (h.friendly) {
        for (const enemy of this.enemies) if (enemy.hp > 0 && !enemy.spawnTime && this.contains(h, enemy)) {
          this.deal(enemy, (h.dps || 0) * dt, h.skill ? 'skill' : 'field', false);
          if (h.slow || h.kind === 'mud') enemy.slowTime = Math.max(enemy.slowTime, 0.3);
        }
      } else {
        if (this.contains(h, this.player)) {
          if (h.kind === 'root' && !h.boundPlayer && this.invulnerable <= 0 && this.rootImmunity <= 0) {
            this.rootTime = VINES.bind; this.rootImmunity = VINES.immunity; this.rootSourceId = h.id; h.boundPlayer = true; this.emit('rooted');
          }
          if (h.dash) { const owner = this.enemies.find(e => e.id === h.owner); if (owner) owner.chargeHit = true; }
          if (h.meteor) {
            if (meteorPhase(h) === 'impact') {
              if (!h.impactHit) { h.impactHit = true; this.hurt(h.damage, '陨火撞击'); }
            } else this.hurt(h.burnDamage, '余烬焚地');
          } else this.hurt(h.damage, h.label === '息' ? '吞灵吐息' : ({ root: '生息藤蔓', slash: '裂界扑杀', tail: '盘龙扫尾', flame: '天火焚地', tide: '归墟潮汐', order: '敕令裁决', arcane: '镇劫震击' }[h.kind] || '劫境法则'));
          if (h.push) this.move(this.player, this.vector(h, this.player), 85 * dt);
        }
      }
    }
    this.hazards = this.hazards.filter(h => !h.broken && h.age < h.delay + h.duration && (h.owner === null || this.enemies.some(e => e.id === h.owner && e.hp > 0)));
    for (const e of this.enemies) e.dashing = this.hazards.some(h => h.dash && h.owner === e.id && h.active);
  }
  hurt(amount, cause) {
    if (this.invulnerable > 0 || this.ended || this.enrage) return;
    if (this.wardTime > 0) { amount *= 0.6; this.wardTime = 0; this.breakBellWard(); }
    if(this.swordGuardTime>0){amount*=.65;this.swordGuardTime=0;this.effect('sword-ward',this.player,58,{life:.35});}
    amount = Math.min(this.hp, amount);
    this.hp = Math.max(0, this.hp - amount); this.damageTaken += amount; this.lastDamageName = cause;
    this.damageByCause[cause] = (this.damageByCause[cause] || 0) + amount;
    this.invulnerable = 0.9; this.attackLock = 0.38; this.pendingAttack = null;
    this.emit('hurt'); if (!this.hp) { this.ended = true; this.emit('death'); }
  }
  strike(attack) {
    const weapon = WEAPONS[this.weapon], origin = { ...this.player }, damage = this.damage();
    if (this.weapon === 'banner') { this.launchBlades(attack, origin, weapon.range); return; }
    if (this.weapon === 'swords') { return this.launchSwordRound(attack); }
    this.lastAimDirection = this.skillDirection(attack.direction);
    this.launchBellWave(origin, { targetId: attack.targetId });
  }
  applyStrike(attack, targets, origin) {
    const weapon = WEAPONS[this.weapon], damage = attack.bellWave || attack.bannerVolley || attack.swordVolley ? attack.damage : this.damage(), firstImpact = !attack.registered;
    if (firstImpact) { attack.registered = true; this.strikeCount++; this.gainEnergy(12); this.emit('hit', { weapon: this.weapon }); }
    const levels = attack.bellWave || attack.bannerVolley || attack.swordVolley ? attack.elements : this.elements;
    const primary = attack.bellWave ? this.nearest(targets, origin) : targets.find(e => e.id === attack.targetId) || this.nearest(targets, origin);
    const center = { x: primary.x, y: primary.y };
    for (const e of targets) {
      const resonance = attack.bellWave && this.distance(origin, e) >= attack.range * (attack.resonanceStart ?? BELL.resonanceStart);
      this.deal(e, damage * (resonance ? (attack.resonanceMultiplier ?? BELL.resonanceMultiplier) : 1), resonance ? 'resonance' : attack.split ? 'split' : attack.swordReturn ? 'sword-return' : 'direct'); this.effect(resonance ? 'resonance' : 'impact', e, resonance ? 38 : 25);
      if (attack.bellWave) {
        if (!e.boss) this.move(e, this.vector(origin, e), Math.min(14, Math.max(0, attack.range - this.distance(origin, e) - 3)));
        this.applyBellElements(e, damage * (resonance ? (attack.resonanceMultiplier ?? BELL.resonanceMultiplier) : 1), attack.elements);
      } else if (e.fodder) this.move(e, attack.direction, 14);
      if (!attack.bellWave && levels.fire) { e.burnTime = Math.max(e.burnTime || 0, 2 + levels.fire * 0.65); e.burnDps = Math.max(e.burnDps || 0, damage * (0.12 + levels.fire * 0.07)); }
      if (!attack.bellWave && levels.water) e.slowTime = 2 + levels.water * 0.55;
    }
    if (!firstImpact) return;
    if (attack.bellWave) this.registerBellHit(attack);
    if (levels.water >= 2 && this.strikeCount % 3 === 0) {
      const radius = (attack.bellWave ? attack.range : weapon.range) + 35;
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
    const multiplier = shellMultiplier(this, e) * (exposed ? 1.35 : 1) * (this.path === 'rend' && (e.boss || e.kind === 'elite') ? 1.3 : 1);
    const damage = amount * multiplier * (e.fractureTime > 0 ? 1 + e.fractureStrength : 1), effective = Math.min(e.hp, damage);
    e.hp -= damage; e.lastDamageSource = source; this.damageBySource[source] = (this.damageBySource[source] || 0) + effective;
    if(e.hp>0)registerPressure(this,e,effective,source);
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
    if(this.world)relicDeaths(this,dead);
    if (dead.some(e => e.boss)) {
      for (const e of this.enemies) this.leaveRemnant(e);
      this.cleared = true; this.enrage = null; this.rootTime = 0; this.rootSourceId = null; this.enemies = []; this.hazards = []; this.projectiles = []; this.bellWaves = []; this.resetSwords(); this.pendingAttack = null; this.followups = [];
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
    if (['sword-reach','sword-edge','sword-return'].includes(kind)) {
      const key=kind.slice(6);if(this.weapon!=='swords'||this.swordUpgrades[key]>=3)return false;this.swordUpgrades[key]++;return true;
    }
    if (['blades', 'split'].includes(kind)) {
      if (this.weapon !== 'banner' || this.bannerUpgrades[kind] >= 3) return false;
      this.bannerUpgrades[kind]++; return true;
    }
    if (['range', 'echo', 'resonance'].includes(kind)) {
      if (this.weapon !== 'bell' || this.bellUpgrades[kind] >= 3) return false;
      this.bellUpgrades[kind]++; return true;
    }
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
    const swordOptions=this.weapon!=='swords'?[]:[
      {id:'sword-reach',kind:'sword-reach',iconKind:'haste',name:'御剑通灵',desc:'飞剑追敌更远、更快转入出剑；始终保留四把实体剑',change:`射程 ${this.swordRange()} → ${this.swordRange()+30} · 飞行速度+10%`,tag:'追敌更灵动'},
      {id:'sword-edge',kind:'sword-edge',iconKind:'power',name:'游刃掠斩',desc:'扩大剑锋实际掠过的弧线，增强旁击，覆盖身侧敌人',change:`掠斩半径 ${42+this.swordUpgrades.edge*7} → ${49+this.swordUpgrades.edge*7} · 旁击+8个百分点`,tag:'扩大实体掠斩'},
      {id:'sword-return',kind:'sword-return',iconKind:'water',name:'回锋补漏',desc:'强化弧线回剑对沿途漏网敌人的伤害，不重复命中去程目标',change:`回剑倍率 ${Math.round((.5+this.swordUpgrades.return*.15)*100)}% → ${Math.round((.65+this.swordUpgrades.return*.15)*100)}%`,tag:'强化回剑'}
    ].filter(u=>this.swordUpgrades[u.kind.slice(6)]<3).map(u=>({...u,tag:u.tag+` ${this.swordUpgrades[u.kind.slice(6)]} → ${this.swordUpgrades[u.kind.slice(6)]+1}重`}));
    const bannerOptions = this.weapon !== 'banner' ? [] : [
      { id: 'blades', kind: 'blades', name: '混沌刃阵', iconKind: 'haste', desc: '每轮多发两道母刃，扩大覆盖；同轮母刃对同一敌人只命中一次', change: `发射数量 ${this.bladeCount()} → ${this.bladeCount(this.bannerUpgrades.blades + 1)}道`, tag: '增加刃数' },
      { id: 'split', kind: 'split', name: '裂刃衍生', iconKind: 'power', desc: '每道母刃首次命中实体敌人时分裂，母刃继续贯穿；子刃不再分裂', change: `分裂 ${this.splitStats().count} → ${this.splitStats(this.bannerUpgrades.split + 1).count}道 · 子刃伤害${Math.round(this.splitStats(this.bannerUpgrades.split + 1).multiplier * 100)}%`, tag: '命中分裂' }
    ].filter(u => this.bannerUpgrades[u.kind] < 3).map(u => ({ ...u, tag: u.tag + ` ${this.bannerUpgrades[u.kind]} → ${this.bannerUpgrades[u.kind] + 1}重` }));
    const bellOptions = this.weapon !== 'bell' ? [] : [
      { id: 'range', kind: 'range', name: '钟域扩张', iconKind: 'water', desc: '扩大普攻、回响与外缘共鸣覆盖；最多三重', change: `音波半径 ${round(this.bellRange())} → ${round(this.bellRange() * 1.15)}`, tag: '更远清群' },
      { id: 'echo', kind: 'echo', name: '叠浪回声', iconKind: 'haste', desc: '二重减少触发计数，三重追加半威力二次回响', change: this.bellUpgrades.echo === 1 ? '触发计数减少1次 · 回响伤害+10个百分点' : this.bellUpgrades.echo === 2 ? '追加半威力回响 · 回响伤害+10个百分点' : '回响伤害+10个百分点 · 蓄势缩短0.04秒', tag: '强化回响' },
      { id: 'resonance', kind: 'resonance', name: '洪钟共振', iconKind: 'power', desc: '提高外缘增伤并拓宽共鸣带，保持距离反打', change: `共鸣倍率 ${round(1.3 + this.bellUpgrades.resonance * 0.15)} → ${round(1.45 + this.bellUpgrades.resonance * 0.15)} · 共鸣带加宽5%`, tag: '强化外缘' }
    ].filter(u => this.bellUpgrades[u.kind] < 3).map(u => ({ ...u, tag: u.tag + ` ${this.bellUpgrades[u.kind]} → ${this.bellUpgrades[u.kind] + 1}重` }));
    return [
      ...bellOptions, ...bannerOptions, ...swordOptions,
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
    const take = list => { if (!list.length || choices.length >= 3) return; const u = list[Math.floor(this.random() * list.length)]; choices.push(u); pool.splice(pool.indexOf(u), 1); };
    // Weapon mechanics, base stats and elements each get a real opportunity;
    // a growing weapon pool must not squeeze damage/haste/health out of offers.
    if (this.weapon === 'bell') take(pool.filter(u => ['range', 'echo', 'resonance'].includes(u.kind) && (this.level === 1 && !this.bellUpgrades.range ? u.kind === 'range' : true)));
    if (this.weapon === 'banner') take(pool.filter(u => ['blades', 'split'].includes(u.kind) && (this.level === 1 && !this.bannerUpgrades.blades ? u.kind === 'blades' : this.level === 2 && !this.bannerUpgrades.split ? u.kind === 'split' : true)));
    if (this.weapon === 'swords') take(pool.filter(u=>u.kind.startsWith('sword-')&&(this.level===1&&!this.swordUpgrades.reach?u.kind==='sword-reach':true)));
    take(pool.filter(u => this.hp <= this.maxHp * 0.55 ? u.kind === 'health' : ['power', 'haste'].includes(u.kind) || u.kind === 'health' && this.level % 4 === 0));
    take(pool.filter(u => ELEMENTS[u.kind] && (this.weapon === 'bell' || this.elements[u.kind] === 0)));
    if (this.weapon !== 'bell') take(pool.filter(u => ELEMENTS[u.kind] && this.elements[u.kind] > 0));
    while (choices.length < 3 && pool.length) take(pool);
    return choices;
  }
  elementLabel() { const names = this.weapon === 'bell' ? { fire: '焚音', water: '潮鸣', earth: '裂岳' } : ELEMENTS; return Object.keys(ELEMENTS).filter(k => this.elements[k]).map(k => names[k] + this.elements[k] + '重').join(' · ') || '未附魔'; }
  buildLabel() { const weapon = this.weapon === 'bell' ? this.bellLabel() : this.weapon === 'banner' ? this.bannerLabel() : this.swordLabel()+' · 自动御剑'; return (this.path ? PATHS[this.path].name + ' · ' : '') + (weapon ? weapon + ' · ' : '') + this.elementLabel(); }
  battleReport() {
    const names = { 'sword-return': '回剑', resonance: '外缘共鸣', direct: '直击', split: '裂刃', burn: '灼烧', field: '区域', earth: '震荡', steam: '蒸腾', tide: '潮涌', echo: '回响', aftershock: '余震', ignite: '爆燃', skill: this.weapon === 'bell' ? '镇界' : this.weapon === 'swords' ? '诛仙' : '裂天' };
    const total = Object.values(this.damageBySource).reduce((a, b) => a + b, 0);
    const top = Object.entries(this.damageBySource).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, damage]) => names[key] + ' ' + Math.round(damage / (total || 1) * 100) + '%').join(' · ');
    const cause = Object.entries(this.damageByCause).sort((a, b) => b[1] - a[1])[0];
    return { damage: top || '本局尚未造成伤害', cause: cause ? '主要受伤：' + cause[0] : '未受伤', total: Math.round(total), events: this.eventsTaken.join(' · ') };
  }
  snapshot() {
    const boss = this.enemies.find(e => e.boss);
    const exposed = boss && boss.bossType === 2 && boss.castTime <= 0 && boss.recoverTime > 0 && !boss.chargeHit;
    const hint = boss ? ['盘身后根脉分叉 · 甩尾前离开龙首朝向', '伏身后横移 · 落地转向后会再扑', '抬翼陨火 · 从火浪缺口穿行', '缩甲后向外发浪 · 绕向发亮甲片', '结印后敕令落下 · 连招结束时反击'][boss.bossType - 1] : '';
    return {
      world: this.world ? { name:this.world.name, region:this.world.regionAt(this.point(this.player)), explored:this.world.explored, sites:this.world.sites.length, width:this.width, height:this.height } : null,
      worldRelic:relicView(this),
      bossTransition: this.enrage ? { ...this.enrage } : null,
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
      boss: boss ? { name: boss.name, hpPct: round(Math.max(0, boss.hp / boss.maxHp * 100)), phase: boss.phase2 ? '暴怒' : '一阶段', state: this.enrage ? '法相暴怒' : boss.shellBrokenTime>0?'甲片崩开 · 输出机会':boss.pressureBroken&&boss.attackType==='roots'?'断根 · 缺口已开':boss.shielded ? '缩甲聚海 · 绕侧开甲' : exposed ? '扑空破绽 · 易伤35%' : boss.castTime > 0 ? boss.attackName || '正在蓄势' : boss.recoverTime > 0 ? '收招 · 输出机会' : '游走', hint } : null,
      weaponName: WEAPONS[this.weapon].name, weaponId: this.weapon, attackRange: this.attackRange(), bellUpgradeLabel: this.bellLabel(),
      bannerUpgradeLabel: this.weapon === 'banner' ? this.bannerLabel() : '', bladeCount: this.weapon === 'banner' ? this.bladeCount() : 0, splitCount: this.weapon === 'banner' ? this.splitStats().count : 0,
      swordLabel: this.weapon === 'swords' ? this.swordLabel()+' · '+(this.swordGuardTime>0?'回锋护身':this.swordSkill ? this.swordSkill.mode === 'single' ? '四向围杀' : '交错清场' : '自动御剑') : '',
      elementName: this.elementLabel(), combatStats: `范围 ${Math.round(this.attackRange())} · 伤害 ${round(this.damage())} · ${this.interval().toFixed(2)}秒`, pathName: this.path ? PATHS[this.path].name : '', warded: this.wardTime > 0,
      comboName: this.elements.fire && this.elements.water && this.elements.earth ? '蒸腾 + 熔沼' : this.elements.fire && this.elements.water ? '水火 · 蒸腾' : this.elements.earth && this.elements.fire ? '地火 · 熔流' : this.elements.earth && this.elements.water ? '地水 · 泥沼' : '',
      bellMarks: this.strikeCount % this.bellThreshold(), bellThreshold: this.bellThreshold(),
      energy: Math.floor(this.energy), skillReady: this.energy >= 100 && this.skillCooldown <= 0, skillName: this.weapon === 'bell' ? '镇界' : this.weapon === 'swords' ? '诛仙' : '裂天', skillUses: this.skillUses,
      kills: this.kills
    };
  }
}
module.exports = { Combat, WEAPONS, STAGES, BOSSES, ELEMENTS, PATHS, PLAYER_SPEED, ENEMIES, segmentDistance };
