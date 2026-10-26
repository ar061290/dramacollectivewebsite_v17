// Aadi's IA tracker (ia.html): the ticks are written into the page from content/ia.json by
// tools/pages/build.mjs, so this page only has one thing to do: Remind him.
// Each unfinished subject has the button. The first time, a popup asks the visitor's name, and the
// browser remembers it (localStorage), so every later press sends straight away; the note that says
// where it went offers to change the name. A reminder goes three ways at once (tools/ia/README.md):
// - a push to Aadi's phone through ntfy.sh, a free open-source push service: one JSON message posted
//   to its root, as text/plain so the browser makes a simple request (no preflight);
// - an email through FormSubmit (formsubmit.co), which forwards it to his inbox;
// - WhatsApp, sent automatically once content/ia.json has the key of one of three services: GREEN-API
//   (a second WhatsApp number of the owner's, linked to it, writes to Aadi's), InOut.bot or CallMeBot
//   (their bot writes to the number that asked for the key). Until then, or if it fails, a link in the
//   note opens WhatsApp with the reminder written out, for the visitor to send.
// No limits of the site's own: a press while one is still going is ignored, nothing more.
// The top bar is the bare pages' (bare.css): the logo and the light/dark switch, music by K.
import { bootPage } from '../site/boot.js';

const NTFY = 'https://ntfy.sh/';
const FORMSUBMIT = 'https://formsubmit.co/ajax/';
const INOUT = 'https://api.inout.bot/send';
const CALLMEBOT = 'https://api.callmebot.com/whatsapp.php';
const KEY_NAME = 'dc-ia-name';
const TOAST_MS = 9000;

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window: asked again next time */ } };
/** A name as typed, made safe to send: no control or direction characters, single spaces, at most 40 characters. */
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

bootPage(() => setupRemind());

