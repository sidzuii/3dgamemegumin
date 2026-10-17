import bpy,bmesh,math,os,sys,json,random,argparse
import numpy as np
from math import pi,sin,cos,sqrt
from mathutils import Vector

parser=argparse.ArgumentParser();parser.add_argument('--output',default=os.path.dirname(os.path.abspath(__file__)))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=os.path.abspath(args.output);os.makedirs(OUT,exist_ok=True)
random.seed(125)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
ASSET=bpy.data.collections.new('01 | Merchant sailing ship — one mesh');bpy.context.scene.collection.children.link(ASSET)
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
WOODTEX=make_image('Merchant_Ship_wood_color',np.clip(tone[:,:,None]*np.array([.68,.385,.15]),0,1))
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




RED=material('Anime vermilion painted stripe',(.78,.032,.045))
CREAM=material('Warm ivory trim',(.97,.91,.73))
SAIL=material('Furled sail warm white',(.97,.95,.87))
SAILSHADE=material('Sail gentle cream folds',(.86,.85,.76))
SAILLIGHT=material('Sail painted light',(.995,.98,.91))
HULLWOOD=material('Warm hull plank variation',(.92,.81,.65),tex=WOODTEX)
GOLD=material('Golden carved figurehead',(.98,.65,.17))
GOLDLIGHT=material('Figurehead painted gold highlights',(1,.82,.32))
TEAL=material('Sea blue cabin glass',(.12,.40,.47))
GLASSLIGHT=material('Painted sky reflection',(.48,.76,.79))
DARK=material('Cabin interior and iron shadows',(.09,.13,.17))

def extrude_z(name,outline,z0,z1,mat,edge=.01):
    n=len(outline);vs=[(x,y,z) for z in [z0,z1] for x,y in outline]
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    fs.extend((j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n))
    o=mesh(name,vs,fs,mat)
    if edge:bevel(o,edge,2)
    return o

XST=np.array([-3.42,-3.05,-2.4,-1.5,-.4,.8,1.8,2.6,3.15,3.58])
WST=np.array([.57,.98,1.32,1.48,1.53,1.47,1.27,.92,.51,.045])
def width(x):return float(np.interp(x,XST,WST))
def bottom(x):return .10+.28*(abs(x)/3.60)**3
def sheer(x):return .23*max(0,(x-1.9)/1.68)**1.6+.16*max(0,(-x-2.0)/1.42)**1.5
RZ=[0,.19,.44,.72,1.00,1.27,1.50]
RW=[.075,.37,.66,.84,.95,1.0,1.0]
def hull_point(x,row,side,offset=0):
    z=bottom(x)+(1.60-bottom(x))*RZ[row]/1.50
    base=width(x)*RW[row]
    half=base+(max(offset,-base*.18) if offset<0 else offset)
    return (x,side*half,z)

PART='01 Rounded plank hull'
# The closed body below the deck has real three-dimensional curvature.
stations=np.linspace(-3.42,3.58,65);vs=[];fs=[]
for x in stations:
    for side,rows in [(1,range(7)),(-1,range(6,-1,-1))]:
        for row in rows:
            xx,yy,zz=hull_point(x,row,side,-.016)
            if row==6:zz=1.535
            vs.append((xx,yy,zz))
ring=14
for k in range(len(stations)-1):
    for j in range(ring):fs.append((k*ring+j,k*ring+(j+1)%ring,(k+1)*ring+(j+1)%ring,(k+1)*ring+j))
fs.extend([tuple(range(ring-1,-1,-1)),tuple((len(stations)-1)*ring+j for j in range(ring))])
mesh('Closed rounded timber hull',vs,fs,DARKWOOD,True)

