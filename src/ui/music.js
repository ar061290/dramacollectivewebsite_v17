// Music, off by default and only ever started by the visitor: "the smell of old books, reading,
// writing and studying (a dark academia playlist)" by Dark Enigmatic (credited in the footer).
// It plays from the site's own MP3 (public/music/the-smell-of-old-books.mp3) in a plain audio
// element. Until that file is in place, it plays from YouTube instead, through YouTube's own
// embedded player: YouTube's terms want its player in view (at least 200 x 200 px), so then a small
// "now playing" card shows the player in the corner while it plays; closing the card, or the music
// button, stops it.
//
// The music carries on from page to page: where it got to is remembered for this visit
// (sessionStorage) and the next page picks it up there, if the browser lets it play (a click on a
// link of the same site normally does). It fades in and out, and pauses while the tab is hidden.
import gsap from 'gsap';

export const TRACK = {
  id: 'HCV-2-IoIXs',
  title: 'the smell of old books, reading, writing and studying (a dark academia playlist)',
  by: 'Dark Enigmatic',
  url: 'https://www.youtube.com/watch?v=HCV-2-IoIXs',
};
const VOLUME = 60; // of YouTube's 100 (the MP3 plays at the same share of full volume)
// the site's own recording: under Vite, public/ is the site's root; run without a build, it is the folder
const FILE = import.meta.env
  ? new URL('music/the-smell-of-old-books.mp3', document.baseURI).href
  : new URL('../../public/music/the-smell-of-old-books.mp3', import.meta.url).href;
let fileOk = null;
/** Whether the MP3 is there (asked once per page). */
function hasFile() {
  fileOk ??= fetch(FILE, { method: 'HEAD' })
    .then((r) => r.ok && /audio|mpeg|octet/.test(r.headers.get('content-type') || 'audio/mpeg'))
    .catch(() => false);
  return fileOk;
}
const KEY = 'dc-music'; // { on, t }: whether the visitor wants it, and where it had got to (seconds)

let apiReady = null;
/** Load YouTube's IFrame Player API once. */
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiReady ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiReady = null; reject(new Error('YouTube player unavailable')); };
    document.head.append(s);
  });
  return apiReady;
}

const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const write = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: it starts over */ } };

