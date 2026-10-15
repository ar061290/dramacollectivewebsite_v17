// Music, off by default and only ever started by the visitor: "the smell of old books, reading,
// writing and studying (a dark academia playlist)" by Dark Enigmatic (credited in the footer).
// It plays from the site's own MP3 (public/music/the-smell-of-old-books.mp3) in a plain audio
// element. The file is the whole playlist (some 47 MB), so it is streamed: nothing of it is asked for
// until the music is wanted, and then only its first few bytes (the length) before playing from the
// chosen point, which the browser fetches from there on as it goes.
//
// Each page starts the music somewhere new: a random point in the playlist, never its very start and
// never where the last page had got to, so every visit (and every page of it) opens on a different
// piece. Whether the visitor wants it on is remembered for this visit (sessionStorage), so the next
// page carries on playing if the browser lets it (a click on a link of the same site normally does;
// otherwise the button shows that it is waiting, and it starts with the visitor's next tap, click or
// key, on the button or anywhere else). It fades in and out, and pauses while the tab is hidden.
import gsap from 'gsap';

export const TRACK = {
  title: 'the smell of old books, reading, writing and studying (a dark academia playlist)',
  by: 'Dark Enigmatic',
};
const VOLUME = 0.6; // of full volume: background music, under the page
// the site's own recording: under Vite, public/ is the site's root; run without a build, it is the folder
const FILE = import.meta.env
  ? new URL('music/the-smell-of-old-books.mp3', document.baseURI).href
  : new URL('../../public/music/the-smell-of-old-books.mp3', import.meta.url).href;
const KEY = 'dc-music'; // { on, t }: whether the visitor wants it, and where it had got to (seconds)
// the events that count as the visitor's own doing, inside which a browser lets music start. A touch's
// pointerdown is not one (its pointerup and touchend are), and Safari, like every browser on iOS, lets
// it start only inside a touchend or a click, so all of these are listened for.
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'];

const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const write = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: it starts over */ } };

/**
 * A point to start from in a playlist `duration` seconds long: well clear of the start and the very
 * end, and at least a tenth of the playlist away from `last` (where the previous page had got to).
 */
function pickStart(duration, last) {
  const from = Math.min(30, duration * 0.03);
  const to = duration - Math.min(90, duration * 0.08);
  if (!(to > from)) return 0; // too short to choose from (it is never this short, but never throw)
  let t = from;
  for (let i = 0; i < 8; i++) {
    t = from + Math.random() * (to - from);
    if (typeof last !== 'number' || Math.abs(t - last) > duration * 0.1) break;
  }
  return t;
}

