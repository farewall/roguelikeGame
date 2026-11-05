import { UITransform } from 'cc';
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const COLORS = { root: 0xa5d46d, flame: 0xff9446, tide: 0x8edbea, slash: 0xffd17e, order: 0xd3a6ff, arcane: 0xbba8fa, rift: 0xb9efdc, lava: 0xe1a05c, mud: 0x8db6a4, confluence: 0xc8c887 };
// Pictures supply the spell identity. Exact circles/rings/capsules remain the
// damage boundary; every animation reads hazard.age, never wall-clock time.
export function drawHazard(v: any, layer: any, h: any, point: (p: any) => any) {
  const g = layer.g, p = point(h), color = COLORS[h.kind] || 0xe3c88b;
  const active = h.age >= h.delay, age = Math.max(0, h.age - h.delay), warning = clamp(h.age / Math.max(0.001, h.delay));
  const pulse = 0.65 + Math.sin(h.age * 8) * 0.2;
  const alpha = h.friendly ? 0.1 : active ? 0.18 : 0.04 + warning * 0.07;
  const key = 'spell-' + h.id + '-';
  const spell = (id: string, index: number, x: number, y: number, w: number, height: number, opacity: number, angle = 0) => {
    const sprite = v.image(layer, key + id, v.assets.frames.spells[index], x, y, w, height, opacity);
    sprite.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5); sprite.node.angle = -angle;
  };
  const capsule = (q: any) => {
    const dx = q.x - p.x, dy = q.y - p.y, length = Math.hypot(dx, dy) || 1, nx = -dy / length * h.width / 2, ny = dx / length * h.width / 2;
    g.lineStyle(active ? 2 : 1.5, color, active ? 0.85 : 0.45 + warning * 0.4); g.beginFill(color, alpha);
    g.drawPolygon([p.x + nx, p.y + ny, q.x + nx, q.y + ny, q.x - nx, q.y - ny, p.x - nx, p.y - ny]); g.endFill();
    g.lineStyle(0); g.beginFill(color, alpha); g.drawCircle(p.x, p.y, h.width / 2); g.drawCircle(q.x, q.y, h.width / 2); g.endFill();
    return { dx, dy, length, angle: Math.atan2(dy, dx) * 180 / Math.PI };
  };
  if (h.shape === 'line') {
    const q = point(h.end), { dx, dy, length, angle } = capsule(q);
    if (!active) {
      // Direction chevrons replace the old “符/冲/再/斩” labels.
      const count = Math.max(2, Math.min(12, Math.floor(length / 65)));
      for (let i = 1; i < count; i++) {
        const x = p.x + dx * i / count, y = p.y + dy * i / count, sx = dx / length, sy = dy / length;
        g.lineStyle(2, color, 0.3 + warning * 0.5); g.moveTo(x - sx * 9 - sy * 6, y - sy * 9 + sx * 6); g.lineTo(x, y); g.lineTo(x - sx * 9 + sy * 6, y - sy * 9 - sx * 6);
      }
      return;
    }
    if (h.kind === 'arcane') {
      // A continuous luminous spell beam matches the existing line damage.
      g.lineStyle(Math.min(h.width * 0.65, 14), 0x6bc5ee, 0.28); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
      g.lineStyle(3, 0xe2fbff, 0.95); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
      const t = clamp(age / Math.max(0.001, h.duration));
      spell('comet', 2, p.x + dx * t, p.y + dy * t, 88, Math.min(30, h.width), 0.95, angle);
      spell('muzzle', 1, p.x, p.y, h.width * 1.6, h.width * 1.6, 0.65, age * 100);
    } else if (h.kind === 'slash') {
      for (let i = 0; i < 3; i++) {
        const t = clamp(age / Math.max(0.001, h.duration) - i * 0.16);
        spell('claw-' + i, 5, p.x + dx * t, p.y + dy * t, 88 + h.width * 0.35, h.width * 0.85, 0.85 - i * 0.22, angle);
      }
      // Keep the full active attack lane visible, including the tiger's second leap.
      g.lineStyle(3, 0xffe5b0, 0.65); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
    } else if (h.kind === 'flame' || h.kind === 'lava') {
      const count = Math.min(14, Math.max(3, Math.ceil(length / 90)));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        spell('fire-' + i, 0, p.x + dx * t, p.y + dy * t - Math.sin(age * 10 + i) * 4, h.width * 0.8, h.width * 1.5, 0.85);
      }
    } else if (h.kind === 'tide') {
      for (let i = 0; i < 8; i++) {
        const t = (i / 8 + age * 0.3) % 1;
        spell('wave-' + i, 4, p.x + dx * t, p.y + dy * t, 72, h.width * 0.85, 0.75, angle);
      }
    } else if (h.kind === 'order') {
      const count = Math.max(3, Math.min(9, Math.floor(length / 80)));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        spell('seal-' + i, 1, p.x + dx * t, p.y + dy * t, h.width * 0.85, h.width * 0.85, pulse, age * 30);
      }
      g.lineStyle(4, 0xfbe1aa, 0.8); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
    } else {
      g.lineStyle(3, color, 0.65); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
    }
    return;
  }
  if (h.shape === 'ring') {
    // Stroke is centred on the middle radius, preserving the safe inner hole.
    g.lineStyle(h.radius - h.inner, color, alpha); g.drawCircle(p.x, p.y, (h.radius + h.inner) / 2);
    g.lineStyle(2, color, 0.8); g.drawCircle(p.x, p.y, h.radius); g.drawCircle(p.x, p.y, h.inner);
    if (active) {
      for (let i = 0; i < 3; i++) {
        const r = h.inner + (h.radius - h.inner) * ((age * 1.2 + i / 3) % 1);
        g.lineStyle(3, h.kind === 'tide' ? 0xd9fbff : color, 0.55); g.drawCircle(p.x, p.y, r);
      }
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 + age * 0.2, r = (h.radius + h.inner) / 2;
        spell('rim-' + i, h.kind === 'root' ? 3 : 4, p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r, 48, Math.min(42, h.radius - h.inner), 0.8, angle * 180 / Math.PI + 90);
      }
    }
    return;
  }
  g.lineStyle(active ? 2.5 : 1.5, color, active ? 0.85 : 0.55 + warning * 0.35); g.beginFill(color, alpha); g.drawCircle(p.x, p.y, h.radius); g.endFill();
  if (!active) {
    g.lineStyle(2, color, 0.35); g.arc(p.x, p.y, h.radius * 0.86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * warning);
    if (h.kind === 'flame') {
      // The feather descends to its locked warning circle, then becomes fire.
      spell('fall', 0, p.x, p.y - (1 - warning) * 150 - 12, 44, 72, 0.4 + warning * 0.55, -12 + warning * 12);
    } else if (h.kind === 'arcane') spell('seal', 1, p.x, p.y, h.radius * 1.8, h.radius * 1.8, 0.2 + warning * 0.35, h.age * 35);
    else if (h.kind === 'root') spell('sprout', 3, p.x, p.y, h.radius * 0.7, h.radius * 0.7, warning * 0.45);
    return;
  }
  if (h.kind === 'flame' || h.kind === 'lava' || h.kind === 'confluence') {
    const burst = clamp(age / 0.22);
    if (age < 0.3) { g.lineStyle(4, 0xffe2a0, 1 - age / 0.3); g.drawCircle(p.x, p.y, h.radius * burst); }
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + h.id, r = h.radius * 0.4;
      spell('flame-' + i, 0, p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r - 8 - Math.sin(age * 11 + i) * 5, h.radius * 0.65, h.radius * 1.25, h.friendly ? 0.45 : 0.9, Math.sin(age * 4 + i) * 12);
    }
  } else if (h.kind === 'arcane') {
    spell('seal', 1, p.x, p.y, h.radius * 1.9, h.radius * 1.9, 0.9, age * 45);
    g.lineStyle(3, 0xffe9bb, 0.55); g.drawCircle(p.x, p.y, h.radius * (0.45 + Math.sin(age * 8) * 0.08));
  } else if (h.kind === 'root') {
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2, r = h.radius * 0.36;
      spell('vine-' + i, 3, p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r, h.radius, h.radius, 0.9, i * 90 + Math.sin(age * 3) * 5);
    }
  } else if (h.kind === 'mud') {
    for (let i = 0; i < 3; i++) { g.lineStyle(2, 0xb6d4c0, 0.25); g.drawEllipse(p.x, p.y, h.radius * ((age * 0.4 + i / 3) % 1), h.radius * 0.35); }
  }
  // Small embers/light motes add motion without a particle-system allocation.
  for (let i = 0; i < 5; i++) {
    const t = (age * 0.7 + i / 5) % 1, angle = i * 2.4 + h.id;
    g.lineStyle(0); g.beginFill(color, (1 - t) * 0.65); g.drawCircle(p.x + Math.cos(angle) * h.radius * 0.55, p.y + Math.sin(angle) * h.radius * 0.35 - t * h.radius * 0.55, 1.5 + (1 - t) * 2); g.endFill();
  }
}
