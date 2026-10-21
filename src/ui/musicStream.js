// The music's playlist fed to its audio element a little at a time (Chromium, through Media Source
// Extensions; src/ui/music.js). Played from a plain src, Chromium reads ahead about 3 MB from wherever
// the page starts it: a floor that does not care about the bitrate (at this file's, some three and a half
// minutes), and the next page starts somewhere else, so every page view fetched about 2.8 MB, most of it
// never heard. Fed here instead in pieces, with about half a minute kept ahead of what is playing. The
// element, its random start, its fades, its loop and the visitor's controls are the page's as before;
// only where its bytes come from changes. A point in the playlist is found in the file's own table of
// contents (its Xing header), as a browser's own MP3 seeking does.

const SAMPLES = 1152; // a frame of MPEG-1 Layer III
const RATES = [44100, 48000, 32000];
const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const AHEAD = 30; // seconds kept ahead while it plays
const PAUSED = 4; // ... and while it waits to (started from there at once when it may)
const BEHIND = 15; // seconds kept behind it (a little back is still at hand)
const PIECE = 192 * 1024; // bytes a request: about a quarter of a minute here
const FIRST = 16 * 1024; // the very first piece, just enough for the element to know its length

/** Whether this browser takes the stream: Chromium, with MP3 in Media Source Extensions. */
export const canStream = () => typeof MediaSource === 'function' && MediaSource.isTypeSupported('audio/mpeg')
  && !!navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand));

/** The length in bytes of the MPEG-1 Layer III frame whose header is at `i` of `b`, or 0. */
function frameAt(b, i) {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xfe) !== 0xfa) return 0; // sync, MPEG-1, Layer III
  const br = b[i + 2] >> 4, sr = (b[i + 2] >> 2) & 3;
  if (br === 0 || br === 15 || sr === 3) return 0;
  return Math.floor((144000 * KBPS[br]) / RATES[sr]) + ((b[i + 2] >> 1) & 1);
}

/** Where in `b` the first whole frame starts: a header whose next frame's header follows it. */
function firstFrame(b) {
  for (let i = 0; i + 4 <= b.length; i++) {
    const n = frameAt(b, i);
    if (n && (i + n + 4 > b.length || frameAt(b, i + n))) return i;
  }
  return 0;
}

/** The file's head: its length (seconds), where its frames start (`at`) and how many bytes they take, where its audio starts and ends, its table of contents. */
async function readHead(url, signal) {
  const r = await fetch(url, { headers: { Range: 'bytes=0-8191' }, signal });
  if (r.status !== 206) throw new Error(`no byte ranges (${r.status})`);
  const b = new Uint8Array(await r.arrayBuffer());
  let at = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) at = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f)); // an ID3v2 tag
  const len = frameAt(b, at);
  if (!len) throw new Error('no MP3 frame at the head');
  const x = at + 4 + ((b[at + 3] >> 6) === 3 ? 17 : 32); // past the side information (mono, else stereo)
  const tag = String.fromCharCode(b[x], b[x + 1], b[x + 2], b[x + 3]);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const flags = tag === 'Xing' || tag === 'Info' ? dv.getUint32(x + 4) : 0;
  if ((flags & 7) !== 7) throw new Error('no table of contents');
  const frames = dv.getUint32(x + 8), bytes = dv.getUint32(x + 12);
  const toc = b.slice(x + 16, x + 116);
  return { duration: (frames * SAMPLES) / RATES[(b[at + 2] >> 2) & 3], at, bytes, first: at + len, end: at + bytes, toc };
}

/**
 * Feed `url` to `audio` through a MediaSource. `onFail` is called if it cannot start (no byte ranges, no
 * table of contents): the page then gives the element the plain file. Returns { dispose }.
 */
