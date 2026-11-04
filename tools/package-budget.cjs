'use strict';
const fs = require('node:fs'), path = require('node:path');
const LIMIT = 4 * 1024 * 1024, RESERVE = 64 * 1024;
function budget(root = path.join(__dirname, '../minigame')) {
  const files = fs.readdirSync(root, { recursive: true }).filter(f => fs.statSync(path.join(root, f)).isFile()).map(file => ({ file, bytes: fs.statSync(path.join(root, file)).size }));
  const bytes = files.reduce((n, f) => n + f.bytes, 0);
  return { bytes, limit: LIMIT, remaining: LIMIT - bytes, reserve: RESERVE, fits: bytes <= LIMIT - RESERVE, largest: files.sort((a, b) => b.bytes - a.bytes).slice(0, 8) };
}
if (require.main === module) { const report = budget(); console.log(JSON.stringify(report, null, 2)); if (!report.fits) process.exitCode = 1; }
module.exports = { budget };
