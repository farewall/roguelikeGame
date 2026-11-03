'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

async function main() {
  const appid = process.env.WECHAT_APPID;
  const privateKey = (process.env.WECHAT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!/^wx[a-f0-9]{16}$/i.test(appid || '')) throw new Error('WECHAT_APPID is missing or invalid. Set it in repository Actions Variables.');
  if (!privateKey) throw new Error('WECHAT_PRIVATE_KEY is missing. Set it in repository Actions Secrets.');
  crypto.createPrivateKey(privateKey); // Validate locally before sending anything.
  const version = process.env.WECHAT_VERSION || '0.1.0';
  if (!/^[\w.-]{1,32}$/.test(version)) throw new Error('Invalid upload version (1–32 letters, digits, dots, underscores or hyphens).');
  const root = path.resolve(__dirname, '../..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-playtest-'));
  const output = path.join(root, 'wechat-preview');
  try {
    fs.cpSync(path.join(root, 'miniprogram'), path.join(tmp, 'miniprogram'), { recursive: true });
    const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
    config.appid = appid;
    fs.writeFileSync(path.join(tmp, 'project.config.json'), JSON.stringify(config));
    const ci = require('miniprogram-ci');
    const project = new ci.Project({ appid, type: 'miniProgram', projectPath: tmp, privateKey, ignores: ['node_modules/**/*'] });
    const common = { project, robot: 1, desc: '开天一念试玩 · ' + (process.env.GITHUB_SHA || 'local').slice(0, 8), setting: { es6: true, minify: true }, onProgressUpdate: () => {} };
    await ci.upload({ ...common, version });
    console.log('Development version uploaded: ' + version);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 微信开发版本上传成功\n\n版本：${version}。请在微信公众平台「版本管理」中查看，可设置为体验版。\n`);
    fs.mkdirSync(output, { recursive: true });
    await ci.preview({ ...common, qrcodeFormat: 'image', qrcodeOutputDest: path.join(output, 'qrcode.png'), pagePath: 'pages/index/index' });
    console.log('Preview QR code generated. Download the wechat-preview artifact and scan in WeChat.');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n预览二维码已生成，请下载本次运行的 wechat-preview artifact。可访问账号与有效期受微信平台限制。\n');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(error => {
  // Never dump SDK objects, request headers or the private key to CI logs.
  const key = process.env.WECHAT_PRIVATE_KEY || '';
  let message = String(error.message || 'Unknown CI error');
  if (key) message = message.split(key).join('[REDACTED]');
  message = message.replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/g, '[REDACTED KEY]');
  console.error('WeChat upload/preview failed: ' + message);
  process.exitCode = 1;
});
