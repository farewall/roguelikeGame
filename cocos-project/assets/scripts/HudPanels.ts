const GOLD=0xe3c88b,LIGHT=0xe4e2ce,MUTE=0x9fb8ac;
export function drawBuildPanel(v) {
  const c=v.c,d=c.data,width=Math.min(c.layout.w-100,920),{layer,x,y}=v.modal(width,560);
  v.text(layer,'build-title',d.weaponName+(d.pathName?' · '+d.pathName:''),x+35,y+32,34,GOLD);
  v.text(layer,'build-stats',d.combatStats,x+35,y+92,25,LIGHT);
  v.text(layer,'build-elements',d.elementName,x+35,y+144,24,LIGHT);
  v.text(layer,'build-blades',d.bannerUpgradeLabel||d.swordLabel||d.bellUpgradeLabel||'尚未领悟专属强化',x+35,y+198,25,GOLD,{wrap:width-70});
  v.text(layer,'build-combo',d.comboName?'元素共鸣 · '+d.comboName:'元素附魔与至宝专属提升可共同成长',x+35,y+269,23,MUTE,{wrap:width-70});
  const relic=c.combat.world?.relic;
  v.text(layer,'build-relic',c.combat.world?.bossBoon?'遗迹庇护 · '+relic.boon:'探索遗迹，可争取本境庇护与一次专属提升',x+35,y+337,23,MUTE,{wrap:width-70});
  v.text(layer,'build-save-note','升级、换境与切后台时保存本局进度',x+35,y+420,21,MUTE);
  v.button(layer,'build-close','返回战斗',x+35,y+480,width-70,54,()=>c.closeBuild(),{primary:true,size:25});
}
export function drawRelicPanel(v) {
  const c=v.c,r=c.data.worldRelic;if(!r)return;
  const width=Math.min(c.layout.w-100,1150),{layer,x,y}=v.modal(width,580);
  v.text(layer,'relic-title',r.name,x+34,y+27,35,GOLD);
  v.text(layer,'relic-copy',r.copy,x+34,y+86,24,LIGHT,{wrap:width-68});
  const cw=(width-86)/2;
  r.options.forEach((o,i)=>{
    const rx=x+34+i*(cw+18),ry=y+187;
    v.rect(layer,rx,ry,cw,260,0x20383a,1,o.disabled?0x4f6057:0x8a956e);
    v.text(layer,'relic-option-name-'+i,o.name,rx+20,ry+18,29,GOLD);
    v.text(layer,'relic-option-desc-'+i,o.desc,rx+20,ry+79,24,LIGHT,{wrap:cw-40});
    v.text(layer,'relic-option-change-'+i,o.change,rx+20,ry+168,22,MUTE,{wrap:cw-40});
    v.regions.push({id:'relic-'+o.id,x:rx,y:ry,width:cw,height:260,enabled:!o.disabled,action:()=>c.chooseRelic(o.id)});
  });
  v.text(layer,'relic-note','挑战会继续本关战斗 · 解印与奖励每境只能取得一次',x+34,y+465,20,MUTE);
  v.button(layer,'relic-close','继续探索',x+34,y+509,width-68,46,()=>c.closeRelic(),{size:24});
}
