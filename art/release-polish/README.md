# Production art sources

`pangu.png`: imagegen-authored and alpha-cleaned 6×4 playable Pangu poses, in down/up/left/right row order; idle A/B, walk A/B, gather and release column order.

`props.png`: imagegen-authored 4×4 isolated scenery props with matching stage IDs. `ground.png`: quiet 3×2 terrain textures. `landmarks.png`: 3×2 ground decals (five stages) plus one feathered contact projection. Shadow color is supplied by the runtime material tint.

`pools.png`: four natural surfaces for sea, lava, void and forest spring, packed at 384 pixels per frame. The visible shore uses the world's physical polygon and the material patch fits inside it.

`waves.png`: four transparent painted rolling crests, packed into 256×96 frames. The moving body is clipped to the actual wave collision band, with separate curls following its front.

Pack with `python tools/prepare-release-art.py`. The hero, water and wave curls keep full RGBA; scenery atlases use 256-color RGBA palettes. Source images stay outside the runtime bundle. The prior art remains in the repository history and reference folders.
