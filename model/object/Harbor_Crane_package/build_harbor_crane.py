import bpy,bmesh,math,os,sys,json,random,argparse
import numpy as np
from math import pi,sin,cos,sqrt
from mathutils import Vector

parser=argparse.ArgumentParser();parser.add_argument('--output',default=os.path.dirname(os.path.abspath(__file__)))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=os.path.abspath(args.output);os.makedirs(OUT,exist_ok=True)
random.seed(28)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
ASSET=bpy.data.collections.new('01 | Harbor crane — one mesh');bpy.context.scene.collection.children.link(ASSET)
COL=ASSET;PART='Base';PALETTE={}
def put(o,name,mat):
    o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    COL.objects.link(o)
    if mat:o.data.materials.append(mat)
    o['part']=PART
    return o
def mesh(name,vs,fs,mat,smooth=False):
    m=bpy.data.meshes.new(name);m.from_pydata(vs,[],fs);m.update();o=bpy.data.objects.new(name,m);COL.objects.link(o)
    if mat:m.materials.append(mat)
    o['part']=PART
    for p in m.polygons:p.use_smooth=smooth
    return o
def bevel(o,w=.025,n=3):
    m=o.modifiers.new('Rounded hand-carved edges','BEVEL');m.width=w;m.segments=n
    o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');return o
def box(name,p,s,mat,w=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=put(bpy.context.object,name,mat);o.dimensions=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o['grain_axis']=int(np.argmax(s))
    if w:bevel(o,w)
    return o
def beam(name,a,b,width,depth,mat,w=.025):
    a=Vector(a);b=Vector(b);o=box(name,(a+b)/2,(width,depth,(b-a).length),mat,w)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o['grain_axis']=2;return o
def cylinder(name,p,r,depth,mat,axis=(0,0,1),n=32,w=.012):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=depth,location=p)
    o=put(bpy.context.object,name,mat);o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler();o['grain_axis']=2
    if w:bevel(o,w,2)
    return o
def ball(name,p,s,mat,n=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=n,ring_count=10,location=p);o=put(bpy.context.object,name,mat);o.scale=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for f in o.data.polygons:f.use_smooth=True
    return o
def tube(name,pts,r,mat,n=2):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=n;c.use_fill_caps=True
    s=c.splines.new('POLY');s.points.add(len(pts)-1)
    for p,v in zip(s.points,pts):p.co=(*v,1)
    o=bpy.data.objects.new(name,c);COL.objects.link(o);c.materials.append(mat);o['part']=PART;return o
def arc(name,ri,ro,a,b,z0,z1,mat,n=8):
    vs=[]
    for z in [z0,z1]:
        for r in [ri,ro]:vs.extend((r*cos(a+(b-a)*i/n),r*sin(a+(b-a)*i/n),z) for i in range(n+1))
    m=n+1;fs=[]
    for i in range(n):fs.extend([(i,i+1,m+i+1,m+i),(2*m+i,3*m+i,3*m+i+1,2*m+i+1),(m+i,m+i+1,3*m+i+1,3*m+i),(i,2*m+i,2*m+i+1,i+1)])
    if abs(b-a-2*pi)<1e-6:
        remap={k*m+n:k*m for k in range(4)};fs=[tuple(remap.get(v,v) for v in f) for f in fs]
        used=sorted({v for f in fs for v in f});ix={v:i for i,v in enumerate(used)};vs=[vs[i] for i in used];fs=[tuple(ix[v] for v in f) for f in fs]
    else:fs.extend([(0,m,3*m,2*m),(n,2*m+n,3*m+n,m+n)])
    o=mesh(name,vs,fs,mat);o['grain_mode']='rim';return o
def ring_y(name,p,ri,ro,depth,mat,n=64):
    o=arc(name,ri,ro,0,2*pi,-depth/2,depth/2,mat,n);o.location=p;o.rotation_euler.x=pi/2;return o
