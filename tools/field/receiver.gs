// The receiver for the site's field measurements (src/util/field.js): each reporting visit's few hundred
// bytes become one row of the spreadsheet this script belongs to. Free, in the owner's own Google account;
// no names, no addresses, no page content arrive (the beacon carries none). Set-up: README.md beside this.

const SHEET = 'visits';
const COLUMNS = [
  'received', 'page', 'navigation', 'ttfb ms', 'first paint ms', 'curtain up ms', 'curtain parted ms', 'intro done ms',
  'morph ready ms', 'long tasks', 'long task ms', 'longest task ms', 'layout shift', 'webgl lost', 'tab discarded',
  'width', 'height', 'pixel ratio', 'cores', 'memory GB', 'touch', 'reduced motion', 'network', 'save data', 'webgl2',
  'theme', 'all marks',
];

function doPost(e) {
  const body = (e && e.postData && e.postData.contents) || '';
  if (body.length > 8000) return ContentService.createTextOutput('too long');
  let d;
  try { d = JSON.parse(body); } catch (err) { return ContentService.createTextOutput('not json'); }
  if (!d || d.v !== 1) return ContentService.createTextOutput('unknown');
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName(SHEET) || book.insertSheet(SHEET);
    if (sheet.getLastRow() === 0) sheet.appendRow(COLUMNS);
    // the endpoint is public (it is in every page): numbers are kept only if they are numbers, and text is
    // kept short and never read as a formula
    const num = (x) => (typeof x === 'number' && isFinite(x) ? x : '');
    const text = (x, n) => { const s = String(x == null ? '' : x).slice(0, n || 40); return /^[=+\-@]/.test(s) ? "'" + s : s; };
    const yes = (x) => x === true;
    const m = d.marks || {}, dev = d.device || {}, lt = d.longTasks || {};
    sheet.appendRow([
      new Date(), text(d.page, 80), text(d.type), num(d.ttfb), num(d.fcp), num(m['curtain-up']), num(m.parted), num(m['intro-done']),
      num(m['morph-ready']), num(lt.count), num(lt.ms), num(lt.longest), num(d.cls), Array.isArray(d.lost) ? d.lost.length : '', yes(d.discarded),
      num(dev.w), num(dev.h), num(dev.dpr), num(dev.cores), num(dev.mem), yes(dev.touch), yes(dev.reduced), text(dev.net), yes(dev.save), yes(dev.webgl2),
      text(d.theme), text(JSON.stringify(m), 2000),
    ]);
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}
