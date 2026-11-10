# 盘古幡实体图集

`source.png` 为生成后选用的透明美术源，4列×4行。青铜龙首幡杆、深青黑绸面和金色纹饰采用有重量的实体材质，不使用环形光晕替代本体。

运行图集位于 `cocos-project/assets/game-content/images/pangu-banner.png`，768×768，单格192×192。前两行8格为幡面摆动；第三行4格为收幡、挥动、释放、回收；第四行为向右的母刃、向右的子刃、破碎迸裂和短促飞痕。发射时按实际弹道旋转刃片。

离线压缩需要 Python 和 Pillow：`python tools/prepare-banner-atlas.py`。只缩放并量化调色板，保留透明度；完整源文件不进入小游戏资源包。