def hull_board(name,xa,xb,row,side,mat):
    n=max(3,int((xb-xa)*10));xx=np.linspace(xa,xb,n+1);vs=[]
    for offset in [-.004,.025]:
        for level in [row,row+1]:
            for x in xx:
                a=np.array(hull_point(x,level,side,offset));a[2]+=.005 if level==row else -.005
                vs.append(tuple(a))
    m=n+1;fs=[]
    for j in range(n):fs.extend([(j,j+1,m+j+1,m+j),(2*m+j,3*m+j,3*m+j+1,2*m+j+1),(j,2*m+j,2*m+j+1,j+1),(m+j,m+j+1,3*m+j+1,3*m+j)])
    fs.extend([(0,m,3*m,2*m),(n,2*m+n,3*m+n,m+n)])
    o=mesh(name,vs,fs,mat,True);o['grain_axis']=0;bevel(o,.005,2)
for side in [-1,1]:
    for row in range(6):
        cuts=[-3.42]+[x for x in np.arange(-3.4+(row%2)*.55,3.6,1.13) if -3.40<x<3.56]+[3.58]
        for j,(a,b) in enumerate(zip(cuts,cuts[1:])):
            if b-a>.05:hull_board('Broad curved hull plank',a+.004,b-.004,row,side,RED if row==5 else [WOOD,HULLWOOD,WOOD,LIGHTWOOD][(j+row)%4])
    # A narrow cream border frames the red painted hull stripe.
    for row in [5,6]:tube('Ivory stripe border',[hull_point(x,row,side,.034) for x in np.linspace(-3.40,3.56,100)],.014,CREAM,1)
keel=[(x,0,bottom(x)-.035) for x in np.linspace(-3.4,3.58,70)]
tube('Curved solid oak keel',keel,.063,DARKWOOD,2)
box('Short flat keel shoe',(-.3,0,.042),(1.8,.14,.084),DARKWOOD,.015)
# The rounded upright at the bow conceals the tiny nondegenerate loft endpoint.
tube('Swept bow stem',bezier((3.51,0,.33),(3.70,0,.80),(3.64,0,1.76),(3.76,0,2.37),40),.086,LIGHTWOOD,2)

PART='02 Deck and bulwarks'
outline=[(float(x),width(x)*.982) for x in np.linspace(-3.40,3.54,65)]
outline+= [(float(x),-width(x)*.982) for x in np.linspace(3.54,-3.40,65)]
def clip_y(poly,y,keep_above):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ina=(a[1]>=y) if keep_above else (a[1]<=y);inb=(b[1]>=y) if keep_above else (b[1]<=y)
        if ina:out.append(a)
        if ina!=inb:
            t=(y-a[1])/(b[1]-a[1]);out.append((a[0]+t*(b[0]-a[0]),y))
    return out
for k in range(13):
    lo=-1.55+k*.24+.004;hi=lo+.232
    poly=clip_y(clip_y(outline,lo,True),hi,False)
    if len(poly)>2:
        o=extrude_z('Long pale deck plank',poly,1.53,1.60,LIGHTWOOD,.008);o['grain_axis']=0

def wall_strip(side,xa,xb):
    n=12;vs=[]
    for off in [-.055,.027]:
        for top in [False,True]:
            for x in np.linspace(xa,xb,n+1):vs.append((x,side*(width(x)+off),1.61 if not top else 1.99+sheer(x)))
    m=n+1;fs=[]
    for j in range(n):fs.extend([(j,j+1,m+j+1,m+j),(2*m+j,3*m+j,3*m+j+1,2*m+j+1),(j,2*m+j,2*m+j+1,j+1),(m+j,m+j+1,3*m+j+1,3*m+j)])
    fs.extend([(0,m,3*m,2*m),(n,2*m+n,3*m+n,m+n)])
    return mesh('Low solid wooden bulwark',vs,fs,WOOD,True)
for side in [-1,1]:
    wall_strip(side,-3.4,3.56)
    tube('Rounded gunwale cap',[(x,side*(width(x)-.008),2.01+sheer(x)) for x in np.linspace(-3.4,3.56,90)],.062,LIGHTWOOD,2)
    tube('Bulwark inset moulding',[(x,side*(width(x)+.033),1.72+.12*sheer(x)) for x in np.linspace(-3.4,3.56,90)],.025,HULLWOOD,1)
    for x in np.linspace(-3.1,3.1,10):
        beam('Bulwark rounded timber upright',(x,side*(width(x)-.044),1.59),(x,side*(width(x)-.044),2.01+sheer(x)),.085,.09,LIGHTWOOD,.015)
