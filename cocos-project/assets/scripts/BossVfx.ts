import { UITransform } from 'cc';
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const COLORS = [0x92d5a1, 0xf2dfb7, 0xffa16b, 0x9ddde5, 0xd9c7fa];

// Pose changes carry the wind-up. Hit flashes must not hide a casting pose.
export function creatureMotion(e: any, time: number) {
  const cast = e.visualState === 'cast', dash = e.visualState === 'dash', release = e.visualState === 'release', recover = e.visualState === 'recover';
  const pulse = Math.sin((e.visualAge || 0) * 8), boss = e.bossType || 0;
  let sx = 1, sy = 1, dy = 0, angle = 0;
  if (cast) {
    if (e.kind === 'charger' || boss === 2) { sx = 1.12; sy = 0.78; dy = 15; }
    else if (e.kind === 'ranged') { sx = 1.05 + pulse * 0.025; sy = 1.08; dy = -4; }
    else if (e.kind === 'elite') { sx = 0.94; sy = 1.12; dy = -9; }
    else if (boss === 1) { sx = e.attackType === 'tail' ? 1.16 : 0.91; sy = e.attackType === 'tail' ? 0.9 : 1.08; angle = (e.attackType === 'tail' ? 8 : 0) + pulse * 2; }
    else if (boss === 3) { sx = e.attackType === 'fire' ? 1.28 : 1.16; sy = e.attackType === 'fire' ? 0.94 : 1.08; dy = -14 - pulse * 3; }
    else if (boss === 4) { sx = 1.07; sy = 0.84; dy = 12; }
    else if (boss === 5) { sy = 1.06; dy = -11; }
  } else if (dash) { sx = 1.2; sy = 0.83; dy = -12; }
  else if (release) { sx = boss === 3 ? 1.2 : 1.08; sy = 1.08; dy = -5; }
  else if (recover) { sy = 0.92; dy = 8; angle = (boss === 2 ? -7 : -2) + pulse * 1.2; }
  if (e.phase2) { sx *= 1.035; sy *= 1.035; }
  return { sx, sy, dy, angle };
}

export function drawCreatureTell(v: any, layer: any, e: any, p: any, size: number) {
  const casting = e.visualState === 'cast', recovering = e.visualState === 'recover';
  if ((!casting && !recovering && !e.phase2) || e.spawnTime > 0) return;
  const g = layer.g, color = e.boss ? COLORS[e.bossType - 1] : e.kind === 'ranged' ? 0x9bd9e6 : 0xe2c3a1;
  const angle = e.attackAngle === undefined ? Math.atan2(v.c.player.y - e.y, v.c.player.x - e.x) : e.attackAngle;
  const dx = Math.cos(angle), dy = Math.sin(angle), age = e.visualAge || 0;
  const tile = (id, index, x, y, w, h, alpha, atlas = v.assets.frames.spells) => {
    const sprite = v.image(layer, 'tell-' + e.id + '-' + id, atlas[index], x, y, w, h, alpha);
    sprite.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5);
    return sprite;
  };
  if (casting) {
    const charge = clamp(age / 0.8), x = p.x + dx * size * 0.29, y = p.y + dy * size * 0.18 - size * 0.12;
    if (e.kind === 'ranged' || e.bossType === 5) {
      // Mouth / palms visibly gather light. No ray projects onto the floor.
      tile('gather', 2, x, y, 25 + charge * 18, 20 + charge * 12, 0.45 + charge * 0.45);
      for (let i = 0; i < 4; i++) {
        const t = (age * 1.2 + i / 4) % 1, a = i * 2.4, r = (1 - t) * size * 0.3;
        g.lineStyle(2, color, t * 0.65); g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.lineTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
      }
    } else if (e.bossType === 3) {
      for (const side of [-1, 1]) tile('wing-' + side, 12 + Math.floor(age * 8) % 4, p.x + side * size * 0.32, p.y - size * 0.22, 45, 47, 0.3 + charge * 0.25, v.assets.frames.meteor);
    } else if (e.bossType === 1) {
      const x = p.x + dx * size * 0.3, y = p.y - size * 0.16;
      for (let i = 0; i < 3; i++) {
        const sway = Math.sin(age * 5 + i) * 3, length = 8 + charge * 10;
        g.lineStyle(2, 0x97d48a, 0.7); g.moveTo(x - dx * i * 7, y + i * 4); g.lineTo(x + dx * length, y - length * 0.4 + sway);
      }
    } else if (e.bossType === 4) {
      // Small streams converge beneath the shell before the outward sea wave.
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, r = size * (0.35 + (1 - (age + i / 6) % 1) * 0.12);
        tile('gather-water-' + i, 4, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.4 + size * 0.22, 40, 19, 0.35);
      }
    } else if (e.kind === 'charger' || e.bossType === 2) {
      for (const side of [-1, 1]) tile('paw-' + side, 2, p.x + dx * size * 0.3 - dy * side * size * 0.14, p.y + size * 0.25 + side * size * 0.04, 18 + charge * 10, 8, 0.45 + charge * 0.2);
    } else if (e.kind === 'elite') {
      tile('raised-claw', 2, p.x + dx * size * 0.2, p.y - size * 0.32, 27, 27, 0.55);
    }
  }
  if (e.bossType === 4 && e.shielded && e.coreAngle !== undefined) {
    const x = p.x + Math.cos(e.coreAngle) * size * 0.27, y = p.y + Math.sin(e.coreAngle) * size * 0.2;
    tile('open-core', 2, x, y, 30, 24, 0.72 + Math.sin(age * 7) * 0.15);
    g.lineStyle(3, 0xe7e9b8, 0.85); g.moveTo(x - 6, y - 10); g.lineTo(x, y); g.lineTo(x + 7, y + 10);
  }
  if (e.bossType === 5) {
    // The broken law-ring belongs to the body, high above the ground.
    const x = p.x, y = p.y - size * 0.3, r = size * 0.3;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + age * 0.15;
      g.lineStyle(recovering ? 2 : 3, color, recovering ? 0.28 : 0.65);
      g.arc(x, y, r + (recovering ? 12 : 0), a + 0.12, a + 0.7);
    }
  }
}

