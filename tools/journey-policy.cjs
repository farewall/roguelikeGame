'use strict';
const { WEAPONS, PLAYER_SPEED } = require('../game/core/combat');
function movement(c, bounds = { xMin: 6, xMax: 94, yMin: 20, yMax: 82 }) {
  const target = c.nearest(c.enemies.filter(e => !e.spawnTime)); if (!target) return { x: 0, y: 0 };
  let best = { score: Infinity, x: 0, y: 0 };
  for (let i = 0; i < 17; i++) {
    const angle = i * Math.PI / 8, dir = i === 16 ? { x: 0, y: 0 } : { x: Math.cos(angle), y: Math.sin(angle) };
    const next = { ...c.player }, future = { ...c.player }; c.move(next, dir, PLAYER_SPEED * 0.05); c.move(future, dir, PLAYER_SPEED * 0.3);
    for (const p of [next, future]) { p.x = Math.min(bounds.xMax, Math.max(bounds.xMin, p.x)); p.y = Math.min(bounds.yMax, Math.max(bounds.yMin, p.y)); }
    let score = Math.abs(c.distance(future, target) - c.attackRange() * (c.weapon === 'bell' ? 0.82 : 0.65)) * 0.4;
    if (target.shielded && target.coreAngle !== undefined) {
      const from = c.vector(target, future), a = Math.atan2(from.y, from.x) - target.coreAngle;
      score += Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 90;
    }
    for (const h of c.hazards) if (!h.friendly) {
      if (h.shape === 'circle') score += Math.max(0, h.radius + 70 - c.distance(future, h)) * 5;
      if (h.fireWave && h.age >= h.delay) {
        const t = Math.min(1, (h.age - h.delay) / h.duration), x = h.x + h.moving.x * t;
        const seconds = Math.abs((x - future.x) / h.moving.x * h.duration);
        if (seconds < 1.15) score += Math.max(0, Math.abs(future.y - h.gapY) - h.opening * 0.72) * c.height / 100 * 2;
      }
      // Plan around the vine's visible final boundary, including future growth.
      const danger = h.kind === 'root' ? { ...h, age: Math.max(h.age, h.delay + 0.65) } : h;
      if (c.contains(danger, next)) score += h.active ? 2000 : 300;
      if (c.contains(danger, future)) score += h.active ? 1500 : 500;
      // Read the direction of an actual moving wave/front, and plan where it
      // will be rather than chasing the empty space directly ahead of it.
      if (h.wave || h.moving || h.pounce) {
        const projected = { ...h, age: h.age + 0.3, active: h.age + 0.3 >= h.delay };
        if (h.pounce) {
          const at = age => { const t = Math.max(0, Math.min(1, (age - h.delay) / h.duration)); return { x: h.x + (h.end.x - h.x) * t, y: h.y + (h.end.y - h.y) * t }; };
          projected.swept = { ...at(h.age), end: at(projected.age) };
        }
        if (projected.active && projected.age < h.delay + h.duration && c.contains(projected, future)) score += 1600;
      }
    }
    for (const e of c.enemies) if (c.distance(next, e) < 48) score += 200;
    if (score < best.score) best = { score, ...dir };
  }
  return { x: best.x, y: best.y };
}
function upgrade(c, offers, build = 'balanced') {
  if (c.weapon === 'banner' && c.hp >= 55) {
    const mechanic = offers.find(u => ['blades', 'split'].includes(u.kind) && !c.bannerUpgrades[u.kind]);
    if (mechanic) return mechanic;
  }
  if (c.weapon === 'bell' && c.hp >= 55) {
    const range = offers.find(u => u.kind === 'range');
    if (range && !c.bellUpgrades.range) return range;
    if (c.level % 4 === 0) {
      const weapon = offers.find(u => ['echo', 'resonance', 'range'].includes(u.kind) && c.bellUpgrades[u.kind] < (u.kind === 'range' ? 2 : 1));
      if (weapon) return weapon;
    }
  }
  const desired = c.hp < 55 ? 'health' : !c.elements.fire && build === 'balanced' ? 'fire' : !c.elements.water && build === 'balanced' ? 'water' : build !== 'balanced' && c.elements[build] < 4 ? build : c.level % 3 === 0 ? 'haste' : 'power';
  return offers.find(u => u.kind === desired) || offers.find(u => u.kind === 'power') || offers[0];
}
function random(seed) { let state = seed; return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296); }
module.exports = { movement, upgrade, random };
