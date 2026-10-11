# Colour the mark by the parts in assets/brand/mark-regions.json, to check the polygons:
#   blender -b --factory-startup -P tools/logo/regions_preview.py -- <mark.png> <mark-regions.json> <out.png>
# mask: gold, hand: green, face: blue, body: grey. Polygon outlines are drawn in white.
import bpy, sys, json
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
src, regions_path, out = argv
regions = json.load(open(regions_path))['regions']
img = bpy.data.images.load(src)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
ink = px[:, :, 3] > 0.5
ys, xs = np.mgrid[0:h, 0:w]
sx, sy = xs * 2 + 1.0, ys * 2 + 1.0  # SVG units
def inside(poly):
    poly = np.array(poly, dtype=np.float64)
    res = np.zeros_like(sx, dtype=bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        cross = ((yi > sy) != (yj > sy)) & (sx < (xj - xi) * (sy - yi) / (yj - yi + 1e-12) + xi)
        res ^= cross
        j = i
    return res
COL = {'mask': (0.95, 0.78, 0.25), 'hand': (0.35, 0.85, 0.4), 'face': (0.35, 0.55, 0.95)}
rgb = np.ones((h, w, 4), dtype=np.float32) * np.array([0.08, 0.08, 0.1, 1])
rgb[ink] = (0.55, 0.55, 0.58, 1)
taken = np.zeros_like(ink)
counts = {}
for r in regions:
    m = inside(r['polygon']) & ink & ~taken
    rgb[m, :3] = COL.get(r['name'], (1, 0, 1))
    taken |= m
    counts[r['name']] = int(m.sum())
counts['body'] = int((ink & ~taken).sum())
for r in regions:  # outlines
    p = np.array(r['polygon'], dtype=np.float64) / 2
    for a, b in zip(p, np.roll(p, -1, axis=0)):
        for t in np.linspace(0, 1, 400):
            x, y = int(a[0] + (b[0] - a[0]) * t), int(a[1] + (b[1] - a[1]) * t)
            if 0 <= x < w and 0 <= y < h: rgb[y, x, :3] = 1
o = bpy.data.images.new('r', w, h)
o.pixels[:] = rgb[::-1].ravel()
o.filepath_raw = out; o.file_format = 'PNG'; o.save()
total = sum(counts.values())
print('ink share by part:', {k: f'{v / total:.1%}' for k, v in counts.items()}, 'wrote', out)
