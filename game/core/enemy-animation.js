'use strict';
// Six columns per role. All clocks advance with combat, so overlays/backgrounding
// freeze both the telegraph and the sprite that communicates it.
const ENEMY_ROWS = { wraith: 0, ranged: 1, charger: 2, elite: 3 };
function advanceEnemyAnimation(enemy, dt) {
  if (enemy.freezeTime > 0) return;
  const state = enemy.dashing ? 'dash' : enemy.castTime > 0 ? 'cast' : enemy.recoverTime > 0 ? 'recover' : 'idle';
  if (state !== enemy.visualState) { enemy.visualState = state; enemy.visualAge = 0; }
  else enemy.visualAge = (enemy.visualAge || 0) + dt;
}
function enemyFrame(enemy) {
  const age = enemy.visualAge || 0, row = ENEMY_ROWS[enemy.kind] || 0;
  let column;
  if (enemy.kind === 'wraith') column = (Math.floor(age * 6) + enemy.id % 6) % 6;
  else if (enemy.visualState === 'dash') column = 3;
  else if (enemy.visualState === 'cast') {
    column = enemy.kind === 'charger' ? 2 : age < 0.45 ? 2 : age < 0.85 ? 3 : 4;
  } else if (enemy.visualState === 'recover') column = age < 0.22 ? 4 : 5;
  else column = Math.floor(age * 3 + enemy.id % 2) % 2;
  return row * 6 + column;
}
module.exports = { ENEMY_ROWS, advanceEnemyAnimation, enemyFrame };
