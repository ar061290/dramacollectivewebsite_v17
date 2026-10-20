// Performance marks for the lab (tools/perf) and the field. `performance.mark('dc:<name>')` costs
// nothing the visitor can feel, stays in the Performance API for any reader, and shows up in the
// browser's own Performance panel. The names are the site's steps, not the browser's.
export const mark = (name) => {
  try { performance.mark(`dc:${String(name).trim().replace(/\s+/g, '-')}`); } catch { /* an old browser */ }
};
