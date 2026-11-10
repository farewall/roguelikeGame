'use strict';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const facing = (c, a, b) => { const d = c.vector(a, b); return Math.atan2(d.y, d.x); };

// Shared by collision and presentation. These are attacks, never UI outlines.
function attackLine(h) {
  const t = clamp((h.age - h.delay) / (h.growth || h.duration || 1), 0, 1);
  if (h.moving) {
    const dx = h.moving.x * t, dy = h.moving.y * t;
    return { x: h.x + dx, y: h.y + dy, end: { x: h.end.x + dx, y: h.end.y + dy } };
  }
  return { x: h.x, y: h.y, end: h.growing ? { x: h.x + (h.end.x - h.x) * t, y: h.y + (h.end.y - h.y) * t } : h.end };
}
function waveBand(h) {
  if (!h.wave) return { radius: h.radius, inner: h.inner || 0 };
  const t = clamp((h.age - h.delay) / h.duration, 0, 1);
  const radius = h.wave.from + (h.wave.to - h.wave.from) * t;
  return { radius, inner: Math.max(0, radius - h.wave.width) };
}
function sectorAngle(h) {
  const t = clamp((h.age - h.delay) / h.duration, 0, 1);
  return h.sweep ? h.angle - h.halfAngle + h.halfAngle * 2 * t : h.angle + (h.turn || 0) * t;
}
function inAngleGap(h, dx, dy) { return h.gapAngle !== undefined && Math.abs(angleDelta(Math.atan2(dy, dx), h.gapAngle)) < h.gapHalf; }
function shellMultiplier(c, enemy, origin = c.player) {
  if (!enemy.shielded) return 1;
  if (enemy.coreAngle === undefined) return 0.55;
  return Math.abs(angleDelta(facing(c, enemy, origin), enemy.coreAngle)) <= 0.72 ? 1.15 : 0.55;
}

const ENRAGE = [
  { title: '青龙怒啸', copy: '根脉交生 · 万木争春', color: 0x87d2a1, pose: 3 },
  { title: '白虎暴怒', copy: '落地转身 · 连扑追猎', color: 0xf2dfb3, pose: 4 },
  { title: '朱雀焚天', copy: '收翼浴火 · 陨羽连坠', color: 0xffa26b, pose: 3 },
  { title: '玄武震怒', copy: '缩甲聚海 · 重浪迭生', color: 0x8bd5e3, pose: 4 },
  { title: '天道震怒', copy: '法环崩裂 · 四象敕令', color: 0xd9c1ff, pose: 3 }
];

function pounce(c, e, second = false) {
  const origin = { x: e.x, y: e.y }, direction = c.vector(origin, c.player);
  const length = clamp(c.distance(origin, c.player) + 85, 180, 680), p = c.point(origin);
  const end = c.percent({ x: p.x + direction.x * length, y: p.y + direction.y * length });
  end.x = clamp(end.x, 6, 94); end.y = clamp(end.y, 14, 86);
  if (c.world) { const offset=c.world.footOffset(e),hit=c.world.clip(c.groundPoint(e),{x:p.x+direction.x*length,y:p.y+direction.y*length+offset},40);hit.y-=offset;Object.assign(end,c.percent(hit)); }
  e.attackAngle = Math.atan2(direction.y, direction.x);
  e.attackName = second ? '转身追扑' : '伏身扑杀';
  c.hazard({ shape: 'line', ...origin, end, width: 82, delay: second ? 0.78 : 0.95, duration: 0.4,
    label: '扑', kind: 'slash', owner: e.id, dash: true, pounce: true, damage: 15, second });
  c.emit('cast', { name: e.name });
}

