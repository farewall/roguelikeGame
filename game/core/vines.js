'use strict';
const VINES = { growth: 0.65, bind: 0.85, immunity: 2.1 };
const clamp = value => Math.max(0, Math.min(1, value));
function vineGrowth(h) { return clamp((h.age - h.delay) / VINES.growth); }
function vineRadius(h) { const inner = h.shape === 'ring' ? h.inner : 0; return inner + (h.radius - inner) * vineGrowth(h); }
// The renderer and collision share the radial growth front. Ring roots begin
// at the inner boundary, leaving their safe central hole completely untouched.
function vinePaths(h) {
  const paths = [], inner = h.shape === 'ring' ? h.inner : 0;
  const count = h.shape === 'ring' ? 18 : 8;
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count + (h.id % 13) * 0.11;
    const points = [];
    for (let j = 0; j <= 16; j++) {
      const t = j / 16, r = inner + (h.radius - inner) * t;
      const bend = Math.sin(t * Math.PI * 2 + i * 1.7) * 0.16 * Math.sin(t * Math.PI);
      points.push({ x: Math.cos(angle + bend) * r, y: Math.sin(angle + bend) * r, t });
    }
    paths.push({ angle, points });
  }
  return paths;
}
module.exports = { VINES, vineGrowth, vineRadius, vinePaths };
