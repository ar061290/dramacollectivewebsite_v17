# Meet our writers: specification

The brief for `writers.html` (now a "coming soon" page) and the writers' own pages. It is written as
a prompt: what to build, why, and how to tell when it is right. It applies to v14 of the CHIREC
Drama Collective site (`dramacollectivewebsite_v14`: Vite multi-page vanilla JS, three.js 0.170,
GSAP 3.13 with ScrollTrigger and Flip). The owner's words: "use this 3d model. again, no spin, only
slight cursor interaction and reflection, like in the pub page. use the pattern and texture and
material already there, just change the colour: instead of the brown metal, white speckled with
pink, like strawberry cheesecake, more pink than red specks. as you scroll, the pub cover that's in
the model's hand should come near the viewer and open, and there you see the writers, for each
month, structured like the core team page. click a person: the pic and intro pull up, with a link
to their individual page. on the writer's page, the grid and list toggle combo like the main pub
page, with the latest and upcoming releases; the grid not capped at 6, and the list not capped:
it runs its whole length. in the list view, on the left, instead of the model, their pic; on hover,
their intro."

## 1. The statue

- **Source** (gitignored): `tools/writers/source/writer-statue.glb`. A Meshy model, gltfpack
  (KHR_mesh_quantization, KHR_texture_transform, EXT_texture_webp), about 909k triangles, 20 MB.
  It has base colour, metallic-roughness and normal maps (WebP). It is about 1.9 units tall.
- **What it is**: a robed figure in the pose of the Statue of Liberty. Its face is the comedy and
  tragedy masks; it raises a **fountain pen** like a torch (a silver nib on a bronze barrel) and holds
  **a book**, the publication, *The Drama Collective* with the logo, in its left hand against its
  side. It stands on a stepped round plinth. All of it is cast bronze except the nib.
- **Pipeline** (`tools/writers/build-statue.mjs` → `assets/models/writer-statue.glb` and
  `writer-statue.json`): in the style of `tools/masks/build-masks.mjs` (glTF-Transform 4 +
  meshoptimizer + draco3dgltf + sharp).
  - Unpack (dequantize; bake the node transform and the uv transform), and stand it with its base on
    y = 0 and height 2 (the site's statue height, as `thinker.glb`).
  - Weld and simplify to about 250k triangles, keeping the masks' faces, the pen and the book crisp.
  - Base colour 2048 px, so the book's lettering stays legible up close. Normal 2048 or 1024;
    metallic-roughness 1024. WebP, Draco geometry. Budget about 4 MB.
  - Measure, in the model's final space, and store in `writer-statue.json`:
    - the **book's front cover**: its four corners, in order (top-left, top-right, bottom-right,
      bottom-left as seen from the front), its spine edge, and its outward normal;
    - an object-space box around the **book**, and one around the **nib**, for the recolouring
      masks in §2;
    - the masks' centre (as `thinker.js` keeps the Thinker's mask point).
  - Render stills for where WebGL runs poorly: `assets/writers/statue-dark.webp` and
    `statue-light.webp`, from the live scene, at the size the page shows them, as
    `assets/thinker/*.webp` were made.

## 2. Its stone: strawberry cheesecake marble

The bronze becomes **polished white marble flecked and clouded with pink**: creamy white, soft rose
clouds, and sharper pink flecks and veins. More pink than red, like the reference (a white marble
with strawberry pink clouds and a few deeper flecks). Keep the model's **own pattern, texture and
material**: its normal map and its base colour's light and shade (the hammered, cast detail, the
folds' darkening) carry through, and only the colour changes.

- Do it in the shader (`MeshPhysicalMaterial` with `onBeforeCompile`, as `src/scene/thinker.js`
  does), not in the texture. The model's uv atlas is in pieces, so a pattern painted into the
  texture would break at every seam. Instead:
  - **luminance** of the model's base colour gives the stone's detail: bright where the bronze was
    bright, darker in the recesses;
  - a **3D noise in object space** (fbm with domain warping for the clouds, a sharper ridged or
    cellular noise for the flecks and fine veins) gives the pink, seamless all over;
  - colour: cream white `#f8f1ee` to `#fdf9f8`, clouds toward the blush and pinks (`#f3e7e9`,
    `#efc6d0`, `#e8a7b8`), flecks and veins `#d97a98` to `#c96687`. Plum's `#c185ac` may deepen the
    darkest flecks; nothing crimson, nothing lavender.
