import type { DrawList } from './DrawList';

type Point = { x: number; y: number };
type TrailPoint = Point & { alpha: number };
type Wake = Point & { dx: number; dy: number; length: number; width: number };

export function ease(n: number) {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
}

export function drawSwordRibbon(g: DrawList, samples: TrailPoint[], offset: Point, color: number, skill: boolean, returning: boolean) {
  if (samples.length < 2) return;
  const head = samples[samples.length - 1], opacity = ease(head.alpha) * (returning ? .53 : .81);
  if (opacity <= .005) return;

  const sections = samples.map((sample, i) => {
    const before = samples[Math.max(0, i - 1)], after = samples[Math.min(samples.length - 1, i + 1)];
    const dx = after.x - before.x, dy = after.y - before.y, length = Math.hypot(dx, dy) || 1;
    const width = (skill ? 10 : 6.5) * ease(sample.alpha);
    return { x: offset.x + sample.x, y: offset.y + sample.y, nx: -dy / length * width, ny: dx / length * width };
  });
  for (const [scale, tint, alpha] of [[1, color, opacity * .58], [.38, 0xfff6db, opacity]]) {
    const left: number[] = [], right: number[] = [];
    for (const p of sections) left.push(p.x + p.nx * scale, p.y + p.ny * scale);
    for (let i = sections.length - 1; i >= 0; i--) {
      const p = sections[i];
      right.push(p.x - p.nx * scale, p.y - p.ny * scale);
    }
    g.lineStyle(0);
    g.beginFill(tint, alpha);
    g.drawPolygon(left.concat(right));
    g.endFill();
  }
}

export function drawBladeWakes(g: DrawList, wakes: Wake[]) {
  if (!wakes.length) return;
  for (const [scale, tint, alpha] of [[1, 0x8fe2c7, .45], [.43, 0xffedb6, .82]]) {
    g.lineStyle(0);
    g.beginFill(tint, alpha);
    for (const { x, y, dx, dy, length, width } of wakes) {
      const nx = -dy * width * scale, ny = dx * width * scale;
      const shoulder = length * .19;
      g.drawPolygon([x + dx * 4, y + dy * 4, x - dx * shoulder + nx, y - dy * shoulder + ny,
        x - dx * length, y - dy * length, x - dx * shoulder - nx, y - dy * shoulder - ny]);
    }
    g.endFill();
  }
}

export function drawRiftCut(g: DrawList, from: Point, to: Point, width: number, age: number, life: number) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length, ny = dx / length, retreat = ease(1 - age / life);
  const broad = width * (.16 + .24 * ease(age / .07)) * (.25 + .75 * retreat);
  const cut = (weight: number, color: number, opacity: number) => {
    const radius = broad * weight;
    g.lineStyle(0);
    g.beginFill(color, opacity);
    g.drawPolygon([from.x, from.y, from.x + dx * .32 + nx * radius, from.y + dy * .32 + ny * radius,
      to.x, to.y, from.x + dx * .64 - nx * radius, from.y + dy * .64 - ny * radius]);
    g.endFill();
  };
  cut(1, 0x86caba, retreat * .47);
  cut(.34, 0xf6fff0, retreat * .92);
}
