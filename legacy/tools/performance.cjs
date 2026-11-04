'use strict';
// Payload fixture only. Does not measure WeChat frame rate or native bridge latency.
const { setup } = require('./game-harness.cjs');
function benchmark() {
  const h = setup({ windowInfo: { windowWidth: 844, windowHeight: 390 }, arenaRect: { left: 20, top: 50, width: 804, height: 290 } });
  const { game } = h, c = game.combat; c.enemies = []; c.remaining = 0; c.attackCd = 100;
  for (let i = 0; i < 5; i++) {
    const e = c.spawn('wraith'); Object.assign(e, { x: 75 + i * 2, y: 25, hp: 100, maxHp: 100, speed: 30, cooldown: 99 });
    c.circle({ x: 5, y: 10 + i * 10 }, 40, 20, 2, '羽', 'flame');
  }
  game.measureRendering = true;
  for (let frame = 0; frame < 60; frame++) { h.elapse(50); game.tick(); game.moveFrame(); }
  const stats = { ...game.renderStats, reductionPercent: Number(((1 - game.renderStats.bytes / game.renderStats.fullBytes) * 100).toFixed(1)), scope: '3s / 60 combat updates; simulated setData UTF-8 payload only' };
  game.onUnload(); return stats;
}
if (require.main === module) console.log(JSON.stringify(benchmark(), null, 2));
module.exports = { benchmark };
