# Boss 补充动作姿态

`source.png` 为本轮生成并完成透明背景处理的两列五行动作原稿；每行依次为青龙、白虎、朱雀、玄武、天道，左右列为蓄势末段及收招姿态。

`python tools/prepare-boss-motion.py` 仅做离线图集排版、尺寸和调色板压缩，生成 `cocos-project/assets/game-content/images/boss-motion.png`，十个192×192帧。动作选择、衔接和重量过渡在 `BossVfx.ts`，原始图和本目录均不进入运行包。

`reference/` 保存此前未在战斗或剧情界面使用的五张独立首领立绘及其原元数据，释放内容包余量。
