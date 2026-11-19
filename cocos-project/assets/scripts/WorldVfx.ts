const THEMES = [0x99b891, 0xcdb28c, 0xd88656, 0xa5cfda, 0xd8c99d];
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
    const mark=v.image(ground,'landmark-'+i,v.assets.frames.worldStyle[world.stage-1],a.x+region.x-size/2,a.y+region.y-size*.36,size,size*.72,[.36,.35,.32,.34,.36][world.stage-1]);mark.tint=0xd2d2c9;
    if(i%2){mark.node.setScale(-1,1,1);mark.node.setPosition(a.x+region.x+size/2,-(a.y+region.y-size*.36));}else mark.node.setScale(1,1,1);
  }
  const roads = v.layers.roads, offset = a.x + ':' + a.y;
  if (roads.world!==world || roads.offset!==offset) {
    roads.world=world; roads.offset=offset;
    const base=roads.g;base.clear();
    base.lineStyle(0);base.beginFill([0x23332c,0x332f2a,0x202730,0x22353c,0x29323a][world.stage-1],.12);
    base.drawRect(a.x,a.y,world.width,world.height);base.endFill();
    for(const road of world.roads)for(let j=1;j<road.length;j++){
      const from=road[j-1],to=road[j],dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length,sideA=[],sideB=[],count=Math.max(2,Math.ceil(length/60));
      for(let i=0;i<=count;i++){const t=i/count,x=from.x+dx*t,y=from.y+dy*t,w=36+Math.sin(i*1.7+j)*8;sideA.push(a.x+x+nx*w,a.y+y+ny*w);sideB.unshift(a.x+x-nx*w,a.y+y-ny*w);}
      base.lineStyle(0);base.beginFill([0x9aa482,0xb4a18a,0xa27761,0x9cbbc0,0xaaa38d][world.stage-1],world.stage===3?.11:.075);base.drawPolygon([...sideA,...sideB]);base.endFill();
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
    sprite.tint=prop.tigerPillar?0xffffff:0xe1e4dd;(sprite.node as any).worldDepth=a.y+prop.y;
    if(prop.flip) { sprite.node.setScale(-1,1,1);sprite.node.setPosition(a.x+prop.x+prop.size/2,-(a.y+prop.y-prop.size*0.87)); }
    else sprite.node.setScale(1,1,1);
    sprite.node.setSiblingIndex(0);
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
export function drawMap(v, layer, x, y, width, height, expanded=false) {
  const c=v.c, core=c.combat, world=core.world, g=layer.g, scale=Math.min(width/world.width,height/world.height), w=world.width*scale,h=world.height*scale;
  x+=(width-w)/2;y+=(height-h)/2;
  v.rect(layer,x,y,w,h,0x10252c,expanded?0.92:0.68,0x728579,2);
  for(const pool of world.pools){g.lineStyle(0);g.beginFill(pool.kind==='lava'?0x984b32:pool.kind==='void'?0x050d14:0x295c6b,1);g.drawPolygon(pool.points.flatMap(p=>[x+p.x*scale,y+p.y*scale]));g.endFill();}
  for(const road of world.roads){g.lineStyle(expanded?4:1.5,THEMES[world.stage-1],0.38);for(let i=0;i<road.length;i++){const p=road[i];if(!i)g.moveTo(x+p.x*scale,y+p.y*scale);else g.lineTo(x+p.x*scale,y+p.y*scale);}}
  if(expanded)for(const pillar of world.tigerPillars||[]){const px=x+pillar.x*scale,py=y+pillar.y*scale;g.lineStyle(pillar.broken?2:4,pillar.broken?0x776c59:0xd6c4a2);g.moveTo(px-3,py+4);g.lineTo(px+2,py-(pillar.broken?1:7));}
  const cam=core.camera();g.lineStyle(1,0xb7d5d1,0.55);g.drawRect(x+cam.x*scale,y+cam.y*scale,Math.min(cam.width,world.width)*scale,Math.min(cam.height,world.height)*scale);
  const altar = world.phoenixAltar;
  for(const site of world.sites){const px=x+site.x*scale,py=y+site.y*scale;g.lineStyle(0);g.beginFill(site.used?0x657969:site.visited?0xe6c27d:0x89938e,1);g.drawPolygon([px,py-4,px+4,py,px,py+4,px-4,py]);g.endFill();if(expanded&&(!altar||site.visited))v.text(layer,'map-site-'+site.id,site.visited?site.name:'未探明地点',px+12,py-9,18,site.used?0x82968d:0xc9d8c4);}
  const r=world.relic;if(r){const px=x+r.x*scale,py=y+r.y*scale,done=['complete','claimed'].includes(r.status);g.lineStyle(1,done?0x7e9282:0xf0d49b);g.beginFill(done?0x586d60:0xc79546);g.drawPolygon([px,py-7,px+3,py-3,px+7,py,px+3,py+3,px,py+7,px-3,py+3,px-7,py,px-3,py-3]);g.endFill();if(expanded)v.text(layer,'map-relic',r.visited||altar?r.name:'异动遗迹',altar?px-12:px+14,altar?py-27:py+12,21,done?0x82968d:0xe9c98b);}
  if (altar && core.phase < 3 && !world.bossBoon) {
    const px = x + altar.x * scale, py = y + altar.y * scale;
    g.lineStyle(0); g.beginFill(0xe09a6e);
    g.drawPolygon([px, py-6, px+6, py+5, px-6, py+5]); g.endFill();
    if (expanded) v.text(layer, 'map-phoenix-altar', altar.name, px-8, py+17, 21, 0xe6ae84, {center:true});
  }
  const boss=core.enemies.find(e=>e.boss&&e.hp>0);
  if(boss){const p=core.point(boss);g.lineStyle(0);g.beginFill(0xe8a17a);g.drawPolygon([x+p.x*scale,y+p.y*scale-6,x+p.x*scale+6,y+p.y*scale,x+p.x*scale,y+p.y*scale+6,x+p.x*scale-6,y+p.y*scale]);g.endFill();}
  const player=core.point(core.player),px=x+player.x*scale,py=y+player.y*scale;g.lineStyle(1,0x172e30);g.beginFill(0xe4f4cf);g.drawCircle(px,py,expanded?6:4);g.endFill();
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