def smoothnoise(size,grid,rng):
    q=rng.random((grid+1,grid+1));q[-1,:]=q[0,:];q[:,-1]=q[:,0]
    u=np.linspace(0,grid,size,endpoint=False);i=u.astype(int);t=u-i;t=t*t*(3-2*t)
    a=q[i,:]*(1-t[:,None])+q[i+1,:]*t[:,None]
    return a[:,i]*(1-t[None,:])+a[:,i+1]*t[None,:]
def make_image(name,rgb):
    h,w,_=rgb.shape;i=bpy.data.images.new(name,width=w,height=h);p=np.ones((h,w,4),np.float32);p[:,:,:3]=rgb
    i.pixels.foreach_set(p.ravel());i.filepath_raw=os.path.join(OUT,name+'.png');i.file_format='PNG';i.save();i.pack();return i
rng=np.random.default_rng(17);N=768
yy,xx=np.mgrid[0:N,0:N]/N
broad=smoothnoise(N,5,rng);fine=smoothnoise(N,85,rng)
waves=xx*22+.12*np.sin(yy*2*pi)+.12*np.sin(yy*6*pi+xx*5)+.16*(broad-.5)
grain=.035*np.sin(waves*2*pi)+.013*np.sin(waves*6*pi)
tone=.91+.14*(broad-.5)+grain+.025*(fine-.5)
WOODTEX=make_image('Harbor_Crane_wood_color',np.clip(tone[:,:,None]*np.array([.68,.395,.175]),0,1))
stone=.91+.10*(smoothnoise(N,8,rng)-.5)+.025*(fine-.5)
STONETEX=make_image('Harbor_Crane_stone_color',np.clip(stone[:,:,None]*np.array([.76,.78,.77]),0,1))
def material(name,color,rough=.65,metal=0,tex=None):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1);PALETTE[name]=color
    ns=m.node_tree.nodes;ns.clear();out=ns.new('ShaderNodeOutputMaterial');p=ns.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    m.node_tree.links.new(p.outputs[0],out.inputs[0]);vc=ns.new('ShaderNodeVertexColor');vc.layer_name='Paint'
    if tex:
        im=ns.new('ShaderNodeTexImage');im.image=tex;im.extension='REPEAT'
        mix=ns.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        m.node_tree.links.new(im.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(vc.outputs['Color'],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])
    else:m.node_tree.links.new(vc.outputs['Color'],p.inputs['Base Color'])
    return m
WOOD=material('Honey oak — painted grain',(.98,.93,.85),tex=WOODTEX)
DARKWOOD=material('Aged oak joinery',(.72,.63,.48),tex=WOODTEX)
LIGHTWOOD=material('Golden crate and barrel wood',(1,.98,.92),tex=WOODTEX)
STONE=material('Light grey quay stone',(.95,.96,1),.85,tex=STONETEX)
MORTAR=material('Warm grey stone joints',(.43,.47,.47),.9)
BRASS=material('Soft antique brass',(.72,.43,.12),.34,.65)
IRON=material('Forged blue-grey iron',(.105,.15,.17),.38,.65)
ROPE=material('Natural hemp rope',(.54,.36,.17),.85)
ROPELIGHT=material('Hemp strand highlights',(.73,.54,.29),.82)

def resample(points,n):
    pp=[Vector(p) for p in points];dd=[0]
    for a,b in zip(pp,pp[1:]):dd.append(dd[-1]+(b-a).length)
    out=[];j=0
    for k in range(n+1):
        d=dd[-1]*k/n
        while j<len(dd)-2 and dd[j+1]<d:j+=1
        t=(d-dd[j])/max(1e-8,dd[j+1]-dd[j]);out.append(pp[j].lerp(pp[j+1],t))
    return out,dd[-1]
