'use strict';
// World progression is sampled at spawn time; player levels never buff enemies.
const XP_BASE = 5, XP_GROWTH = 1.1;
function experienceNeed(level) { return Math.ceil(XP_BASE * Math.pow(XP_GROWTH, Math.max(0, level - 1))); }
function waveQuota(stage, phase) { return [14 + stage * 3, 18 + stage * 3, 6 + Math.floor((stage - 1) / 2), 0][phase]; }
function enemyProfile(stage, phase, seconds, kind) {
  const s = Math.max(1, Math.min(5, stage)), i = s - 1;
  const pressure = 1 + Math.min(3, Math.floor(Math.max(0, seconds) / 25)) * 0.08;
  const wave = kind === 'boss' ? 1 : 1 + Math.min(2, Math.max(0, phase)) * 0.04;
  const hp = { wraith: [4, 9, 19, 34, 56], ranged: [5, 11, 24, 44, 72], charger: [6, 13, 28, 51, 84], elite: [20, 42, 80, 135, 210], boss: [105, 180, 330, 520, 780] }[kind][i];
  return { hp: Math.round(hp * pressure * wave), damageScale: 1 + i * 0.08, speedScale: 1 + i * 0.045, pressure };
}
module.exports = { experienceNeed, waveQuota, enemyProfile };
