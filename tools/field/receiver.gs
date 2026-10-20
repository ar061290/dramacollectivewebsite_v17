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
    const m = d.marks || {}, dev = d.device || {}, lt = d.longTasks || {};
    sheet.appendRow([
      new Date(), String(d.page || '').slice(0, 80), d.type, d.ttfb, d.fcp, m['curtain-up'], m.parted, m['intro-done'],
      m['morph-ready'], lt.count, lt.ms, lt.longest, d.cls, (d.lost || []).length, d.discarded === true,
      dev.w, dev.h, dev.dpr, dev.cores, dev.mem, dev.touch, dev.reduced, dev.net, dev.save, dev.webgl2,
      d.theme, JSON.stringify(m).slice(0, 2000),
    ]);
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}