- **Finish**: stone, not metal (metalness 0). Polished: roughness about 0.25–0.35 from the map,
  clearcoat about 0.5, so it **reflects** the room's soft light and the cursor's gold lamp as the
  publication's statue does.
- **The book stays the publication**. Inside its box, keep the model's own colours, carried toward
  the site's: the cover deep plum (`--plum-800`/`--plum-900`) and the lettering and logo gold
  (`--gold-500`), by its luminance. It reads as *The Drama Collective*, the thing the page opens.
- **The nib stays silver metal** (inside its box, and where the base colour is low in saturation and
  bright): metalness about 0.9, roughness about 0.25.
- The light and dark themes as the publication's statue has them (`src/scene/thinker.js`:
  `STAGE`, the key, rim and hemisphere lights, `day` blend). The marble must read **white and pink**
  in both: never grey, never orange.

## 3. Behaviour of the statue

As the publication's statue, `src/scene/thinker.js` + `src/publication/statue.js`:

- **No spin.** It leans a little after the pointer (yaw and pitch of a few degrees, eased).
- **The cursor's glow** is a small gold lamp held just in front of the stone under the pointer, and
  the polished marble reflects it.
- Lazy where it can be; a still picture where WebGL runs poorly; reduced motion: it stands still.
- One model fetch, Draco decoder `public/draco/`.
- Write it as its own scene class (`src/scene/writerStatue.js`), borrowing from `thinker.js` and
  `masks.js`, not by forking all of `thinker.js`: the Thinker's patina shader and `_PATINA`
  attribute are not used here.

## 4. The page: `writers.html`

