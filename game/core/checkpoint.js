'use strict';
const {Combat,WEAPONS,PATHS}=require('./combat');
const KEY='pangu.checkpoint.v1',VERSION=1;
const scalars=['stage','phase','phaseTime','stageTime','time','hp','maxHp','power','haste','level','xp','xpNeed','kills','damageTaken','nextId','attackCd','energy','skillCooldown','skillUses','strikeCount','remaining','waveSpawns','spawnCd'];
const records=['elements','bellUpgrades','bannerUpgrades','swordUpgrades','damageBySource','damageByCause'];
const enemyKeys=['id','x','y','kind','boss','bossType','name','hp','maxHp','damageScale','pressure','speed','cooldown','burnTime','burnDps','slowTime','freezeTime','sequence','phase2','trial','relicTrial','fodder','spawnDuration','spawnTime'];
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e12;
function makeCheckpoint(c) {
  if(!c||c.ended||c.hp<=0)return null;
  const data={...pick(c,scalars),...pick(c,records),weapon:c.weapon,exploration:c.exploration,path:c.path,cleared:c.cleared,bossPending:c.bossPending,
    player:{...c.player},eventsTaken:c.eventsTaken.slice(-20),encounter:c.encounter,trialPending:c.trialPending,
    enemies:c.enemies.filter(e=>e.hp>0).map(e=>pick(e,enemyKeys))};
  if(c.world)data.world={roll:c.world.relicRoll,bossBoon:c.world.bossBoon,sites:c.world.sites.map(s=>({visited:s.visited,used:s.used})),relic:pick(c.world.relic,['status','visited','enemyIds'])};
  return JSON.parse(JSON.stringify({version:VERSION,data}));
}
function valid(value) {
  try {
    if(!value||value.version!==VERSION||JSON.stringify(value).length>65536)return false;
    const d=value.data;if(!d||!WEAPONS[d.weapon]||typeof d.exploration!=='boolean'||typeof d.path!=='string'||!Number.isInteger(d.stage)||d.stage<1||d.stage>5||!Number.isInteger(d.phase)||d.phase<0||d.phase>3)return false;
    if(scalars.some(k=>!finite(d[k]))||d.hp<=0||d.hp>d.maxHp||d.power<=0||d.haste<=0||d.level<1||d.xp<0||d.xpNeed<=0||d.remaining<0)return false;
    if(!d.player||![d.player.x,d.player.y].every(n=>finite(n)&&n>=0&&n<=100))return false;
    if(d.path&&(!PATHS[d.path]||PATHS[d.path].weapon!==d.weapon))return false;
    for(const key of records)if(!d[key]||typeof d[key]!=='object'||Array.isArray(d[key])||Object.entries(d[key]).some(([k,v])=>k.length>40||!finite(v)||v<0))return false;
    for(const [key,keys,max] of [['elements',['fire','water','earth'],4],['bellUpgrades',['range','echo','resonance'],3],['bannerUpgrades',['blades','split'],3],['swordUpgrades',['reach','edge','return'],3]])if(keys.some(k=>!Number.isInteger(d[key][k])||d[key][k]<0||d[key][k]>max))return false;
    if(!Array.isArray(d.enemies)||d.enemies.length>32)return false;
    const ids=new Set();for(const e of d.enemies){if(!Number.isInteger(e.id)||e.id<=0||ids.has(e.id)||!['wraith','ranged','charger','elite','boss'].includes(e.kind)||![e.hp,e.maxHp,e.speed,e.x,e.y].every(finite)||e.hp<=0||e.hp>e.maxHp||e.x<0||e.x>100||e.y<0||e.y>100||e.bossType<0||e.bossType>5||Boolean(e.boss)!==(e.kind==='boss'))return false;ids.add(e.id);}
    if(d.nextId<Math.max(0,...ids)||!Array.isArray(d.eventsTaken)||d.eventsTaken.length>20||d.eventsTaken.some(s=>typeof s!=='string'||s.length>120))return false;
    if(d.encounter&&(typeof d.encounter.title!=='string'||!Array.isArray(d.encounter.choices)||d.encounter.choices.length>3||d.encounter.choices.some(o=>!o||typeof o.id!=='string'||typeof o.name!=='string')))return false;
    if(d.exploration){const w=d.world;if(!w||!finite(w.roll)||w.roll<0||w.roll>=1||!Array.isArray(w.sites)||w.sites.length!==3||w.sites.some(s=>!s||typeof s.visited!=='boolean'||typeof s.used!=='boolean')||!w.relic||!['ready','active','claimed','complete'].includes(w.relic.status)||!Array.isArray(w.relic.enemyIds)||w.relic.enemyIds.some(id=>!ids.has(id))||w.relic.status==='active'&&!w.relic.enemyIds.length)return false;}
    return true;
  }catch(_){return false;}
}
function readCheckpoint(api) { try{const saved=api.getStorageSync&&api.getStorageSync(KEY);return valid(saved)?saved:null;}catch(_){return null;} }
function saveCheckpoint(api,c) {try{const saved=makeCheckpoint(c);if(!saved||!valid(saved)||!api.setStorageSync)return false;api.setStorageSync(KEY,saved);return true;}catch(_){return false;} }
function clearCheckpoint(api) {try{if(api.setStorageSync)api.setStorageSync(KEY,null);}catch(_){} }
function restoreCheckpoint(saved,random=Math.random) {
  if(!valid(saved))return null;const d=saved.data,c=new Combat(d.weapon,random,{exploration:d.exploration});
  c.stage=d.stage;c.startStage();Object.assign(c,pick(d,scalars));for(const key of records)c[key]={...d[key]};
  c.path=d.path;c.cleared=Boolean(d.cleared);c.bossPending=Boolean(d.bossPending);c.player={...d.player};c.eventsTaken=d.eventsTaken.slice();c.encounter=d.encounter;c.trialPending=Boolean(d.trialPending);
  // A checkpoint preserves progress and HP, then resumes from a readable neutral
  // stance. No old projectile, binding, queued hit or hidden windup can land.
  c.enemies=d.enemies.map(e=>({...e,castTime:0,recoverTime:.6,cooldown:Math.max(.8,e.cooldown||0),hitTime:0,dashing:false,shielded:false,chargeHit:false,bossPattern:null,visualState:'recover',visualAge:0}));
  c.hazards=[];c.effects=[];c.remnants=[];c.projectiles=[];c.bellWaves=[];c.followups=[];c.pendingAttack=null;c.events=[];c.enrage=null;c.rootTime=0;c.rootSourceId=null;c.invulnerable=1.2;c.attackLock=0;c.resetSwords();
  if(c.world){
    c.world.relicRoll=d.world.roll;
    const {makeRelic}=require('./world-events');c.world.relic=makeRelic(c.world,d.world.roll);Object.assign(c.world.relic,d.world.relic);
    c.world.bossBoon=Boolean(d.world.bossBoon);c.world.sites.forEach((s,i)=>Object.assign(s,{visited:Boolean(d.world.sites[i].visited),used:Boolean(d.world.sites[i].used)}));c.world.explored=c.world.sites.filter(s=>s.visited).length;
    if(c.enemies.some(e=>e.boss))c.world.prepareNavigation(Infinity);
  }
  return c;
}
module.exports={CHECKPOINT_KEY:KEY,makeCheckpoint,validCheckpoint:valid,readCheckpoint,saveCheckpoint,clearCheckpoint,restoreCheckpoint};
