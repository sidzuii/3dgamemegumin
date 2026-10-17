import bpy, math, os, json
from mathutils import Vector
from math import sin, cos, pi

OUT = os.path.dirname(os.path.abspath(__file__))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.collections):
    if d.name != 'Collection' and d.users == 0: bpy.data.collections.remove(d)
COL = None
def collection(name):
    global COL
    COL = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(COL)
    return COL
def place(obj, name, mat):
    obj.name = name
    for c in list(obj.users_collection): c.objects.unlink(obj)
    COL.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    return obj
def material(name, color, metal=0, rough=.4, stone=False):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    n=m.node_tree.nodes; p=n.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    if stone:
        tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=7
        tex.inputs['Detail'].default_value=3; tex.inputs['Roughness'].default_value=.75
        ramp=n.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position=.15
        ramp.color_ramp.elements[0].color=tuple(v*.82 for v in color)+(1,)
        ramp.color_ramp.elements[1].position=.85
        ramp.color_ramp.elements[1].color=tuple(min(1,v*1.05) for v in color)+(1,)
        m.node_tree.links.new(tex.outputs['Fac'],ramp.inputs[0]);m.node_tree.links.new(ramp.outputs[0],p.inputs['Base Color'])
        fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=140
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.015
        m.node_tree.links.new(fine.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    return m
IVORY=material('Ivory limestone | procedural',(.70,.66,.58),rough=.48,stone=True)
PALE=material('Carved warm marble',(.83,.77,.65),rough=.42,stone=True)
GOLD=material('Satin champagne gold',(.66,.43,.18),metal=.68,rough=.3)
GOLDLIGHT=material('Gold highlight',(.83,.61,.30),metal=.62,rough=.28)
RECESS=material('Recessed stone',(.43,.40,.35),rough=.63,stone=True)
DARK=material('Spout interior',(.048,.037,.024),metal=.15,rough=.56)
EYE=material('Lion eyes | polished bronze',(.17,.105,.035),metal=.65,rough=.22)

def mesh(name,verts,faces,mat,smooth=False):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    ob=bpy.data.objects.new(name,m);COL.objects.link(ob)
    if mat:m.materials.append(mat)
    for p in m.polygons:p.use_smooth=smooth
    return ob
def bevel(ob, width=.025, segments=3):
    mod=ob.modifiers.new('Soft carved edges','BEVEL');mod.width=width;mod.segments=segments
    mod=ob.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return ob
def box(name,loc,scale,mat,bev=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=place(bpy.context.object,name,mat);ob.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bev:bevel(ob,bev)
    return ob
def uv(name,loc,scale,mat,seg=24,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=loc)
    ob=place(bpy.context.object,name,mat);ob.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in ob.data.polygons:p.use_smooth=True
    return ob
def lathe(name,profile,mat,n=128,smooth=True,xy=(0,0)):
    verts=[];rings=[]
    for r,z in profile:
        if r==0:
            rings.append([len(verts)]);verts.append((xy[0],xy[1],z))
        else:
            rings.append(list(range(len(verts),len(verts)+n)))
            verts.extend((xy[0]+r*cos(i*2*pi/n),xy[1]+r*sin(i*2*pi/n),z) for i in range(n))
    faces=[]
    for a,b in zip(rings,rings[1:]):
        for i in range(n):
            j=(i+1)%n
            if len(a)==1: faces.append((a[0],b[j],b[i]))
            elif len(b)==1:faces.append((a[i],a[j],b[0]))
            else:faces.append((a[i],a[j],b[j],b[i]))
    return mesh(name,verts,faces,mat,smooth)
def tube(name,pts,r,mat,res=3,cyclic=False):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=12
    cu.bevel_depth=r;cu.bevel_resolution=res;cu.use_fill_caps=True
    sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
    for p,v in zip(sp.points,pts):p.co=(*v,1)
    sp.use_cyclic_u=cyclic
    ob=bpy.data.objects.new(name,cu);COL.objects.link(ob);cu.materials.append(mat)
    return ob
def lerp(a,b,t):return tuple(a[i]*(1-t)+b[i]*t for i in range(3))
def bez(a,b,c,d,steps=24):
    return [tuple((1-t)**3*a[k]+3*(1-t)**2*t*b[k]+3*(1-t)*t*t*c[k]+t**3*d[k] for k in range(3)) for t in [i/steps for i in range(steps+1)]]
def diamond(name,center,w,h,depth,mat,angle=0):
    # Raised, faceted heraldic lozenge, facing local -Y.
    x,y,z=center
    local=[(-w/2,0,0),(0,0,h/2),(w/2,0,0),(0,0,-h/2),(0,-depth,0),(0,.035,0)]
    vv=[(x+u*cos(angle)-v*sin(angle),y+u*sin(angle)+v*cos(angle),z+q) for u,v,q in local]
    return mesh(name,vv,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)],mat)
