// Remind Aadi's relay (ia.html, src/pages/ia.js): the page sends only a name and the tracker's count; this
// script, in the owner's own Google account, turns them into one push notification through ntfy.sh, to a
// topic only it knows, and one email to Aadi. The page then holds no key, so nobody who opens it can read
// the reminders or post their own to his phone. Free. Set-up: README.md beside this.
//
// Script properties (Project Settings -> Script properties):
//   NTFY_TOPIC   the ntfy topic Aadi subscribes to: a new random one, never written in the page
//   EMAIL        where the email copy goes (Aadi's address)
//   PAGE_URL     the tracker's address, opened by tapping the notification (optional)
//   DAILY_CAP    the most reminders a day from everyone together (optional, 30 if unset)

function doPost(e) {
  const body = (e && e.postData && e.postData.contents) || '';
  if (body.length > 2000) return reply(false, 'too long');
  let d;
  try { d = JSON.parse(body); } catch (err) { return reply(false, 'not json'); }
  if (!d || d.v !== 1) return reply(false, 'unknown');
  // the endpoint is public (it is in the page): the name is kept short and plain, and numbers only if numbers
  const name = String(d.name == null ? '' : d.name)
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return reply(false, 'no name');
  const count = (x) => (Number.isInteger(x) && x >= 0 && x <= 999 ? x : null);
  const done = count(d.done), total = count(d.total);

  const props = PropertiesService.getScriptProperties();
  const topic = props.getProperty('NTFY_TOPIC');
  const email = props.getProperty('EMAIL');
  const page = props.getProperty('PAGE_URL') || '';
  const cap = Number(props.getProperty('DAILY_CAP')) || 30;
  if (!topic && !email) return reply(false, 'not set up');

  // the day's count, for everyone together (whoever sends them); yesterday's are cleared as today's begins
  const day = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  const key = 'sent-' + day;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const n = Number(props.getProperty(key)) || 0;
    if (n >= cap) return reply(false, 'enough for today');
    props.getKeys().filter((k) => k.indexOf('sent-') === 0 && k !== key).forEach((k) => props.deleteProperty(k));
    props.setProperty(key, String(n + 1));
  } finally {
    lock.releaseLock();
  }

  const title = 'IA reminder from ' + name;
  const steps = done !== null && total ? ' ' + done + ' of ' + total + (total === 1 ? ' step' : ' steps') + ' done so far.' : '';
  const message = name + ' is reminding you to work on your IAs.' + steps;
  const sent = { push: false, email: false };
  if (topic) {
    try {
      const res = UrlFetchApp.fetch('https://ntfy.sh/', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ topic: topic, title: title, message: message + (page ? ' Tap to open the tracker.' : ''), tags: ['books'], priority: 4, click: page || undefined }),
        muteHttpExceptions: true,
      });
      sent.push = res.getResponseCode() === 200;
    } catch (err) { /* ntfy unreachable: the email may still go */ }
  }
  if (email) {
    try {
      MailApp.sendEmail({ to: email, subject: title, body: message + (page ? '\n\nThe tracker: ' + page : ''), name: 'The Drama Collective' });
      sent.email = true;
    } catch (err) { /* the day's Gmail quota, most likely */ }
  }
  const ok = sent.push || sent.email;
  return reply(ok, ok ? 'sent' : 'failed', sent);
}

function reply(ok, status, extra) {
  const out = { ok: ok, status: status };
  if (extra) { out.push = extra.push; out.email = extra.email; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
