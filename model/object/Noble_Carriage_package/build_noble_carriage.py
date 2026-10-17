import bpy,bmesh,math,os,sys,json,random,argparse
import numpy as np
from math import pi,sin,cos,sqrt
from mathutils import Vector

parser=argparse.ArgumentParser();parser.add_argument('--output',default=os.path.dirname(os.path.abspath(__file__)))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=os.path.abspath(args.output);os.makedirs(OUT,exist_ok=True)
random.seed(177)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
ASSET=bpy.data.collections.new('01 | Noble carriage — one mesh');bpy.context.scene.collection.children.link(ASSET)
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
WOODTEX=make_image('Noble_Carriage_wood_color',np.clip(tone[:,:,None]*np.array([.68,.385,.15]),0,1))
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





NAVY=material('Deep navy lacquer',(.018,.047,.135))
NAVYLIGHT=material('Royal blue navy lacquer panels',(.030,.090,.235))
NAVYSHADOW=material('Midnight blue lacquer inset',(.010,.021,.062))
GOLD=material('Warm carved gold',(.98,.65,.20))
GOLDLIGHT=material('Painted gold edge light',(1,.83,.39))
GOLDSHADE=material('Antique gold carving shade',(.63,.33,.075))
PINK=material('Rose silk curtains',(.89,.30,.47))
PINKLIGHT=material('Pink curtain highlights',(.99,.52,.64))
PINKDARK=material('Pink curtain soft folds',(.65,.16,.32))
GLASS=material('Cool blue window glass',(.080,.19,.29))
GLASSLIGHT=material('Soft painted glass reflection',(.34,.55,.70))
CUSHION=material('Midnight velvet coachman seat',(.035,.075,.15))
AMBER=material('Warm lantern glass',(1,.74,.33))
AMBERLIGHT=material('Lantern pale gold glass',(1,.90,.58))

