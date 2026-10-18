# The sun and moon earrings: specification

This is the brief for the earrings that hang from the theme switch. It is written as a prompt: it
says what to build, why, and how to tell when it is right. Everything here applies to v14 of the
CHIREC Drama Collective site (`dramacollectivewebsite_v14`: Vite, vanilla JS, three.js 0.170, GSAP).

## 0. Revision, after the owner saw the first build (this overrides anything below)

1. **No ear wire.** The hook (the ear wire, its coil and bronze bead, and the link under them) is
   gone. The earring hangs from the switch by the **top loop of the star connector**, as in a photo
   of the sun earring with its star at the top. The star's top loop is the anchor, pinned just
   under the button, so the earring reads as hanging from the button itself. Remove the hook from
   the asset (`tools/earrings/parts-*.json`, `build-earrings.mjs`, `assets/models/earrings.glb`
   and `earrings.json`), not only at runtime.
2. **Much larger.** On a laptop the earring, from the star's top loop to the lowest charm, is about
   **60% of the screen's height**: about 540 px at 1440 × 900. Use something like
   `clamp(380px, 60vh, 640px)`. Its top sits right under the switch, and it hangs down over the
   page, beside the heading, not over the bar. The canvas, its grab zone and the drag reach scale
   with it.
3. **No earrings on phones.** Below 768 px wide there are none: no model loaded, no canvas, no
   WebGL context. The switch works as before. Tablets and laptops keep them.
4. **It does not stay.** It comes down, lands with its small jump, dangles, and **goes back up on
   its own**: about 3 s after it has settled, so about 5 s after the click, unless the pointer is
   on it or it is held. Pointing at it or holding it keeps it down until a moment after it is let
   go. A second switch, or the bar sliding away, still sends it up at once.

## 1. What the visitor sees

The top bar has a theme switch (`button.theme-toggle[data-theme-toggle]`, a sun or moon icon;
`src/ui/theme.js` switches the theme with a circle that widens from the button). Two earrings belong
to it:

- **Light** (house lights up): the **sun earring**.
- **Dark** (the theatre): the **moon earring**.

When the visitor clicks the switch, the earring for the theme they have just chosen **comes down out
of the button**, hanging from it by its ear wire. It drops, lands with a small jump, and **dangles**:
the pendant swings on its loop, the strands of beads and charms beneath it swing on theirs, each a
little behind the part above, until they settle. The parts are rigid and joined by loops. Nothing
stretches or squashes: the earring is metal and stone, so the distance between two loops never
changes.

While it hangs, the visitor can **take hold of it**. Pressing on any part and dragging pulls that
part toward the pointer or finger. The rest follows through the loops, still hanging from the button
by its ear wire. Letting go, it swings back and settles. The page does not scroll while a finger
holds the earring.

It goes back up into the button after about **6 seconds** without anyone touching or pointing at
it. It also goes back up when the theme is switched again; the other earring comes down as it goes.
It goes up at once when the button itself leaves the screen (the bar sliding away).

It is lit like the site's other 3D pieces. The theme's stage light falls on it: dark is the warm
stage spot, light is the house lights up. The cursor's gold glow is a small lamp that moves with the
pointer (as on the publication's statue, `src/scene/thinker.js`, and the reading pages' masks,
`src/scene/masks.js`). The jewellery catches reflections from a soft room environment, so the
metal reads as polished metal and the stones as stones.

## 2. The models

- Sources (not committed; gitignored): `tools/earrings/source/earring-moon.glb` and
  `tools/earrings/source/earring-sun.glb`. They are Meshy models, gltfpack-quantized, about 420k and
  300k triangles. Each is **one fused mesh**, with no separate pieces. They are textured with WebP
  base colour, metallic-roughness and normal maps (2048 px), with a KHR_texture_transform on the uvs.
  Each is about 1.9 units tall, hook at the top, and almost planar (about 0.17 deep).
