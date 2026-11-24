import { UITransform } from 'cc';
import { METEOR, meteorPhase } from './generated/game-core';
import {ease} from './AttackVfx';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function drawMeteor(v, layer, h, p, point = null) {
  const g = layer.g, phase = meteorPhase(h), age = h.age - h.delay, r = h.radius;
  const fade = phase === 'burning' ? ease((h.delay + h.duration - h.age) / 0.3) : 1;
  const tile = (id, index, x, y, w, height, alpha) => {
    const sprite = v.image(layer, 'meteor-' + h.id + '-' + id, v.assets.frames.meteor[index], x, y, w, height, alpha);
    sprite.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5);
  };
  if (phase === 'falling') {
    const warning = clamp(h.age / h.delay), t = clamp((warning - 0.15) / 0.85);
    if (warning > 0.15) {
      const source = h.flightOrigin && point ? point(h.flightOrigin) : { x: p.x + r * 1.9, y: p.y - r * 2.9 };
      const travel=.36*t+.64*t*t, x = source.x + (p.x - source.x) * travel;
      const y = source.y + (p.y - source.y) * travel - Math.sin(travel * Math.PI) * 100;
      tile('fall', 0, x + 9, y - 14, 76, 96, ease(t * 4));
    }
    return;
  }
  tile('ground', 8 + h.id % 4, p.x, p.y, r * 2, r * 2, fade * (.63+.28*ease(age / METEOR.impactWindow)));
  if (phase === 'impact') {
    const t = clamp(age / METEOR.impactWindow);
    const expansion=ease(t/.7);
    tile('burst', 4 + Math.min(3, Math.floor(t * 4)), p.x, p.y - r * 0.25, r*(1.5+.65*expansion), r*(1.9+.5*expansion), ease((1-t)/.45));
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + h.id, distance = r * t * 0.65;
      tile('debris-' + i, 3, p.x + Math.cos(angle) * distance, p.y + Math.sin(angle) * distance - Math.sin(t * Math.PI) * 24, 22, 22, (1 - t) * 0.85);
    }
  } else {
    // Low, distributed flames keep the character and the whole footprint readable.
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + h.id;
      const flicker = Math.sin(age*10.5+i*2.31+h.id);
      tile('flames-' + i, 12 + (h.id + i) % 4, p.x + Math.cos(angle) * r * 0.35,
        p.y + Math.sin(angle) * r * 0.3 - r * (.12+.024*flicker), r * 0.9, r * (.6+.07*flicker), fade * (.58+.08*flicker));
    }
    g.lineStyle(0);g.beginFill(0xffb459,fade*.48);
    for (let i = 0; i < 6; i++) {
      const t = (age * 0.6 + i / 6) % 1, angle = i * 2.4 + h.id;
      g.drawCircle(p.x+Math.cos(angle)*r*.6,p.y+Math.sin(angle)*r*.4-t*24,1.8*Math.sin(t*Math.PI));
    }
    g.endFill();
  }
}
