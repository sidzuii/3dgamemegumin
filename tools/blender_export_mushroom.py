import bpy, os
tex = r"C:/Users/tvist/Desktop/3dg/model/characters/mushroom-monster/textures/defaultMat_Base_Color.png"
img = bpy.data.images.load(tex)
for m in bpy.data.materials:
    if not m.name.startswith('defaultMat'): continue
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8
for o in list(bpy.data.objects):
    if o.type in ('CAMERA','LIGHT'): bpy.data.objects.remove(o)
arm = bpy.data.objects['Armature']
for o in bpy.data.objects:
    if o.type=='MESH':
        for v in o.data.uv_layers: pass
        print('UV', o.name, [u.name for u in o.data.uv_layers])
print('bones', [(b.name, b.parent.name if b.parent else None, tuple(round(x,2) for x in b.head_local), tuple(round(x,2) for x in b.tail_local)) for b in arm.data.bones])
bpy.ops.export_scene.gltf(filepath=r"C:/Users/tvist/Desktop/3dg/public/models/enemies/Mushroom.glb", export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_yup=True, export_apply=False, export_morph=True)
print('EXPORTED')