def build_carriage_running_gear():
    """Create four eight-spoke wheels, axles, and compact leaf suspension.

    The cart's longitudinal direction is X; front is +X. All parts are
    closed volumes, wheel tyres touch Z=0, and the widest hub tips are Y=±1.28.
    This function uses the parent builder's common geometry helpers/materials.
    """
    global PART

    def wheel_ring(name, centre, inner, outer, depth, material, offset=0.0,
                   round_edges=True):
        o = arc(name, inner, outer, 0, 2*pi, -depth/2, depth/2,
                material, n=64)
        o.location = (centre[0], centre[1]+offset, centre[2])
        o.rotation_euler.x = pi/2
        # Mesh rings are smooth around the circumference, with bevels only
        # trimming their silhouette. Their nominal radius is never enlarged.
        if round_edges:
            bevel(o, min(.008, (outer-inner)*.22), 2)
        return o

    def carved_spoke(name, centre, radius, theta, face_sign):
        cx, cy, cz = centre
        # A softly tapered, paddle-shaped solid spoke. Its rear face is part
        # of the same closed solid as its ornamental front face.
        radial = ((.115, -.046), (radius*.47, -.032),
                  (radius-.105, -.056), (radius-.070, -.041),
                  (radius-.070, .041), (radius-.105, .056),
                  (radius*.47, .032), (.115, .046))
        vertices = []
        for y in (cy-.046, cy+.046):
            for u, v in radial:
                vertices.append((cx+u*cos(theta)-v*sin(theta), y,
                                 cz+u*sin(theta)+v*cos(theta)))
        count = len(radial)
        faces = [tuple(range(count-1, -1, -1)),
                 tuple(range(count, 2*count))]
        faces.extend((i, (i+1)%count, (i+1)%count+count, i+count)
                     for i in range(count))
        spoke = mesh(name, vertices, faces, GOLD)
        bevel(spoke, .010, 3)
        # A short painted gold ridge reinforces the sculpted anime shape.
        ya = cy+face_sign*.051
        a, b = radius*.33, radius*.70
        tube(name+' painted ridge',
             [(cx+a*cos(theta), ya, cz+a*sin(theta)),
              (cx+b*cos(theta), ya, cz+b*sin(theta))],
             .009, GOLDLIGHT, 2)
        return spoke

    def spring_leaf(name, axle_x, side_y, centre_z, half_length,
                    end_rise, material):
        # Rounded, closed rectangular strip following a shallow U curve.
        count = 15
        verts = []
        for i in range(count):
            t = -1+2*i/(count-1)
            x = axle_x+t*half_length
            z = centre_z+end_rise*t*t
            verts.extend(((x, side_y-.054, z-.011),
                          (x, side_y+.054, z-.011),
                          (x, side_y+.054, z+.011),
                          (x, side_y-.054, z+.011)))
        faces = [(3, 2, 1, 0)]
        for i in range(count-1):
            for j in range(4):
                faces.append((4*i+j, 4*i+(j+1)%4,
                              4*(i+1)+(j+1)%4, 4*(i+1)+j))
        faces.append(tuple(4*(count-1)+j for j in range(4)))
        o = mesh(name, verts, faces, material)
        bevel(o, .006, 2)
        return o

    PART = '01 Chassis and suspension'
    for side in (-1, 1):
        box('Navy longitudinal carriage beam',
            (.025, side*.57, .84), (3.35, .15, .12), NAVY, .027)
        box('Gold carriage rail end plate',
            (1.68, side*.57, .84), (.055, .177, .148), GOLD, .012)
        box('Gold rear chassis end plate',
            (-1.63, side*.57, .84), (.055, .177, .148), GOLD, .012)
    for x in (-1.42, -.10, 1.36):
        box('Rounded undercarriage cross member',
            (x, 0, .815), (.145, 1.31, .14), DARKWOOD, .025)
    axles = [(-1.43, .70), (1.38, .59)]
    for axle_index, (ax, az) in enumerate(axles):
        cylinder('Rear axle' if axle_index == 0 else 'Front axle',
                 (ax, 0, az), .063, 2.40, IRON, axis=(0, 1, 0),
                 n=20, w=.009)
        for side in (-1, 1):
            sy = side*.72
            cz = az+.075
            rise = .13 if axle_index == 0 else .20
            for layer, half in enumerate((.51, .40, .29)):
                spring_leaf('Layered curved leaf spring', ax, sy,
                            cz-layer*.026, half,
                            rise*(half/.51)**2, IRON)
            # Flat gold centre clamp binds the three dark leaves together.
            box('Gold spring binding collar',
                (ax, sy, cz-.020), (.115, .141, .105), GOLD, .014)
            for direction in (-1, 1):
                eye_x = ax+direction*.51
                eye_z = cz+rise
                cylinder('Leaf spring gold eye',
                         (eye_x, sy, eye_z), .047, .14, GOLD,
                         axis=(0, 1, 0), n=20, w=.008)
                beam('Short rounded spring hanger',
                     (eye_x, sy, eye_z),
                     (eye_x, side*.57, .865), .056, .065, NAVYLIGHT,
                     .012)

    PART = '02 Four spoked wheels'
    wheel_records = []
    for axle_index, (cx, cz) in enumerate(axles):
        radius = .70 if axle_index == 0 else .59
        for side in (-1, 1):
            centre = (cx, side*1.12, cz)
            label = ('Rear' if axle_index == 0 else 'Front') + (
                ' left wheel' if side < 0 else ' right wheel')
            # Exactly eight sculpted solid gold spokes per wheel.
            for spoke_index in range(8):
                theta = 2*pi*spoke_index/8+pi/8
                carved_spoke(label+' gold spoke %02d' % (spoke_index+1),
                             centre, radius, theta, side)
            wheel_ring(label+' navy wooden felloe', centre,
                       radius-.130, radius-.023, .140, NAVY)
            # The thin dark tyre is the exact outside radius and ground
            # contact. Its edge cannot extend beyond the requested radius.
            wheel_ring(label+' slim dark iron tyre', centre,
                       radius-.026, radius, .146, IRON, round_edges=False)
            for facing in (-1, 1):
                oy = facing*.078
                wheel_ring(label+' outer gold rim inlay', centre,
                           radius-.054, radius-.034, .014, GOLD, oy)
                wheel_ring(label+' inner gold rim inlay', centre,
                           radius-.129, radius-.111, .014, GOLDLIGHT, oy)
            cylinder(label+' navy axle hub', centre, .141, .240,
                     NAVYLIGHT, axis=(0, 1, 0), n=24, w=.015)
            cylinder(label+' gold hub flange',
                     (cx, centre[1]+side*.111, cz), .159, .050,
                     GOLD, axis=(0, 1, 0), n=24, w=.011)
            cylinder(label+' gold hub cap',
                     (cx, centre[1]+side*.142, cz), .105, .026,
                     GOLDLIGHT, axis=(0, 1, 0), n=24, w=.009)
            ball(label+' rounded central gold button',
                 (cx, centre[1]+side*.138, cz),
                 (.072, .022, .072), GOLD, n=20)
            wheel_records.append({'name': label, 'centre': list(centre),
                                  'radius': radius, 'spokes': 8})
    return {'wheels': wheel_records,
            'axle_positions': [[x, 0, z] for x, z in axles],
            'radii': [.70, .70, .59, .59], 'ground_z': 0.0}


