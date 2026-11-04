# Cocos Creator 迁移

当前工程固定为 Cocos Creator 3.8.8，使用官方编辑器 CLI 导出 Web 和微信小游戏。运行入口是 `cocos-project/assets/Main.scene` 与 `KaitianGame` 组件，已经脱离 Eva/Pixi 渲染器。

`Main.ts` 使用 Cocos 生命周期推进控制器和场景。`Presentation.ts` 使用原生 Node、Sprite、Label、Graphics、Mask；`Platform.ts` 使用 Cocos Input、Game 前后台事件和 AudioSource，微信存储/震动继续调用同一 AppID 的 wx API。主角继续使用新的四向徒手御宝图集，钟/幡、贯穿飞刃和蓄能技均保留。

`game/` 是玩法逻辑的唯一源；准备脚本只生成 Creator 可导入的 ES 模块、缺失元数据和初始配置。已有 `Main.scene` 和资产 UUID 保留，避免每次准备工程覆盖编辑器修改。界面目前由 Cocos 组件动态组成，后续可以逐步提取成可视化预制体。

## 正式构建

先运行根目录 README 的准备命令，再用编辑器打开 `cocos-project/`。命令行构建要求 `COCOS_CREATOR` 指向实际 Creator 3.8.8 可执行文件；缺失时直接报错，不使用旧引擎产物兜底。

`tools/cocos/build.cjs` 清理目标输出后调用正式 CLI，校验退出码与关键文件，记录引擎、平台和源码提交信息。微信输出复制到 `minigame/`，上传脚本只接受这一类产物。

## 资源与验证

`game-content` 资源 Bundle 在微信构建中导出为小游戏分包，通过 Cocos `assetManager.loadBundle` 加载；失败会提供重试入口。主包与分包分别检查预算。图片、声音按 Creator 的资源系统导入，不依赖旧静态文件路径。

玩法回归继续覆盖原有战斗、路线、事件、技能、多指输入与暂停。CI 另检查真实 Creator Web 输出的两种横屏尺寸、两种至宝、升级/记忆/试炼/结算与手记，再上传微信开发版。最终构建、画面和上传状态以对应 Actions 为准；真机帧率、发热和手感仍需手机试玩。

旧页面及 Eva 实现只在 `legacy/` 保留，旧迁移记录见 [历史说明](EVA-MIGRATION-HISTORY.md)。