# Flat stern transom planks and a small external rudder.
for j in range(5):box('Stern transom horizontal plank',(-3.437,0,.70+j*.24),(.06,1.10,.225),HULLWOOD,.015)
box('Stern red stripe',(-3.477,0,1.405),(.035,1.12,.20),RED,.012)
o=box('Rounded external stern rudder',(-3.70,0,.73),(.40,.10,.95),DARKWOOD,.065);o.rotation_euler.y=-.12
for z in [.57,1.03]:box('Rudder golden hinge',(-3.51,0,z),(.24,.16,.085),BRASS,.012)

PART='03 Raised stern cabin and deck'
box('Cabin warm ivory walls',(-2.36,0,2.095),(1.68,1.83,.99),CREAM,.075)
for x in [-3.12,-1.57]:
    for y in [-.90,.90]:box('Cabin carved corner post',(x,y,2.12),(.13,.13,1.05),WOOD,.035)
for y in [-.92,.92]:
    for z in [1.69,2.55]:box('Cabin timber framing',(-2.36,y,z),(1.69,.07,.10),LIGHTWOOD,.018)
    for x in [-2.90,-2.58,-2.26,-1.94,-1.64]:box('Cabin pale wooden vertical batten',(x,y,2.11),(.025,.035,.79),LIGHTWOOD,.008)
roofpoly=[(-3.34,-.97),(-3.18,-1.14),(-1.48,-1.14),(-1.42,-.98),(-1.42,.98),(-1.48,1.14),(-3.18,1.14),(-3.34,.97)]
extrude_z('Raised stern castle deck rim',roofpoly,2.59,2.73,RED,.035)
extrude_z('Raised stern castle walking deck',[(x*.997,y*.975) for x,y in roofpoly],2.73,2.80,LIGHTWOOD,.018)
for y in np.linspace(-.95,.95,9):tube('Quarterdeck board seam',[(-3.25,y,2.806),(-1.49,y,2.806)],.006,HULLWOOD,1)
# A genuinely shaped closed arched door, applied to the cabin front.
def arched_panel(name,x,y,z,w,h,depth,mat):
    shape=[(y-w/2,z),(y+w/2,z),(y+w/2,z+h-w/2)]
    shape += [(y+w/2*cos(a),z+h-w/2+w/2*sin(a)) for a in np.linspace(0,pi,17)[1:]]
    vs=[(xx,yy,zz) for xx in [x-depth/2,x+depth/2] for yy,zz in shape];n=len(shape)
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
    o=mesh(name,vs,fs,mat);bevel(o,.012,2);return o
arched_panel('Arched cabin door outer frame',-1.487,0,1.60,.76,.94,.065,LIGHTWOOD)
arched_panel('Small closed cabin door',-1.44,0,1.64,.60,.82,.045,DARKWOOD)
for y in [-.20,-.10,0,.10,.20]:
    top=2.16+sqrt(max(0,.30**2-y**2))
    tube('Door vertical plank carving',[(-1.413,y,1.68),(-1.413,y,top-.025)],.006,HULLWOOD,1)
for z in [1.82,2.12]:box('Door brass strap hinge',(-1.393,-.21,z),(.035,.15,.045),BRASS,.012)
ball('Door little golden knob',(-1.373,.18,1.96),(.035,.035,.035),BRASS)
for side in [-1,1]:
    p=(-2.42,side*.958,2.15)
    cylinder('Cabin circular blue glass',p,.208,.035,TEAL,(0,1,0),40,.006)
    ring_y('Cabin round brass porthole',(-2.42,side*.986,2.15),.201,.242,.035,BRASS,48)
    beam('Porthole horizontal timber divider',(-2.61,side*1.012,2.15),(-2.23,side*1.012,2.15),.024,.025,LIGHTWOOD,.005)
    beam('Porthole vertical timber divider',(-2.42,side*1.012,1.96),(-2.42,side*1.012,2.34),.024,.025,LIGHTWOOD,.005)
    tube('Porthole painted glass highlight',[(-2.52,side*1.015,2.26),(-2.43,side*1.015,2.31)],.012,GLASSLIGHT,1)
