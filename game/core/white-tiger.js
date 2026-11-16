'use strict';
const {clamp,segmentDistance,polygonContains,hitsSolid}=require('./world-geometry');
const TIMING={cutoff:.42,step:.36,sweep:.68,chop:.56,pounce:.92,flight:.48,look:.24,counter:.72,recover:1.2,crash:2.1};
const facing=(c,e)=>{const d=c.vector(e,c.player);return Math.atan2(d.y,d.x);};
function enter(e,phase,duration,pose,state='cast') {
  Object.assign(e.tigerHunt,{phase,age:0,duration});
  Object.assign(e,{tigerPose:pose,visualState:state,visualAge:0,tigerAir:0,castTime:state==='recover'?0:duration,recoverTime:state==='recover'?duration:0});
}
function cutoff(c,e) {
  const p=c.point(c.player),from=c.point(e),toward=c.vector(e,c.player);
  const heading=c.lastMoveDirection&&c.time-c.lastMovedAt<.55?c.lastMoveDirection:{x:-toward.y,y:toward.x};
  const side=e.sequence%2?1:-1,offset=c.world?.footOffset(e)||0;
  let best=from,score=Infinity;
  for(const sign of [side,-side]) {
    let to={x:p.x+heading.x*125-heading.y*sign*155,y:p.y+heading.y*125+heading.x*sign*155};
    const d=Math.hypot(to.x-from.x,to.y-from.y),scale=Math.min(1,330/(d||1));
    to={x:clamp(from.x+(to.x-from.x)*scale,60,c.width-60),y:clamp(from.y+(to.y-from.y)*scale,90,c.height-100)};
    if(c.world){to=c.world.clip(c.groundPoint(e),{x:to.x,y:to.y+offset},40);to.y-=offset;}
    const cost=Math.hypot(to.x-p.x,to.y-p.y)+Math.max(0,90-Math.hypot(to.x-from.x,to.y-from.y))*3;
    if(cost<score){score=cost;best=to;}
  }
  e.tigerHunt.stepFrom={x:e.x,y:e.y};e.tigerHunt.stepTo=c.percent(best);
  e.attackAngle=facing(c,e);e.attackName='猎步截路';e.attackType='tiger-step';enter(e,'cutoff-windup',TIMING.cutoff,1);
}
function claw(c,e,style) {
  const duration=style==='chop'?.26:.3,windup=TIMING[style==='backhand'?'counter':style];
  e.attackAngle=facing(c,e);e.attackName=style==='backhand'?'回身横剪':style==='chop'?'裂金·落爪':'裂金·横爪';e.attackType='tiger-'+style;
  enter(e,style+'-windup',windup,style==='chop'?3:style==='backhand'?9:1);
  const attack=c.hazard({shape:'tiger-claw',x:e.x,y:e.y,angle:e.attackAngle,style,delay:windup+.025,duration,width:24,
    damage:style==='backhand'?14:12,owner:e.id,tigerClaw:true,kind:'slash',label:e.attackName});
  if(!attack)recover(e);
  c.emit('cast',{name:e.name});
}
function pounce(c,e,second=false) {
  const from=c.point(e),d=c.vector(e,c.player),offset=c.world?.footOffset(e)||0;
  let length=clamp(c.distance(e,c.player)+65,170,570);
  if(Math.abs(d.x)>.0001)length=Math.min(length,Math.max(0,((d.x>0?c.width-55:55)-from.x)/d.x));
  if(Math.abs(d.y)>.0001)length=Math.min(length,Math.max(0,((d.y>0?c.height-100:80)-from.y)/d.y));
  const desired={x:from.x+d.x*length,y:from.y+d.y*length};
  let end=desired,pillar;
  if(c.world){
    const hit=c.world.clip(c.groundPoint(e),{x:desired.x,y:desired.y+offset},40);end={x:hit.x,y:hit.y-offset};
    // Only the first physical contact can break a pillar. A pillar behind a wall
    // is never selected, and the low stump keeps its existing nav footprint.
    const step=length/Math.max(1,Math.ceil(length/10)),next={x:hit.x+d.x*step,y:hit.y+d.y*step};
    const blocked=Math.hypot(hit.x-desired.x,hit.y-desired.y-offset)>.01;
    const first=blocked&&c.world.solids.find(s=>hitsSolid(s,next,40));
    if(first?.tigerPillar&&!first.broken)pillar=first;
  }
  e.chargeHit=false;e.attackAngle=Math.atan2(d.y,d.x);e.attackName=second?'落地追扑':'断岳扑杀';e.attackType='tiger-pounce';
  const windup=(second ? .82 : TIMING.pounce)+(c.world?.bossBoon ? .18 : 0);
  enter(e,'pounce-windup',windup,5);
  const attack=c.hazard({shape:'line',x:e.x,y:e.y,end:c.percent(end),width:108,delay:windup+.025,duration:TIMING.flight,damage:16,
    owner:e.id,kind:'slash',label:e.attackName,dash:true,pounce:true,tigerPounce:true,second,crashPillarId:pillar?.id});
  if(!attack)recover(e);
  c.emit('cast',{name:e.name});
}
function recover(e,crash=false) {
  e.tigerExposed=crash||!e.chargeHit;e.attackName=crash?'骨柱破势':'落地调息';e.attackType='tiger-recover';
  enter(e,'recovery',crash?TIMING.crash:TIMING.recover,crash?8:7,'recover');e.tigerHunt.crashed=crash;
}
function beginTigerHunt(c,e,phase2) {
  e.bossPattern=null;e.sequence=(e.sequence||0)+1;e.chargeHit=false;e.tigerExposed=false;
  e.tigerHunt={phase2:Boolean(phase2),followed:false};cutoff(c,e);
}
function onTigerPounceLand(c,e,h) {
  if(!e.tigerHunt||h.landed)return;h.landed=true;e.dashing=false;e.tigerAir=0;
  const pillar=c.world?.tigerPillars.find(s=>s.id===h.crashPillarId&&!s.broken);
  c.effect(pillar?'tiger-crash':'tiger-impact',pillar?c.percent({x:pillar.x,y:pillar.y-72}):e,pillar?100:65,{life:.42});
  if(pillar){pillar.broken=true;pillar.cover=false;recover(e,true);c.emit('boss-break',{name:'骨柱破势'});return;}
  enter(e,'landing',.18,7,'release');
}
function advanceTigerHunt(c,e,dt) {
  const plan=e.tigerHunt;if(!plan)return;plan.age+=dt;e.visualAge=plan.age;
  e.castTime=plan.phase==='recovery'?0:Math.max(.01,plan.duration-plan.age);e.recoverTime=plan.phase==='recovery'?Math.max(0,plan.duration-plan.age):0;
  if(plan.phase==='cutoff-step'){
    const t=clamp(plan.age/plan.duration,0,1),u=t*t*(3-2*t);
    e.x=plan.stepFrom.x+(plan.stepTo.x-plan.stepFrom.x)*u;e.y=plan.stepFrom.y+(plan.stepTo.y-plan.stepFrom.y)*u;
  }
  if(plan.age+1e-6<plan.duration||plan.phase==='pounce-flight')return;
  switch(plan.phase){
    case 'cutoff-windup':enter(e,'cutoff-step',TIMING.step,1,'dash');break;
    case 'cutoff-step':if(c.distance(e,c.player)<255)claw(c,e,'sweep');else pounce(c,e);break;
    case 'sweep-windup':enter(e,'sweep-swing',.3,2,'release');break;
    case 'sweep-swing':claw(c,e,'chop');break;
    case 'chop-windup':enter(e,'chop-hit',.26,4,'release');break;
    case 'chop-hit':if(plan.phase2||e.sequence%2===0||c.distance(e,c.player)>255)pounce(c,e);else recover(e);break;
    case 'pounce-windup':enter(e,'pounce-flight',TIMING.flight,6,'dash');break;
    case 'landing':
      if(plan.phase2&&!plan.followed){
        // One glance, one choice. Later changes in player position cannot swap
        // a raised backhand into a pounce, or extend the chase indefinitely.
        plan.followed=true;plan.follow=c.distance(e,c.player)>245?'pounce':'backhand';
        e.attackName='落地回望';enter(e,'follow-look',TIMING.look,7);
      }else recover(e);break;
    case 'follow-look':if(plan.follow==='pounce')pounce(c,e,true);else claw(c,e,'backhand');break;
    case 'backhand-windup':enter(e,'backhand-swing',.3,15,'release');break;
    case 'backhand-swing':recover(e);break;
    case 'recovery':e.tigerHunt=null;e.tigerPose=0;e.tigerExposed=false;e.attackName='';e.castTime=e.recoverTime=0;e.cooldown=1.1;break;
  }
}
// Coordinates stay in world/UI units; rendering and collision share the exact
// moving paw. Windup has no contact, and no filled sector is ever hazardous.
function tigerClawSegment(h,origin,age=h.age) {
  const t=clamp((age-h.delay)/h.duration,0,1),chop=h.style==='chop';
  const angle=h.angle+(chop?0:(h.style==='backhand'?1:-1)*(1-t*2)*.92),r=chop?68+t*88:64;
  const reach=chop?64:118,dx=Math.cos(angle),dy=Math.sin(angle);
  return {x:origin.x+dx*r,y:origin.y+dy*r,end:{x:origin.x+dx*(r+reach),y:origin.y+dy*(r+reach)}};
}
function tigerClawContact(h,origin,point) {
  if(h.age<h.delay||h.age>h.delay+h.duration+1e-6)return false;
  const a=tigerClawSegment(h,origin,Math.max(h.delay,h.previousAge??h.age-.025)),b=tigerClawSegment(h,origin);
  return polygonContains(point,[a,a.end,b.end,b])||[ [a,a.end],[b,b.end],[a,b],[a.end,b.end] ].some(([u,v])=>segmentDistance(point,u,v)<=h.width);
}
function tigerVulnerable(e) {
  return e.bossType===2&&(e.tigerHunt?Boolean(e.tigerExposed):e.castTime<=0&&e.recoverTime>0&&!e.chargeHit);
}
module.exports={TIMING,beginTigerHunt,advanceTigerHunt,onTigerPounceLand,tigerClawSegment,tigerClawContact,tigerVulnerable};