function roots(c, e, alternating = false) {
  const origin = { x: e.x, y: e.y }, angle = facing(c, e, c.player) + (alternating ? Math.PI / 7 : 0);
  e.attackAngle = angle; e.attackName = alternating ? '根脉交生' : '盘身引木';
  const start = c.point(origin), length = clamp(c.distance(origin, c.player) + 110, 240, 540);
  for (const offset of [-0.72, 0, 0.72]) {
    const a = angle + offset;
    const from = c.percent({ x: start.x + Math.cos(a) * 58, y: start.y + Math.sin(a) * 58 });
    const end = c.percent({ x: start.x + Math.cos(a) * length, y: start.y + Math.sin(a) * length });
    c.hazard({ shape: 'line', ...from, end, width: 24, delay: 1.05, duration: 1.65,
      growing: true, growth: 0.95, rootBranch: true, kind: 'root', label: '藤', damage: 9, owner: e.id });
  }
}
function tail(c, e) {
  const angle = facing(c, e, c.player); e.attackAngle = angle; e.attackName = '盘龙扫尾';
  c.hazard({ shape: 'sector', x: e.x, y: e.y, radius: 190, inner: 45, angle, halfAngle: 1.08, sweep: true,
    delay: 0.95, duration: 0.3, label: '尾', kind: 'tail', damage: 11, owner: e.id });
  c.emit('cast', { name: e.name });
}
function meteor(c, e, index, phase2) {
  // Each feather locks only when it leaves the wing. Earlier feathers never home.
  e.attackAngle = facing(c, e, c.player); e.attackName = '振翼陨火';
  c.hazard({ shape: 'circle', x: c.player.x, y: c.player.y, radius: 58, delay: 1.1,
    duration: 2.2, label: '陨', kind: 'flame', meteor: true, damage: 11, burnDamage: 4,
    owner: e.id, feather: index, flightOrigin: { x: e.x, y: e.y }, phase2 });
}
function fireWave(c, e, phase2) {
  if (c.world) {
    const start=c.point(e), player=c.point(c.player), sign=player.x>=start.x?1:-1, half=Math.min(330,c.viewHeight*0.55), gap=clamp(player.y,start.y-half+100,start.y+half-100);
    e.attackAngle=sign>0?0:Math.PI; e.attackName='扇翼焚风';
    for (const [y,endY] of [[start.y-half,gap-85],[gap+85,start.y+half]]) {
      if(endY<=y) continue;
      const a=c.percent({x:start.x+sign*48,y}),b=c.percent({x:start.x+sign*48,y:endY});
      c.hazard({shape:'line',...a,end:b,width:36,delay:1,duration:2.1,moving:{x:sign*780/c.width*100,y:0},kind:'flame',label:'焚',damage:10,owner:e.id,fireWave:true,gapY:gap/c.height*100,opening:85/c.height*100});
    }
    c.emit('cast',{name:e.name}); return;
  }
  // The wave is split around a real, 170-unit opening. Existing fires have faded
  // before this front reaches the player; all motion is visible flame and ember.
  const left = e.x < 50, x = left ? 7 : 93, gap = clamp(c.player.y, 27, 73), half = 85 / c.height * 100;
  e.attackAngle = left ? 0 : Math.PI; e.attackName = '扇翼焚风';
  for (const [y, endY] of [[4, gap - half], [gap + half, 96]]) {
    if (endY <= y) continue;
    c.hazard({ shape: 'line', x, y, end: { x, y: endY }, width: 36, delay: 1,
      duration: phase2 ? 1.65 : 1.9, moving: { x: left ? 86 : -86, y: 0 },
      kind: 'flame', label: '焚', damage: 10, owner: e.id, fireWave: true, gapY: gap, opening: half });
  }
  c.emit('cast', { name: e.name });
}
function seaWave(c, e, index, phase2) {
  const angle = e.coreAngle === undefined ? facing(c, e, c.player) + Math.PI / 2 : e.coreAngle;
  e.attackName = index ? '重浪迭生' : '缩甲聚海';
  const range = phase2 ? 390 : 340;
  c.hazard({ shape: 'ring', x: e.x, y: e.y, radius: range, inner: range - 42,
    wave: { from: 66, to: range, width: 42 }, gapAngle: angle + (index % 2 ? 0.42 : 0), gapHalf: 0.48,
    delay: 1.15, duration: 1.55, kind: 'tide', label: '浪', damage: 10, owner: e.id, push: true });
  c.emit('cast', { name: e.name });
}
function decree(c, e) {
  e.attackName = '敕令裁决'; e.attackAngle = facing(c, e, c.player);
  const start = c.point(e), direction = c.vector(e, c.player);
  const end = c.percent({ x: start.x + direction.x * Math.min(800, c.distance(e, c.player) + 150), y: start.y + direction.y * Math.min(800, c.distance(e, c.player) + 150) });
  c.hazard({ shape: 'line', x: e.x, y: e.y, end, width: 38, delay: 1.15, duration: 0.32,
    kind: 'order', label: '敕', damage: 12, owner: e.id, decree: true });
  c.emit('cast', { name: e.name });
}