export function streamInto(audio, url, { onFail = () => {} } = {}) {
  const ms = new MediaSource();
  const src = URL.createObjectURL(ms);
  let sb = null, head = null, closed = false, failed = false;
  let next = 0; // the next byte to fetch
  let resync = false; // the next piece starts at a byte the table pointed to: from its first whole frame
  let reset = null; // a jump's place (seconds): the buffer is cleared and the clock set there with its first piece
  let gen = 0; // bumped at each jump: a piece fetched for an earlier place is dropped
  let busy = false, tries = 0, retry = 0;
  let abort = null;
  const quit = new AbortController();

  const idle = () => (sb.updating ? new Promise((r) => sb.addEventListener('updateend', r, { once: true })) : null);
  const append = (data) => new Promise((resolve, reject) => {
    const done = () => { sb.removeEventListener('error', bad); resolve(); };
    const bad = () => { sb.removeEventListener('updateend', done); reject(new Error('append failed')); };
    sb.addEventListener('updateend', done, { once: true });
    sb.addEventListener('error', bad, { once: true });
    sb.appendBuffer(data);
  });
  /** How much is buffered from `t` on (0 if `t` is not in what is buffered). */
  const aheadOf = (t) => {
    const r = sb.buffered;
    for (let i = 0; i < r.length; i++) if (t >= r.start(i) - 0.3 && t < r.end(i)) return r.end(i) - t;
    return 0;
  };
  /** The byte the table of contents puts at `t` seconds. */
  const byteAt = (t) => {
    const p = Math.min(99.999, Math.max(0, (t / head.duration) * 100));
    const i = Math.floor(p), a = head.toc[i], z = i < 99 ? head.toc[i + 1] : 256;
    return Math.max(head.first, head.at + Math.floor(((a + (z - a) * (p - i)) / 256) * head.bytes));
  };

  const pump = async () => {
    if (busy || closed || failed || !head) return;
    busy = true;
    const g = gen;
    try {
      while (!closed && g === gen && next < head.end && aheadOf(audio.currentTime) < (audio.paused ? PAUSED : AHEAD)) {
        abort = new AbortController();
        const end = Math.min(head.end, next + (next === head.first ? FIRST : PIECE)) - 1;
        const r = await fetch(url, { headers: { Range: `bytes=${next}-${end}` }, signal: AbortSignal.any([abort.signal, quit.signal]) });
        if (r.status !== 206) throw new Error(`no byte ranges (${r.status})`);
        let data = new Uint8Array(await r.arrayBuffer());
        if (closed || g !== gen) return;
        if (resync) { data = data.subarray(firstFrame(data)); resync = false; }
        await idle();
        if (closed || g !== gen) return;
        if (reset !== null) {
          // a jump's first piece: a new run of frames, not the last one's continuation, in a cleared buffer,
          // played from the jump's own time (in sequence mode the next frame plays at the offset)
          if (ms.readyState === 'open') sb.abort();
          const had = sb.buffered;
          if (had.length) { sb.remove(0, had.end(had.length - 1)); await idle(); }
          if (closed || g !== gen) return;
          sb.timestampOffset = reset;
          reset = null;
        } else {
          // what is well behind it goes (a minute of buffer, not the whole visit's)
          const t = audio.currentTime, r0 = sb.buffered;
          if (r0.length && t - r0.start(0) > BEHIND + 10) { sb.remove(0, t - BEHIND); await idle(); }
          if (closed || g !== gen) return;
        }
        await append(data);
        if (g !== gen) return; // a jump came meanwhile: its place stands
        next = end + 1;
        tries = 0;
      }
      // the whole file is in: its end is the playlist's end (the element's loop takes it back to the start)
      if (!closed && g === gen && next >= head.end && ms.readyState === 'open' && !sb.updating) ms.endOfStream();
    } catch (err) {
      if (closed || err?.name === 'AbortError') return;
      // a network that drops out: tried again, a little later each time, as a stream would (it waits meanwhile)
      tries++;
      clearTimeout(retry);
      retry = setTimeout(() => { if (!closed) pump(); }, Math.min(8000, 500 * 2 ** tries));
    } finally {
      busy = false;
      if (!closed && g !== gen) pump(); // a jump came while this piece was on its way: on from the new place
    }
  };

  /** Feed from `t` seconds on (the element is seeking somewhere not buffered): set at once, made with its first piece. */
  const jump = (t) => {
    gen++;
    abort?.abort();
    next = byteAt(t);
    resync = true;
    reset = t;
    pump();
  };

  const onSeeking = () => {
    if (!head || closed) return;
    const t = audio.currentTime;
    if (aheadOf(t) > 0.5) pump(); else jump(t);
  };
  const onMore = () => pump();

  ms.addEventListener('sourceopen', async () => {
    URL.revokeObjectURL(src);
    try {
      head = await readHead(url, quit.signal);
      if (closed) return;
      sb = ms.addSourceBuffer('audio/mpeg');
      sb.mode = 'sequence';
      ms.duration = head.duration;
      next = head.first;
      pump();
    } catch (err) {
      if (closed || err?.name === 'AbortError') return;
      failed = true;
      console.warn('Music stream unavailable; the plain file instead.', err);
      dispose();
      onFail(err);
    }
  }, { once: true });
  ms.addEventListener('sourceclose', () => dispose(), { once: true });
  audio.addEventListener('seeking', onSeeking);
  for (const type of ['timeupdate', 'play', 'waiting']) audio.addEventListener(type, onMore);
  audio.src = src;

  function dispose() {
    if (closed) return;
    closed = true;
    clearTimeout(retry);
    quit.abort();
    audio.removeEventListener('seeking', onSeeking);
    for (const type of ['timeupdate', 'play', 'waiting']) audio.removeEventListener(type, onMore);
  }
  return { dispose };
}
