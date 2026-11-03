# 微信试玩上传

工作流 `.github/workflows/wechat-playtest.yml` 在推送 `wechat-playtest/**` 分支时执行，也可在 GitHub 提供入口时手动执行。只上传开发版本并生成临时预览二维码，不提审、不发布正式版。

仓库 Settings → Secrets and variables → Actions：

- Repository secret `WECHAT_PRIVATE_KEY`：代码上传私钥全文，保留 PEM 首尾和换行。
- Repository variable `WECHAT_APPID`：对应小程序真实 AppID。

执行过程使用官方 `miniprogram-ci` 2.1.31，安装依赖由锁文件固定。密钥仅通过上传步骤的进程环境读取，不写入仓库或二维码 artifact。上传项目在临时目录中组装；AppID 仅替换临时配置，不修改仓库中的占位配置。

## 试玩

1. 打开仓库 Actions → WeChat playtest，确认本次提交对应任务成功。
2. 下载该次任务的 `wechat-preview` artifact，解压并在微信扫描 `qrcode.png`。预览有效期与可访问账号受微信限制；二维码 artifact 保留一天。
3. 也可在微信公众平台「版本管理」找到 CI 机器人 1 上传的开发版本，设置为体验版，并在「成员管理」添加体验者，再扫描体验版二维码。体验版设置不等于正式发布。

上传步骤若已提示 Development version uploaded 而二维码步骤随后失败，开发版本可能已经在后台，请先核对版本再重试。

## 常见阻塞

- 缺少变量/密钥：确认名称与以上完全一致。GitHub Secrets 不会自动注入本地云开发环境。
- invalid ip / IP whitelist：根据本次错误报告的上传出口 IP 配置微信公众平台「开发管理 → 开发设置 → 小程序代码上传」白名单。GitHub 托管 Runner 出口会变化；长期稳定上传宜使用固定出口的自托管 Runner。
- 签名/AppID 错误：确认私钥来自同一个 AppID 的「小程序代码上传密钥」，不是 AppSecret。重新生成私钥后要更新 Secret。
- 无扫码权限：在微信公众平台添加对应微信号为开发者或体验者，并使用相应版本二维码。

私钥不要放进项目目录、Git 提交、截图、日志或聊天。本工作流不需要 AppSecret。