running_gear=build_carriage_running_gear()


CX=-.35
def rounded_rect(hx,hy,t):
    c=cos(t);s=sin(t)
    return (hx*math.copysign(abs(c)**.50,c),hy*math.copysign(abs(s)**.50,s))
def loft(name,levels,mat,n=64):
    vs=[]
    for z,hx,hy in levels:
        for j in range(n):
            x,y=rounded_rect(hx,hy,j*2*pi/n);vs.append((CX+x,y,z))
    fs=[]
    for k in range(len(levels)-1):
        for j in range(n):fs.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    fs.extend([tuple(range(n-1,-1,-1)),tuple((len(levels)-1)*n+j for j in range(n))])
    return mesh(name,vs,fs,mat,True)
def outline_level(name,z,hx,hy,r,mat):
    return tube(name,[(CX+rounded_rect(hx,hy,t)[0],rounded_rect(hx,hy,t)[1],z) for t in np.linspace(0,2*pi,97)],r,mat,2)
def arch_shape(w,h):
    # Clockwise/counterclockwise orientation is normalised during conversion.
    q=[(-w/2,-h/2),(w/2,-h/2),(w/2,h/2-w/2)]
    q += [(w/2*cos(a),h/2-w/2+w/2*sin(a)) for a in np.linspace(0,pi,25)[1:]]
    return q
