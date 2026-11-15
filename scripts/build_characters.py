"""Reproducible botanical pet assets. Execute through blender_bridge.py.
Coordinates in helpers are game coordinates (Y up, +Z facing the viewer).
Textures are generated locally and embedded in each GLB; no remote assets.
"""
import bpy
import math
import random
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
random.seed(19)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for image in list(bpy.data.images):
    if image.name != 'Render Result': bpy.data.images.remove(image)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)

def xyz(p):
    return (p[0], -p[2], p[1])

def texture_material(name, color, roughness, grain=0.08, scale=12):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Specular IOR Level'].default_value = 0.28
    n = 256
    yy, xx = np.mgrid[0:n, 0:n] / n
    noise = np.random.default_rng(23).random((n, n))
    height = (np.sin(xx*scale*6.28 + np.sin(yy*30)*2) * np.sin(yy*scale*5.2) * .25
              + np.sin(xx*70 + yy*52)*.1 + noise*.32)
    if 'bark' in name:
        height += np.sin(xx*400 + np.sin(yy*12)*5)*.18
    pixels = np.ones((n, n, 4), dtype=np.float32)
    for c in range(3):
        pixels[:, :, c] = np.clip(color[c] * (0.79 + height*.38) + noise*grain, 0, 1)
    image = bpy.data.images.new(name + '_albedo', width=n, height=n)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    gy, gx = np.gradient(height)
    normals = np.stack((-gx*2.5, -gy*2.5, np.ones_like(gx)), axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    pixels[:, :, :3] = normals*.5+.5
    normal = bpy.data.images.new(name + '_micro_normal', width=n, height=n)
    normal.colorspace_settings.name = 'Non-Color'
    normal.pixels.foreach_set(pixels.ravel())
    normal.pack()
    normal_tex = nodes.new('ShaderNodeTexImage')
    normal_tex.image = normal
    normal_node = nodes.new('ShaderNodeNormalMap')
    normal_node.inputs['Strength'].default_value = .32
    links.new(normal_tex.outputs['Color'], normal_node.inputs['Color'])
    links.new(normal_node.outputs['Normal'], bsdf.inputs['Normal'])
    return mat

mats = {
    'skin': texture_material('chlorophyll_skin', (.25,.53,.16), .64, .035, 18),
    'belly': texture_material('pale_leaf_belly', (.62,.72,.34), .72, .02, 15),
    'leaf': texture_material('waxy_leaf', (.095,.34,.075), .48, .018, 9),
    'vein': texture_material('leaf_vein', (.40,.57,.13), .6, .01),
    'moss': texture_material('forest_moss', (.16,.32,.07), .94, .06, 30),
    'bark': texture_material('root_bark', (.26,.20,.09), .9, .04, 8),
    'cap': texture_material('mushroom_russet', (.65,.14,.055), .57, .025, 13),
    'stem': texture_material('mushroom_ivory', (.75,.66,.45), .83, .025, 24),
    'gold': texture_material('golden_petals', (.96,.46,.035), .57, .025, 10),
    'seed': texture_material('pollen_seed', (.37,.19,.035), .86, .045, 25),
}
current = []

def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mats[mat])
    for face in obj.data.polygons:
        face.use_smooth = True
    current.append(obj)
    return obj

