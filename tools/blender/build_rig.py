# Build the posable statue for the site: assets/models/statue-rig.glb
#
#   blender -b --factory-startup -P tools/blender/build_rig.py -- <source.glb> <out.glb> [tris=160000] [tex=2048] [renders=<dir>]
#
# 1. Import the Meshy scan (one fused mesh, no rig), merge its UV-seam duplicates so the surface is
#    one connected piece, normalise it (height 2, base on y = 0, plinth footprint on the y axis),
#    and decimate it to `tris` triangles.
# 2. Build the skeleton from rig.json and skin the mesh with Blender's automatic (bone heat) weights,
#    then make the hand + mask one rigid piece and limit every vertex to 4 influences.
# 3. Solve the end pose from pose.json: analytic two-bone IK for the masked arm, the hand turned so the
#    mask faces forward, and the head nodded forward and turned away (the neck takes a share).
# 4. Export a GLB with the skin and one action, "Pose": frame 0 = rest, frame 10 = end pose. The site
#    reads the two keyframes per bone and blends them itself (arm and head on their own eases).
# 5. Optionally render close-ups of the end pose (shoulder, elbow, neck) to check the deformation.
import bpy, sys, json, math, os
import numpy as np
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
opts = dict(a.split('=', 1) for a in argv[2:])
TRIS = int(opts.get('tris', 160000))
TEX = int(opts.get('tex', 2048))
RENDERS = opts.get('renders')
RIG = json.load(open(os.path.join(HERE, 'rig.json')))['bones']
POSE = json.load(open(os.path.join(HERE, 'pose.json')))
HEIGHT = 2.0  # the site's statue height
END_FRAME = 10

def log(*a): print('[rig]', *a, flush=True)

def G(p):
    """rig.json point (glTF axes, height fractions) -> Blender armature space."""
    return Vector((p[0] * HEIGHT, -p[2] * HEIGHT, p[1] * HEIGHT))

def Gdir(d):
    return Vector((d[0], -d[2], d[1])).normalized()

# ---- 1. import, normalise, decimate ----
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=src, merge_vertices=True)
mesh = next(o for o in scene.objects if o.type == 'MESH')
for o in list(scene.objects):
    o.select_set(o is mesh)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(scene.objects):
    if o is not mesh:
        bpy.data.objects.remove(o, do_unlink=True)
mesh.name = 'Statue'; mesh.data.name = 'Statue'

me = mesh.data
n = len(me.vertices)
co = np.empty(n * 3, dtype=np.float64); me.vertices.foreach_get('co', co); co = co.reshape(n, 3)
zmin, zmax = co[:, 2].min(), co[:, 2].max()
H = zmax - zmin
foot = co[co[:, 2] <= zmin + 0.04 * H]
fx, fy = foot[:, 0].mean(), foot[:, 1].mean()
s = HEIGHT / H
me.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-fx, -fy, -zmin)))
me.update()
log(f'imported {n} vertices, {len(me.polygons)} faces; height {H:.4f} -> {HEIGHT}')

# custom split normals from the scan would not survive decimation: smooth shading instead
if me.has_custom_normals:
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))