# A short open stair flight follows the starboard side up to the stern deck.
for k in range(8):
    x=-.20-k*.18;top=1.60+(k+1)*.15
    box('Quarterdeck stair tread',(x,-.92,top-.045),(.205,.50,.09),LIGHTWOOD,.018)
for y in [-1.115,-.725]:beam('Quarterdeck stair stringer',(-.06,y,1.51),(-1.62,y,2.75),.075,.085,DARKWOOD,.012)
for side in [-1,1]:
    yy=side*1.07
    for x in [-3.15,-2.60,-2.05,-1.53]:
        if side==-1 and x>-1.8:continue
        cylinder('Stern deck railing post',(x,yy,3.00),.040,.42,WOOD,n=16,w=.009)
        ball('Stern railing rounded cap',(x,yy,3.22),(.052,.052,.052),BRASS)
    end=-1.90 if side==-1 else -1.50
    beam('Stern deck upper handrail',(-3.16,yy,3.17),(end,yy,3.17),.072,.072,LIGHTWOOD,.015)
for y in [-.98,-.48,0,.48,.98]:cylinder('Aft railing post',(-3.23,y,3.00),.04,.42,WOOD,n=16,w=.009)
beam('Aft rounded handrail',(-3.23,-1.08,3.17),(-3.23,1.08,3.17),.072,.072,LIGHTWOOD,.015)
# Small helm on the raised deck, behind the main mast.
box('Helm pedestal',(-2.14,0,2.98),(.17,.18,.36),WOOD,.035)
o=arc('Small wooden steering wheel',.185,.233,0,2*pi,-.035,.035,WOOD,48);o.location=(-2.14,0,3.28);o.rotation_euler.y=pi/2
cylinder('Helm golden hub',(-2.14,0,3.28),.065,.12,BRASS,(1,0,0),24,.01)
for j in range(6):
    a=j*pi/3
    beam('Helm spoke',(-2.14,.045*cos(a),3.28+.045*sin(a)),(-2.14,.29*cos(a),3.28+.29*sin(a)),.030,.032,LIGHTWOOD,.008)
    ball('Helm rounded grip',(-2.14,.29*cos(a),3.28+.29*sin(a)),(.038,.038,.038),WOOD)

PART='04 Single mast and furled white sail'
cylinder('Single tall merchant mast',(.05,0,3.87),.112,4.54,WOOD,n=32,w=.015)
cylinder('Mast deck socket',(.05,0,1.73),.205,.26,DARKWOOD,n=32,w=.025)
for z in [1.89,4.72,5.36,6.05]:cylinder('Mast golden collar',(.05,0,z),.125,.09,BRASS,n=32,w=.008)
ball('Rounded masthead',(.05,0,6.18),(.13,.13,.15),BRASS)
cylinder('Single horizontal wooden yard',(.05,0,5.34),.070,4.72,WOOD,(0,1,0),32,.012)
for y in [-2.38,2.38]:ball('Rounded yard tip',(.05,y,5.34),(.09,.09,.09),BRASS)
# A thick, tied sail bundle lies below the yard; no open sail surface.
vs=[];fs=[];nlong=64;nring=20
for k in range(nlong+1):
    t=k/nlong;y=-2.13+4.26*t
    r=.145+.052*sin(pi*t)**.5+.018*cos(t*12*pi)
    for j in range(nring):
        a=j*2*pi/nring
        fold=1+.06*sin(a*4+t*8*pi)
        vs.append((.05+r*1.02*cos(a)*fold,y,5.075-.045*sin(pi*t)+r*.89*sin(a)*fold))
for k in range(nlong):
    for j in range(nring):fs.append((k*nring+j,k*nring+(j+1)%nring,(k+1)*nring+(j+1)%nring,(k+1)*nring+j))
