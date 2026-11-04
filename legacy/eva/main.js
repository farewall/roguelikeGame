'use strict';
const { installPlatform } = require('./platform/wechat');
const platform = installPlatform(wx);
// Load Eva/Pixi only after installing native canvas/image globals.
module.exports = require('./src/app').boot(wx, platform.canvas, platform.createImage).catch(error => {
  console.error('小游戏启动失败：' + String(error.message || error));
  if (wx.showModal) wx.showModal({ title: '暂时无法载入', content: '请退出后重新进入游戏。', showCancel: false });
  throw error;
});
