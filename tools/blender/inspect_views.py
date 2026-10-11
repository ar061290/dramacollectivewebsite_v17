# Diagnostic renders of the source statue: orthographic views with height gridlines, used to place
# the rig's joints. Run:
#   blender -b --factory-startup -P tools/blender/inspect_views.py -- <statue.glb> <out_dir> [rig.json]
# Gridlines: every 5% of the statue's height (thin), every 25% (thick, red). With a rig.json, the
# joints are drawn as yellow dots and the bones as lines.
import bpy, sys, json, math, os
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out_dir = argv[0], argv[1]
rig = json.load(open(argv[2])) if len(argv) > 2 else None
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')

# normalise like the site: height 2, base on z = 0, footprint (lowest 4%) centred on the z axis
bpy.context.view_layer.update()
co = np.array([mesh.matrix_world @ v.co for v in mesh.data.vertices])
zmin, zmax = co[:, 2].min(), co[:, 2].max()
H = zmax - zmin
foot = co[co[:, 2] <= zmin + 0.04 * H]
fx, fy = foot[:, 0].mean(), foot[:, 1].mean()
print(f'source height {H:.4f}, footprint ({fx:.4f}, {fy:.4f})')

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.display.shading.show_cavity = True
scene.render.resolution_x = scene.render.resolution_y = 900
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new('w'); scene.world.color = (0.08, 0.08, 0.09)

cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam

# views: name, direction the camera looks along, up; (glTF +z = Blender -y: the figure's front)
VIEWS = {
    'front': (Vector((0, 1, 0)),), 'back': (Vector((0, -1, 0)),),
    'side_left': (Vector((-1, 0, 0)),), 'side_right': (Vector((1, 0, 0)),),
}
FRAMES = {'full': (1.0, 2.25), 'upper': (1.62, 0.78)}  # (centre height as fraction*2, ortho scale)

def world_to_px(p, look, centre_z, scale):
    # orthographic projection for a camera looking along `look` with z up
    right = look.cross(Vector((0, 0, 1))).normalized()
    u = (p - Vector((0, 0, centre_z))).dot(right)
    v = p.z - centre_z
    px = 450 + u / scale * 900
    py = 450 - v / scale * 900
    return px, py

for fname, (cz, scale) in FRAMES.items():
    for vname, (look,) in VIEWS.items():
        cam_data.ortho_scale = scale
        target = Vector((fx, fy, zmin + cz / 2 * H))
        cam.location = target - look * 10
        cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
        path = os.path.join(out_dir, f'{fname}_{vname}.png')
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        # overlay gridlines and the rig in image space
        img = bpy.data.images.load(path)
        w, h = img.size
        px = np.array(img.pixels[:]).reshape(h, w, 4)  # rows from the bottom
        for k in range(0, 21):
            zf = k * 0.05
            z = zmin + zf * H
            row = int(round((z - target.z) / scale * h + h / 2))
            if 0 <= row < h:
                thick = 2 if k % 5 == 0 else 0
                col = (0.9, 0.2, 0.2, 1) if k % 5 == 0 else (0.35, 0.6, 0.9, 1)
                px[max(0, row - thick):row + thick + 1, :, :] = col
        if rig:
            right = look.cross(Vector((0, 0, 1))).normalized()
            def to_img(p):
                q = Vector((fx + p[0] * H, fy - p[2] * H, zmin + p[1] * H))  # rig.json uses glTF axes, height-fraction units
                u = (q - target).dot(right); v = q.z - target.z
                return int(round(u / scale * w + w / 2)), int(round(v / scale * h + h / 2))
            for name, b in rig['bones'].items():
                x0, y0 = to_img(b['head']); x1, y1 = to_img(b['tail'])
                n = max(abs(x1 - x0), abs(y1 - y0), 1)
                for t in np.linspace(0, 1, n + 1):
                    xx, yy = int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t)
                    if 0 <= xx < w and 0 <= yy < h: px[yy, xx] = (0.2, 1, 0.3, 1)
                if 3 <= x0 < w - 3 and 3 <= y0 < h - 3:
                    px[y0 - 3:y0 + 4, x0 - 3:x0 + 4] = (1, 0.85, 0.1, 1)
        img.pixels[:] = px.ravel()
        img.filepath_raw = path; img.file_format = 'PNG'; img.save()
        print('wrote', path)