function execute(c, e, cue, plan) {
  e.attackType = cue.type; e.visualState = ''; e.visualAge = 0;
  switch (cue.type) {
    case 'roots': roots(c, e, cue.alternating); break;
    case 'tail': tail(c, e); break;
    case 'pounce': pounce(c, e, cue.second); break;
    case 'meteor': meteor(c, e, cue.index, plan.phase2); break;
    case 'fire': fireWave(c, e, plan.phase2); break;
    case 'wave': seaWave(c, e, cue.index || 0, plan.phase2); break;
    case 'decree': decree(c, e); break;
  }
}
function beginBossPattern(c, e, stage, phase2) {
  e.sequence = (e.sequence || 0) + 1; e.chargeHit = false;
  const cue = (at, type, data = {}) => ({ at, type, ...data });
  let cues, castEnd, duration;
  if (stage === 1) {
    cues = [cue(0, 'roots'), ...(phase2 ? [cue(1.7, 'roots', { alternating: true })] : []), cue(phase2 ? 3.6 : 1.9, 'tail')];
    castEnd = phase2 ? 4.85 : 3.15; duration = castEnd + 1.25;
  } else if (stage === 2) {
    cues = [cue(0, 'pounce'), ...(phase2 ? [cue(1.45, 'pounce', { second: true })] : [])];
    castEnd = phase2 ? 2.63 : 1.35; duration = castEnd + (phase2 ? 1.55 : 1.35);
  } else if (stage === 3) {
    cues = Array.from({ length: phase2 ? 5 : 3 }, (_, i) => cue(i * 0.32, 'meteor', { index: i }));
    cues.push(cue(phase2 ? 3.9 : 3.25, 'fire')); castEnd = phase2 ? 6.55 : 6.15; duration = castEnd + 1.15;
  } else if (stage === 4) {
    e.attackAngle = facing(c, e, c.player); e.coreAngle = e.attackAngle + (e.sequence % 2 ? 1 : -1) * Math.PI / 2;
    if(c.world) e.coreAngle=c.world.openDirection(c.point(e),e.coreAngle);
    cues = [cue(0, 'wave'), ...(phase2 ? [cue(1, 'wave', { index: 1 }), cue(2, 'wave', { index: 2 })] : [])];
    castEnd = phase2 ? 4.7 : 2.7; duration = castEnd + 1.55;
  } else {
    const pairing = (e.sequence - 1) % 2;
    // Authored pairs, with a calm interval after the decree and each major hit.
    cues = pairing === 0 ? [cue(0, 'decree'), cue(1.9, 'roots'), cue(phase2 ? 4.65 : 4.85, 'pounce')]
      : [cue(0, 'decree'), cue(1.9, 'meteor', { index: 0 }), cue(2.3, 'meteor', { index: 1 }), cue(5.75, 'wave')];
    castEnd = pairing === 0 ? (phase2 ? 6 : 6.2) : 8.45; duration = castEnd + 1.4;
  }
  e.bossPattern = { stage, phase2, age: 0, cues, next: 0, castEnd, duration };
  advanceBossPattern(c, e, 0);
}
function advanceBossPattern(c, e, dt) {
  const plan = e.bossPattern; if (!plan) return;
  plan.age += dt;
  while (plan.next < plan.cues.length && plan.cues[plan.next].at <= plan.age + 1e-6) execute(c, e, plan.cues[plan.next++], plan);
  e.castTime = Math.max(0, plan.castEnd - plan.age); e.recoverTime = Math.max(0, plan.duration - plan.age);
  e.shielded = e.bossType === 4 && e.castTime > 0;
  if (plan.age >= plan.duration) { e.bossPattern = null; e.attackName = ''; e.shielded = false; }
}
function startEnrage(c, e) {
  e.phase2 = true; e.bossPattern = null; e.dashing = false; e.castTime = e.recoverTime = 0; e.shielded = false;
  c.hazards = c.hazards.filter(h => h.owner !== e.id); c.rootTime = 0; c.rootSourceId = null;
  c.pendingAttack = null; c.enrage = { owner: e.id, bossType: e.bossType, name: e.name, age: 0, duration: 1.8, ...ENRAGE[e.bossType - 1] };
  c.emit('boss-phase', { name: e.name });
}
function advanceEnrage(c, dt) {
  const transition = c.enrage; if (!transition) return;
  const owner = c.enemies.find(e => e.id === transition.owner && e.hp > 0);
  if (!owner || c.ended || c.cleared) { c.enrage = null; return; }
  transition.age += Math.max(0, dt);
  if (transition.age >= transition.duration) {
    c.enrage = null; owner.cooldown = 0.65; owner.recoverTime = 0.4; owner.hitTime = 0;
    c.invulnerable = Math.max(c.invulnerable, 0.65); c.emit('boss-enraged', { name: owner.name });
  }
}

module.exports = { attackLine, waveBand, sectorAngle, inAngleGap, shellMultiplier, angleDelta,
  ENRAGE, beginBossPattern, advanceBossPattern, startEnrage, advanceEnrage };
