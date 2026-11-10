"""Resize and quantize authored world atlases; no art sources enter the game bundle."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'art/world'
OUTPUT = ROOT / 'cocos-project/assets/game-content/images'
Image.open(SOURCE / 'ground-source.png').convert('RGB').resize(
    (768, 512), Image.Resampling.LANCZOS
).save(OUTPUT / 'world-ground.jpg', quality=78, optimize=True)
Image.open(SOURCE / 'props-source.png').convert('RGBA').resize(
    (768, 768), Image.Resampling.LANCZOS
).quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(OUTPUT / 'world-props.png', optimize=True)
source = Image.open(SOURCE / 'pools-source.png').convert('RGBA')
atlas = Image.new('RGBA', (384, 384))
for row in range(2):
    for column in range(2):
        cell = source.crop((round(column * source.width / 2), round(row * source.height / 2),
                            round((column + 1) * source.width / 2), round((row + 1) * source.height / 2)))
        cell = cell.crop(cell.getbbox()).resize((174, 174), Image.Resampling.LANCZOS)
        atlas.alpha_composite(cell, (column * 192 + 9, row * 192 + 9))
atlas.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(OUTPUT / 'world-pools.png', optimize=True)
for name in ['world-ground.jpg', 'world-props.png', 'world-pools.png']:
    print(name, (OUTPUT / name).stat().st_size, 'bytes')
