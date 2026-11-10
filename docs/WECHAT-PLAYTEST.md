> 当前使用 Cocos Creator 正式导出，准备和构建命令以根目录 README 为准。

# 微信小游戏试玩上传

工作流 `.github/workflows/wechat-playtest.yml` 在推送 `cocos-migration/**` 或 `wechat-playtest/**` 分支时执行，也可从 Actions 手动运行。它构建小游戏、执行回归，再用官方 `miniprogram-ci` 上传开发版本并生成临时预览二维码。

## 仓库配置

Settings → Secrets and variables → Actions：

- Repository variable `WECHAT_APPID`：小游戏 AppID。
- Repository secret `WECHAT_PRIVATE_KEY`：同一个小游戏的代码上传私钥全文，保留 PEM 首尾及换行。

AppID 只注入临时项目配置；密钥在进程环境中读取，不写入项目、Git 或二维码 artifact。上传 SDK 项目类型为 `miniGame`，项目配置为 `compileType: game`。预览不传小程序 `pagePath`。不需要 AppSecret。

工作流安装锁定版本的 Cocos Creator 和构建工具，生成 `minigame/game.js`、`game.json` 及 assets，运行 `npm test`，随后调用 CI 机器人 1。版本格式 `0.4.<run_number>`，开发上传不等于提审或正式发布。

## 获取试玩

1. 打开 Actions → **Cocos Creator WeChat playtest**，核对提交与任务结果。
2. 下载成功任务的 `wechat-preview` artifact，解压后微信扫描 `qrcode.png`。有效期和可访问账号受微信限制，artifact 保留一天。
3. 也可在微信公众平台版本管理查看上传的开发版本，再按需要设置体验版、添加体验者。此操作不等于正式发布。

若日志已经显示 `Development version uploaded`，而后续预览失败，应先检查后台版本，避免将预览失败误判为上传失败。

## 本地与真机

先运行根目录 README 中的构建命令，再用微信开发者工具导入根目录。小游戏固定横屏，所有菜单、升级卡、设置滑条与手记由 Cocos UI 绘制；摇杆和 UI 通过 Cocos Input 处理。音频位于 `cocos-project/assets/game-content/audio/`，偏好与手记使用本机存储。

已检查 844×390 和 667×320 浏览器布局、生产入口适配、触摸取消/多指、暂停/后台、升级、路线、试炼及结算。仍需微信开发者工具和手机确认真实 API、刘海安全区、扬声器、震动、长时间稳定性和高敌人数帧率。小程序与小游戏的存储空间不保证共享，不应假定旧手记会自动迁移。

横屏窗口可能短暂收到仍按竖屏坐标返回的 `safeArea`。控制器会验证安全区与当前窗口是否一致；可识别的竖屏数据转换为两侧刘海边距，异常数据退回当前窗口范围，过期的竖屏胶囊位置不参与HUD排布。启动和尺寸变化共用这一处理，避免战斗区和右侧技能按钮被挤到半屏。回归额外注入竖屏安全区，在两种横屏尺寸和三件至宝下检查真实裁切节点、左右双指移动与技能操作。

摇杆图形和技能按钮均绘制在固定HUD层，位置与屏幕触控区一致，不随大地图镜头移动。

## 常见阻塞

- 缺少变量或密钥：名称必须与上述一致，GitHub Secrets 不会自动注入本地工作区。
- `invalid ip`：按错误中的上传出口 IP 配置微信代码上传白名单；GitHub 托管 Runner 出口会变化，需要时改用固定出口 Runner。
- 签名或 AppID 错误：确认私钥来自该小游戏的代码上传密钥，而非 AppSecret。
- 扫码无权限：为对应微信号配置开发者或体验者，并核对二维码类型。

## 御宝战斗版本

这一版包含四向徒手施法动作、悬浮钟/幡、贯穿飞刃和两种蓄能技。开局满能，右下可直接释放；镇界点击解围，裂天可拖动瞄准并松手释放。详见 [战斗说明](ARTIFACT-COMBAT.md)。CI 在微信上传前检查实际 Creator 导出版本的两种横屏尺寸、两种至宝、鼠标与触摸摇杆，以及重新加载后的存档读取。

Creator 构建、真实 Web 画面检查及微信上传由同一提交串联执行，截图 artifact 为 cocos-checks，完整输出为 cocos-builds。私钥仅传入最后的上传步骤，不参与编辑器构建。
