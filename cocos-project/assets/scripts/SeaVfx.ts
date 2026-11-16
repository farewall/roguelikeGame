import {inAngleGap} from './generated/game-core';
// The crest remains at the shared physical radius. Broken foam and shaded
// folds describe water volume; there is no line around a future damage area.
export function drawSeaWave(v:any,layer:any,h:any,p:any,radius:number,inner:number,fade:number){
  const g=layer.g,age=h.age-h.delay,prefix='spell-'+h.id+'-',samples=Math.min(64,Math.max(32,Math.ceil(radius*Math.PI*2/24))),step=Math.PI*2/samples;
  const polar=(angle:number,r:number)=>[p.x+Math.cos(angle)*r,p.y+Math.sin(angle)*r];
  for(let i=0;i<samples;i++){
    const a=i*step,b=a+step;if(inAngleGap(h,Math.cos(a),Math.sin(a))||inAngleGap(h,Math.cos(b),Math.sin(b)))continue;
    const fold=(angle:number)=>9+Math.sin(angle*9-age*6+h.id)*4+Math.sin(angle*17+age*4)*2;
    const ra=radius-fold(a),rb=radius-fold(b),wake=Math.max(0,inner-9);
    g.lineStyle(0);g.beginFill(0x205262,fade*.64);g.drawPolygon([...polar(a,wake),...polar(a,radius),...polar(b,radius),...polar(b,wake)]);g.endFill();
    g.beginFill(0x4a8a99,fade*.5);g.drawPolygon([...polar(a,Math.max(inner,ra-17)),...polar(a,ra),...polar(b,rb),...polar(b,Math.max(inner,rb-17))]);g.endFill();
    g.beginFill(0x97c4c8,fade*.35);g.drawPolygon([...polar(a,ra),...polar(a,radius-2),...polar(b,radius-2),...polar(b,rb)]);g.endFill();
    if(Math.sin(i*2.17-age*4)>.12){
      const start=polar(a+.012,radius-3),end=polar(b-.016,radius-4);
      g.lineStyle(1.8,0xe5eee1,fade*.72);g.moveTo(start[0],start[1]);g.bezierCurveTo(start[0]-Math.sin(a)*5,start[1]+Math.cos(a)*5,end[0]-Math.cos(b)*5,end[1]-Math.sin(b)*5,end[0],end[1]);
    }
  }
  const count=Math.min(32,Math.max(16,Math.ceil(radius*Math.PI*2/48)));
  for(let i=0;i<count;i++){
    const a=i*Math.PI*2/count,dx=Math.cos(a),dy=Math.sin(a);if(inAngleGap(h,dx,dy))continue;
    const r=radius-10-Math.sin(i*1.7+age*6)*4;
    if(i%3===0)v.image(layer,prefix+'foam-'+i,v.assets.frames.spells[4],p.x+dx*r-26,p.y+dy*r-20-Math.sin(age*7+i)*4,52,34,fade*.58);
    if(i%4===1){
      const x=p.x+dx*(radius-6),y=p.y+dy*(radius-6)-10-Math.sin(age*9+i)*7;
      g.lineStyle(1.6,0xe1eee0,fade*.7);g.moveTo(x,y);g.lineTo(x+dx*5,y-5);
      v.image(layer,prefix+'spray-'+i,v.assets.frames.spells[4],x-10,y-8,20,15,fade*.4);
    }
  }
}
