import bpy, bmesh, math, os, sys, json, random, argparse
import numpy as np
from math import sin, cos, pi, sqrt
from mathutils import Vector

args=argparse.ArgumentParser()
args.add_argument('--output',default=os.path.dirname(os.path.abspath(__file__)))
opts=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=os.path.abspath(opts.output);os.makedirs(OUT,exist_ok=True)
random.seed(31415)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection' and c.users==0:bpy.data.collections.remove(c)
COL=None
def collection(name):
    global COL
    COL=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(COL);return COL
def mesh(name,vs,fs,mat=None,smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata(vs,[],fs);data.update()
    ob=bpy.data.objects.new(name,data);COL.objects.link(ob)
    if mat:data.materials.append(mat)
    for p in data.polygons:p.use_smooth=smooth
    return ob
def bevel(ob,w=.025,n=2):
    m=ob.modifiers.new('Worn stone edges','BEVEL');m.width=w;m.segments=n
    m=ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return ob
def uv(name,p,s,mat,seg=16,rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=p)
    ob=bpy.context.object;ob.name=name;ob.scale=s
    for c in list(ob.users_collection):c.objects.unlink(ob)
    COL.objects.link(ob);ob.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in ob.data.polygons:p.use_smooth=True
    return ob
def box(name,p,s,mat=None,w=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);ob=bpy.context.object;ob.name=name;ob.dimensions=s
    for c in list(ob.users_collection):c.objects.unlink(ob)
    COL.objects.link(ob)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if mat:ob.data.materials.append(mat)
    if w:bevel(ob,w)
    return ob
def tube(name,pts,r,mat,n=2):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=n;c.use_fill_caps=True
    s=c.splines.new('POLY');s.points.add(len(pts)-1)
    for p,v in zip(s.points,pts):p.co=(*v,1)
    ob=bpy.data.objects.new(name,c);COL.objects.link(ob);c.materials.append(mat);return ob
def sector_geometry(ri,ro,a,b,z0,z1,n=4):
    vs=[]
    for z in [z0,z1]:
        for r in [ri,ro]:
            vs.extend((r*cos(a+(b-a)*i/n),r*sin(a+(b-a)*i/n),z) for i in range(n+1))
    m=n+1;fs=[]
    for i in range(n):
        fs.extend([(i,i+1,m+i+1,m+i),(2*m+i,3*m+i,3*m+i+1,2*m+i+1),
                   (m+i,m+i+1,3*m+i+1,3*m+i),(i,2*m+i,2*m+i+1,i+1)])
    if abs((b-a)-2*pi)<1e-6:
        remap={k*m+n:k*m for k in range(4)}
        fs=[tuple(remap.get(v,v) for v in face) for face in fs]
        used=sorted({v for face in fs for v in face});ix={v:i for i,v in enumerate(used)}
        vs=[vs[v] for v in used];fs=[tuple(ix[v] for v in face) for face in fs]
    else:fs.extend([(0,m,3*m,2*m),(n,2*m+n,3*m+n,m+n)])
    return vs,fs
def sector(name,ri,ro,a,b,z0,z1,mat,n=4,w=0):
    vs,fs=sector_geometry(ri,ro,a,b,z0,z1,n);ob=mesh(name,vs,fs,mat)
    if w:bevel(ob,w)
    return ob
def ring(name,ri,ro,z0,z1,mat,n=128,w=0):
    return sector(name,ri,ro,0,2*pi,z0,z1,mat,n,w)
def recalc(ob):
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(ob.data);bm.free()
def convert(obs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.convert(target='MESH')
def join(obs,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();ob=bpy.context.object;ob.name=name;return ob
def smoothnoise(size,grid,rng):
    # Periodic coarse noise, interpolated without external packages.
    q=rng.random((grid+1,grid+1));q[-1,:]=q[0,:];q[:,-1]=q[:,0]
    u=np.linspace(0,grid,size,endpoint=False);i=u.astype(int);t=u-i;t=t*t*(3-2*t)
    rows=q[i,:]*(1-t[:,None])+q[i+1,:]*t[:,None]
    return rows[:,i]*(1-t[None,:])+rows[:,i+1]*t[None,:]
def image(name,rgb,noncolor=False):
    h,w,_=rgb.shape;data=bpy.data.images.new(name,width=w,height=h)
    if noncolor:data.colorspace_settings.name='Non-Color'
    rgba=np.ones((h,w,4),dtype=np.float32);rgba[:,:,:3]=rgb
    data.pixels.foreach_set(rgba.ravel());data.filepath_raw=os.path.join(OUT,name+'.png');data.file_format='PNG'
    data.save();data.pack();return data
rng=np.random.default_rng(9);N=768
broad=smoothnoise(N,6,rng);medium=smoothnoise(N,34,rng);fine=smoothnoise(N,150,rng)
tone=.80+.22*broad+.10*(medium-.5)+.07*(fine-.5)
tone-=np.maximum(0,.19-fine)*.40
albedo=np.stack([tone*.72,tone*.655,tone*.55],axis=-1)
lichen=np.clip((smoothnoise(N,17,rng)-.76)*5,0,1)*.25
albedo=albedo*(1-lichen[:,:,None])+np.array([.53,.55,.33])*lichen[:,:,None]
ALBEDO=image('Watchtower_stone_albedo',np.clip(albedo,0,1))
height=medium*.35+fine*.18
dy,dx=np.gradient(height);norm=np.stack([-dx*5,-dy*5,np.ones_like(dx)],axis=-1);norm/=np.linalg.norm(norm,axis=-1)[:,:,None]
NORMAL=image('Watchtower_stone_normal',norm*.5+.5,True)
def material(name,color,texture=False,rough=.85):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    ns=m.node_tree.nodes;ns.clear();out=ns.new('ShaderNodeOutputMaterial');p=ns.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value=rough;m.node_tree.links.new(p.outputs[0],out.inputs[0])
    vc=ns.new('ShaderNodeVertexColor');vc.layer_name='Paint'
    if texture:
        tex=ns.new('ShaderNodeTexImage');tex.image=ALBEDO;tex.extension='REPEAT'
        mult=ns.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1
        m.node_tree.links.new(tex.outputs['Color'],mult.inputs[1]);m.node_tree.links.new(vc.outputs['Color'],mult.inputs[2])
        m.node_tree.links.new(mult.outputs[0],p.inputs['Base Color'])
        no=ns.new('ShaderNodeTexImage');no.image=NORMAL;no.extension='REPEAT'
        nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45
        m.node_tree.links.new(no.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],p.inputs['Normal'])
    else:m.node_tree.links.new(vc.outputs['Color'],p.inputs['Base Color'])
    return m
STONE=material('Weathered limestone',(.88,.85,.78),True)
MORTAR=material('Recessed lime mortar',(.58,.57,.50),True)
TRIM=material('Arch limestone and corbels',(.99,.94,.80),True)
STAIR=material('Worn stair treads',(.83,.81,.72),True)
IRON=material('Weathered dark iron',(.15,.18,.15),False,.6)
VINE=material('Woody ivy stems',(.19,.22,.07))
GREENS=[material('Ivy leaf '+str(j),c) for j,c in enumerate([(.18,.28,.035),(.27,.38,.055),(.36,.45,.075),(.43,.49,.09),(.20,.34,.05)])]

def interior_radius(z):
    # Complete the stair transition before the roof approach, so the roof exit
    # can be a circular slot at the outside wall instead of a spiral inward.
    if z<=8.90:return 1.73
    if z<9.60:
        t=(z-8.90)/.70
        return 1.73+.45*t*t*(3-2*t)
    if z<=9.70:return 2.18
    if z<9.85:
        t=(z-9.70)/.15
        return 2.18+.47*t*t*(3-2*t)
    return 2.65
def flared_wall(name,ro,z0,z1,mat,n=128):
    controls=[8.90+.70*j/20 for j in range(21)]+[9.70+.15*j/14 for j in range(15)]
    levels=sorted(set([z0,z1]+[z for z in controls if z0<z<z1]))
    vs=[];fs=[]
    for z in levels:
        for r in [interior_radius(z),ro]:
            vs.extend((r*cos(j*2*pi/n),r*sin(j*2*pi/n),z) for j in range(n))
    for k in range(len(levels)-1):
        a=k*2*n;b=(k+1)*2*n
        for j in range(n):
            q=(j+1)%n
            fs.extend([(a+j,b+j,b+q,a+q),(a+n+j,a+n+q,b+n+q,b+n+j)])
    end=(len(levels)-1)*2*n
    for j in range(n):
        q=(j+1)%n;fs.extend([(j,q,n+q,n+j),(end+j,end+n+j,end+n+q,end+q)])
    ob=mesh(name,vs,fs,mat);recalc(ob);return ob

collection('01 | Stone structure — hide to see interior')
STRUCT=COL
ground=sector('Ground floor and flat foundation',.001,2.65,0,2*pi,0,.15,STONE,128,w=.025)
shaft=flared_wall('Hollow shaft backing',2.245,.15,9.72,MORTAR)
crown=flared_wall('Hollow upper chamber | smooth interior flare',3.135,9.70,12.48,MORTAR)
footing=ring('Footing rounded stone course',2.25,2.55,.15,.45,STONE,128,w=.035)

collection('02 | Individual masonry and battlements')
MASON=COL
def courses(name,ri,ro,z0,z1,rows,count):
    vs=[];fs=[]
    dz=(z1-z0)/rows
    for row in range(rows):
        offset=(row%2)*.5
        for j in range(count):
            a=2*pi*(j+offset)/count+.004;b=2*pi*(j+1+offset)/count-.004
            z=z0+row*dz
            jitter=random.uniform(-.012,.012)
            v,f=sector_geometry(ri,ro+random.uniform(-.012,.015),a,b,z+.009+jitter,z+dz-.009+jitter,3)
            if name.startswith('Shaft'):
                adjusted=[]
                for vi,(x,y,zz) in enumerate(v):
                    if vi<4 or 8<=vi<12:
                        rr=interior_radius(zz)+.025;theta=math.atan2(y,x)
                        x,y=rr*cos(theta),rr*sin(theta)
                    adjusted.append((x,y,zz))
                v=adjusted
            off=len(vs);vs.extend(v);fs.extend(tuple(off+k for k in face) for face in f)
    ob=mesh(name,vs,fs,STONE);bevel(ob,.016,2);return ob
blocks=courses('Shaft | staggered carved stone blocks',1.755,2.30,.16,9.72,23,24)
upperblocks=courses('Crown | staggered carved stone blocks',2.67,3.20,9.72,12.49,7,32)
# Tall, solid merlons in two courses, separated by usable crenels.
for j in range(12):
    a=2*pi*j/12+.025;b=a+2*pi/12*.52
    sector('Merlon %02d lower course'%j,2.65,3.20,a,b,12.49,12.94,STONE,5,w=.035)
    sector('Merlon %02d upper course'%j,2.64,3.22,a+.004,b-.004,12.95,13.40+random.uniform(-.05,.045),TRIM,5,w=.035)

# Pointed arch cutters and their fitted stone frames.
def archpoly(w,h,base=0,steps=12):
    shoulder=h*.64;top=h;vs=[(-w/2,base),(-w/2,base+shoulder)]
    for k in range(1,steps+1):
        t=k/steps;s=1-t
        x=s**3*(-w/2)+3*s*s*t*(-w/2)+3*s*t*t*(-w*.23)
        z=s**3*shoulder+3*s*s*t*(shoulder+(h-shoulder)*.55)+3*s*t*t*(h-.14*(h-shoulder))+t**3*h
        vs.append((x,base+z))
    vs+=[(-x,z) for x,z in reversed(vs[:-1])]
    return vs
def cutter(name,theta,rad,w,h,z):
    p=archpoly(w,h,z);n=len(p);vs=[]
    normal=Vector((cos(theta),sin(theta),0));tangent=Vector((-sin(theta),cos(theta),0))
    for d in [-1.05,1.05]:
        for x,zz in p:
            v=normal*(rad+d)+tangent*x;vs.append((v.x,v.y,zz))
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    fs.extend((j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n))
    ob=mesh(name,vs,fs);recalc(ob);return ob
collection('99 | Temporary opening cutters');CUTTERS=COL
openings=[('Entry portal',-pi/2,2.30,1.46,2.70,.13,.24)]
# Narrow lower shaft has no windows.
for j in range(8):openings.append(('Upper chamber arrow window',-pi/2+j*pi/4,3.20,.49,1.42,10.30,.13))
for name,a,r,w,h,z,th in openings:cutter(name+' cutter',a,r-.22,w,h,z)

def cut_openings(ob):
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
    # Cut before the masonry bevel so the carved opening edges receive the same wear.
    mod=ob.modifiers.new('Real door and window voids','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT'
    mod.operand_type='COLLECTION';mod.collection=CUTTERS
    while list(ob.modifiers).index(mod)>0:bpy.ops.object.modifier_move_up(modifier=mod.name)
    bpy.ops.object.modifier_apply(modifier=mod.name)
for ob in [shaft,crown,footing,blocks,upperblocks]:cut_openings(ob)
for ob in list(CUTTERS.objects):bpy.data.objects.remove(ob,do_unlink=True)
bpy.data.collections.remove(CUTTERS)
print('HOLLOW_MASONRY_AND_OPENINGS_READY',flush=True)

collection('03 | Arch frames, cornice and rubble');DETAILS=COL
def framepoint(x,depth,z,a,r):
    rr=r+depth;n=Vector((cos(a),sin(a),0));t=Vector((-sin(a),cos(a),0))
    v=n*sqrt(max(.01,rr*rr-x*x))+t*x;return (v.x,v.y,z)
def frame(name,a,r,w,h,z,th):
    # Concentric pointed arches: jamb blocks and individual arch voussoirs.
    inn=archpoly(w,h,z);out=archpoly(w+2*th,h+th,z)
    # Jambs are partitioned into stone courses.
    shoulder=h*.64
    count=max(2,round(shoulder/.33))
    for side in [-1,1]:
        for j in range(count):
            zz=z+j*shoulder/count+.007;zt=z+(j+1)*shoulder/count-.007
            x0=side*w/2;x1=side*(w/2+th)
            vs=[framepoint(x,d,q,a,r) for d in [-.06,.14] for x,q in [(x0,zz),(x1,zz),(x1,zt),(x0,zt)]]
            ob=mesh(name+' | jamb block',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],TRIM);recalc(ob);bevel(ob,.015,2)
    # Arch stones meet above the vertical jambs.
    for j in range(1,len(inn)-2):
        if inn[j][1]<z+shoulder-.01 or inn[j+1][1]<z+shoulder-.01:continue
        ip=[inn[j],inn[j+1]];op=[out[j],out[j+1]]
        # Slight mortar joint at each arch block edge.
        cx=sum(p[0] for p in [*ip,*op])/4;cz=sum(p[1] for p in [*ip,*op])/4
        pts=[ip[0],op[0],op[1],ip[1]]
        pts=[(cx+(x-cx)*.967,cz+(q-cz)*.967) for x,q in pts]
        vs=[framepoint(x,d,q,a,r) for d in [-.07,.14] for x,q in pts]
        ob=mesh(name+' | pointed arch stone',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],TRIM);recalc(ob);bevel(ob,.012,2)
    if 'window' in name:
        n=Vector((cos(a),sin(a),0));p=n*(r+.10)
        sill=box(name+' | projecting sill',(p.x,p.y,z-.045),(w+th*2+.15,.42,.12),TRIM,.025);sill.rotation_euler.z=a+pi/2
for i,(name,a,r,w,h,z,th) in enumerate(openings):frame(name+' %02d'%i,a,r,w,h,z,th)

# Corbels flare the upper guard chamber out from the shaft.
def corbel(a):
    poly=[(2.24,8.30),(2.42,8.30),(2.48,8.68),(2.85,9.06),(3.34,9.44),(3.34,9.69),(2.24,9.69)]
    n=Vector((cos(a),sin(a),0));t=Vector((-sin(a),cos(a),0));vs=[]
    for side in [-.18,.18]:
        for r,z in poly:
            p=n*r+t*side;vs.append((p.x,p.y,z))
    k=len(poly);fs=[tuple(reversed(range(k))),tuple(range(k,2*k))]+[(j,(j+1)%k,(j+1)%k+k,j+k) for j in range(k)]
    ob=mesh('Projecting stone corbel',vs,fs,STONE);recalc(ob);bevel(ob,.028,2)
for j in range(14):corbel(j*2*pi/14)
flared_wall('Corbel-supported cornice',3.35,9.48,9.73,TRIM)
flared_wall('Upper cornice drip edge',3.37,9.72,9.84,STONE)
ring('Crenellation coping band',2.65,3.23,12.35,12.50,TRIM,128,w=.020)
# Uneven, individually chipped stones gathered around the base, avoiding the entrance.
for j in range(48):
    a=random.uniform(0,2*pi)
    if abs((a+pi/2+pi)%(2*pi)-pi)<.37:continue
    r=random.uniform(2.25,2.75);sx=random.uniform(.28,.60);sy=random.uniform(.25,.49);sz=random.uniform(.20,.55)
    z=.10+sz/2
    if j%8==0:z+=.35
    ob=box('Broken footing stone',(r*cos(a),r*sin(a),z),(sx,sy,sz),STONE,.045)
    ob.rotation_euler=(random.uniform(-.12,.12),random.uniform(-.12,.12),a+random.uniform(-.3,.3))

collection('04 | Wall-hugging staircase and solid roof');STAIRS=COL
N_STEPS=68;RISE=.175;START=-pi/2;GROUND=.15;DECK=GROUND+N_STEPS*RISE
# The upper chamber is wider: the outer edge of every tread meets its inner wall.
# Shorter angular treads upstairs keep the walking going approximately constant.
TREADS=[];a=START
for j in range(N_STEPS-1):
    top=GROUND+(j+1)*RISE
    ro=interior_radius(top)+.015
    ri=ro-.90
    angle=.23/((ri+ro)/2)
    b=a+angle
    TREADS.append({'index':j+1,'ri':ri,'ro':ro,'a':a,'b':b,'top':top})
    sector('Wall stair tread %02d'%(j+1),ri,ro,a,b+.003,top-.145,top,STAIR,5,w=.010)
    sector('Tread %02d worn leading edge'%(j+1),ri+.025,ro-.015,a,a+.014,top-.028,top+.003,TRIM,1,w=.005)
    a=b
EXIT=a
sector('Entry vestibule landing',.89,2.42,START-.23,START+.25,.02,GROUND,STAIR,16,w=.02)

# One complete floor slab, with only the staircase exit cut out near the wall.
# No central pole, open circular well, handrails or posts.
def disk(name,r,z0,z1,mat,n=160):
    vs=[(0,0,z0),(0,0,z1)]
    vs.extend((r*cos(i*2*pi/n),r*sin(i*2*pi/n),z0) for i in range(n))
    vs.extend((r*cos(i*2*pi/n),r*sin(i*2*pi/n),z1) for i in range(n))
    fs=[]
    for i in range(n):
        j=(i+1)%n
        fs.extend([(0,2+j,2+i),(1,2+n+i,2+n+j),(2+i,2+j,2+n+j,2+n+i)])
    return mesh(name,vs,fs,mat)
roof=disk('Solid flat roof floor | single peripheral stair exit',3.13,DECK-.23,DECK,STONE)
# A single continuous curved cutter replaces the union of individual tread shapes.
# Its inner and outer edges are smooth, without tooth-shaped notches.
a0=TREADS[54]['a']-.012;a1=TREADS[-1]['b']
def hatch_radius(angle):
    # Both hatch sides are concentric with the circular crown wall.
    return 2.665
count=120;hvs=[];hfs=[]
for z in [DECK-.70,DECK+.35]:
    for outer in [False,True]:
        for j in range(count+1):
            aa=a0+(a1-a0)*j/count
            rr=hatch_radius(aa)+(.10 if outer else -1.015)
            hvs.append((rr*cos(aa),rr*sin(aa),z))
nn=count+1
for j in range(count):
    hfs.extend([(j,j+1,nn+j+1,nn+j),(2*nn+j,3*nn+j,3*nn+j+1,2*nn+j+1),
                (nn+j,nn+j+1,3*nn+j+1,3*nn+j),(j,2*nn+j,2*nn+j+1,j+1)])
hfs.extend([(0,nn,3*nn,2*nn),(count,2*nn+count,3*nn+count,nn+count)])
hatch=mesh('Temporary smooth stair exit cutter',hvs,hfs);recalc(hatch)
bpy.ops.object.select_all(action='DESELECT');roof.select_set(True);bpy.context.view_layer.objects.active=roof
mod=roof.modifiers.new('Smooth single stair exit','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=hatch
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(hatch,do_unlink=True)
print('STAIRCASE_READY',{'physical_treads':67,'rise_to_roof':68,'rise':RISE,'deck':DECK,'railings':False,'solid_roof':True},flush=True)

collection('05 | Climbing ivy — optional');IVY=COL
leaf_vs=[];leaf_fs=[];leaf_mats=[];leaf_colors=[]
def leaf(p,a,size,tilt):
    if p[2]<2.95 and abs((a+pi/2+pi)%(2*pi)-pi)<.33:return
    normal=Vector((cos(a),sin(a),0));horizontal=Vector((-sin(a),cos(a),0));up=Vector((0,0,1))
    t=horizontal*cos(tilt)+up*sin(tilt);v=up*cos(tilt)-horizontal*sin(tilt)
    shape=[(0,-.19),(-.068,-.09),(-.077,-.018),(-.055,.035),(-.02,.045),(0,.018),(.02,.045),(.055,.035),(.077,-.018),(.068,-.09)]
    off=len(leaf_vs);center=Vector(p)+normal*.018
    leaf_vs.append(tuple(center-v*.055+normal*.023))
    tint=random.randrange(len(GREENS))
    for x,z in shape:leaf_vs.append(tuple(center+t*x*size+v*z*size))
    for k in range(len(shape)):
        leaf_fs.append((off,off+1+k,off+1+(k+1)%len(shape)));leaf_mats.append(tint)
def wallradius(z):
    if z>9.85:return 3.24
    if z>9.15:return 2.33+(z-9.15)/.70*.98
    return 2.33
paths=[]
for j in range(15):
    a=-pi/2+j*2*pi/15+random.uniform(-.16,.16)
    if abs((a+pi/2+pi)%(2*pi)-pi)<.36:a+=.50
    ztop=random.uniform(12.3,13.1);bottom=random.choice([.35,1.0,3.7,6.3,8.7,9.3])
    if j in [0,4,9]:bottom=.35
    pts=[];steps=round((ztop-bottom)*10)
    for k in range(steps+1):
        t=k/steps;z=ztop+(bottom-ztop)*t
        aa=a+.045*sin(t*15+j)+.055*sin(t*6+j*.6)
        r=wallradius(z)+.025
        pts.append((r*cos(aa),r*sin(aa),z))
        if k%2==0:
            for side in [-1,1]:
                shift=side*random.uniform(.055,.12);ang=aa+shift/r
                pp=(r*cos(ang),r*sin(ang),z+random.uniform(-.025,.06))
                leaf(pp,ang,random.uniform(.78,1.4),side*random.uniform(.35,.9))
                if random.random()<.3:leaf(pp,ang,random.uniform(.8,1.3),-side*random.uniform(.2,.6))
    tube('Trailing ivy woody stem',pts,.015,VINE,2);paths.append(pts)
    # Short branches make the ivy trails uneven and organic.
    for branch in range(3):
        if len(pts)<15:continue
        p=Vector(pts[random.randrange(6,len(pts)-5)]);aa=math.atan2(p.y,p.x);side=random.choice([-1,1]);branchpts=[]
        for k in range(10):
            t=k/9;ang=aa+side*.21*t;zz=p.z-.55*t;r=wallradius(zz)+.028
            q=(r*cos(ang),r*sin(ang),zz);branchpts.append(q)
            if k%2==0:leaf(q,ang,random.uniform(.8,1.2),side*.7)
        tube('Ivy side tendril',branchpts,.009,VINE,1)
# Vegetation around the footing, leaving an open approach at the doorway.
for j in range(300):
    a=random.uniform(0,2*pi)
    if abs((a+pi/2+pi)%(2*pi)-pi)<.36:continue
    z=random.uniform(.12,2.8);r=2.35+max(0,1-z/2.8)*random.uniform(.0,.50)
    if random.random()>.95-z*.12:continue
    leaf((r*cos(a),r*sin(a),z),a,random.uniform(.8,1.5),random.uniform(-1,1))
leaves=mesh('Ivy leaves | individual heart-shaped geometry',leaf_vs,leaf_fs)
for mat in GREENS:leaves.data.materials.append(mat)
for face,idx in zip(leaves.data.polygons,leaf_mats):face.material_index=idx

# Mesh conversion, portable UVs and vertex-painted weathering.
model=[o for c in [STRUCT,MASON,DETAILS,STAIRS,IVY] for o in c.objects if o.type in {'MESH','CURVE'}]
convert(model)
for ob in model:
    data=ob.data
    if not data.polygons:continue
    attr=data.color_attributes.new(name='Paint',type='FLOAT_COLOR',domain='CORNER')
    uvmap=data.uv_layers.new(name='UVMap')
    # Color variation is per disconnected stone, so each block reads distinctly.
    vcols=[]
    for vv in data.vertices:
        p=ob.matrix_world@vv.co
        seed=sin(p.x*3.1+p.y*2.7+p.z*.7)*.035
        moss=max(0,sin(p.x*1.35+p.y*.86)*sin(p.z*1.78+.9)-.47)
        # Low damp moss is stronger than weathering high on the dry stone.
        moss*=.8 if p.z<2.1 else .40
        vcols.append((p,seed,moss))
    vals=[];uvvals=[0.0]*(len(data.loops)*2)
    for face in data.polygons:
        mat=data.materials[face.material_index];base=mat.diffuse_color
        # A deterministic per-face tint adds subtle chips and wear without outlines.
        cent=ob.matrix_world@face.center
        grain=1+.035*sin(math.floor(cent.z/.421)*7+math.floor(math.atan2(cent.y,cent.x)*24/(2*pi))*2)
        coords=[vcols[data.loops[li].vertex_index][0] for li in face.loop_indices]
        phis=[math.atan2(p.y,p.x) for p in coords]
        if max(phis)-min(phis)>pi:phis=[a+2*pi if a<0 else a for a in phis]
        for li,p,phi in zip(face.loop_indices,coords,phis):
            _,seed,moss=vcols[data.loops[li].vertex_index]
            f=grain+seed
            if ob==leaves:f=1.04 if data.loops[li].vertex_index%11==0 else random.uniform(.84,1.02);moss=0
            color=[min(1,base[k]*f) for k in range(3)]
            if mat in [STONE,TRIM,MORTAR,STAIR]:
                for k,target in enumerate([.35,.45,.17]):color[k]=color[k]*(1-moss)+target*moss
            vals.extend((*color,1))
            if abs(face.normal.z)>.65:u,v=p.x/1.1,p.y/1.1
            elif abs(face.normal.x)>abs(face.normal.y):u,v=p.y/.9,p.z/.53
            else:u,v=p.x/.9,p.z/.53
            uvvals[li*2]=u;uvvals[li*2+1]=v
    attr.data.foreach_set('color',vals);uvmap.data.foreach_set('uv',uvvals)
    data.color_attributes.active_color=attr
print('PAINT_AND_UVS_READY',len(model),flush=True)

# Join by editable systems; keep the stairs separate from the exterior.
for c,name in [(STRUCT,'Hollow structural walls'),(MASON,'Masonry and crenellations'),(DETAILS,'Frames, corbels and footing rubble'),(STAIRS,'Wall staircase and solid roof floor'),(IVY,'Climbing ivy')]:
    obs=[o for o in c.objects if o.type=='MESH']
    if len(obs)>1:join(obs,name)
model=[o for c in [STRUCT,MASON,DETAILS,STAIRS,IVY] for o in c.objects if o.type=='MESH']
collection('00 | Asset root')
root=bpy.data.objects.new('Watchtower',None);COL.objects.link(root)
for ob in model:ob.parent=root
root['Reference']='User-supplied ivy-covered medieval watchtower image; hidden faces inferred'
root['Staircase']='67 wall-attached treads plus final rise onto roof; no newel or railings'
root['Deck elevation']=DECK
root['Railings']=False
root['Free roof center']='No pole or circular well; flat floor for chest and book'
root['Roof']='Solid floor; constant-radius perimeter exit; upper windows only'
root['Exit inner radius']=1.65
root['Exit outer radius']=2.765
root['Stair width']=.90
root['Lower windows']=False
root['Scale']='Nominal dimensions in metres, artistic estimates'
root.asset_mark()

collection('90 | Presentation — no ground plane');PRESENT=COL
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
world=bpy.data.worlds.new('Soft blue daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.62,.72,.88,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.38
def aim(ob,p):ob.rotation_euler=(Vector(p)-ob.location).to_track_quat('-Z','Y').to_euler()
def area(name,p,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;ob=bpy.data.objects.new(name,d);COL.objects.link(ob)
    ob.location=p;d.color=color;aim(ob,(0,0,6))
area('Warm afternoon key',(-7,-9,17),2600,8,(1,.85,.65))
area('Cool sky fill',(8,-4,12),1400,7,(.68,.79,1))
area('Sunlit upper rim',(1,6,16),2200,6,(1,.89,.65))
d=bpy.data.cameras.new('Exterior camera');cam=bpy.data.objects.new('Exterior camera',d);COL.objects.link(cam)
cam.location=(10,-19,14);aim(cam,(0,0,6.6));d.type='ORTHO';d.ortho_scale=15.7;scene.camera=cam
dc=bpy.data.cameras.new('Cutaway camera');cc=bpy.data.objects.new('Cutaway camera',dc);COL.objects.link(cc)
cc.location=(8,-19,15);aim(cc,(0,0,6.5));dc.type='ORTHO';dc.ortho_scale=15.6
dr=bpy.data.cameras.new('Roof layout camera');roofcam=bpy.data.objects.new('Roof layout camera',dr);COL.objects.link(roofcam)
roofcam.location=(0,-2.5,23);aim(roofcam,(0,0,11.9));dr.type='ORTHO';dr.ortho_scale=7.8
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=1800;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene['Cutaway instructions']='Hide collections 01, 02, 03 and 05 to see the complete staircase; render Watchtower_cutaway.png shows a front half-section'
bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_distance=19
            ar.spaces.active.region_3d.view_location=(0,0,6.4)
            ar.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            ar.spaces.active.shading.type='MATERIAL';ar.spaces.active.overlay.show_floor=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Watchtower.blend'))
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for ob in model:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Watchtower.glb'),export_format='GLB',use_selection=True,export_materials='EXPORT',export_vertex_color='ACTIVE',export_cameras=False,export_lights=False)
stats={'meshes':len(model),'vertices':sum(len(o.data.vertices) for o in model),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in model),'stair_treads':67,'rises_to_roof':68,'stair_rise_m':RISE,'lower_tread_width_m':.90,'upper_tread_width_m':.90,'roof_deck_z_m':DECK,'window_openings':len(openings)-1,'ground_plane':False,'railings':False,'central_newel':False,'solid_roof':True,'exit_inner_radius_m':1.65,'exit_outer_radius_m':2.765,'treads':TREADS}
with open(os.path.join(OUT,'Watchtower_info.json'),'w',encoding='utf8') as f:json.dump(stats,f,indent=2)
print('MODEL_SAVED',{k:v for k,v in stats.items() if k!='treads'},flush=True)
scene.render.filepath=os.path.join(OUT,'Watchtower_preview.png');bpy.ops.render.render(write_still=True)

# Top view shows the usable floor and the single wall-side stair exit.
scene.camera=roofcam;scene.render.resolution_x=1400;scene.render.resolution_y=1400
scene.render.filepath=os.path.join(OUT,'Watchtower_roof.png');bpy.ops.render.render(write_still=True)
scene.render.resolution_x=1100;scene.render.resolution_y=1800

# A temporary half-section for inspection. The saved native model stays complete.
scene.camera=cc
IVY.hide_render=True
for c in [STRUCT,MASON,DETAILS]:
    for ob in c.objects:
        if ob.type=='MESH':
            ob.data=ob.data.copy()
            bm=bmesh.new();bm.from_mesh(ob.data)
            inv=ob.matrix_world.inverted();point=inv@Vector((0,0,0))
            normal=ob.matrix_world.to_3x3().transposed()@Vector((0,1,0))
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=point,plane_no=normal,clear_inner=True,clear_outer=False)
            bm.to_mesh(ob.data);bm.free();ob.data.update()
scene.render.filepath=os.path.join(OUT,'Watchtower_cutaway.png');bpy.ops.render.render(write_still=True)
camdetail=bpy.data.cameras.new('Stair transition detail');obdetail=bpy.data.objects.new('Stair transition detail',camdetail);PRESENT.objects.link(obdetail)
obdetail.location=(3.4,-6.5,11.7);aim(obdetail,(-.7,1.0,10.3));camdetail.type='ORTHO';camdetail.ortho_scale=4.8
scene.camera=obdetail;scene.render.resolution_x=1400;scene.render.resolution_y=1150
scene.render.filepath=os.path.join(OUT,'Watchtower_stairs_detail.png');bpy.ops.render.render(write_still=True)
print('COMPLETE',flush=True)