function setupRemind() {
  const dialog = document.querySelector('[data-ia-ask]');
  const buttons = [...document.querySelectorAll('[data-ia-remind]')];
  if (!dialog || !buttons.length) return undefined;
  const form = dialog.querySelector('[data-ia-ask-form]');
  const title = dialog.querySelector('[data-ia-ask-title]');
  const input = form.querySelector('input[name="name"]');
  const sendBtn = dialog.querySelector('[data-ia-ask-send]');
  const cancelBtn = dialog.querySelector('[data-ia-ask-cancel]');
  const toast = document.querySelector('[data-ia-toast]');
  const { person, ntfyTopic: topic, email, whatsapp, waService, waUrl, waId, waKey } = dialog.dataset;
  const pageUrl = `${location.origin}${location.pathname}`;
  const sending = new Set();
  let pending = null; // the subject's button the popup is asking for (null: only changing the name)
  let toastTimer = 0;
  buttons.forEach((b) => { b.hidden = false; }); // scripts are on

  // ---- the note at the foot of the screen
  const hideToast = () => { toast.classList.remove('is-shown'); toastTimer = setTimeout(() => toast.replaceChildren(), 300); };
  const holdToast = () => clearTimeout(toastTimer);
  const restToast = () => { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, TOAST_MS); };
  const showToast = (text, actions = [], stay = false) => {
    clearTimeout(toastTimer);
    const p = document.createElement('p');
    p.className = 'ia-toast__text';
    p.textContent = text;
    const row = document.createElement('p');
    row.className = 'ia-toast__actions';
    for (const a of actions) {
      const el = document.createElement(a.href ? 'a' : 'button');
      el.className = 'ia-toast__action';
      el.textContent = a.text;
      if (a.href) Object.assign(el, { href: a.href, target: '_blank', rel: 'noopener' });
      else { el.type = 'button'; el.addEventListener('click', a.onClick); }
      row.append(el);
    }
    toast.replaceChildren(p, ...(actions.length ? [row] : []));
    toast.classList.add('is-shown');
    if (!stay) restToast();
  };

  // ---- the words, the same for every way
  const about = (btn) => {
    const what = btn.dataset.what;
    const n = Number(btn.dataset.done), of = Number(btn.dataset.total);
    return { what, steps: `${n} of ${of} ${of === 1 ? 'step' : 'steps'} done` };
  };
  const waText = (name, { what, steps }) => `Hi ${person}, ${name} here: a reminder to work on your ${what} (${steps}). ${pageUrl}`;
  const waLink = (name, a) => (whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(waText(name, a))}` : '');

  // ---- the three ways; each answers true once it has the reminder
  const push = async (name, { what, steps }, signal) => {
    const res = await fetch(NTFY, {
      method: 'POST',
      // JSON to the root, as text/plain: a simple request, no preflight; ntfy reads the topic from the body
      body: JSON.stringify({
        topic,
        title: `${what}: a reminder from ${name}`,
        message: `${name} is reminding you to work on your ${what} (${steps}). Tap to open the tracker.`,
        tags: ['books'],
        priority: 4,
        click: pageUrl,
      }),
      mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
    });
    if (!res.ok) throw new Error(`ntfy answered ${res.status}`);
    return true;
  };
  const mail = async (name, { what, steps }, signal) => {
    // FormSubmit knows the form by the page's address (it is sent as the referrer, the origin only);
    // the address goes into the path as it is (the builder lets through only letters, digits and . + - _)
    const res = await fetch(FORMSUBMIT + email, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: `IA reminder from ${name}: your ${what}`,
        _template: 'box',
        _captcha: 'false',
        name,
        message: `${name} is reminding you to work on your ${what} (${steps}).\n\nThe tracker: ${pageUrl}`,
      }),
      mode: 'cors', credentials: 'omit', cache: 'no-store', signal,
    });
    const out = await res.json().catch(() => null);
    // the very first one comes back unsent: FormSubmit has emailed Aadi a link to activate the form
    if (!res.ok || String(out?.success) !== 'true') throw new Error(`FormSubmit said ${out?.message ?? res.status}`);
    return true;
  };
  // WhatsApp, by whichever service has a key (the builder picks one: data-wa-service)
  const wa = async (name, { what, steps }, signal) => {
    const text = `*IA reminder from ${name}*\n${name} is reminding you to work on your ${what} (${steps}).\n${pageUrl}`;
    const quiet = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal };
    if (waService === 'green-api') {
      // from the second number linked to the instance, to Aadi's; it answers with the message's id
      const res = await fetch(`${waUrl}/waInstance${waId}/sendMessage/${waKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: `${whatsapp}@c.us`, message: text }),
        mode: 'cors', ...quiet,
      });
      const out = await res.json().catch(() => null);
      if (!res.ok || !out?.idMessage) throw new Error(`GREEN-API answered ${res.status}`);
      return true;
    }
    // InOut.bot and CallMeBot: a GET their bot acts on, to the number that asked for the key; neither
    // is known to answer with CORS headers, so the request goes and its answer cannot be read
    const url = waService === 'inout'
      ? `${INOUT}?apikey=${encodeURIComponent(waKey)}&message=${encodeURIComponent(text)}`
      : `${CALLMEBOT}?phone=%2B${whatsapp}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(waKey)}`;
    await fetch(url, { mode: 'no-cors', ...quiet });
    return true;
  };

  const send = async (btn, name) => {
    if (sending.has(btn)) return; // a press while this one is still going
    sending.add(btn);
    btn.setAttribute('aria-busy', 'true');
    const a = about(btn);
    showToast(`Sending your reminder about his ${a.what}…`, [], true);
    const abort = new AbortController();
    const giveUp = setTimeout(() => abort.abort(), 12_000);
    const autoWa = Boolean(whatsapp && waService);
    const ways = [push(name, a, abort.signal), mail(name, a, abort.signal), autoWa ? wa(name, a, abort.signal) : Promise.resolve(false)];
    const [p, m, w] = (await Promise.allSettled(ways)).map((r) => {
      if (r.status === 'rejected') console.warn('Remind him: one way did not go through', r.reason);
      return r.status === 'fulfilled' && r.value === true;
    });
    clearTimeout(giveUp);
    sending.delete(btn);
    btn.removeAttribute('aria-busy');
    const link = waLink(name, a);
    const rename = { text: `Not ${name}?`, onClick: () => ask(null) };
    if (p || m || w) {
      const where = [p && 'phone', m && 'email', w && 'WhatsApp'].filter(Boolean);
      const list = where.length > 1 ? `${where.slice(0, -1).join(', ')} and ${where.at(-1)}` : where[0];
      showToast(`Sent to ${person}’s ${list}: your reminder about his ${a.what}.`, [
        ...(link && !w ? [{ text: 'Also send on WhatsApp', href: link }] : []),
        rename,
      ]);
    } else {
      showToast('That didn’t go through just now.', [
        ...(link ? [{ text: 'Send it on WhatsApp', href: link }] : []),
        { text: 'Email him', href: `mailto:${email}?subject=${encodeURIComponent(`IA reminder from ${name}`)}&body=${encodeURIComponent(waText(name, a))}` },
      ]);
    }
  };

  // ---- the popup: asks the name the first time (or when the visitor changes it)
  const ask = (btn) => {
    pending = btn;
    title.textContent = btn ? `Remind ${person} about his ${btn.dataset.what}` : 'Who’s sending the reminders?';
    sendBtn.textContent = btn ? 'Send the reminder' : 'Save';
    input.value = btn ? '' : cleanName(read(KEY_NAME));
    holdToast();
    dialog.showModal();
    input.focus();
  };
  const onSubmit = (e) => {
    e.preventDefault();
    const name = cleanName(input.value);
    if (!name) { input.value = ''; input.reportValidity(); input.focus(); return; }
    write(KEY_NAME, name);
    dialog.close();
    const btn = pending;
    pending = null;
    if (btn) send(btn, name);
    else showToast(`Your reminders now say they’re from ${name}.`);
  };
  // (the browser gives the focus back to whatever opened the popup)
  const onClose = () => {
    if (toast.classList.contains('is-shown')) restToast();
    pending = null;
  };
  const onCancel = () => dialog.close();
  // a press on the dim backdrop around the popup closes it, as Escape does
  const onBackdrop = (e) => { if (e.target === dialog) dialog.close(); };
  const onRemind = (e) => {
    const btn = e.currentTarget;
    const name = cleanName(read(KEY_NAME));
    if (name) send(btn, name);
    else ask(btn);
  };

  buttons.forEach((b) => b.addEventListener('click', onRemind));
  form.addEventListener('submit', onSubmit);
  cancelBtn.addEventListener('click', onCancel);
  dialog.addEventListener('close', onClose);
  dialog.addEventListener('click', onBackdrop);
  toast.addEventListener('pointerenter', holdToast);
  toast.addEventListener('pointerleave', restToast);
  toast.addEventListener('focusin', holdToast);
  toast.addEventListener('focusout', restToast);
  return () => {
    clearTimeout(toastTimer);
    buttons.forEach((b) => b.removeEventListener('click', onRemind));
    form.removeEventListener('submit', onSubmit);
    cancelBtn.removeEventListener('click', onCancel);
    dialog.removeEventListener('close', onClose);
    dialog.removeEventListener('click', onBackdrop);
    toast.removeEventListener('pointerenter', holdToast);
    toast.removeEventListener('pointerleave', restToast);
    toast.removeEventListener('focusin', holdToast);
    toast.removeEventListener('focusout', restToast);
  };
}
