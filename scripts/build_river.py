"""Author the four original river assets through the running Blender MCP addon.
Run: python scripts/blender_bridge.py scripts/build_river.py
All modelling coordinates are game X/Y/Z (Y up); Blender uses (X, -Z, Y).
Fresh scenes, shared Principled materials, no textures or downloaded content.
The bridge keeps independent animation pivots; other static meshes merge by material.
"""
import bpy, bmesh, json, math, random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models'
SRC = ROOT / 'assets/blender'
QA = Path('/tmp/sustain-a-pet-river-review')
for folder in (OUT, SRC, QA):
    folder.mkdir(parents=True, exist_ok=True)
NAMES = ('prop-footbridge', 'river-bank', 'prop-reeds', 'prop-river-stones')
REPORT = {}
M = {}


def xyz(p):
    return (p[0], -p[2], p[1])


def hex_linear(value):
    rgb = [int(value[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb)


def mat(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    node = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = .87
    return m


def fresh():
    global M
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(51)
    # The numerical linear colours below exactly match build_worlds.py.
    colors = {'grass': (.28, .46, .17), 'earth': (.21, .16, .09),
              'rock': (.39, .43, .34), 'moss': (.24, .40, .12),
              'leaf': (.20, .37, .105), 'bark': (.24, .14, .065),
              'stone-light': (.47, .50, .41), 'stone-dark': (.32, .37, .30)}
    colors.update({key: hex_linear(c) for key, c in {
        'wood': '#9a6a3c', 'wood-dark': '#8a5c32',
        'wood-light': '#a87846', 'rope': '#d9c28a'}.items()})
    M = {key: mat('River ' + key, color) for key, color in colors.items()}


def finish(o, name, material, smooth=True):
    o.name = name
    o.data.materials.append(M[material])
    for poly in o.data.polygons:
        poly.use_smooth = smooth
    return o


def mesh(name, verts, faces, material, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(v) for v in verts], [], faces)
    data.update()
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    return finish(o, name, material, smooth)


def recalc(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(o.data)
    bm.free()


def context():
    window = bpy.context.window_manager.windows[0]
    return bpy.context.temp_override(window=window, screen=window.screen,
                                    scene=window.scene, view_layer=window.view_layer)


def bevel(o, amount=.015):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    mod = o.modifiers.new('Soft worn edges', 'BEVEL')
    mod.width = amount
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in o.data.polygons:
        poly.use_smooth = True
    normal = o.modifiers.new('Broad face normals', 'WEIGHTED_NORMAL')
    normal.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=normal.name)
    o.select_set(False)
    return o


def box(name, p, size, material, rounding=.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p))
    o = bpy.context.object
    o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(o, name, material, False)
    return bevel(o, rounding) if rounding else o


def ell(name, p, size, material, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=xyz(p))
    o = bpy.context.object
    o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, material)


def join(objects, name, pivot=(0, 0, 0)):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.context.scene.cursor.location = xyz(pivot)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    o.select_set(False)
    return o


def ribbon(name, xs, zs, top, thickness, material, rounding=.01):
    # Closed longitudinal prism, continuous gentle arch with no overlapping joints.
    verts = []
    for z in zs:
        for x, y in ((xs[0], top(z)-thickness), (xs[1], top(z)-thickness),
                     (xs[1], top(z)), (xs[0], top(z))):
            verts.append((x, y, z))
    faces = [(3, 2, 1, 0)]
    for i in range(len(zs)-1):
        a, b = i*4, (i+1)*4
        for j in range(4):
            faces.append((a+j, a+(j+1)%4, b+(j+1)%4, b+j))
    k = (len(zs)-1)*4
    faces.append((k, k+1, k+2, k+3))
    o = mesh(name, verts, faces, material)
    recalc(o)
    return bevel(o, rounding) if rounding else o


def deck(z):
    return .14 + .18 * (1 - (z / 2.1) ** 2)


