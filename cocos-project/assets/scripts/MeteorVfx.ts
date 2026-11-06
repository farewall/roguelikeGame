import { UITransform } from 'cc';
import { METEOR, meteorPhase } from './generated/game-core';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function drawMeteor(v, layer, h, p) {
  const g = layer.g, phase = meteorPhase(h), age = h.age - h.delay, r = h.radius;
  const fade = phase === 'burning' ? clamp((h.delay + h.duration - h.age) / 0.3) : 1;
  const tile = (id, index, x, y, w, height, alpha) => {
    const sprite = v.image(layer, 'meteor-' + h.id + '-' + id, v.assets.frames.meteor[index], x, y, w, height, alpha);
    sprite.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5);
  };
  // The locked footprint is visible through warning, impact and burning.
  g.lineStyle(phase === 'falling' ? 1.8 : 2.5, 0xff9e4e, fade * (phase === 'falling' ? 0.7 : 0.9)); g.drawCircle(p.x, p.y, r);
  if (phase === 'falling') {
    const warning = clamp(h.age / h.delay), t = clamp((warning - 0.15) / 0.85);
    tile('target', 2, p.x, p.y, r * 1.25, r * 1.25, warning * 0.45);
    g.lineStyle(1.5, 0xffc67a, 0.5); g.arc(p.x, p.y, r * 0.92, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * warning);
    if (warning > 0.15) {
      const x = p.x + (1 - t * t) * r * 1.9, y = p.y - (1 - t * t) * r * 2.9;
      tile('fall', 0, x + 9, y - 14, 76, 96, clamp(t * 4));
    }
    return;
  }
  const frame = Math.floor(Math.max(0, age) * 8) % 4;
  tile('ground', 8 + frame, p.x, p.y, r * 2, r * 2, fade * (phase === 'impact' ? 0.6 : 0.95));
  if (phase === 'impact') {
    const t = clamp(age / METEOR.impactWindow);
    tile('burst', 4 + Math.min(3, Math.floor(t * 4)), p.x, p.y - r * 0.25, r * 2.15, r * 2.4, 1 - t * 0.3);
    g.lineStyle(6 * (1 - t) + 1, 0xffdf9b, (1 - t) * 0.85); g.drawCircle(p.x, p.y, Math.max(1, r * t));
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + h.id, distance = r * t * 0.65;
      tile('debris-' + i, 3, p.x + Math.cos(angle) * distance, p.y + Math.sin(angle) * distance - Math.sin(t * Math.PI) * 24, 22, 22, (1 - t) * 0.85);
    }
  } else {
    // Low, distributed flames keep the character and the whole footprint readable.
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + h.id;
      tile('flames-' + i, 12 + (frame + i) % 4, p.x + Math.cos(angle) * r * 0.35, p.y + Math.sin(angle) * r * 0.3 - r * 0.12, r * 0.9, r * 0.6, fade * 0.65);
    }
    for (let i = 0; i < 6; i++) {
      const t = (age * 0.6 + i / 6) % 1, angle = i * 2.4 + h.id;
      g.lineStyle(0); g.beginFill(0xffb459, fade * (1 - t) * 0.6); g.drawCircle(p.x + Math.cos(angle) * r * 0.6, p.y + Math.sin(angle) * r * 0.4 - t * 24, 1.5); g.endFill();
    }
  }
}
