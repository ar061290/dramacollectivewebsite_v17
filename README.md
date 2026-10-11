# The Drama Collective · home page (v3)

The home page for the CHIREC Drama Collective: one page, a dark theatre before curtain-up. A marble statue stands in a fixed three.js scene inside the Penrose ring while the page scrolls past it. In v3 the statue performs:

1. she turns 180° to face you;
2. as she turns, she brings the tragedy mask down beside her face;
3. she turns her head away from it;
4. her marble flows into the Collective's gold mark.

The copy is placeholder for now; the structure (hero, five acts, footer) is v2's.

Built with Vite and vanilla JS, three.js 0.170, GSAP 3.13 (ScrollTrigger, SplitText, ScrollToPlugin, CustomEase) and lottie-web 5.12 (light SVG build). The rig and logo trace are made offline with Blender 5.2 and potrace 1.16 (scripts in `tools/`).

Screenshots of the sequence are in [`docs/screenshots`](docs/screenshots).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/
```

**No build step needed.** `index.html` carries an import map that points the same bare imports (`three`, `gsap/...`, `lottie-web/...`) at pinned jsDelivr URLs, so the folder also runs as-is from any static server (`npx serve .`, `python -m http.server`). Vite ignores the import map and bundles from `node_modules`. Opening `index.html` from disk (`file://`) does not work: module scripts and `fetch` need a server.

QA flags:

- `?debug` adds a slider that scrubs the statue's whole sequence from 0 to 1 without scrolling, with buttons for each phase and a readout of every track;
- `?static` forces the still picture;
- `?live` forces WebGL.

## The statue sequence

One number, the scroll progress through `<main>` (0 at the top, 1 where the footer begins), drives everything. The phases and their curves are one config object, `PHASES` and `TRACKS` in [`src/scene/sequence.js`](src/scene/sequence.js):

| Phase | Progress | What happens |
|---|---|---|
| hero | 0–0.08 | v2's composition at rest: seen from behind, mask raised high |
| pose | 0.08–0.55 | three tracks at once, each on its own curve: the 180° **turn** (sine in-out, the whole phase), the **arm** bringing the mask beside the face (cubic, 5–80% of the phase), the **head** turning away (quad, 35–100%) |
| morph | 0.55–0.85 | the statue's surface flows into the 3D logo |
| logo | 0.85–1 | the gold logo holds in the ring, swaying slowly away and back, with a gentle idle drift |

End of the pose, as the viewer sees it: she faces you, the mask is on the right of the screen at face height, angled toward you, and her face looks to the left.

The sequence is scrubbed (scrub 1.2) and fully reversible. With reduced motion nothing is scrubbed: the hero pose holds, then the logo appears in one step when the morph section is reached.

Other stage motion carries over from v2:

- the ring makes four turns about its own centre over the page (`RING_TURNS` in `src/sections/scenes.js`);
- the camera arcs 22° and moves closer; during the morph the turntable takes up that arc, so the logo ends square to the camera;
- the light moves warm, cool, warm by section;
- the stage steps left and right so the text sits in empty space.

On top of the sequence, the statue still answers the mouse:

- she turns up to 10° toward the cursor;
- over her, the key light leans in and the cursor offers "Drag";
- a sideways drag turns her, with a fling, and the turn eases back to the choreography afterwards.

### Ring clearance

The ring never crosses the statue or the logo. The statue's bounding sphere is centred on her turning axis, so it holds at any turn. It is measured over both the rest pose and the end pose (both inside a radius of 1.094 statue units; the height is 2). The logo is scaled so that it, plus the morph's mid-flight rise, fits inside the same sphere. The morph's swirl turns about the same axis, which keeps every point's distance from the centre. Camera distance and field of view keep that sphere inside the ring's hole at every point of the scroll, as in v2.

On narrow (portrait) screens the logo is wider than the view. During the morph the turntable scales down about the logo's centre until the logo fits 86% of the visible width; making it smaller only helps the clearance.

## The rig (`tools/blender/`)

