# The Drama Collective · website (v10)

The home page for the CHIREC Drama Collective: one page, a dark theatre before curtain-up. A marble statue stands in a fixed three.js scene inside the Penrose ring while the page scrolls past it. The statue performs:

1. she makes a full revolution, the mask still raised;
2. as she turns on, one and a half revolutions more until she faces you, she brings the tragedy mask down beside her face;
3. she turns her head away from it;
4. the view closes in on her upper body: her head, the hand and the mask;
5. in the close-up her marble flows into the Collective's mark, carved in the same stone, part for part and where each part is: her mask becomes the logo's mask, her hand the hand that holds it, her face the profile face, and the three hold for a moment on the marble figure; then, as her robes stream into the brush strokes, flames and crescent, the mark grows out to fill the ring and the view opens out again;
6. meanwhile one more star shows in the sky behind the stage, comes forward through the ring and settles beside the mask as the logo's own star.

The home page has a hero and five acts: the Collective's statement, a countdown to the production, this month's publication, what the Collective does (five cards the scroll turns), and the footer's own columns, which dock into the footer with the logo. The publication's pieces and the hero's meta description are still placeholder.

## What changed in v10

- **Apply now** (`apply.html`, `src/pages/apply.js`): the three roles, directors, actors and scriptwriters, each with its duties and the skills appreciated, then the Collective's application form (a Fillout form). Every Apply now button goes there now (`APPLY` in `tools/pages/build.mjs`), and the footer lists it.
- **Apply to be a sponsor** (`sponsor-apply.html`, `src/pages/sponsor-apply.js`): reached from the new "Apply to be a sponsor" button on Become a sponsor; a link back to the tiers, the sponsorship form (Fillout), and the President's and Executive President's cards for questions (the same cards as Contact us, `<!-- site:contacts -->`), with a button back to the tiers under them.
- **The tiers** are named Standing ovation (Gold tier sponsorship), Headliner (Silver tier sponsorship) and Spotlight (Bronze tier sponsorship), and now run dearest first, as on the sponsorship form.
- **Music** is on by default: the site opens with it playing unless the visitor turned it off earlier in the visit (or their browser is set to save data). Browsers do not let a page start sound before the visitor has done anything on it, so on a first page it starts with their first tap, click or key. Besides the button, it answers the usual play/pause shortcuts: the system's media controls through the browser's media session (media keys, a touchpad's three-finger tap set to play/pause, headset buttons, the browser's and the phone's own controls, once the music has played), K on the page wherever the visitor is not typing, and a three-finger tap on a touch screen.
- **The forms** are Fillout's standard embed (`data-fillout-id`); `src/site/fillout.js` loads Fillout's script once the page curtain has opened, keeps the form's box while it loads, names the iframe, and measures the page's scroll effects again as the form grows. The forms' questions, their look and where answers go are set in Fillout itself, not here. A link to each form on Fillout's own site stays under it for browsers that block the embed. While a form is under the top bar, the bar's two kept buttons fade out where they stand (as they do over the home page's tall footer), so a tap meant for a field never takes the visitor off the page.

## What changed in v9

