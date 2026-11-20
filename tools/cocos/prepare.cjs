'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..'), project = path.join(root, 'cocos-project'), assets = path.join(project, 'assets');
const toolchain = require('./toolchain.json');
const { bundles, generateArtCatalog } = require('./art-catalog.cjs');
function uuid(name) { const h = crypto.createHash('sha256').update('kaitian-cocos:' + name).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32); }
function compressed(value) { const h = value.replace(/-/g, ''), alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let out = h.slice(0, 5); for (let i = 5; i < h.length; i += 3) { const n = parseInt(h.slice(i, i + 3), 16); out += alphabet[n >>> 6] + alphabet[n & 63]; } return out; }
function json(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function configureBundleProfiles() {
  const file = path.join(project, 'settings/v2/packages/builder.json');
  const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { __version__: '1.3.9' };
  const bundleConfig = settings.bundleConfig ||= {};
  const custom = bundleConfig.custom ||= {};
  for (const name of bundles) {
    const metaFile = path.join(assets, name + '.meta');
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const data = meta.userData ||= {};
    const id = data.bundleConfigID ||= 'auto_' + compressed(uuid('bundle-config/' + name));
    const profile = custom[id] ||= { displayName: name, configs: {} };
    const configs = profile.configs ||= {};
    for (const platform of ['native', 'web']) configs[platform] ||= { preferredOptions: { compressionType: 'merge_dep', isRemote: false } };
    // Creator uses its builder profile, rather than the folder's legacy compressionType,
    // to decide which output paths are registered as WeChat subpackages.
    configs.miniGame ||= {};
    configs.miniGame.configMode = 'overwrite';
    (configs.miniGame.overwriteSettings ||= {}).wechatgame = { compressionType: 'subpackage', isRemote: false };
    json(metaFile, meta);
  }
  json(file, settings);
}
function node(name, parent, children, components, camera = false) {
  return { __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {}, _parent: { __id__: parent }, _children: children.map(id => ({ __id__: id })), _active: true, _components: components.map(id => ({ __id__: id })), _prefab: null,
    _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: camera ? 1000 : 0 }, _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 }, _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 }, _mobility: 0, _layer: 33554432, _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _id: uuid(name) };
}
async function prepare() {
  generateArtCatalog();
  const generated = path.join(assets, 'scripts/generated/game-core.ts');
  for (const old of ['game-core.js', 'game-core.js.meta']) fs.rmSync(path.join(assets, 'scripts/generated', old), { force: true });
  await esbuild.build({ entryPoints: [path.join(root, 'game/runtime-core.mjs')], outfile: generated, bundle: true, format: 'esm', platform: 'neutral', banner: { js: '// @ts-nocheck' }, target: ['es2017'], legalComments: 'none' });
  const component = (type, nodeId, data = {}) => ({ __type__: type, _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId }, _enabled: true, __prefab: null, ...data });
  const scene = [
    { __type__: 'cc.SceneAsset', _name: 'Main', _objFlags: 0, __editorExtras__: {}, _native: '', scene: { __id__: 1 } },
    { __type__: 'cc.Scene', _name: 'Main', _objFlags: 0, __editorExtras__: {}, _parent: null, _children: [{ __id__: 2 }, { __id__: 3 }], _active: true, _components: [], _prefab: null, _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 }, _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 }, _layer: 1073741824, _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, autoReleaseAssets: false, _id: toolchain.sceneUuid },
    node('Canvas', 1, [], [4, 5, 6]), node('UICamera', 1, [], [7], true),
    component('cc.UITransform', 2, { _contentSize: { __type__: 'cc.Size', width: 1600, height: 750 }, _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 } }),
    component('cc.Canvas', 2, { _cameraComponent: { __id__: 7 }, _alignCanvasWithScreen: true }),
    component(compressed(toolchain.mainScriptUuid), 2),
    component('cc.Camera', 3, { _projection: 0, _priority: 0, _fov: 45, _fovAxis: 0, _orthoHeight: 375, _near: 0, _far: 2000, _color: { __type__: 'cc.Color', r: 16, g: 32, b: 42, a: 255 }, _depth: 1, _stencil: 0, _clearFlags: 7, _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 }, _visibility: 33554432, _targetTexture: null, _usePostProcess: false })
  ];
  if (!fs.existsSync(path.join(assets, 'Main.scene'))) json(path.join(assets, 'Main.scene'), scene);
  const included = ['base', 'gfx-webgl', 'gfx-webgl2', '2d', 'graphics', 'ui', 'mask', 'audio', 'animation', 'tween', 'legacy-pipeline'];
  for (const platform of ['web-mobile', 'wechatgame']) {
    const bundleConfigs = bundles.map(name => ({root:'db://assets/'+name,name,output:true,priority:1,isRemote:false,compressionType:platform==='wechatgame'?'subpackage':'merge_dep'}));
    json(path.join(project, 'build-config', platform + '.json'), { name: 'kaitian-yinian', platform, outputName: platform, buildPath: 'project://build', startScene: toolchain.sceneUuid, scenes: [{ url: 'db://assets/Main.scene', uuid: toolchain.sceneUuid }], debug: false, md5Cache: false, engineModulesConfigKey: 'kaitian2d', mainBundleCompressionType: 'merge_dep', bundleConfigs,
      packages: platform === 'wechatgame' ? { wechatgame: { appid: process.env.WECHAT_APPID || 'touristappid', orientation: 'landscape', separateEngine: false, useSubpackage: true } } : { 'web-mobile': { orientation: 'landscape' } } });
  }
  const cache = Object.fromEntries(included.map(key => [key, { _value: true }])); cache['render-pipeline'] = { _value: true, _option: 'legacy-pipeline' };
  for (const key of ['3d', 'physics', 'physics-2d', 'spine', 'dragon-bones', 'video', 'webview', 'particle', 'particle-2d', 'custom-pipeline', 'profiler']) cache[key] = { _value: false };
  if (!fs.existsSync(path.join(project, 'settings/v2/packages/engine.json'))) json(path.join(project, 'settings/v2/packages/engine.json'), { __version__: '1.0.12', modules: { configs: { kaitian2d: { name: '2D Game', cache, includeModules: included, noDeprecatedFeatures: { value: false, version: '' }, flags: {} } }, globalConfigKey: 'kaitian2d' } });
  if (!fs.existsSync(path.join(project, 'settings/v2/packages/project.json'))) json(path.join(project, 'settings/v2/packages/project.json'), { __version__: '1.0.6', general: { designResolution: { width: 1600, height: 750 }, fitWidth: true, fitHeight: true } });
  const all = fs.readdirSync(assets, { recursive: true }).filter(file => !file.endsWith('.meta')).sort();
  for (const file of all) {
    const full = path.join(assets, file), meta = full + '.meta'; if (fs.existsSync(meta)) continue;
    const directory = fs.statSync(full).isDirectory(), extension = path.extname(file), importer = directory ? 'directory' : ({ '.ts': 'typescript', '.js': 'javascript', '.scene': 'scene', '.png': 'image', '.jpg': 'image', '.wav': 'audio-clip' })[extension];
    if (!importer) continue;
    const id = file === 'Main.scene' ? toolchain.sceneUuid : file.replaceAll('\\', '/') === 'scripts/Main.ts' ? toolchain.mainScriptUuid : uuid(file.replaceAll('\\', '/'));
    const userData = bundles.includes(file) ? { isBundle: true, bundleName: file, priority: 1, compressionType: { wechatgame: 'subpackage' }, isRemoteBundle: {} } : importer === 'image' ? { type: 'texture', fixAlphaTransparencyArtifacts: false } : {};
    json(meta, { ver: directory ? '1.2.0' : importer === 'scene' ? '1.1.50' : importer === 'image' ? '1.0.27' : ['typescript', 'javascript'].includes(importer) ? '4.0.24' : '1.0.0', importer, imported: false, uuid: id, files: [], subMetas: {}, userData });
  }
  configureBundleProfiles();
  await esbuild.build({ entryPoints: [path.join(assets, 'scripts/Main.ts')], bundle: true, external: ['cc'], format: 'esm', target: ['es2017'], outfile: path.join(root, '.cache/cocos-source-check.js'), logLevel: 'silent' });
  console.log('Creator project prepared: 3.8.8, native 2D nodes, deterministic asset IDs, ' + bundles.length + ' art bundles.');
}
if (require.main === module) prepare().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { prepare, uuid, compressed };