1. **The opening** (pinned with ScrollTrigger, about 2–3 screens of scroll):
   - The statue on the stage, among the stars, as the publication's opening (`src/publication/
     hero.js`). There is a heading, "Meet our writers", and a line about who writes for the
     publication: the writers' words to come. Keep it short; the owner will give copy.
   - As the visitor scrolls, **the camera comes to the book**: it moves and turns so the book in the
     statue's hand comes toward the viewer and fills more of the screen. The statue stays still in
     itself; only the view moves.
   - Then **a real cover takes the book's place**: a DOM element with the publication's cover
     (`assets/publication/cover-october-2026.webp`, the October cover) laid exactly over the book's
     projected front cover (the four corners from `writer-statue.json`, projected each frame,
     mapped with a CSS `matrix3d` homography). The 3D book and the DOM cover cross over without a
     visible jump.
   - The cover comes on to fill the screen's middle and **opens**: the front cover swings open on
     its spine (CSS 3D, `perspective`, `transform-origin` at the spine, `backface-visibility`, the
     inside of the cover a plum paper). Behind it are **the pages**: the writers.
   - Then the pin lets go and the writers' months scroll on as ordinary page content. Scrolling back
     up closes the book and returns the camera to the statue.
   - Reduced motion: no pin and no camera move. The statue, then the writers, with the cover shown
     open as a still.
2. **The writers, by month** (inside the opened book, then as the page):
   - A section per issue: **October 2026**, **November 2026**, **December 2026**, then
     **Date to be announced**. Each holds the writers with a piece in it, published or upcoming, from
     `src/publication/pieces-data.js`. A writer with pieces in two months appears in both.
   - **Structured like the core team page** (`team.html`, `src/pages/team.js`, the `.team-grid`
     and `.member` cards, `src/styles/pages.css`): a grid of cards, each with the writer's photo
     (stone until the follow-spot finds it, leaning toward the pointer, as on Core team), their name,
     and under it the title(s) of their piece(s) in that month. The month is a heading like the team
     page's department headings. If a filter by month makes sense like the team page's departments,
     add it (the Flip rearrange).
   - **Choosing a writer** opens their introduction in the spotlight panel, the photo travelling from
     the card into it, exactly as Core team does. The panel holds their photo, name, intro, their
     pieces (linked to the pieces' pages where published), and a **button to their own page**
     ("Read more from <first name>" or similar), `writer-<slug>.html`.
3. **Writers' data**: a new `content/writers.json` with, per writer: `id`, `name` (as printed on the
   pieces), `slug`, `photo` (a file in `assets/writers/` or `assets/team/`), `intro` (paragraphs),
   and `team` (the `content/team.json` id, where they are on the core team: their photo and intro
   come from there unless their own are given).
   - Names: the pieces use "Kodela Gautam" and team.json "Gautam Kodela" (Head of Publication): the
     same person.
   - Writers without a photo or intro yet (Anika Megha Kruthiventi, Kathya Yaratapalli, Mehek Jain,
     Nisha Sriram, Venkatesh Kalasamudram) get a placeholder: the brand mark on a tile in their
     tone (the list's tiles, `src/publication/cards.js`) and "Their introduction is on its way".
     They are flagged in a comment and listed in the report, so the owner can send photos and
     intros.
4. **The page is written by `tools/pages/build.mjs`** like the other pages: the month sections and
   cards are static markup between `<!-- site:writers -->` markers, written from `writers.json` and
   `pieces-data.js`, for visitors without scripts. `src/pages/writers.js` adds the behaviour.

## 5. A writer's page: `writer-<slug>.html` (one per writer, written by `build.mjs`)

- The publication's top bar (hidden until it peeks), its glow cursor and its bottom banner, as the
  reading pages (`page--reading` conventions, `src/pages/reading.js`).
- **A head**: their photo, name, and intro, with a link back to Meet our writers.
- **Their pieces**: the publication's pieces section (`src/publication/pieces.js`, `cards.js`,
  `publication-pieces.css`), for this writer's pieces only. The same toggle (Upcoming / Dropped),
  the same morphing heading ("Latest pieces" ⇄ "Upcoming pieces", `src/type/morphHeading.js` with
  the same outlines), and the filter by form.
  - **Dropped (grid)**: every one of their published pieces, **no cap of 6**, and no "All the pieces"
    button (or one to pieces.html under the grid; decide).
  - **Upcoming (list)**: every one of their upcoming pieces, **no cap**. The list runs its whole
    length; it is not an inner scroller and does not fade out at its foot. The page scrolls.
  - **In the list view, on the left, their photo** instead of the statue under the stage light,
    in the same stage treatment. **On hover (and focus) of the photo, their intro** shows over it
    or beside it.
  - The default mode is Dropped if they have published pieces, else Upcoming. With nothing in a
    mode, show the existing empty message.
- Refactor `pieces.js` so the publication and the writer pages share it: options for the items, the
  cap, the list's mode (still with a fade, as on the publication; or full-length here), and what
  stands beside the list (the statue, or the writer's photo). The publication page must not change
  in any way (re-check it: grid of 6 and All the pieces, 3 on phones; the static list with its fade;
  the statue; Remind me; the filter; the morph).
- The reading pages' bylines may link to the writer's page. (A small extra; do it if it is clean.)

## 6. How to tell it is right

1. The statue renders white marble with pink clouds and flecks, polished, reflecting the cursor's
   lamp, in both themes. The book reads plum and gold; the nib silver. It leans, never spins.
2. Scrolling down: the camera comes to the book; the DOM cover lands exactly on the 3D book (no jump
   or slide at the hand-over: corners within about 2 px); it comes forward and opens on its spine;
   the writers are inside; the pin releases. Scrolling up reverses all of it.
3. The months' grids look and behave like Core team (spot, lean, panel with the travelling photo),
   with a working link to each writer's page.
4. Each writer's page shows all their pieces: the grid uncapped; the list full-length, with their
   photo on the left and their intro on hover or focus. The toggle, the morph and the filter work.
   The publication page is unchanged.
5. Reduced motion, no-WebGL fallback (the stills), phones (390 × 844, touch), laptop (1440 × 900),
   dark and light; no console errors, no sideways scroll; performance smooth while pinned.