def sphere(name, p, s, mat, detail=32, organic=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=detail, ring_count=detail//2, location=xyz(p))
    obj = bpy.context.object
    obj.scale = (s[0],s[2],s[1])
    if organic:
        for v in obj.data.vertices:
            a = v.co
            f = 1 + organic*(math.sin(a.x*19+a.z*7)*math.sin(a.y*23-a.z*9)*.5 + math.sin(a.z*37+a.x*11)*.25)
            v.co *= f
    return finish(obj, name, mat)

def tube(name, pts, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 0
    curve.resolution_u = 3
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(pts)-1)
    for point, p in zip(spline.bezier_points,pts):
        point.co = xyz(p)
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return finish(obj,name,mat)

def leaf(name, base, length, width, angle=0, mat='leaf', veins=True):
    # A cupped, curled lamina, with serrated margins and explicit UVs.
    verts, faces, uv = [], [], []
    def point(t,u,offset=0):
        w=width*math.sin(math.pi*t)**.78*(1+.035*math.sin(t*70))
        x=u*w
        y=t*length
        z=.16*length*math.sin(math.pi*t)-.16*length*t*t + u*u*.065*length + offset
        return (base[0]+x*math.cos(angle)-y*math.sin(angle), base[1]+x*math.sin(angle)+y*math.cos(angle), base[2]+z)
    for j in range(25):
        for i in range(9):
            t=max(.001,min(.999,j/24))
            u=i/4-1
            verts.append(xyz(point(t,u)))
            uv.append((i/8,j/24))
    for j in range(24):
        for i in range(8):
            a=j*9+i
            faces.append((a,a+1,a+10,a+9))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.uv_layers.new()
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            mesh.uv_layers.active.data[li].uv=uv[mesh.loops[li].vertex_index]
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj,name,mat)
    # Double-sided material survives glTF export.
    mats[mat].use_backface_culling=False
    if veins:
        tube(name+'_rib',[point(t,0,.008) for t in [.02,.25,.5,.75,.96]],.008,'vein')
        for t in [.22,.38,.54,.70]:
            for side in [-1,1]:
                tube(name+'_vein',[point(t,0,.009),point(t+.07,side*.45,.009),point(t+.15,side*.88,.009)],.003,'vein')
    return obj

def join_since(start,name,pivot=(0,0,0)):
    objects=current[start:]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=name
    bpy.context.scene.cursor.location=xyz(pivot)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    current[start:]=[obj]
    return obj

def feet(width,mat='skin'):
    for side in [-1,1]:
        sphere('root_foot',(side*width,.12,.28),(.23,.13,.34),mat,32,.035)
        for i in range(3):
            tube('toe_groove',[(side*width+(i-1)*.065,.145,.40),(side*width+(i-1)*.07,.11,.57)],.009,'bark')

