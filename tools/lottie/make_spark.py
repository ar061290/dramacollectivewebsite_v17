"""assets/lottie/spark.json: a four-point star pops and turns an eighth, eight sparks fly out, all fade.

    python tools/lottie/make_spark.py
64 x 64 px, 60 fps, 40 frames; the star is the cursor's star, gold-500.
"""
import json
import math
from pathlib import Path

GOLD = [0.9216, 0.8471, 0.549, 1]
OUT = [0.16, 1]  # ease-out (the system's --ease-out family)
IN = [0.3, 0]


def kf(t, s, o=IN, i=OUT):
    return {'t': t, 's': s, 'o': {'x': [o[0]], 'y': [o[1]]}, 'i': {'x': [i[0]], 'y': [i[1]]}}


def transform(p, s=None, r=None, o=None):
    return {
        'o': o or {'a': 0, 'k': 100},
        'r': r or {'a': 0, 'k': 0},
        'p': p,
        'a': {'a': 0, 'k': [0, 0, 0]},
        's': s or {'a': 0, 'k': [100, 100, 100]},
    }


def star(r=14, w=3.4):
    pts = []
    for k in range(4):
        a = math.pi / 2 * k - math.pi / 2
        pts.append([round(math.cos(a) * r, 2), round(math.sin(a) * r, 2)])
        b = a + math.pi / 4
        pts.append([round(math.cos(b) * w, 2), round(math.sin(b) * w, 2)])
    z = [[0, 0]] * len(pts)
    return {'ty': 'gr', 'nm': 'star', 'it': [
        {'ty': 'sh', 'nm': 'p', 'd': 1, 'ks': {'a': 0, 'k': {'i': z, 'o': z, 'v': pts, 'c': True}}},
        {'ty': 'fl', 'nm': 'f', 'c': {'a': 0, 'k': GOLD}, 'o': {'a': 0, 'k': 100}, 'r': 1},
        {'ty': 'tr', 'p': {'a': 0, 'k': [0, 0]}, 'a': {'a': 0, 'k': [0, 0]}, 's': {'a': 0, 'k': [100, 100]},
         'r': {'a': 0, 'k': 0}, 'o': {'a': 0, 'k': 100}, 'sk': {'a': 0, 'k': 0}, 'sa': {'a': 0, 'k': 0}},
    ]}


def dot(d=3):
    return {'ty': 'gr', 'nm': 'dot', 'it': [
        {'ty': 'el', 'nm': 'e', 'd': 1, 'p': {'a': 0, 'k': [0, 0]}, 's': {'a': 0, 'k': [d, d]}},
        {'ty': 'fl', 'nm': 'f', 'c': {'a': 0, 'k': GOLD}, 'o': {'a': 0, 'k': 100}, 'r': 1},
        {'ty': 'tr', 'p': {'a': 0, 'k': [0, 0]}, 'a': {'a': 0, 'k': [0, 0]}, 's': {'a': 0, 'k': [100, 100]},
         'r': {'a': 0, 'k': 0}, 'o': {'a': 0, 'k': 100}, 'sk': {'a': 0, 'k': 0}, 'sa': {'a': 0, 'k': 0}},
    ]}


def layer(ind, nm, ks, shapes):
    return {'ddd': 0, 'ind': ind, 'ty': 4, 'nm': nm, 'sr': 1, 'ks': ks, 'ao': 0, 'shapes': shapes,
            'ip': 0, 'op': 40, 'st': 0, 'bm': 0}


C = 32
layers = [layer(1, 'star', transform(
    {'a': 0, 'k': [C, C, 0]},
    s={'a': 1, 'k': [kf(0, [20, 20, 100]), kf(13, [118, 118, 100]), kf(22, [100, 100, 100], i=[0.4, 1]), {'t': 40, 's': [100, 100, 100]}]},
    r={'a': 1, 'k': [kf(0, [0]), {'t': 24, 's': [45]}]},
    o={'a': 1, 'k': [kf(0, [0]), kf(5, [100]), kf(26, [100]), {'t': 40, 's': [0]}]},
), [star()])]
for k in range(8):
    a = math.pi / 4 * k + math.pi / 8
    p0 = [C + math.cos(a) * 9, C + math.sin(a) * 9, 0]
    p1 = [C + math.cos(a) * 28, C + math.sin(a) * 28, 0]
    layers.append(layer(2 + k, f'spark{k}', transform(
        {'a': 1, 'k': [{**kf(4, [round(v, 2) for v in p0]), 'ti': [0, 0, 0], 'to': [0, 0, 0]}, {'t': 28, 's': [round(v, 2) for v in p1]}]},
        o={'a': 1, 'k': [kf(0, [0]), kf(6, [100]), kf(18, [100]), {'t': 30, 's': [0]}]},
    ), [dot(3 if k % 2 else 2.2)]))

anim = {'v': '5.7.4', 'fr': 60, 'ip': 0, 'op': 40, 'w': 64, 'h': 64, 'nm': 'spark', 'ddd': 0, 'assets': [], 'layers': layers}
out = Path(__file__).resolve().parents[2] / 'assets' / 'lottie' / 'spark.json'
out.write_text(json.dumps(anim, separators=(',', ':')), encoding='utf-8')
print(out, out.stat().st_size, 'bytes')