fs.extend([tuple(range(nring-1,-1,-1)),tuple(nlong*nring+j for j in range(nring))])
o=mesh('Softly rolled and furled white sail',vs,fs,SAIL,True)
o.data.materials.append(SAILSHADE);o.data.materials.append(SAILLIGHT)
for poly in o.data.polygons:
    if poly.index<nlong*nring:
        j=poly.index%nring
        poly.material_index=1 if j in [10,11,12] else (2 if j in [2,3,4] else 0)
for y in [-1.85,-1.10,-.36,.40,1.13,1.86]:
    pts=[]
    for a in np.linspace(0,2*pi,49):pts.append((.05+.218*cos(a),y,5.14+.267*sin(a)))
    tube('Sail bundle rope gasket',pts,.016,ROPELIGHT,1)
    tube('Loose short sail tie',[(.08,y,4.88),(.12,y+.025,4.78),(.10,y+.055,4.81)],.012,ROPELIGHT,1)
for a in [.2,1.7,2.9,4.4]:
    pts=[]
    for k in range(65):
        t=k/64;y=-2.10+4.20*t;r=.145+.052*sin(pi*t)**.5+.018*cos(t*12*pi)
        pts.append((.05+(r+.004)*cos(a),y,5.075-.045*sin(pi*t)+(r+.004)*.89*sin(a)))
    tube('Long gentle painted sail fold',pts,.008,SAILSHADE,1)

PART='05 Rigging and deck fittings'
# Rigging terminates on the model, appropriate to a vessel at rest without a quay.
for side in [-1,1]:
    rope('Forward mast stay',[(.05,0,6.05),(2.75,side*.45,2.10)],.022,False)
    for x in [-.8,.85]:rope('Side mast shroud',[(.05,side*.04,5.75),(x,side*1.35,1.99)],.018,False)
    rope('Stern mast stay',[(.05,0,5.92),(-2.95,side*.86,3.19)],.020,False)
    rope('Yard lift',[(.05,0,6.00),(.05,side*2.10,5.36)],.018,False)
    rope('Yard brace',[(.05,side*2.2,5.34),(-1.0,side*1.25,2.05)],.018,False)
for x in [-2.85,2.45]:
    for side in [-1,1]:
        y=side*(width(x)-.12)
        cylinder('Deck belaying bollard',(x,y,1.90),.065,.44,DARKWOOD,n=20,w=.012)
        beam('Bollard cleat crossbar',(x-.17,y,2.08),(x+.17,y,2.08),.075,.07,LIGHTWOOD,.012)
        cylinder('Bollard golden foot',(x,y,1.72),.10,.07,BRASS,n=20,w=.008)
# Coiled mooring ends are stowed aboard; no external quay geometry.
rope('Stowed bow mooring rope',bezier((2.45,-.86,2.08),(2.82,-.90,2.04),(2.70,-.40,1.64),(2.45,-.36,1.64),28),.026,True)
box('Deck cargo hatch coaming',(.85,0,1.65),(.92,.75,.12),DARKWOOD,.035)
for j in range(5):box('Closed deck hatch plank',(.85,-.28+j*.14,1.73),(.82,.132,.07),LIGHTWOOD,.012)
for x in [.54,1.16]:box('Hatch iron strap',(x,0,1.777),(.045,.68,.025),IRON,.005)
for y in [-.24,.24]:tube('Hatch little rope handle',[(.76,y,1.79),(.78,y,1.86),(.94,y,1.86),(.96,y,1.79)],.014,ROPELIGHT,1)