def radial_diamond(name,rad,z,w,h,d,theta,mat=GOLD):
    return diamond(name,(rad*cos(theta),rad*sin(theta),z),w,h,d,mat,theta+pi/2)
def arch_pts(width,height,base=0):
    # Gothic pointed arch, two cubic arcs, in local X/Z.
    left=bez((-width/2,0,base),(-width/2,0,base+height*.65),(-width*.19,0,base+height*.84),(0,0,base+height),28)
    return left+[( -x,y,z) for x,y,z in reversed(left[:-1])]
def arch(name,origin,width,height,mat,r=.025,angle=0,base=0):
    x,y,z=origin
    pts=[(x+u*cos(angle)-v*sin(angle),y+u*sin(angle)+v*cos(angle),z+q) for u,v,q in arch_pts(width,height,base)]
    return tube(name,pts,r,mat)

# Appended to the reusable geometry helpers. Blender 5.2+, no external assets.
import random
random.seed(7)

# Vertex-painted gradients travel with the mesh in both Blender and GLB.
def painted_material(mat,color,rough=.65,metal=0):
    mat.diffuse_color=(*color,1)
    nodes=mat.node_tree.nodes;nodes.clear()
    out=nodes.new('ShaderNodeOutputMaterial');p=nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    attr=nodes.new('ShaderNodeVertexColor');attr.layer_name='Paint'
    mat.node_tree.links.new(attr.outputs['Color'],p.inputs['Base Color'])
    mat.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
    return mat
painted_material(IVORY,(.77,.66,.48))
painted_material(PALE,(.92,.82,.64))
painted_material(GOLD,(.70,.46,.20),.55,.06)
painted_material(GOLDLIGHT,(.94,.69,.32),.56,.04)
painted_material(RECESS,(.48,.34,.20))
painted_material(DARK,(.075,.038,.018))
painted_material(EYE,(.055,.029,.018),.35)
BLUSH=painted_material(material('Soft peach cheek',(.95,.52,.32)),(.95,.52,.32))
HIGHLIGHT=painted_material(material('Eye glint',(.98,.96,.85)),(.98,.96,.85),.3)

collection('01 | Dry anime fountain — single mesh')
# Flat bottom, higher eight-sided basin walls. No ground or water geometry.
base=lathe('Flat octagonal foundation',[(0,0),(4.40,0),(4.53,.055),(4.58,.15),(4.58,.25),(4.46,.31),(0,.31)],IVORY,n=8,smooth=False)
base.rotation_euler.z=pi/8;bevel(base,.065,4)
base=lathe('Lower rounded plinth band',[(4.22,.19),(4.51,.19),(4.57,.23),(4.55,.31),(4.42,.36),(4.22,.36),(4.22,.19)],PALE,n=8,smooth=False)
base.rotation_euler.z=pi/8;bevel(base,.04,3)
basin=lathe('Wide octagonal basin | full dry interior',[(0,.25),(4.38,.25),(4.49,.34),(4.49,1.09),(4.43,1.21),(4.28,1.23),(4.15,1.17),(4.09,1.04),(4.04,.40),(3.90,.34),(0,.34)],IVORY,n=8,smooth=False)
basin.rotation_euler.z=pi/8;bevel(basin,.045,4)
rim=lathe('Soft cream coping',[(4.12,1.08),(4.49,1.08),(4.54,1.14),(4.54,1.24),(4.49,1.29),(4.19,1.29),(4.12,1.23),(4.12,1.08)],PALE,n=8,smooth=False)
rim.rotation_euler.z=pi/8;bevel(rim,.045,4)