export function drawEnrage(v: any) {
  const c = v.c, rage = c.data.bossTransition;
  if (!rage || c.data.view !== 'game') return;
  const { w, h } = c.layout, layer = v.begin('overlay'); v.regions = [];
  const t = clamp(rage.age / rage.duration), entry = clamp(t / 0.18), exit = clamp((1 - t) / 0.16);
  const burst = Math.exp(-Math.pow((t - 0.45) / 0.07, 2)), shake = Math.sin(t * 145) * burst * 7;
  v.rect(layer, 0, 0, w, h, 0x07131a, 0.93 * Math.min(entry, exit), null, 0);
  const x = w * 0.37 + shake, y = h * 0.45, grow = 1 + burst * 0.13;
  const size = (350 + entry * 60) * grow;
  // Each element erupts from the same solid silhouette, rather than hiding it.
  const g = layer.g;
  for (let i = 0; i < 13; i++) {
    const a = i * Math.PI * 2 / 13 + 0.3, inner = size * (0.32 + t * 0.15), outer = inner + 35 + burst * 95;
    g.lineStyle(i % 3 === 0 ? 5 : 2, rage.color, (0.22 + burst * 0.55) * exit);
    g.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner * 0.65);
    g.lineTo(x + Math.cos(a + 0.035) * outer, y + Math.sin(a + 0.035) * outer * 0.65);
  }
  const frame = t < 0.28 ? 2 : rage.pose, texture = v.assets.frames.bosses[rage.bossType - 1][frame];
  const sprite = v.image(layer, 'enrage-boss', texture, x - size / 2, y - size / 2, size, size, entry * exit);
  sprite.tint = burst > 0.5 ? 0xffeddf : 0xffffff;
  if (rage.bossType === 3) for (let i = 0; i < 7; i++) {
    const r = (70 + i * 25) * entry, a = i * 2.4 + t * 2;
    v.image(layer, 'enrage-fire-' + i, v.assets.frames.meteor[12 + i % 4], x + Math.cos(a) * r - 38, y + 90 + Math.sin(a) * r * 0.28 - 30, 76, 60, 0.5 * exit);
  }
  if (rage.bossType === 4) for (let i = 0; i < 9; i++) {
    const a = i * Math.PI * 2 / 9, r = 100 + entry * 75 + burst * 30;
    v.image(layer, 'enrage-sea-' + i, v.assets.frames.spells[4], x + Math.cos(a) * r - 35, y + 95 + Math.sin(a) * r * 0.28 - 15, 70, 30, 0.7 * exit);
  }
  const tx = w * 0.61, tw = Math.min(520, w * 0.32);
  v.text(layer, 'enrage-kicker', (rage.bossType === 5 ? '天道法则' : '四象法则') + ' · 第二阶段', tx, h * 0.27, 22, rage.color, { alpha: entry * exit });
  v.text(layer, 'enrage-title', rage.title, tx - (1 - entry) * 50, h * 0.36, 57, rage.color, { serif: true, bold: true, alpha: entry * exit });
  v.text(layer, 'enrage-copy', rage.copy, tx, h * 0.53, 26, 0xe3ddca, { wrap: tw, alpha: entry * exit });
  v.text(layer, 'enrage-note', '凝神 · 观察新的起手动作', tx, h * 0.67, 20, 0x9eaaa5, { alpha: entry * exit });
  const menu = c.viewport.menuButton, right = Math.max(35, menu && menu.left ? w - menu.left / c.rpxScale + 20 : 35);
  v.button(layer, 'enrage-pause', '暂停', w - right - 100, 20, 100, 55, () => c.openSettings(), { size: 23 });
}