The source is a Meshy scan: one fused mesh with no skeleton, where the mask, hand, arm, head, robes and plinth are a single connected surface. It has 502,574 vertices, 941,264 triangles and three WebP textures, and it is 20.4 MB. The mask is in the figure's **left** hand, so the 180° turn alone puts it on the right of the screen.

`build_rig.py` makes `assets/models/statue-rig.glb` (**1.81 MB**: 79,976 vertices, 160,000 triangles, Draco-compressed, 2048 px WebP textures):

1. **Prepare the mesh.** Import, merge the UV-seam duplicates (so the surface is connected), normalise (height 2, base on y = 0, plinth footprint on the y axis), and decimate to 160k triangles.
2. **Skeleton.** Built from [`rig.json`](tools/blender/rig.json): root, spine, neck, head, left clavicle, upper arm, forearm (two bones, so turning the mask twists along the arm instead of pinching the wrist) and hand, plus a static bone for the right arm. Joints were placed from orthographic renders made with `inspect_views.py`.
3. **Weights.** Blender's automatic (bone heat) weights, then:
   - the hand and mask become one rigid piece, blended over the grip;
   - nothing below the chest follows the arm or head, so the robes stay put;
   - 4 influences per vertex, normalised.
4. **End pose**, from [`pose.json`](tools/blender/pose.json):
   - **arm:** analytic two-bone IK puts the wrist beside the jaw with the elbow down;
   - **hand:** turns the mask to face the viewer, angled a little out, and keeps it upright;
   - **head:** nods forward 30° from its upturned gaze and turns 55° away; the neck takes 35% of the turn.
5. **Export.** A GLB with one action, `Pose` (frame 0 = rest, frame 10 = end). The site reads the two keyframes per bone and blends the arm and the head on their own curves.

Rebuild after changing `rig.json` or `pose.json`:

```bash
blender -b --factory-startup -P tools/blender/build_rig.py -- <source.glb> assets/models/statue-rig.glb tris=160000 tex=2048 renders=<dir>
```

With `renders=`, it also writes close-ups of the end pose (shoulder, elbow, neck). The current ones are in `docs/screenshots/rig/`. To check joint placement against the scan:

```bash
blender -b --factory-startup -P tools/blender/inspect_views.py -- <source.glb> <out dir> tools/blender/rig.json
```

## The 3D logo (`tools/logo/`, `src/scene/logo.js`)

`trace_logo.ps1` thresholds the alpha of `assets/brand/mark-gold.png` (Blender reads the PNG, `png_to_pbm.py`) and traces it with potrace into `assets/brand/mark.svg` (48 KB, 21 paths):

```powershell
powershell -File tools/logo/trace_logo.ps1 -Blender <blender.exe> -Potrace <potrace.exe>
```

At load time `logo.js` builds the 3D mark:

- **extrusion:** `SVGLoader` + `ExtrudeGeometry`, 7% of its width deep with a small bevel;
- **orientation:** turned to read correctly from the viewer's side;
- **size:** scaled to fit the ring-clearance sphere;
- **shading:** creased normals, so the caps stay flat and the bevels smooth.

The curves are sampled as finely as the morph's triangle budget allows.

## The morph (`src/scene/morph.js`)

The morph is one mesh with the same triangles in two shapes. It is not a cross-fade, and two meshes are never visible at once.

- **Start shape.** Each triangle starts as one of the statue's triangles in its end pose. The positions are computed on the CPU from the same skeleton the GPU skins with. At the start of the morph phase the skinned statue is hidden and this mesh is shown. Measured on the canvas, the swap changes nothing: a mean difference of 0.000 per pixel, and at most 9/255 on any pixel, which is anti-aliasing noise.
- **End shape.** Each triangle ends as one triangle of the logo, which is tessellated by longest-edge splits to exactly the statue's 160,000 triangles.
- **Pairing.** Statue and logo triangles are paired by balanced recursive median splits of their centroids, each set normalised to its own bounds. Neighbours stay neighbours, and the figure's front becomes the logo's front. Each pair's corners are rotated to the best match, so triangles do not flip.
- **Motion.** Each triangle has its own start, staggered outward from the mask with smooth noise. It travels on a gentle swirl about the turning axis (all one way, its strength varying smoothly) with a slight rise. The marble's colour, roughness, normal map and reflections turn to gold per triangle.
- **Shaders.** The same vertex path runs in the colour pass, the shadow pass and the star-field silhouette pass. It is built about 0.35–0.6 s after the hero is up; until then the statue simply holds its end pose.