- **Home footer:** the columns sit level with the middle of the mark (no empty band under them) and the footer is shorter. While the last act's columns hold and travel into the footer they are `position: fixed` (`src/sections/dock.js`), so the browser keeps them still against the scroll; moving them by a transform per scroll event ran a frame behind a fast scroll and shook.
- **Music:** the site's own MP3 (`public/music/the-smell-of-old-books.mp3`, the whole playlist), streamed (only its length is read until it plays), starting at a random point on every page load; the YouTube player and its "now playing" card are gone (`src/ui/music.js`, `public/music/README.txt`). Hosting the recording needs the rights holder's permission; the footer credits Dark Enigmatic.
- **Top bar:** scrolling down, it glides up out of view again (not to the right); Apply now and Become a sponsor stay where they are.
- **Buttons fly in** (`src/site/flyin.js`): an in-page Apply now or Become a sponsor (`data-fly="apply|sponsor"`: the production page, Contact us) waits invisible until it is in view, then the top bar's own button flies down into its place, and back when it leaves. Where the bar does not show that button, or with reduced motion, it simply fades in.
- **Theme switch:** a circle reveal from the toggle (the View Transitions API, as on quickmark.co), with a gold ring along its edge, star glints on it and ripples trailing behind, like a drop in water (`src/ui/theme.js`, `src/ui/themeRing.js`); canvases (the stage, the sky, the curtains, the About ring) switch at once inside the transition. Without View Transitions: the old fade plus the ring. Reduced motion: an instant switch.
- **Instagram** is set in Grand Hotel (`assets/fonts/GrandHotel-400.woff2`, an open-licence script close to the classic wordmark; `.ig-word`) wherever the word appears.
- **About us:** the ring beside the statement is gone and the statement takes the width. The skills (Communication … Creative problem solving) have the old verbs' sliding glow and styling, spread apart. The courage paragraph slides out from the quote's rule as you scroll; the six values appear one by one. LEARN · CREATE · COLLABORATE · PERFORM · GROW is now a held stage (after the Dissection Ledger's): the home page's Penrose ring in the statue's marble, turning and shrinking with the scroll, gold line-work turning behind it, and each word's outline in Raung morphing into the next (`src/sections/lexicon.js`, `src/scene/aboutRing.js`; the outlines come from the site's own font file: `node tools/type/words.mjs` writes `assets/type/about-words.js`, re-run it if the words or the font change).
- **The production:** "Entirely by students." is centred; the five lamps follow the scroll as they follow the cursor (the act holds for a stretch and the scroll sweeps an unseen pointer across them; no cursor glow or constellations from it); the planner's section is "Stage planner and renderer"; Apply now stands beside Become a sponsor.
- **Stage planner:** opens on what the computer needs (from the planner's own code: a laptop or desktop with WebGL 2 and hardware acceleration, built-in graphics fine in fast, separate graphics for balanced and best, about 8 GB of memory, a 1280×720 screen or larger, mouse or trackpad and keyboard), and loads the hall only on Confirm (`src/planner/main.js` is now the light entry; the planner is `src/planner/app.js`); the confirmation lasts the visit (sessionStorage `dc-planner-ok`). It opens in fast quality unless `?quality=` or the visitor's choice earlier in the visit says otherwise (`src/planner/quality.js`).
- **Coming soon:** the still under the 3D curtain is now the same picture as its first frame (same pleats, pelmet, mark and bulbs, in `src/styles/soon.css`), the 3D curtain fades in over it and then its lamps and marquee light up smoothly; no late pop.

## What changed in v8

- **Act four's cards** are a little see-through, so the sky shows faintly through the card in front: the stars are allowed behind the deck (no `data-mask` on it), the column's ground is lighter there, and a card behind shows only its edges until it comes up (`--face`, set per card by `src/sections/pillars.js`), so no text shows through another card's.
- **The footer's columns move with the logo:** in the last act they hold in the middle of the screen once they get there, as the fixed logo beside them does (`<main>` runs on past the act for the stage's sequence, which used to carry them up off the top and back down), and as the footer rises each column travels to its own place on exactly the logo's stretch of scroll and ease (`src/sections/dock.js`).
- **The home footer's row:** Write to us, The Collective, Our outputs, then the mark, lower and at the right (`.curtain__slot--*`). The act keeps its own layout (two columns, who to write to beneath); each column is rearranged only on its way down. On tablets the row folds into two by two; on phones into one column under the mark.

## What changed in v7

- **Header:** Apply now is a button exactly like Become a sponsor (`btn--inverse`), and it stays where it is, beside the brand, when the rest of the bar slides away. Only at the very end of the home page, where the footer is taller than a short laptop's screen and its columns scroll up under the bar, do the two buttons fade out where they stand.
- **Act eyebrows:** "The Collective", "The production", "The publication", "What we do" (no act numbers).
- **Act four, held:** five cards now (Flash plays added, its line adapted from the Flash plays page). The act stays on screen for a stretch of scroll (`.scene--hold`, `[data-hold]`: a sticky column in a section 2.2 screens taller) and the scroll turns the cards in order, resting on each; a tap, a name, a key or a drag turns them too and scrolls the page to the same place. Over that stretch the stage holds still: the sequence, the ring and the camera are laid out over the rest of the page (`src/sections/scenes.js`), and the page's floor rises by the stretch, so the model stays exactly as v6 showed it when the act arrives and the acts before it keep their pacing. The act is held only where the screen is at least 600 px tall (`HOLD_QUERY` in `src/sections/pillars.js`); on a shorter one (a phone on its side) it scrolls by like the other acts and the cards turn by drag, tap, name or key.
- **Footer:** no copy of its own, and no screen-filling section any more. On the home page the last act *is* the footer's columns (The Collective, Our outputs, Write to us; written into `index.html` by `tools/pages/build.mjs` between `<!-- site:links -->` markers): as the footer rises they glide down into it in step with the logo, on the same stretch of scroll and the same ease, both arriving as the footer finishes rising (`src/sections/dock.js`, `Stage._dock`). Once the scroll passes the end of `<main>` the stage's sequence is finished at once, so even after a jump the logo has gone flat and handed over to its vector before the footer reaches it. On the other pages the mark stands beside the columns.
- **Ring and footer in sync:** the footer is now layered above the WebGL canvas (`--z-footer` over `--z-stage`; the flat vector logo above both, `--z-vector`), so the browser itself cuts the ring at the footer's edge however fast the page scrolls; the stage no longer clips its frame to the footer a frame late.
- **Footer text:** larger (links 18 px, emails 16 px, headings 12 px, the fine print a step up); Aripra Sharma's address in lower case; CHIREC's logo larger on its white plate with its line in bold.

## What changed in v6

- **Home, the 3D logo at the end:** a fast scroll to the end no longer leaves the logo frozen mid-morph over the footer. When the footer covers the stage, the stage first plays the scrubbed sequence out to where the scroll is, docks the logo, and only then stops (`Stage.stopWhenSettled`).
- **Home, 3D logo to vector:** no more cross-fade. The stone logo goes flat first (`src/scene/flat.js`): its relief sinks into the plane of its front face and its light settles into the vector's own two colours, sweeping down from the top. Only then does the vector take over, already identical to what is on screen. On its way into the footer the vector takes on the footer mark's colours (`--emblem-top`, `--emblem-foot`) and sheds the bevel's flare, so the last hand-over is not seen either.
- **Home, the acts:** the hero's placeholder tagline is gone. Act one: "Two masks? More than just a stage." and the Collective's statement. Act two: a live countdown to the production (the production page's countdown, now shared as `src/sections/countdown.js`), with the date, venue and a link to The production. Act three: "This month's publication", a lead piece over four more, magazine-style, each opening The publication until the pieces have pages of their own (titles, authors and art to come). Act four: the pillars (Production, Workshops, Publication, Outreach, in the words of the Collective's design document) as prompt cards on two gold rings: drag or swipe sideways to turn them like pages, tap a card for the next, or choose a name in the running order under the stack (`src/sections/pillars.js`, `src/styles/pillars.css`); vertical swipes still scroll the page. Act five: the curtain call (placeholder copy), which the footer carries down into its empty slot beside the mark as it rises (`src/sections/dock.js`).
- **Header:** an **Apply now** button beside the brand, the sponsor button's sibling (it opens Contact us until there is somewhere for applications to go: `APPLY` in `tools/pages/build.mjs`). Scrolling down, the bar slides away to the right, the far end first, and the two buttons stay, Apply now closing up beside Become a sponsor. Below 1100 px (was 1024) the pages fold into the Menu, which also lists Apply now; to keep the bar on one line, Instagram moves to the Menu and the footer below 900 px, Apply now below 760 px, and Become a sponsor below 560 px (it was 480 px, where it overflowed).
- **Footer:** no placeholder copy. The links are in Lato, like the emails and the column headings. On the inner pages the mark stands beside the three columns and the footer is only as tall as its contents; on the home page the curtain call docks into the space on the left.

## What changed in v5

- **Header:** About us, Core team, **Our outputs** (a menu that drops on hover, focus or click: the publication, the production, flash plays, workshops, social outreach) and **Contact us**; an Instagram button beside music and the theme. On phones the Menu lists the outputs under their own heading.
- **Footer:** every page, in three columns (the Collective, Our outputs, Write to us: both leads' emails and Instagram); CHIREC as the No. 1 school in Hyderabad and Telangana beside its logo. The home page's logo now flies into the footer and hands over to the same crisp mark as every other page.
- **Contact us** (`contact.html`): a card each for Aadi Ramnani (President) and Aripra Sharma (Executive President), with copy-to-clipboard; Instagram and sponsorship.
- **Instagram:** one constant, `INSTAGRAM` in `tools/pages/build.mjs` (then `npm run pages`). **It still points at instagram.com itself: put the Collective's handle there.**
- **Core team:** the film strip is a sticky horizontal scroll in the manner of landonorris.com (a tall section, a sticky screen-high frame, the strip moved by scroll progress; nothing pinned), so it arrives with its first frame and leaves with its last; the department filter holds the grid's height while the cards move, so nothing below slides over them.
- **Curtain between pages:** closes in 0.36 s, opens in 0.5 s on its own GPU layer; pages wait at most 0.45 s for the type, and the coming-soon, sponsor and About pages load three.js only after it has parted.
- **Home:** no scrolling while the loader is up (and the page always starts at the top); the intro starts with the words at once (1.6 s) instead of waiting for the Lotties.
- **About us:** the home page's stone ring stands half off the right edge and turns about its centre with the scroll (`src/scene/aboutRing.js`); the copy keeps to its left. The five verbs light in 1.4 screens instead of 2.6.
- **Music:** plays the site's own MP3, `public/music/the-smell-of-old-books.mp3` (see `public/music/README.txt`); until that file is there, it plays the piece from YouTube in the "now playing" card.

## What changed in v4

- **Home:** the turn, the pose and the close-up run twice as fast, so the page has five acts instead of eight; the morph runs at exactly v3's pace. The sequence is now laid out in screens of scroll (`LENGTHS` in `sequence.js`) and fitted to the page by `retime()`.
- **The logo's star** is no longer made from the statue: it flies in from the sky (`src/scene/star.js`).
- **Loader:** the satin of the invitation (a small shader) and the sunburst's ring, crescent and rays, which come on one by one round the ring and start again; no number, no percentage.
- **Faster start:** the Draco decoder is served with the site and fetched while the model downloads; the model is preloaded with the page; the shaders compile (in parallel where the driver can) before the curtain goes up instead of stalling the first frame; the fonts are WOFF2 (a third of the bytes); the 0.9 MB still picture is fetched only when it is needed.
- **Header:** a larger mark and wordmark (on one line from 1680 px, stacked in two below; the top bar is 64 px).
- **Core team:** names and roles as the publication gives them; Finance (Karthikeya Aduru, Nivaan Garg) and Flash plays & production (Hasini, Pritika) departments; Behind the curtain, a film strip of the team at work; the intro panel scrolls; the cursor stays visible over it.
- **Coming soon:** the 3D curtain, the page and the curtain between pages follow the light theme.
- **Become a sponsor:** the tickets' stubs are struck in their metal and catch the pointer's light; the medallion's "Drag to turn" is gone.
- **Music:** the dark academia playlist from YouTube, in YouTube's player (a "now playing" card while it plays), carried from page to page.
- **The production → Stage planner:** the 3D stage planner is part of the site (`stage-planner.html`, `src/planner/`), with a way back to The production.

Around it are ten pages, each its own page in the same tab, with the same header and footer (see "The pages" below): About us, Core team, The publication, The production, Flash plays, Workshops and Social outreach (both coming soon, like Flash plays), Contact us, Become a sponsor and the stage planner.

Built with Vite and vanilla JS, three.js 0.170, GSAP 3.13 (ScrollTrigger, SplitText, ScrollToPlugin, CustomEase, Flip) and lottie-web 5.12 (light SVG build). The rig and logo trace are made offline with Blender 5.2 and potrace 1.16 (scripts in `tools/`).

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

One number, the scroll progress through `<main>` (0 at the top, 1 where the footer begins), drives everything. The sequence is laid out in **screens of scroll** (one viewport height each, `LENGTHS` in [`src/scene/sequence.js`](src/scene/sequence.js)); `retime()` turns them into the phases (`PHASES`) for the page's own scroll length, measured on every refresh. The morph and the logo keep their lengths whatever the page; the hero, the turn and the close-up share what is left. The home page's `<main>` is at least 6.4 screens tall (5.4 screens of scroll), the designed length, so every phase runs at its designed pace:

| Phase | Screens | Progress | What happens |
|---|---|---|---|
| hero | 0.2 | 0–0.037 | v2's composition at rest: seen from behind, mask raised high |
| revolve + pose | 2.12 | 0.037–0.43 | the turn (the first revolution with the mask raised, then the pose); twice v3's speed |
| ↳ pose | | 0.21–0.43 | she turns on, a revolution and a half more, to face the viewer; through it the **arm** brings the mask beside the face (cubic, 5–80% of the phase) and the **head** turns away (quad, 35–100%) |
| zoom | 0.28 | 0.43–0.48 | the view closes in on her upper body (sine in-out), until her head, hand and mask, with the logo's that will form on them, fill 45% of the view's height (or 70% of its width, if that is less, as on a phone); twice v3's speed |
| morph | 2.24 | 0.48–0.90 | in the close-up, the statue's surface flows into the 3D logo: mask, hand and face in turn, at her head; then the robes stream into the rest of the mark as the logo grows to its place and the view opens out again; v3's pace |
| logo | 0.56 | 0.90–1 | the stone logo holds in the ring, swaying slowly away and back, with a gentle idle drift; v3's pace |

The turn is one smooth motion across the revolve and pose phases: 2.5 revolutions (900°) through one sine ease, so it never pauses between revolutions, and the pose phase starts exactly where the ease completes the first revolution (`TURN` in `sequence.js`: change `revolutions`, keeping it on a half, or `first`).

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
- over her, the key light leans in and the cursor changes to its grab form;
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
| torso, robes, upper arm, the other arm, plinth | → | the brush strokes, the flames and the crescent |
| (nothing: it comes from the sky) | → | the star beside the mask |

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

### The star from the sky (`src/scene/star.js`)

The four-pointed star beside the mask is extruded on its own (`logo.js` takes the smallest shape of the trace around `star` in `mark-regions.json`; same depth and bevel as the mark) and is not part of the morph. As the robes start to stream (morph 0.36–0.44) it shows in the sky up and to the right of its place, far behind the ring, a few pixels of gold that twinkle like the sky's stars. From 0.44 to 0.95 it comes forward through the ring's opening, turning as it nears, burning gold and cooling to stone, to its place on the logo as the logo stands at that moment, and it lands with a glint (0.9–1). It is a stone star on the turntable plus a glow sprite (additive gold on the dark stage, gold-700 with house lights up), hidden behind the figure while it is behind her. Retune it with `STAR`.

## The pages

| Page | File | What you can do on it |
|---|---|---|
| About us | `about.html` | The follow-spot lights the statement; the skills light one by one as a glow slides along them with the scroll; the courage paragraph slides out from the quote; the values appear one by one. LEARN · CREATE · COLLABORATE · PERFORM · GROW: a held stage with the marble Penrose ring turning and shrinking with the scroll, gold line-work behind it, each word's outline morphing into the next. Copy from the sponsorship document, without the outputs. |
| Core team | `team.html` | Headshots stay stone until the spot (or, on touch, the middle of the screen) finds them; they lean toward the pointer; department filters rearrange the grid (GSAP Flip); choosing someone opens their own introduction, the photo travelling into the panel (a long introduction scrolls inside it). Cards are generated from `content/team.json`. Below, Behind the curtain: a film strip of the team at work that runs sideways as you scroll (a sticky frame, not pinned), the frame in the middle in colour. |
| The publication | `publication.html` | A cover that swings open when it comes into view; drag it, tap it or use the button to close and open it. |
| The production | `production.html` | Five stage lights (written, directed, designed, performed, managed): switch them on, the beams turn toward the pointer, and all five lit sets off a spark. A live countdown to 30 November 2026 (`src/sections/countdown.js`, shared with the home page's act two). A lit doorway into the stage planner. |
| Stage planner | `stage-planner.html` | The school hall in 3D, to plan the production (`src/planner/`, ported from the stand-alone planner, `dramacollective_stagerenders_v1`): stairs, risers, box sets, the LED wall, a lighting rig with RGB spotlights, seating, props and speakers; walk through it and save renders or a design. In the site's palette and type; "The production" in its top bar goes back, through the site's curtain. Its own README is folded in below. |
| Flash plays, Workshops, Social outreach | `flash-plays.html`, `workshops.html`, `outreach.html` | Coming soon: a full-screen three.js house curtain (`src/scene/curtain/CurtainStage.js`): velvet folds in a vertex shader on a sheen material, a marquee whose bulbs spell COMING SOON (instanced, bloomed), a follow-spot on the pointer, footlights. Touch it and it ripples; drag across it and it parts a sliver onto the lit stage. Each page has its own velvet; with house lights up (the light theme) the curtain is a pale rose velvet in a lit house, and the copy and the CSS fallback follow. Description from the sponsorship document. |
| Become a sponsor | `sponsor.html` | The three tiers as tickets, each stub struck in its metal (brushed bronze, silver or gold, matched to the medallion's finishes), with a streak of reflected light and a hot spot that follow the pointer like a lamp held over the page. Pointing at a ticket previews its metal on a 3D medallion of the mark (`src/scene/medallion.js`); choosing one turns it bronze, silver or gold with a full turn and a spark. The medallion still turns when dragged. The tiers, dearest first: Standing ovation (gold), Headliner (silver), Spotlight (bronze). "Apply to be a sponsor" leads to the sponsorship form. |
| Apply now | `apply.html` | The roles (directors, actors, scriptwriters): duties and skills appreciated, then the application form (Fillout, `src/site/fillout.js`). |
| Apply to be a sponsor | `sponsor-apply.html` | A link back to the tiers, the sponsorship form (Fillout), and the President's and Executive President's cards for questions. |

**Shared parts.** The head block, the header, the curtain between pages, the sky and the footer are written into every page by `tools/pages/build.mjs`, between `<!-- site:... -->` markers. Edit them there (or `content/team.json` for the team) and run `npm run pages`. The page list for the Vite build comes from the same file.

**Between pages** (`src/site/transition.js`): a link to another page closes two velvet halves, loads the page in the same tab, and that page parts them. Links that leave the site, open a new tab or jump within the page are left alone; reduced motion navigates plainly.

**Team photos** are cropped from the core team document by `tools/team/crop_photos.py` (crop boxes by eye, 4:5, WebP). Names and roles follow the Canva publication ("publication design", the core team pages). Ayushi Shah's and Karanjot Singh Bagga's photos are cropped from their circles in the Canva publication (pages 6 and 8, exported at 2400 px); Nivaan Garg's is cropped from the photo sent in for the site. A new photo: a 4:5 WebP in `assets/team/`, named in `photo` in `content/team.json`, then `npm run pages`. The film strip's photos (`assets/team/gallery/`) are eight of the meeting photos from the team's Drive folder, 4:3, 960 px.

**Lottie:** the spark (`assets/lottie/spark.json`, made by `tools/lottie/make_spark.py`) plays on a chosen tier and when all five stage lights are on; the CTA flourish is reused on the production page.

QA: `?debug` on the coming-soon and sponsor pages exposes the 3D scene as `window.__stage`.

## Changing the copy

The home page's text is in `index.html`; each inner page's is in its own HTML file. Every section is a `<section>` with an id: hero `#top`, the acts `#about`, `#productions`, `#impact`, `#leadership`, `#support`, and the footer `#contact`.

Each scene also tells the stage how to light and place the statue:

- `data-frame`: where the statue sits, as a fraction of the viewport width (`0.24` = right, `-0.24` = left). `scene--text-right` moves the text column right.
- `data-light`: 0 is the warm spotlight, 1 the cool one.
- `data-key`: the key light level.

Anything marked `data-mask` keeps the constellations clear of it. Act five (`#support`, the last) is the footer's columns: each `[data-dock-col]` column is carried to the footer's `[data-dock-slot]` of the same name as the footer rises (one row on wide screens, two by two on tablets, one column on phones), so its copy is the footer's. Act four's deck is `data-quiet`: the stars show through its cards, but no constellations or cursor glow are drawn there.

The sequence is fitted to the length of `<main>`: longer copy gives the turn more room (the morph keeps its pace). To change the pacing, change `LENGTHS`.

## Images

- **Brand marks**: `assets/brand/mark-gold.png` (the source of the 3D logo and the nav fallback) and `mark-blush.png` (no longer used on the page). The animated nav mark is `assets/lottie/mask-mark.json`. If the mark changes, re-run `trace_logo.ps1`.
- **Fallback still**: `assets/fallback/hero.png` is the hero composition, unchanged from v2.

## Stars, cursor, themes, music, nav

All as in v2:

- **Stars:** a dense field that glows around the cursor and draws constellations.
- **Cursor:** a native star cursor. Over selectable text it stretches into a tall, narrow star (the same star; `cursor.js` checks that a character really is under the pointer). Over the text boxes, where the sky is cleared and the small star is harder to see, the page hides the native cursor and draws the star itself, with a warm glow behind it, as one element (so the glow cannot trail the star), clipped to the box and placed on `pointerrawupdate` with no easing. Drawing the glow into the native cursor image does not work: on Windows its see-through pixels come out as a grey shadow.
- **Footer:** no watermark and no copy of its own (the home page's last act, its columns, docks into it). The footer is layered over the 3D canvas, so it covers the ring, the floor and the shadows exactly at its edge however fast the page moves; the logo meets it as its flat vector, which is layered over the footer and docks into its mark (on phones the vector stays behind the footer until it starts to dock).
- **Vector hand-over:** in the last act (the second half of the logo phase, `vector` in `TRACKS`) the stone logo goes flat into the look of the vector mark (`src/scene/flat.js`, over the track's first 80%) and the vector then replaces it (`src/scene/vectorLogo.js`: the traced `mark.svg` as inline SVG), so what meets the footer is crisp at any size. The stage projects the SVG's corners through its camera every frame and sets them as a CSS transform, so the vector lies exactly on the 3D logo (the logo's sway finishes first, and its idle drift and the lean toward the cursor fade out, so it is square on). Its colour is sampled from the 3D logo as the stage lights it, top and foot, and sampled again after a theme change. The flat logo is drawn in exactly those colours (written after the colour-space conversion, as the canvas shows them), so nothing fades over anything. Once the vector is fully in, the 3D logo stops drawing colour but still casts its shadow and keeps the stars clear of the mark. As the footer rises the vector moves into its slot, turning to the footer mark's colours and losing the bevel's flare on the way, and hands over to that mark once it is exactly on it.
- **Themes:** light and dark, remembered per browser (`dc-theme`).
- **Music:** "the smell of old books, reading, writing and studying (a dark academia playlist)" by Dark Enigmatic, credited in the footer (`src/ui/music.js`): the site's own MP3 (`public/music/the-smell-of-old-books.mp3`), streamed, from a random point on each page load. Whether it is on carries from page to page within a visit (sessionStorage `dc-music`), where the browser allows it to play (if it does not, the visitor's next tap or key starts it); it fades in and out and pauses while the tab is hidden.
- **Nav:** About us, Core team, Our outputs (a dropdown) and Contact us, the current one marked with a star and a gold rule that slides under the link the pointer is on; Apply now and Become a sponsor as buttons. The mark (48 px) and the wordmark (on one line from 1280 px, stacked in two lines below that); below 1100 px the pages fold into the Menu, a full-screen sheet that drops like a curtain. Scrolling down, the bar glides up out of view but for its two buttons, which fly to their own spots on a page that has them (`src/site/flyin.js`).
- **Cursor over the team's intro panel:** the panel is a modal dialog, drawn in the browser's top layer above every z-index, so while it is open the drawn cursor moves into it.

## Performance and fallbacks

- **Loading:** the loader is in the page itself (`index.html`: the satin in raw WebGL at a third of the screen's pixels, the sunburst in SVG on a 75 ms timer), so it runs before any script loads. The 1.81 MB rig is preloaded with the page; three.js and the 48 KB logo trace load lazily behind the loader; the Draco decoder (`public/draco/`, from three's examples, WebAssembly only) is fetched and compiled while the rig downloads. The stage's shaders are compiled with `compileAsync` before the curtain goes up (`Stage.warm`), so the first frame does not stall. `?debug` prints how long each step took. The morph mesh is built in an idle moment after the intro.
- **Fonts:** WOFF2, converted from the design system's TTF/OTF with fontTools (same outlines; 300 KB in all, from 760 KB).
- **Geometry:** the skinned statue has 79,976 vertices and 160,000 triangles. The morph mesh has 550,761 vertices (183,587 independent triangles; about 40 MB of vertex data on the GPU). Only one of the two is drawn at a time.
- **Rendering:**
  - DPR is capped at 2;
  - a frame is rendered only when something changed (while the logo holds, its idle drift keeps rendering);
  - the shadow map is redrawn only when the shape or the turn changes;
  - both canvases pause when the tab is hidden or the footer covers the stage.
- **Static fallback:** no WebGL, a software renderer, Save-Data, 2 cores or fewer, or 2 GB of memory or less all get the still picture (fetched only then), with the star field kept.
- **Reduced motion:** no intro, parallax, ring turn or scrubbed sequence (the hero pose, then the logo in one step), no lean toward the cursor, and no fling.
- **Inner pages:** three.js loads only on the coming-soon and sponsor pages, and only where WebGL runs well (the same low-power check); otherwise a CSS velvet with the sign in type, and the mark masked in the tier's metal. The curtain renders while it is on screen; the medallion only while something moves. Pixel ratio 1.75 on the curtain, 2 on the medallion.
- **Teardown:** `dramaCollective.destroy()` (also on `pagehide`) frees the GPU memory, including the morph mesh, along with ScrollTriggers, SplitTexts, Lotties and listeners.

## Design system extensions

As in v2: theme roles in `tokens.css`, the text grounds behind copy, the icon buttons and the motion confined to the stage. The 3D logo is the statue's own stone, in its average colour.

For the pages: `--z-veil` (the curtain between pages, above the top bar and below the cursor), and `--spot-rgb` / `--spot-lit` (the follow-spot and the stage lamps: gold-300 on the dark stage, gold-600 with house lights up; lit text gold-300 or plum-800). The text ground is reused as `.ground`, its feather limited to the page gutter.

## The stage planner (`stage-planner.html`, `src/planner/`)

The planner from `dramacollective_stagerenders_v1`, now part of the site: every texture, backdrop and model is generated in code. Its styles are `src/styles/planner.css` (the planner's own layout, in the site's palette and type), and it shares the site's three.js and fonts; GSAP drives only the curtain between pages.

- **Hall:** about 18 m wide, 6.5 m high, 20 m from the stage front to the back wall; black pleated curtains, blue tile floor, a 6 × 8 grid of ceiling panel lights. **Stage:** 7 × 4 m, 1 m high.
- **Parts:** stair blocks, risers (1 × 1 × 0.5 m, they snap to the stage edges), an 8 × 4.5 m LED wall (built-in pictures or an upload; its picture lights the stage), box sets of printed flex walls, tables and chairs, lockers, floor spotlights and a lighting rig (RGB, gels, beam, diffusion), general lights with dimmer and colour temperature, haze, column speakers, and the audience in straight or curved rows with aisles.
- **Scenes:** Founder's Day, fashion show runway, talk or seminar, drawing-room drama, school play, concert night and an empty hall.
- **Modes:** Design (orbit, click to select, drag to move) and Walk through (first person, W A S D, number keys for viewpoints).
- **Saving:** Snapshot (PNG at HD, 1440p, 4K or portrait), a `.json` design, or a `.glb` with lights. The current design is kept in the browser.
- **Shortcuts (design):** R / Shift + R rotate, arrows nudge, Page Up / Down raise and lower, Ctrl + D duplicate, Delete remove, Ctrl + Z / Ctrl + Shift + Z undo and redo, F frame the selection, Esc cancel.
- **Before the hall:** the page first shows what the planner asks of the computer (the conditions, `#gate`); only Confirm fetches the planner (`src/planner/app.js`, with three.js) and builds the hall. The confirmation lasts the visit (sessionStorage `dc-planner-ok`). If the planner's settings change (the `QUALITY` table, the 1100 px breakpoint, the snapshot sizes), change the conditions in `stage-planner.html` with them.
- **Address options:** `?scene=founders|runway|seminar|living|school|concert|empty`, `?design=URL`, `?mode=walk` (or `#walk`), `?quality=low|medium|high` (it opens in low, "Quality: fast", unless this asks otherwise or the visitor picked another level earlier in the visit), `?embed`, `?fresh`.

Units are metres; +x across the hall, +y up, +z from the stage toward the audience; the stage front edge is z = 0.
