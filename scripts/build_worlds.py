"""Author three original habitat dioramas and restoration props through Blender MCP.
Run: python scripts/blender_bridge.py scripts/build_worlds.py
Game coordinates: Y up. GLB export converts Blender Z up to game Y up.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models'; OUT.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'assets/blender'; SRC.mkdir(parents=True,exist_ok=True)
random.seed(51)
def clear():
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
 for d in list(bpy.data.meshes):
  if not d.users: bpy.data.meshes.remove(d)
def mat(name,c):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color=(*c,1); m.use_nodes=True
 m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1)
 m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.87
 return m
M={n:mat(n,c) for n,c in {'grass':(.28,.46,.17),'earth':(.21,.16,.09),'rock':(.39,.43,.34),'moss':(.24,.40,.12),'bark':(.24,.14,.065),'leaf':(.20,.37,.105),'flower':(.91,.65,.23),'water':(.16,.43,.41),'sand':(.57,.51,.30),'wood':(.51,.31,.13),'pink':(.79,.42,.47),'pale':(.76,.79,.49)}.items()}
def finish(o,n,m,scale):
 o.name=n; o.scale=scale; o.data.materials.append(M[m]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for p in o.data.polygons:p.use_smooth=True
 return o
def ell(n,p,s,m):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(p[0],-p[2],p[1]));return finish(bpy.context.object,n,m,s)
def cyl(n,p,r,h,m,verts=12):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=h,location=(p[0],-p[2],p[1]));return finish(bpy.context.object,n,m,(1,1,1))
def box(n,p,s,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(p[0],-p[2],p[1]));return finish(bpy.context.object,n,m,(s[0],s[2],s[1]))
def tree(x,z,s=1):
 cyl('Rooted trunk',(x,.95*s,z),.18*s,1.9*s,'bark')
 for a in range(5):
  t=a*math.tau/5; ell('Branch canopy',(x+math.cos(t)*.45*s,1.9*s+(a%2)*.35*s,z+math.sin(t)*.45*s),(.65*s,.65*s,.55*s),'leaf')
 for a in range(4):
  t=a*math.tau/4; ell('Exposed tree root',(x+math.cos(t)*.26*s,.08,z+math.sin(t)*.26*s),(.48*s,.11,.12*s),'bark').rotation_euler.z=t

def reeds(x,z):
 for i in range(5):
  a=i*2.4; cyl('Wetland reed',(x+math.cos(a)*.14,.4+i*.06,z+math.sin(a)*.14),.022,.8+i*.12,'leaf',6)
  ell('Reed seed head',(x+math.cos(a)*.14,.83+i*.12,z+math.sin(a)*.14),(.065,.065,.15),'bark')
def export(name):
 # One draw call per material: merge authored static meshes before export.
 for material in M.values():
  meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==material]
  if len(meshes)>1:
   bpy.ops.object.select_all(action='DESELECT')
   for obj in meshes: obj.select_set(True)
   bpy.context.view_layer.objects.active=meshes[0]
   bpy.ops.object.join()
   meshes[0].name=name+'_'+material.name
 bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(name+'.blend')),compress=True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
 print(name, len(bpy.data.objects),'objects', (OUT/(name+'.glb')).stat().st_size,'bytes')
for area in ['meadow','pond','grove']:
 clear()
 for key, color in {'grass': ((.43,.39,.18) if area=='grove' else (.28,.46,.17)), 'leaf': ((.57,.37,.10) if area=='grove' else (.20,.37,.105))}.items():
  M[key].diffuse_color=(*color,1)
  M[key].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1)
 cyl('Layered island soil',(0,-.34,0),6.7,.66,'earth',64)
 cyl('Walkable moss meadow',(0,-.035,0),6.8,.09,'grass' if area!='pond' else 'moss',64)
 for i in range(27):
  a=i*2.399; r=5.7+(i%3)*.32
  ell('Island rim stone',(math.cos(a)*r,.08,math.sin(a)*r),(.32+(i%4)*.06,.25,.23),'rock')
 if area=='meadow':
  for x,z in [(-4,-3),(4,-3),(-5,1),(3.8,3.7)]:
   for i in range(9):
    a=i*2.399; xx=x+math.cos(a)*.5; zz=z+math.sin(a)*.5
    cyl('Wildflower stem',(xx,.16,zz),.018,.32,'leaf',6)
    ell('Meadow flower',(xx,.34,zz),(.12,.12,.045),'flower' if i%2 else 'pink')
  tree(-4.7,-3.5,1.0);tree(4.8,-3.9,.8)
  for i in range(5):ell('Meadow stepping stone',(-2+i*.8,.04,4.7),(.33,.28,.08),'sand')
 elif area=='pond':
  ell('Pond sandy bank',(0,-.03,-4.3),(2.9,1.65,.13),'sand')
  ell('Still pond water',(0,.035,-4.3),(2.6,1.35,.06),'water')
  for i in range(7):
   a=i*2.4;ell('Lily pad',(math.cos(a)*1.9,.11,-4.3+math.sin(a)*.8),(.24,.20,.025),'leaf')
  for x,z in [(-2.7,-4),(2.5,-4.8),(-1.5,-5.6),(3.7,2.8)]:reeds(x,z)
  tree(-4.8,-2,.8);tree(4.7,-3.6,.75)
  for i in range(5):box('Pond boardwalk',(-2+i*.8,.08,4.8),(.76,.12,.8),'wood')
 else:
  for x,z,s in [(-4.7,-3,1.3),(0,-5.5,1.45),(4.8,-3.8,1.15),(-5,2.8,1.05),(4.9,3.3,1.1)]:tree(x,z,s)
  for i in range(12):
   a=i*2.4; r=4.2+(i%3)*.5;ell('Ancient moss mound',(math.cos(a)*r,.07,math.sin(a)*r),(.55,.43,.18),'moss')
  log=cyl('Nurse log',(-2,.25,-4),.3,2.0,'bark');log.rotation_euler.y=math.pi/2
 export('habitat-'+area)
# Export independent restoration and shop props, mounted by IDs in World.
for name in ['wildflowers','birdbath','lantern','compost','pond-cleanup','tree-nursery','pollinator-garden','bench','bridge','lilies']:
 clear()
 if name=='bench':
  for x in [-.65,.65]:
   box('Bench leg',(x,.25,0),(.14,.5,.55),'bark')
  for z in [-.25,0,.25]:box('Seat slat',(0,.53,z),(1.8,.12,.2),'wood')
  box('Bench back',(0,.92,-.29),(1.8,.38,.10),'wood')
 elif name=='bridge':
  for i in range(11):
   x=(i-5)*.48; h=.18+.24*math.sin(i/10*math.pi)
   box('Bridge deck plank',(x,h,0),(.45,.13,.85),'wood')
   if i%2==0:
    for z in [-.48,.48]:box('Bridge railing post',(x,h+.36,z),(.09,.8,.09),'bark')
  for z in [-.48,.48]:box('Bridge handrail',(0,.96,z),(5.1,.08,.09),'wood')
 elif name=='lilies':
  for i in range(7):
   a=i*2.4;x=math.cos(a)*.75;z=math.sin(a)*.5
   ell('Restored lily pad',(x,.13,z),(.26,.22,.025),'leaf')
   if i%2==0:
    for k in range(5):
     t=k*math.tau/5;ell('Water lily petal',(x+math.cos(t)*.07,.18,z+math.sin(t)*.07),(.085,.06,.04),'pink')
 elif name=='birdbath':
  cyl('Stone pedestal',(0,.4,0),.13,.8,'rock');cyl('Basin',(0,.82,0),.48,.12,'rock',24);cyl('Basin water',(0,.89,0),.39,.025,'water',24)
 elif name=='lantern':
  cyl('Lantern post',(0,.7,0),.055,1.4,'bark');box('Amber lantern',(0,1.23,0),(.32,.4,.32),'flower');box('Lantern roof',(0,1.48,0),(.44,.09,.44),'wood')
 elif name=='compost':
  for z in [-.4,.4]:
   for y in [.13,.34,.55]:box('Compost slat',(0,y,z),(.95,.16,.10),'wood')
  for x in [-.43,.43]:box('Compost end',(x,.3,0),(.1,.6,.85),'wood')
  ell('Rich compost',(0,.38,0),(.4,.35,.25),'earth')
 elif name=='tree-nursery':
  for x in [-.55,.55]:
   box('Raised nursery bed',(x,.12,0),(.8,.24,.85),'wood');tree(x,0,.35)
 elif name=='pond-cleanup':
  for x in [-.5,0,.5]:reeds(x,0)
  ell('Restored bank',(0,-.04,0),(1,.6,.13),'sand')
 else:
  for i in range(13):
   a=i*2.399; r=.2+(i%3)*.18; x=math.cos(a)*r;z=math.sin(a)*r
   cyl('Pollinator stem',(x,.23,z),.018,.46,'leaf',6)
   ell('Nectar blossom',(x,.48,z),(.14,.14,.06),'pink' if i%2 else 'flower')
 export('prop-'+name)
print('All habitat and restoration assets authored through Blender MCP.')
