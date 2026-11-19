# 生产图集输入

这里保存拆包前的制作原图和旧版参考图。运行时只选择 [资源清单](../catalog.json) 指定的矩形。这套拆页保留原始像素与透明度。

使用 `tools/requirements-art.txt` 中的 Pillow 版本并运行 `npm run prepare:art`，可重建拆页及主角结算帧。以原始高分辨率源图重新做完整套图时，使用对应的 `tools/prepare-*-art.py` 或图集制作脚本。没有分层原画的图集，以此目录中保存的生产像素作为重建输入。

`enemy-wraith.png` 是仅供复查的历史占位图。原白虎和旧法术图集的非运行行也保留在输入页。
