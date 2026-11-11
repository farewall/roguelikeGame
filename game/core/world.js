'use strict';
const { clamp, segmentDistance, isFree, slideMove, clipSegment, FlowField } = require('./world-geometry');
const LAYOUTS = [
  { name: '古榕青涧', width: 3600, height: 2400, entry: [1800, 1900], regions: [[900, 950, '古榕林'], [2200, 1700, '青涧石道'], [2200, 550, '青玉遗台']],
    roads: [[[1800,1900],[1800,1300],[700,1300]],[[1800,1300],[1800,550],[2900,600]],[[700,1300],[700,600],[1800,550]],[[1800,1300],[2900,1100]]],
    pools: [[1120,900,210,240],[2420,1700,270,240]], sites: [[680,1250,'青玉泉','health'],[1800,500,'先天灵蕴','xp'],[2980,1050,'木纹残碑','energy']], terrain: 'water' },
  { name: '断戟骨原', width: 4400, height: 2100, entry: [450,1500], regions: [[900,1450,'遗兵长廊'],[2300,1000,'骸骨隘口'],[3700,650,'白骨祭台']],
    roads: [[[450,1500],[1400,1500],[1550,650],[2780,650],[2780,1500],[3930,1500],[3930,600]],[[500,500],[1550,650]],[[2100,1700],[3800,1700]]],
    pools: [], sites: [[1550,650,'战魂残响','xp'],[2780,1500,'遗兵宝匣','health'],[3930,600,'玄铁残碑','energy']], terrain: 'dust' },
  { name: '熔心三岔', width: 3400, height: 2900, entry: [500,2400], regions: [[850,2100,'玄岩台地'],[2100,1500,'熔心裂谷'],[2450,750,'余烬祭坛']],
    roads: [[[500,2400],[1100,2300],[1100,1650],[1500,1650],[1500,700],[2350,900]],[[1100,2100],[2800,2100],[2900,2200]],[[2800,2100],[2800,1000],[2350,900]]],
    pools: [[2200,1500,420,400],[650,950,300,350],[1800,2500,430,220]], sites: [[1100,1650,'温玉泉眼','health'],[2350,900,'地火灵晶','xp'],[2900,2200,'熔心残碑','energy']], terrain: 'lava' },
  { name: '归墟回桥', width: 4200, height: 2700, entry: [600,2150], regions: [[900,1800,'霜岸旧港'],[2250,1700,'双潮回桥'],[3500,700,'沉海古门']],
    roads: [[[600,2150],[900,1550],[900,600],[1650,600],[1650,1900],[2750,1950],[2750,700],[3650,650]],[[1650,900],[2750,900]]],
    pools: [[2050,430,260,340],[2050,1320,270,300],[2050,2330,260,290],[3250,1510,310,420]], sites: [[1150,750,'归墟灵泉','health'],[2750,1950,'寒潮遗匣','xp'],[3650,650,'玄冰残碑','energy']], terrain: 'water' },
  { name: '天道四阙', width: 3500, height: 3500, entry: [1750,2850], regions: [[1750,2700,'南阙云台'],[900,1200,'西阙残殿'],[1750,650,'天纹主庭'],[2800,1200,'东阙连廊']],
    roads: [[[1750,2850],[1750,1750],[1750,650]],[[1750,1750],[650,1750],[650,900]],[[1750,1750],[2870,1750],[2870,1150]],[[700,2850],[700,2100],[1750,2100],[2800,2100],[2800,2850]]],
    pools: [[1120,1200,230,330],[2380,1050,270,360],[1080,2480,300,250],[2390,2500,300,230]], sites: [[650,900,'天纹残卷','xp'],[1750,650,'净心灵泉','health'],[2870,1150,'开天残碑','energy']], terrain: 'void' }
];
function seeded(seed) { let n = seed; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296); }
class WorldState {
  constructor(stage) {
    this.stage = stage; const layout = LAYOUTS[stage - 1]; Object.assign(this, layout);
    this.entry = { x: layout.entry[0], y: layout.entry[1] }; this.regions = layout.regions.map(([x,y,name]) => ({x,y,name}));
    this.roads = layout.roads.map(path => path.map(([x,y]) => ({x,y})));
    this.sites = layout.sites.map(([x,y,name,kind],i) => ({ id: 'site-'+i, x,y,name,kind,visited:false,used:false }));
    this.pools = layout.pools.map(([x,y,rx,ry],i) => {
      const points = Array.from({length:16},(_,j) => { const a=j*Math.PI/8, r=1+Math.sin(j*2.4+i)*0.08;return {x:x+Math.cos(a)*rx*r,y:y+Math.sin(a)*ry*r}; });
      return {id:'pool-'+i,x,y,rx,ry,points,kind:layout.terrain,cover:false,bounds:{left:x-rx*1.1,right:x+rx*1.1,top:y-ry*1.1,bottom:y+ry*1.1}};
    });
    this.props = []; this.solids = [...this.pools]; const random = seeded(1709 + stage * 997);
    for (let attempt=0;attempt<1200 && this.props.length<62;attempt++) {
      const p={x:180+random()*(this.width-360),y:180+random()*(this.height-360)}, radius=36+random()*24;
      if (Math.hypot(p.x-this.entry.x,p.y-this.entry.y)<200 || this.sites.some(s=>Math.hypot(p.x-s.x,p.y-s.y)<210)) continue;
      if (this.roads.some(path=>path.some((a,i)=>i>0 && segmentDistance(p,path[i-1],a)<135+radius))) continue;
      if (!isFree(this,p,radius+160)) continue;
      const prop={id:'prop-'+this.props.length,...p,radius,sprite:(stage-1)*3+Math.floor(random()*3),size:150+radius*1.2,flip:random()<0.5,
        bounds:{left:p.x-radius,right:p.x+radius,top:p.y-radius,bottom:p.y+radius}};
      this.props.push(prop);this.solids.push(prop);
    }
    this.nav = new FlowField(this); this.bossNav = new FlowField(this,64,36,true); this.explored = 0;
  }
  camera(player, width, height) { return {x:clamp(player.x-width/2,0,Math.max(0,this.width-width)),y:clamp(player.y-height/2,0,Math.max(0,this.height-height)),width,height}; }
  footOffset(entity) { return entity.boss?72:entity.fodder?24:({wraith:40,ranged:46,charger:48,elite:56}[entity.kind]||54); }
  regionAt(p) { return this.regions.reduce((a,b)=>Math.hypot(p.x-b.x,p.y-b.y)<Math.hypot(p.x-a.x,p.y-a.y)?b:a).name; }
  move(p,dx,dy,radius=20,limits) { return slideMove(this,p,dx,dy,radius,limits); }
  clip(from,to,radius=12,coverOnly=false) { return clipSegment(this,from,to,radius,coverOnly); }
  prepareNavigation(work=64) { return this.bossNav.prepare(work); }
  steer(from,to,radius=20) { return (radius>24?this.bossNav:this.nav).direction(from,to,radius); }
  spawnPoint(c,kind,fodder=false) {
    const player=c.point(c.player), boss=kind==='boss', min=boss?350:300, max=boss?520:700, margin=boss?118:70,offset=this.footOffset({kind,boss,fodder});
    let best=null,bestOpen=-1;
    const nav=boss?this.bossNav:this.nav;if(!nav.ready)return null;nav.update(c.groundPoint(c.player));
    for(let i=0;i<40;i++) {
      const a=c.random()*Math.PI*2+i*2.399963, r=min+((c.random()+i*0.17)%1)*(max-min), p={x:clamp(player.x+Math.cos(a)*r,margin,this.width-margin),y:clamp(player.y+Math.sin(a)*r,margin,this.height-margin)};
      const foot={x:p.x,y:p.y+offset};
      if(Math.hypot(p.x-player.x,p.y-player.y)<180 || !isFree(this,foot,boss?50:28) || nav.cost[nav.index(foot)]<0 || !nav.canJoin(foot,boss?34:20)) continue;
      if(c.enemies.some(e=>c.distance(c.percent(p),e)<(boss?100:55))) continue;
      if(boss){const open=Array.from({length:8},(_,j)=>isFree(this,{x:p.x+Math.cos(j*Math.PI/4)*170,y:p.y+Math.sin(j*Math.PI/4)*170+54},24)).filter(Boolean).length;
        if(open>bestOpen){bestOpen=open;best=p;}if(open<7)continue;}
      return c.percent(p);
    }
    return best?c.percent(best):null;
  }
  openDirection(origin,preferred) {
    let best=preferred,score=-Infinity;
    for(let i=0;i<16;i++){
      const angle=preferred+i*Math.PI/8;if(!isFree(this,{x:origin.x+Math.cos(angle)*140,y:origin.y+Math.sin(angle)*140+54},24))continue;
      const open=[140,230,330].filter(r=>isFree(this,{x:origin.x+Math.cos(angle)*r,y:origin.y+Math.sin(angle)*r+54},24)).length;
      const delta=Math.abs(Math.atan2(Math.sin(angle-preferred),Math.cos(angle-preferred))),value=open*10-delta;
      if(value>score){score=value;best=angle;}
    }
    return best;
  }
  update(c) {
    this.prepareNavigation();
    const p=c.groundPoint(c.player);
    for(const site of this.sites) {
      const d=Math.hypot(p.x-site.x,p.y-site.y);
      if(d<420 && !site.visited) { site.visited=true; this.explored++; }
      if(site.used || d>82 || site.kind==='health' && c.hp>=c.maxHp || site.kind==='energy' && c.energy>=100) continue;
      site.used=true;
      if(site.kind==='health') c.hp=Math.min(c.maxHp,c.hp+18);
      if(site.kind==='energy') c.gainEnergy(50);
      if(site.kind==='xp') c.xp+=4;
      c.effect('world-loot',c.percent(site),32,{life:0.55}); c.emit('world-loot',{name:site.name,reward:{health:'恢复18元气',energy:'补充50能量',xp:'获得4灵气'}[site.kind]});
    }
    for(const e of c.enemies) if(!e.boss && e.hp>0 && c.distance(c.player,e)>Math.max(1200,c.viewWidth*0.95)) {
      const to=this.spawnPoint(c,e.kind,e.fodder); if(!to) continue;
      Object.assign(e,to,{spawnTime:e.spawnDuration,cooldown:Math.max(1,e.cooldown),castTime:0,recoverTime:0,dashing:false});
      c.hazards=c.hazards.filter(h=>h.owner!==e.id);
    }
  }
}
module.exports = { WorldState, LAYOUTS };
