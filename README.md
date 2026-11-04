# 开天一念 · Cocos Creator 微信小游戏

项目使用 **Cocos Creator 3.8.8**。场景、精灵、文字、几何特效、裁切、音频和输入由 Cocos 组件处理，战斗与存档逻辑保留为独立 JavaScript 模块。旧小程序及 Eva 原型归档在 `legacy/`。

## 打开与构建

需要 Node.js 22 和 Cocos Creator 3.8.8：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run prepare:cocos
npm test
```

在 Cocos Dashboard 中添加并打开 **`cocos-project/`**，启动场景为 `assets/Main.scene`。`prepare:cocos` 将经过测试的 `game/` 业务模块生成到 Creator 的 `assets/scripts/generated/`，生成文件不手动维护。已有场景和资源 UUID 不会被准备脚本覆盖。

配置 `COCOS_CREATOR` 为实际编辑器可执行文件后，可以使用命令行构建：

```sh
npm run build:web
npm run build
npm run test:package
```

以上调用正式 Creator CLI，分别生成 Web 检查版和 `wechatgame` 包。微信输出同步到根目录 `minigame/`；用微信开发者工具打开仓库根目录即可导入。根配置保留占位 AppID，GitHub 上传从现有仓库变量注入真实小游戏 AppID。

## 玩法与操作

横屏摇杆移动，至宝自动攻击。东皇钟释放近身音波，右下「镇界」用于震退、打断普通敌人和短暂护身；盘古幡发射贯穿飞刃，拖动右下「裂天」瞄准并松手释放，轻点则朝最近敌人释放。开局技能满能，命中与击破补充能量。

五境、四象与天道、两件至宝的路线、火水土四阶附魔与组合、关后事件、手记和最近八局记录均保留。每局重新构筑，没有永久数值成长；中途续玩未接入。同一小游戏 AppID 下继续使用原有存储键，已有偏好和手记可继续读取。

## 目录与验证

- `cocos-project/assets/scripts/`：Cocos 入口、场景呈现、资源与平台接入。
- `cocos-project/assets/game-content/`：运行图片和声音，微信构建时成为独立资源分包。
- `game/`：共享战斗、动画状态、输入状态、控制器和存档逻辑。
- `tools/cocos/`：工程准备、正式编辑器构建及真实 Web 输出交互检查。
- `art/`：动作原图与参考素材，不进入微信运行包。

CI 使用官方 Creator 3.8.8 编辑器导出，检查生成包、两种横屏尺寸的实际渲染与交互，再通过现有 AppID/上传密钥上传微信开发版及二维码。构建和上传结果见对应 Actions；浏览器检查不替代微信手机性能验收。

[迁移说明](docs/MINIGAME-MIGRATION.md) · [试玩上传](docs/WECHAT-PLAYTEST.md) · [资源预算](docs/RESOURCES.md) · [御宝战斗](docs/ARTIFACT-COMBAT.md) · [美术说明](docs/ART.md)
