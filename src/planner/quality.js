// Render quality: which level the planner opens in, and keeping the visitor's choice.
// It always opens in 'low' ("Quality: fast" in the top bar), so it starts on modest graphics, unless
// the address asks for another (?quality=low|medium|high) or the visitor picked one from the top
// bar (or its File menu, on a narrower window: ui.js) earlier in this visit. The pick lasts the visit (sessionStorage), not for good: the next visit
// opens fast again. Kept apart from app.js so the conditions page can read it without three.js.

export const LEVELS = ['low', 'medium', 'high'];
const KEY = 'dc-stage-quality';

export function startQuality() {
  const asked = new URLSearchParams(location.search).get('quality');
  if (LEVELS.includes(asked)) return asked;
  try {
    const kept = sessionStorage.getItem(KEY);
    if (LEVELS.includes(kept)) return kept;
  } catch { /* storage unavailable: open fast */ }
  return 'low';
}

export function keepQuality(level) {
  try { sessionStorage.setItem(KEY, level); } catch { /* storage unavailable: it lasts this page */ }
}

// Earlier versions kept the choice in localStorage for good (and opened in 'medium' by default);
// clear it so an old choice never overrides the fast start.
try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
