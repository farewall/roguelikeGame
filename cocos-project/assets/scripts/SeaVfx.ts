import {inAngleGap} from './generated/game-core';
import {UITransform} from 'cc';
import {ease} from './AttackVfx';
// The moving water body uses a stencil built from the shared collision band.
// Painted curls have soft wakes; the empty angular opening stays clear.
export function drawSeaWave(v:any,layer:any,h:any,p:any,radius:number,inner:number,fade:number){
  v.waveSurface(layer,h,p,radius,inner,fade);
  const g=layer.g,age=h.age-h.delay,prefix='spell-'+h.id+'-',count=Math.min(18,Math.max(12,Math.ceil((h.wave?.to||h.radius||radius)*Math.PI*2/110)));
  const spray:number[]=[];
  for(let i=0;i<count;i++){
    const a=i*Math.PI*2/count,dx=Math.cos(a),dy=Math.sin(a),width=Math.min(90+Math.sin(i*2.1)*8,radius*Math.PI*2/count*1.05),height=(42+Math.sin(age*4+i)*3)*width/90;
    if(inAngleGap(h,dx,dy))continue;
    const delta=Math.abs(Math.atan2(Math.sin(a-(h.gapAngle||0)),Math.cos(a-(h.gapAngle||0))));
    const edge=h.gapHalf?ease((delta-h.gapHalf-Math.atan2(width*.45,Math.max(1,radius)))/.19):1;
    if(edge<=0)continue;
    const r=radius-height*.4+Math.sin(age*5+i)*Math.min(2,height*.06);
    const strip=v.image(layer,prefix+'foam-'+i,v.assets.frames.waveRidges[i%4],p.x+dx*r,p.y+dy*r,width,height,fade*.95*edge);
    strip.node.getComponent(UITransform).setAnchorPoint(.5,.5);strip.node.angle=-(a*180/Math.PI+90);
    (strip.node as any).worldDepth=-999999;
    if(i%3===1){
      const x=p.x+dx*(radius-3),y=p.y+dy*(radius-3)-Math.sin(age*8+i)*5;
      spray.push(x,y,x+dx*4*edge,y-4*edge);
    }
  }
  g.lineStyle(1.4,0xe1eee0,fade*.55);
  g.strokeSegments(spray);
}
