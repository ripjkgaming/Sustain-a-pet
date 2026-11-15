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
