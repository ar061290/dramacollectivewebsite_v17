// Make an event's pictures and films for the Gallery (gallery.html), and write them into
// content/gallery.json (the event must be there already, with its key, title and dates). Needs ffmpeg
// and ffprobe on the PATH. tools/gallery/README.md has the whole of it.
//
//   node tools/gallery/make.mjs <event-key> <folder>
//     every picture in the folder (.jpg, .jpeg, .png, .webp), in the order of their file names, as
//     assets/gallery/<key>/001.webp (whole: 1600 px on its longer side at most) and 001-s.webp (the
//     tile: 440 px on its shorter side); the event's pictures are replaced by these
//   node tools/gallery/make.mjs <event-key> --film <video> [--stills 4,12.5,30] [--clips 3:4,41:5]
//     the film whole (assets/gallery/<key>/film.mp4, H.264 at 720 px, its poster film.webp; not for a
//     film the event plays from Google Drive, film.drive, which stays there), pictures
//     taken from it at those seconds (added after the event's own, marked as from the film), and short
//     silent clips (start:seconds), each clip-1.mp4 with its poster
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, 'content', 'gallery.json');
const [key, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(name); return i < 0 ? null : rest[i + 1]; };
if (!key || !rest.length) {
  console.error('node tools/gallery/make.mjs <event-key> <folder>  |  <event-key> --film <video> [--stills s,s] [--clips start:len,...]');
  process.exit(1);
}
const data = JSON.parse(readFileSync(DATA, 'utf8'));
const event = data.events.find((e) => e.key === key);
if (!event) throw new Error(`content/gallery.json has no event "${key}": add it (key, title, date, when) first`);
const out = join(ROOT, 'assets', 'gallery', key);
const rel = (name) => `assets/gallery/${key}/${name}`;
mkdirSync(out, { recursive: true });

const ff = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const size = (file) => {
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { encoding: 'utf8' }).trim().split('x').map(Number);
  return { w, h };
};
const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
const WHOLE = "scale='min(1600,iw)':'min(1600,ih)':force_original_aspect_ratio=decrease";
const TILE = "scale='if(gt(iw,ih),-2,min(440,iw))':'if(gt(iw,ih),min(440,ih),-2)'";

/** A picture (or a moment of a film, at `at` seconds): its whole and its tile. */
function picture(src, name, at = null) {
  const input = at === null ? ['-i', src] : ['-ss', String(at), '-i', src, '-frames:v', '1'];
  ff(...input, '-vf', WHOLE, '-c:v', 'libwebp', '-quality', '74', '-compression_level', '5', join(out, `${name}.webp`));
  ff('-i', join(out, `${name}.webp`), '-vf', TILE, '-c:v', 'libwebp', '-quality', '62', '-compression_level', '5', join(out, `${name}-s.webp`));
  const whole = size(join(out, `${name}.webp`));
  const tile = size(join(out, `${name}-s.webp`));
  return { src: rel(name), ...whole, tw: tile.w, th: tile.h };
}

const film = opt('--film');
if (!film) {
  const folder = rest[0];
  const files = readdirSync(folder).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  if (!files.length) throw new Error(`no pictures in ${folder}`);
  // the event's earlier pictures go (not its film's, which a --film run makes)
  for (const f of readdirSync(out)) if (/^\d{3}(-s)?\.webp$/.test(f)) rmSync(join(out, f));
  const fromFilm = (event.photos ?? []).filter((p) => p.from === 'film');
  event.photos = files.map((f, i) => {
    process.stdout.write(`\r${key}: ${i + 1} of ${files.length}`);
    return picture(join(folder, f), String(i + 1).padStart(3, '0'));
  }).concat(fromFilm);
  console.log('');
} else {
  if (!existsSync(film)) throw new Error(`no film at ${film}`);
  // (a film played from Google Drive, `film.drive`, stays there: only its stills and clips are made)
  if (!event.film?.drive) {
    ff('-i', film, '-vf', "scale=-2:'min(720,ih)'", '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', join(out, 'film.mp4'));
    ff('-ss', '1', '-i', join(out, 'film.mp4'), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '70', join(out, 'film.webp'));
    const t = Math.round(seconds(join(out, 'film.mp4')));
    event.film = { ...(event.film ?? {}), src: rel('film'), ...size(join(out, 'film.mp4')), length: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` };
  }
  const stills = (opt('--stills') ?? '').split(',').filter(Boolean).map(Number);
  for (const f of readdirSync(out)) if (/^film-\d+(-s)?\.webp$/.test(f)) rmSync(join(out, f));
  event.photos = (event.photos ?? []).filter((p) => p.from !== 'film')
    .concat(stills.map((s, i) => ({ ...picture(film, `film-${i + 1}`, s), from: 'film' })));
  const clips = (opt('--clips') ?? '').split(',').filter(Boolean).map((c) => c.split(':').map(Number));
  for (const f of readdirSync(out)) if (/^clip-\d+\.(mp4|webp)$/.test(f)) rmSync(join(out, f));
  event.clips = clips.map(([start, len], i) => {
    const name = `clip-${i + 1}`;
    ff('-ss', String(start), '-t', String(len), '-i', film, '-an', '-r', '30', '-vf', "scale=-2:'min(480,ih)'", '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, `${name}.mp4`));
    ff('-i', join(out, `${name}.mp4`), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '66', join(out, `${name}.webp`));
    return { src: rel(name), ...size(join(out, `${name}.mp4`)) };
  });
}
writeFileSync(DATA, `${JSON.stringify(data, null, 2)}\n`);
console.log(`content/gallery.json: ${key}: ${event.photos?.length ?? 0} pictures${event.film ? ', the film' : ''}${event.clips?.length ? `, ${event.clips.length} clips` : ''}`);
