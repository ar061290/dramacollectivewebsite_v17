// The flat, vector stand-in for the 3D logo. As the last act settles, the stone logo hands over to
// the traced mark itself (assets/brand/mark.svg) as an inline SVG, laid exactly over it: the stage
// projects the SVG's corners through its camera each frame and sets them as a CSS transform. So
// what slides over the footer is a crisp vector at any size, not a rendered 3D surface.
//
// Its colour is the stone's as the stage lights it (sampled from the 3D logo by the stage): a
// gradient from the lit top to the darker foot. The 3D logo goes flat into exactly this look before
// the vector appears (src/scene/flat.js); on its way into the footer the vector then takes on the
// footer mark's colours and sheds the bevel's flare (setColors, setOutline), so it hands over to it
// unseen.

const NS = 'http://www.w3.org/2000/svg';

export class VectorLogo {
  /**
   * @param {string} svgText   the traced mark (potrace output: one <g> of paths in a 1230 box)
   * @param {object} o
   * @param {Element} o.after  inserted right after this element (the WebGL layer)
   * @param {number} o.outline the 3D bevel's outward flare, SVG units: the vector is stroked by it
   */
  constructor(svgText, { after, outline = 0 }) {
    const src = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
    const [, , w, h] = (src.getAttribute('viewBox') || '0 0 1230 1230').split(/[\s,]+/).map(Number);
    this.size = { w, h };
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('vector-logo');
    const defs = document.createElementNS(NS, 'defs');
    const grad = document.createElementNS(NS, 'linearGradient');
    this.gradId = `vector-logo-${Math.random().toString(36).slice(2, 8)}`;
    grad.id = this.gradId;
    this.stops = [0, 1].map((o) => {
      const s = document.createElementNS(NS, 'stop');
      s.setAttribute('offset', o);
      grad.append(s);
      return s;
    });
    defs.append(grad);
    svg.append(defs);
    let inner = null; // potrace's group transform (it flips y)
    this.strokes = []; // [group, full stroke width]
    for (const g of src.querySelectorAll(':scope > g')) {
      const copy = document.importNode(g, true);
      inner ??= copy.transform.baseVal.consolidate()?.matrix ?? null;
      copy.setAttribute('fill', `url(#${this.gradId})`);
      copy.setAttribute('stroke', `url(#${this.gradId})`);
      // the stroke draws the bevel's flare, so the flat mark covers the 3D one's silhouette
      const scale = inner ? Math.sqrt(Math.abs(inner.a * inner.d - inner.b * inner.c)) : 1;
      copy.setAttribute('stroke-width', (outline * 2) / scale);
      this.strokes.push([copy, (outline * 2) / scale]);
      copy.setAttribute('stroke-linejoin', 'round');
      svg.append(copy);
    }
    // a gradient is laid out in the painted path's own units (inside the group's flip): map the
    // mark's top and foot (outer units) into them
    const inv = inner?.inverse();
    const at = (x, y) => (inv ? { x: inv.a * x + inv.c * y + inv.e, y: inv.b * x + inv.d * y + inv.f } : { x, y });
    const top = at(w / 2, 0), foot = at(w / 2, h);
    for (const [k, v] of Object.entries({ gradientUnits: 'userSpaceOnUse', x1: top.x, y1: top.y, x2: foot.x, y2: foot.y })) grad.setAttribute(k, v);
    this.el = svg;
    this.setColors('#99958c', '#77736b');
    this.setOpacity(0);
    after.after(svg);
  }

  setColors(top, bottom) {
    this.stops[0].setAttribute('stop-color', top);
    this.stops[1].setAttribute('stop-color', bottom);
  }

  /** The bevel's flare: 1 full (over the 3D logo), 0 none (as the footer's mark). */
  setOutline(k) {
    const v = Math.round(Math.max(0, k) * 1000) / 1000;
    if (v === this._outline) return;
    this._outline = v;
    for (const [g, w] of this.strokes) g.setAttribute('stroke-width', w * v);
  }

  setOpacity(v) {
    this.el.style.opacity = v;
    this.el.style.visibility = v > 0 ? 'visible' : 'hidden';
  }

  /** The CSS matrix (a, b, c, d, e, f) taking SVG units to viewport pixels. */
  setTransform(a, b, c, d, e, f) {
    this.el.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
  }

  /** Behind the footer (phones) or in front of it. */
  setBehind(behind) {
    this.el.classList.toggle('vector-logo--behind', behind);
  }

  dispose() {
    this.el.remove();
  }
}
