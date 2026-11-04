# 开天一念 · 微信小游戏

横屏动作肉鸽，使用 **Eva.js 1.2.8 + PixiJS 4.8.9**。通过微信原生 Canvas、触摸、音频及生命周期适配运行，统一由 Eva 帧循环推进战斗与动画。原有 Page/WXML 原型保存在 `legacy/`。

## 构建与运行

需要 Node.js 22：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
```

用微信开发者工具打开仓库根目录，选择小游戏项目。`project.config.json` 已设置 `compileType: game`，运行目录为构建生成的 `minigame/`。本地 `touristappid` 为占位，真机调试时填入自己的小游戏 AppID；GitHub 上传从仓库变量自动注入实际 AppID。

本地辅助预览：

```sh
npm run preview -- 4173
node tools/preview.test.cjs
node tools/package-budget.cjs
```

浏览器访问 `http://127.0.0.1:4173/`；`/native` 执行正式构建的 `game.js`，用隔离的 GameGlobal 和模拟 wx 检查适配。自动交互检查需要 Python 3、Playwright 和 Chromium，默认截图在 `/tmp/pangu-minigame/`。这些检查不等价于微信开发者工具或真机测试。

## 玩法

左下摇杆移动，至宝自动攻击。东皇钟近身音波，盘古幡远距扇形重击；首境后选择回响/护体或清群/破劫路线。每境包含普通波、混合波、精英和首领，四象与天道各有预警、收招窗口和半血强化。

升级三选一暂停战斗，展示提升前后数值。火、水、土最高四重，二/四重解锁传火、爆燃、潮涌、冰封、余震与震慑；元素组合产生蒸腾、熔流和泥沼，三元素保留伤害与减速。第二境后随机遭遇清泉、残卷或可选精英试炼。

主角六组四向动画共 144 帧；设置支持音效、音量、震动和操作提示，切入后台冻结战斗。已见记忆、图鉴和最近八局结算保存在本机，含伤害构成与主要受伤来源。本局构筑每次重开，不提供永久数值成长或中途续玩。

## 工程与验收

- `game/core/`：战斗、动画、音频与手记；`game/src/`：控制器、Eva 场景和原生触摸；`game/platform/`：微信适配。
- `game/assets/`：运行图像和短音效；`art/`：离线动作源和参考图，不上传。
- `minigame/`：可重建产物，不提交 Git；构建会清空旧产物。
- 79 项逻辑/适配回归，以及 6 组核心流程和 12 组含摇杆、动画、升级等待的流程模拟。浏览器检查覆盖两种横屏尺寸及生产入口。

[迁移说明](docs/MINIGAME-MIGRATION.md) · [上传与试玩](docs/WECHAT-PLAYTEST.md) · [资源预算](docs/RESOURCES.md) · [美术说明](docs/ART.md) · [玩法优化记录](docs/OPTIMIZATION.md)

独立普通怪动作、首领逐帧动画、正式记忆 CG、真人平衡及微信真机性能验收仍待完成。当前采用 Canvas 渲染，不能据此声称已达到真机目标帧率。
