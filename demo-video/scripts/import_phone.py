"""Run only through scripts/blender_bridge.py during an agreed MCP window.
Imports the user's USDZ in a temporary scene, exports the real model and a geometry
report, then restores the original Blender scene. Never loads any environment map.
"""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path('/home/ripjk/sustain-a-pet/demo-video')
SOURCE = Path('/home/ripjk/Downloads/Hopes 3D Iphone/iphone_17_pro_max.usdz')
OUT = ROOT / 'assets/phone'
OUT.mkdir(parents=True, exist_ok=True)
original_scene = bpy.context.window.scene
original_objects = set(bpy.data.objects)
original_images = set(bpy.data.images)
original_materials = set(bpy.data.materials)
temporary = bpy.data.scenes.new('DEMO_PHONE_TEMPORARY')
try:
    bpy.context.window.scene = temporary
    bpy.ops.wm.usd_import(filepath=str(SOURCE), import_cameras=False, import_lights=False)
    imported = list(set(bpy.data.objects) - original_objects)
    objects = []
    for obj in imported:
        entry = {'name': obj.name, 'type': obj.type, 'matrix': [list(row) for row in obj.matrix_world]}
        if obj.type == 'MESH':
            corners = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
            entry.update(vertices=len(obj.data.vertices), materials=[m.name if m else None for m in obj.data.materials], bounds_min=[min(v[i] for v in corners) for i in range(3)], bounds_max=[max(v[i] for v in corners) for i in range(3)])
        objects.append(entry)
    materials = []
    for mat in set(bpy.data.materials) - original_materials:
        nodes = []
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                item = {'type': node.type, 'name': node.name}
                if node.type == 'BSDF_PRINCIPLED':
                    item['base_color'] = list(node.inputs['Base Color'].default_value)
                if node.type == 'TEX_IMAGE' and node.image:
                    if node.image.filepath.lower().endswith('.exr'):
                        raise RuntimeError('Unexpected EXR in supplied USDZ; aborting without sampling it')
                    item['image'] = node.image.filepath
                nodes.append(item)
        materials.append({'name': mat.name, 'nodes': nodes})
    report = {'source': str(SOURCE), 'reflection_map_used': False, 'objects': objects, 'materials': materials}
    (OUT / 'geometry.json').write_text(json.dumps(report, indent=2))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in imported:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'supplied-iphone.glb'), export_format='GLB', use_selection=True, export_yup=True)
    print(json.dumps({'phone_export': str(OUT / 'supplied-iphone.glb'), 'objects': len(objects), 'report': str(OUT / 'geometry.json')}))
finally:
    bpy.context.window.scene = original_scene
    for obj in set(bpy.data.objects) - original_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(temporary)
    for mat in set(bpy.data.materials) - original_materials:
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    for img in set(bpy.data.images) - original_images:
        if img.users == 0:
            bpy.data.images.remove(img)
