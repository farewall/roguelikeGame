"""Materialize cropped runtime pages from the archived production pixel sources."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
catalog = json.loads((root / 'art/catalog.json').read_text(encoding='utf-8'))
for entry in catalog['assets'].values():
    if 'crop' not in entry and 'poseHeights' not in entry:
        continue
    destination = root / 'cocos-project/assets' / entry['bundle'] / entry['path']
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(root / entry['source']) as source:
        if 'crop' in entry:
            x, y, w, h = entry['crop']
            source.crop((x, y, x + w, y + h)).save(destination, optimize=True)
            continue
        columns, rows = entry['grid']['columns'], entry['grid']['rows']
        tile_w, tile_h = entry['grid']['tile']
        atlas = Image.new('RGBA', tuple(entry['size']))
        for row in range(rows):
            for col in range(columns):
                cell = source.crop((round(col * source.width / columns), round(row * source.height / rows),
                    round((col + 1) * source.width / columns), round((row + 1) * source.height / rows)))
                alpha = cell.getchannel('A').point(lambda a: a if a >= 16 else 0)
                bounds = alpha.getbbox()
                if not bounds:
                    raise ValueError(f'Missing pose at row {row}, column {col}')
                cell.putalpha(alpha)
                pose = cell.crop(bounds)
                pose.thumbnail((tile_w - 16, entry['poseHeights'][col]), Image.Resampling.LANCZOS)
                atlas.alpha_composite(pose, (col * tile_w + (tile_w - pose.width) // 2,
                    row * tile_h + entry['footRow'] - pose.height))
        atlas.save(destination, optimize=True)
