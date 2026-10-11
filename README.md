# The Drama Collective · home page (v3)

The home page for the CHIREC Drama Collective: one page, a dark theatre before curtain-up. A marble statue stands in a fixed three.js scene inside the Penrose ring while the page scrolls past it. In v3 the statue performs:

1. she turns 180° to face you;
2. as she turns, she brings the tragedy mask down beside her face;
3. she turns her head away from it;
4. the view closes in on her upper body: her head, the hand and the mask;
5. in the close-up her marble flows into the Collective's mark, carved in the same stone, part for part and where each part is: her mask becomes the logo's mask, her hand the hand that holds it, her face the profile face, and the three hold for a moment on the marble figure; then, as her robes stream into the brush strokes, flames and crescent, the mark grows out to fill the ring and the view opens out again.

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

- `?debug` adds a slider that scrubs the statue's whole sequence from 0 to 1 without scrolling, with buttons for each phase and a readout of every track (the close-up's `zoom` among them) and of how far the logo has grown;
- `?static` forces the still picture;
- `?live` forces WebGL.

## The statue sequence

One number, the scroll progress through `<main>` (0 at the top, 1 where the footer begins), drives everything. The phases and their curves are one config object, `PHASES` and `TRACKS` in [`src/scene/sequence.js`](src/scene/sequence.js):

| Phase | Progress | What happens |
|---|---|---|
| hero | 0–0.08 | v2's composition at rest: seen from behind, mask raised high |
| pose | 0.08–0.55 | three tracks at once, each on its own curve: the 180° **turn** (sine in-out, the whole phase), the **arm** bringing the mask beside the face (cubic, 5–80% of the phase), the **head** turning away (quad, 35–100%) |
| zoom | 0.55–0.63 | the view closes in on her upper body (sine in-out), until her head, hand and mask, with the logo's that will form on them, fill 45% of the view's height (or 70% of its width, if that is less, as on a phone) |
| morph | 0.63–0.92 | in the close-up, the statue's surface flows into the 3D logo: mask, hand and face in turn, at her head; then the robes stream into the rest of the mark as the logo grows to its place and the view opens out again |
| logo | 0.92–1 | the stone logo holds in the ring, swaying slowly away and back, with a gentle idle drift |

End of the pose, as the viewer sees it: she faces you, the mask is on the right of the screen at face height, angled toward you, and her face looks to the left.

The close-up is a zoom of the picture itself: the camera stays where it is and renders a smaller window of the same view (`setViewOffset`). The window frames her head, hand and mask and the logo's forming on them (before the morph mesh is built, a point between her head and her hand, easing over to the real framing if the mesh arrives mid-close-up), and puts them where the statue's centre would be in the composition, brought in from the composition's sideways offset as far as the close-up needs to stay on screen (portrait tablets, which get the desktop layout). The light, the shadows and the ring are untouched. As the logo grows, the zoom eases back out geometrically, on the morph's own schedule even if the morph mesh never builds, and the window returns to the plain view: the logo grows on screen only from the close-up's share of the view to its final size (about 1.4× on desktop), not fourfold, while the ring comes back into view around it (`CLOSE_UP` in `Stage.js`). The cursor parallax is divided by the zoom, so it moves the picture no more in the close-up than out of it, and a drag or the lean toward the cursor turns her inside a steady frame.

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