PART='06 Golden bird figurehead'
# A small carved phoenix/swan figure at the prow, with raised layered wings.
neck=bezier((3.49,0,1.80),(3.76,0,1.87),(3.88,0,2.52),(4.08,0,2.52),40)
tube('Golden curved figurehead neck',neck,.107,GOLD,3)
ball('Golden figurehead breast',(3.63,0,2.03),(.26,.19,.32),GOLD,24)
ball('Golden bird head',(4.08,0,2.54),(.17,.13,.15),GOLDLIGHT,24)
beam('Golden carved bird beak',(4.17,0,2.53),(4.38,0,2.48),.07,.085,GOLD,.02)
for side in [-1,1]:
    ball('Bird tiny dark eye',(4.105,side*.123,2.579),(.025,.012,.023),DARK)
    for j in range(4):
        start=(3.59-j*.032,side*(.10+j*.024),2.05+j*.07)
        end=(3.16-j*.055,side*(.32+j*.075),2.42+j*.14)
        pts=bezier(start,(3.50,side*.32,2.24+j*.07),(3.24,side*(.39+j*.04),2.36+j*.10),end,20)
        tube('Golden wing feather',pts,.055-j*.005,GOLDLIGHT if j%2 else GOLD,2)
    tube('Carved gold wing curl',bezier((3.57,side*.19,2.00),(3.20,side*.38,2.02),(3.18,side*.43,2.47),(3.31,side*.43,2.47),28),.042,GOLDLIGHT,2)
box('Figurehead golden stem mounting',(3.61,0,1.92),(.16,.20,.44),GOLD,.035)

