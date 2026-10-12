"""Crop the team's meeting photos to the 4:3 frames of the film strip on team.html.

Source: the team's Drive folder of meeting photos (WhatsApp images), downloaded as <Drive file id>.jpg.
    python tools/team/gallery.py <photos dir> [out dir, default assets/team/gallery]
Centred 4:3 crops at 960 x 720, WebP. Near-duplicate burst shots in the folder were left out.
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

PICKS = [
    ('15ZYFq9cnkkAFiaiHeRJHe8ZxjfBP9MDn', 'circle'),
    ('13qTmdexmx8YKKA_22pPtk-grcOJ2AOUT', 'laptop'),
    ('15QkwHQGKzTbkM9sU06FoidkbHe5lMBOl', 'wings'),
    ('13s726yzzFl_YpuvkTV75KNpJ4idyKEwW', 'notes'),
    ('18qe9RKzLvTeRLlxay8UNM7Ku7sNRBXc4', 'selfie'),
    ('1GyrPchJ1V9d1FvQWdr9xa6X8Fhc9N4fi', 'floor'),
    ('11Zk7jOZhoK9liH7Iglh6zvdmVGWZ0Abd', 'talk'),
    ('1xMMf6jkSaZeQxxGV8NCZEOAXEtKAWQIF', 'room'),
]


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[2] / 'assets' / 'team' / 'gallery'
    out.mkdir(parents=True, exist_ok=True)
    for i, (fid, name) in enumerate(PICKS, 1):
        im = ImageOps.exif_transpose(Image.open(src / f'{fid}.jpg')).convert('RGB')
        w, h = im.size
        tw = min(w, round(h * 4 / 3))
        th = round(tw * 3 / 4)
        left, top = (w - tw) // 2, (h - th) // 2
        im = im.crop((left, top, left + tw, top + th)).resize((960, 720), Image.LANCZOS)
        im.save(out / f'{i:02d}-{name}.webp', 'WEBP', quality=78, method=6)
        print(f'{i:02d}-{name}: {im.width}x{im.height}')


if __name__ == '__main__':
    main()
