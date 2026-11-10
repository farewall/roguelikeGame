'use strict';
const { BannerCombat, normalized } = require('./banner');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
class ArtifactCombat extends BannerCombat {
  constructor() { super(); this.energy = 100; this.skillCooldown = 0; this.skillUses = 0; this.lastAimDirection = { x: 0, y: -1 }; }
  gainEnergy(amount) {
    const before = this.energy; this.energy = clamp(this.energy + amount, 0, 100);
    if (before < 100 && this.energy >= 100) this.emit('skill-ready');
  }
  updateArtifacts(dt) {
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    if (this.enemies.some(e => e.hp > 0 && !e.spawnTime)) this.gainEnergy(2.5 * dt);
    this.updateBlades(dt);
    this.updateBellWaves(dt);
  }
  skillDirection(direction) {
    const closest = this.nearest(this.enemies.filter(e => e.hp > 0 && !e.spawnTime));
    return normalized(direction) || (closest && normalized(this.vector(this.player, closest))) || this.lastAimDirection;
  }
  useSkill(direction) {
    if (this.ended || this.cleared || this.enrage || this.energy < 100 || this.skillCooldown > 0) return false;
    direction = this.skillDirection(direction);
    this.energy = 0; this.skillCooldown = 1; this.skillUses++; this.pendingAttack = null; this.attackCd = Math.max(0.5, this.attackCd);
    this.lastAimDirection = direction;
    const origin = { ...this.player }, damage = this.damage();
    if (this.weapon === 'bell') {
      this.invulnerable = Math.max(this.invulnerable, 0.55);
      this.effect('bell-summon', origin, 110, { life: 0.75 });
      this.followups.push({ kind: 'dominion', center: origin, remaining: 0.12, damage: damage * 2.8 });
    } else {
      const start = this.point(origin), end = this.percent({ x: start.x + direction.x * 650, y: start.y + direction.y * 650 });
      this.followups.push({ kind: 'rift', center: origin, end, width: 100, remaining: 0.22, damage: damage * 5 });
      this.effect('rift-windup', origin, 650, { end, width: 100, life: 0.22 });
    }
    this.emit('skill', { weapon: this.weapon, direction }); this.collectDeaths(); return true;
  }
  resolveRift(f) {
    const line = { shape: 'line', ...f.center, end: f.end, width: f.width };
    for (const e of this.enemies) if (e.hp > 0 && !e.spawnTime && this.contains(line, e)) this.deal(e, f.damage, 'skill');
    this.effect('rift', f.center, 650, { end: f.end, width: f.width, life: 0.85 });
    this.hazard({ ...line, delay: 0, duration: 1.2, label: '裂', kind: 'rift', friendly: true, skill: true, dps: f.damage * 0.16 });
  }
}
module.exports = { ArtifactCombat, normalized };
