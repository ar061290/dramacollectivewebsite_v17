// Lite tier: the About lexicon's morph drawn off the page's thread. The page (src/sections/lexicon.js)
// asks for the shape between two words at each frame of the scroll and shows the answer when it comes;
// it is the very same path data the page would have made (src/sections/lexiconMorph.js). The words'
// fields are built and kept here, one a task, the first words first, so a question is never kept
// waiting long behind them (one asked before its fields are built builds them first).
import { WORDS, fields, buildField } from './lexiconFields.js';
import { between } from './lexiconMorph.js';

let next = 0;
const build = () => {
  while (next < WORDS.length && fields[next]) next++;
  if (next >= WORDS.length) return;
  buildField(next, Infinity);
  setTimeout(build, 0);
};
build();
onmessage = ({ data }) => postMessage({ gen: data.gen, d: between(data.k, data.s, data.cs) });
