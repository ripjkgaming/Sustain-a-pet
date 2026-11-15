# Blender-authored game assets

`botanical-pets.blend` contains the editable Leafling, Mossy, and Sunbud meshes, packed botanical albedo and normal maps, expression reference faces, and a studio camera and lights. Each character has its own collection. The other `.blend` files in this directory are the authored garden habitats, shop/restoration props, quest mushrooms and flower variants.

The runtime GLBs are in `public/models/`. Eyes and mouths in the game use the live `Face.jsx` rig, allowing blinking, pointer tracking, and health expressions. The static reference faces in the Blender file are deliberately excluded from GLB exports.

Growth meshes use `growth_0_` through `growth_3_` prefixes. The app reveals these cumulatively for Seed, Sprout, Sapling, and Guardian. `foliage` nodes pivot at leaf or mushroom bases for health droop and gentle movement. Meshes and textures are shared; each displayed pet owns separate materials so health changes cannot recolor another pet.

## Rebuild through Blender MCP

With Blender open and the installed MCP add-on listening on localhost:9876, run the generators through the bridge in this order:

```bash
python scripts/blender_bridge.py --info
python scripts/blender_bridge.py scripts/build_characters.py
python scripts/blender_bridge.py scripts/build_worlds.py
python scripts/blender_bridge.py scripts/build_interactives.py
```

The generators overwrite this project's generated models and source scenes. Run each in a fresh Blender scene. `build_characters.py` exports the three companions; `build_worlds.py` exports the meadow, pond and grove plus their shop/restoration props; `build_interactives.py` exports the quest mushrooms, flower variants and grove landmarks. The generators create assets locally without downloaded models, textures or external services. `finish_blender_scene.py` is called by the character generator to add the reference faces and studio.

## Review all states

Start `npm run dev`, then open `/model-preview.html`. Choose a character, any of the four growth stages, any of the four health moods, and the floating effect. This review page does not access game saves.

## River assets

Rebuild with `python scripts/blender_bridge.py scripts/build_river.py`. The generator
starts every model and GLB re-import in a fresh factory scene. A factory reset briefly
disconnects MCP; the generator restores the addon after it finishes. Wait for
`assets/blender/river-validation.json` to update before reconnecting. Three-angle
renders of each re-imported GLB are written to `/tmp/sustain-a-pet-river-review/`.

All dimensions below are game/glTF **X × Y × Z**, in world units (Y up).
Editable sources are the same basenames with `.blend` in this directory; runtime
GLBs are in `public/models/`. All geometry is procedural, with shared untextured
Principled materials at roughness 0.87 and the habitat meadow's grass/moss colours.
Exports use `export_yup=True` and contain no cameras, lights, or animations.

| Asset | Dimensions X × Y × Z | Mesh nodes |
| --- | --- | --- |
| `prop-footbridge` | 1.200 × 1.107 × 4.200 | `plank_00`–`plank_10`, `rails`, `beam_l`, `beam_r` |
| `river-bank` | 3.400 × 0.502 × 0.900 | `river-bank_grass`, `river-bank_earth`, `river-bank_rock`, `river-bank_moss` |
| `prop-reeds` | 0.439 × 1.000 × 0.464 | `prop-reeds_leaf`, `prop-reeds_grass`, `prop-reeds_bark` |
| `prop-river-stones` | 1.817 × 0.288 × 1.270 | `prop-river-stones_rock`, `prop-river-stones_stone-light`, `prop-river-stones_stone-dark` |

The footbridge is centred horizontally on the origin, running from Z = −2.1 to
+2.1. Its end deck tops are Y = 0.14 and the arch rises 0.18 to Y = 0.32 at the
centre; the middle 3.4 spans water, leaving 0.4 on each bank. Eleven individual
planks have their own centre pivots and are ordered **from +Z to −Z**. `rails`
contains both handrails, all six posts, caps and rope bindings. `beam_l` is at
negative X; `beam_r` is at positive X. Each beam includes its moss patches.

The bank tiles along X in 3.4-unit increments. Both end profiles and tangents
match; land extends toward −Z and water toward +Z. Its origin is at the segment
centre on the waterline (Y = 0), with soil extending below it. Reeds have a base
pivot at Y = 0, two cattail heads and nine solid leaf blades. The stones contain
five disconnected rounded rocks with disjoint footprints, horizontally centred
as a cluster and each grounded at Y = 0.

`river-validation.json` records re-imported game-space bounding boxes, triangle
counts, byte sizes, bridge node names and plank ordering, plus stone count and
minimum footprint clearance. All four GLBs are below 6,000 triangles and 120 KB.
