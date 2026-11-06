'use strict';
const METEOR = { impactWindow: 0.28, damage: 11, burnDamage: 4 };
function meteorPhase(h) { return h.age < h.delay ? 'falling' : h.age < h.delay + METEOR.impactWindow ? 'impact' : 'burning'; }
module.exports = { METEOR, meteorPhase };
