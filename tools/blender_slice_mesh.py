import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
path = sys.argv[sys.argv.index('--')+1]
bpy.ops.import_scene.gltf(filepath=path)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
o=meshes[0]
mw=o.matrix_world
vs=[mw @ v.co for v in o.data.vertices]
xs=[v.x for v in vs]; ys=[v.y for v in vs]; zs=[v.z for v in vs]
print('BBOX x',min(xs),max(xs),'y',min(ys),max(ys),'z',min(zs),max(zs), 'n', len(vs))
H=max(zs)-min(zs); z0=min(zs)
N=30
for k in range(N):
    lo=z0+H*k/N; hi=z0+H*(k+1)/N
    band=sorted(v.x for v in vs if lo<=v.z<hi)
    if not band: print(k,'empty'); continue
    # find gaps in x > 0.04*H
    segs=[]; s=band[0]; p=band[0]
    for x in band[1:]:
        if x-p>0.025*H: segs.append((round(s,2),round(p,2))); s=x
        p=x
    segs.append((round(s,2),round(p,2)))
    yb=[v.y for v in vs if lo<=v.z<hi]
    print(f'{k:2d} z{lo:.2f} n{len(band)} segs{segs} y[{min(yb):.2f},{max(yb):.2f}]')