def footbridge():
    pitch = 4.2 / 11
    for i in range(11):
        hi = 2.1-i*pitch - (.011 if i else 0)
        lo = 2.1-(i+1)*pitch + (.011 if i < 10 else 0)
        z = (hi+lo)/2
        o = ribbon('plank_%02d' % i, (-.6, .6), [lo, z, hi], deck, .095,
                   ('wood', 'wood-light', 'wood', 'wood-dark')[i % 4], .012)
        join([o], o.name, (0, (deck(lo)+deck(hi))/2-.0475, z))
    zs = [-2.1 + i*4.2/12 for i in range(13)]
    for x, side in ((-.445, 'l'), (.445, 'r')):
        o = ribbon('beam_' + side, (x-.067, x+.067), zs,
                   lambda z: deck(z)-.087, .14, 'wood-dark', .012)
        # A few small smooth patches tucked onto outer beam sides.
        patches = [o]
        for j, z in enumerate((-.92, -.15, 1.25)):
            patches.append(ell('Beam moss', (x + (-.066 if x < 0 else .066),
                                             deck(z)-.13, z),
                               (.018, .046, .12+j*.02), 'moss', 1))
        join(patches, 'beam_' + side)
    parts = []
    for x in (-.525, .525):
        parts.append(ribbon('Curved handrail', (x-.06, x+.06),
                            [-1.92+i*3.84/8 for i in range(9)],
                            lambda z: deck(z)+.68, .085, 'wood-light', .018))
        for z in (-1.79, 0, 1.79):
            parts.append(box('Railing post', (x, deck(z)+.285, z),
                             (.095, .75, .105), 'wood-dark', .014))
            parts.append(box('Post cap', (x, deck(z)+.674, z),
                             (.118, .055, .128), 'wood', .014))
            # One compact rope collar per post, all included in the rails node.
            bpy.ops.mesh.primitive_torus_add(major_radius=.058, minor_radius=.012,
                major_segments=10, minor_segments=4, location=xyz((x, deck(z)+.52, z)))
            parts.append(finish(bpy.context.object, 'Rope binding', 'rope'))
    join(parts, 'rails')


def bank():
    # Both end profiles match exactly, including height and tangent. Tiles abut on X.
    xs = [-1.7+i*3.4/16 for i in range(17)]
    def water_edge(x):
        return -.075 * (1 + math.cos(math.tau*x/1.7))
    verts, faces = [], []
    # Exposed earth runs below waterline; land is on game -Z, water on +Z.
    for x in xs:
        edge = water_edge(x)
        for y, z in ((-.25, edge+.12), (-.25, -.78), (.19, -.78),
                     (.20, edge-.09), (.075, edge+.055), (-.055, edge+.12)):
            verts.append((x, y, z))
    faces.append(tuple(reversed(range(6))))
    for i in range(16):
        for j in range(6):
            faces.append((i*6+j, i*6+(j+1)%6, (i+1)*6+(j+1)%6, (i+1)*6+j))
    faces.append(tuple(16*6+j for j in range(6)))
    soil = mesh('bank_soil', verts, faces, 'earth')
    recalc(soil)
    # A thin, rounded grassy overhang follows the same curved shore.
    verts, faces = [], []
    for x in xs:
        e = water_edge(x)
        for y, z in ((.18, -.78), (.235, -.78), (.235, e-.12),
                     (.195, e-.025), (.145, e-.03)):
            verts.append((x, y, z))
    faces.append(tuple(reversed(range(5))))
    for i in range(16):
        for j in range(5):
            faces.append((i*5+j, i*5+(j+1)%5, (i+1)*5+(j+1)%5, (i+1)*5+j))
    faces.append(tuple(16*5+j for j in range(5)))
    grass = mesh('bank_grassy_lip', verts, faces, 'grass', True)
    recalc(grass)
    for j, (x, z, size) in enumerate(((-1.15, -.055, .16), (-.78, .01, .12),
                                     (.44, -.02, .18), (1.25, -.11, .13))):
        ell('Bank pebble', (x, .08, z), (size, .11, size*.76), 'rock')
    for x in (-1.3, -.35, .9):
        ell('Bank moss', (x, .23, water_edge(x)-.24), (.18, .022, .10), 'moss', 1)


def tube(name, points, radii, material, sides=6):
    verts = []
    for p, r in zip(points, radii):
        for j in range(sides):
            a = math.tau*j/sides
            verts.append((p[0]+r*math.cos(a), p[1], p[2]+r*math.sin(a)))
    faces = [tuple(reversed(range(sides)))]
    for i in range(len(points)-1):
        for j in range(sides):
            faces.append((i*sides+j, i*sides+(j+1)%sides,
                          (i+1)*sides+(j+1)%sides, (i+1)*sides+j))
    faces.append(tuple((len(points)-1)*sides+j for j in range(sides)))
    o = mesh(name, verts, faces, material, True)
    recalc(o)
    return o


def leaf(name, base, height, lean, material):
    # Solid tapered diamond-section blade, readable from either side in three.js.
    verts = []
    for t, width in ((0, .009), (.30, .028), (.68, .021), (1, .001)):
        x = base[0]+lean[0]*t*t
        z = base[2]+lean[1]*t*t
        y = base[1]+height*t
        verts.extend(((x-width, y, z), (x, y, z-.006),
                      (x+width, y, z), (x, y, z+.006)))
    faces = [(3, 2, 1, 0)]
    for i in range(3):
        for j in range(4):
            faces.append((i*4+j, i*4+(j+1)%4, (i+1)*4+(j+1)%4, (i+1)*4+j))
    faces.append((12, 13, 14, 15))
    o = mesh(name, verts, faces, material, True)
    recalc(o)
    return o


