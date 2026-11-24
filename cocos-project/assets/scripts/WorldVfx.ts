const THEMES = [0xc9dc99, 0xe1c79b, 0xd99f70, 0xc1dfdf, 0xded6ad];
const MAP_LAND = [0xe1d0ac, 0xd4bb8a, 0xc38e6b, 0xa7c8ce, 0xcac797];
const MAP_ROAD = [0xb9a982, 0xf0d397, 0xf0bd87, 0xe1e3c5, 0xf1dfaa];
const MARKERS = { health: 1, xp: 15, relic: 15, energy: 14, altar: 14 };
const INK = 0x274139, PAPER = 0xffefca, GOLD = 0xffda79;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function drawWorld(v, ground, terrain, actors, point) {
  const c=v.c, core=c.combat, world=core.world, cam=core.camera(), a=c.layout.arena, g=terrain.g;
  const visible=(x,y,pad=250)=>x>=cam.x-pad && x<=cam.x+cam.width+pad && y>=cam.y-pad && y<=cam.y+cam.height+pad;
  const tile=512, sx=Math.floor(cam.x/tile), sy=Math.floor(cam.y/tile), columns=Math.ceil(cam.width/tile)+1, rows=Math.ceil(cam.height/tile)+1;
  for(let y=0;y<rows;y++) for(let x=0;x<columns;x++) {
    const wx=(sx+x)*tile, wy=(sy+y)*tile; if(wx>=world.width || wy>=world.height) continue;
    const w=Math.min(tile,world.width-wx),h=Math.min(tile,world.height-wy),flipX=(sx+x)%2===1,flipY=(sy+y)%2===1;
    const sprite=v.image(ground,'ground-'+x+'-'+y,v.assets.frames.worldGround[world.stage-1],a.x+wx,a.y+wy,w,h,0.95);
    sprite.node.setScale(flipX?-1:1,flipY?-1:1,1);sprite.node.setPosition(a.x+wx+(flipX?w:0),-(a.y+wy+(flipY?h:0)));
  }
  // Flat, eroded landmarks belong to the traversable ground. Upright objects
  // and their real collision footprints remain in the actor layer above them.
  for(const [i,region] of world.regions.entries()){
    const size=[780,860,760,750,710][world.stage-1];if(!visible(region.x,region.y,size*.6))continue;
    const mark=v.image(ground,'landmark-'+i,v.assets.frames.worldStyle[world.stage-1],a.x+region.x-size/2,a.y+region.y-size*.36,size,size*.72,[.17,.35,.32,.34,.36][world.stage-1]);mark.tint=0xc6d4a8;
    if(i%2){mark.node.setScale(-1,1,1);mark.node.setPosition(a.x+region.x+size/2,-(a.y+region.y-size*.36));}else mark.node.setScale(1,1,1);
  }
  const roads = v.layers.roads, offset = a.x + ':' + a.y;
  if (roads.world!==world || roads.offset!==offset) {
    roads.world=world; roads.offset=offset;
    const base=roads.g;base.clear();
    base.lineStyle(0);base.beginFill(INK,.06);
    base.drawRect(a.x,a.y,world.width,world.height);base.endFill();
    for(const road of world.roads)for(let j=1;j<road.length;j++){
      const from=road[j-1],to=road[j],dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length,sideA=[],sideB=[],count=Math.max(2,Math.ceil(length/60));
      for(let i=0;i<=count;i++){const t=i/count,x=from.x+dx*t,y=from.y+dy*t,w=36+Math.sin(i*1.7+j)*8;sideA.push(a.x+x+nx*w,a.y+y+ny*w);sideB.unshift(a.x+x-nx*w,a.y+y-ny*w);}
      base.lineStyle(0);base.beginFill(MAP_ROAD[world.stage-1],.31);base.drawPolygon([...sideA,...sideB]);base.endFill();
    }
    base.lineStyle(24,0x172529,0.9);base.moveTo(a.x,a.y);base.lineTo(a.x+world.width,a.y);base.lineTo(a.x+world.width,a.y+world.height);base.lineTo(a.x,a.y+world.height);base.lineTo(a.x,a.y);
  }
  // Water, molten rock and void are physical terrain. Their visible shore is the collision contour.
  for(const pool of world.pools) {
    if(!visible(pool.x,pool.y,Math.max(pool.rx,pool.ry)+100)) continue;
    const index=pool.kind==='lava'?1:pool.kind==='void'?2:world.stage===1?3:0;
    v.terrainSurface(terrain,pool.id,v.assets.frames.worldPools[index],pool,a);
  }
  const silhouettes=[core.groundPoint(core.player),...core.enemies.filter(e=>visible(core.point(e).x,core.point(e).y,220)&&e.castTime>0).map(e=>core.groundPoint(e))];
  for(const prop of world.props) {
    if(!visible(prop.x,prop.y,prop.size)) continue;
    const texture=prop.tigerPillar?v.assets.frames.tigerPillars[prop.broken?1:0]:v.assets.frames.worldProps[prop.sprite];
    const occluding=silhouettes.some(p=>Math.abs(p.x-prop.x)<prop.size*.32 && p.y<prop.y && p.y>prop.y-prop.size*.66);
    const sprite=v.image(actors,'terrain-'+prop.id,texture,a.x+prop.x-prop.size/2,a.y+prop.y-prop.size*(prop.tigerPillar ? .948 : .87),prop.size,prop.size,occluding?.49:1);
    sprite.tint=prop.tigerPillar?0xffffff:0xf5f1da;(sprite.node as any).worldDepth=a.y+prop.y;
    if(prop.flip) { sprite.node.setScale(-1,1,1);sprite.node.setPosition(a.x+prop.x+prop.size/2,-(a.y+prop.y-prop.size*0.87)); }
    else sprite.node.setScale(1,1,1);
  }
  for(const site of world.sites) {
    if(!visible(site.x,site.y,160)) continue;
    const size=site.kind==='xp'?120:145, sprite=site.kind==='xp'?15:site.kind==='health'?1:14;
    const body=v.image(actors,'site-'+site.id,v.assets.frames.worldProps[sprite],a.x+site.x-size/2,a.y+site.y-size*0.85,size,size,site.used?0.55:1);(body.node as any).worldDepth=a.y+site.y;
    if(site.visited) v.text(actors,'site-label-'+site.id,site.name+(site.used?' · 已取':''),a.x+site.x,a.y+site.y+22,19,site.used?0x8c9c93:THEMES[world.stage-1],{center:true});
    if(!site.used) {
      const x=a.x+site.x,y=a.y+site.y-56;
      g.lineStyle(2,site.kind==='health'?0x9bd8b1:site.kind==='energy'?0xb6d7ed:0xe3c88b,0.65);
      for(let j=0;j<3;j++){const yy=y-((core.time*26+j*14)%43);g.moveTo(x+(j-1)*10,yy);g.lineTo(x+(j-1)*10,yy-6);}
    }
  }
  const relic=world.relic;
  if(relic&&visible(relic.x,relic.y,180)){
    const complete=['complete','claimed'].includes(relic.status),body=v.image(actors,'world-relic',v.assets.frames.worldProps[15],a.x+relic.x-72,a.y+relic.y-125,144,144,complete?.5:1);
    (body.node as any).worldDepth=a.y+relic.y;
    if(relic.visited)v.text(actors,'world-relic-name',relic.name+(complete?' · 已解':' · 查看'),a.x+relic.x,a.y+relic.y+28,22,complete?0x92a395:0xe6c88b,{center:true});
    if(!complete){for(let i=0;i<3;i++){const yy=a.y+relic.y-90-(core.time*19+i*19)%54;g.lineStyle(2,0xe4c686,.55);g.moveTo(a.x+relic.x-12+i*12,yy);g.lineTo(a.x+relic.x-9+i*12,yy-9);}}
  }
  const altar = world.phoenixAltar;
  if (altar && visible(altar.x, altar.y, 160) && core.phase < 3) {
    const x = a.x + altar.x, y = a.y + altar.y;
    const body = v.image(actors, 'phoenix-altar', v.assets.frames.worldProps[14], x - 66, y - 116, 132, 132);
    (body.node as any).worldDepth = y;
    v.text(actors, 'phoenix-altar-name', altar.name, x, y + 26, 21, 0xe3a478, {center:true});
  }
}
function drawMap(v, layer, x, y, width, height, expanded=false) {
  const c=v.c, core=c.combat, world=core.world, g=layer.g, stage=world.stage-1;
  const scale=Math.min(width/world.width,height/world.height), w=world.width*scale,h=world.height*scale;
  x+=(width-w)/2;
  y+=(height-h)/2;
  const position=p=>({x:x+p.x*scale,y:y+p.y*scale});
  const targets=world.mapTargets(core.phase), focus=targets.find(p=>p.id===c.data.mapTarget&&p.available);
  v.rect(layer,x,y,w,h,MAP_LAND[stage],expanded?1:.92,0xa79c6b,expanded?16:8);
  if(expanded) {
    v.image(layer,'map-material',v.assets.frames.worldGround[stage],x+2,y+2,w-4,h-4,.21,true);
    // Art sits over the checked-in geometry. The actual route and pins always use world coordinates.
    for(const prop of world.props.filter((prop,i)=>i%4===0&&!prop.tigerPillar)) {
      const p=position(prop);
      v.image(layer,'map-prop-'+prop.id,v.assets.frames.worldProps[prop.sprite],p.x-18,p.y-32,36,36,.66);
    }
    for(const [i,region] of world.regions.entries()) {
      const p=position(region), size=70;
      v.image(layer,'map-region-'+i,v.assets.frames.worldProps[stage*3],p.x-size/2,p.y-size*.86,size,size,.78);
    }
  }
  for(const pool of world.pools) {
    const shape=pool.points.flatMap(p=>[x+p.x*scale,y+p.y*scale]);
    g.lineStyle(expanded?3:1,pool.kind==='lava'?0x812f23:0xc7e5bf);
    g.beginFill(pool.kind==='lava'?0xc3633a:pool.kind==='void'?0x3f5474:0x3f9f9a,1);
    g.drawPolygon(shape);g.endFill();
  }
  for(const road of world.roads) {
    g.lineStyle(expanded?11:2,MAP_ROAD[stage]);
    road.forEach((node,i)=>{const p=position(node);if(i)g.lineTo(p.x,p.y);else g.moveTo(p.x,p.y);});
  }
  const player=core.groundPoint(core.player);
  if(expanded&&focus) {
    const trail=world.nav.route(player,focus).map(position);
    g.lineStyle(1,0x92602b);g.beginFill(GOLD);
    let next=7;
    for(let i=1;i<trail.length;i++) {
      const from=trail[i-1],to=trail[i],dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
      for(;next<length;next+=14)g.drawCircle(from.x+dx*next/length,from.y+dy*next/length,3.5);
      next-=length;
    }
    g.endFill();
  }
  if(expanded)for(const pillar of world.tigerPillars||[]){
    const p=position(pillar);
    v.image(layer,'map-pillar-'+pillar.id,v.assets.frames.tigerPillars[pillar.broken?1:0],p.x-16,p.y-24,32,32);
  }
  for(const target of targets) {
    const p=position(target),size=expanded?49:target===focus?14:7,selected=target===focus;
    g.lineStyle(selected?3:1,selected?0xffedb0:0x39604d);
    g.beginFill(selected?0xc77c27:target.available?0xe8d19d:0x9caa8f);
    g.drawCircle(p.x,p.y,size*(expanded?.31:.49));g.endFill();
    if(expanded) {
      const id=target.kind==='altar'?'map-phoenix-altar':'map-pin-'+target.id;
      v.image(layer,id,v.assets.frames.worldProps[MARKERS[target.kind]],p.x-size/2,p.y-size*.84,size,size,target.available?1:.52);
      if(target.available)v.regions.push({id:'map-pin-'+target.id,x:p.x-34,y:p.y-34,width:68,height:68,action:()=>c.selectMapTarget(target.id)});
    }
  }
  const boss=core.enemies.find(e=>e.boss&&e.hp>0);
  if(boss){
    const p=position(core.point(boss));
    g.lineStyle(1.5,PAPER);g.beginFill(0xbc5135);g.drawCircle(p.x,p.y,expanded?13:5);g.endFill();
    if(expanded) {
      const icon=boss.bossType===2?v.assets.frames.tiger[0]:v.assets.frames.bosses[boss.bossType-1][0];
      v.image(layer,'map-boss',icon,p.x-28,p.y-45,56,56);
    }
  }
  const p=position(player);
  g.lineStyle(expanded?2.5:1.5,PAPER);g.beginFill(0x4b7051);
  g.drawCircle(p.x,p.y,expanded?17:5);g.endFill();
  if(expanded)v.image(layer,'map-player',v.assets.frames.hero[0],p.x-20,p.y-35,40,40);
}