# Small low-relief stone carvings, inset between the broad rounded coping edges.
for j in range(8):
    a=j*pi/4
    n=Vector((cos(a),sin(a),0));t=Vector((-sin(a),cos(a),0))
    for k,off in enumerate([-.92,0,.92]):
        center=n*(4.49*cos(pi/8)+.009)+t*off
        # A gentle paired-leaf motif instead of pointed heraldic metalwork.
        for side in [-1,1]:
            leaf=uv('Rim carved leaf',center+Vector(t)*side*.09+Vector((0,0,.725)),(.075,.027,.18),PALE,16,10)
            leaf.rotation_euler=(0,side*.38,a+pi/2)
        uv('Rim small flower center',center+Vector((0,0,.725)),(.045,.035,.045),GOLDLIGHT,12,8)
    # A tiny stone rosette marks each octagonal corner.
    ca=a+pi/8
    uv('Octagonal corner medallion',(4.43*cos(ca),4.43*sin(ca),1.12),(.10,.10,.105),PALE,20,12)

# Central support. Rounded stepped profiles are intentionally simple and readable.
lathe('Central round stepped foot',[(0,.34),(.89,.34),(.94,.40),(.94,.47),(.88,.55),(.72,.60),(.67,.67),(0,.67)],PALE,n=96)
lathe('Foot warm stone bead',[(.68,.55),(.83,.55),(.84,.60),(.79,.65),(.68,.65),(.68,.55)],GOLDLIGHT,n=96)
lathe('Lower rounded column',[(0,.56),(.64,.56),(.66,.70),(.61,.85),(.51,1.09),(.47,1.62),(.51,1.95),(.63,2.10),(.71,2.15),(.72,2.25),(0,2.25)],IVORY,n=96)
lathe('Lower capital cream roll',[(0,2.08),(.66,2.08),(.76,2.16),(.77,2.24),(.70,2.31),(0,2.31)],PALE,n=96)
for j in range(8):
    a=j*pi/4
    # Carved vertical petal relief, softly rounded and with no inked outlines.
    pts=[]
    for k in range(35):
        t=k/34;z=.78+1.23*t;r=.62-.14*sin(pi*t)
        pts.append((r*cos(a),r*sin(a),z))
    tube('Lower column shallow flute',pts,.022,PALE,3)

MID=[(0,2.22),(.66,2.22),(.91,2.27),(1.20,2.33),(1.50,2.42),(1.80,2.56),(2.02,2.73),(2.17,2.91),(2.22,3.02),(2.22,3.12),(2.16,3.17),(2.05,3.17),(1.99,3.10),(1.96,2.96),(1.80,2.77),(1.57,2.62),(1.30,2.52),(.98,2.47),(.61,2.45),(0,2.45)]
lathe('Middle dry bowl | interior and exterior',MID,IVORY,n=128)
lathe('Middle bowl rounded cream rim',[(2.01,3.02),(2.22,3.02),(2.26,3.08),(2.25,3.17),(2.19,3.21),(2.06,3.21),(2.00,3.16),(2.01,3.02)],PALE,n=128)
lathe('Middle bowl warm undercut',[(2.14,2.94),(2.21,2.99),(2.22,3.04),(2.16,3.06),(2.12,3.00),(2.14,2.94)],GOLDLIGHT,n=128)

def petals(label,profile,num,radius=.015):
    for j in range(num):
        a=j*2*pi/num
        pts=[]
        for k in range(46):
            t=k/45;q=t*(len(profile)-1);i=min(int(q),len(profile)-2);f=q-i
            r=(1-f)*profile[i][0]+f*profile[i+1][0]+.012
            z=(1-f)*profile[i][1]+f*profile[i+1][1]
            theta=a+.065*sin(pi*t)
            pts.append((r*cos(theta),r*sin(theta),z))
        tube(label+' soft petal seam',pts,radius,PALE,3)
petals('Middle',[(.85,2.26),(1.20,2.33),(1.50,2.42),(1.80,2.56),(2.02,2.73),(2.17,2.91)],20,.014)

lathe('Upper column softly flared foot',[(0,2.45),(.56,2.45),(.60,2.52),(.58,2.61),(.47,2.69),(0,2.69)],PALE,n=96)
lathe('Upper rounded column',[(0,2.58),(.46,2.58),(.43,2.77),(.33,3.13),(.30,3.49),(.34,3.77),(.44,3.91),(.51,3.97),(0,3.97)],IVORY,n=96)
lathe('Upper cream capital',[(0,3.86),(.43,3.86),(.53,3.92),(.55,4.01),(.48,4.07),(0,4.07)],PALE,n=96)
for j in range(8):
    a=j*pi/4
    tube('Upper column soft flute',[(.43*cos(a),.43*sin(a),2.76),(.34*cos(a),.34*sin(a),3.10),(.31*cos(a),.31*sin(a),3.48),(.35*cos(a),.35*sin(a),3.76)],.014,PALE,3)

