'use strict';
const { BannerCombat } = require('./banner');
const SWORDS = { count: 4, radius: 98, depth: .62, size: 126, idleSpeed: .24, range: 420, skillRange: 500, interval: 1.2, damage: 3.2,
  stagger: .18, speed: 1080, returnSpeed: 1550, sideDamage: .7, returnDamage: .5, repeatDamage: .35,
  marginX: 208, marginTop: 168, marginBottom: 148, names: ['诛仙', '戮仙', '陷仙', '绝仙'] };
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const length = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a, b) => { const d = length(a, b) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function cubic(a, b, c, d, t) { const s = 1 - t; return { x: s*s*s*a.x + 3*s*s*t*b.x + 3*s*t*t*c.x + t*t*t*d.x, y: s*s*s*a.y + 3*s*s*t*b.y + 3*s*t*t*c.y + t*t*t*d.y }; }
function segmentDistance(p, a, b) { const x=b.x-a.x,y=b.y-a.y,t=clamp(((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1));return Math.hypot(p.x-a.x-x*t,p.y-a.y-y*t); }
function sweptBladeContact(p, before, after, radius) {
  const polygon=[before.base,before.tip,after.tip,after.base];let inside=false;
  for(let i=0,j=3;i<4;j=i++) { const a=polygon[i],b=polygon[j];if(segmentDistance(p,a,b)<=radius+5)return true;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside; }
  return inside;
}
const active = state => ['out','slash','return','skill-cut'].includes(state);
class SwordCombat extends BannerCombat {
  constructor() { super(); this.resetSwords(); }
  resetSwords() {
    this.swordClock=0;this.swordAnchor=null;this.swordSkill=null;this.swordEnemyPrevious=new Map();
    this.flyingSwords=SWORDS.names.map((name,index)=>({name,index,state:'idle',age:0,angle:0,position:null,trail:[],hitIds:new Set(),attack:null}));
  }
  swordHome(index) {
    const p=this.swordAnchor||this.point(this.player),t=this.swordClock,phase=Math.PI/4+index*Math.PI/2+t*SWORDS.idleSpeed+.1*Math.sin(t*.8+index),depth=Math.sin(phase);
    return {x:p.x+Math.cos(phase)*SWORDS.radius,y:p.y-16+depth*SWORDS.radius*SWORDS.depth+5*Math.sin(t*2+index*1.7),depth,size:SWORDS.size*(.9+depth*.08),angle:.1*Math.sin(t*1.9+index*1.6)};
  }
  safeSwordPoint(p) { const r=74;return {x:clamp(p.x,r,this.width-r),y:clamp(p.y,r,this.height-r)}; }
  swordPose(f,includeTrail=true) {
    const home=this.swordHome(f.index),idle=['idle','waiting'].includes(f.state),p=idle?home:f.position||home;
    const rotation=idle?home.angle:f.angle,size=idle?home.size:SWORDS.size*(f.state==='settle'?(.9+home.depth*.08):1),direction={x:Math.sin(rotation),y:-Math.cos(rotation)};
    return { index:f.index,name:f.name,...this.percent(p),state:f.state,skill:Boolean(f.attack?.skill),size,width:size*.52,height:size,
      depth:idle?home.depth:(p.y-this.point(this.player).y+16)/65,angle:-rotation*180/Math.PI,
      trail:includeTrail?f.trail.map(v=>({...v,alpha:clamp(1-(this.swordClock-v.time)/.13)})):[],
      blade:{base:{x:p.x-direction.x*size*.2,y:p.y-direction.y*size*.2},tip:{x:p.x+direction.x*size*.46,y:p.y+direction.y*size*.46}} };
  }
  swordPoses() { return this.flyingSwords.map(f=>this.swordPose(f)); }
  swordTargets(skill=false) {
    const camera=this.camera(),range=skill?SWORDS.skillRange:SWORDS.range;
    return this.enemies.filter(e=>{if(e.hp<=0||e.spawnTime>0||this.distance(this.player,e)>range)return false;const p=this.point(e);return p.x>=camera.x+12&&p.x<=camera.x+camera.width-12&&p.y>=camera.y+12&&p.y<=camera.y+camera.height-12;});
  }
  swordCanLaunch() { return !this.swordSkill&&this.flyingSwords.some(f=>f.state==='idle'); }
  pickSwordTarget(f,targets) {
    const near=targets.filter(e=>this.distance(this.player,e)<145),pool=f.index===0&&near.length?near:targets;let best=null,score=-Infinity;
    for(const e of pool){const crowd=targets.filter(v=>this.distance(e,v)<100).length,claims=this.flyingSwords.filter(v=>v!==f&&v.targetId===e.id&&v.state!=='idle').length;
      const value=crowd*34-this.distance(this.player,e)*.08-claims*95+(e.boss?8:0);if(value>score){score=value;best=e;}}
    return best;
  }
  launchSwordRound(attack={}) {
    if(!this.swordCanLaunch())return false;const targets=this.swordTargets();if(!targets.length)return false;
    const round={id:++this.nextId,swordVolley:true,baseDamage:this.damage(),elements:{...this.elements},registered:false,hitCounts:new Map(),released:false,...attack};
    let order=0;for(const f of this.flyingSwords)if(f.state==='idle'){Object.assign(f,{state:'waiting',age:0,hitPause:0,delay:order++*Math.min(SWORDS.stagger,this.interval()/5),attack:round,targetId:null,hitIds:new Set(),retargets:0,seekTime:0});}
    this.lastAimDirection=attack.direction||this.lastAimDirection;return true;
  }
  startSwordWindup(f) {
    const e=this.pickSwordTarget(f,this.swordTargets());if(!e){f.state='idle';f.attack=null;return;}
    const home=this.swordHome(f.index);Object.assign(f,{state:'windup',age:0,position:{x:home.x,y:home.y},angle:home.angle,targetId:e.id,goal:this.point(e),direction:unit(home,this.point(e))});
  }
  startSwordOut(f) {
    f.state='out';f.age=0;f.from={...f.position};f.direction=unit(f.position,f.goal);f.duration=clamp(length(f.position,f.goal)/SWORDS.speed+.09,.18,.65);
    if(!f.attack.released){f.attack.released=true;this.emit('sword-release',{skill:false});}
  }
  startSwordSlash(f) {
    f.state='slash';f.age=0;f.center={...f.goal};f.arc=Math.atan2(f.position.y-f.goal.y,f.position.x-f.goal.x);f.radius=length(f.position,f.goal);f.duration=.17;f.turn=f.index%2?-1:1;
  }
  startSwordReturn(f,recall=false) {
    const home=this.swordHome(f.index),d={x:Math.sin(f.angle),y:-Math.cos(f.angle)},side=f.index%2?-1:1;
    Object.assign(f,{state:recall?'recall':'return',age:0,from:{...f.position},control:{x:f.position.x+d.x*60,y:f.position.y+d.y*60},side,duration:clamp(length(f.position,home)/(recall?1900:SWORDS.returnSpeed)+.09,.16,recall ? .42 : .55)});
  }
  beginSwordSkill() {
    const targets=this.swordTargets(true);if(!targets.length||this.swordSkill)return false;
    const focus=targets.find(e=>e.boss)||targets.find(e=>e.kind==='elite')||this.nearest(targets);
    this.swordSkill={id:++this.nextId,skill:true,phase:'recall',age:0,mode:targets.length===1?'single':'crowd',focusId:focus.id,damage:this.damage()*3.5,damageByEnemy:new Map()};
    for(const f of this.flyingSwords){const pose=this.swordPose(f);f.position=this.point(pose);f.attack=this.swordSkill;f.hitPause=0;f.hitIds=new Set();f.targetId=null;this.startSwordReturn(f,true);}
    return true;
  }
  prepareSwordSkill() {
    const skill=this.swordSkill,targets=this.swordTargets(true);if(!targets.length){this.swordSkill=null;for(const f of this.flyingSwords)f.attack=null;return;}
    const focus=targets.find(e=>e.id===skill.focusId)||targets.find(e=>e.boss)||this.nearest(targets),player=this.point(this.player);skill.phase='gather';
    for(const f of this.flyingSwords){const e=skill.mode==='single'||focus.boss&&f.index%2===0?focus:this.pickSwordTarget(f,targets),p=this.point(e),d=unit(player,p),side={x:-d.y,y:d.x};
      const a=Math.atan2(d.y,d.x)+Math.PI/2*f.index,spread=[-110,-35,35,110][f.index];
      let rally=skill.mode==='single'?{x:p.x+Math.cos(a)*105,y:p.y+Math.sin(a)*90}:{x:player.x+side.x*spread,y:player.y+side.y*spread-12};
      const camera=this.camera();rally=this.safeSwordPoint({x:clamp(rally.x,camera.x+74,camera.x+camera.width-74),y:clamp(rally.y,camera.y+74,camera.y+camera.height-74)});
      Object.assign(f,{state:'skill-gather',age:0,targetId:e.id,goal:p,from:{...f.position},end:rally,duration:clamp(length(f.position,rally)/1800+.08,.14,.4)});
    }
  }
  startSwordSkillCuts() {
    const skill=this.swordSkill;skill.phase='cut';this.emit('sword-release',{skill:true,mode:skill.mode});
    for(const f of this.flyingSwords){const e=this.enemies.find(e=>e.id===f.targetId&&e.hp>0&&!e.spawnTime);if(e)f.goal=this.point(e);
      const d=unit(f.position,f.goal);Object.assign(f,{state:'skill-cut',age:0,from:{...f.position},direction:d,end:this.safeSwordPoint({x:f.goal.x+d.x*105,y:f.goal.y+d.y*105}),duration:clamp(length(f.position,f.goal)/1800+.19,.25,.46)});}
  }
  updateSwordBody(f,dt) {
    if(f.hitPause>0){f.hitPause=Math.max(0,f.hitPause-dt);return;}
    const home=this.swordHome(f.index);f.age+=dt;
    if(f.state==='idle'||f.state==='waiting'){f.position={x:home.x,y:home.y};f.angle=home.angle;if(f.state==='waiting'&&f.age>=f.delay)this.startSwordWindup(f);return;}
    const previous={...f.position};
    if(f.state==='windup'){const u=smooth(f.age/.1);f.position={x:home.x-f.direction.x*14*u,y:home.y-f.direction.y*14*u};f.angle=home.angle+angleDelta(home.angle,Math.atan2(f.direction.y,f.direction.x)+Math.PI/2)*u;if(f.age>=.1)this.startSwordOut(f);return;}
    if(f.state==='out'){
      f.seekTime+=dt;let e=this.enemies.find(e=>e.id===f.targetId&&e.hp>0&&!e.spawnTime);
      if(!e){if(f.hitIds.has(f.targetId)){this.startSwordSlash(f);return;}if(!f.retargets){e=this.pickSwordTarget(f,this.swordTargets());f.retargets++;if(e){f.targetId=e.id;f.goal=this.point(e);this.startSwordOut(f);}}
        if(!e){this.startSwordReturn(f);return;}}
      if(this.distance(this.player,e)>SWORDS.range+150||f.seekTime>.95){this.startSwordReturn(f);return;}
      const p=this.point(e);f.goal=mix(f.goal,p,Math.min(1,dt*18));const d=f.direction,side=f.index%2?-1:1,u=clamp(f.age/f.duration),end={x:f.goal.x-d.x*42,y:f.goal.y-d.y*42};
      f.position=cubic(f.from,{x:f.from.x+d.x*75-d.y*side*35,y:f.from.y+d.y*75+d.x*side*35},{x:end.x-d.x*25+d.y*side*55,y:end.y-d.y*25-d.x*side*55},end,u*u*(2-u));
      if(u>=1)this.startSwordSlash(f);
    }else if(f.state==='slash'){const u=clamp(f.age/f.duration),a=f.arc+f.turn*Math.PI*.9*u;f.position={x:f.center.x+Math.cos(a)*f.radius,y:f.center.y+Math.sin(a)*f.radius};if(u>=1)this.startSwordReturn(f);
    }else if(f.state==='return'||f.state==='recall'){
      const u=clamp(f.age/f.duration),control={x:home.x-65,y:home.y+f.side*(75+f.index*9)};f.position=cubic(f.from,f.control,control,home,1-(1-u)**1.35);
      if(u>=1){f.state=f.state==='recall'?'idle':'settle';f.age=0;f.position={x:home.x,y:home.y};f.angle=home.angle;}
    }else if(f.state==='settle'){const u=clamp(f.age/.16),w=Math.sin(u*Math.PI*2)*Math.exp(-u*3.5);f.position={x:home.x+6*w,y:home.y+4*w};f.angle=home.angle+.12*w;if(u>=1){f.state='idle';f.targetId=null;f.attack=null;}
    }else if(f.state==='skill-gather'){const u=smooth(f.age/f.duration);f.position=cubic(f.from,{x:f.from.x,y:f.from.y-45},{x:f.end.x,y:f.end.y-35},f.end,u);if(u>=1){f.state='skill-ready';f.age=0;}
    }else if(f.state==='skill-cut'){
      const u=clamp(f.age/f.duration),d=f.direction,side=f.index%2?-1:1;
      if(u<.65)f.position=cubic(f.from,{x:f.from.x+d.x*70-d.y*side*25,y:f.from.y+d.y*70+d.x*side*25},{x:f.goal.x-d.x*50,y:f.goal.y-d.y*50},f.goal,u/.65);
      else f.position=cubic(f.goal,{x:f.goal.x+d.x*35,y:f.goal.y+d.y*35},{x:f.end.x-d.x*25+d.y*side*30,y:f.end.y-d.y*25-d.x*side*30},f.end,(u-.65)/.35);
      if(u>=1)this.startSwordReturn(f);
    }
    f.position=this.safeSwordPoint(f.position);
    if(length(previous,f.position)>.01&&f.state!=='settle'&&f.state!=='idle'){
      const target=Math.atan2(f.position.y-previous.y,f.position.x-previous.x)+Math.PI/2;f.angle+=clamp(angleDelta(f.angle,target),-dt*22,dt*22);
      if(f.state==='return'){const blend=smooth((f.age/f.duration-.75)/.25);f.angle+=angleDelta(f.angle,home.angle)*blend;}
    }
  }
  hitWithSword(f,attack,e,returning) {
    f.hitIds.add(e.id);f.hitPause=returning ? .015 : .025;
    if(attack.skill){const spent=attack.damageByEnemy.get(e.id)||0,damage=Math.min(attack.damage-spent,attack.mode==='single'?attack.damage/4:attack.damage);if(damage>1e-7){this.deal(e,damage,'skill');attack.damageByEnemy.set(e.id,spent+damage);this.effect('impact',e,30);}return;}
    const count=attack.hitCounts.get(e.id)||0,scale=(returning?SWORDS.returnDamage:e.id===f.targetId?1:SWORDS.sideDamage)*(count?SWORDS.repeatDamage:1);
    const packet={...attack,registered:attack.registered,damage:attack.baseDamage*scale,direction:{x:Math.sin(f.angle),y:-Math.cos(f.angle)},targetId:f.targetId,swordReturn:returning};
    this.applyStrike(packet,[e],this.percent(f.position));attack.registered=packet.registered;attack.hitCounts.set(e.id,count+1);
  }
  updateSwords(dt) {
    if(this.weapon!=='swords')return;
    const old=this.swordEnemyPrevious,current=new Map(this.enemies.map(e=>[e.id,this.point(e)]));let elapsed=0;
    while(elapsed<dt-1e-8){const step=Math.min(.01,dt-elapsed),start=elapsed/dt,end=(elapsed+step)/dt;elapsed+=step;this.swordClock+=step;
      const player=this.point(this.player);this.swordAnchor=!this.swordAnchor||length(this.swordAnchor,player)>600?player:mix(this.swordAnchor,player,1-Math.exp(-step*16));
      if(this.swordSkill)this.swordSkill.age+=step;
      for(const f of this.flyingSwords){const before=this.swordPose(f,false),state=f.state,attack=f.attack;this.updateSwordBody(f,step);const after=this.swordPose(f,false),a=f.attack||attack;
        if(a&&(active(state)||active(f.state))&&state!=='recall')for(const e of this.enemies){if(e.hp<=0||e.spawnTime||f.hitIds.has(e.id))continue;
          const now=current.get(e.id),was=old.get(e.id)||now,p0=mix(was,now,start),p1=mix(was,now,end),dx=p1.x-p0.x,dy=p1.y-p0.y;
          const relative={base:{x:before.blade.base.x+dx,y:before.blade.base.y+dy},tip:{x:before.blade.tip.x+dx,y:before.blade.tip.y+dy}};
          if(sweptBladeContact(p1,relative,after.blade,e.boss?30:18))this.hitWithSword(f,a,e,state==='return');
        }
        f.trail=f.trail.filter(p=>this.swordClock-p.time<.13);if(active(f.state)&&f.position&&(!f.trail.length||length(f.trail[f.trail.length-1],f.position)>3))f.trail.push({...f.position,time:this.swordClock});if(f.trail.length>12)f.trail.shift();
      }
      const skill=this.swordSkill;if(skill){if(skill.phase==='recall'&&skill.age>=.12&&this.flyingSwords.every(f=>f.state==='idle'))this.prepareSwordSkill();
        else if(skill.phase==='gather'&&this.flyingSwords.every(f=>f.state==='skill-ready'))this.startSwordSkillCuts();
        else if(skill.phase==='cut'&&this.flyingSwords.every(f=>f.state==='idle')){this.swordSkill=null;for(const f of this.flyingSwords)f.attack=null;}}
    }
    this.swordEnemyPrevious=current;
  }
}
module.exports={SWORDS,SwordCombat,sweptBladeContact};