def reeds():
    for i, (x, z, h, lx, lz) in enumerate(((-.11, -.055, 1.0, -.075, .015),
                                           (.10, .035, .89, .055, -.035))):
        tip = (x+lx, h, z+lz)
        tube('Cattail stem %d' % i,
             [(x, 0, z), (x+lx*.25, h*.46, z+lz*.25), tip],
             [.015, .012, .007], 'leaf')
        points = [(x+lx*t*t, h*t, z+lz*t*t) for t in (.73, .76, .86, .91)]
        tube('Cattail head %d' % i, points, [.026, .043, .043, .023], 'bark', 8)
    for i in range(9):
        a = i*2.399
        x, z = math.cos(a)*.10, math.sin(a)*.09
        leaf('Reed blade', (x, 0, z), .47+(i%4)*.10,
             (.12*math.cos(a), .14*math.sin(a)), 'leaf' if i%3 else 'grass')


def stones():
    # Conservative disjoint XZ bounding rectangles guarantee no rock intersections.
    specs = [(-.56, -.34, .34, .24, .17), (.20, -.40, .33, .27, .13),
             (.66, .20, .25, .23, .16), (-.02, .34, .32, .26, .14),
             (-.70, .29, .23, .21, .11)]
    for i, (x, z, rx, rz, h) in enumerate(specs):
        o = ell('river_stone_%02d' % i, (x, h*.68, z), (rx, h, rz),
                ('rock', 'stone-light', 'rock', 'stone-dark', 'stone-light')[i])
        # A broad slightly flattened crown with rounded low-poly shoulders.
        for v in o.data.vertices:
            if v.co.z > h*.55:
                v.co.z = h*.55+(v.co.z-h*.55)*.32
        o.data.update()
    # Centre the complete horizontal cluster bbox on the origin, and ground all rocks.
    objects = list(bpy.context.scene.objects)
    coords = [o.matrix_world @ Vector(v) for o in objects for v in o.bound_box]
    shift_x = (min(v.x for v in coords)+max(v.x for v in coords))/2
    shift_y = (min(v.y for v in coords)+max(v.y for v in coords))/2
    for o in objects:
        o.location.x -= shift_x
        o.location.y -= shift_y
        low = min((o.matrix_world @ Vector(v)).z for v in o.bound_box)
        o.location.z -= low


def bounds():
    bpy.context.view_layer.update()
    points = [o.matrix_world @ Vector(v) for o in bpy.context.scene.objects
              if o.type == 'MESH' for v in o.bound_box]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    # Convert imported Blender world bounds back to game X/Y/Z.
    game_low, game_high = [low[0], low[2], -high[1]], [high[0], high[2], -low[1]]
    return {'min': [round(v, 5) for v in game_low],
            'max': [round(v, 5) for v in game_high],
            'size': [round(b-a, 5) for a, b in zip(game_low, game_high)]}


def export(name):
    if name != 'prop-footbridge':
        for material in M.values():
            objects = [o for o in bpy.context.scene.objects if o.type == 'MESH'
                       and o.data.materials and o.data.materials[0] == material]
            if objects:
                join(objects, name+'_'+material.name.removeprefix('River '))
    bpy.ops.object.select_all(action='DESELECT')
    # Remove unused materials, keeping each standalone source tidy.
    for material in list(bpy.data.materials):
        if not material.users:
            bpy.data.materials.remove(material)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(name+'.blend')), compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')), export_format='GLB',
        export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
    print('EXPORTED', name, bounds(), (OUT/(name+'.glb')).stat().st_size, 'bytes')


