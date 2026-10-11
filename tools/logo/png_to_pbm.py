# Threshold the logo PNG's alpha into a 1-bit PBM for potrace (potrace traces black pixels).
# Runs inside Blender's Python, which can read PNGs without extra packages:
#   blender -b --factory-startup -P tools/logo/png_to_pbm.py -- <in.png> <out.pbm> [scale]
# `scale` upsamples first (nearest), so potrace has more edge to fit; 2 is plenty for the 615 px mark.
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
scale = int(argv[2]) if len(argv) > 2 else 2

img = bpy.data.images.load(src)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top row first
ink = px[:, :, 3] > 0.5
if scale > 1:
    ink = np.repeat(np.repeat(ink, scale, axis=0), scale, axis=1)
H, W = ink.shape
rows = np.packbits(ink, axis=1)  # 1 = black
with open(dst, 'wb') as f:
    f.write(f'P4\n{W} {H}\n'.encode())
    f.write(rows.tobytes())
print(f'wrote {dst}: {W}x{H}, ink {ink.mean():.1%}')