def shape_plate(name,outline,center,depth,mat,axis='Y'):
    a,b,c=center;vs=[]
    for off in [-depth/2,depth/2]:
        for u,v in outline:vs.append((a+u,b+off,c+v) if axis=='Y' else (a+off,b+u,c+v))
    n=len(outline);fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    fs += [(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
    return mesh(name,vs,fs,mat)
def frame_band(name,outline,center,depth,inset,mat,axis='Y'):
    # Four rings: back outer/inner, front outer/inner.
    a,b,c=center;vs=[];n=len(outline)
    for off in [-depth/2,depth/2]:
        for scale in [1,inset]:
            for u,v in outline:vs.append((a+u*scale,b+off,c+v*scale) if axis=='Y' else (a+off,b+u*scale,c+v*scale))
    fs=[]
    for j in range(n):
        k=(j+1)%n
        fs.extend([(j,k,n+k,n+j),(2*n+j,3*n+j,3*n+k,2*n+k),(j,2*n+j,2*n+k,k),(n+j,n+k,3*n+k,3*n+j)])
    return mesh(name,vs,fs,mat)
def planar_scroll(name,coords,y,r=.018,mat=None):
    return tube(name,[(x,y,z) for x,z in coords],r,mat or GOLD,2)
def gold_leaf(name,a,b,width,side):
    a=Vector(a);b=Vector(b);d=b-a;u=Vector((d.z,0,-d.x)).normalized()*width
    mid=(a+b)/2
    vs=[tuple(a),tuple(a+d*.35+u),tuple(a+d*.67+u*.8),tuple(b),tuple(a+d*.67-u*.8),tuple(a+d*.35-u),tuple(mid+Vector((0,side*.018,0))),tuple(mid-Vector((0,side*.008,0)))]
    fs=[]
    for j in range(6):fs.extend([(j,(j+1)%6,6),((j+1)%6,j,7)])
    return mesh(name,vs,fs,GOLDLIGHT,True)

PART='03 Navy carriage body'
levels=[(.94,1.04,.58),(1.02,1.20,.72),(1.22,1.33,.82),(1.62,1.34,.85),(2.15,1.25,.82),(2.54,1.15,.76),(2.77,1.14,.75)]
loft('Rounded lacquered noble cabin',levels,NAVY)
for z,hx,hy,r,mat in [(1.02,1.23,.75,.037,GOLD),(1.20,1.345,.835,.024,GOLDLIGHT),(1.63,1.347,.855,.018,GOLD),(2.63,1.17,.79,.028,GOLD),(2.77,1.24,.83,.042,GOLD)]:
    outline_level('Sweeping gilded body moulding',z,hx,hy,r,mat)
# Curved corner pillars follow the barrel-shaped body silhouette.
for theta in [pi/4,3*pi/4,5*pi/4,7*pi/4]:
    pts=[]
    for z,hx,hy in levels:
        x,y=rounded_rect(hx+.018,hy+.02,theta);pts.append((CX+x,y,z))
    tube('Carved gold corner pillar',pts,.026,GOLD,2)
    for z,hx,hy in [levels[2],levels[-2]]:
        x,y=rounded_rect(hx+.026,hy+.027,theta);ball('Pillar little gold rosette',(CX+x,y,z),(.054,.04,.066),GOLDLIGHT)

PART='04 Windows and pink curtains'
window_count=0
def carriage_window(x,y,z,w,h,side,axis='Y'):
    global window_count
    q=arch_shape(w,h);center=(x,y,z)
    shape_plate('Window dark blue glass',q,center,.022,GLASS,axis)
    frame_center=(x,y+side*.036,z) if axis=='Y' else (x+side*.036,y,z)
    frame_band('Arched sculpted golden window frame',q,frame_center,.060,.86,GOLD,axis)
    # Curtains are solidified, pleated sheets drawn aside with little gold ties.
    for sign in [-1,1]:
        vs=[];fs=[];nz=16;nu=8
        for k in range(nz+1):
            t=k/nz
            inner=sign*w*(.075+.23*math.exp(-((t-.39)/.20)**2))
            outer=sign*w*.423
            for j in range(nu+1):
                u=j/nu;xx=outer*(1-u)+inner*u
                spring=h/2-w/2
                ztop=spring+sqrt(max(0,(w*.46)**2-xx*xx))-.020
                zz=-h*.465+t*(ztop+h*.465)
                pleat=.012*cos(u*6*pi)+.004*sin(t*pi)
                if axis=='Y':vs.append((x+xx,y+side*(.034+pleat),z+zz))
                else:vs.append((x+side*(.034+pleat),y+xx,z+zz))
        for k in range(nz):
            for j in range(nu):
                a=k*(nu+1)+j;fs.append((a,a+1,a+nu+2,a+nu+1))
        o=mesh('Draped rose silk curtain',vs,fs,PINK,True);o.data.materials.append(PINKLIGHT);o.data.materials.append(PINKDARK)
        for p in o.data.polygons:p.material_index=1 if p.index%nu in [1,4] else (2 if p.index%nu in [3,6] else 0)
        mod=o.modifiers.new('Curtain real cloth thickness','SOLIDIFY');mod.thickness=.009
        u0=sign*w*.36;zt=z-h*.13
        if axis=='Y':
            tube('Curtain gold silk tie',[(x+u0-sign*.035,y+side*.06,zt-.012),(x+u0+sign*.035,y+side*.065,zt+.012)],.012,GOLDLIGHT,1)
            ball('Curtain tiny tassel',(x+u0,y+side*.067,zt-.05),(.015,.015,.035),GOLDLIGHT)
        else:
            tube('Curtain gold silk tie',[(x+side*.06,y+u0-sign*.035,zt-.012),(x+side*.065,y+u0+sign*.035,zt+.012)],.012,GOLDLIGHT,1)
    # A small painted reflection in the remaining centre of each pane.
    if axis=='Y':tube('Window painted cool glint',[(x-.025,y+side*.044,z+.16),(x+.030,y+side*.044,z+.22)],.009,GLASSLIGHT,1)
    window_count+=1
for side in [-1,1]:
    for x,w,z,h in [(-1.12,.43,2.14,.60),(-.35,.64,2.15,.65),(.42,.43,2.14,.60)]:
        carriage_window(x,side*.855,z,w,h,side)
# Front and rear carriage windows are smaller, clear of the coachman backrest.
carriage_window(.965,0,2.22,.65,.58,1,'X')
carriage_window(-1.655,0,2.22,.66,.60,-1,'X')

PART='05 Gilded doors and scroll carvings'
for side in [-1,1]:
    y=side*.905
    door=arch_shape(.82,1.45)
    planar_scroll('Door golden outline',[(CX+u,1.84+v) for u,v in door]+[(CX+door[0][0],1.84+door[0][1])],y,.018,GOLD)
    lower=[(-.36,-.27),(.36,-.27),(.36,.19),(.28,.29),(-.28,.29),(-.36,.19)]
    shape_plate('Door royal blue lower inset',lower,(CX,y+side*.005,1.43),.025,NAVYLIGHT)
    frame_band('Door lower panel gold frame',lower,(CX,y+side*.025,1.43),.028,.88,GOLD)
    # A compact fleur-de-lis carving on the central medallion.
    ball('Door golden oval medallion',(CX,y+side*.060,1.46),(.12,.018,.15),GOLDSHADE,24)
    for end in [(CX,y+side*.090,1.60),(CX-.10,y+side*.090,1.53),(CX+.10,y+side*.090,1.53)]:
        gold_leaf('Gilded fleur-de-lis petal',(CX,y+side*.085,1.35),end,.040,side)
    for sx in [-1,1]:
        # Flourishes under the small windows follow the curved cabin shoulder.
        base=CX+sx*.88
        pts=[]
        for a in np.linspace(0,pi*1.65,38):
            r=.12*(1-.65*a/(pi*1.65));pts.append((base+sx*r*cos(a),1.44+r*sin(a)))
        planar_scroll('Raised baroque gold scroll',pts,side*.865,.017,GOLDLIGHT)
        stem=bezier((CX+sx*.43,side*.878,1.29),(CX+sx*.71,side*.88,1.26),(CX+sx*.98,side*.87,1.31),(CX+sx*1.10,side*.852,1.48),28)
        tube('Long golden carved flourish',stem,.018,GOLD,2)
        gold_leaf('Gold scroll acanthus leaf',(base,side*.89,1.30),(base+sx*.10,side*.90,1.43),.033,side)
    # Upper decorative eyebrow and centre jewel above the door window.
    planar_scroll('Window gilded eyebrow',[(CX+.40*cos(a),2.49+.13*sin(a)) for a in np.linspace(.08,pi-.08,40)],side*.827,.017,GOLDLIGHT)
    ball('Blue cabochon above doorway',(CX,side*.85,2.61),(.050,.026,.043),NAVYLIGHT)
    for z in [1.29,1.70]:box('Door little gold hinge',(CX-.39,side*.943,z),(.09,.035,.045),GOLD,.009)
    tube('Golden carriage door handle',[(CX+.27,side*.949,1.73),(CX+.31,side*.98,1.73),(CX+.31,side*.98,1.64)],.017,GOLDLIGHT,2)
    # Boarding steps fit between the two wheels.
    box('Side boarding step',(CX+.05,side*1.03,.57),(.72,.40,.09),NAVY,.035)
    box('Gold boarding step lip',(CX+.05,side*1.25,.575),(.75,.045,.085),GOLD,.015)
    for x in [CX-.21,CX+.31]:beam('Boarding step curved support',(x,side*.65,.82),(x,side*1.08,.55),.055,.055,IRON,.012)

PART='06 Domed roof and golden crest'
HX=1.44;HY=.91
roof_levels=[]
for r in [1,.985,.94,.86,.73,.56,.35,.13]:roof_levels.append((2.79+.39*sqrt(max(0,1-r*r)),HX*r,HY*r))
loft('Soft domed navy lacquer roof',roof_levels,NAVY)
outline_level('Roof broad golden cornice',2.79,HX+.01,HY+.012,.043,GOLD)
outline_level('Roof painted golden edge',2.81,HX+.024,HY+.026,.017,GOLDLIGHT)
for theta in [pi/4,3*pi/4,5*pi/4,7*pi/4]:
    pts=[]
    for r in np.linspace(.14,1,42):
        x,y=rounded_rect(HX*r,HY*r,theta);pts.append((CX+x,y,2.805+.39*sqrt(max(0,1-r*r))))
    tube('Curving gilt roof rib',pts,.023,GOLD,2)
# Small crown-like carved roof finial, with a solid base and rounded points.
cylinder('Roof gold finial base',(CX,0,3.19),.17,.075,GOLD,n=32,w=.012)
for j in range(5):
    a=j*2*pi/5
    p0=(CX+.13*cos(a),.13*sin(a),3.22);p1=(CX+.15*cos(a),.15*sin(a),3.34+(j%2)*.025)
    beam('Roof little crest point',p0,p1,.045,.045,GOLD,.01)
    ball('Crest rounded pearl',p1,(.036,.036,.038),GOLDLIGHT)
ball('Roof centre blue jewel',(CX,0,3.28),(.09,.09,.105),NAVYLIGHT,24)

PART='07 Raised coachman seat and shafts'
for y in [-.52,.52]:
    beam('Coachman seat angled pedestal',(1.21,y,.83),(1.45,y,1.41),.12,.13,NAVY,.025)
    # Gold S curves make the front support read as carved coachwork.
    pts=bezier((1.02,y,1.02),(1.46,y,1.04),(1.65,y,1.24),(1.47,y,1.44),30)
    tube('Carved gold seat support scroll',pts,.029,GOLD,2)
box('Coachman seat golden base',(1.46,0,1.47),(.79,1.44,.12),GOLD,.045)
box('Coachman plump velvet seat cushion',(1.49,0,1.56),(.72,1.34,.17),CUSHION,.075)
box('Coachman raised velvet backrest',(1.13,0,1.84),(.17,1.39,.55),CUSHION,.06)
for y in [-.70,.70]:
    beam('Coachman seat gilded back upright',(1.12,y,1.44),(1.12,y,2.09),.05,.06,GOLD,.012)
    tube('Coachman curved gold armrest',bezier((1.11,y,1.95),(1.46,y,2.00),(1.78,y,1.94),(1.79,y,1.65),32),.025,GOLD,2)
beam('Coachman backrest top piping',(1.10,-.69,2.105),(1.10,.69,2.105),.040,.045,GOLDLIGHT,.009)
for y in [-.42,0,.42]:ball('Velvet backrest little tuft button',(1.224,y,1.85),(.012,.025,.025),GOLD)
box('Coachman footboard',(2.04,0,1.03),(.44,1.40,.10),NAVY,.035)
box('Coachman footboard gold lip',(2.28,0,1.08),(.055,1.44,.12),GOLD,.015)
for y in [-.55,.55]:
    beam('Coachman footboard bracket',(1.46,y,.81),(2.12,y,.99),.065,.065,IRON,.015)
    pts=bezier((1.45,y,.78),(1.99,y,.57),(2.52,y,.68),(2.85,y,.78),38)
    tube('Short horse-free carriage shaft',pts,.055,DARKWOOD,2)
    ball('Shaft rounded gold end',(2.85,y,.78),(.065,.065,.065),GOLD)

PART='08 Brass side lantern'
LX=.91;LY=-1.045;LZ=2.25
# One six-sided brass lamp on a curled bracket beside the front window.
tube('Lantern curved mounting arm',bezier((.78,-.75,2.52),(.89,-1.0,2.63),(1.00,-1.06,2.60),(.91,-1.045,2.51),30),.021,GOLD,2)
o=arc('Lantern handle ring',.049,.065,0,2*pi,-.010,.010,GOLD,32);o.location=(LX,LY,2.49);o.rotation_euler.x=pi/2
cylinder('Lantern amber six sided glass',(LX,LY,LZ),.103,.27,AMBER,n=6,w=.008)
for j in range(6):
    a=j*pi/3;xx=LX+.106*cos(a);yy=LY+.106*sin(a)
    beam('Lantern fine brass corner post',(xx,yy,LZ-.15),(xx,yy,LZ+.15),.018,.018,GOLD,.004)
for z in [LZ-.155,LZ+.155]:cylinder('Lantern hexagonal brass rim',(LX,LY,z),.13,.040,GOLD,n=6,w=.008)
bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=.15,radius2=.035,depth=.12,location=(LX,LY,2.445))
put(bpy.context.object,'Lantern little peaked brass roof',GOLD);bevel(bpy.context.object,.005,2)
ball('Lantern bottom brass drop',(LX,LY,2.045),(.045,.045,.055),GOLDLIGHT)
box('Lantern painted soft glass highlight',(LX+.025,LY-.096,LZ+.01),(.042,.008,.14),AMBERLIGHT,.012)

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
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();asset=bpy.context.object;asset.name='Anime_Noble_Carriage'
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
    is_navy='navy lacquer' in mat.name.lower()
    is_apple=False
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
        if is_navy:
            broad=math.exp(-((p.z-2.48-.045*(p.x+.35))/.065)**2)*.12
            rgb=rgb*(1-broad)+np.array((.22,.38,.65))*broad
        colors[li,:3]=np.clip(rgb,0,1)
paint.data.foreach_set('color',colors.ravel());m.update()
print('ANIME_PAINT_BAKED',len(vertex_occlusion),'corner samples',flush=True)





asset['Design']='Ornate anime noble carriage without horses; deep navy lacquer, gold carving, pink curtains, four spoked wheels, coachman seat and a brass lantern'
asset['Asset']='Single joined mesh; four wheel contact points at Z=0; no ground plane or background'
asset['Paint']='Portable unlit anime materials; painted soft cel shading and lacquer highlights baked into Paint; subtle packed wood texture'
asset['Assembly']='Eight named vertex groups for chassis, wheels, body, curtains, gold trim, roof, seat and lantern'
asset['Animation']='Static asset; doors and wheels are not rigged; no collisions or LOD'
asset.asset_mark()
PRESENT=bpy.data.collections.new('90 | Presentation cameras');bpy.context.scene.collection.children.link(PRESENT)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
world=bpy.data.worlds.new('Soft daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.75,.82,.93,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
def camera(name,p,target,scale):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);PRESENT.objects.link(o);o.location=p
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=scale;return o
cam=camera('Main carriage view',(7.5,-11,6.0),(.30,0,1.62),6.10)
rear=camera('Rear carriage view',(-7,11,5.5),(.20,0,1.62),6.20)
detail=camera('Golden trim and pink curtain detail',(4.5,-10,4.7),(-.05,-.25,2.08),3.85)
scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1700;scene.render.resolution_y=1550;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
bpy.ops.object.select_all(action='DESELECT');asset.select_set(True);bpy.context.view_layer.objects.active=asset
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_distance=7;ar.spaces.active.region_3d.view_location=(.10,0,1.6)
            ar.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion();ar.spaces.active.shading.type='MATERIAL';ar.spaces.active.overlay.show_floor=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Noble_Carriage.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Noble_Carriage.glb'),export_format='GLB',use_selection=True,export_vertex_color='ACTIVE',export_materials='EXPORT',export_cameras=False,export_lights=False)
coords=np.array([v.co[:] for v in asset.data.vertices])
stats={'mesh_objects':1,'vertices':len(asset.data.vertices),'triangles':sum(len(p.vertices)-2 for p in asset.data.polygons),'dimensions_m':list(np.ptp(coords,axis=0)),'bounds_min_m':list(coords.min(axis=0)),'bounds_max_m':list(coords.max(axis=0)),'wheels':4,'spokes_per_wheel':8,'windows_with_curtains':window_count,'side_lanterns':1,'horses':0,'ground_plane':False,'background':False,'static_asset':True,'style':'Hand-painted anime / soft cel tones','lighting':'Baked vertex colours and painted lacquer highlights; unlit materials','part_groups':[g.name for g in asset.vertex_groups],'running_gear':running_gear}
with open(os.path.join(OUT,'Noble_Carriage_info.json'),'w',encoding='utf8') as f:json.dump(stats,f,indent=2)
print('MODEL_SAVED',stats,flush=True)
scene.render.filepath=os.path.join(OUT,'Noble_Carriage_preview.png');bpy.ops.render.render(write_still=True)
scene.camera=rear;scene.render.filepath=os.path.join(OUT,'Noble_Carriage_rear.png');bpy.ops.render.render(write_still=True)
scene.camera=detail;scene.render.resolution_x=1600;scene.render.resolution_y=1450
scene.render.filepath=os.path.join(OUT,'Noble_Carriage_detail.png');bpy.ops.render.render(write_still=True)
print('COMPLETE',flush=True)
