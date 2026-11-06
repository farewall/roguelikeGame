import { Graphics } from 'cc';
import { DrawList } from './DrawList';
import { vineGrowth, vineRadius, vinePaths } from './generated/game-core';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function canvas(v, layer, id, p) {
  const node = v.use(layer, id, () => { const n = v.makeNode(id); n.addComponent(Graphics); return n; });
  node.setPosition(p.x, -p.y);
  node.setSiblingIndex(id.startsWith('vines-') ? 0 : layer.node.children.length - 1);
  const g: DrawList = (node as any).vineDraw || ((node as any).vineDraw = new DrawList(node.getComponent(Graphics))); g.clear();
  return g;
}
function stem(g, points, width, alpha) {
  if (points.length < 2) return;
  for (const [w, color, opacity] of [[width + 2, 0x142e20, alpha * 0.9], [width, 0x427b36, alpha], [1.2, 0xb5d977, alpha * 0.8]]) {
    g.lineStyle(w, color, opacity); g.moveTo(points[0].x, points[0].y);
    for (let j = 1; j < points.length; j++) g.lineTo(points[j].x, points[j].y);
  }
}
function leaf(g, x, y, angle, size, alpha) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  g.lineStyle(0.8, 0xb3d473, alpha * 0.7); g.beginFill(0x5c9b45, alpha);
  g.drawPolygon([x, y, x + dx * size * 0.45 - dy * size * 0.3, y + dy * size * 0.45 + dx * size * 0.3, x + dx * size, y + dy * size, x + dx * size * 0.45 + dy * size * 0.3, y + dy * size * 0.45 - dx * size * 0.3]); g.endFill();
}
export function drawRootHazard(v, layer, h, p) {
  const g = canvas(v, layer, 'vines-' + h.id, p), active = h.age >= h.delay;
  const growth = active ? vineGrowth(h) : 0, warning = clamp(h.age / h.delay);
  const fade = clamp((h.delay + h.duration - h.age) / 0.3), inner = h.shape === 'ring' ? h.inner : 0;
  g.lineStyle(1.5, 0xb2d77c, active ? 0.5 * fade : 0.35 + warning * 0.4); g.drawCircle(0, 0, h.radius);
  if (inner) g.drawCircle(0, 0, inner);
  if (!active) {
    g.lineStyle(2, 0xb4d97d, 0.5); g.arc(0, 0, h.radius * 0.94, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * warning);
    if (!inner) for (let i = 0; i < 3; i++) leaf(g, 0, 0, i * Math.PI * 2 / 3, 5 + warning * 5, 0.3 + warning * 0.35);
    g.flush(); return;
  }
  const front = vineRadius(h);
  g.lineStyle(Math.max(0.1, front - inner), 0x76a74b, 0.035 * fade); g.drawCircle(0, 0, (front + inner) / 2);
  for (const path of (h.vinePaths || (h.vinePaths = vinePaths(h)))) {
    const points = path.points.filter(p => p.t <= growth);
    if (growth < 1 && points.length) {
      const last = points[points.length - 1], next = path.points[points.length], t = (growth - last.t) * 16;
      if (next) points.push({ x: last.x + (next.x - last.x) * t, y: last.y + (next.y - last.y) * t });
    }
    stem(g, points, inner ? 3.8 : 4.5, fade);
    for (const j of [5, 10, 14]) {
      const root = path.points[j]; if (growth <= root.t) continue;
      const length = Math.min((h.radius - inner) * 0.22, Math.max(0, front - (inner + (h.radius - inner) * root.t))) * clamp((growth - root.t) * 6);
      const angle = path.angle + (j % 2 ? 0.8 : -0.8), end = { x: root.x + Math.cos(angle) * length, y: root.y + Math.sin(angle) * length };
      stem(g, [root, { x: (root.x + end.x) / 2 - Math.sin(angle) * 2, y: (root.y + end.y) / 2 + Math.cos(angle) * 2 }, end], 2, fade * 0.9);
      leaf(g, end.x, end.y, angle, Math.min(8, length * 0.6), fade * 0.95);
    }
    if (points.length > 1 && growth < 1) {
      const tip = points[points.length - 1]; g.lineStyle(0); g.beginFill(0xd6eb9c, fade * 0.8); g.drawCircle(tip.x, tip.y, 2.4); g.endFill();
    }
  }
  g.flush();
}
export function drawPlayerBind(v, layer, p, remaining, time) {
  if (remaining <= 0) return;
  const g = canvas(v, layer, 'player-bind', p), alpha = clamp(remaining / 0.18);
  for (const side of [-1, 1]) {
    const sway = Math.sin(time * 6) * 2;
    const points = Array.from({ length: 21 }, (_, i) => { const t = i / 20; return { x: side * Math.cos(t * Math.PI * 3) * (26 + sway), y: 68 - t * 60 }; });
    stem(g, points, 5, alpha); leaf(g, side * 25, 23, side > 0 ? -0.4 : -2.7, 13, alpha);
  }
  g.lineStyle(2, 0xaad47c, alpha * 0.6); g.drawEllipse(0, 64, 39, 12); g.flush();
  v.text(layer, 'player-bind-label', '缠足 ' + remaining.toFixed(1) + '秒', p.x, p.y + 88, 19, 0xd2eaa1, { center: true });
}
