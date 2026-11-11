'use strict';
// Actual page/controller, joystick events, animation states and scheduled modal delays.
// The WeChat bridge, frame clock and audio device remain mocked.
const { setup, upgradeEvent, touch } = require('./game-harness.cjs');
const { movement, upgrade, random } = require('./journey-policy.cjs');
function runPage(weapon, seed, path, build = 'balanced', viewport = { windowWidth: 844, windowHeight: 390 }, exploration = false) {
  const h = setup({ weapon, exploration, nativeLayout: true, windowInfo: viewport, arenaRect: { left: 20, top: 50, width: viewport.windowWidth - 40, height: viewport.windowHeight - 100 } });
  const { game } = h, c = game.combat; c.random = random(seed); const stages = [];
  let choices = 0, rewards = 0, frames = 0;
  for (; frames < 48000 && !game.data.showEnding; frames++) {
    if (game.data.showMemory) {
      stages.push(c.stage);
      if (game.data.rewardChoices.length) {
        const selected = game.data.rewardKind === 'path' ? path : game.data.rewardChoices.some(o => o.id === 'rest') ? 'rest' : 'insight';
        game.selectMemoryReward({ currentTarget: { dataset: { reward: selected } } }); rewards++;
      }
      game.continueStage();
    }
    if (game.data.showChoice) {
      const pick = upgrade(c, game.data.choices, build), index = game.data.choices.findIndex(u => u.id === pick.id);
      game.chooseUpgrade(upgradeEvent(game, index)); choices++;
    }
    if (!game.isBlocked()) {
      const skillRange = weapon === 'bell' ? 330 : weapon === 'swords' ? 500 : 650;
      const targets = c.enemies.filter(e => e.hp > 0 && !e.spawnTime && c.distance(c.player, e) <= skillRange);
      if (c.energy >= 100 && c.skillCooldown <= 0 && targets.length && (targets.some(e => e.boss) || targets.length >= 4 || c.hp < 55 || c.rootTime > 0)) game.castSkill();
      const dir = movement(c, game.playerBounds()), r = game.joystickRect, x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (!game.touchOrigin) game.onTouchStart({ touches: [touch(x, y)] });
      game.onTouchMove({ touches: [touch(x + dir.x * 64 * game.rpxScale, y + dir.y * 64 * game.rpxScale)] });
    }
    h.elapse(25); game.tick(); game.moveFrame();
    for (const [name, timer] of Object.entries(game.pendingTimers || {})) if (1000 + (frames + 1) * 25 - timer.startedAt >= timer.remaining) h.fireTimer(game[name]);
    // Do not retain every bridge patch during a long automated run.
    h.dataWrites.length = 0;
  }
  const result = { weapon, seed, path: c.path, won: game.data.won, stage: c.stage, stages, choices, rewards, skills: c.skillUses, level: c.level, seconds: Math.round(c.time), wallSeconds: frames * 0.025, hp: c.hp, build: c.buildLabel(), report: c.battleReport(), ending: game.data.showEnding, cause: c.lastDamageName, exploration:Boolean(c.world),worldName:c.world?c.world.name:'' };
  game.onUnload(); return result;
}
module.exports = { runPage };
