"""The lite tier's statue models (src/scene/lite.js): the same GLB with every picture larger than 1024 pixels a
side shrunk to 1024 (Lanczos) and saved again as WebP. Every other byte of the file is kept as it is (the meshes'
Draco data, the materials, the extensions): only the pictures' bytes and the binary chunk's offsets change.

    python tools/models/lite-maps.py [--quality 90] assets/models/statue-rig.glb ...   (Pillow: pip install pillow)

writes assets/models/<name>-lite.glb beside each. A phone on the lite tier used to download the 2048-pixel
pictures and shrink them itself before the upload (lite.js); it now downloads these.
"""
import io, json, struct, sys, os
from PIL import Image

MAX = 1024


def lite(path, quality):
    b = open(path, 'rb').read()
    magic, version, total = struct.unpack_from('<III', b, 0)
    assert magic == 0x46546C67 and version == 2, 'not a glTF 2 binary'
    jlen, jtype = struct.unpack_from('<II', b, 12)
    js = json.loads(b[20:20 + jlen])
    blen, btype = struct.unpack_from('<II', b, 20 + jlen)
    bin_ = b[28 + jlen: 28 + jlen + blen]
    views = js['bufferViews']
    replaced = {}
    for img in js.get('images', []):
        v = img['bufferView']
        bv = views[v]
        data = bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        im = Image.open(io.BytesIO(data))
        if max(im.size) <= MAX:
            continue
        s = MAX / max(im.size)
        small = im.convert('RGBA' if 'A' in im.getbands() else 'RGB').resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
        out = io.BytesIO()
        small.save(out, 'WEBP', quality=quality, method=6)
        replaced[v] = out.getvalue()
        img['mimeType'] = 'image/webp'
    # the binary chunk again, every view in its old order, each at a 4-byte boundary
    order = sorted(range(len(views)), key=lambda i: views[i].get('byteOffset', 0))
    chunk = bytearray()
    for i in order:
        bv = views[i]
        data = replaced.get(i) or bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        while len(chunk) % 4:
            chunk.append(0)
        bv['byteOffset'] = len(chunk)
        bv['byteLength'] = len(data)
        chunk += data
    while len(chunk) % 4:
        chunk.append(0)
    js['buffers'][0]['byteLength'] = len(chunk)
    jb = json.dumps(js, separators=(',', ':')).encode('utf-8')
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(chunk)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(chunk), 0x004E4942) + bytes(chunk)
    root, ext = os.path.splitext(path)
    dst = f'{root}-lite{ext}'
    open(dst, 'wb').write(glb)
    print(f'{os.path.basename(path)}: {len(b) // 1024} KB -> {os.path.basename(dst)} {len(glb) // 1024} KB ({len(replaced)} pictures shrunk)')


if __name__ == '__main__':
    args = sys.argv[1:]
    q = 90
    if args and args[0] == '--quality':
        q = int(args[1]); args = args[2:]
    for p in args:
        lite(p, q)