export function setupMusic({ reduced }) {
  const button = document.querySelector('[data-music-toggle]');
  if (!button) return () => {};

  let wanted = false; // the visitor's choice; the player may be briefly paused while the tab is hidden
  let player = null; // YT.Player once built, or the audio element's adapter (same few methods)
  let audio = null;
  let card = null;
  let fade = null;
  const level = { v: 0 }; // the volume being faded (0..VOLUME)

  const setUi = (state) => {
    button.setAttribute('aria-pressed', String(wanted));
    button.classList.toggle('is-playing', wanted && state === 'playing');
    button.classList.toggle('is-loading', wanted && state === 'loading');
    button.title = wanted ? `Now playing: ${TRACK.title}, ${TRACK.by}` : 'Play music';
  };

  // the card: the player in view, the piece's name, and a way to stop it
  const buildCard = () => {
    card = document.createElement('section');
    card.className = 'now-playing';
    card.setAttribute('aria-label', 'Now playing');
    card.innerHTML = `
      <div class="now-playing__player"><div data-yt></div></div>
      <div class="now-playing__meta">
        <p class="eyebrow now-playing__label">Now playing</p>
        <p class="now-playing__title"></p>
        <a class="now-playing__by" href="${TRACK.url}" target="_blank" rel="noopener"></a>
      </div>
      <button class="icon-btn now-playing__close" type="button" aria-label="Stop the music" title="Stop the music">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>`;
    card.querySelector('.now-playing__title').textContent = TRACK.title;
    card.querySelector('.now-playing__by').textContent = `${TRACK.by} · YouTube`;
    card.querySelector('.now-playing__close').addEventListener('click', () => { if (wanted) toggle(); });
    document.body.append(card);
    if (!reduced) gsap.from(card, { autoAlpha: 0, y: 16, duration: 0.5, ease: 'curtain' });
  };

  const fadeTo = (to, duration, onComplete) => {
    fade?.kill();
    fade = gsap.to(level, {
      v: to,
      duration: reduced ? 0 : duration,
      ease: 'sine.inOut',
      onUpdate: () => player?.setVolume?.(Math.round(level.v)),
      onComplete,
    });
  };

  const onState = (e) => {
    const S = window.YT.PlayerState;
    if (e.data === S.PLAYING) { setUi('playing'); fadeTo(VOLUME, 1.6); }
    else if (e.data === S.BUFFERING) setUi('loading');
    else if (e.data === S.ENDED) { player.seekTo(0, true); player.playVideo(); }
    else setUi('paused');
  };

  // the MP3: an audio element behind the same few methods the YouTube player has
  const startFile = (at) => {
    audio = new Audio(FILE);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    audio.addEventListener('playing', () => { setUi('playing'); fadeTo(VOLUME, 1.6); });
    audio.addEventListener('waiting', () => setUi('loading'));
    audio.addEventListener('pause', () => setUi('paused'));
    audio.addEventListener('loadedmetadata', () => { if (at > 0 && at < audio.duration) audio.currentTime = at; }, { once: true });
    player = {
      setVolume: (v) => { audio.volume = Math.max(0, Math.min(1, v / 100)); },
      playVideo: () => audio.play().catch(() => setUi('paused')),
      pauseVideo: () => audio.pause(),
      getCurrentTime: () => audio.currentTime,
      destroy: () => { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; },
    };
    player.playVideo();
  };

  const start = async (at = 0) => {
    setUi('loading');
    if (await hasFile()) {
      if (!wanted) return;
      if (!player) startFile(at); else player.playVideo();
      return;
    }
    if (!wanted) return;
    if (!card) buildCard();
    try {
      const YT = await loadApi();
      if (!wanted) return;
      if (!player) {
        level.v = 0;
        await new Promise((resolve) => {
          player = new YT.Player(card.querySelector('[data-yt]'), {
            host: 'https://www.youtube-nocookie.com',
            videoId: TRACK.id,
            width: '100%',
            height: '100%',
            playerVars: { autoplay: 1, start: Math.floor(at), playsinline: 1, rel: 0, modestbranding: 1 },
            events: { onReady: () => { player.setVolume(0); player.playVideo(); resolve(); }, onStateChange: onState },
          });
        });
      } else {
        player.playVideo();
      }
    } catch (err) {
      console.warn('Music could not start.', err);
      wanted = false;
      stop(true);
    }
  };

  const stop = (now = false) => {
    const end = () => {
      player?.destroy?.();
      player = null;
      const c = card;
      card = null;
      if (c && !reduced && !now) gsap.to(c, { autoAlpha: 0, y: 16, duration: 0.35, ease: 'power1.in', onComplete: () => c.remove() });
      else c?.remove();
      setUi('paused');
    };
    if (now || !player) { fade?.kill(); end(); return; }
    fadeTo(0, 0.6, end);
  };

  const toggle = () => {
    wanted = !wanted;
    write({ on: wanted, t: wanted ? (read().t ?? 0) : 0 });
    if (wanted) start(read().t ?? 0); else stop();
    setUi(wanted ? 'loading' : 'paused');
  };

  // where it got to, for the next page (and the next visit to this one, within the visit)
  const remember = () => {
    if (!wanted) return;
    const t = player?.getCurrentTime?.();
    write({ on: true, t: typeof t === 'number' ? t : read().t ?? 0 });
  };
  const timer = setInterval(remember, 2000);
  const onHide = () => remember();

  const onVisibility = () => {
    if (!wanted || !player) return;
    if (document.hidden) { remember(); player.pauseVideo?.(); } else player.playVideo?.();
  };

  button.addEventListener('click', toggle);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onHide);
  setUi('paused');

  // carry on from the last page
  const saved = read();
  if (saved.on) { wanted = true; start(saved.t ?? 0); }

  return () => {
    clearInterval(timer);
    remember();
    fade?.kill();
    button.removeEventListener('click', toggle);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onHide);
    player?.destroy?.();
    card?.remove();
  };
}