def build_ship_cargo():
    """Build rounded anime cargo on the main deck; preserve the stern stair lane.

    Executed in the main ship script's namespace, using its mesh and material
    helpers. Every individual board, stave, hoop and rope is a closed shell.
    """
    from math import pi, sin, cos, sqrt
    from mathutils import Vector
    global PART

    deck_z = 1.60
    barrel_positions = [(-.70, .89, .72, .255),
                        (.78, .88, .66, .235),
                        (1.45, .80, .62, .220)]
    crate_positions = [(.02, .88, (.57, .55, .58), -.07),
                       (.55, -.90, (.62, .54, .57), .07),
                       (1.40, -.82, (.56, .52, .51), -.09)]
    coil_positions = [(-.65, .35, .215, -.25),
                      (1.72, .35, .185, .55)]

    PART = '07 Deck cargo'

    def barrel(index, x, y, height, radius):
        # Hollow, closed stave wedges. 12 broad pieces give a soft, readable
        # silhouette instead of dense photorealistic plank grain.
        root = Vector((x, y, deck_z))
        profile = [(0, radius*.84), (.085, radius*.90),
                   (.25, radius*.975), (.50, radius),
                   (.75, radius*.975), (.915, radius*.90),
                   (1, radius*.84)]
        for j in range(12):
            a = j*2*pi/12 + .005
            b = (j+1)*2*pi/12 - .005
            vertices, faces = [], []
            for t, outer_r in profile:
                for r in (outer_r-.035, outer_r):
                    for angle in (a, b):
                        vertices.append(tuple(root + Vector((r*cos(angle),
                                                              r*sin(angle),
                                                              t*height))))
            for k in range(len(profile)-1):
                q, n = 4*k, 4*(k+1)
                faces.extend([(q, q+1, n+1, n),
                              (q+2, n+2, n+3, q+3),
                              (q, n, n+2, q+2),
                              (q+1, q+3, n+3, n+1)])
            end = 4*(len(profile)-1)
            faces.extend([(0, 2, 3, 1),
                          (end, end+1, end+3, end+2)])
            o = mesh('Cargo barrel %d | broad stave %02d' % (index, j+1),
                     vertices, faces, LIGHTWOOD if j % 4 else WOOD)
            o['grain_axis'] = 2
            bevel(o, .005, 2)

        for t, rr in ((.16, .943), (.50, 1.015), (.84, .943)):
            half = .020
            band = arc('Cargo barrel %d | iron hoop' % index,
                       radius*rr-.012, radius*rr+.016,
                       0, 2*pi, t*height-half, t*height+half, IRON, 48)
            band.location = root
            bevel(band, .004, 2)
        cap_radius = radius*.80
        for z, name in ((.018, 'bottom'), (height-.025, 'lid')):
            cylinder('Cargo barrel %d | %s' % (index, name),
                     root+Vector((0, 0, z)), cap_radius, .035, WOOD,
                     n=36, w=.007)
        # Broad painted groove lines and a wooden bung make the top readable.
        for yy in (-cap_radius*.33, cap_radius*.33):
            half = sqrt(cap_radius*cap_radius-yy*yy)*.94
            tube('Cargo barrel %d | lid board division' % index,
                 [(x-half, y+yy, deck_z+height-.006),
                  (x+half, y+yy, deck_z+height-.006)],
                 .004, DARKWOOD, 1)
        cylinder('Cargo barrel %d | wooden bung' % index,
                 (x+radius*.30, y-radius*.18, deck_z+height+.001),
                 .024, .020, DARKWOOD, n=16, w=.004)

    def crate(index, x, y, size, angle):
        width, depth, height = size
        root = Vector((x, y, deck_z+height/2))

        def at(dx, dy, dz):
            return root+Vector((dx*cos(angle)-dy*sin(angle),
                                dx*sin(angle)+dy*cos(angle), dz))

        def board(label, p, dimensions, mat=WOOD, edge=.012):
            o = box('Cargo crate %d | %s' % (index, label),
                    at(*p), dimensions, mat, edge)
            o.rotation_euler.z = angle
            return o

        # A closed central shell means gaps between the broad facing boards do
        # not reveal any open crate interior or unfilled back faces.
        board('closed inner box', (0, 0, 0),
              (width-.07, depth-.07, height-.055), DARKWOOD, .015)
        for side in (-1, 1):
            for j in range(3):
                o = board('broad facing plank',
                          (-width/2+(j+.5)*width/3,
                           side*(depth/2-.025), 0),
                          (width/3-.008, .055, height-.055), LIGHTWOOD)
                o['grain_axis'] = 2
            board('side panel', (side*(width/2-.025), 0, 0),
                  (.055, depth-.03, height-.045), WOOD)
        for j in range(2):
            board('broad lid plank',
                  (0, -depth/2+(j+.5)*depth/2, height/2-.024),
                  (width-.01, depth/2-.006, .052), LIGHTWOOD)
        for sx in (-1, 1):
            for sy in (-1, 1):
                board('rounded corner upright',
                      (sx*(width/2-.035), sy*(depth/2-.024), 0),
                      (.075, .075, height+.010), WOOD, .016)
        for sy in (-1, 1):
            for sz in (-1, 1):
                board('horizontal batten',
                      (0, sy*(depth/2+.015), sz*(height/2-.055)),
                      (width+.015, .070, .075), DARKWOOD, .014)
            beam('Cargo crate %d | diagonal brace' % index,
                 at(-width*.35, sy*(depth/2+.058), -height*.31),
                 at(width*.35, sy*(depth/2+.058), height*.31),
                 .068, .045, WOOD, .012)
        # A small brass diamond reads as a merchant seal without labels.
        seal = box('Cargo crate %d | merchant brass seal' % index,
                   at(0, -depth/2-.087, .025), (.062, .018, .062),
                   BRASS, .006)
        seal.rotation_euler = (0, pi/4, angle)

    for index, data in enumerate(barrel_positions, 1):
        barrel(index, *data)
    for index, data in enumerate(crate_positions, 1):
        crate(index, *data)

    PART = '08 Rope coils and mooring'
    for index, (x, y, radius, angle) in enumerate(coil_positions, 1):
        points = []
        # 3.5 gently nested turns; an oval shape looks laid out by hand.
        for j in range(260):
            t = j/259
            a = angle + t*3.5*2*pi
            r = .045+(radius-.045)*t
            points.append((x+r*cos(a), y+r*sin(a)*.82,
                           deck_z+.020+.003*sin(a*2)))
        rope('Deck rope coil %d' % index, points, .018, False)
        end = Vector(points[-1])
        tail = [tuple(end), tuple(end+Vector((.055, -.025, 0))),
                tuple(end+Vector((.115, -.012, -.001))),
                tuple(end+Vector((.17, -.050, -.001)))]
        rope('Deck rope coil %d | loose tail' % index, tail, .018, False)

    return {'barrel_count': len(barrel_positions),
            'crate_count': len(crate_positions),
            'rope_coil_count': len(coil_positions),
            'deck_z': deck_z,
            'barrels_xy_height_radius': barrel_positions,
            'crates_xy_size_rotation': crate_positions,
            'coils_xy_radius_rotation': coil_positions,
            'clear_stair_lane': {'x': [-1.8, -.15], 'y': [-1.25, -.68]},
            'components_closed': True}


