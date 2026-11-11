'use strict';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
function polygonContains(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function hitsSolid(s, p, radius = 0) {
  if (p.x < s.bounds.left - radius || p.x > s.bounds.right + radius || p.y < s.bounds.top - radius || p.y > s.bounds.bottom + radius) return false;
  if (!s.points) return Math.hypot(p.x - s.x, p.y - s.y) < s.radius + radius;
  if (polygonContains(p, s.points)) return true;
  return radius > 0 && s.points.some((a, i) => segmentDistance(p, a, s.points[(i + 1) % s.points.length]) < radius);
}
function isFree(world, p, radius = 20, coverOnly = false) {
  return p.x >= radius && p.y >= radius && p.x <= world.width - radius && p.y <= world.height - radius && !world.solids.some(s => (!coverOnly || s.cover !== false) && hitsSolid(s, p, radius));
}
function slideMove(world, start, dx, dy, radius = 20, limits) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10)), p = { ...start };
  limits=limits||{left:radius,right:world.width-radius,top:radius,bottom:world.height-radius};
  for (let i = 0; i < steps; i++) {
    const x = clamp(p.x + dx / steps, limits.left, limits.right), y = clamp(p.y + dy / steps, limits.top, limits.bottom);
    if (isFree(world, { x, y }, radius)) { p.x = x; p.y = y; continue; }
    if (isFree(world, { x, y: p.y }, radius)) p.x = x;
    if (isFree(world, { x: p.x, y }, radius)) p.y = y;
  }
  return p;
}
function clipSegment(world, from, end, radius = 12, coverOnly = false) {
  const dx = end.x - from.x, dy = end.y - from.y, count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10));
  let previous = { ...from };
  for (let i = 1; i <= count; i++) {
    const p = { x: from.x + dx * i / count, y: from.y + dy * i / count };
    if (!isFree(world, p, radius, coverOnly)) return previous;
    previous = p;
  }
  return { ...end };
}
class FlowField {
  constructor(world, cell = 64, radius = 24, deferred = false) {
    this.world = world; this.cell = cell; this.cols = Math.ceil(world.width / cell); this.rows = Math.ceil(world.height / cell);
    this.radius=radius;
    this.blocked = new Uint8Array(this.cols * this.rows); this.cost = new Int32Array(this.blocked.length); this.target = -1;
    this.cost.fill(-1); this.queue = new Int32Array(this.cost.length);
    this.ready = false; this.builder = this.buildTopology();
    if (!deferred) this.prepare(Infinity);
  }
  // A work item is one cell, one collision-tested edge, or one flood-fill cell.
  // Boss topology is warmed during ordinary waves, never on its arrival frame.
  prepare(work = 64) {
    if (this.ready) return true;
    for (let i = 0; i < work; i++) if (this.builder.next().done) { this.builder = null; return true; }
    return this.ready;
  }
  *buildTopology() {
    const { world, radius } = this, links = [];
    for (let i = 0; i < this.blocked.length; i++) { this.blocked[i] = isFree(world, this.point(i), radius) ? 0 : 1; links.push([]); yield; }
    for (let i = 0; i < links.length; i++) if (!this.blocked[i]) {
      for (const next of this.neighbors(i)) if (next > i) {
        const p = this.point(next), hit = clipSegment(world, this.point(i), p, radius);
        if (Math.hypot(hit.x - p.x, hit.y - p.y) < 1) { links[i].push(next); links[next].push(i); }
        yield;
      }
    }
    this.links = links; this.components = new Int32Array(links.length); this.components.fill(-1); this.mainComponent = -1;
    let component = 0, largest = 0;
    for (let i = 0; i < links.length; i++) if (!this.blocked[i] && this.components[i] < 0) {
      const queue = this.queue; let read = 0, write = 1; queue[0] = i; this.components[i] = component;
      while (read < write) {
        for (const next of links[queue[read++]]) if (this.components[next] < 0) { this.components[next] = component; queue[write++] = next; }
        yield;
      }
      if (write > largest) { largest = write; this.mainComponent = component; }
      component++;
    }
    this.ready = true;
  }
  point(index) { return { x: (index % this.cols + 0.5) * this.cell, y: (Math.floor(index / this.cols) + 0.5) * this.cell }; }
  index(p) { return clamp(Math.floor(p.y / this.cell), 0, this.rows - 1) * this.cols + clamp(Math.floor(p.x / this.cell), 0, this.cols - 1); }
  neighbors(index) {
    if(this.links)return this.links[index]||[];
    const x = index % this.cols, y = Math.floor(index / this.cols), list = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= this.cols || y + dy < 0 || y + dy >= this.rows) continue;
      const next = (y + dy) * this.cols + x + dx;
      if (this.blocked[next]) continue;
      list.push(next);
    }
    return list;
  }
  update(goal) {
    if (!this.ready) return;
    let target = this.index(goal);
    if (this.blocked[target] || this.components[target]!==this.mainComponent) {
      let best = Infinity;
      for (let i = 0; i < this.blocked.length; i++) if (this.components[i]===this.mainComponent) { const p = this.point(i), d = Math.hypot(p.x - goal.x, p.y - goal.y); if (d < best) { best = d; target = i; } }
    }
    if (this.target === target) return;
    this.target = target; this.cost.fill(-1); this.cost[target] = 0;
    const queue = this.queue; let read = 0, write = 1; queue[0] = target;
    while (read < write) for (const next of this.neighbors(queue[read++])) if (this.cost[next] < 0) { this.cost[next] = this.cost[queue[read - 1]] + 1; queue[write++] = next; }
  }
  canJoin(from,radius=this.radius) { return this.ready && [this.index(from),...this.neighbors(this.index(from))].some(i=>{if(this.cost[i]<0)return false;const p=this.point(i),hit=clipSegment(this.world,from,p,radius);return Math.hypot(hit.x-p.x,hit.y-p.y)<1;}); }
  direction(from, goal, radius = 20) {
    if (!this.ready) return { x: 0, y: 0 };
    this.update(goal);
    const direct = { x: goal.x - from.x, y: goal.y - from.y }, distance = Math.hypot(direct.x, direct.y);
    if (distance < 220) { const p = clipSegment(this.world, from, goal, radius); if (Math.hypot(p.x - goal.x, p.y - goal.y) < 2) return { x: direct.x / (distance || 1), y: direct.y / (distance || 1) }; }
    const here = this.index(from); let best = null, score = Infinity;
    const candidates=new Set([here,...this.neighbors(here)]);
    if(this.cost[here]<0)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=here%this.cols+dx,y=Math.floor(here/this.cols)+dy;if(x>=0&&x<this.cols&&y>=0&&y<this.rows)candidates.add(y*this.cols+x);}
    for (const next of candidates) if (this.cost[next] >= 0) {
      const p = this.point(next), d = Math.hypot(p.x - from.x, p.y - from.y), value = this.cost[next] + d / this.cell * 0.35;
      if (value < score) {const hit=clipSegment(this.world,from,p,radius);if(Math.hypot(hit.x-p.x,hit.y-p.y)<1){score = value; best = p;}}
    }
    if (!best) best = goal;
    const dx = best.x - from.x, dy = best.y - from.y, length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }
}
module.exports = { clamp, segmentDistance, polygonContains, hitsSolid, isFree, slideMove, clipSegment, FlowField };
