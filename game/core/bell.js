'use strict';
const BELL = { range: 180, speed: 640, interval: 1.2, resonanceStart: 0.75, resonanceMultiplier: 1.3, echoDelay: 0.32, skillDelay: 0.12 };
class BellCombat {
  constructor() { this.bellWaves = []; this.bellUpgrades = { range: 0, echo: 0, resonance: 0 }; }
  bellRange() { return BELL.range * Math.pow(1.15, this.bellUpgrades.range); }
  bellThreshold(tier = this.bellUpgrades.echo) { return Math.max(1, (this.path === 'echo' ? 2 : 3) - (tier >= 2 ? 1 : 0)); }
  echoRange() { return this.bellRange() * (this.path === 'echo' ? 1.2 : 1.12); }
  bellLabel() { return Object.entries(this.bellUpgrades).filter(([, tier]) => tier > 0).map(([kind, tier]) => ({ range: '钟域', echo: '回响', resonance: '共鸣' }[kind]) + tier + '重').join(' · '); }
  launchBellWave(origin, options = {}) {
    const wave = { id: ++this.nextId, origin: { ...origin }, radius: 0, age: 0, range: this.bellRange(), speed: BELL.speed,
      damage: this.damage(), resonanceStart: BELL.resonanceStart - this.bellUpgrades.resonance * 0.05, resonanceMultiplier: BELL.resonanceMultiplier + this.bellUpgrades.resonance * 0.15, echoTier: this.bellUpgrades.echo, kind: 'normal', bellWave: true, hitIds: new Set(), distances: new Map(), elements: { ...this.elements }, ...options };
    for (const e of this.enemies) wave.distances.set(e.id, this.distance(wave.origin, e));
    this.bellWaves.push(wave); if (this.bellWaves.length > 12) this.bellWaves.shift();
    this.emit('bell-release', { kind: wave.kind }); return wave;
  }
  registerBellHit(wave) {
    const threshold = this.bellThreshold(wave.echoTier || 0);
    if (this.strikeCount % threshold) return;
    const range = wave.range * (this.path === 'echo' ? 1.2 : 1.12), tier = wave.echoTier || 0;
    this.followups.push({ kind: 'bell-echo', center: { ...wave.origin }, radius: range, remaining: BELL.echoDelay - tier * 0.04,
      damage: wave.damage * ((this.path === 'echo' ? 0.65 : 0.45) + tier * 0.1), elements: { ...wave.elements } });
    if (tier >= 3) {
      const first = this.followups[this.followups.length - 1];
      this.followups.push({ ...first, remaining: first.remaining + 0.18, damage: first.damage * 0.5, elements: { ...first.elements } });
    }
    if (this.path === 'ward') { this.wardTime = 5; this.effect('ward', this.player, 70); }
  }
  applyBellElements(e, damage, levels) {
    if (levels.fire) { e.burnTime = 2 + levels.fire * 0.65; e.burnDps = Math.max(e.burnDps || 0, damage * (0.12 + levels.fire * 0.07)); }
    if (levels.water) e.slowTime = 2 + levels.water * 0.55;
    if (levels.earth) { e.fractureTime = 2 + levels.earth * 0.25; e.fractureStrength = 0.08 + levels.earth * 0.04; }
  }
  updateBellWaves(dt) {
    for (const wave of this.bellWaves) {
      const before = wave.radius; wave.age += dt; wave.radius = Math.min(wave.range, wave.radius + wave.speed * dt);
      if (before >= wave.range) continue;
      const targets = [];
      for (const e of this.enemies) {
        if (e.hp <= 0 || e.spawnTime > 0 || wave.hitIds.has(e.id)) continue;
        const d = this.distance(wave.origin, e), previous = wave.distances.has(e.id) ? wave.distances.get(e.id) : d;
        wave.distances.set(e.id, d);
        // Relative swept crossing: moving targets can enter/escape the wavefront.
        const from = previous - before, to = d - wave.radius;
        if (d <= wave.range + 1e-6 && ((from >= -1e-6 && to <= 1e-6) || (from <= 0 && to >= 0))) { wave.hitIds.add(e.id); targets.push(e); }
      }
      if (!targets.length) continue;
      if (wave.kind === 'normal') this.applyStrike(wave, targets, wave.origin);
      else for (const e of targets) {
        this.deal(e, wave.damage, wave.kind === 'skill' ? 'skill' : 'echo'); this.effect('impact', e, wave.kind === 'skill' ? 45 : 25);
        if (wave.kind === 'echo') { this.applyBellElements(e, wave.damage, wave.elements); if (wave.elements.earth >= 4) e.freezeTime = Math.max(e.freezeTime, e.boss ? 0.1 : 0.35); }
        if (wave.kind === 'skill') {
          if (!e.boss) {
            this.move(e, this.vector(wave.origin, e), 85); e.freezeTime = Math.max(e.freezeTime, 1.1);
            e.castTime = 0; e.recoverTime = Math.max(e.recoverTime, 1.1); e.dashing = false;
            this.hazards = this.hazards.filter(h => h.owner !== e.id);
          } else e.freezeTime = Math.max(e.freezeTime, 0.15);
        }
      }
    }
    this.bellWaves = this.bellWaves.filter(w => w.age < w.range / w.speed + 0.14);
  }
  releaseDominion(f) { this.launchBellWave(this.player, { kind: 'skill', range: 330, speed: 1000, damage: f.damage }); }
  breakBellWard() {
    for (const e of this.enemies) if (!e.boss && e.hp > 0 && !e.spawnTime && this.distance(this.player, e) <= 120) {
      this.move(e, this.vector(this.player, e), 28); e.freezeTime = Math.max(e.freezeTime, 0.12);
    }
    this.effect('ward-break', this.player, 120, { life: 0.35 });
  }
}
module.exports = { BELL, BellCombat };