export function drawWorldMapPanel(v) {
  const c=v.c,core=c.combat,world=core.world,width=Math.min(c.layout.w-48,1420);
  const {layer,x,y}=v.modal(width,650),side=Math.min(385,width*.31),sideX=x+width-side-22;
  v.text(layer,'world-map-title',world.name,x+28,y+20,40,GOLD,{serif:true,bold:true,minPx:15});
  v.text(layer,'world-map-region',world.regionAt(core.point(core.player)),x+247,y+35,23,PAPER,{minPx:11});
  drawMap(v,layer,x+24,y+92,width-side-69,532,true);
  const targets=world.mapTargets(core.phase);
  const keyPlaces=['relic','health','altar'].flatMap(kind=>targets.filter(t=>t.kind===kind));
  for(const [i,target] of keyPlaces.entries()) {
    const top=y+102+i*135,selected=c.data.mapTarget===target.id&&target.available;
    const title=target.kind==='relic'&&world.stage===1?'解印断根':target.kind==='health'?'灵泉补给':target.name;
    const description=target.kind==='relic'?target.boon:target.kind==='health'?'恢复 18 元气':'精英波可提前迎战朱雀';
    const status=target.kind==='relic'&&target.status==='active'?'守印试炼进行中':
      target.kind==='relic'&&target.status==='ready'?'首领已现身':target.kind==='relic'?'遗迹已结算':'补给已领取';
    v.rect(layer,sideX,top,side,110,selected?0xffe1a3:PAPER,target.available?1:.65,selected?0xe8a52e:0xb6a371,15);
    v.image(layer,'map-goal-icon-'+target.id,v.assets.frames.worldProps[MARKERS[target.kind]],sideX+8,top+17,76,76);
    v.text(layer,'map-goal-'+target.id,title,sideX+88,top+14,31,INK,{bold:true,minPx:12});
    v.text(layer,'map-goal-info-'+target.id,target.available?description:status,sideX+88,top+60,21,INK,{wrap:side-94,minPx:10});
    v.regions.push({id:'map-target-'+target.kind,x:sideX,y:top,width:side,height:110,enabled:target.available,action:()=>c.selectMapTarget(target.id)});
  }
  const focus=targets.find(t=>t.id===c.data.mapTarget&&t.available);
  if(focus)v.text(layer,'map-focus-label','已标记 · '+focus.name,sideX+side/2,y+505,23,GOLD,{center:true,minPx:11});
  v.button(layer,'world-map-close','返回探索',sideX,y+528,side,106,()=>c.closeWorldMap(),{primary:true,size:30});
}
export function drawWorldHud(v) {
  const c=v.c, core=c.combat, a=c.layout.arena, hud=v.layers.hud, world=core.world;
  v.text(hud,'world-region',world.regionAt(core.point(core.player))+' · 探索 '+world.explored+'/'+world.sites.length,a.x+24,a.y+49,18,0xaac0b0);
  const boss=core.enemies.find(e=>e.boss&&e.hp>0),u=c.layout.utility;
  if(!boss)drawMap(v,hud,u.x,u.y+u.size+9,2*u.size+u.gap,124);
  const x=u.x+u.size+u.gap;
  v.button(hud,'world-map','地图',x,u.y+(u.size-40)/2,u.size,40,()=>c.openWorldMap(),
    {size:Math.max(22,11/c.rpxScale),hit:{x,y:u.y,width:u.size,height:u.size}});
  if(!boss)return;
  const p=core.point(boss),cam=core.camera(),sx=p.x-cam.x,sy=p.y-cam.y;
  if(sx>=50&&sx<=a.width-50&&sy>=70&&sy<=a.height-70)return;
  const tx=clamp(sx,50,a.width-50),ty=clamp(sy,75,a.height-65),dx=sx-a.width/2,dy=sy-a.height/2,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,xp=a.x+tx,yp=a.y+ty;
  hud.g.lineStyle(0);hud.g.beginFill(0xf0c794);hud.g.drawPolygon([xp+ux*12,yp+uy*12,xp-ux*8-uy*7,yp-uy*8+ux*7,xp-ux*8+uy*7,yp-uy*8-ux*7]);hud.g.endFill();
  v.text(hud,'boss-direction',Math.round(core.distance(core.player,boss))+'步',xp-ux*35,yp-uy*35,18,0xe8cf9f,{center:true});
}
