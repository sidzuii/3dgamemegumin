# Export every outfit piece of a Quaternius modular people pack (.blend, "All together")
# to one glTF: one armature, every part as its own skinned mesh, no animations
# (the game retargets its own mocap clips).
#
# "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe" -b <pack.blend> --python tools/blender_export_people.py -- <out.glb>
import sys
import bpy

out = sys.argv[sys.argv.index('--') + 1]

# Make every object exportable: unhide, include all collections.
def walk(layer_coll):
    layer_coll.exclude = False
    layer_coll.hide_viewport = False
    for c in layer_coll.children:
        walk(c)

walk(bpy.context.view_layer.layer_collection)
for c in bpy.data.collections:
    c.hide_viewport = False
    c.hide_render = False
for o in bpy.context.scene.objects:
    o.hide_viewport = False
    o.hide_render = False
    o.hide_set(False)

# Rest pose for the export (no action applied).
for o in bpy.context.scene.objects:
    if o.type == 'ARMATURE':
        if o.animation_data:
            o.animation_data.action = None
        o.data.pose_position = 'REST'

names = sorted(o.name for o in bpy.context.scene.objects if o.type == 'MESH')
print('MESHES', len(names), ', '.join(names))

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_visible=False,
    use_selection=False,
    export_animations=False,
    export_skins=True,
    export_morph=False,
    export_apply=False,
    export_yup=True,
)
print('WROTE', out)
