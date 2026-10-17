import bpy,bmesh,math,os,sys,json,random,argparse
import numpy as np
from math import pi,sin,cos,sqrt
from mathutils import Vector

parser=argparse.ArgumentParser();parser.add_argument('--output',default=os.path.dirname(os.path.abspath(__file__)))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=os.path.abspath(args.output);os.makedirs(OUT,exist_ok=True)
random.seed(84)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
ASSET=bpy.data.collections.new('01 | Street vendor cart — one mesh');bpy.context.scene.collection.children.link(ASSET)
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
    m=o.modifiers.new('Soft anime silhouette edges','BEVEL');m.width=w*1.3;m.segments=n
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
    bpy.ops.mesh.primitive_uv_sphere_add(segments=max(n,32) if 'apple' in name.lower() else n,ring_count=16 if 'apple' in name.lower() else 10,location=p);o=put(bpy.context.object,name,mat);o.scale=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for f in o.data.polygons:f.use_smooth=True
    return o
def tube(name,pts,r,mat,n=2):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=n;c.use_fill_caps=True
    closed=len(pts)>3 and (Vector(pts[0])-Vector(pts[-1])).length<1e-5
    if closed:pts=pts[:-1]
    s=c.splines.new('POLY');s.points.add(len(pts)-1);s.use_cyclic_u=closed
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
waves=xx*7+.10*np.sin(yy*2*pi)+.10*(broad-.5)
grain=.007*np.sin(waves*2*pi)+.003*np.sin(waves*4*pi)
tone=.97+.045*(broad-.5)+grain
WOODTEX=make_image('Vendor_Cart_wood_color',np.clip(tone[:,:,None]*np.array([.68,.385,.15]),0,1))
def material(name,color,rough=.95,metal=0,tex=None):
    # Direct colour output is a portable KHR_materials_unlit material.
    # Shape lighting is painted into vertex colours below, without PBR reflections.
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1);PALETTE[name]=color
    ns=m.node_tree.nodes;ns.clear();out=ns.new('ShaderNodeOutputMaterial')
    vc=ns.new('ShaderNodeVertexColor');vc.layer_name='Paint';vc.label='Anime painted colour and cel tones'
    if tex:
        im=ns.new('ShaderNodeTexImage');im.image=tex;im.extension='REPEAT'
        mix=ns.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        m.node_tree.links.new(im.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(vc.outputs['Color'],mix.inputs[2])
        m.node_tree.links.new(mix.outputs[0],out.inputs['Surface'])
    else:m.node_tree.links.new(vc.outputs['Color'],out.inputs['Surface'])
    return m
WOOD=material('Honey oak — painted grain',(.98,.93,.85),tex=WOODTEX)
DARKWOOD=material('Aged oak joinery',(.72,.63,.48),tex=WOODTEX)
LIGHTWOOD=material('Golden crate and barrel wood',(1,.98,.92),tex=WOODTEX)
BRASS=material('Painted warm gold fittings',(.90,.61,.21))
IRON=material('Painted blue charcoal wheel rims',(.15,.20,.25))
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


# Materials use soft, deliberately restrained colour variation rather than outlines.
RED=material('Anime strawberry red canopy',(.81,.055,.065))
CREAM=material('Anime warm white canopy',(.98,.94,.81))
WICKER=material('Honey wicker',(.54,.29,.095),.85)
WICKERLIGHT=material('Woven straw highlights',(.71,.43,.17),.85)
APPLE=material('Painted ruby red apples',(.86,.030,.045))
APPLELIGHT=material('Painted coral apple blush',(.98,.075,.045))
LEAF=material('Herbs fresh green',(.21,.47,.085))
LEAFLIGHT=material('Herbs sunlit green',(.40,.64,.13))
LEAFDARK=material('Herbs forest green',(.085,.29,.055))
STEM=material('Apple and herb stems',(.22,.115,.032),.9)
BREAD=material('Anime honey gold bread',(.93,.56,.19))
BREADLIGHT=material('Painted pale bread scores',(.99,.84,.49))
CLAY=material('Painted apricot clay',(.79,.34,.19))
CLAYLIGHT=material('Painted cream clay',(.91,.72,.42))
CLAYDARK=material('Pot interior',(.30,.14,.062),.88)
CLOTH=material('Linen bread napkin',(.90,.78,.54),.9)

def lathe(name,profile,mat,n=40,origin=(0,0,0)):
    # A closed radial profile, with no zero-radius duplicate poles.
    vs=[]
    for r,z in profile:
        vs.extend((r*cos(j*2*pi/n),r*sin(j*2*pi/n),z) for j in range(n))
    fs=[]
    for k in range(len(profile)):
        q=(k+1)%len(profile)
        for j in range(n):
            h=(j+1)%n;fs.append((k*n+j,k*n+h,q*n+h,q*n+j))
    o=mesh(name,vs,fs,mat,True);o.location=origin;return o

def leaf(name,start,end,width,mat):
    a=Vector(start);b=Vector(end);d=b-a
    u=d.cross(Vector((0,0,1)))
    if u.length<.001:u=d.cross(Vector((0,1,0)))
    u.normalize();v=d.normalized().cross(u)
    border=[a,a+d*.27+u*width*.72,a+d*.56+u*width,b,a+d*.56-u*width,a+d*.27-u*width*.72]
    mid=a+d*.49
    vs=[tuple(p) for p in border]+[tuple(mid+v*width*.22),tuple(mid-v*.005)]
    fs=[]
    for j in range(6):fs.extend([(j,(j+1)%6,6),((j+1)%6,j,7)])
    return mesh(name,vs,fs,mat,True)

PART='01 Cart body and counter'
# The asset itself rests at Z=0 on its two tyres and two short wooden feet.
box('Oak underfloor',(0,0,.55),(2.18,1.29,.13),DARKWOOD,.035)
for y in [-.52,.52]:beam('Chassis oak rail',(-1.13,y,.47),(1.13,y,.47),.13,.15,DARKWOOD,.02)
for x in [-.98,.98]:
    for y in [-.57,.57]:
        box('Cart corner upright',(x,y,.875),(.13,.13,.79),WOOD,.025)
        bolt((x,y-.075,.65),r=.026)
for j in range(6):
    x=-.84+j*.336
    box('Front vertical oak panelling',(x,-.605,.88),(.324,.065,.60),WOOD,.018)
    box('Back vertical oak panelling',(x,.605,.88),(.324,.065,.60),WOOD,.018)
for side in [-1,1]:
    for j in range(3):box('Side oak panelling',(side*1.035,-.40+j*.40,.88),(.07,.388,.60),WOOD,.025)
for y in [-.66,.66]:
    box('Panel lower moulding',(0,y,.61),(2.15,.095,.10),DARKWOOD,.016)
    box('Panel upper moulding',(0,y,1.16),(2.15,.095,.10),LIGHTWOOD,.016)
    beam('Panel diagonal brace',(-.88,y,.67),(.88,y,1.1),.075,.07,LIGHTWOOD,.015)
for j in range(4):box('Broad counter board',(0,-.585+j*.39,1.28),(2.54,.381,.15),LIGHTWOOD,.035)
for x in [-1.24,1.24]:box('Counter end trim',(x,0,1.27),(.075,1.57,.17),WOOD,.02)
for x in [-.82,.82]:
    box('Front stabilising foot',(x,-.52,.245),(.115,.14,.49),DARKWOOD,.018)
    box('Brass foot shoe',(x,-.52,.038),(.13,.16,.076),BRASS,.012)
    beam('Rear push handle',(x,.55,.68),(x,1.82,.82),.11,.12,WOOD,.025)
    cylinder('Round handle grip',(x,1.73,.81),.075,.32,DARKWOOD,(0,1,.11),24,.014)
    cylinder('Handle brass endcap',(x,1.90,.83),.079,.035,BRASS,(0,1,.11),24,.006)

PART='02 Two wooden wheels'
cylinder('Single axle',(0,.08,.64),.075,2.97,IRON,(1,0,0),24,.01)
for side in [-1,1]:
    center=Vector((side*1.29,.08,.64))
    # Rounded iron tyres reach the flat contact level Z=0 exactly.
    o=arc('Continuous iron wheel tyre',.598,.64,0,2*pi,-.10,.10,IRON,64);o.location=center;o.rotation_euler.y=pi/2;bevel(o,.008,2)
    for j in range(12):
        o=arc('Jointed oak wheel felloe',.505,.610,j*2*pi/12+.003,(j+1)*2*pi/12-.003,-.085,.085,WOOD,5)
        o.location=center;o.rotation_euler.y=pi/2;bevel(o,.01,2)
    for j in range(6):
        a=j*2*pi/6
        p0=center+Vector((0,.10*cos(a),.10*sin(a)))
        p1=center+Vector((0,.535*cos(a),.535*sin(a)))
        beam('Rounded wooden wheel spoke',p0,p1,.105,.105,LIGHTWOOD,.025)
    cylinder('Oak wheel hub',center,.145,.30,DARKWOOD,(1,0,0),32,.018)
    cylinder('Brass hub cap',center+Vector((side*.17,0,0)),.098,.075,BRASS,(1,0,0),24,.015)
    for j in range(6):
        a=j*2*pi/6
        bolt(center+Vector((side*.107,.555*cos(a),.555*sin(a))),(side,0,0),.019)

PART='03 Canopy wooden frame'
for x in [-1.11,1.11]:
    for y in [-.65,.65]:
        cylinder('Awning wooden pole',(x,y,1.85),.046,1.82,WOOD,n=20,w=.01)
        cylinder('Pole brass collar',(x,y,1.33),.061,.085,BRASS,n=20,w=.008)
        ball('Rounded pole finial',(x,y,2.73),(.055,.055,.055),LIGHTWOOD)
        for z in [2.64,2.68]:
            tube('Pole cotton lashing',[(x+.056*cos(t),y+.056*sin(t),z) for t in np.linspace(0,2*pi,25)],.012,CREAM,1)
    bow=[]
    for y in np.linspace(-.96,.96,33):bow.append((x,y,2.66+.31*cos(pi*y/1.92)-.055*cos(pi*x/2.84)))
    tube('Curved oak roof rib',bow,.035,WOOD,2)
for y in [-.65,.65]:beam('Horizontal canopy crossbeam',(-1.16,y,2.69),(1.16,y,2.69),.065,.065,WOOD,.012)
beam('Roof ridge beam',(-1.25,0,2.916),(1.25,0,2.916),.055,.065,LIGHTWOOD,.012)
for x in [-1.11,1.11]:
    for y in [-.65,.65]:beam('Small canopy corner brace',(x,y,2.37),(x*.75,y,2.68),.038,.045,WOOD,.009)

PART='04 Red and ivory cloth canopy'
W=2.88;D=1.98;STRIPES=10
def roof_z(x,y):return 2.70+.31*cos(pi*y/D)-.055*cos(pi*x/W)
for stripe in range(STRIPES):
    mat=RED if stripe%2==0 else CREAM
    x0=-W/2+stripe*W/STRIPES;x1=x0+W/STRIPES
    vs=[];fs=[];nx=4;ny=24
    for i in range(nx+1):
        x=x0+(x1-x0)*i/nx
        for j in range(ny+1):
            y=-D/2+D*j/ny;vs.append((x,y,roof_z(x,y)))
    for i in range(nx):
        for j in range(ny):
            a=i*(ny+1)+j;fs.append((a,a+ny+1,a+ny+2,a+1))
    o=mesh('Cotton roof stripe',vs,fs,mat,True)
    mod=o.modifiers.new('Real fabric thickness','SOLIDIFY');mod.thickness=.013
    for side in [-1,1]:
        vs=[];fs=[]
        for i in range(13):
            t=i/12;x=x0+(x1-x0)*t;y=side*D/2;z=roof_z(x,y)
            vs.extend([(x,y,z+.002),(x,y+side*.025,z-.135-.075*sin(pi*t))])
        for i in range(12):a=i*2;fs.append((a,a+2,a+3,a+1))
        o=mesh('Scalloped striped fabric valance',vs,fs,mat,True)
        mod=o.modifiers.new('Hem fabric thickness','SOLIDIFY');mod.thickness=.014
for x in [-W/2,W/2]:
    tube('Ivory sewn canopy edge',[(x,y,roof_z(x,y)+.006) for y in np.linspace(-D/2,D/2,40)],.009,CREAM,1)

PART='05 Wicker baskets and red apples'
def basket(name,p,r=.30,h=.20):
    x,y,z=p
    profile=[(.04,0),(.72*r,0),(.95*r,.05),(r,h-.025),(.96*r,h),(.88*r,h),(.84*r,.055),(.04,.04)]
    lathe(name+' woven body',profile,WICKER,40,p)
    cylinder(name+' inside floor',(x,y,z+.028),r*.72,.035,WICKER,n=32,w=.005)
    def weave_radius(zz):
        if zz<.05:return r*(.72+.23*zz/.05)+.005
        return r*(.95+.05*min(1,(zz-.05)/(h-.075)))+.005
    for zz in np.linspace(.05,h-.02,4):
        rr=weave_radius(zz)
        tube(name+' horizontal willow weave',[(x+rr*cos(a),y+rr*sin(a),z+zz+.004*sin(20*a)) for a in np.linspace(0,2*pi,121)],.010,WICKERLIGHT,1)
    for j in range(14):
        a=j*2*pi/14
        pts=[]
        for t in np.linspace(0,1,13):
            zz=.02+t*(h-.025);rr=weave_radius(zz)+.005*sin(t*pi*10);aa=a+.015*sin(t*pi*10)
            pts.append((x+rr*cos(aa),y+rr*sin(aa),z+zz))
        tube(name+' upright willow weave',pts,.009,WICKERLIGHT,1)
    for zz in [h-.012,h+.006]:tube(name+' bound basket lip',[(x+r*.965*cos(a),y+r*.965*sin(a),z+zz) for a in np.linspace(0,2*pi,81)],.012,WICKERLIGHT,1)

apple_count=0
for index,(x,y,r) in enumerate([(-.73,-.31,.31),(-.11,-.31,.27)]):
    basket('Apple basket '+str(index+1),(x,y,1.355),r,.19)
    fruit=[]
    for j in range(6):
        a=j*2*pi/6+.2;fruit.append((x+r*.58*cos(a),y+r*.58*sin(a),1.58+random.uniform(-.01,.01)))
    fruit.append((x,y,1.61))
    if index==0:fruit.extend([(x-.08,y-.02,1.72),(x+.08,y+.05,1.73)])
    for k,p in enumerate(fruit):
        rr=random.uniform(.087,.105);o=ball('Rounded red apple',p,(rr,rr,rr*.89),APPLE if k%3 else APPLELIGHT,20)
        # A shallow apple indentation and a woody stem give the fruit its readable silhouette.
        for v in o.data.vertices:
            if v.co.z>rr*.55:
                radial=sqrt(v.co.x*v.co.x+v.co.y*v.co.y);v.co.z-=.022*math.exp(-radial*radial/(rr*.30)**2)
        tube('Apple stem',[Vector(p)+Vector((0,0,rr*.65)),Vector(p)+Vector((.01,.004,rr+ .023))],.007,STEM,1)
        if k%2==0:leaf('Apple green leaf',Vector(p)+Vector((0,0,rr+.004)),Vector(p)+Vector((.063,.032,rr+.027)),.022,LEAFLIGHT)
        apple_count+=1

PART='06 Bread tray and golden loaves'
box('Bread tray wooden floor',(.71,-.22,1.39),(.92,.86,.055),WOOD,.02)
for x in [.24,1.18]:box('Bread tray side lip',(x,-.22,1.44),(.045,.87,.12),WICKERLIGHT,.015)
for y in [-.64,.20]:box('Bread tray end lip',(.71,y,1.44),(.95,.04,.12),WICKERLIGHT,.012)
o=box('Soft folded linen under bread',(.71,-.24,1.429),(.87,.75,.025),CLOTH,.02);o.rotation_euler.z=-.06
for j in range(3):
    p=Vector((.45+j*.235,-.22+(j%2)*.04,1.55));ang=-.18+.15*j
    o=ball('Golden long bread loaf',p,(.113,.30,.132),BREAD,24);o.rotation_euler.z=ang
    def localbread(x,y,z):return p+Vector((x*cos(ang)-y*sin(ang),x*sin(ang)+y*cos(ang),z))
    for v in [-.15,0,.15]:
        tube('Pale diagonal bread score',[localbread(.061*t,v+.035*t,.126-.021*t*t) for t in np.linspace(-1,1,13)],.009,BREADLIGHT,1)
roundp=Vector((.76,.07,1.67));ball('Small round golden bun',roundp,(.16,.15,.13),BREAD,24)
for direction in [-1,1]:tube('Round loaf cross score',[roundp+Vector((t*.10,direction*t*.065,.132-.05*t*t)) for t in np.linspace(-1,1,17)],.009,BREADLIGHT,1)

PART='07 Small clay jars'
def jar(name,p,r,h,mat):
    profile=[(.055*r,0),(.64*r,0),(.92*r,.12*h),(r,.43*h),(.88*r,.68*h),(.59*r,.82*h),(.58*r,.95*h),(.68*r,.97*h),(.68*r,h),(.48*r,h),(.47*r,.85*h),(.72*r,.67*h),(.84*r,.40*h),(.65*r,.12*h),(.055*r,.12*h)]
    lathe(name,profile,mat,40,p)
    cylinder('Closed pot inner floor',Vector(p)+Vector((0,0,h*.06)),r*.66,h*.08,CLAYDARK,n=32,w=.004)
    for z,rr in [(h*.98,r*.63),(h*.80,r*.60)]:
        tube('Pot rounded clay rim',[(p[0]+rr*cos(a),p[1]+rr*sin(a),p[2]+z) for a in np.linspace(0,2*pi,65)],r*.045,mat,1)
    return p[2]+h
for j,(x,y,r,h) in enumerate([(-.85,.39,.145,.35),(-.43,.40,.115,.26),(.03,.42,.17,.40),(.47,.45,.105,.25),(.97,.43,.13,.32)]):
    jar('Open clay pantry jar',(x,y,1.35),r,h,CLAY if j%2==0 else CLAYLIGHT)
    if j in [0,2,4]:
        pts=[(x+r*.72+r*.45*sin(t),y,1.35+h*.62+h*.23*cos(t)) for t in np.linspace(0,pi,25)]
        tube('Little clay jar handle',pts,r*.12,CLAY if j%2==0 else CLAYLIGHT,2)

PART='08 Hanging green herb bundles'
for bundle,(x,y,z) in enumerate([(-.76,-.54,2.48),(-.15,-.54,2.48),(.68,-.54,2.48)]):
    tube('Herb hanging hemp loop',[(x+.021*cos(a),y+.01,z+.105+.105*sin(a)) for a in np.linspace(0,2*pi,33)],.010,ROPELIGHT,1)
    # Bunches hang upside down, with splayed leafy tips below the tied stalks.
    for k in range(5):
        a=k*2*pi/5+bundle*.6;length=random.uniform(.35,.48)
        start=Vector((x+.012*cos(a),y+.012*sin(a),z))
        end=Vector((x+.10*cos(a),y+.085*sin(a),z-length))
        tube('Hanging herb stem',[start,start.lerp(end,.5)+Vector((.008,0,0)),end],.0045,LEAFDARK,1)
        for j in range(2,5):
            t=j/5;base=start.lerp(end,t);aa=a+j*.75
            for side in [-1,1]:
                direction=Vector((side*cos(aa),side*sin(aa),-.24)).normalized()
                tip=base+direction*random.uniform(.105,.135)
                leaf('Fresh hanging herb leaf',base,tip,random.uniform(.036,.046),[LEAF,LEAFLIGHT,LEAFDARK][(k+j+bundle)%3])
    for zz in [z-.035,z-.017]:tube('Twine herb tie',[(x+.029*cos(a),y+.029*sin(a),zz) for a in np.linspace(0,2*pi,25)],.008,ROPELIGHT,1)
    tube('Loose herb tie ends',[(x,y-.03,z-.025),(x-.05,y-.035,z-.09),(x-.065,y-.03,z-.07)],.006,ROPELIGHT,1)


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
    piece=random.uniform(.975,1.025)
    for face in m.polygons:
        color=m.materials[face.material_index].diffuse_color
        coords=[m.vertices[m.loops[i].vertex_index].co for i in face.loop_indices]
        phis=[math.atan2(p.y,p.x) for p in coords]
        if max(phis)-min(phis)>pi:phis=[a+2*pi if a<0 else a for a in phis]
        for li,p,phi in zip(face.loop_indices,coords,phis):
            wp=o.matrix_world@p
            factor=piece*(.98+.02*sin(wp.z*.75))
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
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();asset=bpy.context.object;asset.name='Street_Vendor_Cart'
bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
# A stockier silhouette, simplified details and painted cel shading preserve the
# requested anime look in Blender and in standard glTF viewers alike.
from mathutils.bvhtree import BVHTree
m=asset.data
for v in m.vertices:
    if v.co.z>1.35:v.co.z=1.35+(v.co.z-1.35)*.90
m.update()
coordinates=[v.co.copy() for v in m.vertices]
tree=BVHTree.FromPolygons(coordinates,[list(p.vertices) for p in m.polygons],all_triangles=False)
light=Vector((-.45,-.65,.88)).normalized()
paint=m.color_attributes['Paint']
normal_array=np.empty(len(m.loops)*3,dtype=np.float32);m.corner_normals.foreach_get('vector',normal_array);normal_array=normal_array.reshape((-1,3))
colors=np.empty(len(m.loops)*4,dtype=np.float32);paint.data.foreach_get('color',colors);colors=colors.reshape((-1,4))
vertex_occlusion={}
def step(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
for poly in m.polygons:
    mat=m.materials[poly.material_index]
    is_apple='apple' in mat.name.lower()
    is_bread='bread' in mat.name.lower()
    for li in poly.loop_indices:
        vid=m.loops[li].vertex_index;p=coordinates[vid];n=Vector(normal_array[li]);n.normalize()
        d=n.dot(light)
        cel=.66+.17*step(-.40,-.20,d)+.17*step(.40,.58,d)
        # Very short ambient rays darken only contacts and crevices, keeping the
        # broad painted surfaces clean and avoiding realistic cast shadows.
        key=(vid,round(n.x,1),round(n.y,1),round(n.z,1))
        if key not in vertex_occlusion:
            ref=Vector((0,0,1)) if abs(n.z)<.9 else Vector((1,0,0))
            u=n.cross(ref).normalized();v=n.cross(u).normalized();hits=0
            for ray in [n,(n+u*.8).normalized(),(n-u*.8).normalized(),(n+v*.8).normalized(),(n-v*.8).normalized()]:
                if tree.ray_cast(p+n*.004,ray,.16)[0] is not None:hits+=1
            vertex_occlusion[key]=1-.25*hits/5
        factor=cel*vertex_occlusion[key]*(.985+.015*sin(p.z*2.1))
        tint=np.array((1,.975,.955)) if d>.25 else np.array((.94,.96,1.025))
        rgb=colors[li,:3]*factor*tint
        # Small flat brush highlights replace glossy specular spots on fruit.
        if is_apple:
            h=n.dot(Vector((-.40,-.73,.56)).normalized())
            mask=step(.946,.985,h)*.72
            rgb=rgb*(1-mask)+np.array((1,.64,.46))*mask
        if is_bread and 'scores' not in mat.name.lower():
            warm=step(.25,.85,n.z)*.13
            rgb=rgb*(1-warm)+np.array((1,.79,.39))*warm
        colors[li,:3]=np.clip(rgb,0,1)
paint.data.foreach_set('color',colors.ravel());m.update()
print('ANIME_PAINT_BAKED',len(vertex_occlusion),'corner samples',flush=True)

asset['Design']='Hand-painted anime fantasy street vendor cart; simplified forms, painted cel tones; striped red and ivory canopy, two wooden wheels, apples, bread, clay jars, hanging herbs'
asset['Asset']='Single joined mesh; level wheel and foot contact at Z=0; no ground plane or background'
asset['Paint']='Portable unlit materials; soft cel lighting and painted highlights baked into Paint; subtle packed wood colour texture'
asset['Assembly']='Eight named vertex groups preserve component selections'
asset['Animation']='Static mesh; wheels are not rigged'
asset.asset_mark()

PRESENT=bpy.data.collections.new('90 | Camera and soft studio lighting');bpy.context.scene.collection.children.link(PRESENT);COL=PRESENT
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
world=bpy.data.worlds.new('Soft daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.73,.81,.91,1);world.node_tree.nodes['Background'].inputs[1].default_value=.48
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,p,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;d.color=color;o=bpy.data.objects.new(name,d);PRESENT.objects.link(o);o.location=p;aim(o,(0,0,1.5))
area('Warm soft key',(-3,-5,7),680,5,(1,.88,.73));area('Cool broad fill',(5,-3,5),500,4,(.82,.9,1));area('Soft rear rim',(0,5,6),780,4,(1,.92,.78))
def camera(name,p,target,scale):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);PRESENT.objects.link(o);o.location=p;aim(o,target);d.type='ORTHO';d.ortho_scale=scale;return o
cam=camera('Main asset view',(6.8,-10,5.2),(0,.10,1.48),4.45)
rear=camera('Rear asset view',(-7,10,5.6),(0,.3,1.45),4.7)
detail=camera('Produce counter detail',(3.6,-7,4.0),(-.03,-.04,1.68),2.95)
scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.view_settings.exposure=0;scene.view_settings.gamma=1
bpy.ops.object.select_all(action='DESELECT');asset.select_set(True);bpy.context.view_layer.objects.active=asset
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_distance=6;ar.spaces.active.region_3d.view_location=(0,0,1.5)
            ar.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion();ar.spaces.active.shading.type='MATERIAL';ar.spaces.active.overlay.show_floor=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Vendor_Cart.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Vendor_Cart.glb'),export_format='GLB',use_selection=True,export_vertex_color='ACTIVE',export_materials='EXPORT',export_cameras=False,export_lights=False)
coords=np.array([v.co[:] for v in asset.data.vertices])
stats={'mesh_objects':1,'vertices':len(asset.data.vertices),'triangles':sum(len(p.vertices)-2 for p in asset.data.polygons),'dimensions_m':list(np.ptp(coords,axis=0)),'bounds_min_m':list(coords.min(axis=0)),'bounds_max_m':list(coords.max(axis=0)),'wooden_wheels':2,'red_apples':apple_count,'apple_baskets':2,'bread_loaves':4,'clay_jars':5,'herb_bundles':3,'ground_plane':False,'background':False,'static_asset':True,'style':'Hand-painted anime / soft cel tones','lighting':'Baked into vertex colours; unlit portable materials','part_groups':[g.name for g in asset.vertex_groups]}
with open(os.path.join(OUT,'Vendor_Cart_info.json'),'w',encoding='utf8') as f:json.dump(stats,f,indent=2)
print('MODEL_SAVED',stats,flush=True)
scene.render.filepath=os.path.join(OUT,'Vendor_Cart_preview.png');bpy.ops.render.render(write_still=True)
scene.camera=rear;scene.render.filepath=os.path.join(OUT,'Vendor_Cart_rear.png');bpy.ops.render.render(write_still=True)
scene.camera=detail;scene.render.resolution_x=1500;scene.render.resolution_y=1400
scene.render.filepath=os.path.join(OUT,'Vendor_Cart_detail.png');bpy.ops.render.render(write_still=True)
print('COMPLETE',flush=True)
