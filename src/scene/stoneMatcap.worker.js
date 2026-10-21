// The home ring's two stone matcaps made off the page's thread (src/scene/stoneMatcap.js), handed back
// (transferred, not copied).
import { stoneMatcapPixels } from './stoneMatcap.js';

onmessage = ({ data }) => {
  const out = data.map(({ size, opts }) => stoneMatcapPixels(size, opts));
  postMessage(out, out.map((d) => d.buffer));
};