TOP=[(0,3.97),(.45,3.97),(.70,4.01),(.94,4.08),(1.14,4.20),(1.31,4.38),(1.39,4.56),(1.40,4.68),(1.36,4.73),(1.24,4.73),(1.20,4.66),(1.19,4.54),(1.08,4.34),(.90,4.22),(.68,4.15),(.40,4.12),(0,4.12)]
lathe('Top dry bowl | interior and exterior',TOP,IVORY,n=128)
lathe('Top rounded cream coping',[(1.23,4.58),(1.40,4.58),(1.44,4.64),(1.44,4.72),(1.38,4.78),(1.26,4.78),(1.21,4.72),(1.23,4.58)],PALE,n=128)
lathe('Top warm undercut bead',[(1.33,4.51),(1.40,4.55),(1.41,4.61),(1.34,4.64),(1.31,4.57),(1.33,4.51)],GOLDLIGHT,n=128)
petals('Top',[(.65,4.00),(.94,4.08),(1.14,4.20),(1.31,4.38),(1.39,4.56)],16,.012)

# A short rounded crown, with a decorative bud rather than the previous tall spire.
lathe('Small central crown',[(0,4.12),(.25,4.12),(.27,4.28),(.22,4.48),(.19,4.84),(.27,4.93),(.28,5.00),(.20,5.06),(0,5.06)],PALE,n=64)
lathe('Crown honey accent',[(0,4.94),(.28,4.94),(.28,4.99),(.23,5.03),(0,5.03)],GOLDLIGHT,n=64)
uv('Crown rounded bud',(0,0,5.12),(.14,.14,.20),PALE,32,20)

# Four small, friendly stone lion spouts, arranged radially around the top bowl.
def cute_lion(theta,num):
    start=set(bpy.data.objects)
    uv('Lion %d soft mane base'%num,(0,.015,0),(.285,.105,.305),PALE,28,18)
    for j in range(11):
        a=j*2*pi/11
        x=.222*cos(a);z=.235*sin(a)
        lock=uv('Lion %d round mane petal'%num,(x,-.015,z),(.086,.103,.105),PALE,20,12)
        lock.rotation_euler.y=-a
    uv('Lion %d round face'%num,(0,-.105,.005),(.195,.11,.219),IVORY,28,20)
    for side in [-1,1]:
        uv('Lion %d round ear'%num,(side*.155,-.075,.181),(.066,.051,.071),PALE,20,12)
        uv('Lion %d inner ear'%num,(side*.155,-.123,.185),(.032,.008,.035),GOLDLIGHT,16,10)
        uv('Lion %d eye'%num,(side*.072,-.210,.054),(.026,.012,.034),EYE,20,14)
        uv('Lion %d eye light'%num,(side*.069-.006,-.222,.067),(.009,.004,.011),HIGHLIGHT,12,8)
        uv('Lion %d soft cheek'%num,(side*.116,-.199,-.022),(.039,.012,.018),BLUSH,16,10)
        uv('Lion %d muzzle lobe'%num,(side*.047,-.216,-.052),(.065,.041,.047),PALE,20,14)
    uv('Lion %d tiny nose'%num,(0,-.258,-.015),(.034,.019,.022),GOLD,20,12)
    uv('Lion %d small round outlet'%num,(0,-.224,-.105),(.035,.007,.037),DARK,20,12)
    # Tiny raised lower lip, framing a round spout with no projecting metal box.
    tube('Lion %d curved lip'%num,[(.041*cos(pi+i*pi/24),-.229,-.100+.040*sin(pi+i*pi/24)) for i in range(25)],.008,PALE,2)
    pts=[]
    for k in range(44):
        t=k/43;r=.051*(1-.77*t);a=pi/2+t*2*pi*1.2
        pts.append((r*cos(a),-.185,.176+r*sin(a)))
    tube('Lion %d forehead curl'%num,pts,.014,PALE,3)
    ang=theta+pi/2
    for ob in set(bpy.data.objects)-start:
        x,y,z=ob.location
        ob.location=(1.385*cos(theta)+x*cos(ang)-y*sin(ang),1.385*sin(theta)+x*sin(ang)+y*cos(ang),4.67+z)
        ob.rotation_euler.z+=ang
for j in range(4):cute_lion(-pi/2+j*pi/2,j+1)

