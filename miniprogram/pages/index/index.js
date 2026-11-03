const STAGES = ['东方·初生之野', '西方·白骨战场', '南方·焚天熔界', '北方·归墟寒海', '天道之庭'];
const BOSS_GLYPHS = ['龙', '虎', '凰', '玄', '道'];
const MEMORIES = ['记忆闪回：女娲造人，人间初生，山川间生机盎然。', '记忆闪回：文明兴起，争斗由资源冲突逐渐升级。', '记忆闪回：圣人交战，至宝碰撞，天地根基崩坏。', '记忆闪回：万物归于混沌。你想起了自己是盘古留下的神念。'];
const MOVE_SPEED = 180; // Screen pixels per second, independent of touch event frequency.
const JOYSTICK_RADIUS_RPX = 64;
const ATTACK_RANGE_RPX = 160;
const { PanguAnimation } = require('../../lib/pangu-animation');
const { GameAudio } = require('../../lib/game-audio');
const SETTINGS_KEY = 'pangu.settings.v1';
const ACTOR_SHEETS = ['idle', 'move', 'attack', 'hurt', 'awaken', 'death'];
const DIRECTION_ROW = { down: 0, up: 1, left: 2, right: 3 };
const ACTOR_FRAME_SIZE = 192; // Short-edge UI units; each packed source cell is 128 px.
const UPGRADES = [
  { id: 'power', icon: '⚡', name: '开天劲', desc: '至宝伤害提升 25%', kind: 'power' },
  { id: 'haste', icon: '🌪', name: '疾风法', desc: '至宝攻击间隔缩短 18%', kind: 'haste' },
  { id: 'health', icon: '💠', name: '玄黄护体', desc: '恢复生命并提升生命上限', kind: 'health' },
  { id: 'fire', icon: '🔥', name: '离火附魔', desc: '攻击附加灼烧，持续伤害敌人', kind: 'fire' },
  { id: 'water', icon: '💧', name: '坎水附魔', desc: '攻击减速敌人，水火交汇可蒸腾爆发', kind: 'water' },
  { id: 'earth', icon: '🪨', name: '厚土附魔', desc: '命中时震荡周围敌人', kind: 'earth' }
];
Page({
  data: { view: 'home', showSettings: false, showIntro: false, paused: false, confirmExit: false, uiScale: 0.5, soundOn: true, effectVolume: 60, vibrationOn: true, hintsOn: true, hp: 100, maxHp: 100, hurt: false, level: 1, xp: 0, xpNeed: 5, xpPct: 0, stage: 1, stageName: STAGES[0], progress: 0, player: { x: 50, y: 55 }, enemies: [], effects: [], weaponName: '东皇钟', elementName: '白板', message: '', showChoice: false, choices: [], choiceToken: 0, joystick: { x: 0, y: 0, active: false }, attackRange: ATTACK_RANGE_RPX, ended: false, won: false, endingTitle: '', endingCopy: '' },
  onLoad() {
    this.updateLayout();
    let saved = {};
    try { saved = wx.getStorageSync ? wx.getStorageSync(SETTINGS_KEY) || {} : {}; } catch (_) {}
    const settings = {};
    for (const key of ['soundOn', 'vibrationOn', 'hintsOn']) if (typeof saved[key] === 'boolean') settings[key] = saved[key];
    if (Number.isFinite(saved.effectVolume)) settings.effectVolume = clamp(saved.effectVolume, 0, 100);
    this.setData({ ...settings, view: 'home', showSettings: false, showIntro: false, paused: false });
    this.audio = new GameAudio(wx, this.data);
  },
  onUnload() { this.stopLoops(); if (this.audio) this.audio.destroy(); },
  onHide() { this.upgradeTouch = null; this.pauseGame(); this.stopMovement(); if (this.audio) this.audio.stopAll(); },
  onShow() { if (this.data.paused && !this.data.showSettings) this.resumeGame(); },
  onResize() { this.stopMovement(); this.updateLayout(); this.actorFrameKey = ''; if (this.actor) this.renderActor(0); this.measureArena(); },
  openIntro() { this.setData({ showIntro: true, showSettings: false }); },
  closeIntro() { this.setData({ showIntro: false }); },
  beginGame() { this.setData({ view: 'game', showIntro: false, showSettings: false, paused: false }); this.resetGame(); },
  openSettings() { this.pauseGame(); this.setData({ showSettings: true, confirmExit: false }); },
  closeSettings() { this.setData({ showSettings: false, confirmExit: false }); this.resumeGame(); },
  requestExit() { this.setData({ confirmExit: true }); },
  cancelExit() { this.setData({ confirmExit: false }); },
  exitToHome() {
    this.stopLoops(); if (this.audio) this.audio.stopAll(); this.upgradeTouch = null; this.upgradePending = false;
    this.setData({ view: 'home', showSettings: false, showIntro: false, confirmExit: false, paused: false, showChoice: false, choices: [], showEnding: false, ended: false, message: '' });
  },
  stopTap() {},
  toggleSound(e) { this.setData({ soundOn: e.detail.value }); this.saveSettings(); },
  toggleVibration(e) { this.setData({ vibrationOn: e.detail.value }); this.saveSettings(); },
  toggleHints(e) { this.setData({ hintsOn: e.detail.value }); this.saveSettings(); },
  changeVolume(e) { this.setData({ effectVolume: clamp(Number(e.detail.value) || 0, 0, 100) }); this.saveSettings(); },
  previewSound() { if (this.audio) this.audio.play('upgrade'); },
  saveSettings() {
    const { soundOn, effectVolume, vibrationOn, hintsOn } = this.data;
    const settings = { soundOn, effectVolume, vibrationOn, hintsOn };
    if (this.audio) this.audio.configure(settings);
    try { if (wx.setStorageSync) wx.setStorageSync(SETTINGS_KEY, settings); } catch (_) {}
  },
  schedule(name, callback, delay) {
    clearTimeout(this[name]);
    if (!this.pendingTimers) this.pendingTimers = {};
    const task = { callback, remaining: delay, startedAt: Date.now() };
    this.pendingTimers[name] = task;
    if (!this.data.paused) this[name] = setTimeout(() => { delete this.pendingTimers[name]; this[name] = null; callback(); }, delay);
  },
  pauseGame() {
    if (this.data.view !== 'game' || this.data.paused) return;
    this.pauseStartedAt = Date.now(); this.stopMovement(); this.upgradeTouch = null;
    clearInterval(this.gameTimer); clearInterval(this.spawnTimer); clearInterval(this.moveTimer);
    for (const [name, task] of Object.entries(this.pendingTimers || {})) {
      clearTimeout(this[name]); this[name] = null;
      task.remaining = Math.max(0, task.remaining - (Date.now() - task.startedAt));
    }
    if (this.audio) this.audio.stopAll();
    this.setData({ paused: true });
  },
  resumeGame() {
    if (this.data.view !== 'game' || !this.data.paused) return;
    const pausedFor = Date.now() - this.pauseStartedAt;
    if (this.invulnerableUntil > this.pauseStartedAt) this.invulnerableUntil += pausedFor;
    this.lastMoveTime = Date.now(); this.setData({ paused: false });
    if (!this.data.ended) {
      this.gameTimer = setInterval(() => this.tick(), 200); this.spawnTimer = setInterval(() => this.spawnEnemy(), 1700);
    }
    if (!this.data.showEnding) this.moveTimer = setInterval(() => this.moveFrame(), 32);
    for (const [name, task] of Object.entries(this.pendingTimers || {})) this.schedule(name, task.callback, task.remaining);
  },
  updateLayout() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.rpxScale = Math.min(info.windowWidth, info.windowHeight || info.windowWidth) / 750;
    this.setData({ uiScale: this.rpxScale });
  },
  resetGame() {
    this.stopLoops(); if (this.audio) this.audio.stopAll(); this.enemyId = 0; this.effectId = 0; this.attackCd = 0; this.stageTicks = 0; this.kills = 0; this.power = 1; this.haste = 1; this.elements = []; this.player = { x: 50, y: 55 }; this.maxHp = 100; this.invulnerableUntil = 0;
    this.bossSpawned = false; this.arenaRect = null; this.joystickRect = null; this.actor = new PanguAnimation(); this.actorFrameKey = '';
    this.choiceApplying = false; this.upgradePending = false; this.upgradeTouch = null;
    this.setData({ paused: false, hp: this.maxHp, maxHp: this.maxHp, hurt: false, level: 1, xp: 0, xpNeed: 5, xpPct: 0, stage: 1, stageName: STAGES[0], progress: 0, player: { ...this.player }, enemies: [], effects: [], weaponName: '东皇钟', elementName: '白板', combatStats: this.combatStats(), message: '混沌深处，一道古老神念苏醒。', showChoice: false, choices: [], ended: false, showEnding: false, won: false, actorSheets: ACTOR_SHEETS }, () => this.measureArena());
    this.renderActor(0);
    this.spawnEnemy(); this.gameTimer = setInterval(() => this.tick(), 200); this.spawnTimer = setInterval(() => this.spawnEnemy(), 1700);
    this.lastMoveTime = Date.now(); this.moveTimer = setInterval(() => this.moveFrame(), 32);
  },
  stopLoops() {
    clearInterval(this.gameTimer); clearInterval(this.spawnTimer); clearInterval(this.moveTimer);
    clearTimeout(this.toastTimer); clearTimeout(this.hurtTimer); clearTimeout(this.stageTimer); clearTimeout(this.endingTimer); clearTimeout(this.upgradeTimer);
    this.pendingTimers = {};
    this.stopMovement();
  },
  notify(message) { this.setData({ message }); this.schedule('toastTimer', () => this.setData({ message: '' }), 2100); },
  spawnEnemy() {
    if (this.data.paused || this.data.ended || this.data.showChoice || this.upgradePending || this.data.enemies.length >= 9) return;
    const boss = this.stageTicks >= 450 && !this.bossSpawned;
    if (boss) this.bossSpawned = true;
    const edge = Math.floor(Math.random() * 4); const x = edge < 2 ? (edge === 0 ? 7 : 93) : 15 + Math.random() * 70; const y = edge >= 2 ? (edge === 2 ? 10 : 85) : 20 + Math.random() * 60;
    const hp = boss ? 18 + this.data.stage * 8 : 2 + Math.floor(this.data.stage / 2);
    const e = { id: ++this.enemyId, x, y, hp, maxHp: hp, hpPct: 100, boss, glyph: boss ? BOSS_GLYPHS[this.data.stage - 1] : ['劫', '魇', '煞'][Math.floor(Math.random() * 3)], bossType: boss ? this.data.stage : 0, speed: boss ? 0.24 : 0.32 + Math.random() * 0.12 };
    this.setData({ enemies: [...this.data.enemies, e] });
    if (boss) this.notify(`${['青龙','白虎','朱雀','玄武','天道'][this.data.stage - 1]}现身！`);
  },
  tick() {
    if (this.data.paused || this.data.ended || this.data.showChoice || this.upgradePending) return;
    this.stageTicks++;
    const p = this.player; let enemies = this.data.enemies.map(e => {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.sqrt(dx*dx + dy*dy) || 1;
      const speed = e.speed * (e.slowTicks > 0 ? 0.5 : 1);
      return { ...e, x: e.x + dx / d * speed, y: e.y + dy / d * speed,
        hp: e.hp - (e.burnTicks > 0 ? e.burnDamage : 0),
        slowTicks: Math.max(0, (e.slowTicks || 0) - 1), burnTicks: Math.max(0, (e.burnTicks || 0) - 1) };
    });
    let effects = this.data.effects.filter(e => e.ttl > 1).map(e => ({ ...e, ttl: e.ttl - 1 }));
    this.attackCd = Math.max(0, this.attackCd - 1);
    const reachable = enemies.filter(e => e.hp > 0 && this.inAttackRange(e));
    if (this.attackCd <= 0 && reachable.length) {
      const target = reachable.reduce((a,b) => this.screenDistance(p,a) < this.screenDistance(p,b) ? a : b);
      // Match facing to screen-space direction, not the arena's unequal percentage axes.
      this.actor.attack((target.x - p.x) * (this.arenaRect ? this.arenaRect.width : 1), (target.y - p.y) * (this.arenaRect ? this.arenaRect.height : 1));
      this.renderActor(0);
      target.hp -= this.power; this.attackCd = Math.max(1, Math.round(11 * this.haste));
      if (this.audio) this.audio.play('attack');
      const fire = this.elements.includes('火'), water = this.elements.includes('水'), earth = this.elements.includes('地');
      effects.push({ id: ++this.effectId, x: target.x, y: target.y, type: fire && water ? 'steam' : fire ? 'fire' : water ? 'water' : 'gold', ttl: 4 });
      if (fire) { target.burnTicks = 10; target.burnDamage = this.power * 0.05; }
      if (water) target.slowTicks = 15;
      if (fire && water) target.hp -= this.power * 0.5;
      if (earth) enemies.forEach(e => {
        if (e.id !== target.id && this.inAttackRange(e) && this.screenDistance(target,e) < 60 * this.rpxScale) {
          e.hp -= this.power * 0.3;
          effects.push({ id: ++this.effectId, x: e.x, y: e.y, type: 'earth', ttl: 4 });
        }
      });
    }
    const dead = enemies.filter(e => e.hp <= 0); enemies = enemies.filter(e => e.hp > 0);
    this.kills += dead.length;
    const xp = this.data.xp + dead.length;
    // Commit combat results before opening a modal: dead enemies must never award XP twice.
    enemies.forEach(e => { e.hpPct = Math.max(0, e.hp / e.maxHp * 100); });
    this.setData({ enemies, effects, xp, progress: Math.min(100, Math.floor(this.stageTicks / 500 * 100)), xpPct: Math.min(100, xp / this.data.xpNeed * 100) });
    const attacker = enemies.find(e => this.screenDistance(p,e) < (e.boss ? 60 : 40) * this.rpxScale);
    if (attacker && Date.now() >= this.invulnerableUntil) {
      const damage = attacker.boss ? 10 : 5;
      const hp = Math.max(0, this.data.hp - damage);
      this.invulnerableUntil = Date.now() + 1000;
      this.setData({ hp, hurt: true });
      this.schedule('hurtTimer', () => this.setData({ hurt: false }), 280);
      if (this.data.vibrationOn && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      if (!hp) return this.finish(false);
      if (this.audio) this.audio.play('hurt');
      this.actor.hurt(); this.renderActor(0);
    }
    if (this.bossSpawned && !enemies.some(e => e.boss)) this.completeStage();
    if (!this.data.ended && xp >= this.data.xpNeed) this.levelUp();
  },
  levelUp() {
    if (this.data.paused || this.data.showChoice || this.data.ended) return;
    this.stopMovement();
    const pool = UPGRADES.slice(); const choices = [];
    while (choices.length < 3) {
      const i = Math.floor(Math.random() * pool.length), choice = { ...pool.splice(i,1)[0] };
      if (this.elements.includes({ fire: '火', water: '水', earth: '地' }[choice.kind])) choice.desc = '已掌握此附魔，至宝伤害额外提升12%';
      choices.push(choice);
    }
    this.choiceSequence = (this.choiceSequence || 0) + 1;
    this.setData({ showChoice: true, choices, choiceToken: this.choiceSequence });
  },
  chooseUpgrade(e) {
    const dataset = e.currentTarget.dataset;
    if (this.data.paused || this.choiceApplying || !this.data.showChoice || this.data.ended || Number(dataset.choiceToken) !== this.data.choiceToken) return;
    const u = this.data.choices.find(choice => choice.id === dataset.upgradeId);
    if (!u || this.data.xp < this.data.xpNeed) return;
    this.choiceApplying = true;
    // Close the modal independently of animation playback or generated follow-up tap events.
    this.setData({ showChoice: false, choices: [] });
    if (u.kind === 'power') this.power *= 1.25;
    if (u.kind === 'haste') { this.haste *= 0.82; this.attackCd *= 0.82; }
    if (u.kind === 'health') { this.maxHp += 20; this.setData({ maxHp: this.maxHp, hp: Math.min(this.maxHp, this.data.hp + 25) }); }
    let feedback = u.name + '已生效';
    if (u.kind === 'fire' || u.kind === 'water' || u.kind === 'earth') { const name = {fire:'火',water:'水',earth:'地'}[u.kind]; if (!this.elements.includes(name)) this.elements.push(name); else { this.power *= 1.12; feedback = u.name + '再次领悟 · 伤害提升12%'; } }
    const level = this.data.level + 1, xp = this.data.xp - this.data.xpNeed, xpNeed = Math.ceil(this.data.xpNeed * 1.35);
    this.setData({ level, xp, xpNeed, xpPct: Math.min(100, xp / xpNeed * 100), showChoice: false, choices: [], combatStats: this.combatStats(), elementName: this.elements.length ? this.elements.join('+') : '白板' });
    this.notify(feedback);
    this.choiceApplying = false;
    this.actor.awaken(); this.renderActor(0);
    if (this.audio) this.audio.play('upgrade');
    if (xp >= xpNeed) {
      this.upgradePending = true;
      this.schedule('upgradeTimer', () => {
        this.upgradePending = false;
        if (!this.data.ended) this.levelUp();
      }, 600);
    }
  },
  onUpgradeTouchStart(e) {
    const touch = e.touches && e.touches[0];
    if (touch) this.upgradeTouch = { x: touch.clientX, y: touch.clientY, id: e.currentTarget.dataset.upgradeId, token: e.currentTarget.dataset.choiceToken, moved: false };
  },
  onUpgradeTouchMove(e) {
    const touch = e.touches && e.touches[0], press = this.upgradeTouch;
    if (press && touch && Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 12) press.moved = true;
  },
  onUpgradeTouchCancel() { this.upgradeTouch = null; },
  onUpgradeTouchEnd(e) {
    const press = this.upgradeTouch; this.upgradeTouch = null;
    if (press && !press.moved && press.id === e.currentTarget.dataset.upgradeId && String(press.token) === String(e.currentTarget.dataset.choiceToken)) this.chooseUpgrade(e);
  },
  completeStage() {
    this.bossSpawned = false; this.stageTicks = 0;
    if (this.data.stage >= 5) return this.finish(true);
    const next = this.data.stage + 1;
    if (next === 5) { this.notify('四象记忆归一：你是盘古留下的神念。天道现身！'); }
    else this.notify(MEMORIES[next - 2] || '记忆碎片涌现。');
    this.setData({ stage: next, stageName: STAGES[next - 1], progress: 0, hp: Math.min(this.maxHp, this.data.hp + 15) });
    this.schedule('stageTimer', () => { if (!this.data.ended) this.spawnEnemy(); }, 700);
  },
  finish(win) {
    this.stopLoops();
    if (this.audio) { this.audio.stopAll(); this.audio.play(win ? 'victory' : 'death'); }
    if (win) this.actor.awaken(); else this.actor.die();
    this.setData({ ended: true, showEnding: false, won: win, showChoice: false, endingTitle: win ? '开天一念' : '神念归寂', endingCopy: win ? '你镇压天道，重演地火风水。天地初生，第一缕晨光照亮人间。此后万物将走向何方？' : '盘古神念暂归混沌。已苏醒的记忆仍留在心中。' });
    this.renderActor(0);
    this.lastMoveTime = Date.now(); this.moveTimer = setInterval(() => this.moveFrame(), 32);
    // Keep the world still while the full six-frame death/victory animation plays.
    this.schedule('endingTimer', () => {
      this.renderActor(1);
      clearInterval(this.moveTimer);
      this.setData({ showEnding: true });
    }, 1050);
  },
  restart() { this.setData({ view: 'game' }); this.resetGame(); },
  combatStats() { return `伤害 ${Number(this.power.toFixed(2))} · 间隔 ${(Math.max(1, Math.round(11 * this.haste)) * 0.2).toFixed(1)}秒`; },
  screenDistance(a, b) {
    if (!this.arenaRect) return Infinity;
    return Math.hypot((a.x - b.x) * this.arenaRect.width / 100, (a.y - b.y) * this.arenaRect.height / 100);
  },
  inAttackRange(enemy) { return this.screenDistance(this.player, enemy) <= ATTACK_RANGE_RPX * this.rpxScale + 0.000001; },
  measureArena() {
    if (this.data.view !== 'game') return;
    const query = this.createSelectorQuery();
    query.select('.arena').boundingClientRect(rect => {
      if (rect && rect.width > 0 && rect.height > 0) {
        this.arenaRect = rect;
        this.updateLayout();
      }
    });
    query.select('.joystick-pad').boundingClientRect(rect => { if (rect && rect.width && rect.height) this.joystickRect = rect; });
    query.exec();
  },
  onTouchStart(e) {
    if (this.data.paused || this.data.showChoice || this.data.ended || this.upgradePending || this.touchOrigin) return;
    const t = e.touches[0];
    if (!t) return;
    const rect = this.joystickRect;
    if (!rect) { this.measureArena(); return; }
    if (t.clientX < rect.left || t.clientX > rect.left + rect.width || t.clientY < rect.top || t.clientY > rect.top + rect.height) return;
    this.touchId = t.identifier; this.touchOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.onTouchMove(e);
  },
  onTouchMove(e) {
    if (this.data.paused || !this.touchOrigin || this.data.showChoice || this.data.ended) return;
    const t = e.touches.find(touch => touch.identifier === this.touchId);
    if (!t) return;
    const dx = t.clientX - this.touchOrigin.x, dy = t.clientY - this.touchOrigin.y;
    const distance = Math.hypot(dx, dy);
    const radius = JOYSTICK_RADIUS_RPX * this.rpxScale;
    const strength = distance < 4 ? 0 : Math.min(1, distance / radius);
    this.moveVector = { x: distance ? dx / distance * strength : 0, y: distance ? dy / distance * strength : 0 };
    this.setData({ joystick: { x: this.moveVector.x * JOYSTICK_RADIUS_RPX, y: this.moveVector.y * JOYSTICK_RADIUS_RPX, active: true } });
  },
  onTouchEnd(e) {
    if (e && e.touches && e.touches.some(t => t.identifier === this.touchId)) return;
    this.stopMovement();
  },
  stopMovement() {
    this.touchOrigin = null; this.touchId = null; this.moveVector = { x: 0, y: 0 };
    this.setData({ joystick: { x: 0, y: 0, active: false } });
    if (this.actor) this.actor.move(0, 0);
  },
  renderActor(dt) {
    const frame = this.actor.update(dt), key = frame.action + ':' + frame.direction + ':' + frame.index;
    if (key === this.actorFrameKey) return;
    this.actorFrameKey = key;
    this.setData({ actorFrame: { action: frame.action, direction: frame.direction, index: frame.index, left: -frame.index * ACTOR_FRAME_SIZE * this.rpxScale, top: -DIRECTION_ROW[frame.direction] * ACTOR_FRAME_SIZE * this.rpxScale } });
  },
  playerBounds() {
    const size = ACTOR_FRAME_SIZE * this.rpxScale;
    const xMargin = Math.min(45, Math.max(5, size * 0.5 / this.arenaRect.width * 100));
    const yMin = Math.min(45, Math.max(12, size * 0.54 / this.arenaRect.height * 100));
    const yMax = Math.max(55, Math.min(90, 100 - size * 0.46 / this.arenaRect.height * 100));
    return { xMin: xMargin, xMax: 100 - xMargin, yMin, yMax };
  },
  moveFrame() {
    const now = Date.now(), dt = Math.min(0.05, Math.max(0, (now - this.lastMoveTime) / 1000));
    this.lastMoveTime = now;
    if (this.data.view !== 'game' || this.data.paused || this.data.showChoice) return;
    if (!this.data.ended && !this.upgradePending && this.arenaRect) {
      const direction = this.moveVector || { x: 0, y: 0 }, step = MOVE_SPEED * dt;
      const bounds = this.playerBounds();
      const x = clamp(this.player.x + direction.x * step / this.arenaRect.width * 100, bounds.xMin, bounds.xMax);
      const y = clamp(this.player.y + direction.y * step / this.arenaRect.height * 100, bounds.yMin, bounds.yMax);
      const moved = x !== this.player.x || y !== this.player.y;
      this.actor.move(moved ? direction.x : 0, moved ? direction.y : 0);
      if (moved) { this.player = { x, y }; this.setData({ player: { ...this.player } }); }
    }
    this.renderActor(dt);
  }
});
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }




