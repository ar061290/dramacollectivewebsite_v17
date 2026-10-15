// The last act is the footer's columns (every page, who to write to), and as the footer rises they
// are carried down into its empty slot ([data-dock-slot]) beside the mark, in step with the logo the
// stage docks there: the same span of scroll (the footer from the foot of the screen until it has
// risen as far as it will, Stage._dock) and the same ease. Like the logo, the columns leave from
// where they are on screen when the footer starts to rise: they hold that place against the scroll
// and glide from it to the slot, arriving with the logo.
// Both are laid out normally, so their offset is measured once per layout (transforms off). Before
// measuring, the columns are given the slot's width (they wrap where they land) and the slot their
// height (nothing below it moves when they arrive). Their feathered ground (and the phones' scrim)
// fades only as far as they are over the footer, whose own ground is under them there (--over).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';

const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t); // Stage._dock's

export function setupDock() {
  const block = document.querySelector('[data-dock]');
  const slot = document.querySelector('[data-dock-slot]');
  const footer = slot?.closest('.curtain');
  if (!block || !slot || !footer) return () => {};

  const d = { x: 0, y: 0 };
  let p = 0, span = 0;
  const apply = () => {
    const k = ease(p);
    // held against the scroll at first (as the fixed logo is), then into the slot
    gsap.set(block, { x: d.x * k, y: p * span * (1 - k) + d.y * k, force3D: true });
    block.style.setProperty('--dock', k.toFixed(3));
    const b = block.getBoundingClientRect(), f = footer.getBoundingClientRect();
    block.style.setProperty('--over', Math.min(1, Math.max(0, (b.bottom - f.top) / Math.max(1, b.height))).toFixed(3));
  };
  const box = () => {
    const cs = getComputedStyle(block);
    return { left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0, top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  };
  // before ScrollTrigger measures the page: transforms off, the columns at the slot's width, the slot
  // at their height, so the trigger is worked out from the final layout
  const prepare = () => {
    gsap.set(block, { x: 0, y: 0 });
    const pad = box();
    block.style.maxWidth = `${slot.clientWidth + pad.left + pad.right}px`;
    slot.style.minHeight = `${block.offsetHeight - pad.top - pad.bottom}px`;
  };
  const measure = () => {
    // the columns (inside the block's padding, which phones give it) line up with the slot
    const b = block.getBoundingClientRect(), s = slot.getBoundingClientRect();
    const pad = box();
    d.x = s.left - b.left - pad.left;
    d.y = s.top - (b.top + pad.top) + (s.height - (b.height - pad.top - pad.bottom)) / 2;
  };

  prepare();
  ScrollTrigger.addEventListener('refreshInit', prepare);
  const trigger = ScrollTrigger.create({
    trigger: footer,
    start: 'top bottom',
    // risen as far as it will: all of it on screen, or its top at the top if it is taller
    end: () => `top ${Math.max(0, innerHeight - footer.offsetHeight)}px`,
    onRefresh: (self) => { measure(); span = self.end - self.start; p = self.progress; apply(); },
    onUpdate: (self) => { p = self.progress; apply(); },
  });
  block.classList.add('is-docking');

  return () => {
    ScrollTrigger.removeEventListener('refreshInit', prepare);
    trigger.kill();
    block.classList.remove('is-docking');
    block.style.removeProperty('--dock');
    block.style.removeProperty('--over');
    block.style.removeProperty('max-width');
    slot.style.removeProperty('min-height');
    gsap.set(block, { clearProps: 'transform' });
  };
}
