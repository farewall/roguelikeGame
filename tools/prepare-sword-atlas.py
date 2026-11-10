"""Offline size/palette conversion of the authored transparent four-sword atlas (Pillow)."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / 'art/zhuxian-swords/source.png'
output = ROOT / 'cocos-project/assets/game-content/images/zhuxian-swords.png'
image = Image.open(source).convert('RGBA')
if image.width != image.height or image.getchannel('A').getextrema() != (0, 255):
    raise ValueError('Expected square transparent 2x2 atlas with four opaque sword bodies')
image.resize((512, 512), Image.Resampling.LANCZOS).quantize(
    colors=256, method=Image.Quantize.FASTOCTREE
).save(output, optimize=True)
print(f'Zhuxian swords: {output.stat().st_size} bytes, four frames at 256x256')
