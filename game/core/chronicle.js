'use strict';
const { ENEMIES, WEAPONS } = require('./combat');
const ARCHIVE_KEY = 'pangu.archive.v1';
const MEMORIES = [
  { id: 1, title: '一 · 人间初生', scene: '初生之野', copy: '泥土在掌心有了形状。女娲俯身，将第一簇火种交到人族手中。山川间响起陌生的欢笑。你似乎曾见过这片天地，也曾希望它长久。' },
  { id: 2, title: '二 · 文明与兵戈', scene: '白骨战场', copy: '火光聚成城邦，道途通向群山。人们争夺灵脉与疆土，修行者将兵戈举向昔日同伴。争斗起初只占一隅，后来再无人能够置身事外。' },
  { id: 3, title: '三 · 圣人之劫', scene: '焚天熔界', copy: '至宝碰撞，星辰坠落，山河在圣人的一念之间断裂。天道开始收拢破碎的法则。它要终止这场崩坏，代价却是将整个旧世界归于混沌。' },
  { id: 4, title: '四 · 神念归一', scene: '归墟寒海', copy: '你终于记起：自己是盘古开天后留下的神念。四象源于盘古四肢，因厌倦天地反复陷入争斗而镇守混沌。天道不是在守护王座，而是在阻止它认定必将重演的灾难。你仍决定，将未来交还万物。' }
];
function emptyArchive() { return { memories: [], enemies: [], runs: [] }; }
function readArchive(api) {
  try {
    const value = api.getStorageSync ? api.getStorageSync(ARCHIVE_KEY) : null;
    if (!value || typeof value !== 'object') return emptyArchive();
    return {
      memories: Array.isArray(value.memories) ? Array.from(new Set(value.memories.filter(id => Number.isInteger(id) && id >= 1 && id <= 4))) : [],
      enemies: Array.isArray(value.enemies) ? Array.from(new Set(value.enemies.filter(id => ENEMIES.some(e => e.id === id)))) : [],
      runs: Array.isArray(value.runs) ? value.runs.filter(run => run && typeof run === 'object' && typeof run.won === 'boolean' && Object.keys(WEAPONS).includes(run.weaponId) && Number.isFinite(run.seconds) && run.seconds >= 0 && Number.isFinite(run.kills) && run.kills >= 0 && Number.isInteger(run.stage) && run.stage >= 1 && run.stage <= 5 && typeof run.build === 'string').slice(0, 8).map(run => ({ won: run.won, weaponId: run.weaponId, seconds: Math.floor(run.seconds), kills: Math.floor(run.kills), stage: run.stage, build: run.build.slice(0, 100), detail: typeof run.detail === 'string' ? run.detail.slice(0, 180) : '' })) : []
    };
  } catch (_) { return emptyArchive(); }
}
function saveArchive(api, archive) { try { if (api.setStorageSync) api.setStorageSync(ARCHIVE_KEY, archive); } catch (_) {} }
function duration(seconds) { const n = Math.max(0, Math.floor(seconds)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }
function runView(run) { return { ...run, timeLabel: duration(run.seconds), weaponName: WEAPONS[run.weaponId].name, result: run.won ? '天地初开' : '止步第 ' + run.stage + ' 境' }; }
function retryHint(cause) {
  if (!cause) return '';
  if (/追猎|断岳|追扑/.test(cause)) return '白虎伏身时准备横移。落地回望后，留意第二次起跳。';
  if (/横爪|下劈|横剪/.test(cause)) return '白虎压肩时退出爪尖，抬爪时绕向它的侧面。';
  const hints = {
    '吞灵吐息': '看到喉囊鼓起就横向走位，也可以让树石挡住吐息。',
    '生息藤蔓': '青龙盘身时寻找藤蔓间隙，沿缺口绕开龙首。',
    '盘龙扫尾': '等青龙转身并甩完尾巴，再上前反打。',
    '陨火撞击': '朱雀抬翼后保持移动，陨火会逐次瞄准。',
    '余烬焚地': '绕开仍有火焰的余烬，等地面熄灭再折返。',
    '天火焚地': '朱雀扇翼时找火浪缺口，沿缺口穿过。',
    '归墟潮汐': '玄武缩甲时往亮甲一侧绕，从波浪的缺口穿过。',
    '敕令裁决': '天道双掌聚光时横移，等法环松解再进攻。',
    '裂界扑杀': '裂界奔兽伏身后会沿直线扑出，向侧面让开。',
    '镇劫震击': '看到重兽抬爪就拉开距离，等震波过去再靠近。'
  };
  return hints[cause] || '用摇杆保持距离，主动技可以留到被围住时解围。';
}
module.exports = { ARCHIVE_KEY, MEMORIES, readArchive, saveArchive, duration, runView, retryHint };
