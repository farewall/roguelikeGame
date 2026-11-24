const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
// All sprites share a ground contact point. Height changes only the projection;
// there is no attack outline, and the soft shadow never predicts future damage.
export function shadowShape(entity:any,size:number){
  const air=entity.tigerHunt?.phase==='pounce-flight'?Math.sin(clamp(entity.tigerAir||0)*Math.PI):0;
  const forming=entity.spawnTime>0?clamp(1-entity.spawnTime/(entity.spawnDuration||1)):1;
  return {width:size*(entity.boss ? .62 : .53)*(1+air*.3),height:size*.15*(1+air*.2),alpha:forming*(.64-air*.38)};
}
export function drawGroundContact(v:any,layer:any,id:string,p:any,entity:any,size:number,offset:number){
  const texture=v.assets.frames.worldStyle?.[5];if(!texture)return;
  const shape=shadowShape(entity,size);
  const shadow=v.image(layer,'contact-'+id,texture,p.x-shape.width/2,p.y+offset-shape.height/2,shape.width,shape.height,shape.alpha);
  shadow.tint=0x12171a;
}
export const HERO_FOOT=54;
export const HERO_ATLAS_BASE=120/128;
export const BELL_HEIGHT=160;
export function swordHoverOffset(combat:any,index:number){
  const f=combat.flyingSwords[index];
  const smooth=(progress:number)=>{
    const t=clamp(progress);
    return t*t*(3-2*t);
  };
  let blend=0;
  switch(f.state){
    case 'idle':
    case 'waiting': blend=1;break;
    case 'windup': blend=1-smooth(f.age/(f.attack?.tuning?.windup||.1));break;
    case 'settle': blend=smooth(f.age/.16);break;
    case 'skill-gather': blend=1-smooth(f.age/Math.min(.12,f.duration));break;
    case 'recall': {
      const home=combat.swordHome(index);
      const startsAtHome=Math.hypot(f.from.x-home.x,f.from.y-home.y)<24;
      const start=startsAtHome ? 1-smooth(f.age/Math.min(.1,f.duration*.5)) : 0;
      blend=Math.max(start,smooth((f.age/f.duration-.72)/.28));
      break;
    }
  }
  if(!blend)return {x:0,y:0};
  const center=combat.swordAnchor||combat.point(combat.player);
  const home=combat.swordHome(index);
  return {x:(home.x-center.x)*.46*blend,y:(home.y-center.y+16)*.15*blend};
}
export function heroMotion(action:string,elapsed:number,side:number){
  const t=Math.max(0,elapsed);
  if(action==='move'){
    const swing=Math.sin(t*2*Math.PI/.3),step=Math.cos(t*2*Math.PI/.6);
    const entry=1-Math.exp(-t/.045),load=(1-.5*(swing+1))*entry;
    return {sx:1+load*.027,sy:1-load*.039,dy:-Math.max(0,swing)*3.8*entry,angle:(side*2.2+step*.9)*entry};
  }
  if(action==='attack'){
    const release=2/12;
    const gather=t<release?Math.sin(Math.PI*.5*t/release):Math.exp(-(t-release)*15);
    const recoil=t<release?0:Math.sin(Math.PI*Math.min(1,(t-release)/.24))*Math.exp(-(t-release)*2);
    return {sx:1+gather*.034+recoil*.032,sy:1-gather*.06+recoil*.035,dy:-recoil*3,angle:side*(5*gather-7*recoil)};
  }
  if(action!=='idle')return {sx:1,sy:1,dy:0,angle:0};
  const breath=(1-Math.cos(t*3.8))*.5;
  return {sx:1+breath*.009,sy:1-breath*.022,dy:0,angle:0};
}
export function bodyGroundShift(entity:any,size:number){return entity.boss?72-size*(181/192-.5):0;}
export function waveContour(h:any,radius:number,inner:number){
  const half=h.gapHalf||.001,start=(h.gapAngle||0)+half,span=Math.PI*2-half*2,n=Math.min(96,Math.max(32,Math.ceil(radius*span/18))),points=[];
  for(let i=0;i<=n;i++){const a=start+span*i/n;points.push({x:Math.cos(a)*radius,y:Math.sin(a)*radius});}
  for(let i=n;i>=0;i--){const a=start+span*i/n;points.push({x:Math.cos(a)*inner,y:Math.sin(a)*inner});}
  return points;
}
