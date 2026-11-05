'use strict';
const { BellCombat } = require('./bell');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function normalized(direction) {
  const length = direction && Math.hypot(direction.x, direction.y);
  return Number.isFinite(length) && length > 0.001 ? { x: direction.x / length, y: direction.y / length } : null;
}
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
class ArtifactCombat extends BellCombat {
  constructor() { super(); this.projectiles = []; this.energy = 100; this.skillCooldown = 0; this.skillUses = 0; this.lastAimDirection = { x: 0, y: -1 }; }
  gainEnergy(amount) {
    const before = this.energy; this.energy = clamp(this.energy + amount, 0, 100);
    if (before < 100 && this.energy >= 100) this.emit('skill-ready');
  }
  bladeAngles() { return this.path === 'sweep' ? [-40, -20, 0, 20, 40] : this.path === 'rend' ? [0] : [-16, 0, 16]; }
  launchBlades(attack, origin, range) {
    const direction = normalized(attack.direction) || this.lastAimDirection;
    this.lastAimDirection = direction;
    const angle = Math.atan2(direction.y, direction.x);
    this.projectiles.push({ id: ++this.nextId, origin, direction, targetId: attack.targetId, hitIds: new Set(), registered: false,
      traveled: 0, range, bolts: this.bladeAngles().map(offset => ({ ...origin, previous: { ...origin }, direction: { x: Math.cos(angle + offset * Math.PI / 180), y: Math.sin(angle + offset * Math.PI / 180) } })) });
    this.effect('banner-cast', origin, 54, { angle: angle * 180 / Math.PI, life: 0.3 }); this.emit('launch', { weapon: 'banner' });
  }
  updateArtifacts(dt) {
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    if (this.enemies.some(e => e.hp > 0)) this.gainEnergy(2.5 * dt);
    for (const volley of this.projectiles) {
      const travel = Math.min(720 * dt, volley.range - volley.traveled), targets = [];
      for (const bolt of volley.bolts) {
        bolt.previous = { x: bolt.x, y: bolt.y };
        const start = this.point(bolt), end = { x: start.x + bolt.direction.x * travel, y: start.y + bolt.direction.y * travel };
        Object.assign(bolt, this.percent(end));
        for (const e of this.enemies) if (e.hp > 0 && !volley.hitIds.has(e.id) && distanceToSegment(this.point(e), start, end) <= (e.boss ? 30 : 18) + 10) {
          volley.hitIds.add(e.id); targets.push(e);
        }
      }
      volley.traveled += travel;
      if (targets.length) this.applyStrike(volley, targets, volley.origin);
    }
    this.projectiles = this.projectiles.filter(v => v.traveled < v.range - 0.001);
    this.updateBellWaves(dt);
  }
  skillDirection(direction) {
    const closest = this.nearest(this.enemies.filter(e => e.hp > 0));
    return normalized(direction) || (closest && normalized(this.vector(this.player, closest))) || this.lastAimDirection;
  }
  useSkill(direction) {
    if (this.ended || this.cleared || this.energy < 100 || this.skillCooldown > 0) return false;
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
    for (const e of this.enemies) if (e.hp > 0 && this.contains(line, e)) this.deal(e, f.damage, 'skill');
    this.effect('rift', f.center, 650, { end: f.end, width: f.width, life: 0.85 });
    this.hazard({ ...line, delay: 0, duration: 1.2, label: '裂', kind: 'rift', friendly: true, skill: true, dps: f.damage * 0.16 });
  }
}
module.exports = { ArtifactCombat, normalized };
