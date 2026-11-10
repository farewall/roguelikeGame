'use strict';
const { BannerCombat } = require('./banner');
const SWORDS = { count: 4, radius: 96, depth: 0.64, size: 108, idleSpeed: 0.9, range: 164, interval: 1.2, damage: 3.2,
  marginX: 208, marginTop: 168, marginBottom: 148, names: ['诛仙', '戮仙', '陷仙', '绝仙'] };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function segmentDistance(p, a, b) {
  const x = b.x - a.x, y = b.y - a.y;
  const t = clamp(((p.x - a.x) * x + (p.y - a.y) * y) / (x * x + y * y || 1), 0, 1);
  return Math.hypot(p.x - a.x - x * t, p.y - a.y - y * t);
}
function sweptBladeContact(p, before, after, radius) {
  const polygon = [before.base, before.tip, after.tip, after.base];
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (segmentDistance(p, a, b) <= radius + 5) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
class SwordCombat extends BannerCombat {
  constructor() { super(); this.swordAngle = 0; this.swordStrike = null; this.swordPrevious = null; }
  swordPoses() {
    const player = this.point(this.player), attack = this.swordStrike;
    const expansion = attack && attack.skill ? 1 + 0.45 * Math.sin(Math.PI * clamp(attack.age / attack.duration, 0, 1)) : 1;
    return SWORDS.names.map((name, index) => {
      const phase = this.swordAngle + Math.PI / 4 + index * Math.PI / 2, depth = Math.sin(phase), dx = Math.cos(phase), dy = depth * SWORDS.depth;
      const length = Math.hypot(dx, dy), direction = { x: dx / length, y: dy / length }, size = SWORDS.size * (0.86 + depth * 0.14);
      const center = { x: player.x + dx * SWORDS.radius * expansion, y: player.y - 10 + dy * SWORDS.radius * expansion };
      return { index, name, ...this.percent(center), depth, size, angle: -Math.atan2(direction.y, direction.x) * 180 / Math.PI - 90,
        blade: { base: { x: center.x - direction.x * size * 0.2, y: center.y - direction.y * size * 0.2 }, tip: { x: center.x + direction.x * size * 0.46, y: center.y + direction.y * size * 0.46 } } };
    });
  }
  launchSwordSweep(attack, skill = false) {
    this.swordStrike = { id: ++this.nextId, ...attack, skill, swordSweep: true, registered: false, age: 0,
      duration: skill ? 0.7 : Math.min(0.36, this.interval() * 0.6), damage: attack.damage ?? this.damage(),
      elements: { ...(attack.elements || this.elements) }, hitIds: new Set() };
    this.lastAimDirection = attack.direction || this.lastAimDirection;
    this.emit('sword-release', { skill });
  }
  updateSwords(dt) {
    if (this.weapon !== 'swords') return;
    const before = this.swordPrevious || this.swordPoses(), attack = this.swordStrike;
    const activeTime = attack ? Math.min(dt, attack.duration - attack.age) : 0;
    // Four actual blades cover a quarter revolution per ordinary slash.
    this.swordAngle = (this.swordAngle + SWORDS.idleSpeed * dt + (attack ? activeTime * (attack.skill ? Math.PI * 2 : Math.PI / 2) / attack.duration : 0)) % (Math.PI * 2);
    if (attack) attack.age += activeTime;
    const poses = this.swordPoses(); this.swordPrevious = poses;
    if (!attack) return;
    const targets = [];
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.spawnTime > 0 || attack.hitIds.has(e.id)) continue;
      if (!poses.some((pose, i) => sweptBladeContact(this.point(e), before[i].blade, pose.blade, e.boss ? 30 : 18))) continue;
      attack.hitIds.add(e.id); targets.push(e);
    }
    if (attack.skill) for (const e of targets) { this.deal(e, attack.damage, 'skill'); this.effect('impact', e, 32); }
    else if (targets.length) this.applyStrike(attack, targets, this.player);
    if (attack.age >= attack.duration - 1e-7) this.swordStrike = null;
  }
}
module.exports = { SWORDS, SwordCombat, sweptBladeContact };
