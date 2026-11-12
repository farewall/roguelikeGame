"""Pack the generated transparent 2x5 action sheet into the runtime atlas."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / 'art/boss-motion/source.png'
output = ROOT / 'cocos-project/assets/game-content/images/boss-motion.png'
image = Image.open(source).convert('RGBA')
if image.getchannel('A').getextrema() != (0, 255):
    raise ValueError('Boss poses must have transparent backgrounds and opaque bodies')
atlas = Image.new('RGBA', (384, 960))
for row in range(5):
    for col in range(2):
        cell = image.crop((round(col * image.width / 2), round(row * image.height / 5),
                           round((col + 1) * image.width / 2), round((row + 1) * image.height / 5)))
        box = cell.getchannel('A').getbbox()
        if not box:
            raise ValueError(f'Empty action cell {row}, {col}')
        body = cell.crop(box)
        body.thumbnail((180, 176), Image.Resampling.LANCZOS)
        atlas.alpha_composite(body, (col * 192 + (192 - body.width) // 2,
                                    row * 192 + 181 - body.height))
atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(output, optimize=True)
print(f'Boss action supplement: {output.stat().st_size} bytes, ten 192x192 frames')