# Bake smooth gradients to a named vertex-color attribute before joining.
bpy.ops.object.select_all(action='DESELECT')
for ob in list(COL.objects):ob.select_set(True)
bpy.context.view_layer.objects.active=base
bpy.ops.object.convert(target='MESH')
print('GEOMETRY_READY',len(COL.objects),flush=True)
for ob in list(COL.objects):
    if ob.type!='MESH':continue
    m=ob.data;paint=m.color_attributes.new(name='Paint',type='FLOAT_COLOR',domain='CORNER')
    colors=[]
    for v in m.vertices:
        p=ob.matrix_world@v.co
        # Broad hand-painted tonal variation, avoiding high-frequency photographic noise.
        f=.91+.045*sin(p.z*1.8+.2)+.022*sin(p.x*.8+p.y*.57)+.012*cos(p.x*2.1-p.y*.8+p.z)
        colors.append(f)
    vals=[]
    for face in m.polygons:
        color=m.materials[face.material_index].diffuse_color
        for li in face.loop_indices:
            f=colors[m.loops[li].vertex_index]
            vals.extend((min(1,color[0]*f),min(1,color[1]*f),min(1,color[2]*f),1))
    paint.data.foreach_set('color',vals)
    m.color_attributes.active_color=paint
bpy.ops.object.select_all(action='DESELECT')
for ob in list(COL.objects):
    if ob.type=='MESH':ob.select_set(True)
bpy.context.view_layer.objects.active=base
bpy.ops.object.join()
asset=bpy.context.object;asset.name='Anime_Fountain_high_rim_Dry'
bpy.context.scene.cursor.location=(0,0,0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
asset['Design']='Dry anime fantasy city fountain: octagonal pool and two round bowls; four cute lion spouts'
asset['Water']='None — no water surface, streams, splashes, droplets or particles'
asset['Paint']='Soft gradients stored in Paint vertex colors; no external textures'
asset['Mesh']='Single joined mesh with disconnected decorative components and material slots'
asset['Scale']='Artistic dimensions; flat base Z=0, nominal height 5.32 m'
asset.asset_mark()

scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene['Brief']='Cream stone, rounded anime fantasy game asset, no outlines, no water, no ground plane, transparent background'
collection('90 | Presentation — camera and lights only')
world=bpy.data.worlds.new('Bright ambient');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.70,.79,.88,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.6
def aim(ob,point):ob.rotation_euler=(Vector(point)-ob.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    ob=bpy.data.objects.new(name,d);COL.objects.link(ob);ob.location=loc;aim(ob,(0,0,2))
area('Soft warm key',(-5,-7,11),1600,7,(1,.90,.75))
area('Sky fill',(6,-2,8),1000,6,(.78,.88,1))
area('Cream rim',(2,6,9),1700,5,(1,.91,.77))
d=bpy.data.cameras.new('Three quarter asset camera');cam=bpy.data.objects.new('Three quarter asset camera',d);COL.objects.link(cam)
cam.location=(8.5,-15.5,10.5);aim(cam,(0,0,2.12));d.type='ORTHO';d.ortho_scale=11.5;scene.camera=cam
d2=bpy.data.cameras.new('Front camera');front=bpy.data.objects.new('Front camera',d2);COL.objects.link(front)
front.location=(0,-20,7.7);aim(front,(0,0,2.25));d2.type='ORTHO';d2.ortho_scale=10.3
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=1250;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
bpy.ops.object.select_all(action='DESELECT');asset.select_set(True);bpy.context.view_layer.objects.active=asset
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_distance=12
            ar.spaces.active.region_3d.view_location=(0,0,2)
            ar.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            ar.spaces.active.shading.type='MATERIAL';ar.spaces.active.overlay.show_floor=False
stats={'mesh_objects':1,'vertices':len(asset.data.vertices),'triangles':sum(len(p.vertices)-2 for p in asset.data.polygons),'water':False,'ground_plane':False,'vertex_colors':'Paint','height_m':5.32}
with open(os.path.join(OUT,'Anime_Fountain_high_rim_info.json'),'w',encoding='utf8') as f:json.dump(stats,f,indent=2)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Anime_Fountain_high_rim.glb'),export_format='GLB',use_selection=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Anime_Fountain_high_rim.blend'))
print('MODEL_SAVED',stats,flush=True)
scene.render.filepath=os.path.join(OUT,'Anime_Fountain_high_rim_preview.png');bpy.ops.render.render(write_still=True)
scene.camera=front
scene.render.filepath=os.path.join(OUT,'Anime_Fountain_high_rim_front.png');bpy.ops.render.render(write_still=True)
print('COMPLETE',flush=True)