- **Moon earring**, top to bottom:
  1. A blackened ear wire (the hook), with a wrapped coil and a bronze bead under it.
  2. A small loop, then a six-point star connector with a swirled shell (mother-of-pearl /
     abalone-like) cabochon, with a loop above and a loop below.
  3. A chunky jump ring, then the **crescent moon pendant**: hammered, antiqued silver, with a channel
     of round black stones (onyx-like) along the inner curve.
  4. From the moon's upper right tip, a short drop: a link and a black bead.
  5. From the moon's lower edge, three strands:
     - a short one: a link and a black bead;
     - a middle one: link, speckled white bead (howlite-like), link, star charm with dark pavé,
       link, black bead on a head pin;
     - a right one: link, star charm with dark pavé, link, speckled white bead, link, small cube charm.
- **Sun earring**, top to bottom:
  1. The same kind of ear wire with coil and bronze bead.
  2. A six-point star connector with a white pearl cabochon.
  3. A jump ring, then the **sun pendant**: a hammered dome with five dark dots, ringed by flame
     rays.
  4. Three strands from the sun's lower rays:
     - left: link, pale lilac-white pearl, link, star charm, link, black bead;
     - middle: link, diamond-shaped frame with a brown inlay, link, pale pearl, link, diamond frame;
     - right: link, black bead.

(The exact parts and their order are to be confirmed from the model itself. The renders in §6 are
the authority.)

## 3. The asset pipeline (`tools/earrings/build-earrings.mjs` → `assets/models/earrings.glb`)

Write a Node script in the style of `tools/masks/build-masks.mjs`: glTF-Transform 4, meshoptimizer,
draco3dgltf and sharp, run where those are installed. Document the install line in the script's
header.

1. **Unpack.** Dequantize; bake the node transform and the uv transform (KHR_texture_transform) into
   the attributes, exactly as `build-masks.mjs` does.
2. **Cut into rigid parts.** The mesh is fused, so the parts are defined by hand:
   - Draw a **part map** of 2D polygons in the earring's front plane (x, y in the model's own units),
     kept in `tools/earrings/parts-moon.json` and `parts-sun.json`.
   - Each triangle goes to the part whose polygon holds its centroid (x, y).
   - Each **jump ring** belongs to one of the two parts it joins. Put it on the part it hangs *from*,
     or the one it hangs *with*: whichever makes the cut fall where two loops meet. The cut must not
     fall across a bead, a charm or a pendant.
   - Trace the polygons from orthographic front renders with a coordinate grid, the way
     `tools/team` crops and the masks' cut-outs were traced. Then check them with an **exploded
     render**: each part tinted its own colour and pushed apart along its chain. Iterate until every
     link, bead and charm sits in the right part, with no stray triangles. Near a loop, a part may
     take triangles from depth (z) as well as x, y if the ring's two halves overlap in the front
     view.
   - The open edges a cut leaves must sit where loop meets loop, so they are hidden in the overlap.
3. **Joints.** For each part give:
   - `parent`: the part it hangs from (the ear wire's parent is the anchor);
   - `pivot`: the point in earring space where it hangs from its parent, the centre of the loop
     through loop. The child turns about this point, and the parent carries it at the same place.
   - `anchor`: the ear wire only, the point where it would sit in an ear, at the inside of the
     hook's bend. This is the point that hangs from the button.
   - an approximate `mass`, proportional to the part's volume (signed tetra volume from a
     reference point, or area × thickness);
   - a `radius` for the bounding sphere (or a capsule axis) used for collision between parts;
   - `swing`: the largest angle the part may swing from its parent's frame (a loop through a loop
     turns freely about the loops' common axis, but only so far before the loops jam: about 75° in
     the earring's plane, and about 30° out of it).
   Store all of this in the glb, in each part node's `extras`, and in
   `assets/models/earrings.json` for the runtime.
