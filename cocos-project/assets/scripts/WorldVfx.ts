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
  // Flatten fine floor detail while keeping the real terrain and bodies crisp.
  g.lineStyle(0);g.beginFill([0x324538,0x4b453b,0x353435,0x30454d,0x3c4144][world.stage-1],.23);
  g.drawRect(a.x+cam.x,a.y+cam.y,cam.width,cam.height);g.endFill();
  for(const road of world.roads)for(let j=1;j<road.length;j++){
    const from=road[j-1],to=road[j],dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length,sideA=[],sideB=[],count=Math.max(2,Math.ceil(length/60));
    if(Math.max(from.x,to.x)<cam.x-70||Math.min(from.x,to.x)>cam.x+cam.width+70||Math.max(from.y,to.y)<cam.y-70||Math.min(from.y,to.y)>cam.y+cam.height+70)continue;
    for(let i=0;i<=count;i++){const t=i/count,x=from.x+dx*t,y=from.y+dy*t,w=36+Math.sin(i*1.7+j)*8;sideA.push(a.x+x+nx*w,a.y+y+ny*w);sideB.unshift(a.x+x-nx*w,a.y+y-ny*w);}
    g.lineStyle(0);g.beginFill([0xa1936f,0xd2b38a,0x8e8780,0xb6bfc0,0xc5b58b][world.stage-1],0.18);g.drawPolygon([...sideA,...sideB]);g.endFill();
  }
  // Water, molten rock and void are physical terrain. Their visible shore is the collision contour.
  for(const pool of world.pools) {
    if(!visible(pool.x,pool.y,Math.max(pool.rx,pool.ry)+100)) continue;
    const index=pool.kind==='lava'?1:pool.kind==='void'?2:world.stage===1?3:0;
    v.image(terrain,'pool-'+pool.id,v.assets.frames.worldPools[index],a.x+pool.x-pool.rx*1.2,a.y+pool.y-pool.ry*1.2,pool.rx*2.4,pool.ry*2.4);
  }
  for(const prop of world.props) {
    if(!visible(prop.x,prop.y,prop.size)) continue;
    const sprite=v.image(actors,'terrain-'+prop.id,v.assets.frames.worldProps[prop.sprite],a.x+prop.x-prop.size/2,a.y+prop.y-prop.size*0.87,prop.size,prop.size);
    sprite.tint=0xd2d5c7;(sprite.node as any).worldDepth=a.y+prop.y;
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
  // The world border is distant geography; it never follows the camera.
  g.lineStyle(24,0x172529,0.9);g.moveTo(a.x,a.y);g.lineTo(a.x+world.width,a.y);g.lineTo(a.x+world.width,a.y+world.height);g.lineTo(a.x,a.y+world.height);g.lineTo(a.x,a.y);
}
export function drawMap(v, layer, x, y, width, height, expanded=false) {
  const c=v.c, core=c.combat, world=core.world, g=layer.g, scale=Math.min(width/world.width,height/world.height), w=world.width*scale,h=world.height*scale;
  x+=(width-w)/2;y+=(height-h)/2;
  v.rect(layer,x,y,w,h,0x10252c,expanded?0.92:0.68,0x728579,2);
  for(const pool of world.pools){g.lineStyle(0);g.beginFill(pool.kind==='lava'?0x984b32:pool.kind==='void'?0x050d14:0x295c6b,1);g.drawPolygon(pool.points.flatMap(p=>[x+p.x*scale,y+p.y*scale]));g.endFill();}
  for(const road of world.roads){g.lineStyle(expanded?4:1.5,THEMES[world.stage-1],0.38);for(let i=0;i<road.length;i++){const p=road[i];if(!i)g.moveTo(x+p.x*scale,y+p.y*scale);else g.lineTo(x+p.x*scale,y+p.y*scale);}}
  const cam=core.camera();g.lineStyle(1,0xb7d5d1,0.55);g.drawRect(x+cam.x*scale,y+cam.y*scale,Math.min(cam.width,world.width)*scale,Math.min(cam.height,world.height)*scale);
  for(const site of world.sites){const px=x+site.x*scale,py=y+site.y*scale;g.lineStyle(0);g.beginFill(site.used?0x657969:site.visited?0xe6c27d:0x89938e,1);g.drawPolygon([px,py-4,px+4,py,px,py+4,px-4,py]);g.endFill();if(expanded)v.text(layer,'map-site-'+site.id,site.visited?site.name:'未探明地点',px+12,py-9,18,site.used?0x82968d:0xc9d8c4);}
  const r=world.relic;if(r){const px=x+r.x*scale,py=y+r.y*scale,done=['complete','claimed'].includes(r.status);g.lineStyle(1,done?0x7e9282:0xf0d49b);g.beginFill(done?0x586d60:0xc79546);g.drawPolygon([px,py-7,px+3,py-3,px+7,py,px+3,py+3,px,py+7,px-3,py+3,px-7,py,px-3,py-3]);g.endFill();if(expanded)v.text(layer,'map-relic',r.visited?r.name:'异动遗迹',px+14,py+12,21,done?0x82968d:0xe9c98b);}
  const boss=core.enemies.find(e=>e.boss&&e.hp>0);
  if(boss){const p=core.point(boss);g.lineStyle(0);g.beginFill(0xe8a17a);g.drawPolygon([x+p.x*scale,y+p.y*scale-6,x+p.x*scale+6,y+p.y*scale,x+p.x*scale,y+p.y*scale+6,x+p.x*scale-6,y+p.y*scale]);g.endFill();}
  const player=core.point(core.player),px=x+player.x*scale,py=y+player.y*scale;g.lineStyle(1,0x172e30);g.beginFill(0xe4f4cf);g.drawCircle(px,py,expanded?6:4);g.endFill();
}
export function drawWorldHud(v) {
  const c=v.c, core=c.combat, a=c.layout.arena, hud=v.layers.hud, world=core.world;
  v.text(hud,'world-region',world.regionAt(core.point(core.player))+' · 探索 '+world.explored+'/'+world.sites.length,a.x+24,a.y+49,18,0xaac0b0);
  const boss=core.enemies.find(e=>e.boss&&e.hp>0),x=a.x+a.width-214,y=a.y+20;if(!boss)drawMap(v,hud,x,y+30,196,124);
  v.button(hud,'world-map','地图',x+112,y,84,30,()=>c.openWorldMap(),{size:19});
  if(!boss)return;
  const p=core.point(boss),cam=core.camera(),sx=p.x-cam.x,sy=p.y-cam.y;
  if(sx>=50&&sx<=a.width-50&&sy>=70&&sy<=a.height-70)return;
  const tx=clamp(sx,50,a.width-50),ty=clamp(sy,75,a.height-65),dx=sx-a.width/2,dy=sy-a.height/2,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,xp=a.x+tx,yp=a.y+ty;
  hud.g.lineStyle(0);hud.g.beginFill(0xf0c794);hud.g.drawPolygon([xp+ux*12,yp+uy*12,xp-ux*8-uy*7,yp-uy*8+ux*7,xp-ux*8+uy*7,yp-uy*8-ux*7]);hud.g.endFill();
  v.text(hud,'boss-direction',Math.round(core.distance(core.player,boss))+'步',xp-ux*35,yp-uy*35,18,0xe8cf9f,{center:true});
}
