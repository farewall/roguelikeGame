'use strict';
const fs = require('node:fs'), path = require('node:path'), esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'minigame');
async function build() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({ entryPoints: [path.join(root, 'game/main.js')], outfile: path.join(out, 'game.js'), bundle: true, alias: { 'pixi.js': require.resolve('pixi.js/dist/pixi.js') }, minify: true, platform: 'browser', format: 'cjs', target: ['es2017'], define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'linked', sourcemap: false });
  fs.cpSync(path.join(root, 'game/assets'), path.join(out, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(root, 'game/game.json'), path.join(out, 'game.json'));
  const manifest = { framework: 'Eva.js 1.2.8 / PixiJS 4.8.9', source: 'game/', build: 'minigame/', assets: [] };
  for (const file of fs.readdirSync(path.join(out, 'assets'), { recursive: true })) {
    const full = path.join(out, 'assets', file); if (fs.statSync(full).isFile()) manifest.assets.push('assets/' + file.replaceAll('\\', '/'));
  }
  fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(manifest, null, 2));
  const files = fs.readdirSync(out, { recursive: true }).filter(f => fs.statSync(path.join(out, f)).isFile());
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
  if (bytes > 4 * 1024 * 1024) throw new Error('小游戏构建超过 4 MiB 工程预算：' + bytes);
  console.log('小游戏构建完成：' + files.length + ' 文件，' + (bytes / 1048576).toFixed(3) + ' MiB');
  return { bytes, files };
}
if (require.main === module) build().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { build };
