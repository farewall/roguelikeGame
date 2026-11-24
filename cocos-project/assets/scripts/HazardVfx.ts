import { UITransform } from 'cc';
import { attackLine, waveBand, sectorAngle, inAngleGap, tigerClawSegment } from './generated/game-core';
import { drawRootHazard } from './VineVfx';
import { drawMeteor } from './MeteorVfx';
import {drawSeaWave} from './SeaVfx';
import {ease} from './AttackVfx';
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));

// Only physical attacks are drawn. Wind-up comes from the caster's body.
// There are no ground outlines, lanes, arrows or area-of-effect markers.
export function drawHazard(v: any, layer: any, h: any, point: (p: any) => any) {
  if(h.broken)return;
  if (h.meteor) { drawMeteor(v, layer, h, point(h), point); return; }
  if (h.kind === 'root') { drawRootHazard(v, layer, h, point(h), point); return; }
  if (h.age < h.delay) return;
  const g = layer.g, p = point(h), age = h.age - h.delay;
  const fade = ease((h.duration - age) / 0.25), prefix = 'spell-' + h.id + '-';
  const tile = (id: string, index: number, x: number, y: number, w: number, height: number, opacity: number, angle = 0, atlas = v.assets.frames.spells) => {
    const sprite = v.image(layer, prefix + id, atlas[index], x, y, w, height, opacity * fade);
    sprite.node.getComponent(UITransform).setAnchorPoint(0.5, 0.5); sprite.node.angle = -angle;
  };
  if(h.tigerClaw){
    const paw=tigerClawSegment(h,{x:0,y:0}),dx=paw.end.x-paw.x,dy=paw.end.y-paw.y,len=Math.hypot(dx,dy)||1;
    for(let i=-1;i<=1;i++){
      const ox=-dy/len*i*9,oy=dx/len*i*9;
      const x=p.x+paw.x+ox,y=p.y+paw.y+oy,nx=-dy/len,ny=dx/len;
      g.lineStyle(5,0xb58b42,fade*.65);g.moveTo(x,y);g.bezierCurveTo(x+dx*.3+nx*14,y+dy*.3+ny*14,x+dx*.8+nx*10,y+dy*.8+ny*10,x+dx,y+dy);
      g.lineStyle(2,0xfff0cd,fade);g.moveTo(x+dx*.15,y+dy*.15);g.bezierCurveTo(x+dx*.4+nx*13,y+dy*.4+ny*13,x+dx*.8+nx*8,y+dy*.8+ny*8,x+dx,y+dy);
    }
    return;
  }
  if(h.tigerPounce)return; // The airborne physical tiger carries this attack.
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
        const flicker = Math.sin(age*10+i*2.14);
        tile('fire-' + i, 12 + (i+h.id) % 4, a.x + dx * t, a.y + dy * t - 6, h.width * 1.35, h.width * (1.3+flicker*.11), .78+flicker*.06, 0, v.assets.frames.meteor);
      }
    } else if(h.kind==='rift') {
      g.lineStyle(h.width*.23,0x99e1cc,fade*.25);
      g.moveTo(a.x,a.y);g.bezierCurveTo(a.x+dx*.31,a.y+dy*.31+4,a.x+dx*.69,a.y+dy*.69-4,b.x,b.y);
      g.lineStyle(2,0xf1f5d9,fade*.68);g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);
    } else {
      const color = h.kind === 'order' ? 0xe8d7ff : 0xbee5f2;
      g.lineStyle(h.width * 0.4, color, fade * 0.22); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      g.lineStyle(h.width * 0.12, 0xf5f5e4, fade * 0.9); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      for (let i = 0; i < 3; i++) {
        const t = (age * 3 + i / 3) % 1;
        tile('breath-' + i, 2, a.x + dx * t, a.y + dy * t, 74, Math.min(h.width * 1.4, 55), .75*ease(t/.14)*ease((1-t)/.14), angle);
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
    const { radius, inner } = waveBand(h), r = (radius + inner) / 2, count = Math.min(48,Math.max(10,Math.ceil(r*Math.PI*2/34)));
    if (h.kind === 'tide') {
      drawSeaWave(v,layer,h,p,radius,inner,fade);return;
    }
    for (let i = 0; i < count; i++) {
      const a = i * Math.PI * 2 / count, dx = Math.cos(a), dy = Math.sin(a);
      if (inAngleGap(h, dx, dy)) continue;
      tile('water-' + i, h.shockwave ? 5 : 4, p.x + dx * r, p.y + dy * r, 56 + Math.sin(i * 2.1) * 9, Math.max(37, radius - inner + 8), 0.8, a * 180 / Math.PI + 90);
    }
    return;
  }
  if (h.kind === 'flame' || h.kind === 'lava' || h.kind === 'confluence') {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + h.id, r = h.radius * 0.45;
      const flicker = Math.sin(age*9.5+i*2.14+h.id);
      tile('ember-' + i, 12 + (i+h.id) % 4, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.65,
        h.radius * 0.8, h.radius * (.7+flicker*.08), (h.friendly ? .36 : .85)*(.9+flicker*.1), 0, v.assets.frames.meteor);
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