def rope(name,points,r=.032,twist=True):
    length=sum((Vector(a)-Vector(b)).length for a,b in zip(points,points[1:]));n=max(12,int(length*45))
    path,length=resample(points,n);tube(name,[tuple(p) for p in path],r,ROPE,2)
    if twist:
        pts=[]
        for k,p in enumerate(path):
            tangent=(path[min(k+1,n)]-path[max(0,k-1)]).normalized();ref=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((1,0,0))
            u=tangent.cross(ref).normalized();v=tangent.cross(u).normalized();a=k/n*length/.15*2*pi
            pts.append(tuple(p+(u*cos(a)+v*sin(a))*r*.75))
        tube(name+' twisted strand',pts,r*.27,ROPELIGHT,1)
def bolt(p,axis=(0,-1,0),r=.043):
    cylinder('Brass bolt and washer',p,r,.035,BRASS,axis,12,.006)
def bezier(a,b,c,d,n=30):
    a,b,c,d=map(Vector,(a,b,c,d))
    return [tuple((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d) for t in np.linspace(0,1,n+1)]

# The only base in the scene is the square stone quay that belongs to the asset.
PART='Stone quay'
box('Square flat-bottom quay foundation',(0,0,.12),(7.0,7.0,.24),STONE,.07)
box('Recessed quay body',(0,0,.33),(6.88,6.88,.24),MORTAR,.025)
for side in range(4):
    a=side*pi/2;normal=Vector((cos(a),sin(a),0));tangent=Vector((-sin(a),cos(a),0))
    for j in range(8):
        pos=normal*3.39+tangent*(-3.02+j*.865)
        o=box('Quay edge limestone block',(pos.x,pos.y,.365),(.84,.24,.23),STONE,.025);o.rotation_euler.z=a+pi/2
for i in range(5):
    for j in range(5):
        box('Top dressed paving slab',(-2.76+i*1.38,-2.76+j*1.38,.515),(1.365,1.365,.18),STONE,.026)

PART='Timber chassis'
for y in [-1.05,1.05]:
    beam('Long oak sleeper',(-2.65,y,.77),(1.95,y,.77),.27,.32,DARKWOOD,.035)
for x in [-2.35,-.3,1.65]:beam('Cross chassis sleeper',(x,-1.48,.72),(x,1.48,.72),.23,.24,WOOD,.03)
for x in [-2.35,1.65]:
    for y in [-1.05,1.05]:
        box('Brass sleeper shoe',(x,y,.70),(.44,.46,.12),BRASS,.025)
        bolt((x,y-.245,.75))

PART='Main mast and boom'
beam('Main lifting mast',(.85,0,.70),(.85,0,6.35),.40,.43,WOOD,.055)
box('Mast square oak plinth',(.85,0,.70),(.72,.74,.20),DARKWOOD,.03)
box('Mast brass foot socket',(.85,0,.94),(.48,.50,.57),BRASS,.045)
box('Mast head brass cap',(.85,0,6.35),(.48,.50,.20),BRASS,.04)
for y in [-1.12,1.12]:
    beam('Mast splayed side brace',(1.75,y,.78),(.85,.10*(1 if y>0 else -1),3.95),.22,.23,WOOD,.03)
beam('Rear mast diagonal stay',(-2.1,1.32,.83),(.85,.85,4.85),.23,.23,DARKWOOD,.03)
beam('Rear mast brace crosshead',(.85,0,4.85),(.85,.95,4.85),.20,.20,WOOD,.03)
beam('Mast crosshead',(.85,-1.48,3.60),(.85,1.30,3.60),.24,.25,WOOD,.03)
boom0=Vector((.85,0,2.95));boom1=Vector((4.18,0,5.92));direction=(boom1-boom0).normalized()
for side in [-1,1]:
    aa=boom0+Vector((0,side*.265,0));bb=boom1+Vector((0,side*.265,0))
    beam('Paired rising boom beam',aa,bb,.22,.24,WOOD,.035)
    for t in [.03,.28,.55,.80,.97]:
        p=aa.lerp(bb,t);o=box('Boom brass binding',p,(.27,.29,.12),BRASS,.018);o.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
        bolt(p+Vector((0,side*.16,0)),(0,side,0),.035)
for t in np.linspace(.10,.90,6):
    p=boom0.lerp(boom1,t);beam('Boom cross spacer',p+Vector((0,-.27,0)),p+Vector((0,.27,0)),.15,.15,DARKWOOD,.02)
beam('Lower boom compression brace',(1.40,0,.82),(3.05,0,4.87),.20,.23,DARKWOOD,.03)
cylinder('Brass boom pivot',(.85,0,2.98),.24,.92,BRASS,(0,1,0),32,.025)
for side in [-1,1]:bolt((.85,side*.49,2.98),(0,side,0),.075)

# A complete human-powered treadwheel, with two rims and an internal wooden drum.
PART='Treadwheel'
C=Vector((-1.15,0,2.66));R=1.67
for y in [-.70,.70]:
    for j in range(16):
        a=j*2*pi/16+.004;b=(j+1)*2*pi/16-.004
        o=arc('Segmented oak treadwheel rim',1.49,1.73,a,b,-.085,.085,WOOD,5);o.location=C+Vector((0,y,0));o.rotation_euler.x=pi/2;bevel(o,.018,3)
    # Six broad spokes leave the interior readable rather than filling the wheel.
    for j in range(6):
        a=j*2*pi/6
        p0=C+Vector((.15*cos(a),y,.15*sin(a)));p1=C+Vector((1.53*cos(a),y,1.53*sin(a)))
        beam('Wheel radial oak spoke',p0,p1,.14,.145,WOOD,.023)
        for rr in [.31,1.39]:
            p=C+Vector((rr*cos(a),y+(-.105 if y<0 else .105),rr*sin(a)));bolt(p,(0,-1 if y<0 else 1,0),.035)
    cylinder('Wooden wheel hub',(C.x,y,C.z),.255,.24,DARKWOOD,(0,1,0),40,.02)
    cylinder('Brass hub face',(C.x,y+(-.14 if y<0 else .14),C.z),.185,.065,BRASS,(0,1,0),32,.015)
    # Small brass joining straps sit across the two-piece rim seams.
    for j in range(8):
        a=j*2*pi/8;pos=C+Vector((1.61*cos(a),y+(-.102 if y<0 else .102),1.61*sin(a)))
        ob=box('Wheel brass rim joint',pos,(.25,.035,.10),BRASS,.016);ob.rotation_euler.y=-a+pi/2
        bolt(pos+Vector((0,-.025 if y<0 else .025,0)),(0,-1 if y<0 else 1,0),.025)
for j in range(42):
    a=j*2*pi/42
    pos=C+Vector((1.585*cos(a),0,1.585*sin(a)))
    o=box('Inner treadwheel walking slat',pos,(.223,1.35,.095),LIGHTWOOD,.018);o.rotation_euler.y=pi/2-a;o['grain_axis']=1
cylinder('Full horizontal oak axle',C,.14,2.86,DARKWOOD,(0,1,0),32,.018)

PART='Wheel bearing frame'
for y in [-1.04,1.04]:
    for x in [-2.42,.12]:
        beam('A-frame bearing leg',(x,y,.80),(-1.15,y,2.77),.22,.23,WOOD,.03)
        plate=box('Foot diagonal brass socket',(x,y,.91),(.32,.30,.25),BRASS,.025)
    beam('A-frame horizontal tie',(-2.15,y,1.16),(-.10,y,1.16),.15,.18,DARKWOOD,.025)
    box('Wheel axle bearing block',(-1.15,y,2.66),(.47,.32,.42),DARKWOOD,.04)
    cylinder('Brass bearing flange',(-1.15,y+(-.19 if y<0 else .19),2.66),.215,.08,BRASS,(0,1,0),32,.018)
    for xoff in [-.13,.13]:bolt((-1.15+xoff,y-.21 if y<0 else y+.21,2.66),(0,-1 if y<0 else 1,0),.033)

PART='Winding drum and rope'
cylinder('Rope winding drum',(-1.15,-1.40,2.66),.31,.36,DARKWOOD,(0,1,0),40,.02)
for y in [-1.61,-1.19]:cylinder('Drum brass cheek',(-1.15,y,2.66),.39,.07,BRASS,(0,1,0),40,.015)
wind=[]
for k in range(440):
    t=k/439;a=t*7*2*pi
    wind.append((-1.15+.337*cos(a),-1.56+.32*t,2.66+.337*sin(a)))
tube('Hemp rope wound seven turns',wind,.024,ROPELIGHT,2)
for side in [-1,1]:
    a=Vector((.85,side*.18,6.22));b=Vector((4.14,side*.265,5.97))
    pts=[tuple(a.lerp(b,t)+Vector((0,0,-.035*sin(pi*t)))) for t in np.linspace(0,1,32)]
    rope('Twin load-bearing boom stay',pts,.036)
    cylinder('Brass stay pin',a,.065,.12,BRASS,(0,1,0),20,.012)
beam('Upper backstay crosshead',(.85,0,6.18),(.85,1.45,6.18),.18,.20,WOOD,.028)
rope('Back mast tension stay',[(.85,1.35,6.23),(-2.55,1.45,.94)],.038)
box('Backstay anchor plate',(-2.55,1.45,.86),(.36,.32,.18),BRASS,.025)
# A front crosshead carries the drive line clear of the treadwheel cage.
cylinder('Guide pulley axle',(.85,-1.30,3.60),.12,.26,BRASS,(0,1,0),24,.012)
ring_y('Guide pulley wooden wheel',(.85,-1.30,3.60),.035,.22,.13,DARKWOOD,48)
rope('Drive rope from drum to boom', [(-1.15,-1.39,3.00),(.74,-1.31,3.76),(.94,-1.27,3.81),(4.15,-.08,6.15)],.028)

PART='Hoist block and iron hook'
for y in [-.225,.225]:
    box('Tip pulley rounded oak cheek',(4.18,y,5.92),(.48,.11,.58),DARKWOOD,.075)
    box('Tip pulley brass reinforcing strip',(4.18,y+(-.065 if y<0 else .065),5.92),(.16,.035,.58),BRASS,.02)
    bolt((4.18,y+(-.09 if y<0 else .09),5.92),(0,-1 if y<0 else 1,0),.065)
cylinder('Upper pulley sheave',(4.18,0,5.92),.24,.30,BRASS,(0,1,0),40,.012)
# Two falls run around the lower pulley and keep the hook vertically beneath the tip.
rope('Right hoist rope fall',[(4.42,-.03,5.92),(4.39,-.03,3.00)],.031)
rope('Left hoist rope fall',[(4.00,-.03,3.00),(3.99,-.03,5.70)],.031)
lower_arc=[(4.19+.20*cos(a),-.03,3.00+.20*sin(a)) for a in np.linspace(pi,2*pi,32)]
rope('Rope around lower pulley',lower_arc,.031,False)
for y in [-.19,.19]:
    box('Lower hanging oak pulley cheek',(4.19,y,3.02),(.39,.10,.53),WOOD,.065)
    box('Lower pulley brass band',(4.19,y+(-.06 if y<0 else .06),3.02),(.14,.03,.53),BRASS,.018)
    bolt((4.19,y+(-.085 if y<0 else .085),3.02),(0,-1 if y<0 else 1,0),.05)
cylinder('Lower hoist sheave',(4.19,0,3.0),.18,.26,BRASS,(0,1,0),32,.01)
ring_y('Iron hook swivel eye',(4.19,0,2.63),.065,.145,.13,IRON,40)
cylinder('Hook swivel spindle',(4.19,0,2.72),.062,.23,IRON,(0,0,1),24,.012)
hook=bezier((4.19,0,2.54),(4.19,0,2.33),(3.99,0,2.18),(4.08,0,2.01),30)
hook+=bezier((4.08,0,2.01),(4.22,0,1.72),(4.76,0,1.88),(4.62,0,2.30),38)[1:]
hvs=[];hfs=[]
for k,p in enumerate(hook):
    t=k/(len(hook)-1);p=Vector(p);tangent=(Vector(hook[min(k+1,len(hook)-1)])-Vector(hook[max(0,k-1)])).normalized()
    u=Vector((0,1,0));v=tangent.cross(u).normalized();rad=(.084+.025*sin(pi*t))*(1-.80*max(0,(t-.72)/.28))
    for j in range(12):hvs.append(tuple(p+(u*cos(j*2*pi/12)+v*sin(j*2*pi/12))*rad))
for k in range(len(hook)-1):
    for j in range(12):hfs.append((k*12+j,k*12+(j+1)%12,(k+1)*12+(j+1)%12,(k+1)*12+j))
hfs.extend([tuple(reversed(range(12))),tuple(range((len(hook)-1)*12,len(hook)*12))])
mesh('Tapered forged iron cargo hook',hvs,hfs,IRON,True)

# Small cargo props are included on the same square quay and joined into the asset.
PART='Cargo crates'
def crate(center,size,angle):
    c=Vector(center);w,d,h=size
    def at(x,y,z):
        return c+Vector((x*cos(angle)-y*sin(angle),x*sin(angle)+y*cos(angle),z))
    for j in range(5):
        for side in [-1,1]:
            o=box('Crate front and rear plank',at(-w/2+(j+.5)*w/5,side*(d/2-.035),0),(w/5-.010,.07,h-.10),LIGHTWOOD,.014);o.rotation_euler.z=angle
            o['grain_axis']=2
    for side in [-1,1]:
        for j in range(4):
            o=box('Crate side board',at(side*(w/2-.035),0,-h/2+(j+.5)*h/4),(.07,d-.10,h/4-.012),WOOD,.014);o.rotation_euler.z=angle
    for j in range(5):
        o=box('Crate lid plank',at(0,-d/2+(j+.5)*d/5,h/2-.035),(w,.98*d/5,.07),LIGHTWOOD,.012);o.rotation_euler.z=angle
    for x in [-w/2+.07,w/2-.07]:
        for y in [-d/2+.055,d/2-.055]:
            o=box('Crate reinforced upright',at(x,y,0),(.115,.11,h),DARKWOOD,.014);o.rotation_euler.z=angle
    for z in [-h/2+.08,h/2-.08]:
        for side in [-1,1]:
            o=box('Crate horizontal batten',at(0,side*(d/2+.01),z),(w,.095,.115),DARKWOOD,.014);o.rotation_euler.z=angle
    for side in [-1,1]:beam('Crate diagonal front brace',at(-w*.39,side*(d/2+.06),-h*.35),at(w*.39,side*(d/2+.06),h*.35),.095,.075,WOOD,.014)
    for x in [-w*.38,w*.38]:
        for z in [-h*.33,h*.33]:
            p=at(x,-d/2-.065,z);cylinder('Dark crate nail',p,.017,.012,IRON,(sin(angle),-cos(angle),0),10,.002)
crate((-1.05,-2.27,.60+.47),(.95,.88,.94),-.10)
crate((-.94,-2.22,1.54+.31),(.63,.61,.62),.07)
crate((1.18,-2.25,.60+.38),(.82,.78,.76),.12)

PART='Cargo barrel'
BC=Vector((2.27,-1.08,.60));height=1.22
for j in range(16):
    a=j*2*pi/16+.008;b=(j+1)*2*pi/16-.008
    profile=[(0,.355),(.09,.385),(.30,.44),(.61,.465),(.92,.44),(1.13,.385),(1.22,.355)]
    vs=[];fs=[]
    for z,r in profile:
        for rr in [r-.07,r]:
            for aa in [a,b]:vs.append(tuple(BC+Vector((rr*cos(aa),rr*sin(aa),z))))
    for k in range(len(profile)-1):
        q=k*4;n=q+4;fs.extend([(q,q+1,n+1,n),(q+2,n+2,n+3,q+3),(q,n,n+2,q+2),(q+1,q+3,n+3,n+1)])
    fs.extend([(0,2,3,1),(24,25,27,26)])
    o=mesh('Bulging wooden barrel stave',vs,fs,LIGHTWOOD);o.location=(0,0,0);o['grain_axis']=2;bevel(o,.008,2)
for z,r in [(.16,.405),(.42,.458),(.81,.458),(1.06,.405)]:
    ob=arc('Barrel dark iron hoop',r-.012,r+.035,0,2*pi,z-.045,z+.045,IRON,64);ob.location=BC
    for a in [-pi/2,0,pi/2,pi]:bolt(BC+Vector(((r+.048)*cos(a),(r+.048)*sin(a),z)),(cos(a),sin(a),0),.019)
cylinder('Barrel lid',BC+Vector((0,0,1.205)),.335,.055,WOOD,(0,0,1),48,.012)
for yy in [-.17,0,.17]:
    half=sqrt(.325**2-yy**2);tube('Barrel lid plank seam',[(BC.x-half,BC.y+yy,BC.z+1.235),(BC.x+half,BC.y+yy,BC.z+1.235)],.006,DARKWOOD,1)
cylinder('Barrel wooden bung',BC+Vector((.13,-.07,1.25)),.043,.022,DARKWOOD,(0,0,1),20,.005)

PART='Spare rope coil'
coil=[]
for j in range(600):
    t=j/599;a=t*5.3*2*pi;r=.10+.34*t
    coil.append((2.40+r*cos(a),1.75+r*sin(a),.625+.018*sin(a*2)))
rope('Spare dockside rope coil',coil,.028,False)

# Convert all assembly pieces to a portable mesh, with named part selections.
objects=[o for o in ASSET.objects if o.type in {'MESH','CURVE'}]
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.convert(target='MESH')
print('ASSEMBLY_CREATED',len(objects),flush=True)
for o in objects:
    m=o.data
    if not m.polygons:continue
    bm=bmesh.new();bm.from_mesh(m)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.to_mesh(m);bm.free();m.update()
    paint=m.color_attributes.new(name='Paint',type='FLOAT_COLOR',domain='CORNER');uvmap=m.uv_layers.new(name='UVMap')
    group=o.vertex_groups.new(name=o.get('part','Assembly'));group.add(list(range(len(m.vertices))),1,'REPLACE')
    axis=int(o.get('grain_axis',2));values=[];uvs=[0.0]*(len(m.loops)*2);mode=o.get('grain_mode','')
    piece=random.uniform(.94,1.045)
    for face in m.polygons:
        color=m.materials[face.material_index].diffuse_color
        coords=[m.vertices[m.loops[i].vertex_index].co for i in face.loop_indices]
        phis=[math.atan2(p.y,p.x) for p in coords]
        if max(phis)-min(phis)>pi:phis=[a+2*pi if a<0 else a for a in phis]
        for li,p,phi in zip(face.loop_indices,coords,phis):
            wp=o.matrix_world@p
            factor=piece*(.945+.04*sin(wp.z*.75)+.015*cos(wp.x*.7+wp.y*.8))
            values.extend((min(1,color[0]*factor),min(1,color[1]*factor),min(1,color[2]*factor),1))
            if mode=='rim':
                u=(sqrt(p.x*p.x+p.y*p.y)/.35 if abs(face.normal.z)>.6 else p.z/.24);v=phi*1.6/1.6
            else:
                other=[k for k in range(3) if k!=axis];minor=min(other,key=lambda k:abs(face.normal[k]));u=p[minor]/.60;v=p[axis]/1.8
                if abs(face.normal[axis])>.8:u=p[other[0]]/.8;v=p[other[1]]/.8
            uvs[li*2]=u;uvs[li*2+1]=v
    paint.data.foreach_set('color',values);uvmap.data.foreach_set('uv',uvs);m.color_attributes.active_color=paint
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();asset=bpy.context.object;asset.name='Harbor_Treadwheel_Crane'
bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
asset['Design']='Anime fantasy wooden harbor treadwheel crane, brass fittings, ropes, iron hook, 3 crates and barrel on square stone quay'
asset['Asset']='Single joined mesh, flat base at Z=0, no background or ground plane'
asset['Paint']='Soft grain textures and Paint vertex colors; texture images packed in BLEND and embedded in GLB'
asset['Assembly']='Named vertex groups preserve wheel, frame, ropes, hook and cargo selections'
asset['Animation']='Static asset; the wheel, rope and hook are not rigged'
asset.asset_mark()

PRESENT=bpy.data.collections.new('90 | Camera and soft studio lighting');bpy.context.scene.collection.children.link(PRESENT);COL=PRESENT
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
world=bpy.data.worlds.new('Soft daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.69,.79,.91,1);world.node_tree.nodes['Background'].inputs[1].default_value=.48
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,p,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;d.color=color;o=bpy.data.objects.new(name,d);PRESENT.objects.link(o);o.location=p;aim(o,(0,0,2.5))
area('Warm soft key',(-5,-8,12),1850,7,(1,.87,.69));area('Cool broad fill',(7,-4,9),1250,6,(.77,.88,1));area('Amber rear rim',(1,7,10),1850,6,(1,.89,.70))
def camera(name,p,target,scale):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);PRESENT.objects.link(o);o.location=p;aim(o,target);d.type='ORTHO';d.ortho_scale=scale;return o
cam=camera('Main asset view',(11,-18,12),(.40,0,2.8),11.4)
rear=camera('Rear asset view',(10,17,11),(.35,0,2.8),11.4)
detail=camera('Wheel and rigging detail',(-4.8,-10,6.4),(-.45,-.15,2.8),6.2)
scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1450;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
bpy.ops.object.select_all(action='DESELECT');asset.select_set(True);bpy.context.view_layer.objects.active=asset
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_distance=15;ar.spaces.active.region_3d.view_location=(.2,0,2.5)
            ar.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion();ar.spaces.active.shading.type='MATERIAL';ar.spaces.active.overlay.show_floor=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Harbor_Crane.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Harbor_Crane.glb'),export_format='GLB',use_selection=True,export_vertex_color='ACTIVE',export_materials='EXPORT',export_cameras=False,export_lights=False)
stats={'mesh_objects':1,'vertices':len(asset.data.vertices),'triangles':sum(len(p.vertices)-2 for p in asset.data.polygons),'square_quay_m':7,'wheel_outer_diameter_m':3.46,'wheel_width_m':1.57,'cargo_crates':3,'barrels':1,'ground_plane':False,'background':False,'static_asset':True,'part_groups':[g.name for g in asset.vertex_groups]}
with open(os.path.join(OUT,'Harbor_Crane_info.json'),'w',encoding='utf8') as f:json.dump(stats,f,indent=2)
print('MODEL_SAVED',stats,flush=True)
scene.render.filepath=os.path.join(OUT,'Harbor_Crane_preview.png');bpy.ops.render.render(write_still=True)
scene.camera=rear;scene.render.filepath=os.path.join(OUT,'Harbor_Crane_rear.png');bpy.ops.render.render(write_still=True)
scene.camera=detail;scene.render.resolution_x=1500;scene.render.resolution_y=1400
scene.render.filepath=os.path.join(OUT,'Harbor_Crane_detail.png');bpy.ops.render.render(write_still=True)
print('COMPLETE',flush=True)