4. **Slim.** Weld and simplify each part (meshoptimizer), keeping the silhouette of the small links
   and beads: lower ratios on big parts, gentler ones on small ones. Budget: **≤ 45k triangles per
   earring**. Textures: base colour 1024 px, normal 1024 px, metallic-roughness 1024 px (keep it: it
   is what tells metal from stone), all WebP. Draco geometry (the site's decoder is `public/draco/`).
   Budget: **≤ 1.8 MB per earring**, about 3.5 MB for both. If over, reduce triangles first, then
   texture quality.
5. **Name** the nodes `moon`, `moon.hook`, `moon.star`, `moon.pendant`, `moon.drop`, `moon.a1`, … and
   `sun`, `sun.hook`, …: a group per earring, and a mesh per part, with each part's geometry origin
   at its pivot. Keep one material per earring, shared by its parts.

## 4. The physics (`src/scene/earrings.js`)

Articulated rigid bodies, solved by **XPBD** (Müller et al., *Detailed Rigid Body Simulation with
Extended Position Based Dynamics*, 2020): positions, quaternions, linear and angular velocities, and
a diagonal inertia from each part's bounding box and mass.

- **Joints**: a spherical joint at each pivot, with zero compliance (the earring does not stretch),
  and swing limits (§3, `swing`) as angular constraints. Twist about the hanging axis is free, but
  damped.
- **The anchor**: the ear wire's `anchor` point is pinned to a moving target, the bottom centre of
  the theme button in page space, mapped to the scene. It follows the button every frame
  (`getBoundingClientRect`), so when the bar slides up the earring is carried up.
- **Gravity**, a little **air drag** (linear and angular), and **substeps**: about 10 per frame at
  60 fps, with a fixed `dt` and an accumulator. Clamp `dt` after a hidden tab.
- **Collisions between parts**: sphere–sphere, or capsule, between parts that are not parent and
  child, so the strands cannot pass through each other or through the pendant. Soft (a small
  compliance) is enough; nothing else collides.
- **2.5D**: the earring hangs in front of the page, so it swings mostly in the screen's plane. Allow
  some out-of-plane swing and a slow twist, so it reads as a 3D object, not paper. Do not let parts
  pass through the page; a soft limit on z is enough.
- **Grab**: on pointerdown, raycast the visible earring's part meshes (three.js `Raycaster`). If a
  part is hit, add a **drag constraint**: an XPBD attachment between the hit point (in the part's
  frame) and the pointer's point on the plane through the hit, parallel to the screen. It is stiff
  but not rigid, so the earring cannot be torn off; set a small compliance and clamp the pull per
  substep. On pointerup or cancel, remove it, and the earring swings back from where it was let go,
  with its velocity.
- **Performance**: ≤ 15 bodies per earring. The solve should take ≤ 1.5 ms per frame on a laptop.
  No allocation in the loop.

### The drop, the jump, the return (spring physics)

Use the spring model of the `react-spring-physics` skill (`~/.claude/skills/react-spring-physics`;
mass, tension, friction; damping ratio ζ = friction / (2·√(tension·mass)); velocity kept across
interruptions), written in plain JS: the site has no React. A small `spring.js` helper with
`{ mass, tension, friction, precision }`, stepped with the same fixed dt, drives the **anchor's
offset** from the button.

- **Coming down**: the anchor starts hidden, up inside the button (the earring clipped by a mask
  at the bar's edge, or starting behind the bar), and springs down to its resting place just below
  the button. Use `{ mass: 1, tension: 180, friction: 14 }`, about ζ 0.52, so it lands with **a
  small jump**: one rebound of a few pixels. The chain, lagging behind the anchor, swings: this is
  the dangle. The jump is the only overshoot on the site, kept because the owner asked for it. The
  design system's "no bounce" holds everywhere else.
- **Going back up**: critically damped, `{ mass: 1, tension: 210, friction: 29 }`, with no
  overshoot. It starts from the current velocity, if it was still moving.
- **Interrupted** (a switch mid-drop): the outgoing earring rises from where it is, with its current
  velocity, while the incoming one drops.

## 5. Integration

- **Module**: `src/ui/earrings.js` exports `setupEarrings({ reduced, opened })`. It returns a
  cleanup and an object with `drop(theme)`. `src/ui/theme.js` calls `drop(theme)` from `set(theme)`
  (only for a click, not the initial sync). It is wired wherever `setupTheme` is set up
  (`src/site/boot.js` or `main.js`; find it), so every page with the bar has it.
- **Canvas**: one fixed WebGL canvas, `pointer-events: none`, covering a box under the button big
  enough for the earring and its swing: about 2.6 earring widths by 1.4 earring heights, centred on
  the button. It sits above the top bar (`z-index` between `--z-topbar` and `--z-veil`) and is
  created on the first drop. It renders **only while an earring is out**, and is cleared and idle
  otherwise.
- **Grabbing**: while an earring is out, a transparent grab zone (a div with `pointer-events: auto`
  and `touch-action: none`, following the earring's screen bounds each frame, slightly inset) takes
  the pointerdown. A miss lets nothing through (the zone is small); a hit starts the drag. The cursor
  is the site's star grab form (`--cursor-star-grab`), and grabbing while held.
- **The theme's view transition**: while the circle widens (about 1 s), clicks go to `<html>`
  (theme.js `onPictureClick`), so the earring can only be grabbed once it has finished. Give the
  canvas its own `view-transition-name` (`dc-earring`) with no group animation, so it is drawn above
  the circle and not clipped by it.
- **Size**: the earring is about **240 px tall** on a laptop and **180 px** on a phone, in proportion
  to the button.
- **Pages**: every page with the top bar. On the publication and reading pages the bar is hidden
  until it peeks (`src/publication/peekbar.js`). The earring hangs from the button while the bar is
  down, and goes up with it.
- **Lazy**: load `assets/models/earrings.glb` (GLTFLoader + DRACOLoader, decoder `public/draco/`)
  when the page is idle after the curtain opens (`requestIdleCallback`, falling back to a timeout).
  Only do it where WebGL runs well (`probeWebGL` and `prefersStatic`, `src/util/env.js`). If the
  switch is clicked before it has loaded, the theme changes at once and the earring drops when
  ready, if still within 1.5 s; otherwise it is skipped.
- **Reduced motion**: no drop and no swing. The earring fades in, hanging still under the button,
  for 2.5 s, then fades out. No dragging.
- **No WebGL, or a weak GPU**: no earrings. The switch works as before.

## 6. Look

- **Material**: `MeshPhysicalMaterial` from the model's maps. Add an environment for reflections
  (three's `RoomEnvironment` through `PMREMGenerator`, built once and small), `envMapIntensity` tuned
  per theme, clearcoat about 0.4 with roughness about 0.2 for the polished look, and roughness
  scaled down a little where the map says metal. The stones should read as glossy stone (onyx,
  pearl, shell), and the metal as polished, antiqued silver and bronze.
- **Lights**: per theme, as the statue and the masks do. Dark: a warm key from above (gold-300
  toward white) and a faint slate rim. Light: a brighter, whiter house light. In both, the cursor's
  gold lamp (`--gold-300` dark, `--gold-600` light), held just in front of the part under the
  pointer.
- **Tone**: ACES, exposure tuned so the silver is bright but not blown. Antialiased; device pixel
  ratio at most 2.

## 7. How to tell it is right

1. The exploded renders show each part cleanly separated, and the assembled renders show the
   earring exactly as the source (no gaps or missing pieces) at rest.
2. Clicking the switch to light drops the sun; to dark, the moon. It lands with one small jump and
   swings, the parts lagging in turn, and settles within about 3 s.
3. A part dragged sideways pulls the chain. No loop separates (each child's pivot stays on its
   parent's attachment point, within 0.5 px on screen). Released, it swings back.
4. Distances between pivots are constant to within 0.1% throughout.
5. Strands do not pass through each other or the pendant in ordinary dragging.
6. A finger on the earring does not scroll the page; a finger elsewhere does.
7. It goes up after about 6 s idle, at once when the bar hides, and the other comes down on a
   second switch.
8. Reduced motion: a still fade. No WebGL: nothing, and no errors.
9. No console errors; frame time stays smooth while it dangles; the canvas is idle once it has gone.
10. Phone (390 × 844, touch) and laptop (1440 × 900), dark and light.
