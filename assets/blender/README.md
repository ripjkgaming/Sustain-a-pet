# Botanical character assets

`botanical-pets.blend` contains the editable Leafling, Mossy, and Sunbud meshes, packed botanical albedo and normal maps, expression reference faces, and a studio camera and lights. Each character has its own collection.

The runtime GLBs are in `public/models/`. Eyes and mouths in the game use the live `Face.jsx` rig, allowing blinking, pointer tracking, and health expressions. The static reference faces in the Blender file are deliberately excluded from GLB exports.

Growth meshes use `growth_0_` through `growth_3_` prefixes. The app reveals these cumulatively for Seed, Sprout, Sapling, and Guardian. `foliage` nodes pivot at leaf or mushroom bases for health droop and gentle movement. Meshes and textures are shared; each displayed pet owns separate materials so health changes cannot recolor another pet.

## Rebuild through Blender MCP

With Blender open and the installed MCP add-on listening on localhost:9876:

```bash
python scripts/blender_bridge.py --info
python scripts/blender_bridge.py scripts/build_characters.py
```

The generator overwrites this project's generated models and source scene. Run it in a fresh Blender scene. It generates assets locally without downloaded models, textures, or external services. `finish_blender_scene.py` is called at the end to add the reference faces and studio.

## Review all states

Start `npm run dev`, then open `/model-preview.html`. Choose a character, any of the four growth stages, any of the four health moods, and the floating effect. This review page does not access game saves.
