'use strict';
const {isFree}=require('./world-geometry');
const RELICS = [
  {name:'青玉封根台',copy:'根脉缠住了遗台。守印灵散去后，可借木纹断开部分龙根。',boon:'青龙每组根脉减少一条'},
  {name:'白骨战魂碑',copy:'残兵仍在守卫战魂。取回其印记，能让扑杀的蓄势更易辨认。',boon:'白虎每次扑杀多蓄势0.18秒'},
  {name:'熔心息火炉',copy:'遗炉中仍有未熄的灵火。借炉火净化余烬，换取更宽的回转余地。',boon:'朱雀余火缩短0.65秒，火浪缺口加宽'},
  {name:'归墟镇海碑',copy:'古碑能抚平重浪。夺回海印后，浪面缺口将更宽。',boon:'玄武海浪缺口扩大，破甲所需伤害降低'},
  {name:'天纹遗诏',copy:'残卷记着旧日敕令的停顿。看清法则，便能争取更长的闪避时机。',boon:'天道敕令多蓄势0.25秒'}
];
function makeRelic(world,roll=.5) {
  const anchors=[world.roads[0][1],world.sites[1]],anchor=anchors[Math.floor(roll*10)%2];
  let point=anchor;
  for(let i=0;i<12;i++){const a=i*Math.PI/6,p={x:anchor.x+Math.cos(a)*205,y:anchor.y+Math.sin(a)*205};if(isFree(world,p,35)&&world.nav.components[world.nav.index(p)]===world.nav.mainComponent&&world.sites.every(s=>Math.hypot(s.x-p.x,s.y-p.y)>170)){point=p;break;}}
  return {...RELICS[world.stage-1],id:'relic-'+world.stage,x:point.x,y:point.y,variant:roll<.5?'offering':'trial',status:'ready',visited:false,enemyIds:[]};
}
function relicView(c) {
  const r=c.world&&c.world.relic;if(!r)return null;
  const nearby=c.distance(c.player,c.percent(r))<135;
  return {id:r.id,name:r.name,copy:r.copy,boon:r.boon,variant:r.variant,status:r.status,visited:r.visited,nearby:nearby&&c.phase<3,options:[
    r.variant==='trial'?{id:'challenge',name:'迎战守印灵',desc:'击败一名守印精英，获得专属提升与本境庇护',change:r.boon}:{id:'offering',name:'以血解印',desc:'献出12元气，换取专属提升与本境庇护',change:r.boon,disabled:c.hp<=12},
    {id:'essence',name:'收取散逸灵蕴',desc:'获得4灵气，遗迹随后归于沉寂',change:'安全取走补给，放弃本境庇护'}
  ]};
}
function rewardRelic(c) {
  const r=c.world.relic;if(r.status==='complete')return false;
  const keys=c.weapon==='swords'?['sword-reach','sword-edge','sword-return']:c.weapon==='bell'?['range','echo','resonance']:['blades','split'];
  const options=c.upgradePool().filter(u=>keys.includes(u.kind));
  const option=options[Math.floor(c.world.relicRoll*options.length)];
  if(option)c.upgrade(option.kind);else c.power*=1.08;
  r.status='complete';r.enemyIds=[];c.world.bossBoon=true;
  c.eventsTaken.push(r.name);c.effect('world-loot',c.percent(r),42,{life:.65});
  c.emit('relic-complete',{name:r.name,reward:(option?option.name:'至宝伤害+8%')+' · '+r.boon});return true;
}
function chooseRelic(c,id) {
  const view=relicView(c),r=c.world&&c.world.relic;
  if(!view||!view.nearby||r.status!=='ready'||c.cleared||c.ended)return false;
  if(id==='essence'){r.status='claimed';c.xp+=4;c.emit('world-loot',{name:r.name,reward:'获得4灵气'});return true;}
  if(id==='offering'&&r.variant==='offering'&&c.hp>12){c.hp-=12;return rewardRelic(c);}
  if(id==='challenge'&&r.variant==='trial'){
    const e=c.spawn('elite',true);if(!e)return false;
    e.relicTrial=true;e.hp*=1.15;e.maxHp=e.hp;e.cooldown=2;
    r.status='active';r.enemyIds=[e.id];c.emit('relic-trial',{name:r.name});return true;
  }
  return false;
}
function relicDeaths(c,dead) {
  const r=c.world&&c.world.relic;if(!r||r.status!=='active')return;
  r.enemyIds=r.enemyIds.filter(id=>!dead.some(e=>e.id===id));if(!r.enemyIds.length)rewardRelic(c);
}
module.exports={RELICS,makeRelic,relicView,chooseRelic,relicDeaths};