def validate(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with context():
        bpy.ops.import_scene.gltf(filepath=str(OUT/(name+'.glb')))
    info = bounds()
    info['bytes'] = (OUT/(name+'.glb')).stat().st_size
    info['triangles'] = sum(len(p.vertices)-2 for o in bpy.context.scene.objects
                            if o.type == 'MESH' for p in o.data.polygons)
    info['nodes'] = sorted(o.name for o in bpy.context.scene.objects)
    assert all(o.type == 'MESH' for o in bpy.context.scene.objects)
    assert not any(o.animation_data for o in bpy.context.scene.objects)
    assert info['triangles'] < 6000, info
    assert info['bytes'] < 120000, info
    if name == 'prop-footbridge':
        assert abs(info['size'][0]-1.2) < .005 and abs(info['size'][2]-4.2) < .005, info
        assert set(info['nodes']) == {'plank_%02d' % i for i in range(11)} | {'rails', 'beam_l', 'beam_r'}
        pivots = []
        for i in range(11):
            o = bpy.data.objects['plank_%02d' % i]
            ps = [o.matrix_world @ Vector(v) for v in o.bound_box]
            center = (Vector(tuple(min(p[k] for p in ps) for k in range(3))) +
                      Vector(tuple(max(p[k] for p in ps) for k in range(3))))/2
            assert (o.location-center).length < .008, (o.name, o.location, center)
            pivots.append(round(-o.location.y, 5))
        assert all(a > b for a, b in zip(pivots, pivots[1:]))
        info['plank_pivots_z'] = pivots
    if name == 'prop-river-stones':
        rock_bounds = []
        for o in bpy.context.scene.objects:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
            pending = set(bm.verts)
            while pending:
                seed = pending.pop()
                component, stack = [seed], [seed]
                while stack:
                    v = stack.pop()
                    for edge in v.link_edges:
                        neighbor = edge.other_vert(v)
                        if neighbor in pending:
                            pending.remove(neighbor)
                            component.append(neighbor)
                            stack.append(neighbor)
                points = [o.matrix_world @ v.co for v in component]
                rock_bounds.append(([min(p[k] for p in points) for k in range(3)],
                                    [max(p[k] for p in points) for k in range(3)]))
            bm.free()
        assert len(rock_bounds) == 5, len(rock_bounds)
        gaps = []
        for i, (a, b) in enumerate(rock_bounds):
            for c, d in rock_bounds[i+1:]:
                gap = max(c[0]-b[0], a[0]-d[0], c[1]-b[1], a[1]-d[1])
                assert gap > 0, 'Overlapping river stone footprints'
                gaps.append(gap)
        info['rock_count'] = len(rock_bounds)
        info['minimum_footprint_gap'] = round(min(gaps), 5)
    REPORT[name] = info
    print('REIMPORT', name, json.dumps(info))
    return info


def review(name):
    """Render the actual re-imported GLB from three angles; studio is temporary."""
    scene = bpy.context.scene
    b = bounds()
    center = Vector(xyz(tuple((a+c)/2 for a, c in zip(b['min'], b['max']))))
    span = max(b['size'])
    scene.render.resolution_x = 800
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('Review studio')
    scene.world.use_nodes = True
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (.18, .21, .24, 1)
    bg.inputs['Strength'].default_value = .6
    for p, power, size in (((-3, -4, 7), 650, 5), ((4, 2, 5), 500, 4), ((-2, 4, 3), 350, 3)):
        data = bpy.data.lights.new('Review softbox', 'AREA')
        data.energy, data.shape, data.size = power, 'DISK', size
        o = bpy.data.objects.new('Review softbox', data)
        scene.collection.objects.link(o)
        o.location = center+Vector(p)
        o.rotation_euler = (center-o.location).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('Review camera')
    cam.type = 'ORTHO'
    cam.ortho_scale = span*1.28
    camera = bpy.data.objects.new('Review camera', cam)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for suffix, direction in (('three-quarter', (1.25, -1.5, 1.1)),
                              ('reverse', (-1.4, 1.1, .75)), ('top', (.12, -.15, 3))):
        camera.location = center+Vector(direction).normalized()*max(span*2, 3)
        camera.rotation_euler = (center-camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(QA/(name+'-'+suffix+'.png'))
        bpy.ops.render.render(write_still=True)
    # Do not leave cameras/lights in the reviewed scene either.
    for o in list(scene.objects):
        if o.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(o, do_unlink=True)
    scene.camera = None


def build(name, previews=True):
    fresh()
    with context():
        {'prop-footbridge': footbridge, 'river-bank': bank, 'prop-reeds': reeds,
         'prop-river-stones': stones}[name]()
        export(name)
    validate(name)
    if previews:
        with context():
            review(name)


def restore_mcp():
    # Factory settings unload addons. Restore the caller's running MCP service.
    bpy.ops.preferences.addon_enable(module='addon')
    bpy.context.scene.blendermcp_auto_start_server = True
    bpy.ops.blendermcp.start_server()


if __name__ == '__main__':
    try:
        for name in NAMES:
            build(name)
        (SRC/'river-validation.json').write_text(json.dumps(REPORT, indent=2)+'\n')
        print('River assets authored, re-imported and reviewed. Preview PNGs:', QA)
    finally:
        if not bpy.app.background:
            bpy.app.timers.register(restore_mcp, first_interval=.5)