The ring never crosses the statue or the logo. The statue's bounding sphere is centred on her turning axis, so it holds at any turn. It is measured over both the rest pose and the end pose (both inside a radius of 1.094 statue units; the height is 2). The logo is scaled so that it, plus the morph's mid-flight rise, fits inside the same sphere. Where it first forms, at her head, it is smaller and placed so that it stays inside its own sphere (with room for the parts' small shifts onto hers), and every point of its growth lies between the two. The morph's swirl turns about the same axis, which keeps every point's distance from the centre. Camera distance and field of view keep that sphere inside the ring's hole at every point of the scroll, as in v2. The close-up does not change this: it magnifies the whole picture, ring included, so the statue stays inside the hole, which simply reaches past the edges of the screen.

On narrow (portrait) screens the finished logo (about 1.7 units wide) takes up most of the view's width, about 90% on a 390 × 844 phone. As the logo grows, the turntable scales down about the centre of the clearance sphere (on the turning axis, where the finished logo is centred) until the logo fits 86% of the visible width; because it scales about the sphere's centre, making it smaller only helps the clearance.

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
- **shading:** creased normals, so the caps stay flat and the bevels smooth;
- **parts:** each triangle is labelled with the part of the mark its centroid falls in. The caps are triangulated as fans of long slivers, so first every cap triangle that straddles two parts is split at the middle of its longest edge until it lies in one (or is under 8 SVG units long); otherwise slivers from the brush strokes would cut across the profile face.

The curves are sampled as finely as the morph's triangle budget allows.

## The morph (`src/scene/morph.js`)

The morph is one mesh with the same triangles in two shapes, changing part for part. It is not a cross-fade, and two meshes are never visible at once.

The logo is about four times the size of her head, hand and mask together, so it does not form at its full size. It forms **at her head** first, in the close-up, a quarter of its size, laid over her so that its mask lies on her mask, its hand on her hand and its face on her face. Each part changes where it is, into its counterpart at about its own size, and the three hold for a moment on the marble figure. Then, as the robes stream into the brush strokes, flames and crescent, the parts close up into the logo's own layout and the logo grows out to its place in the ring.

| Statue | becomes | Logo |
|---|---|---|
| the mask in her hand | → | the logo's mask: the D-shaped frame around it, the eye, the nose and lips |
| her hand and forearm | → | the hand holding the mask, down its long wrist |
| her head and neck | → | the profile face |
| torso, robes, upper arm, the other arm, plinth | → | the brush strokes, the flames, the crescent and the star |

- **The statue's parts** come from the rig. The hand bone carries the hand and, above the grip, the mask; the forearm bones join the hand (in the end pose her forearm runs down from the wrist to the elbow, like the logo's long wrist), and the upper arm stays with the body; the head and neck bones are the face (`statueParts` in `morph.js`).
- **The logo's parts** are polygons drawn over the trace in [`assets/brand/mark-regions.json`](assets/brand/mark-regions.json). In the mark, the mask is drawn as negative space, so its part is the frame and features around it. The profile face is negative space too, so its part is the profile with the gold it is cut from (the right edge of the brush strokes): it reads as a face even small, and her nose becomes its nose.
- **Checking the split.** `tools/logo/regions_preview.py` renders the logo coloured by part, and `tools/logo/components.py` lists its separate ink pieces. With `?debug`, "Show parts" tints both shapes during the morph (mask gold, hand green, face blue, body grey).
- **Where it forms.** `fitOverHead` in `morph.js` finds the uniform scale and shift (no turn) that best carry the bounds of the logo's mask, hand and face onto hers, as the viewer sees them: a least-squares fit over each box's centre and corners. One fit cannot place all three (in the logo the hand lies between the mask and the face; on her it lies under the mask), so each part also gets the small shift that puts its centre on hers (at most 0.07 units), which fades out as the parts close up. The logo stands level with the front of her three parts, so her marble chest does not cover it. With the current rig it forms at 0.25 of its size, centred just beside her face. The fit is computed at load from the rig and the regions, so it follows any change to either.
- **Order and timing**, as shares of the morph: the mask changes first, almost as one piece (0–0.18), then the hand (0.08–0.26), then the face (0.16–0.38). Her upper arm belongs to the body (the logo's hand is a hand and a wrist), but it leaves with the hand, from the elbow up (0.14–0.42), so no stump is left behind. The three new parts hold on the marble figure (to 0.46). Then the robes stream on a wider swirl into the rest of the mark (0.46–1), the parts close up into the logo's own layout (0.46–0.62), and the logo grows from her head to its place (0.55–1, smoothstep; its scale grows geometrically, its centre moves in a straight line). The timings are in `MORPH.parts`, `MORPH.upperArm`, `MORPH.settle` and `MORPH.grow`; a part is complete at `start + spread + travel`.

How it is built:

- **Start shape.** Each triangle starts as one of the statue's triangles in its end pose. The positions are computed on the CPU from the same skeleton the GPU skins with. At the start of the morph phase, in the close-up (about 3×), the skinned statue is hidden and this mesh is shown. Measured on the canvas there, the swap changes nothing visible: a mean difference of 0.002 per pixel, with 4 pixels of 1.28 million (on her silhouette's edge) differing by more than 24/255, which is anti-aliasing; unzoomed, at most 5/255 on any pixel.
- **End shape.** Within each part, the logo's triangles are tessellated by longest-edge splits to the statue part's triangle count. Where the logo part is the larger, the statue part is padded with copies of its own triangles, which start exactly on top of each other. The mask and the hand are padded about 3× and 15×, so they spread out as they change. In total there are 183,587 triangles.
- **Pairing.** Within each part, triangles are paired by balanced recursive median splits of their centroids, each set normalised to its own bounds. Her face looks to the screen's left at the end of the pose, as the logo's profile does, so nose goes to nose and crown to brow. Each pair's corners are rotated to the best match, so triangles do not flip.
- **Motion.** Each triangle travels to its place in the logo, as the logo stands at that moment (at her head, growing, or in the ring), with a slight rise (in proportion for the mask, hand and face, which change at the logo's small size) and, for the body, a swirl about the turning axis. The logo's place is one uniform (`uFit`: centre and scale) plus a shift per part (`uShift`, faded by `uSettle`), so its growth costs nothing per triangle and does not touch the normals. The material stays the statue's own (same roughness, no metal, the stage's reflections); per triangle, the texture evens out to the stone's average colour and the normal map fades, since each logo triangle carries a stray patch of her texture.
- **Shaders.** The same vertex path runs in the colour pass, the shadow pass and the star-field silhouette pass. The mesh is built in about a second, after the hero is up; until then the statue simply holds its end pose (and the close-up still opens out on the morph's schedule).

The mask, hand and face change almost as solid pieces, each in its own place. The body comes apart into a flowing lace and reassembles as the brush strokes, flames and crescent, because one unbroken surface cannot become shapes with holes through them.

Retune it with the `MORPH` constants (part timings, the upper arm, the settle, the grow, swirl, rise). Redraw the parts in `mark-regions.json`.

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
- **Geometry:** the skinned statue has 79,976 vertices and 160,000 triangles. The morph mesh has 550,761 vertices (183,587 independent triangles; about 40 MB of vertex data on the GPU). Only one of the two is drawn at a time.
- **Rendering:**
  - DPR is capped at 2;
  - a frame is rendered only when something changed (while the logo holds, its idle drift keeps rendering);
  - the shadow map is redrawn only when the shape or the turn changes;
  - both canvases pause when the tab is hidden or the footer covers the stage.
- **Static fallback:** no WebGL, a software renderer, Save-Data, 2 cores or fewer, or 2 GB of memory or less all get the still picture, with the star field kept.
- **Reduced motion:** no intro, parallax, ring turn or scrubbed sequence (the hero pose, then the logo in one step), no lean toward the cursor, and no fling.
- **Teardown:** `dramaCollective.destroy()` (also on `pagehide`) frees the GPU memory, including the morph mesh, along with ScrollTriggers, SplitTexts, Lotties and listeners.

## Design system extensions

As in v2: theme roles in `tokens.css`, the text grounds behind copy, the icon buttons, the cursor hint, and the motion confined to the stage. The 3D logo is the statue's own stone, in its average colour.