**What it looks like mid-way:** the marble comes apart into a flowing lace and reassembles as gold, rather than melting as one continuous skin. Both ends are exact. A single unbroken surface cannot become the logo, which has holes through it (the eyes, the gaps between the flames), so the surface has to part somewhere.

Retune it with the `MORPH` constants (stagger, swirl, rise, gold colour and roughness) and `GOLD_ENV` in `Stage.js`.

## Changing the copy

All text is in `index.html`. Every section is a `<section>` with an id: hero `#top`, the acts `#about`, `#productions`, `#impact`, `#leadership`, `#support`, and the footer `#contact`.

Each scene also tells the stage how to light and place the statue:

- `data-frame`: where the statue sits, as a fraction of the viewport width (`0.24` = right, `-0.24` = left). `scene--text-right` moves the text column right.
- `data-light`: 0 is the warm spotlight, 1 the cool one.
- `data-key`: the key light level.

Anything marked `data-mask` keeps the constellations clear of it. Act five keeps a button with `data-cta` (its Lottie flourish hooks onto it).

The sequence follows the length of `<main>`. Longer copy simply stretches it; to change the pacing, retime `PHASES`.

## Images

- **Brand marks**: `assets/brand/mark-gold.png` (the source of the 3D logo and the nav fallback) and `mark-blush.png` (the footer watermark). The animated nav mark is `assets/lottie/mask-mark.json`. If the mark changes, re-run `trace_logo.ps1`.
- **Fallback still**: `assets/fallback/hero.png` is the hero composition, unchanged from v2.

## Stars, cursor, themes, music, nav

All as in v2:

- **Stars:** a dense field that glows around the cursor and draws constellations.
- **Cursor:** a native star cursor.
- **Themes:** light and dark, remembered per browser (`dc-theme`).
- **Music:** public-domain piano from Musopen, streamed from Wikimedia Commons and credited in the footer (`src/ui/music.js`).
- **Nav:** hides on scroll down and folds into the Menu below 1000 px.

## Performance and fallbacks

- **Loading:** three.js, the 1.81 MB rig and the 48 KB logo trace load lazily behind the loader. The morph mesh is built in an idle moment after the intro.
- **Geometry:** the skinned statue has 79,976 vertices and 160,000 triangles. The morph mesh has 480,000 vertices (160,000 independent triangles; about 31 MB of vertex data on the GPU). Only one of the two is drawn at a time.
- **Rendering:**
  - DPR is capped at 2;
  - a frame is rendered only when something changed (while the logo holds, its idle drift keeps rendering);
  - the shadow map is redrawn only when the shape or the turn changes;
  - both canvases pause when the tab is hidden or the footer covers the stage.
- **Static fallback:** no WebGL, a software renderer, Save-Data, 2 cores or fewer, or 2 GB of memory or less all get the still picture, with the star field kept.
- **Reduced motion:** no intro, parallax, ring turn or scrubbed sequence (the hero pose, then the logo in one step), no lean toward the cursor, and no fling.
- **Teardown:** `dramaCollective.destroy()` (also on `pagehide`) frees the GPU memory, including the morph mesh, along with ScrollTriggers, SplitTexts, Lotties and listeners.

## Design system extensions

As in v2: theme roles in `tokens.css`, the text grounds behind copy, the icon buttons, the cursor hint, and the motion confined to the stage. The 3D logo's gold is gold-600 a shade deeper, as a metal (`MORPH.gold`).
