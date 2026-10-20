// Builds the About lexicon's distance fields off the page's thread (src/sections/lexiconFields.js) and
// hands each to the page as it is done (its arrays transferred, not copied), the first words first.
import { WORDS, fields, buildField } from './lexiconFields.js';

for (let i = 0; i < WORDS.length; i++) {
  buildField(i, Infinity);
  const f = fields[i];
  postMessage({ i, x0: f.x0, nx: f.nx, d: f.d, b: f.b }, [f.d.buffer, f.b.buffer]);
}
postMessage({ done: true });
