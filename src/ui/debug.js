// ?debug: a slider that scrubs the statue's whole sequence without scrolling, with a readout of
// the phase, each track and how far the logo has grown. "Follow scroll" hands control back to the page.
import { PHASES, TURN } from '../scene/sequence.js';

export function setupDebug({ stage }) {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <label class="debug-panel__row"><span>Sequence</span>
      <input type="range" min="0" max="1" step="0.001" value="0" data-debug-seq>
      <output data-debug-value>0.000</output></label>
    <p class="debug-panel__read" data-debug-read></p>
    <div class="debug-panel__row">
      ${Object.entries(PHASES).map(([name, [a]]) => `<button type="button" data-debug-jump="${a}">${name}</button>`).join('')}
      <button type="button" data-debug-jump="1">end</button>
      <button type="button" data-debug-parts aria-pressed="false">Show parts</button>
      <button type="button" data-debug-release>Follow scroll</button>
    </div>`;
  document.body.append(panel);
  const input = panel.querySelector('[data-debug-seq]');
  const value = panel.querySelector('[data-debug-value]');
  const read = panel.querySelector('[data-debug-read]');
  const set = (p) => { input.value = p; stage.setSequenceOverride(p); };
  input.addEventListener('input', () => stage.setSequenceOverride(parseFloat(input.value)));
  panel.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-debug-jump]');
    if (jump) set(parseFloat(jump.dataset.debugJump));
    if (e.target.closest('[data-debug-release]')) stage.setSequenceOverride(null);
    const parts = e.target.closest('[data-debug-parts]');
    if (parts && stage.morph) {
      // tint each part of the morph (mask gold, hand green, face blue, body grey); from the start
      // of the morph, where the morph mesh is on stage, the statue shows its parts too
      const on = parts.getAttribute('aria-pressed') !== 'true';
      parts.setAttribute('aria-pressed', String(on));
      stage.morph.uniforms.uShowParts.value = on ? 1 : 0;
      stage.setSequenceOverride(stage.seqOverride ?? stage.state.seq);
    }
  });
  const show = () => {
    const p = stage.seqOverride ?? stage.state.seq;
    const t = stage.tracks;
    value.textContent = p.toFixed(3);
    if (stage.seqOverride === null) input.value = p;
    read.textContent = `${t.phase} · turn ${(t.turn * TURN.revolutions * 360).toFixed(0)}° · arm ${t.arm.toFixed(2)} · head ${t.head.toFixed(2)} · zoom ${t.zoom.toFixed(2)} · morph ${t.morph.toFixed(2)} · grow ${(t.grow ?? 0).toFixed(2)} · logo ${t.logo.toFixed(2)}${stage.morph ? '' : ' · morph mesh not built yet'}`;
  };
  const timer = setInterval(show, 120);
  show();
  window.dramaCollective.debug = { set, release: () => stage.setSequenceOverride(null) };
  return () => { clearInterval(timer); panel.remove(); };
}
