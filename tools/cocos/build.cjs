'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { prepare } = require('./prepare.cjs');
const root = path.resolve(__dirname, '../..'), project = path.join(root, 'cocos-project');
async function build(platform = 'wechatgame') {
  if (!['wechatgame', 'web-mobile'].includes(platform)) throw new Error('Unsupported Creator platform: ' + platform);
  const executable = process.env.COCOS_CREATOR;
  if (!executable || !fs.existsSync(executable)) throw new Error('Set COCOS_CREATOR to the installed Cocos Creator 3.8.8 executable. There is no legacy renderer fallback.');
  await prepare(); const output = path.join(project, 'build', platform); fs.rmSync(output, { recursive: true, force: true });
  const logs = path.join(project, 'logs'); fs.mkdirSync(logs, { recursive: true });
  const log = path.join(logs, platform + '.log'), config = path.join(project, 'build-config', platform + '.json');
  console.log('Building with Cocos Creator CLI: ' + platform);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, ['--project', project, '--build', 'configPath=' + config + ';logDest=' + log], { stdio: 'inherit', windowsHide: false });
    const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Creator export timed out after 10 minutes; inspect the saved build log.')); }, 10 * 60 * 1000);
    child.on('error', error => { clearTimeout(timeout); reject(error); }); child.on('exit', code => { clearTimeout(timeout); resolve(code); });
  });
  if (code !== 0 && code !== 36) { if (fs.existsSync(log)) console.error(fs.readFileSync(log, 'utf8').slice(-18000)); throw new Error('Creator build failed with exit code ' + code); }
  for (const file of platform === 'wechatgame' ? ['game.js', 'game.json'] : ['index.html', 'application.js']) if (!fs.existsSync(path.join(output, file))) throw new Error('Missing official Creator build output: ' + file);
  const info = { framework: 'Cocos Creator 3.8.8', source: 'cocos-project/', platform, builder: 'official Creator CLI', commit: process.env.GITHUB_SHA || 'local', assets: [] };
  for (const file of fs.readdirSync(output, { recursive: true })) if (fs.statSync(path.join(output, file)).isFile()) info.assets.push(file.replaceAll('\\', '/'));
  fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify(info, null, 2));
  if (platform === 'wechatgame') {
    const dest = path.join(root, 'minigame'); fs.rmSync(dest, { recursive: true, force: true }); fs.cpSync(output, dest, { recursive: true });
    require('../package-budget.cjs').check?.();
  }
  console.log('Official Creator output verified: ' + platform);
}
if (require.main === module) build(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { build };