def export(name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in current: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models'/f'{name}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
    # Move the source models apart for an editable Blender collection overview.
    for obj in current: obj.location.x += {'leafling':-3.2,'mossy':0,'sunbud':3.2}[name]
    print(name, 'objects', len(current))
    current.clear()

# Leafling: a living seed pod with a ribbed cuticle, rooted feet and fine leaf veins.
sphere('body',(0,.83,0),(.85,.81,.73),'skin',64,.025)
sphere('belly',(0,.62,.58),(.54,.48,.16),'belly',48,.012)
feet(.34)
for side in [-1,1]:
    sphere('arm',(side*.79,.72,.09),(.14,.29,.15),'skin',32,.025)
join_since(0,'body_leafling')
for i,(angle,length,base) in enumerate([(0,.95,(0,1.58,0)),(.7,.82,(-.09,1.56,-.07)),(-.7,.82,(.09,1.56,-.07))]):
    start=len(current)
    leaf('lamina',base,length,.28,angle)
    join_since(start,f'growth_{i}_foliage_leaf',base)
start=len(current)
for i in range(7):
    a=i*math.tau/7
    leaf('crown',(.48*math.sin(a),1.48,.35*math.cos(a)-.12),.48,.12,-math.sin(a)*.8,'gold')
join_since(start,'growth_3_foliage_crown',(0,1.5,0))
export('leafling')

# Mossy: soil body, velvet moss tufts, shelf fungi with radial gills.
sphere('body',(0,.75,0),(.98,.72,.83),'skin',64,.05)
sphere('belly',(0,.51,.69),(.58,.36,.14),'belly',48,.025)
feet(.43,'bark')
join_since(0,'body_mossy')
for stage in range(4):
    start=len(current)
    for i in range(90):
        a=random.random()*math.tau
        r=math.sqrt(random.random())*.8
        x,z=math.cos(a)*r,math.sin(a)*r*.8-.12
        y=.76+.70*math.sqrt(max(.05,1-(x/.98)**2-(z/.85)**2))
        sphere('moss_cushion',(x,y,z),(.045,.035,.045),'moss',12,.12)
        for k in range(3):
            h=random.uniform(.035,.09)
            tube('moss_filament',[(x,y,z),(x+.01,y+h,z+.01),(x+.025,y+h+.018,z)],.0035,'moss')
    join_since(start,f'growth_{stage}_moss')
for i,(x,z,h,r) in enumerate([(-.38,-.22,.38,.32),(.43,-.30,.30,.25),(.03,-.53,.48,.34)]):
    start=len(current)
    base=(x,1.38,z)
    tube('stipe',[base,(x-.02,1.38+h*.5,z),(x+.025,1.38+h,z)],.055,'stem')
    # Cap upper and lower surfaces form a closed lens.
    sphere('cap',(x,1.38+h,z),(r,r*.37,r),'cap',48,.028)
    for j in range(32):
        a=j*math.tau/32
        tube('gill',[(x+math.cos(a)*.06,1.38+h-.03,z+math.sin(a)*.06),(x+math.cos(a)*r*.58,1.38+h-.10,z+math.sin(a)*r*.58),(x+math.cos(a)*r*.94,1.38+h-.035,z+math.sin(a)*r*.94)],.005,'stem')
    for j in range(12):
        a=j*2.39996
        r2=r*math.sqrt((j+.5)/13)*.87
        sphere('cap_scale',(x+math.cos(a)*r2,1.38+h+r*.37*math.sqrt(1-(r2/r)**2),z+math.sin(a)*r2),(.025,.008,.02),'stem',12)
    join_since(start,f'growth_{i}_foliage_mushroom',base)
start=len(current)
for i in range(6):
    a=i*math.tau/6
    x,z=math.cos(a)*.68,math.sin(a)*.58
    for j in range(5):
        p=j*math.tau/5
        sphere('flower_petal',(x+math.cos(p)*.06,1.3+math.sin(p)*.06,z),(.045,.05,.02),'stem',12)
    sphere('pollen',(x,1.3,z+.02),(.035,.035,.025),'gold',12)
join_since(start,'growth_3_flowers')
export('mossy')

# Sunbud: sunflower florets, concentric petal whorls and a green calyx.
sphere('body',(0,.46,0),(.39,.43,.34),'skin',48,.025)
feet(.21)
sphere('face_disc',(0,1.31,0),(.77,.77,.57),'gold',64,.018)
join_since(0,'body_sunbud')
start=len(current)
# Seed spirals stay outside the expressive central face area.
for i in range(210):
    a=i*2.399963
    r=.58+.17*((i/210)**.7)
    x,y=math.cos(a)*r,math.sin(a)*r
    z=.57*math.sqrt(max(.02,1-(r/.79)**2))
    seed=sphere('floret',(x,1.31+y,z),(.021,.028,.018),'seed' if i%4 else 'gold',12)
    seed.rotation_euler[1]=-a
join_since(start,'seed_florets')
for stage in range(4):
    start=len(current)
    for i in range(8+stage*2):
        a=(i/(8+stage*2))*math.tau + stage*.21
        # Each additional growth stage adds a deeper whorl.
        length=.53+stage*.025
        base=(-math.sin(a)*.59,1.31+math.cos(a)*.59,-.13-stage*.035)
        leaf('petal',base,length,.15,a,'gold',False)
        for side in [-1,1]:
            # Fine longitudinal petal ridges.
            end=(base[0]-math.sin(a)*length*.85+side*.025,base[1]+math.cos(a)*length*.85,base[2]+.025)
            tube('petal_ridge',[base,end],.0025,'vein')
    join_since(start,f'growth_{stage}_foliage_petals',(0,1.31,-.13))
for side in [-1,1]:
    start=len(current)
    base=(side*.30,.52,0)
    leaf('arm_leaf',base,.57,.19,-side*1.17)
    join_since(start,f'foliage_arm_{side}',base)
start=len(current)
leaf('sprout',(0,2.04,.06),.44,.14,-.18)
join_since(start,'foliage_sprout',(0,2.04,.06))
start=len(current)
for i in range(9):
    a=i*math.tau/9
    sphere('crown_pollen',(.40*math.cos(a),2.55,.40*math.sin(a)),(.045,.045,.045),'gold',16)
join_since(start,'growth_3_crown',(0,2.55,0))
export('sunbud')

import runpy
runpy.run_path(str(ROOT/'scripts/finish_blender_scene.py'))
print('All three assets exported with packed albedo and normal textures.')
