# 五境大地图美术

- `ground-source.png`：3×2地表图集，依次为青苔石地、骨原砂土、冷却玄岩、寒海冰岩、天庭石砖、水面。
- `props-source.png`：4×4透明物件，按林地、骨原、熔界、寒海、天庭各3格分组，最后1格为宝匣；树、石、骸骨、冰棱、残柱使用独立实体图块。
- `pools-source.png`：2×2透明地形贴片，依次为寒水、熔岩、虚空、林地泉涧；统一透明边距后接入真实阻挡区域。

运行资源为 `world-ground.jpg`（768×512）、`world-props.png`（768×768）、`world-pools.png`（384×384），位于 `cocos-project/assets/game-content/images/`。完整美术源不进入微信包。

使用 Python + Pillow 执行 `python tools/prepare-world-art.py`，只进行图集尺寸、单格透明边距与调色板转换。地表运行时交替镜像铺接，场景物件按镜头裁剪显示。
