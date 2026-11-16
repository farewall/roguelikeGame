"""Pack generated transparent poses; keep the intact/stump footprint identical."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art/white-tiger'
OUT = ROOT / 'cocos-project/assets/game-content/images'

def source(name):
    image = Image.open(ART / name).convert('RGBA')
    if image.getchannel('A').getextrema() != (0, 255):
        raise ValueError(f'{name} must contain transparent background and opaque bodies')
    return image

def cells(image, columns, rows):
    for row in range(rows):
        for col in range(columns):
            cell = image.crop((round(col*image.width/columns), round(row*image.height/rows),
                               round((col+1)*image.width/columns), round((row+1)*image.height/rows)))
            box = cell.getchannel('A').getbbox()
            if not box:
                raise ValueError('Empty pose')
            yield cell.crop(box)

atlas = Image.new('RGBA', (768, 768))
poses = list(cells(source('poses.png'), 3, 4)) + list(cells(source('rear.png'), 2, 2))
for index, body in enumerate(poses):
    body.thumbnail((181, 174), Image.Resampling.LANCZOS)
    atlas.alpha_composite(body, ((index%4)*192+(192-body.width)//2, (index//4)*192+181-body.height))
atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(OUT/'white-tiger.png', optimize=True)

pillars = list(cells(source('pillars.png'), 3, 1))
atlas = Image.new('RGBA', (576, 192))
scale = min(166/pillars[0].width, 176/pillars[0].height)
for index, body in enumerate(pillars):
    ratio = scale if index<2 else min(170/body.width, 168/body.height)
    body = body.resize((round(body.width*ratio), round(body.height*ratio)), Image.Resampling.LANCZOS)
    atlas.alpha_composite(body, (index*192+(192-body.width)//2, 182-body.height))
atlas.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(OUT/'tiger-pillars.png', optimize=True)
for name in ['white-tiger.png', 'tiger-pillars.png']:
    print(f'{name}: {(OUT/name).stat().st_size} bytes')
