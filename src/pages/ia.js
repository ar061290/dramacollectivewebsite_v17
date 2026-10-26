// Aadi's IA tracker (ia.html): the ticks are written into the page from content/ia.json by
// tools/pages/build.mjs, so this page only has one thing to do: Remind Aadi.
// The button asks for the visitor's name, then sends one reminder, one of two ways (content/ia.json,
// remind; tools/ia/README.md):
// - straight to ntfy.sh, a free open-source push service: one JSON message posted to its root for the
//   topic Aadi's phone subscribes to in the ntfy app, sent as text/plain so the browser makes a simple
//   request (no preflight) and the name travels in the body, not the address. A push only: ntfy.sh no
//   longer forwards email for anonymous senders, and asking it to makes it refuse the whole message.
// - or, once the owner has set one up, to the relay (tools/ia/remind-relay.gs, a Google Apps Script),
//   which holds the topic out of sight and sends the push and an email itself.
// One reminder a minute from a browser; the name is remembered for next time. If the reminder cannot
// be sent, the visitor gets an email link instead. Without scripts the section is an email link (the
// builder writes it).
// The top bar is the bare pages' (bare.css): the logo and the light/dark switch, music by K.
import { bootPage } from '../site/boot.js';

const NTFY = 'https://ntfy.sh/';
const WAIT_MS = 60_000; // one reminder a minute from one browser
const KEY_AT = 'dc-ia-reminded-at';
const KEY_NAME = 'dc-ia-name';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window: no memory, still works */ } };
/** A name as typed, made safe to send: no control or direction characters, single spaces, at most 40 characters. */
const cleanName = (s) => String(s).replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

bootPage(() => setupRemind());

function setupRemind() {
  const box = document.querySelector('[data-ia-remind]');
  if (!box) return undefined;
  const openBtn = box.querySelector('[data-ia-remind-open]');
  const form = box.querySelector('[data-ia-remind-form]');
  const input = form.querySelector('input[name="name"]');
  const send = box.querySelector('[data-ia-remind-send]');
  const status = box.querySelector('[data-ia-remind-status]');
  const { ntfyTopic: topic, relay, email, person } = box.dataset;
  const overall = document.querySelector('.ia-overall');
  const done = Number(overall?.dataset.iaDone);
  const total = Number(overall?.dataset.iaTotal);
  const pageUrl = `${location.origin}${location.pathname}`;
  let timer = 0;
  let holding = false; // the status line is saying "wait a minute"
  box.hidden = false; // scripts are on: the button replaces the email link

  const say = (text, link) => {
    holding = false;
    status.replaceChildren(text);
    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.text;
      status.append(' ', a);
    }
  };
  const mailto = (name) => `mailto:${email}?subject=${encodeURIComponent(`IA reminder from ${name}`)}&body=${encodeURIComponent(`Hi ${person}, ${name} here: this is a reminder to work on your IAs.\n\n${pageUrl}`)}`;

  // a reminder sent less than a minute ago from this browser holds the button until the minute is up
  const hold = () => {
    const at = Number(read(KEY_AT)) || 0;
    const left = at + WAIT_MS - Date.now();
    clearTimeout(timer);
    send.disabled = left > 0;
    if (left > 0) timer = setTimeout(hold, left + 50);
    else if (holding) say('');
    return left;
  };
  const sayHold = () => { say('You sent one a moment ago. You can send another in a minute.'); holding = true; };

  const onOpen = () => {
    openBtn.hidden = true;
    form.hidden = false;
    input.value = read(KEY_NAME) || '';
    input.focus();
    if (hold() > 0) sayHold();
  };

  // straight to ntfy.sh: true once it has the message
  const toNtfy = async (name, signal) => {
    const steps = Number.isFinite(done) && total ? ` ${done} of ${total} ${total === 1 ? 'step' : 'steps'} done so far.` : '';
    const res = await fetch(NTFY, {
      method: 'POST',
      // JSON to the root, as text/plain: a simple request, no preflight; ntfy reads the topic from the body
      body: JSON.stringify({
        topic,
        title: `IA reminder from ${name}`,
        message: `${name} is reminding you to work on your IAs.${steps} Tap to open the tracker.`,
        tags: ['books'],
        priority: 4,
        click: pageUrl,
      }),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (!res.ok) throw new Error(`ntfy answered ${res.status}`);
    return `Sent to ${person}’s phone. Thank you!`;
  };

  // through the relay: it answers with what it managed (the push, the email, or neither)
  const toRelay = async (name, signal) => {
    const res = await fetch(relay, {
      method: 'POST',
      body: JSON.stringify({ v: 1, name, done, total }),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (!res.ok) throw new Error(`the relay answered ${res.status}`);
    const out = await res.json();
    if (out?.status === 'enough for today') return null;
    if (!out?.ok) throw new Error(`the relay said ${out?.status}`);
    const where = [out.push && 'phone', out.email && 'email'].filter(Boolean).join(' and his ');
    return `Sent to ${person}’s ${where || 'phone'}. Thank you!`;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const name = cleanName(input.value);
    if (!name) { say('Add your name first, so he knows who it’s from.'); input.focus(); return; }
    if (hold() > 0) { sayHold(); return; }
    send.disabled = true;
    say('Sending…');
    const abort = new AbortController();
    const giveUp = setTimeout(() => abort.abort(), 10_000);
    try {
      const sent = await (relay ? toRelay : toNtfy)(name, abort.signal);
      write(KEY_AT, String(Date.now()));
      write(KEY_NAME, name);
      say(sent ?? `${person} has had plenty of reminders today. Try again tomorrow.`);
      hold();
    } catch (err) {
      console.warn('Remind Aadi: the reminder could not be sent', err);
      send.disabled = false;
      say('That didn’t go through just now.', { href: mailto(name), text: `Email ${person} instead` });
    } finally {
      clearTimeout(giveUp);
    }
  };

  openBtn.addEventListener('click', onOpen);
  form.addEventListener('submit', onSubmit);
  return () => {
    clearTimeout(timer);
    openBtn.removeEventListener('click', onOpen);
    form.removeEventListener('submit', onSubmit);
  };
}
