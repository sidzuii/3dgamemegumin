import bpy, sys
from mathutils import Vector
args = sys.argv[sys.argv.index('--')+1:]
src, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# Merge close verts so bone-heat sees a connected surface.
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.002); bpy.ops.object.mode_set(mode='OBJECT')
# Blender space: Z up, front = -Y. Landmarks measured from cross-sections (height 2.0, feet at z=-1).
J = {
 'root': (0, 0, -1.0),
 'hips': (0, 0.0, -0.36), 'spine': (0, 0.0, -0.05), 'chest': (0, 0.0, 0.22), 'neck': (0, 0.0, 0.36), 'head': (0, -0.04, 0.48), 'headtop': (0, -0.04, 0.95),
}
def side(s):
    x = 1 if s == 'L' else -1
    return {
     'shoulder': (0.08*x, 0.0, 0.28), 'upperarm': (0.31*x, 0.02, 0.27), 'forearm': (0.42*x, 0.02, -0.13),
     'hand': (0.49*x, 0.0, -0.45), 'handtip': (0.53*x, -0.03, -0.70),
     'thigh': (0.13*x, 0.0, -0.38), 'shin': (0.19*x, -0.02, -0.68), 'foot': (0.21*x, 0.03, -0.92), 'toe': (0.24*x, -0.2, -0.99),
    }
bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.object; arm.name = 'DemonRig'
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
eb.remove(eb[0])
def bone(name, h, t, parent=None, connect=False):
    b = eb.new(name); b.head = Vector(h); b.tail = Vector(t)
    if parent: b.parent = eb[parent]; b.use_connect = connect
    return b
bone('hips', J['hips'], J['spine'])
bone('spine', J['spine'], J['chest'], 'hips', True)
bone('chest', J['chest'], J['neck'], 'spine', True)
bone('neck', J['neck'], J['head'], 'chest', True)
bone('head', J['head'], J['headtop'], 'neck', True)
for s in ('L', 'R'):
    p = side(s)
    bone(f'shoulder_{s}', p['shoulder'], p['upperarm'], 'chest')
    bone(f'upperarm_{s}', p['upperarm'], p['forearm'], f'shoulder_{s}', True)
    bone(f'forearm_{s}', p['forearm'], p['hand'], f'upperarm_{s}', True)
    bone(f'hand_{s}', p['hand'], p['handtip'], f'forearm_{s}', True)
    bone(f'thigh_{s}', p['thigh'], p['shin'], 'hips')
    bone(f'shin_{s}', p['shin'], p['foot'], f'thigh_{s}', True)
    bone(f'foot_{s}', p['foot'], p['toe'], f'shin_{s}', True)
bpy.ops.object.mode_set(mode='OBJECT')
# Parent with automatic (bone heat) weights.
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
try:
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
except Exception as e:
    print('AUTO FAILED', e)
groups = {g.index: g.name for g in mesh.vertex_groups}
unweighted = sum(1 for v in mesh.data.vertices if not any(g.weight > 0.01 for g in v.groups))
print('GROUPS', len(groups), 'VERTS', len(mesh.data.vertices), 'UNWEIGHTED', unweighted)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=False, export_yup=True, export_skins=True)
print('EXPORTED', out)
