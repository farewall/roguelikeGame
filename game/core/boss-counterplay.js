'use strict';
const {angleDelta}=require('./boss-patterns');
function registerPressure(c,e,damage,source) {
  if(!e.boss||!e.bossPattern||e.castTime<=0||!['direct','resonance','split','sword-return','skill'].includes(source))return;
  const root=e.attackType==='roots',shell=e.bossType===4&&e.shielded;
  if(!root&&!shell)return;
  if(shell){const d=c.vector(e,c.player);if(Math.abs(angleDelta(Math.atan2(d.y,d.x),e.coreAngle))>.72)return;}
  const key=e.sequence+':'+(root?e.bossPattern.next:'shell')+':'+e.attackType;
  if(e.pressureKey!==key){e.pressureKey=key;e.pressureDamage=0;e.pressureBroken=false;}
  if(e.pressureBroken)return;e.pressureDamage+=damage;
  const threshold=e.maxHp*(root ? .045 : c.world?.bossBoon ? .045 : .06);
  if (shell) e.shellPressure = Math.min(1, e.pressureDamage / threshold);
  if(e.pressureDamage<threshold)return;
  if(root){
    const roots=c.hazards.filter(h=>h.owner===e.id&&h.rootBranch&&h.pressureCue===e.bossPattern.next&&!h.broken);if(!roots.length)return;
    roots.sort((a,b)=>c.distance(c.player,a.end)-c.distance(c.player,b.end));
    const branch = roots[0], direction = c.vector(branch, branch.end);
    branch.broken=true;
    c.effect('root-sever', { x: branch.x+(branch.end.x-branch.x)*.7, y: branch.y+(branch.end.y-branch.y)*.7 },
      64, { life:.62, angle:Math.atan2(direction.y,direction.x) });
    c.emit('boss-break',{name:'断根开路',copy:'根脉已断 · 穿过缺口'});
  }else{
    const pending = c.hazards.find(h => h.owner === e.id && h.kind === 'tide' && !h.broken && h.age < h.delay);
    const plan = e.bossPattern;
    const later = pending ? null : plan.cues.find((q, i) => i >= plan.next && q.type === 'wave' && !q.cancelled);
    if (pending) pending.broken = true;
    if (later) later.cancelled = true;
    e.shellWaterCollapse = Boolean(pending);
    e.shellBrokenTime = 1.1;
    e.shielded = false;
    c.effect('boss-break', e, 60, {life:.6});
    c.emit('boss-break', { name:'破甲断浪', copy:pending || later ? '甲片崩开 · 一重海浪被打断' : '甲片崩开 · 趁机输出' });
  }
  e.pressureBroken=true;e.staggerVisual=.5;
}
module.exports={registerPressure};
