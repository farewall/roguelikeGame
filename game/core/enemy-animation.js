'use strict';
// Six columns per role. All clocks advance with combat, so overlays/backgrounding
// freeze both the telegraph and the sprite that communicates it.
const ENEMY_ROWS = { wraith: 0, ranged: 1, charger: 2, elite: 3 };
function advanceEnemyAnimation(enemy, dt, releasing = false) {
  if (enemy.freezeTime > 0) return;
  const state = enemy.dashing ? 'dash' : releasing ? 'release' : enemy.castTime > 0 ? 'cast' : enemy.recoverTime > 0 ? 'recover' : 'idle';
  if (state !== enemy.visualState) { enemy.visualState = state; enemy.visualAge = 0; }
  else enemy.visualAge = (enemy.visualAge || 0) + dt;
}
function enemyFrame(enemy) {
  const row = ENEMY_ROWS[enemy.kind] || 0;
  return row * 6 + pose(enemy);
}
function pose(enemy) {
  if (enemy.visualState === 'dash' || enemy.visualState === 'release') return 3;
  if (enemy.visualState === 'cast') return 2;
  if (enemy.hitTime > 0) return 4;
  if (enemy.visualState === 'recover') return 1;
  return Math.floor((enemy.visualAge || 0) * (enemy.boss ? 2 : 6) + (enemy.id || 0) % 2) % 2;
}
function bossFrame(enemy) { return pose(enemy); }
module.exports = { ENEMY_ROWS, advanceEnemyAnimation, enemyFrame, bossFrame };
