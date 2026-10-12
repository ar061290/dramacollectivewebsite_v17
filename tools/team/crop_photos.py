"""Crop the core team's photos to 4:5 portraits for team.html.

Source: the images of the core team intros Google Doc (File > Download > Web page, unzipped).
    python tools/team/crop_photos.py <doc images dir> [out dir, default assets/team]
Each box is (left, top, right, bottom) in source pixels, chosen by eye around the face.
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

PHOTOS = {
    'aadi': ('image1.jpg', (717, 60, 1237, 710)),
    'aripra': ('image19.jpg', (560, 40, 1080, 690)),
    'karthikeya': ('image20.png', (0, 0, 441, 551)),
    'snikitha': ('image6.jpg', (0, 40, 520, 690)),
    'ikshan': ('image15.jpg', (0, 0, 207, 259)),
    'hasini': ('image9.jpg', (66, 150, 586, 800)),
    'bhavneesh': ('image4.jpg', (200, 120, 1080, 1220)),
    'avyukth': ('image10.png', (58, 0, 1140, 1352)),
    'rimsha': ('image3.jpg', (0, 0, 1525, 1906)),
    'darsh': ('image17.png', (131, 230, 411, 580)),
    'deeksha': ('image14.jpg', (0, 0, 704, 880)),
    'pritika': ('image7.jpg', (0, 0, 852, 1065)),
    'randheer': ('image16.jpg', (0, 0, 315, 394)),
    'samaara': ('image12.jpg', (100, 0, 667, 709)),
    'hemanth': ('image13.png', (0, 60, 446, 617)),
    'design-head': ('image18.png', (50, 0, 1123, 1341)),
    'gautam': ('image8.png', (93, 0, 547, 568)),
    'jasshan': ('image2.jpg', (447, 380, 927, 980)),
}
MAX_W = 640


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[2] / 'assets' / 'team'
    out.mkdir(parents=True, exist_ok=True)
    for name, (file, box) in PHOTOS.items():
        im = ImageOps.exif_transpose(Image.open(src / file)).convert('RGB').crop(box)
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        im.save(out / f'{name}.webp', 'WEBP', quality=80, method=6)
        print(f'{name}: {im.width}x{im.height}')


if __name__ == '__main__':
    main()
