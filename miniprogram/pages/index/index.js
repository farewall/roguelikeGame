const STAGES = ['东方·初生之野', '西方·白骨战场', '南方·焚天熔界', '北方·归墟寒海', '天道之庭'];
const BOSSES = ['🐉', '🐯', '🐦‍🔥', '🐢', '☯'];
const MEMORIES = ['记忆闪回：女娲造人，人间初生，山川间生机盎然。', '记忆闪回：文明兴起，争斗由资源冲突逐渐升级。', '记忆闪回：圣人交战，至宝碰撞，天地根基崩坏。', '记忆闪回：万物归于混沌。你想起了自己是盘古留下的神念。'];
const UPGRADES = [
  { id: 'power', icon: '⚡', name: '开天劲', desc: '至宝伤害提升 25%', kind: 'power' },
  { id: 'haste', icon: '🌪', name: '疾风法', desc: '至宝攻击间隔缩短 18%', kind: 'haste' },
  { id: 'health', icon: '💠', name: '玄黄护体', desc: '恢复生命并提升生命上限', kind: 'health' },
  { id: 'fire', icon: '🔥', name: '离火附魔', desc: '攻击附加灼烧，持续伤害敌人', kind: 'fire' },
  { id: 'water', icon: '💧', name: '坎水附魔', desc: '攻击减速敌人，水火交汇可蒸腾爆发', kind: 'water' },
  { id: 'earth', icon: '🪨', name: '厚土附魔', desc: '命中时震荡周围敌人', kind: 'earth' }
];
Page({
  data: { view: 'home', showSettings: false, showIntro: false, soundOn: true, vibrationOn: true, hintsOn: true, hp: 100, level: 1, xp: 0, xpNeed: 5, xpPct: 0, stage: 1, stageName: STAGES[0], progress: 0, player: { x: 50, y: 55 }, enemies: [], effects: [], weaponName: '东皇钟', elementName: '白板', message: '', showChoice: false, choices: [], ended: false, endingTitle: '', endingCopy: '' },
  onLoad() { this.setData({ view: 'home', showSettings: false, showIntro: false, soundOn: true, vibrationOn: true, hintsOn: true }); },
  onUnload() { this.stopLoops(); },
  openIntro() { this.setData({ showIntro: true, showSettings: false }); },
  closeIntro() { this.setData({ showIntro: false }); },
  beginGame() { this.setData({ view: 'game', showIntro: false }); this.resetGame(); },
  openSettings() { this.setData({ showSettings: true }); },
  closeSettings() { this.setData({ showSettings: false }); },
  stopTap() {},
  toggleSound(e) { this.setData({ soundOn: e.detail.value }); },
  toggleVibration(e) { this.setData({ vibrationOn: e.detail.value }); },
  toggleHints(e) { this.setData({ hintsOn: e.detail.value }); },
  resetGame() {
    this.stopLoops(); this.enemyId = 0; this.effectId = 0; this.attackCd = 0; this.stageTicks = 0; this.kills = 0; this.power = 1; this.haste = 1; this.elements = []; this.player = { x: 50, y: 55 };
    this.setData({ hp: 100, level: 1, xp: 0, xpNeed: 5, xpPct: 0, stage: 1, stageName: STAGES[0], progress: 0, player: this.player, enemies: [], effects: [], weaponName: '东皇钟', elementName: '白板', message: '混沌深处，一道古老神念苏醒。', showChoice: false, ended: false });
    this.spawnEnemy(); this.gameTimer = setInterval(() => this.tick(), 200); this.spawnTimer = setInterval(() => this.spawnEnemy(), 1700);
  },
  stopLoops() { if (this.gameTimer) clearInterval(this.gameTimer); if (this.spawnTimer) clearInterval(this.spawnTimer); if (this.toastTimer) clearTimeout(this.toastTimer); },
  notify(message) { this.setData({ message }); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.setData({ message: '' }), 2100); },
  spawnEnemy() {
    if (this.data.ended || this.data.showChoice || this.data.enemies.length >= 9) return;
    const boss = this.stageTicks >= 450 && !this.bossSpawned;
    if (boss) this.bossSpawned = true;
    const edge = Math.floor(Math.random() * 4); const x = edge < 2 ? (edge === 0 ? 7 : 93) : 15 + Math.random() * 70; const y = edge >= 2 ? (edge === 2 ? 10 : 85) : 20 + Math.random() * 60;
    const hp = boss ? 18 + this.data.stage * 8 : 2 + Math.floor(this.data.stage / 2);
    const e = { id: ++this.enemyId, x, y, hp, maxHp: hp, boss, icon: boss ? BOSSES[this.data.stage - 1] : ['👾', '🌀', '👹'][Math.floor(Math.random() * 3)], speed: boss ? 0.24 : 0.32 + Math.random() * 0.12 };
    this.setData({ enemies: [...this.data.enemies, e] });
    if (boss) this.notify(`${['青龙','白虎','朱雀','玄武','天道'][this.data.stage - 1]}现身！`);
  },
  tick() {
    if (this.data.ended || this.data.showChoice) return;
    this.stageTicks++;
    const p = this.player; let enemies = this.data.enemies.map(e => {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.sqrt(dx*dx + dy*dy) || 1;
      return { ...e, x: e.x + dx / d * e.speed, y: e.y + dy / d * e.speed, hpPct: Math.max(0, e.hp / e.maxHp * 100) };
    });
    let effects = this.data.effects.filter(e => e.ttl > 1).map(e => ({ ...e, ttl: e.ttl - 1 }));
    this.attackCd--;
    if (this.attackCd <= 0 && enemies.length) {
      const target = enemies.reduce((a,b) => dist(p,a) < dist(p,b) ? a : b); const damage = this.power;
      target.hp -= damage; this.attackCd = Math.max(5, Math.floor(11 * this.haste));
      effects.push({ id: ++this.effectId, x: target.x, y: target.y, icon: this.elements.includes('火') ? '🔥' : '✦', ttl: 6 });
      if (this.elements.includes('火')) target.hp -= 0.25;
      if (this.elements.includes('水')) target.speed = Math.max(0.1, target.speed * 0.8);
      if (this.elements.includes('地')) enemies.forEach(e => { if (e.id !== target.id && dist(target,e) < 13) e.hp -= 0.3; });
    }
    const dead = enemies.filter(e => e.hp <= 0); enemies = enemies.filter(e => e.hp > 0);
    if (dead.length) { this.kills += dead.length; this.setData({ xp: this.data.xp + dead.length }); }
    const collision = enemies.some(e => dist(p,e) < (e.boss ? 7 : 5));
    if (collision && this.stageTicks % 8 === 0) { const hp = Math.max(0, this.data.hp - (enemies.some(e=>e.boss) ? 5 : 2)); this.setData({ hp }); if (!hp) return this.finish(false); }
    if (this.data.xp >= this.data.xpNeed) return this.levelUp();
    if (this.bossSpawned && !enemies.some(e => e.boss)) this.completeStage();
    this.setData({ enemies, effects, progress: Math.min(100, Math.floor(this.stageTicks / 500 * 100)), xpPct: Math.min(100, this.data.xp / this.data.xpNeed * 100), player: p });
  },
  levelUp() {
    const pool = UPGRADES.slice(); const choices = [];
    while (choices.length < 3) { const i = Math.floor(Math.random() * pool.length); choices.push({ ...pool.splice(i,1)[0] }); }
    this.setData({ showChoice: true, choices });
  },
  chooseUpgrade(e) {
    const u = this.data.choices[e.currentTarget.dataset.index];
    if (u.kind === 'power') this.power *= 1.25;
    if (u.kind === 'haste') this.haste *= 0.82;
    if (u.kind === 'health') this.setData({ hp: Math.min(100, this.data.hp + 25) });
    if (u.kind === 'fire' || u.kind === 'water' || u.kind === 'earth') { const name = {fire:'火',water:'水',earth:'地'}[u.kind]; if (!this.elements.includes(name)) this.elements.push(name); else this.power *= 1.12; }
    const level = this.data.level + 1, xp = this.data.xp - this.data.xpNeed, xpNeed = Math.ceil(this.data.xpNeed * 1.35);
    this.setData({ level, xp, xpNeed, xpPct: xp / xpNeed * 100, showChoice: false, elementName: this.elements.length ? this.elements.join('+') : '白板' });
    if (xp >= xpNeed) this.levelUp();
  },
  completeStage() {
    this.bossSpawned = false; this.stageTicks = 0;
    if (this.data.stage >= 5) return this.finish(true);
    const next = this.data.stage + 1;
    if (next === 5) { this.notify('四象记忆归一：你是盘古留下的神念。天道现身！'); }
    else this.notify(MEMORIES[next - 2] || '记忆碎片涌现。');
    this.setData({ stage: next, stageName: STAGES[next - 1], progress: 0, hp: Math.min(100, this.data.hp + 15) });
    setTimeout(() => { if (!this.data.ended) this.spawnEnemy(); }, 700);
  },
  finish(win) {
    this.stopLoops(); this.setData({ ended: true, endingTitle: win ? '开天一念' : '神念归寂', endingCopy: win ? '你镇压天道，重演地火风水。天地初生，第一缕晨光照亮人间。此后万物将走向何方？' : '盘古神念暂归混沌。已苏醒的记忆仍留在心中。' });
  },
  restart() { this.setData({ view: 'game' }); this.resetGame(); },
  onTouchStart(e) { this.touchMove(e); }, onTouchMove(e) { this.touchMove(e); }, onTouchEnd() { this.touching = false; },
  touchMove(e) {
    if (this.data.showChoice || this.data.ended) return;
    const t = e.touches[0]; const info = wx.getSystemInfoSync();
    const x = Math.max(5, Math.min(95, t.clientX / info.windowWidth * 100));
    const y = Math.max(12, Math.min(90, (t.clientY - 90) / Math.max(250, info.windowHeight - 220) * 100));
    this.player = { x, y }; this.setData({ player: this.player });
  },
  dash() { if (this.dashing || this.data.ended) return; this.dashing = true; const hp = Math.min(100, this.data.hp + 5); this.setData({ hp }); this.player.x = Math.max(5, Math.min(95, this.player.x + (Math.random() > .5 ? 14 : -14))); this.setData({ player: this.player }); setTimeout(() => this.dashing = false, 1800); }
});
function dist(a,b) { const x=a.x-b.x,y=a.y-b.y; return Math.sqrt(x*x+y*y); }



