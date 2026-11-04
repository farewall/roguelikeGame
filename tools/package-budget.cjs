'use strict';
const fs = require('node:fs'), path = require('node:path');
const LIMIT = 4 * 1024 * 1024, RESERVE = 64 * 1024, TOTAL_LIMIT = 20 * 1024 * 1024;
function budget(root = path.join(__dirname, '../minigame')) {
  const files = fs.readdirSync(root, { recursive: true }).filter(f => fs.statSync(path.join(root, f)).isFile()).map(file => ({ file, bytes: fs.statSync(path.join(root, file)).size }));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'game.json'), 'utf8'));
  const packages = (config.subpackages || config.subPackages || []).map(p => ({ name: p.name, root: p.root.replaceAll('\\', '/').replace(/\/$/, ''), bytes: 0 }));
  let mainBytes = 0;
  for (const file of files) {
    const relative = file.file.replaceAll('\\', '/'), bundle = packages.find(p => relative.startsWith(p.root + '/'));
    if (bundle) bundle.bytes += file.bytes; else mainBytes += file.bytes;
  }
  const bytes = files.reduce((n, f) => n + f.bytes, 0);
  return { bytes, mainBytes, mainLimit: LIMIT, totalLimit: TOTAL_LIMIT, remaining: LIMIT - mainBytes, reserve: RESERVE, subpackages: packages,
    fits: mainBytes <= LIMIT - RESERVE && bytes <= TOTAL_LIMIT && packages.every(p => p.bytes <= LIMIT - RESERVE), largest: files.sort((a, b) => b.bytes - a.bytes).slice(0, 8) };
}
function check(root) { const report = budget(root); console.log(JSON.stringify(report, null, 2)); if (!report.fits) throw new Error('Creator Mini Game exceeds the main/content package engineering budget'); return report; }
if (require.main === module) { try { check(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { budget, check };
