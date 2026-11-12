'use strict';
function canCast(c,e) {
  if(!c.world||e.boss)return true;
  const busy=c.enemies.filter(v=>v!==e&&!v.boss&&v.hp>0&&(v.castTime>0||v.dashing||c.hazards.some(h=>h.owner===v.id&&!h.friendly&&h.age<h.delay+h.duration)));
  const bossBusy=c.enemies.some(v=>v.boss&&v.castTime>0);
  return busy.length<(bossBusy?1:2)&&!busy.some(v=>v.kind===e.kind);
}
function tacticDirection(c,e) {
  const world=c.world,from=c.groundPoint(e),player=c.groundPoint(c.player);
  let goal=player;
  const leader=c.enemies.find(v=>v!==e&&v.kind==='elite'&&v.hp>0&&!v.spawnTime&&c.distance(e,v)<330);
  if(e.kind==='wraith'&&leader&&c.distance(e,c.player)>150){
    const p=c.groundPoint(leader),dx=player.x-p.x,dy=player.y-p.y,len=Math.hypot(dx,dy)||1,side=e.id%2?1:-1;
    goal={x:p.x+dx/len*105-dy/len*side*65,y:p.y+dy/len*105+dx/len*side*65};
    e.tactic='escort';
  }else if(e.kind==='charger'&&c.distance(e,c.player)>260){
    const dx=player.x-from.x,dy=player.y-from.y,len=Math.hypot(dx,dy)||1,side=e.id%2?1:-1;
    goal={x:player.x-dy/len*side*145,y:player.y+dx/len*side*145};e.tactic='flank';
  }else e.tactic='approach';
  let direction;
  if(goal!==player&&Math.hypot(goal.x-from.x,goal.y-from.y)<280){
    const end=world.clip(from,goal,20),dx=goal.x-from.x,dy=goal.y-from.y,len=Math.hypot(dx,dy)||1;
    if(Math.hypot(end.x-goal.x,end.y-goal.y)<1)direction={x:dx/len,y:dy/len};
  }
  // Keep one shared pursuit field; tactical offsets must never rebuild it per enemy.
  if(!direction)direction=world.steer(from,player,e.boss?34:20);
  // A small separation keeps the bodies readable without changing dash lanes.
  if(!e.boss){let sx=0,sy=0;for(const v of c.enemies){if(v===e||v.hp<=0||v.spawnTime)continue;const p=c.groundPoint(v),dx=from.x-p.x,dy=from.y-p.y,d=Math.hypot(dx,dy);if(d>1&&d<42){sx+=dx/d*(42-d)/42;sy+=dy/d*(42-d)/42;}}
    const x=direction.x+sx*.35,y=direction.y+sy*.35,len=Math.hypot(x,y)||1;return{x:x/len,y:y/len};}
  return direction;
}
module.exports={canCast,tacticDirection};