tris_now = sum(len(p.vertices) - 2 for p in me.polygons)
if tris_now > TRIS:
    mod = mesh.modifiers.new('Decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = TRIS / tris_now
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
me = mesh.data
log(f'decimated to {len(me.vertices)} vertices, {len(me.polygons)} faces')

# textures: cap the size
for img in bpy.data.images:
    if img.size[0] > TEX or img.size[1] > TEX:
        log(f'texture {img.name} {tuple(img.size)} -> {TEX}')
        img.scale(TEX, TEX)

# ---- 2. skeleton and weights ----
arm_data = bpy.data.armatures.new('Rig')
arm = bpy.data.objects.new('Rig', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name, b in RIG.items():
    eb = arm_data.edit_bones.new(name)
    eb.head = G(b['head']); eb.tail = G(b['tail'])
for name, b in RIG.items():
    if b['parent']:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[b['parent']]
bpy.ops.object.mode_set(mode='OBJECT')

for o in scene.objects: o.select_set(False)
mesh.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
log('automatic weights done')

# weights as an array [vertex, bone]
names = list(RIG.keys())
nv = len(me.vertices)
W = np.zeros((nv, len(names)))
gi = {vg.index: names.index(vg.name) for vg in mesh.vertex_groups if vg.name in names}
for v in me.vertices:
    for g in v.groups:
        if g.group in gi: W[v.index, gi[g.group]] = g.weight
co = np.empty(nv * 3); me.vertices.foreach_get('co', co); co = co.reshape(nv, 3)
gx, gy, gz = co[:, 0] / HEIGHT, co[:, 2] / HEIGHT, -co[:, 1] / HEIGHT  # glTF height fractions
unweighted = W.sum(1) < 1e-6
log(f'unweighted vertices after heat: {int(unweighted.sum())}')
W[unweighted, names.index('root')] = 1.0  # fall back to the static root

# the hand and the mask are one rigid piece; the fingers blend into it over the grip
hand = names.index('hand.L')
wrist_y = RIG['hand.L']['head'][1]
side = gx > 0.12
grip = side & (gy > wrist_y - 0.02) & (gy < wrist_y)
t = np.clip((gy - (wrist_y - 0.02)) / 0.02, 0, 1)
W[grip] *= (1 - t[grip])[:, None]; W[grip, hand] += t[grip]
rigid = side & (gy >= wrist_y)
W[rigid] = 0; W[rigid, hand] = 1

# nothing below the chest follows the arm or the head (robes stay put)
moving = [names.index(b) for b in ('clavicle.L', 'upper_arm.L', 'forearm.L', 'forearm_twist.L', 'hand.L', 'neck', 'head')]
low = gy < 0.6
spill = W[low][:, moving].sum(1)
Wl = W[low]; Wl[:, moving] = 0; Wl[:, names.index('spine')] += spill; W[low] = Wl

# at most 4 influences, normalised
order = np.argsort(-W, axis=1)
keep = np.zeros_like(W, dtype=bool)
np.put_along_axis(keep, order[:, :4], True, axis=1)
W[~keep] = 0
W /= W.sum(1, keepdims=True)
for vg in list(mesh.vertex_groups): mesh.vertex_groups.remove(vg)
groups = [mesh.vertex_groups.new(name=nm) for nm in names]
for j, g in enumerate(groups):
    idx = np.nonzero(W[:, j] > 1e-4)[0]
    for i in idx: g.add([int(i)], float(W[i, j]), 'REPLACE')
dom = np.argmax(W, axis=1)
log('dominant bone counts: ' + ', '.join(f'{nm}={int((dom == j).sum())}' for j, nm in enumerate(names)))

# ---- 3. end pose ----
pbs = arm.pose.bones
for pb in pbs: pb.rotation_mode = 'QUATERNION'

def set_world(pb, R, new_head):
    """Pose `pb` so it is rotated by R (armature space) about its rest head, then moved to new_head."""
    rest = pb.bone.matrix_local
    pb.matrix = Matrix.Translation(new_head) @ R.to_matrix().to_4x4() @ Matrix.Translation(-rest.translation) @ rest
    bpy.context.view_layer.update()

def key_all(frame):
    for pb in pbs:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)


# head: nod forward, then turn away; the neck takes a share of the rotation
hp = POSE['head']
R_head = (Quaternion((0, 0, 1), math.radians(hp['turn'])) @ Quaternion((1, 0, 0), math.radians(hp['nod']))
          @ Quaternion((0, 1, 0), math.radians(hp['tilt'])))
R_neck = Quaternion().slerp(R_head, hp['neckShare'])
neck_head = pbs['neck'].bone.head_local.copy()
set_world(pbs['neck'], R_neck, neck_head)
head_joint = neck_head + R_neck @ (pbs['head'].bone.head_local - neck_head)
set_world(pbs['head'], R_head, head_joint)

# arm: two-bone IK in the plane of shoulder, wrist target and pole
S = pbs['upper_arm.L'].bone.head_local.copy()
E0 = pbs['forearm.L'].bone.head_local.copy()
W0 = pbs['hand.L'].bone.head_local.copy()
L1, L2 = (E0 - S).length, (W0 - E0).length
target, pole = G(POSE['arm']['wrist']), G(POSE['arm']['pole'])
dvec = target - S
d = min(max(dvec.length, abs(L1 - L2) + 1e-4), L1 + L2 - 1e-4)
axis = dvec.normalized()
a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
h = math.sqrt(max(0.0, L1 * L1 - a * a))
u = (pole - S) - axis * (pole - S).dot(axis)
u.normalize()
E = S + axis * a + u * h
Wp = S + axis * d
def frame(facing, up):
    f = facing.normalized(); r = f.cross(up).normalized(); u2 = r.cross(f)
    return Matrix((r, f, u2)).transposed()  # columns: right, facing, up

def twist_angle(q, axis):
    """Signed angle of q's twist about `axis` (swing-twist split), in (-pi, pi]."""
    a = 2 * math.atan2(Vector((q.x, q.y, q.z)).dot(axis), q.w)
    return a - 2 * math.pi if a > math.pi else a

# the hand's final orientation: the mask faces `maskFacing` and stays upright
# (at rest it faces the figure's back, glTF -z = Blender +y)
F_rest = frame(Vector((0, 1, 0)), Vector((0, 0, 1)))
F_end = frame(Gdir(POSE['arm']['maskFacing']), Vector((0, 0, 1)))
R_hand = (F_end @ F_rest.transposed()).to_quaternion()
share = POSE['arm'].get('twistShare', {})
M0 = pbs['forearm_twist.L'].bone.head_local.copy()

def forearm_swing(R_ua):
    return (R_ua @ (W0 - E0)).rotation_difference(Wp - E) @ R_ua

# twist the arm would need with no twist anywhere but the wrist
f_axis = (Wp - E).normalized()
u_axis = (E - S).normalized()
R_ua0 = (E0 - S).rotation_difference(E - S)
T = twist_angle(R_hand @ forearm_swing(R_ua0).inverted(), f_axis)
# upper arm takes its share about its own axis (the elbow stays put), the forearm bones the rest
a_ua = share.get('upper_arm.L', 0.0)
R_ua = Quaternion(u_axis, a_ua * T) @ R_ua0
set_world(pbs['upper_arm.L'], R_ua, S)
R_sw = forearm_swing(R_ua)
T_rem = twist_angle(R_hand @ R_sw.inverted(), f_axis)
c_fa = (share.get('forearm.L', a_ua) - a_ua) / max(1e-6, 1 - a_ua)
c_tw = (share.get('forearm_twist.L', a_ua) - a_ua) / max(1e-6, 1 - a_ua)
R_fa = Quaternion(f_axis, c_fa * T_rem) @ R_sw
set_world(pbs['forearm.L'], R_fa, E)
R_tw = Quaternion(f_axis, c_tw * T_rem) @ R_sw
set_world(pbs['forearm_twist.L'], R_tw, E + R_fa @ (M0 - E0))
set_world(pbs['hand.L'], R_hand, Wp)
log(f'mask turn {math.degrees(T):.0f} deg about the arm: upper arm {math.degrees(a_ua * T):.0f}, '
    f'elbow step {math.degrees(c_fa * T_rem):.0f}, mid-forearm step {math.degrees((c_tw - c_fa) * T_rem):.0f}, '
    f'wrist step {math.degrees((1 - c_tw) * T_rem):.0f}')
log(f'arm: shoulder-elbow {L1 / HEIGHT:.3f}, elbow-wrist {L2 / HEIGHT:.3f}, reach {d / HEIGHT:.3f} (asked {dvec.length / HEIGHT:.3f})')
log(f'elbow at {tuple(round(v, 3) for v in (E.x / HEIGHT, E.z / HEIGHT, -E.y / HEIGHT))} (glTF height fractions)')
# keyframes: pose first, then record (keyframing earlier would let frame changes reset the pose)
end_basis = {pb.name: pb.matrix_basis.copy() for pb in pbs}
arm.animation_data_create()
scene.frame_set(0)
for pb in pbs: pb.matrix_basis = Matrix.Identity(4)
key_all(0)
scene.frame_set(END_FRAME)
for pb in pbs: pb.matrix_basis = end_basis[pb.name]
key_all(END_FRAME)
bpy.context.view_layer.update()
action = arm.animation_data.action
action.name = 'Pose'
scene.frame_start, scene.frame_end = 0, END_FRAME

# where the mask and face end up (for the README and for tuning)
dg = bpy.context.evaluated_depsgraph_get()
ev = mesh.evaluated_get(dg)
evco = np.array([ev.matrix_world @ v.co for v in ev.data.vertices])
mask_end = evco[rigid].mean(0)
head_idx = dom == names.index('head')
head_end = evco[head_idx].mean(0)
def kabsch(P, Q):
    P0, Q0 = P - P.mean(0), Q - Q.mean(0)
    U, _, Vt = np.linalg.svd(P0.T @ Q0)
    dd = np.sign(np.linalg.det(Vt.T @ U.T))
    return Vt.T @ np.diag([1, 1, dd]) @ U.T
R_mask = kabsch(co[rigid], evco[rigid])
face_end = R_mask @ np.array([0, 1, 0])
want = Gdir(POSE['arm']['maskFacing'])
R_bone = (pbs['hand.L'].matrix @ pbs['hand.L'].bone.matrix_local.inverted()).to_quaternion()
log(f'mask facing (Blender axes): measured {np.round(face_end, 3)}, bone says {tuple(round(v, 3) for v in R_bone @ Vector((0, 1, 0)))}, wanted {tuple(round(v, 3) for v in want)}')
log(f'end: mask centre {tuple(round(v, 3) for v in (mask_end[0] / 2, mask_end[2] / 2, -mask_end[1] / 2))}, '
    f'head centre {tuple(round(v, 3) for v in (head_end[0] / 2, head_end[2] / 2, -head_end[1] / 2))}')

# ---- 4. export ----
for o in scene.objects: o.select_set(o in (mesh, arm))
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
kw = dict(
    filepath=out, export_format='GLB', use_selection=True, export_yup=True,
    export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
    export_def_bones=False, export_all_influences=False, export_morph=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14, export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12, export_draco_generic_quantization=12,
    export_image_format='WEBP', export_image_quality=85,
    export_optimize_animation_size=False, export_force_sampling=False,
)
missing = [k for k in kw if k not in props]
if missing: log('exporter has no option(s):', missing)
bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
log(f'exported {out}: {os.path.getsize(out) / 1e6:.2f} MB')

# ---- 5. close-up renders of the end pose ----
if RENDERS:
    os.makedirs(RENDERS, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = scene.render.resolution_y = 800
    scene.world = bpy.data.worlds.new('w'); scene.world.color = (0.08, 0.08, 0.09)
    cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
    def shot(name, centre, scale, look):
        cam_data.ortho_scale = scale
        cam.location = centre - look * 10
        cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(RENDERS, name + '.png')
        bpy.ops.render.render(write_still=True)
        log('render', scene.render.filepath)
    front = Vector((0, 1, 0))  # the figure's front (the view the site ends on)
    three_q = Vector((0.6, 1, 0)).normalized()
    side = Vector((-1, 0, 0))
    for frame_no, tag in ((0, 'rest'), (END_FRAME, 'end')):
        scene.frame_set(frame_no)
        shot(f'{tag}_full_front', Vector((0, 0, 1.0)), 2.3, front)
        shot(f'{tag}_upper_front', Vector((0.15, 0, 1.5)), 0.9, front)
    scene.frame_set(END_FRAME)
    shot('end_upper_threequarter', Vector((0.15, 0, 1.5)), 0.9, three_q)
    shot('end_upper_side', Vector((0.15, 0, 1.5)), 0.9, side)
    shot('end_closeup_shoulder', S, 0.32, three_q)
    shot('end_closeup_elbow', E, 0.32, front)
    shot('end_closeup_neck', pbs['neck'].head, 0.32, three_q)
