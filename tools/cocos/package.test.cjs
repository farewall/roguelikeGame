'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../minigame');
test('official Creator WeChat output is complete and records its source commit', () => {
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json')));
  assert.equal(proof.framework, 'Cocos Creator 3.8.8'); assert.equal(proof.builder, 'official Creator CLI'); assert.equal(proof.platform, 'wechatgame');
  if (process.env.GITHUB_SHA) assert.equal(proof.commit, process.env.GITHUB_SHA);
  for (const file of proof.assets) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.ok(proof.assets.some(f => /cocos-js\/.+\.js$/.test(f)), 'Cocos engine modules must be present');
  assert.ok(fs.existsSync(path.join(root, 'game.js'))); assert.ok(!fs.existsSync(path.join(root, 'app.json')));
});
test('game content is a real landscape Mini Game subpackage and respects its budget', () => {
  const game = JSON.parse(fs.readFileSync(path.join(root, 'game.json'))); assert.equal(game.deviceOrientation, 'landscape');
  const packages = game.subpackages || game.subPackages || [];
  assert.ok(packages.some(p => /game-content/.test(p.name + p.root)), 'Art and audio must be exported as the game-content subpackage');
  for (const p of packages) assert.ok(fs.existsSync(path.join(root, p.root)), p.root);
  const report = require('../package-budget.cjs').budget(root); assert.ok(report.fits, JSON.stringify(report)); assert.ok(report.subpackages.some(p => p.bytes > 1000000));
});
