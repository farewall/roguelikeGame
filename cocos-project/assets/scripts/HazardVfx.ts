import { UITransform } from 'cc';
import { attackLine, waveBand, sectorAngle, inAngleGap } from './generated/game-core';
import { drawRootHazard } from './VineVfx';
import { drawMeteor } from './MeteorVfx';
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));

// Only physical attacks are drawn. Wind-up comes from the caster's body.
// There are no ground outlines, lanes, arrows or area-of-effect markers.
export function drawHazard(v: any, layer: any, h: any, point: (p: any) => any) {
  if (h.meteor) { drawMeteor(v, layer, h, point(h), point); return; }
  if (h.kind === 'root') { drawRootHazard(v, layer, h, point(h), point); return; }
  if (h.age < h.delay) return;
  const g = layer.g, p = point(h), age = h.age - h.delay;
  const fade = clamp((h.duration - age) / 0.25), prefix = 'spell-' + h.id + '-';
  const tile = (id: string, index: number, x: number, y: number, w: number, height: number, opacity: number, angle = 0, atlas = v.assets.frames.spells) => {
    const sprite = v.image(layer, prefix + id, atlas[index], x, y, w, height, opacity * fade);
    sprite.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5); sprite.node.angle = -angle;
  };
  if (h.shape === 'line') {
    const line = attackLine(h), a = point(line), b = point(line.end);
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1, angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (h.kind === 'slash') {
      const t = clamp(age / h.duration), body = { x: p.x + dx * t, y: p.y + dy * t };
      // Claws and dust follow the beast, never the entire attack lane.
      for (let i = 0; i < 3; i++) {
        const back = 16 + i * 17;
        tile('claw-' + i, 5, body.x - dx / length * back, body.y - dy / length * back, 65 - i * 10, h.width * 0.7, 0.9 - i * 0.23, angle);
      }
      for (let i = 0; i < 3; i++) tile('dust-' + i, i % 4, body.x - dx / length * (25 + i * 20), body.y - dy / length * (25 + i * 20) + 30, 48 + i * 8, 24, 0.2, 0, v.assets.frames.chaosMist);
    } else if (h.kind === 'flame' || h.kind === 'lava') {
      const count = Math.max(2, Math.ceil(length / 38));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        tile('fire-' + i, 12 + (i + Math.floor(age * 8)) % 4, a.x + dx * t, a.y + dy * t - 6, h.width * 1.35, h.width * 1.3, 0.82, 0, v.assets.frames.meteor);
      }
    } else {
      const color = h.kind === 'order' ? 0xe8d7ff : h.kind === 'rift' ? 0xb4e8db : 0xbee5f2;
      g.lineStyle(h.width * 0.4, color, fade * 0.22); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      g.lineStyle(h.width * 0.12, 0xf5f5e4, fade * 0.9); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      for (let i = 0; i < 3; i++) {
        const t = (age * 3 + i / 3) % 1;
        tile('breath-' + i, 2, a.x + dx * t, a.y + dy * t, 74, Math.min(h.width * 1.4, 55), 0.75, angle);
      }
    }
    return;
  }
  if (h.shape === 'sector') {
    const a = sectorAngle(h);
    for (let i = 0; i < 5; i++) {
      const r = (h.inner || 0) + (h.radius - (h.inner || 0)) * (i + 0.5) / 5;
      tile('tail-' + i, 5, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 55, 42, 0.8, a * 180 / Math.PI);
    }
    return;
  }
  if (h.shape === 'ring') {
    const { radius, inner } = waveBand(h), r = (radius + inner) / 2, count = Math.max(10, Math.ceil(r * Math.PI * 2 / 34));
    if (h.kind === 'tide') {
      // A rolling body of water, with an uneven foam lip and a fading wake.
      // This is the damaging crest itself; no predictive boundary is drawn.
      const samples = Math.max(24, Math.ceil(radius * Math.PI * 2 / 18)), step = Math.PI * 2 / samples;
      for (let i = 0; i < samples; i++) {
        const a = i * step, b = a + step;
        if (inAngleGap(h, Math.cos(a), Math.sin(a)) || inAngleGap(h, Math.cos(b), Math.sin(b))) continue;
        const wave = angle => Math.sin(angle * 9 + age * 8 + h.id) * 3 + Math.sin(angle * 17 - age * 11) * 1.5;
        const outerA = radius + wave(a), outerB = radius + wave(b), wakeA = Math.max(0, inner - 12 + wave(a)), wakeB = Math.max(0, inner - 12 + wave(b));
        g.lineStyle(0); g.beginFill(0x236d82, fade * 0.46);
        g.drawPolygon([p.x + Math.cos(a) * wakeA, p.y + Math.sin(a) * wakeA, p.x + Math.cos(a) * outerA, p.y + Math.sin(a) * outerA, p.x + Math.cos(b) * outerB, p.y + Math.sin(b) * outerB, p.x + Math.cos(b) * wakeB, p.y + Math.sin(b) * wakeB]); g.endFill();
        g.beginFill(0x7cc8da, fade * 0.32);
        g.drawPolygon([p.x + Math.cos(a) * (outerA - 17), p.y + Math.sin(a) * (outerA - 17), p.x + Math.cos(a) * outerA, p.y + Math.sin(a) * outerA, p.x + Math.cos(b) * outerB, p.y + Math.sin(b) * outerB, p.x + Math.cos(b) * (outerB - 17), p.y + Math.sin(b) * (outerB - 17)]); g.endFill();
      }
    }
    for (let i = 0; i < count; i++) {
      const a = i * Math.PI * 2 / count, dx = Math.cos(a), dy = Math.sin(a);
      if (inAngleGap(h, dx, dy)) continue;
      // Overlapping foam textures form a thick, irregular physical wavefront.
      const crest = h.kind === 'tide' ? radius - 8 + Math.sin(i * 1.7 + age * 7) * 3 : r;
      tile('water-' + i, h.shockwave ? 5 : 4, p.x + dx * crest, p.y + dy * crest, 56 + Math.sin(i * 2.1) * 9, Math.max(37, radius - inner + 8), 0.8, a * 180 / Math.PI + 90);
      if (h.kind === 'tide' && i % 2 === 0) tile('spray-' + i, 4, p.x + dx * (r + 13), p.y + dy * (r + 13) - Math.sin(age * 9 + i) * 5, 27, 18, 0.35, a * 180 / Math.PI + 90);
    }
    return;
  }
  if (h.kind === 'flame' || h.kind === 'lava' || h.kind === 'confluence') {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + h.id, r = h.radius * 0.45;
      tile('ember-' + i, 12 + (i + Math.floor(age * 7)) % 4, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.65, h.radius * 0.8, h.radius * 0.7, h.friendly ? 0.36 : 0.85, 0, v.assets.frames.meteor);
    }
  } else if (h.kind === 'mud') {
    for (let i = 0; i < 4; i++) tile('mud-' + i, 4, p.x + Math.cos(i * 2.4) * h.radius * 0.4, p.y + Math.sin(i * 2.4) * h.radius * 0.4, h.radius, h.radius * 0.35, 0.15);
  } else {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5, r = h.radius * clamp(age / 0.25);
      tile('shock-' + i, 2, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 45, 24, 0.65, a * 180 / Math.PI);
    }
  }
}
