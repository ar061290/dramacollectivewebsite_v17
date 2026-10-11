# List the separate ink pieces of the mark (4-connected components of its alpha), to decide which
# piece is the mask, the face, the hand and so on. Writes a colour-coded PNG and prints, per piece:
# id, area, bounding box and one interior point, all in SVG units (the traced SVG is 2x the PNG).
#   blender -b --factory-startup -P tools/logo/components.py -- <mark.png> <out.png>
import bpy, sys, json, colorsys
import numpy as np
from collections import deque

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
img = bpy.data.images.load(src)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top row first
ink = px[:, :, 3] > 0.5
label = np.zeros((h, w), dtype=np.int32)
comps = []
for y0 in range(h):
    for x0 in range(w):
        if not ink[y0, x0] or label[y0, x0]:
            continue
        cid = len(comps) + 1
        q = deque([(y0, x0)]); label[y0, x0] = cid; pts = []
        while q:
            y, x = q.popleft(); pts.append((x, y))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and ink[yy, xx] and not label[yy, xx]:
                    label[yy, xx] = cid; q.append((yy, xx))
        a = np.array(pts)
        # an interior point: the ink pixel farthest from the component's edge (cheap: nearest to the
        # centroid among pixels whose 5x5 neighbourhood is all ink)
        cx, cy = a[:, 0].mean(), a[:, 1].mean()
        solid = [p for p in pts if ink[max(0, p[1] - 2):p[1] + 3, max(0, p[0] - 2):p[0] + 3].all()] or pts
        s = np.array(solid)
        k = np.argmin((s[:, 0] - cx) ** 2 + (s[:, 1] - cy) ** 2)
        comps.append(dict(id=cid, area=len(pts), bbox=[int(a[:, 0].min()) * 2, int(a[:, 1].min()) * 2, int(a[:, 0].max()) * 2, int(a[:, 1].max()) * 2],
                          inside=[int(s[k, 0]) * 2 + 1, int(s[k, 1]) * 2 + 1]))
comps.sort(key=lambda c: -c['area'])
for c in comps:
    if c['area'] >= 20: print(json.dumps(c))
# colour-coded image with a 50 px grid (PNG pixels)
rgb = np.ones((h, w, 4), dtype=np.float32) * np.array([0.1, 0.1, 0.12, 1])
for i, c in enumerate(comps):
    r, g, b = colorsys.hsv_to_rgb((i * 0.61803) % 1, 0.75, 0.95)
    rgb[label == c['id']] = (r, g, b, 1)
rgb[::50, :, :3] = 0.45; rgb[:, ::50, :3] = 0.45
rgb[::100, :, :3] = 0.8; rgb[:, ::100, :3] = 0.8
o = bpy.data.images.new('c', w, h)
o.pixels[:] = rgb[::-1].ravel()
o.filepath_raw = out; o.file_format = 'PNG'; o.save()
print('pieces', len([c for c in comps if c['area'] >= 20]), 'wrote', out)
