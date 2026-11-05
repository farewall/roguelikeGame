// Chaos is the substance of every creature. Remnants have no collision or rewards.
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const rows = { wraith: 0, ranged: 1, charger: 2, elite: 3 };
export function creatureSize(e) {
  return e.boss ? (e.bossType === 5 ? 205 : 200) : e.kind === 'elite' ? 142 : e.kind === 'ranged' ? 106 : e.kind === 'charger' ? 112 : e.fodder ? 65 : 82;
}
function smoke(v, layer, id, tile, x, y, w, h, alpha) {
  return v.image(layer, id, v.assets.frames.chaosMist[tile], x - w / 2, y - h / 2, w, h, clamp(alpha));
}
export function drawCondensation(v, layer, e, p, size) {
  const t = clamp(1 - e.spawnTime / e.spawnDuration);
  smoke(v, layer, 'condense-' + e.id, 4, p.x, p.y + size * 0.2, size * (1.3 - t * 0.35), size * 0.55, (1 - t) * 0.8);
  smoke(v, layer, 'condense-rise-' + e.id, 1, p.x, p.y, size, size, (1 - t) * 0.75);
}
export function drawRemnant(v, layer, body, p) {
  const t = clamp(body.age / body.life), size = creatureSize(body), direction = body.hitDirection;
  // Physical recoil -> unstable silhouette -> mist -> a low eddy -> nothing.
  if (t < 0.64) {
    const column = t < 0.18 ? 4 : 5;
    const texture = body.boss ? v.assets.frames.bosses[body.bossType - 1][column] : v.assets.frames.enemies[(rows[body.kind] || 0) * 6 + column];
    const punch = Math.sin(clamp(t / 0.18) * Math.PI), scale = 1 - t * 0.12;
    const w = size * scale * (1 + punch * 0.12), h = size * scale * (1 - punch * 0.08);
    const sprite = v.image(layer, 'remnant-body-' + body.id, texture, p.x - w / 2 + direction.x * 10 * clamp(t * 5), p.y - h / 2 + direction.y * 10 * clamp(t * 5), w, h, t < 0.18 ? 1 : clamp((0.64 - t) / 0.46));
    sprite.tint = t < 0.12 ? 0xffead2 : 0xffffff;
  }
  const fog = clamp((t - 0.12) / 0.2) * clamp((1 - t) / 0.35);
  if (fog > 0) {
    const count = body.boss ? 5 : body.kind === 'elite' ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count + body.id * 0.71 + t * 1.3;
      const spread = size * (0.08 + t * 0.23), w = size * (0.48 + t * 0.4);
      smoke(v, layer, 'remnant-fog-' + body.id + '-' + i, i % 4, p.x + Math.cos(angle) * spread, p.y + Math.sin(angle) * spread * 0.35 - size * t * 0.13, w, w * 0.8, fog * 0.7);
    }
    const eddy = smoke(v, layer, 'remnant-eddy-' + body.id, 4, p.x, p.y + size * 0.24, size * (0.8 + t * 0.25), size * 0.38, fog * clamp(t * 2) * 0.7);
    eddy.tint = 0xb6bdc0;
    // Essence belongs to the reward; the creature's body leaves no solid debris.
    smoke(v, layer, 'remnant-essence-' + body.id, 5, p.x, p.y - size * t * 0.3, size * 0.75, size * 0.75, fog * 0.65);
  }
}
