'use strict';
const { WEAPONS, PLAYER_SPEED } = require('../game/core/combat');
function movement(c, bounds = { xMin: 6, xMax: 94, yMin: 20, yMax: 82 }) {
  const target = c.nearest(c.enemies); if (!target) return { x: 0, y: 0 };
  let best = { score: Infinity, x: 0, y: 0 };
  for (let i = 0; i < 17; i++) {
    const angle = i * Math.PI / 8, dir = i === 16 ? { x: 0, y: 0 } : { x: Math.cos(angle), y: Math.sin(angle) };
    const next = { ...c.player }, future = { ...c.player }; c.move(next, dir, PLAYER_SPEED * 0.05); c.move(future, dir, PLAYER_SPEED * 0.3);
    for (const p of [next, future]) { p.x = Math.min(bounds.xMax, Math.max(bounds.xMin, p.x)); p.y = Math.min(bounds.yMax, Math.max(bounds.yMin, p.y)); }
    let score = Math.abs(c.distance(future, target) - WEAPONS[c.weapon].range * 0.65) * 0.4;
    for (const h of c.hazards) if (!h.friendly) {
      if (c.contains(h, next)) score += h.active ? 2000 : 300;
      if (c.contains(h, future)) score += h.active ? 1500 : 500;
    }
    for (const e of c.enemies) if (c.distance(next, e) < 48) score += 200;
    if (score < best.score) best = { score, ...dir };
  }
  return { x: best.x, y: best.y };
}
function upgrade(c, offers, build = 'balanced') {
  const desired = c.hp < 55 ? 'health' : !c.elements.fire && build === 'balanced' ? 'fire' : !c.elements.water && build === 'balanced' ? 'water' : build !== 'balanced' && c.elements[build] < 4 ? build : c.level % 3 === 0 ? 'haste' : 'power';
  return offers.find(u => u.kind === desired) || offers.find(u => u.kind === 'power') || offers[0];
}
function random(seed) { let state = seed; return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296); }
module.exports = { movement, upgrade, random };
