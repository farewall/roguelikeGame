'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
function safeError(error, key = '') {
  let message = String(error.message || 'Unknown CI error');
  for (const value of [key, key.replace(/\\n/g, '\n').trim()]) if (value) message = message.split(value).join('[REDACTED]');
  return message.replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/g, '[REDACTED KEY]');
}
async function main(options = {}) {
  const env = options.env || process.env, root = options.root || path.resolve(__dirname, '../..'), log = options.log || console.log;
  const appid = env.WECHAT_APPID, privateKey = (env.WECHAT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!/^wx[a-f0-9]{16}$/i.test(appid || '')) throw new Error('WECHAT_APPID is missing or invalid. Set the Mini Game AppID in repository Actions Variables.');
  if (!privateKey) throw new Error('WECHAT_PRIVATE_KEY is missing. Set the Mini Game upload key in repository Actions Secrets.');
  crypto.createPrivateKey(privateKey);
  const version = env.WECHAT_VERSION || '0.2.0';
  if (!/^[\w.-]{1,32}$/.test(version)) throw new Error('Invalid upload version.');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  if (config.compileType !== 'game' || config.miniprogramRoot !== 'minigame/') throw new Error('Expected a built WeChat Mini Game project (compileType=game, root=minigame/).');
  for (const file of ['game.js', 'game.json', 'build-info.json']) if (!fs.existsSync(path.join(root, 'minigame', file))) throw new Error('Missing minigame/' + file + '; run npm ci and npm run build first.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-minigame-'));
  const output = path.join(root, 'wechat-preview');
  try {
    fs.cpSync(path.join(root, 'minigame'), path.join(tmp, 'minigame'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'project.config.json'), JSON.stringify({ ...config, appid }));
    const ci = options.sdk || require('miniprogram-ci');
    const project = new ci.Project({ appid, type: 'miniGame', projectPath: tmp, privateKey, ignores: ['node_modules/**/*'] });
    const common = { project, robot: 1, desc: '开天一念小游戏 · ' + (env.GITHUB_SHA || 'local').slice(0, 8), setting: { es6: true, minify: true }, onProgressUpdate: () => {} };
    await ci.upload({ ...common, version });
    log('Mini Game development version uploaded: ' + version);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## 微信小游戏开发版本上传成功\n\n版本：${version}。可在微信公众平台「版本管理」查看并设置体验版。\n`);
    fs.mkdirSync(output, { recursive: true });
    await ci.preview({ ...common, qrcodeFormat: 'image', qrcodeOutputDest: path.join(output, 'qrcode.png') });
    log('Mini Game preview QR generated in wechat-preview/qrcode.png');
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, '\n小游戏预览二维码已生成，请下载本次运行的 wechat-preview artifact。访问账号与有效期受微信平台限制。\n');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
if (require.main === module) main().catch(error => { console.error('WeChat Mini Game upload failed: ' + safeError(error, process.env.WECHAT_PRIVATE_KEY || '')); process.exitCode = 1; });
module.exports = { main, safeError };
