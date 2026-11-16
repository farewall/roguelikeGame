"""Pack imagegen-authored production art without reducing alpha/color precision."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'art/release-polish'
OUT = ROOT / 'cocos-project/assets/game-content/images'

def cells(name, columns, rows):
    image = Image.open(SOURCE / name).convert('RGBA')
    for row in range(rows):
        for col in range(columns):
            cell = image.crop((round(col*image.width/columns), round(row*image.height/rows),
                               round((col+1)*image.width/columns), round((row+1)*image.height/rows)))
            # Ignore imperceptible fringe pixels when measuring the packing box;
            # retain original alpha and painted colors inside the resulting crop.
            box = cell.getchannel('A').point(lambda a: 255 if a>=16 else 0).getbbox()
            if not box:
                raise ValueError(f'Empty frame in {name}: {row}, {col}')
            yield cell.crop(box)

hero = Image.new('RGBA', (768, 512))
for i, body in enumerate(cells('pangu.png', 6, 4)):
    body.thumbnail((112, 112), Image.Resampling.LANCZOS)
    hero.alpha_composite(body, ((i%6)*128+(128-body.width)//2, (i//6)*128+120-body.height))
hero.save(OUT/'pangu/artifact-cast.png', optimize=True)

props = Image.new('RGBA', (768, 768))
for i, body in enumerate(cells('props.png', 4, 4)):
    body.thumbnail((174, 160), Image.Resampling.LANCZOS)
    props.alpha_composite(body, ((i%4)*192+(192-body.width)//2, (i//4)*192+167-body.height))
props.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(OUT/'world-props.png', optimize=True)

style = Image.new('RGBA', (768, 512))
for i, body in enumerate(cells('landmarks.png', 3, 2)):
    body.thumbnail((240, 240), Image.Resampling.LANCZOS)
    style.alpha_composite(body, ((i%3)*256+(256-body.width)//2, (i//3)*256+(256-body.height)//2))
style.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(OUT/'world-style.png', optimize=True)

pools = Image.new('RGBA', (768, 768))
for i, body in enumerate(cells('pools.png', 2, 2)):
    body.thumbnail((324, 324), Image.Resampling.LANCZOS)
    pools.alpha_composite(body, ((i%2)*384+(384-body.width)//2, (i//2)*384+(384-body.height)//2))
pools.save(OUT/'world-pools.png', optimize=True)

waves = Image.new('RGBA', (512, 192))
for i, body in enumerate(cells('waves.png', 2, 2)):
    body.thumbnail((240, 80), Image.Resampling.LANCZOS)
    waves.alpha_composite(body, ((i%2)*256+(256-body.width)//2, (i//2)*96+(96-body.height)//2))
waves.save(OUT/'sea-crests.png', optimize=True)

Image.open(SOURCE/'ground.png').convert('RGB').resize((768, 512), Image.Resampling.LANCZOS).save(
    OUT/'world-ground.jpg', quality=82, optimize=True)
for name in ['pangu/artifact-cast.png', 'world-props.png', 'world-style.png', 'world-pools.png', 'sea-crests.png', 'world-ground.jpg']:
    print(f'{name}: {(OUT/name).stat().st_size} bytes')
