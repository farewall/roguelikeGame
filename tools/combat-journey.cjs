'use strict';
// Deterministic ordinary-HP core simulation, with actual movement speed and choices.
const { Combat, PLAYER_SPEED } = require('../game/core/combat');
const { movement, upgrade, random } = require('./journey-policy.cjs');
function run(weapon, seed, path = weapon === 'bell' ? 'echo' : 'sweep') {
  const c = new Combat(weapon, random(seed)); c.configureArena(800, 280, 0.52); const stages = [];
  for (let frame = 0; frame < 24000 && !c.ended; frame++) {
    if (c.cleared) {
      stages.push(Number(c.time.toFixed(1)));
      if (c.stage === 5) return { weapon, seed, won: true, seconds: Math.round(c.time), hp: c.hp, kills: c.kills, stages, path: c.path };
      if (c.stage === 1) c.choosePath(path);
      if (c.stage === 2) { const e = c.createEncounter(); c.resolveEncounter(e.choices.some(o => o.id === 'rest') ? 'rest' : 'insight'); }
      c.advanceStage();
    }
    if (c.xp >= c.xpNeed) { const pick = upgrade(c, c.choices()); c.upgrade(pick.kind); c.xp -= c.xpNeed; c.xpNeed = Math.ceil(c.xpNeed * 1.25); c.level++; }
    c.move(c.player, movement(c), PLAYER_SPEED * 0.05); c.player.x = Math.min(94, Math.max(6, c.player.x)); c.player.y = Math.min(82, Math.max(20, c.player.y));
    c.update(0.05); c.drainEvents();
  }
  return { weapon, seed, won: false, seconds: Math.round(c.time), hp: c.hp, kills: c.kills, stage: c.stage };
}
module.exports = { run };
