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
export const HERO_TOP=126;
export const BELL_HEIGHT=160;
export function bodyGroundShift(entity:any,size:number){return entity.boss?72-size*(181/192-.5):0;}