export function setupMusic({ reduced }) {
  const button = document.querySelector('[data-music-toggle]');
  if (!button) return () => {};

  let wanted = false; // the visitor's choice; the audio may be briefly paused while the tab is hidden
  let blocked = false; // wanted, but the browser would not let it start on its own: it waits for the visitor
  let audio = null;
  let placed = false; // whether this page's random starting point has been set
  let fade = null;
  let waitGesture = null; // while it is blocked: the next tap, click or key starts it
  const level = { v: 0 }; // the volume being faded (0..VOLUME)
  const last = read().t; // where the previous page had got to, to start well away from it

  const setUi = (state) => {
    // held back by the browser it is not playing, so it is not shown as on (nor as 'Now playing'):
    // it is marked out instead as waiting for the visitor, whose click on it then starts it
    const on = wanted && !blocked;
    button.setAttribute('aria-pressed', String(on));
    button.classList.toggle('is-playing', on && state === 'playing');
    button.classList.toggle('is-loading', on && state === 'loading');
    button.classList.toggle('is-blocked', wanted && blocked);
    button.title = !wanted ? 'Play music'
      : blocked ? 'Play music (your browser waits for a tap, click or key to start it)'
        : `Now playing: ${TRACK.title}, ${TRACK.by}`;
  };

  const fadeTo = (to, duration, onComplete) => {
    fade?.kill();
    fade = gsap.to(level, {
      v: to,
      duration: reduced ? 0 : duration,
      ease: 'sine.inOut',
      onUpdate: () => { if (audio) audio.volume = Math.max(0, Math.min(1, level.v)); },
      onComplete,
    });
  };

  // heard: unmuted (it is muted until it first really plays, see start) and faded up
  const rise = () => {
    if (!audio) return;
    audio.muted = false;
    fadeTo(VOLUME, 1.6);
  };

  const forgetGesture = () => {
    if (!waitGesture) return;
    for (const type of GESTURES) document.removeEventListener(type, waitGesture, true);
    waitGesture = null;
  };
  // autoplay was refused: start on the visitor's next tap, click or key anywhere but the music button
  // (whose click, in this state, starts it too: see toggle). The listener stays until the music is
  // really playing, as one tap brings several of these events and a browser may let only the last of
  // them start it.
  const awaitGesture = () => {
    if (waitGesture) return;
    waitGesture = (e) => {
      if (button.contains(e.target)) return;
      if (wanted && audio?.paused && !document.hidden) play();
    };
    for (const type of GESTURES) document.addEventListener(type, waitGesture, true);
  };

  const play = () => {
    if (!audio) return;
    if (!audio.paused) {
      // turned back on while still fading out: fade back in rather than pause at the end of it (or,
      // if it is still finding its place, leave that to 'playing')
      fade?.kill();
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !audio.seeking) { setUi('playing'); rise(); }
      else setUi('loading');
      return;
    }
    blocked = false;
    setUi('loading');
    audio.play().catch((err) => {
      // turned off or paused for a hidden tab meanwhile, or another try (the same tap's next event) took
      if (!wanted || !audio?.paused || err?.name === 'AbortError') return;
      if (err?.name === 'NotAllowedError') { blocked = true; setUi('paused'); awaitGesture(); }
      else console.warn('Music could not start.', err);
    });
  };

  const build = () => {
    audio = new Audio();
    // only the length is asked for until it plays; then it streams from the chosen point
    audio.preload = 'metadata';
    audio.loop = true;
    audio.volume = 0;
    level.v = 0;
    audio.addEventListener('playing', () => {
      blocked = false;
      forgetGesture();
      setUi('playing');
      // only if it is still wanted: turned off while it was finding its place, it is stop()'s fade-out
      // that pauses it, and a fade up here would cut that short and leave it playing, the button off
      if (wanted && !document.hidden) rise();
    });
    audio.addEventListener('waiting', () => setUi('loading'));
    audio.addEventListener('pause', () => setUi('paused'));
    audio.addEventListener('error', () => {
      if (!audio?.error) return;
      console.warn('Music could not load.', audio.error);
      wanted = false;
      write({ on: false });
      teardown();
      setUi('paused');
    });
    // a new point in the playlist for this page, as soon as its length is known (it has been asked to
    // play already, and is muted or silent until it really does)
    audio.addEventListener('loadedmetadata', () => {
      if (!placed && Number.isFinite(audio.duration)) {
        placed = true;
        try { audio.currentTime = pickStart(audio.duration, last); } catch { /* not seekable here: it plays from the top */ }
      }
    }, { once: true });
    audio.src = FILE;
  };

  // Inside the visitor's click: the element is made and set playing there and then, not once its
  // length is in, since Safari (and every browser on iOS) lets audio start only inside the visitor's
  // own tap or click, and from then on lets that element play. Until it really plays, from its new
  // place, it is muted rather than only silent: iOS ignores volume, so the fade cannot hush it there.
  const start = () => {
    if (!audio) build();
    if (!placed) audio.muted = true;
    play();
  };

  const teardown = () => {
    fade?.kill();
    forgetGesture();
    blocked = false;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load(); // drop the stream
    audio = null;
  };

  const stop = () => {
    forgetGesture();
    blocked = false;
    // not heard yet (still finding its place, or held back by the browser): nothing to fade, so it
    // stops at once
    if (!audio || audio.paused || level.v <= 0) { fade?.kill(); audio?.pause(); setUi('paused'); return; }
    // the element is kept, paused where it is: turned on again on this page, it carries on from there
    fadeTo(0, 0.6, () => { audio?.pause(); setUi('paused'); });
  };

  const remember = () => {
    const t = audio && placed ? audio.currentTime : undefined;
    write({ on: wanted, t: typeof t === 'number' ? t : last });
  };

  const toggle = () => {
    // held back by the browser, it is not on in the visitor's eyes: this click starts it (and, being
    // their own, is let through) rather than turning it off
    if (wanted && blocked) { play(); return; }
    wanted = !wanted;
    remember();
    // the button answers at once; the audio's own events then say when it is really playing
    setUi(wanted ? 'loading' : 'paused');
    if (wanted) start(); else stop();
  };

  const timer = setInterval(() => { if (wanted) remember(); }, 2000);

  const onVisibility = () => {
    if (!wanted || !audio) return;
    if (document.hidden) {
      remember();
      // paused at once, not faded: a fade is drawn frame by frame, and a hidden tab is given no frames,
      // so it would never reach its end (nor the pause there). The level goes back to nothing, so the
      // music fades in again when the tab is back.
      fade?.kill();
      level.v = 0;
      audio.volume = 0;
      audio.pause();
    } else play();
  };

  button.addEventListener('click', toggle);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', remember);
  setUi('paused');

  // the visitor turned it on on an earlier page: carry on, from a new point. It is asked to play at
  // once, silent (volume 0, but not muted: a browser may let a muted start through, then stop it when
  // it is unmuted), so that a refusal shows on the button straight away.
  if (read().on) {
    wanted = true;
    build();
    if (document.hidden) setUi('paused'); else play();
  }

  return () => {
    clearInterval(timer);
    if (wanted) remember();
    button.removeEventListener('click', toggle);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', remember);
    teardown();
  };
}
