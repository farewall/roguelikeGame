"""Offline size/palette conversion of the authored transparent 4x4 atlas (Pillow)."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / 'art/pangu-banner/source.png'
output = ROOT / 'cocos-project/assets/game-content/images/pangu-banner.png'
image = Image.open(source).convert('RGBA')
if image.width != image.height or image.getchannel('A').getextrema() != (0, 255):
    raise ValueError('Expected square transparent 4x4 banner atlas with opaque solid bodies')
image.resize((768, 768), Image.Resampling.LANCZOS).quantize(
    colors=256, method=Image.Quantize.FASTOCTREE
).save(output, optimize=True)
print(f'Pangu Banner: {output.stat().st_size} bytes, 16 frames at 192x192')
