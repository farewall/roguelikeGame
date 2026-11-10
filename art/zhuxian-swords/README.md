# 诛仙四剑实体美术

`source.png` 为2×2透明图集，依次为诛仙、戮仙、陷仙、绝仙。四剑拥有独立轮廓：赤脊龙翼剑、墨铁重刃、青钢细剑、银青玉剑。材质沿用游戏的青铜、暗钢与金属雕纹，保持剑身和剑柄实体，不携带地面法阵或光圈。

运行资源为 `cocos-project/assets/game-content/images/zhuxian-swords.png`，512×512，单格256×256。统一剑尖朝上，中心锚点；运行时按实际环绕姿态旋转，并按深度缩放和安排人物前后的图层。

离线转换需要 Python 和 Pillow：`python tools/prepare-sword-atlas.py`。只缩放和量化调色板，保留透明度。原始源图不进入微信资源包。
