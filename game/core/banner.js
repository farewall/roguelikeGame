'use strict';
const { BellCombat } = require('./bell');
const BANNER = { speed: 720, splitSpeed: 800, maxBolts: 128 };
function normalized(direction) {
  const length = direction && Math.hypot(direction.x, direction.y);
  return Number.isFinite(length) && length > 0.001 ? { x: direction.x / length, y: direction.y / length } : null;
}
// Earliest swept contact, including targets already touching the blade.
function firstContact(center, start, end, radius) {
  const x = start.x - center.x, y = start.y - center.y, dx = end.x - start.x, dy = end.y - start.y;
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy, b = x * dx + y * dy, discriminant = b * b - a * c;
  if (!a || discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
class BannerCombat extends BellCombat {
  constructor() { super(); this.projectiles = []; this.bannerUpgrades = { blades: 0, split: 0 }; }
  bladeCount(tier = this.bannerUpgrades.blades) { return (this.path === 'sweep' ? 5 : this.path === 'rend' ? 1 : 3) + tier * 2; }
  bladeAngles() {
    const count = this.bladeCount(), half = this.path === 'sweep' ? 40 : this.path === 'rend' ? 12 : 16 + this.bannerUpgrades.blades * 4;
    return Array.from({ length: count }, (_, i) => count === 1 ? 0 : -half + i * half * 2 / (count - 1));
  }
  splitStats(tier = this.bannerUpgrades.split) { return { count: tier ? tier + 1 : 0, multiplier: 0.4 + tier * 0.05, range: 180 + tier * 20 }; }
  bannerLabel() { return `混沌刃 ${this.bladeCount()}道` + (this.bannerUpgrades.split ? ` · 分裂 ${this.splitStats().count}道` : ' · 贯穿'); }
  launchBlades(attack, origin, range) {
    const offsets = this.bladeAngles();
    if (this.projectiles.reduce((n, v) => n + v.bolts.length, 0) + offsets.length > BANNER.maxBolts) return;
    const direction = normalized(attack.direction) || this.lastAimDirection, angle = Math.atan2(direction.y, direction.x);
    this.lastAimDirection = direction;
    this.projectiles.push({ id: ++this.nextId, origin: { ...origin }, direction, targetId: attack.targetId, hitIds: new Set(), splitHitIds: new Set(), registered: false,
      bannerVolley: true, damage: this.damage(), elements: { ...this.elements }, splitTier: this.bannerUpgrades.split,
      traveled: 0, range, bolts: offsets.map(offset => ({ ...origin, previous: { ...origin }, direction: { x: Math.cos(angle + offset * Math.PI / 180), y: Math.sin(angle + offset * Math.PI / 180) }, splitUsed: false })) });
    this.effect('banner-cast', origin, 54, { angle: angle * 180 / Math.PI, life: 0.3 }); this.emit('launch', { weapon: 'banner' });
  }
  splitBlade(volley, bolt, contact, target, children, capacity) {
    if (!volley.splitTier || bolt.splitUsed || volley.split) return;
    bolt.splitUsed = true;
    const stats = this.splitStats(volley.splitTier);
    if (capacity < stats.count) return;
    const origin = this.percent(contact), angle = Math.atan2(bolt.direction.y, bolt.direction.x);
    children.push({ id: ++this.nextId, origin, direction: bolt.direction, ignoreId: target.id, hitIds: volley.splitHitIds, registered: true,
      bannerVolley: true, split: true, damage: volley.damage * stats.multiplier, elements: { ...volley.elements }, traveled: 0, range: stats.range,
      bolts: Array.from({ length: stats.count }, (_, i) => {
        const turn = angle + (-32 + i * 64 / (stats.count - 1)) * Math.PI / 180;
        return { ...origin, previous: { ...origin }, direction: { x: Math.cos(turn), y: Math.sin(turn) }, splitUsed: true };
      }) });
    this.effect('blade-split', origin, 45, { angle: angle * 180 / Math.PI, life: 0.22 });
  }
  updateBlades(dt) {
    const children = [];
    let capacity = BANNER.maxBolts - this.projectiles.reduce((n, v) => n + v.bolts.length, 0);
    for (const volley of this.projectiles) {
      const travel = Math.min((volley.split ? BANNER.splitSpeed : BANNER.speed) * dt, volley.range - volley.traveled), targets = [];
      for (const bolt of volley.bolts) {
        bolt.previous = { x: bolt.x, y: bolt.y };
        const start = this.point(bolt), end = { x: start.x + bolt.direction.x * travel, y: start.y + bolt.direction.y * travel };
        const contacts = [];
        for (const e of this.enemies) {
          if (e.hp <= 0 || e.spawnTime > 0 || e.id === volley.ignoreId) continue;
          const t = firstContact(this.point(e), start, end, (e.boss ? 30 : 18) + (volley.split ? 6 : 10));
          if (t !== null) contacts.push({ e, t });
        }
        contacts.sort((a, b) => a.t - b.t || a.e.id - b.e.id);
        if (contacts.length && volley.splitTier && !bolt.splitUsed) {
          const { e, t } = contacts[0], before = children.length;
          this.splitBlade(volley, bolt, { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }, e, children, capacity);
          if (children.length > before) capacity -= children[children.length - 1].bolts.length;
        }
        Object.assign(bolt, this.percent(end));
        for (const { e } of contacts) if (!volley.hitIds.has(e.id)) { volley.hitIds.add(e.id); targets.push(e); }
      }
      volley.traveled += travel;
      if (targets.length) this.applyStrike(volley, targets, volley.origin);
    }
    // New fragments begin next tick, so no recursive or instant secondary hits.
    this.projectiles = this.projectiles.filter(v => v.traveled < v.range - 0.001).concat(children);
  }
}
module.exports = { BANNER, BannerCombat, firstContact, normalized };
