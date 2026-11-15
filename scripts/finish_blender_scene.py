"""Add editable expression reference faces and a studio to the .blend source.
GLBs use the app's live Face rig instead of these static reference expressions.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]

def simple_material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat

black = simple_material('Reference glossy eyes', (.008,.016,.01), .12)
white = simple_material('Reference catchlights', (.9,.98,.89), .25)
face_collection = bpy.data.collections.get('Expression references') or bpy.data.collections.new('Expression references')
if face_collection.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(face_collection)

def face_sphere(name, pos, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=(pos[0],-pos[2],pos[1]))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0],scale[2],scale[1])
    obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth = True
    for collection in list(obj.users_collection): collection.objects.unlink(obj)
    face_collection.objects.link(obj)

for x,y,z,spread in [(-3.2,.96,.72,.36),(0,.81,.80,.36),(3.2,1.32,.56,.31)]:
    for side in [-1,1]:
        face_sphere('Reference eye',(x+side*spread,y+.1,z),(.15,.17,.09),black)
        face_sphere('Reference glint',(x+side*spread-.045,y+.16,z+.075),(.044,.05,.02),white)
    curve=bpy.data.curves.new('Reference smile','CURVE')
    curve.dimensions='3D'
    curve.bevel_depth=.018
    curve.bevel_resolution=3
    spline=curve.splines.new('POLY')
    spline.points.add(24)
    for i,point in enumerate(spline.points):
        a=math.pi+math.pi*i/24
        point.co=(x+.1*math.cos(a),-(z+.05),y-.09+.1*math.sin(a),1)
    obj=bpy.data.objects.new('Reference smile',curve)
    face_collection.objects.link(obj)
    curve.materials.append(black)

# Name source collections so each character is easy to select and edit.
for name,x in [('Leafling',-3.2),('Mossy',0),('Sunbud',3.2)]:
    collection=bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH' and obj.name not in face_collection.objects and abs(obj.location.x-x)<1:
            for old in list(obj.users_collection): old.objects.unlink(obj)
            collection.objects.link(obj)

scene=bpy.context.scene
scene.world.color=(.12,.15,.10)
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1600
scene.render.resolution_y=900
scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(0,-16,6.6))
camera=bpy.context.object
camera.name='Botanical studio camera'
camera.rotation_euler=(Vector((0,0,1.25))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=10.5
scene.camera=camera
for name,loc,energy,size in [('Key',(-4,-5,7),850,5),('Fill',(5,-3,5),600,4),('Rim',(0,4,6),1000,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    light=bpy.context.object
    light.name=name
    light.data.energy=energy
    light.data.shape='DISK'
    light.data.size=size
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
# Packed source is portable. No external image dependencies.
scene.render.filepath=str(ROOT/'assets/blender/character-studio.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/botanical-pets.blend'),compress=True)
print('Saved editable studio and expression reference faces.')
