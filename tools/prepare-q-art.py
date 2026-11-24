"""Bake the Q-style source poses into the existing runtime frame slots."""
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'art/q-style'
ASSETS = ROOT / 'cocos-project/assets'
CATALOG = json.loads((ROOT / 'art/catalog.json').read_text(encoding='utf-8'))['assets']
CROPS = json.loads((SOURCE / 'crops.json').read_text(encoding='utf-8'))
SMOOTH = Image.Resampling.LANCZOS

def poses(name):
    with Image.open(SOURCE / (name + '.png')) as sheet:
        return [sheet.crop(box).convert('RGBA') for box in CROPS[name]]

def sections(name, columns, rows):
    with Image.open(SOURCE / (name + '.jpg')) as sheet:
        w, h = sheet.size
        for y in range(rows):
            for x in range(columns):
                yield sheet.crop((round(x*w/columns)+3, round(y*h/rows)+3,
                                  round((x+1)*w/columns)-3, round((y+1)*h/rows)-3))

def save(name, image):
    spec = CATALOG[name]
    target = ASSETS / spec['bundle'] / spec['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    if spec['encoding'] == 'png-palette':
        method = Image.Quantize.FASTOCTREE if image.mode == 'RGBA' else Image.Quantize.MEDIANCUT
        colors = 128 if name == 'title' else 256
        image = image.quantize(colors, method)
    if spec['encoding'] == 'jpeg':
        image.convert('RGB').save(target, quality=84, optimize=True)
    else:
        image.save(target, optimize=True)

def atlas(name, bodies, foot=None, max_width=None, max_height=None, placement=None):
    spec = CATALOG[name]
    tw, th = spec['grid']['tile']
    cols = spec['grid']['columns']
    page = Image.new('RGBA', tuple(spec['size']))
    for i, model in enumerate(bodies):
        body = model.copy()
        body.thumbnail((max_width or tw-14, max_height or th-14), SMOOTH)
        place_x, place_y = (tw-body.width)//2, foot-body.height if foot is not None else (th-body.height)//2
        if placement and i in placement:
            place_x, place_y = placement[i]
        page.alpha_composite(body, ((i%cols)*tw+place_x, (i//cols)*th+place_y))
    save(name, page)

def stretch(body, x, y):
    return body.resize((round(body.width*x), round(body.height*y)), SMOOTH)

def scale_poses(bodies, width, height):
    # One scale per authored sheet preserves the proportions of low poses.
    factor = min(width / max(body.width for body in bodies), height / max(body.height for body in bodies))
    return [stretch(body,factor,factor) for body in bodies]

def sword_fan(swords):
    fan = Image.new('RGBA', (450, 412))
    for sword, angle, x in zip(swords, (29, 10, -10, -29), (92, 180, 270, 358)):
        blade = sword.copy()
        blade.thumbnail((120, 322), SMOOTH)
        blade = blade.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        fan.alpha_composite(blade, (x-blade.width//2, 205-blade.height//2))
    return fan.crop(fan.getbbox())

with Image.open(SOURCE / 'title.jpg') as title:
    save('title', ImageOps.fit(title.convert('RGB'), tuple(CATALOG['title']['size']), SMOOTH))
for key, tile in zip(['arena1','arena2','arena3','arena4','arena5','ending'],sections('realms',3,2)):
    save(key, tile.resize(tuple(CATALOG[key]['size']), SMOOTH))

hero = scale_poses(poses('hero'),116,112)
run_poses = scale_poses(poses('hero-run'),116,112)
rows = [hero[:4], hero[4:8], [ImageOps.mirror(p) for p in hero[8:12]], hero[8:12]]
steps = [run_poses[:2], run_poses[2:4], [ImageOps.mirror(p) for p in run_poses[4:6]], run_poses[4:6]]
hero_frames = []
for (idle, run, gather, release), (plant, next_stride) in zip(rows, steps):
    hero_frames += [idle, plant, run, next_stride, gather, release]
atlas('artifact', hero_frames, 120, 116, 112)
front_outcome = [hero[14], hero[12]]
back_outcome = [hero[15], hero[13]]
atlas('heroOutcomes', front_outcome + back_outcome + [ImageOps.mirror(p) for p in front_outcome] + front_outcome,
      120, 116, 112)

enemies = poses('enemies')
enemy_frames = []
for i in range(4):
    neutral, cast, attack = (enemies[i+4*row] for row in range(3))
    enemy_frames += [neutral,stretch(neutral,1.035,.93),cast,attack,stretch(neutral,.91,1.08),stretch(cast,1.04,.78)]
atlas('enemies', enemy_frames, 172, 172, 160)

bosses = poses('bosses')
for stage in [1,3,4,5]:
    neutral, cast, attack = bosses[(stage-1)*3:stage*3]
    atlas('boss'+str(stage), [neutral,stretch(neutral,1.02,.96),cast,attack,stretch(neutral,.92,1.055),stretch(cast,1.04,.82)],181,178,171)
    atlas('motion'+str(stage), [cast,stretch(attack,.97,.94)],181,178,171)

tiger = poses('tiger')
normal = bosses[3]
step, low, swipe, raise_paw, chop, crouch, flight, landing, glance, crash, back, back_flight = tiger
atlas('tiger', [normal,step,swipe,raise_paw,chop,crouch,flight,landing,crash,glance,low,crash,back,back_flight,
               stretch(back,1.08,.82),ImageOps.mirror(swipe)], 181, 174, 166)

props = poses('first-realm-props') + poses('props')[3:]
atlas('worldProps', props, 167, 174, 160)
# Derive the low stump from the upright prop. Its footprint does not change after white tiger impact.
pillar = props[3]
stump = pillar.crop((0,pillar.height*2//3,pillar.width,pillar.height))
atlas('tigerPillars', [pillar,stump,props[4]], 181, 164, 161)
for i, prop in enumerate([props[0],props[3],props[6],props[9],props[12]], start=1):
    page = Image.new('RGBA',(256,256))
    prop.thumbnail((238,238),SMOOTH)
    page.alpha_composite(prop, ((256-prop.width)//2,(256-prop.height)//2))
    save('landmark'+str(i),page)

tiles = list(sections('ground',3,2))
with Image.open(SOURCE / 'first-realm-ground.jpg') as first_realm:
    tiles[0] = first_realm.convert('RGB')
ground = Image.new('RGB',(768,512))
for i, tile in enumerate(tiles):
    ground.paste(tile.resize((256,256),SMOOTH),((i%3)*256,(i//3)*256))
save('worldGround',ground)

# Solid water stays clipped against the actual world pool or wave contour.
water = tiles[5]
for key, index in [('pool0',0),('pool3',3)]:
    old = Image.open(ROOT / 'art/production-atlas-inputs/world-pools.png').convert('RGBA')
    alpha = old.crop((index%2*384,index//2*384,index%2*384+384,index//2*384+384)).getchannel('A')
    surface = water.resize((384,384),SMOOTH).convert('RGBA')
    surface.putalpha(alpha)
    save(key,surface)

weapons = poses('weapons')
# Small width offsets keep adjacent rotation cells from reading as a jump cut.
bells = [stretch(weapons[i//4],1-.025*(i%4),1) for i in range(16)]
atlas('bell',bells)
flags = weapons[4:8]
flag_frames = [flags[0],stretch(flags[0],.98,1),flags[1],stretch(flags[1],1.02,1)]
flag_frames += [flags[2],stretch(flags[2],1.03,.99),flags[1],stretch(flags[1],.95,.99)]
flag_frames += [flags[0],flags[2],flags[3],stretch(flags[2],.92,1)]
flag_frames = [ImageOps.contain(flag, (170, 179), SMOOTH) for flag in flag_frames]
atlas('banner',flag_frames+weapons[12:16],max_width=178,max_height=179,
      placement={i:(13,183-flag.height) for i, flag in enumerate(flag_frames)})
swords = weapons[8:12]
# The sword nodes use a narrow aspect ratio within their square atlas cells.
# Compensate horizontally so each illustrated blade keeps its silhouette.
sword_frames = [sword.resize((min(224,round(sword.width*240/sword.height/.52)),240),SMOOTH) for sword in swords]
atlas('swords',sword_frames,max_width=224,max_height=240)
atlas('weaponCards',[weapons[0],flags[2],sword_fan(swords)])
