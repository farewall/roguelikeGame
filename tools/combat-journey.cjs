'use strict';
// Deterministic ordinary-HP core simulation, with actual movement speed and choices.
const { Combat, PLAYER_SPEED } = require('../game/core/combat');
const { movement, upgrade, random } = require('./journey-policy.cjs');
function run(weapon, seed, path = weapon === 'bell' ? 'echo' : 'sweep') {
  const c = new Combat(weapon, random(seed)); c.configureArena(800, 280, 0.52); const stages = [], details = [], upgradeTimes = []; let bossStart = null, maxEnemies = 0;
  for (let frame = 0; frame < 24000 && !c.ended; frame++) {
    if (c.cleared) {
      stages.push(Number(c.time.toFixed(1))); details.push({ stage: c.stage, bossSeconds: Number((c.time - bossStart).toFixed(1)), level: c.level, damage: Number(c.damage().toFixed(1)), interval: Number(c.interval().toFixed(2)), upgrades: { ...(weapon === 'bell' ? c.bellUpgrades : c.bannerUpgrades) } }); bossStart = null;
      if (c.stage === 5) return { weapon, seed, won: true, seconds: Math.round(c.time), hp: c.hp, kills: c.kills, stages, details, upgradeTimes, maxEnemies, level: c.level, path: c.path, skills: c.skillUses };
      if (c.stage === 1) c.choosePath(path);
      if (c.stage === 2) { const e = c.createEncounter(); c.resolveEncounter(e.choices.some(o => o.id === 'rest') ? 'rest' : 'insight'); }
      c.advanceStage();
    }
    if (c.xp >= c.xpNeed) { const pick = upgrade(c, c.choices()); c.upgrade(pick.kind); c.xp -= c.xpNeed; c.level++; c.xpNeed = c.nextXpNeed(); upgradeTimes.push(Number(c.time.toFixed(1))); }
    if (c.phase === 3 && bossStart === null) bossStart = c.time;
    maxEnemies = Math.max(maxEnemies, c.enemies.length);
    const targets = c.enemies.filter(e => e.hp > 0 && !e.spawnTime && c.distance(c.player, e) <= (weapon === 'bell' ? 330 : 650));
    if (c.energy >= 100 && c.skillCooldown <= 0 && targets.length && (targets.some(e => e.boss) || targets.length >= 4 || c.hp < 55 || c.rootTime > 0)) c.useSkill();
    c.move(c.player, movement(c), PLAYER_SPEED * 0.05); c.player.x = Math.min(94, Math.max(6, c.player.x)); c.player.y = Math.min(82, Math.max(20, c.player.y));
    c.update(0.05); c.drainEvents();
  }
  return { weapon, seed, won: false, seconds: Math.round(c.time), hp: c.hp, kills: c.kills, stage: c.stage, details, level: c.level, damage: c.damage() };
}
module.exports = { run };
