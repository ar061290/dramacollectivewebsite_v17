# The Gallery: adding an event's pictures

The Gallery (`gallery.html`) shows the Collective's events, newest first, one row each: the date, the
name, as many pictures as fit the width, and View all over the last tile, which goes to the event's
own page (`gallery-<event>.html`): every picture (any one opens whole, and the arrows or a swipe go
through the rest), the clips among them, and the film above them where there is one. Everything comes
from `content/gallery.json`; `npm run pages` writes the Gallery's rows and each event's page whole.

The pictures live in the site itself (`assets/gallery/<event>/`), made small: a picture is about
150–250 KB whole and 25–40 KB as a tile, against 4–6 MB for a camera's original, so the page stays
quick on a cheap phone. A tile loads only when it comes near the screen.

## A new event

1. Add it to `content/gallery.json` → `events`, where it should stand (the newest first):
   `key` (small letters, digits and `-`: its folder and its address, `gallery.html#key`), `title`,
   `date` (`YYYY-MM-DD`) and `when` (the date as shown: "27 October 2026").
2. Put its pictures in a folder, named in the order they should show (`001.jpg`, `002.jpg`, …; any
   `.jpg`, `.png` or `.webp`; Drive's "Download" gives the originals, which is fine).
3. Run, with [ffmpeg](https://ffmpeg.org) installed:

   ```bash
   node tools/gallery/make.mjs <key> <folder>
   ```

   It makes `assets/gallery/<key>/001.webp` and `001-s.webp` (the tile) for each, and writes their
   sizes into the event. Running it again replaces the event's pictures.
4. `npm run pages`, look at it (`npm run dev`), then commit `assets/gallery/<key>/`,
   `content/gallery.json`, `gallery.html` and the new `gallery-<key>.html`.

## A film, pictures from it, and clips

```bash
node tools/gallery/make.mjs <key> --film <video> --stills 4,12.5,30 --clips 3:4,41:5
```

- `--film`: the film whole, as `film.mp4` (720 px, H.264, quick to start) with its poster. It loads
  only when someone presses play. Give it a `caption` in `content/gallery.json` if it needs one.
- `--stills`: pictures taken from the film at those seconds, after the event's own (their tile says
  "from the film" to a screen reader).
- `--clips`: short silent loops (`start:seconds`), each played while it is on screen and stopped when
  it leaves (not by themselves for anyone who asks for less motion: they get the controls instead).

## What is there now (27 October 2026)

From the Collective's Drive folder: CAScade (the flash play), the ISSO fundraiser (with its photobooth
pictures), the first meeting, and from the production's auditions only the offline auditions: their
photo and their film. The film is 67 minutes and 4 GB, too large to keep in the site, so it plays from
Drive (`film.drive` in `content/gallery.json`: Drive's own player, put in only when Play is pressed).
Its eight stills and four clips were made from Aadi's download of it:
`node tools/gallery/make.mjs auditions --film <file> --stills 20,500,980,1220,1940,2540,3020,3740
--clips 975:5,2055:5,2535:5,3615:5` (the film itself stays on Drive). The other audition videos, each filed under a
student's name and class, are not on the site; the folder's other videos and the audition brief are
not either.