cargo_info=build_ship_cargo()

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
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();asset=bpy.context.object;asset.name='Fantasy_Merchant_Ship'
bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)

# Painted soft cel tones and short-range contact shadows are portable mesh data.
from mathutils.bvhtree import BVHTree
m=asset.data
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



asset['Design']='Small anime fantasy merchant vessel; single mast, furled white sail, vermilion hull stripe, raised stern cabin, gold bird figurehead, barrels and crates'
asset['Asset']='Single joined mesh; no water, ground plane or background; stowed mooring rope'
asset['Paint']='Portable unlit materials; painted soft cel tones and contact shadows baked into Paint; packed wood texture'
asset['Assembly']='Named vertex groups preserve hull, deck, cabin, mast, rigging, figurehead, cargo and coils'
asset['Animation']='Static asset; no rig, sail animation, collisions or LOD'
asset.asset_mark()
PRESENT=bpy.data.collections.new('90 | Presentation cameras');bpy.context.scene.collection.children.link(PRESENT)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
world=bpy.data.worlds.new('Soft daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.75,.82,.93,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5
def camera(name,p,target,scale):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);PRESENT.objects.link(o);o.location=p
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=scale;return o
cam=camera('Main bow and starboard view',(11,-15,10),(.18,0,2.82),10.25)
rear=camera('Rear port and quarterdeck view',(-12,16,10),(.10,0,2.80),10.25)
detail=camera('Cabin and cargo detail',(8,-13,10),(-.65,0,2.20),6.45)
scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1700;scene.render.resolution_y=1550;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
bpy.ops.object.select_all(action='DESELECT');asset.select_set(True);bpy.context.view_layer.objects.active=asset
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_distance=12;ar.spaces.active.region_3d.view_location=(0,0,2.6)
            ar.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion();ar.spaces.active.shading.type='MATERIAL';ar.spaces.active.overlay.show_floor=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Merchant_Ship.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Merchant_Ship.glb'),export_format='GLB',use_selection=True,export_vertex_color='ACTIVE',export_materials='EXPORT',export_cameras=False,export_lights=False)
coords=np.array([v.co[:] for v in asset.data.vertices])
stats={'mesh_objects':1,'vertices':len(asset.data.vertices),'triangles':sum(len(p.vertices)-2 for p in asset.data.polygons),'dimensions_m':list(np.ptp(coords,axis=0)),'bounds_min_m':list(coords.min(axis=0)),'bounds_max_m':list(coords.max(axis=0)),'masts':1,'furled_sails':1,'barrels':cargo_info['barrel_count'],'crates':cargo_info['crate_count'],'rope_coils':cargo_info['rope_coil_count'],'figurehead':'Golden fantasy bird','water':False,'ground_plane':False,'background':False,'static_asset':True,'style':'Hand-painted anime / soft cel tones','lighting':'Baked into vertex colours; unlit portable materials','part_groups':[g.name for g in asset.vertex_groups],'cargo':cargo_info}
with open(os.path.join(OUT,'Merchant_Ship_info.json'),'w',encoding='utf8') as f:json.dump(stats,f,indent=2)
print('MODEL_SAVED',stats,flush=True)
scene.render.filepath=os.path.join(OUT,'Merchant_Ship_preview.png');bpy.ops.render.render(write_still=True)
scene.camera=rear;scene.render.filepath=os.path.join(OUT,'Merchant_Ship_rear.png');bpy.ops.render.render(write_still=True)
scene.camera=detail;scene.render.resolution_x=1600;scene.render.resolution_y=1450
scene.render.filepath=os.path.join(OUT,'Merchant_Ship_detail.png');bpy.ops.render.render(write_still=True)
print('COMPLETE',flush=True)
