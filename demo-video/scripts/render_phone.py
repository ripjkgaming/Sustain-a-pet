"""Render the supplied model in a temporary Blender MCP scene, with area lights only."""
import bpy
import json
from pathlib import Path
from mathutils import Vector
ROOT = Path('/home/ripjk/sustain-a-pet/demo-video/assets/phone')
original = bpy.context.window.scene
before = {kind: set(getattr(bpy.data, kind)) for kind in ['objects', 'materials', 'images', 'worlds', 'cameras', 'lights', 'meshes']}
scene = bpy.data.scenes.new('DEMO_PHONE_RENDER_TEMP')
try:
    bpy.context.window.scene = scene
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'supplied-iphone.glb'))
    world = bpy.data.worlds.new('Demo phone studio flat world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.15,.18,.14,1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .45
    scene.world = world
    camera_data = bpy.data.cameras.new('Phone orthographic camera')
    camera = bpy.data.objects.new('Phone orthographic camera', camera_data)
    scene.collection.objects.link(camera)
    camera.location = (0,-.4,0)
    camera.rotation_euler = (Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = .17
    camera_data.clip_start = .001
    scene.camera = camera
    for name, position, power, size, colour in [('Key',(-.12,-.18,.15),12,.15,(1,.93,.82)),('Rim',(.15,.02,.07),16,.12,(.8,.9,1)),('Fill',(.08,-.12,-.12),5,.1,(.9,1,.88))]:
        data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size; data.color=colour
        obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=position
        obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.render.resolution_x=800; scene.render.resolution_y=1600; scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='Standard'
    scene.render.filepath=str(ROOT/'phone-front.png')
    bpy.ops.render.render(write_still=True)
    (ROOT/'screen-mapping.json').write_text(json.dumps({'image':[800,1600],'camera':'orthographic front, original model +Z up, front -Y','ortho_height_m':.17,'screen_rect_px':[82.164,114.55,635.672,1370.90],'screen_bounds_m':[-.03377008,.03377008,-.07282908,.07282908],'reflection_map_used':False,'note':'Rectangle encloses Display bounds; rounded screen outline must be checked against rendered model.'},indent=2))
    print('Rendered supplied phone plate without EXR; original scene restored after render.')
finally:
    bpy.context.window.scene=original
    for obj in set(bpy.data.objects)-before['objects']: bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(scene)
    for kind in ['materials','images','worlds','cameras','lights','meshes']:
        for item in set(getattr(bpy.data,kind))-before[kind]:
            if item.users==0: getattr(bpy.data,kind).remove(item)
