const JOYSTICK_RADIUS_RPX = 64;
const { PanguAnimation } = require('../core/pangu-animation');
const { GameAudio } = require('../core/game-audio');
const { Combat, WEAPONS, PLAYER_SPEED, ENEMIES } = require('../core/combat');
const { SWORDS } = require('../core/swords');
const { MEMORIES, readArchive, saveArchive, runView } = require('../core/chronicle');
const SETTINGS_KEY = 'pangu.settings.v1';
const ACTOR_SHEETS = ['idle', 'move', 'attack', 'hurt', 'awaken', 'death'];
const DIRECTION_ROW = { down: 0, up: 1, left: 2, right: 3 };
const ACTOR_FRAME_SIZE = 192;
const NativeDate = Date;
const INPUT_BOUNDARIES = ['view', 'paused', 'ended', 'showSettings', 'confirmExit', 'showArchive', 'archiveTab', 'showIntro', 'showChoice', 'choiceToken', 'showMemory', 'showEnding', 'rewardSelectedId'];


// Pure controller: Eva.js owns the single frame loop. There is no Page/setData bridge.
function createController(wx, options = {}) {
  const clock = options.clock || globalThis;
  const Date = options.Date || NativeDate;
  const setTimeout = (fn, delay) => clock.setTimeout(fn, delay);
  const clearTimeout = id => clock.clearTimeout(id);
const definition = {
  data: {
    view: 'home', showSettings: false, showIntro: false, showArchive: false, archiveTab: 'memories', paused: false, confirmExit: false,
    uiScale: 0.5, soundOn: true, effectVolume: 60, vibrationOn: true, hintsOn: true,
    hp: 100, maxHp: 100, hpPct: 100, hurt: false, level: 1, xp: 0, xpNeed: 5, xpPct: 0,
    stage: 1, stageName: '', phaseName: '', objective: '', progress: 0, boss: null, kills: 0, combatStats: '', weaponId: 'bell', actorSheets: [], actorFrame: { left: 0, top: 0, action: 'idle' }, pathName: '', warded: false,
    player: { x: 50, y: 55 }, enemies: [], hazards: [], effects: [], weaponName: '混沌钟', elementName: '未附魔', comboName: '', message: '',
    showChoice: false, choices: [], choiceToken: 0, joystick: { x: 0, y: 0, active: false }, attackRange: 180,
    ended: false, showEnding: false, won: false, endingTitle: '', endingCopy: '', showMemory: false, memory: null,
    selectedWeapon: 'bell', weapons: Object.keys(WEAPONS).map(id => ({ id, ...WEAPONS[id] })),
    archiveMemories: [], archiveEnemies: [], archiveRuns: [], memoryCount: 0, enemyCount: 0, runSummary: null, runReport: null,
    rewardChoices: [], rewardSelectedId: '', rewardKind: '', rewardTitle: '', energy: 100, skillReady: true, skillName: '镇界', skillAim: null
  },
  onLoad() {
    this.updateLayout();
    let saved = {};
    try { saved = wx.getStorageSync ? wx.getStorageSync(SETTINGS_KEY) || {} : {}; } catch (_) {}
    const settings = {};
    for (const key of ['soundOn', 'vibrationOn', 'hintsOn']) if (typeof saved[key] === 'boolean') settings[key] = saved[key];
    if (Number.isFinite(saved.effectVolume)) settings.effectVolume = clamp(saved.effectVolume, 0, 100);
    this.setData({ ...settings, view: 'home', showSettings: false, showIntro: false, paused: false });
    this.audio = new GameAudio(wx, this.data); this.archive = readArchive(wx); this.refreshArchive();
  },
  onUnload() { this.stopLoops(); if (this.audio) this.audio.destroy(); },
  onHide() { this.upgradeTouch = null; this.cancelSkillAim(); this.pauseGame(); this.stopMovement(); if (this.audio) this.audio.stopAll(); },
  onShow() { if (this.data.paused && !this.data.showSettings) this.resumeGame(); },
  onResize() { this.stopMovement(); this.updateLayout(); this.actorFrameKey = ''; if (this.actor) this.renderActor(0); this.measureArena(); },
  openIntro() { this.setData({ showIntro: true, showSettings: false }); },
  closeIntro() { this.setData({ showIntro: false }); },
  selectWeapon(e) { const id = e.currentTarget.dataset.weapon; if (Object.keys(WEAPONS).includes(id)) this.setData({ selectedWeapon: id }); },
  beginGame() { this.setData({ view: 'game', showIntro: false, showSettings: false, showArchive: false, paused: false }); this.resetGame(); },
  openSettings() { this.pauseGame(); this.setData({ showSettings: true, confirmExit: false }); },
  closeSettings() { this.setData({ showSettings: false, confirmExit: false }); this.resumeGame(); },
  requestExit() { this.setData({ confirmExit: true }); },
  cancelExit() { this.setData({ confirmExit: false }); },
  exitToHome() {
    this.stopLoops(); if (this.audio) this.audio.stopAll(); this.upgradeTouch = null; this.upgradePending = false;
    this.setData({ view: 'home', showSettings: false, showIntro: false, confirmExit: false, paused: false, showChoice: false, choices: [], showMemory: false, showEnding: false, ended: false, bossTransition: null, message: '' });
    this.refreshArchive();
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
  refreshArchive() {
    this.setData({
      memoryCount: this.archive.memories.length, enemyCount: this.archive.enemies.length,
      archiveMemories: MEMORIES.map(m => this.archive.memories.includes(m.id) ? { ...m, seen: true } : { id: m.id, title: '未苏醒的记忆', scene: '击败第 ' + m.id + ' 位四象后解锁', seen: false }),
      archiveEnemies: ENEMIES.filter(e => this.archive.enemies.includes(e.id)), archiveRuns: this.archive.runs.map((run, id) => ({ ...runView(run), id }))
    });
  },
  openArchive() { this.refreshArchive(); this.setData({ showArchive: true, archiveTab: 'memories' }); },
  closeArchive() { this.setData({ showArchive: false }); },
  selectArchiveTab(e) { const tab = e.currentTarget.dataset.tab; if (['memories', 'enemies', 'runs'].includes(tab)) this.setData({ archiveTab: tab }); },
  schedule(name, callback, delay) {
    clearTimeout(this[name]);
    if (!this.pendingTimers) this.pendingTimers = {};
    const task = { callback, remaining: delay, startedAt: Date.now() };
    this.pendingTimers[name] = task;
    if (!this.data.paused) this[name] = setTimeout(() => { delete this.pendingTimers[name]; this[name] = null; callback(); }, delay);
  },
  pauseGame() {
    this.cancelSkillAim();
    if (this.data.view !== 'game' || this.data.paused) return;
    this.stopMovement(); this.upgradeTouch = null;
    for (const [name, task] of Object.entries(this.pendingTimers || {})) {
      clearTimeout(this[name]); this[name] = null;
      task.remaining = Math.max(0, task.remaining - (Date.now() - task.startedAt));
    }
    if (this.audio) this.audio.stopAll(); this.setData({ paused: true });
  },
  startLoops() { this.lastMoveTime = Date.now(); this.lastTickTime = Date.now(); },
  resumeGame() {
    if (this.data.view !== 'game' || !this.data.paused) return;
    this.setData({ paused: false }); this.startLoops();
    for (const [name, task] of Object.entries(this.pendingTimers || {})) this.schedule(name, task.callback, task.remaining);
  },
  updateLayout() {
    const info = this.viewport;
    this.rpxScale = Math.min(info.windowWidth, info.windowHeight) / 750;
    const scale = this.rpxScale, w = info.windowWidth / scale, h = info.windowHeight / scale;
    const safe = info.safeArea || { left: 0, right: info.windowWidth, top: 0, bottom: info.windowHeight };
    const left = Math.max(24, safe.left / scale + 12), right = Math.max(24, (info.windowWidth - safe.right) / scale + 12);
    this.layout = { w, h, arena: { x: left, y: 96, width: w - left - right, height: h - 144 } };
    const arena = this.layout.arena;
    this.layout.joystick = { x: arena.x + 16, y: arena.y + arena.height - 220, width: 200, height: 200 };
    this.layout.skill = { x: arena.x + arena.width - 212, y: arena.y + arena.height - 220, width: 192, height: 200 };
    const physical = r => ({ left: r.x * scale, top: r.y * scale, width: r.width * scale, height: r.height * scale });
    this.arenaRect = physical(arena); this.joystickRect = physical(this.layout.joystick);
    if (this.combat) this.combat.configureArena(this.arenaRect.width, this.arenaRect.height, scale);
    this.setData({ uiScale: scale });
  },
  resetGame() {
    this.cancelSkillAim();
    this.stopLoops(); if (this.audio) this.audio.stopAll();
    this.combat = new Combat(this.data.selectedWeapon); this.player = this.combat.player;
    this.updateLayout(); this.actor = new PanguAnimation(); this.actorFrameKey = '';
    this.choiceApplying = false; this.upgradePending = false; this.stageClearRemaining = 0; this.upgradeTouch = null;
    this.viewCache = {}; this.renderStats = { ticks: 0, calls: 0, bytes: 0, fullBytes: 0, maxBytes: 0 };
    this.setData({ ...this.combat.snapshot(), paused: false, hurt: false, player: { ...this.player }, message: this.combat.weapon === 'bell' ? '外缘共鸣增伤 · 三次有效钟鸣释放居中回响 · 镇界先护身后震退' : this.combat.weapon === 'swords' ? '诛戮陷绝四剑环绕 · 近身自动回旋斩击 · 点击「诛仙」展开剑阵' : '盘古幡自动发射飞刃 · 拖动右下「裂天」瞄准，松手释放', showChoice: false, choices: [], showMemory: false, ended: false, showEnding: false, won: false, runSummary: null, actorSheets: ACTOR_SHEETS }, () => this.measureArena());
    this.renderActor(0); this.startLoops();
    this.schedule('toastTimer', () => this.setData({ message: '' }), 2600);
  },
  stopLoops() {
    for (const name of Object.keys(this.pendingTimers || {})) clearTimeout(this[name]);
    this.pendingTimers = {}; this.stopMovement();
  },
  notify(message) { this.setData({ message }); this.schedule('toastTimer', () => this.setData({ message: '' }), 2300); },
  isBlocked() { return this.data.view !== 'game' || this.data.paused || this.data.ended || this.data.showChoice || this.data.showMemory || this.upgradePending || this.stageClearRemaining > 0 || Boolean(this.combat && this.combat.enrage); },
  aimSkill(direction) {
    if (this.isBlocked() || !this.combat || !this.combat.snapshot().skillReady || this.combat.weapon !== 'banner') return false;
    this.setData({ skillAim: this.combat.skillDirection(direction) }); return true;
  },
  cancelSkillAim() { if (this.data.skillAim) this.setData({ skillAim: null }); },
  castSkill(direction) {
    if (this.isBlocked() || !this.combat || !this.combat.useSkill(direction)) { this.cancelSkillAim(); return false; }
    this.cancelSkillAim(); this.syncCombat(); return true;
  },
  tick(delta) {
    const now = Date.now(), dt = Math.min(0.05, typeof delta === 'number' ? Math.max(0, delta) : Math.max(0, (now - this.lastTickTime) / 1000));
    this.lastTickTime = now;
    if (this.combat && this.combat.enrage && this.data.view === 'game' && !this.data.paused && !this.data.ended && !this.data.showChoice && !this.data.showMemory) {
      this.combat.update(dt); this.syncCombat(); return;
    }
    if (this.stageClearRemaining > 0 && this.data.view === 'game' && !this.data.paused && !this.data.ended) {
      this.combat.advanceRemnants(dt); this.stageClearRemaining = Math.max(0, this.stageClearRemaining - dt);
      this.syncCombat(); if (!this.stageClearRemaining) this.completeStage(); return;
    }
    if (this.isBlocked()) return;
    this.combat.update(dt, this.actor.state === 'idle' || this.actor.state === 'move');
    let warned = false;
    for (const event of this.combat.drainEvents()) {
      if (event.type === 'attack') { this.actor.attack(event.direction.x, event.direction.y); this.renderActor(0); }
      if (event.type === 'launch' && this.audio) this.audio.play('banner');
      if (event.type === 'bell-release' && this.audio) this.audio.play(event.kind === 'skill' ? 'dominion' : event.kind === 'echo' ? 'echo' : 'bell');
      if (event.type === 'sword-release' && this.audio) this.audio.play('attack');
      if (event.type === 'impact' && this.audio && now >= (this.impactSoundUntil || 0)) {
        this.audio.play('attack'); this.impactSoundUntil = now + 110;
      }
      if (event.type === 'skill') {
        this.actor.direction = Math.abs(event.direction.x) > Math.abs(event.direction.y) ? (event.direction.x > 0 ? 'right' : 'left') : (event.direction.y > 0 ? 'down' : 'up');
        this.actor.play('attack'); this.renderActor(0);
        if (this.audio && event.weapon === 'banner') this.audio.play('rift');
        if (this.data.vibrationOn && wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
        this.notify(event.weapon === 'bell' ? '镇界 · 震退群敌，短暂护身' : event.weapon === 'swords' ? '诛仙 · 四剑展开，回旋斩击' : '裂天 · 贯穿爆发，留下裂隙');
      }
      if (event.type === 'skill-ready' && this.audio) this.audio.play('ready');
      if (event.type === 'hurt') {
        this.actor.hurt(); if (this.audio) this.audio.play('hurt');
        if (this.data.vibrationOn && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      }
      if (event.type === 'rooted') this.notify('藤蔓缠足 · 暂时无法移动，仍可使用至宝');
      if (event.type === 'boss') this.notify(event.name + '现身 · 观察预警后再接近');
      if (event.type === 'boss-phase') { this.stopMovement(); this.cancelSkillAim(); if (this.audio) { this.audio.stopAll(); this.audio.play('dominion'); } this.notify(event.name + ' · 法相暴怒'); }
      if (event.type === 'boss-enraged') this.notify(event.name + ' · 留意新的蓄势动作');
      if (event.type === 'cast' && this.audio && !warned && now >= (this.warningSoundUntil || 0)) { this.audio.play('warning'); this.warningSoundUntil = now + 650; warned = true; }
      if (event.type === 'trial-clear') this.notify('试炼完成 · 额外获得 6 灵气，恢复 10 元气');
      if (event.type === 'discover' && !this.archive.enemies.includes(event.id)) { this.archive.enemies.push(event.id); saveArchive(wx, this.archive); }
      if (event.type === 'death') { this.finish(false); break; }
      if (event.type === 'stage-clear') {
        this.stopMovement(); this.cancelSkillAim();
        this.stageClearRemaining = Math.max(0.01, ...this.combat.remnants.filter(body => body.boss).map(body => body.life - body.age));
      }
    }
    this.syncCombat(); this.renderActor(0);
    if (!this.isBlocked() && this.combat.xp >= this.combat.xpNeed) this.levelUp();
  },
  syncCombat() { this.setData({ ...this.combat.snapshot(), player: { ...this.player }, hurt: this.actor.state === 'hurt' }); },
  levelUp() {
    if (this.isBlocked() || this.combat.xp < this.combat.xpNeed) return;
    this.cancelSkillAim();
    this.stopMovement(); this.combat.pendingAttack = null;
    this.choiceSequence = (this.choiceSequence || 0) + 1;
    this.setData({ showChoice: true, choices: this.combat.choices(), choiceToken: this.choiceSequence });
  },
  chooseUpgrade(e) {
    const dataset = e.currentTarget.dataset;
    if (this.data.paused || this.choiceApplying || !this.data.showChoice || this.data.ended || Number(dataset.choiceToken) !== this.data.choiceToken) return;
    const u = this.data.choices.find(choice => choice.id === dataset.upgradeId), combat = this.combat;
    if (!u || combat.xp < combat.xpNeed) return;
    this.choiceApplying = true;
    if (!combat.upgrade(u.kind)) { this.choiceApplying = false; return; }
    combat.level++; combat.xp -= combat.xpNeed; combat.xpNeed = combat.nextXpNeed();
    this.setData({ showChoice: false, choices: [] }); this.syncCombat();
    this.notify(u.name + '已生效 · ' + u.change);
    this.choiceApplying = false; this.actor.awaken(); this.renderActor(0);
    if (this.audio) this.audio.play('upgrade');
    this.upgradePending = true;
    this.schedule('upgradeTimer', () => { this.upgradePending = false; if (!this.data.ended) this.levelUp(); }, 1000);
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
    this.stopMovement(); const stage = this.combat.stage;
    if (stage >= 5) return this.finish(true);
    if (!this.archive.memories.includes(stage)) { this.archive.memories.push(stage); saveArchive(wx, this.archive); }
    this.combat.pendingAttack = null;
    const encounter = stage === 2 ? this.combat.createEncounter() : null;
    const rewardChoices = stage === 1 && !this.combat.path ? this.combat.pathChoices() : encounter && !encounter.resolved ? encounter.choices : [];
    this.setData({ showMemory: true, memory: MEMORIES[stage - 1], rewardChoices, rewardSelectedId: '', rewardKind: stage === 1 ? 'path' : 'event', rewardTitle: stage === 1 ? '至宝悟道 · 本局路线二选一' : encounter ? encounter.title : '', nextStageLabel: stage === 4 ? '进入天道之庭' : '整备 · 前往下一境' });
  },
  selectMemoryReward(e) {
    if (!this.data.showMemory || this.data.paused || this.data.rewardSelectedId) return;
    const id = e.currentTarget.dataset.reward;
    if (!this.data.rewardChoices.some(choice => choice.id === id && !choice.disabled)) return;
    const applied = this.data.rewardKind === 'path' ? this.combat.choosePath(id) : this.combat.resolveEncounter(id);
    if (applied) { this.setData({ rewardSelectedId: id }); this.syncCombat(); }
  },
  continueStage() {
    if (!this.data.showMemory || this.data.paused || (this.data.rewardChoices.length && !this.data.rewardSelectedId) || !this.combat.advanceStage()) return;
    this.setData({ showMemory: false }); this.actor = new PanguAnimation(); this.actorFrameKey = '';
    this.lastTickTime = Date.now(); this.lastMoveTime = Date.now(); this.syncCombat(); this.renderActor(0);
    this.notify('整备完成 · 恢复 15 元气'); this.levelUp();
  },
  finish(win) {
    if (this.data.ended) return;
    this.stopLoops(); this.combat.ended = true; this.upgradePending = false;
    if (this.audio) { this.audio.stopAll(); this.audio.play(win ? 'victory' : 'death'); }
    if (win) this.actor.awaken(); else this.actor.die();
    this.cancelSkillAim();
    const report = this.combat.battleReport();
    const run = { won: win, seconds: Math.floor(this.combat.time), kills: this.combat.kills, stage: this.combat.stage, weaponId: this.combat.weapon, build: this.combat.buildLabel(), detail: report.damage + '；' + report.cause };
    this.archive.runs.unshift(run); this.archive.runs = this.archive.runs.slice(0, 8); saveArchive(wx, this.archive);
    this.setData({ ended: true, showEnding: false, showMemory: false, won: win, showChoice: false, hazards: [], runSummary: runView(run), runReport: report, endingTitle: win ? '开天一念' : '神念归寂', endingCopy: win ? '你汇聚四象遗力，镇压天道，劈开混沌。第一缕晨光照亮人间。此后万物，将自行书写未来。' : '止步于' + (this.combat.lastDamageName || '混沌劫境') + '。已苏醒的记忆与图鉴仍留在手记中。' });
    this.combat.hazards = []; this.combat.projectiles = []; this.combat.followups = []; this.renderActor(0);
    this.combat.swordStrike = null; this.combat.swordPrevious = null;
    this.lastMoveTime = Date.now();
    this.schedule('endingTimer', () => { this.renderActor(1); this.setData({ showEnding: true }); }, 1050);
  },
  restart() { this.setData({ view: 'game' }); this.resetGame(); },
  measureArena() { this.updateLayout(); },
  onTouchStart(e) {
    if (this.isBlocked() || this.touchOrigin) return;
    const t = e.touches[0]; if (!t) return;
    const rect = this.joystickRect; if (!rect) { this.measureArena(); return; }
    if (t.clientX < rect.left || t.clientX > rect.left + rect.width || t.clientY < rect.top || t.clientY > rect.top + rect.height) return;
    this.touchId = t.identifier; this.touchOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; this.onTouchMove(e);
  },
  onTouchMove(e) {
    if (this.isBlocked() || !this.touchOrigin) return;
    const t = e.touches.find(touch => touch.identifier === this.touchId); if (!t) return;
    const dx = t.clientX - this.touchOrigin.x, dy = t.clientY - this.touchOrigin.y, distance = Math.hypot(dx, dy);
    const strength = distance < 4 ? 0 : Math.min(1, distance / (JOYSTICK_RADIUS_RPX * this.rpxScale));
    this.moveVector = { x: distance ? dx / distance * strength : 0, y: distance ? dy / distance * strength : 0 };
    this.setData({ joystick: { x: this.moveVector.x * JOYSTICK_RADIUS_RPX, y: this.moveVector.y * JOYSTICK_RADIUS_RPX, active: true } });
  },
  onTouchEnd(e) { if (e && e.touches && e.touches.some(t => t.identifier === this.touchId)) return; this.stopMovement(); },
  stopMovement() {
    this.touchOrigin = null; this.touchId = null; this.moveVector = { x: 0, y: 0 };
    this.setData({ joystick: { x: 0, y: 0, active: false } }); if (this.actor) this.actor.move(0, 0);
  },
  renderActor(dt) {
    const frame = this.actor.update(dt), key = frame.action + ':' + frame.direction + ':' + frame.index;
    if (key === this.actorFrameKey) return; this.actorFrameKey = key;
    this.setData({ actorFrame: { action: frame.action, direction: frame.direction, index: frame.index, left: -frame.index * ACTOR_FRAME_SIZE * this.rpxScale, top: -DIRECTION_ROW[frame.direction] * ACTOR_FRAME_SIZE * this.rpxScale } });
  },
  playerBounds() {
    const size = ACTOR_FRAME_SIZE * this.rpxScale;
    const swords = this.combat && this.combat.weapon === 'swords';
    const xMargin = Math.min(45, Math.max(5, (swords ? SWORDS.marginX * this.rpxScale : size * 0.5) / this.arenaRect.width * 100));
    const headroom = swords ? SWORDS.marginTop * this.rpxScale : this.combat && this.combat.weapon === 'bell' ? Math.max(size * 0.54, 176 * this.rpxScale) : size * 0.54;
    const yMin = Math.min(45, Math.max(12, headroom / this.arenaRect.height * 100));
    const yMax = Math.max(55, Math.min(90, 100 - (swords ? SWORDS.marginBottom * this.rpxScale : size * 0.46) / this.arenaRect.height * 100));
    return { xMin: xMargin, xMax: 100 - xMargin, yMin, yMax };
  },
  moveFrame(delta) {
    const now = Date.now(), dt = typeof delta === 'number' ? Math.min(0.05, Math.max(0, delta)) : Math.min(0.05, Math.max(0, (now - this.lastMoveTime) / 1000)); this.lastMoveTime = now;
    if (this.data.view !== 'game' || this.data.paused || this.data.showChoice || this.data.showMemory || this.stageClearRemaining > 0 || this.combat && this.combat.enrage) return;
    if (!this.data.ended && !this.upgradePending && this.arenaRect && this.combat.rootTime > 0) this.actor.move(0, 0);
    if (!this.data.ended && !this.upgradePending && this.arenaRect && !(this.combat.rootTime > 0)) {
      const direction = this.moveVector || { x: 0, y: 0 }, step = PLAYER_SPEED * this.rpxScale * dt, bounds = this.playerBounds();
      const x = clamp(this.player.x + direction.x * step / this.arenaRect.width * 100, bounds.xMin, bounds.xMax);
      const y = clamp(this.player.y + direction.y * step / this.arenaRect.height * 100, bounds.yMin, bounds.yMax);
      const moved = x !== this.player.x || y !== this.player.y; this.actor.move(moved ? direction.x : 0, moved ? direction.y : 0);
      if (moved || this.data.player.x !== x || this.data.player.y !== y) { this.player.x = x; this.player.y = y; this.setData({ player: { ...this.player } }); }
    }
    this.renderActor(dt);
  }
};
  const controller = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), viewport: options.viewport || wx.getWindowInfo() };
  controller.setData = function(patch, callback) {
    const phaseBoundary = Object.prototype.hasOwnProperty.call(patch, 'bossTransition') && (patch.bossTransition && patch.bossTransition.owner) !== (this.data.bossTransition && this.data.bossTransition.owner);
    const boundary = phaseBoundary || INPUT_BOUNDARIES.some(key => Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== this.data[key]);
    Object.assign(this.data, patch); if (boundary) this.data.inputEpoch = (this.data.inputEpoch || 0) + 1;
    this.version = (this.version || 0) + 1; if (callback) callback();
  };
  controller.frame = function(dt) { this.moveFrame(dt); this.tick(dt); };
  controller.resize = function(viewport) { this.viewport = viewport; this.onResize(); };
  controller.scrollArchive = function(delta) { this.setData({ archiveScroll: Math.max(0, Math.min(this.archiveMaxScroll || 0, (this.data.archiveScroll || 0) + delta)) }); };
  controller.onLoad();
  return controller;
}
module.exports = { createController };

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function utf8Size(value) { return encodeURIComponent(value).replace(/%[A-F\d]{2}/g, 'x').length; }
