# The performance lab (`tools/perf/`)

Benchmarks of the Drama Collective site's own user journeys, run in the installed Chrome (headless, on the real GPU: on the owner's laptop that is an Intel UHD 620 through ANGLE/Direct3D 11) against the built site served the way GitHub Pages serves it (`Cache-Control: max-age=600`, gzip/brotli for text, byte ranges for the music). Nothing to install: Node 24 and Chrome.

```bash
npm run build                                   # the lab measures dist/
node tools/perf/run.mjs                         # every bench, laptop profile, 3 runs each
node tools/perf/run.mjs --bench idle,scroll --page publication,piece --device phone --runs 5
node tools/perf/run.mjs --bench page-boot --page all --calls          # with V8 call counts (slower; never mix with wall-clock claims)
node tools/perf/run.mjs --src                   # the unbundled source tree, as the live site is served today
node tools/perf/run.mjs --label after-sky       # names the results file (tools/perf/results/<stamp>-<label>.json)
node tools/perf/compare.mjs results/A.json results/B.json [--bench idle] [--page piece]
node tools/perf/gate.mjs                        # the deterministic counters against tools/perf/baselines/gate.json
node tools/perf/gate.mjs --ratchet              # lock a win in: today's counters become the ceiling
node tools/perf/correlate.mjs results/*.json    # which counters track wall-clock time (Spearman's rho)
node tools/perf/visual.mjs --out shots/before   # screenshots of every page at four viewports, time held still
node tools/perf/visual.mjs --out shots/after --compare shots/before   # pixel-by-pixel against the earlier set
node tools/perf/run.mjs --bench home-load --net 4g --h2   # HTTP/2 like GitHub Pages: use --h2 for every run with a network profile
```

Devices: `laptop` (1366×768, no throttling), `laptop-slow` (CPU 4× slower), `phone` (390×844, DPR 3, touch, CPU 4× slower; the WebGL gate lets it through, as on most real phones). Networks: `none`, `4g` (9 Mbps, 170 ms), `slow4g` (1.6 Mbps, 150 ms), `3g`.

## The benches

Each is a journey a visitor actually makes. What it measures, and why that is what the visitor feels:

| Bench | Journey | Wall clock (the truth, noisy) | Deterministic counters (the gate) |
|---|---|---|---|
| `home-load` | First visit to the home page, to the curtain lifting, the intro's end and the morph mesh | the site's own marks: `boot`, `stage-code`, `statue-loaded`, `fonts-and-shaders`, `curtain-up`, `intro-done`, `morph-ready`; FCP/LCP; long tasks and their total | requests, bytes, style recalcs, layouts, DOM mutations, canvases, V8 calls |
| `page-boot` | Any page, from navigation to its curtain parting (`parted`) | `boot`, `fonts`, `setup`, `parted`; FCP; long tasks | the same |
| `idle` | Four seconds of looking at the page, pointer off it | frames and their lengths, main-thread busy share, script ms/s | recalcs/s, layouts/s, mutations/s, long tasks |
| `scroll` | Half a screen every 250 ms to the bottom (touch flicks on the phone), then the scrubbed sequences settling | frame lengths (p95, max, over 33 ms and 100 ms), busy share | recalcs, layouts, mutations per screen; long tasks |
| `pointer` | A 3 s figure-of-eight sweep at 120 Hz: the cursor star, the sky's glow, the tilt, the lamps, the statues' lean | frames, busy share | recalcs/s, layouts/s, mutations/s |
| `theme` | The house-lights switch: the circle reveal, every canvas changing its light, the earring dropping | time to the flip, frames during it | requests and bytes it triggers, recalcs, layouts |
| `nav` | A link through the curtain: click → curtain closes → next page's curtain parts | click→navigation, click→`parted` | requests, bytes, cached requests |
| `recalc` | The selectors' bill: one class toggled 200× on a leaf, on `<html>`, on `<body>`, on a link | style-recalc ms per toggle | recalcs per toggle, DOM nodes, layout objects |
| `memory` | What a page holds once it is up | heap after GC | DOM nodes, listeners, canvases, WebGL contexts, geometries, textures, programs |

Wall-clock numbers are the median of the runs with their spread (median absolute deviation); the gate never reads them. The counters are what `gate.mjs` compares, with a tolerance per counter; `correlate.mjs` is how a counter earns (or loses) its place in the gate: a counter that does not move with wall-clock time across CPU rates, devices and versions is thrown out rather than climbed.

## Forensics (`tools/perf/forensics/`)

When a bench moves and the reason is not obvious, these ask the page itself. Each runs against `dist/` unless given a root; the ones that compare two builds take `--before <dist of the earlier build>` (and `--after <dist>`).

- `smoke.mjs [dist]`: every page boots, says it is ready, throws nothing and 404s nothing; the home page's morph comes from the worker and its programs are all compiled before the first frame.
- `programs.mjs [dist]`: the home stage's shader programs after the curtain, with the fields in which two programs of the same material differ (how the shadow-pass and silhouette stand-ins were keyed).
- `morph-programs.mjs [dist]`: whether anything compiles when the morph first reaches the screen, after `warmMorph`.
- `statue-attrs.mjs [dist]`: what the statue's programs depend on (geometry attributes, material maps and sides, lights, shadows), for stand-ins that must key the same.
- `profile-boot.mjs [device] [dist]`: a sampled CPU profile of the home page's boot to curtain-up, then what an idle frame costs.
- `attribute-boot.mjs pages [dist]`, `attribute-idle.mjs pages [dist]`: who mutates the DOM (and forces style and layout) during boot, and every frame while the page is still.
- `dom-diff.mjs page --before <dist>`: which elements differ in number between two builds once the page has settled.
- `nodes.mjs page --before <dist>`, `detached.mjs …`, `documents.mjs …`: where the `Nodes` counter's nodes live (in the document, detached but reachable, in other documents), for when `memory` moves. (The speculation-rules script accounts for ~170 nodes of Chrome's own bookkeeping on link-heavy pages; nothing is fetched until a link is hovered.)
- `pixel-forensics.mjs a.png b.png`: the worst-differing pixels of two shots and their colours.
- `program-timeline.mjs [dist]`: every shader program of the home stage over a visit (statue loaded, curtain, intro, morph warm, the scroll to the foot), when each appeared, which object and material own it, and in which key fields a late one differs from its twin.
- `idle-cost.mjs pages --device phone [--css "…"] [--query ?flags=x]`: what one thing costs a still page: the page measured, one CSS override applied (by default the music bars' animation off), measured again.
- `idle-loops.mjs pages`: the callbacks that keep a still page's thread awake (animation frames, timers, events), by function and source line.
- `idle-calls.mjs pages`: every function called over and over on a still page, with V8's exact call counts and the source it starts at.
- `forced-style.mjs pages [--why]`: every style recalculation and layout on a still page, by the script that forced it (or the frame's own rendering), and with `--why` which elements were invalidated and why.
- `compositor.mjs page`: Chrome's reasons for running an animation on the page's thread rather than the compositor.
- `logpoint.mjs page --script flyin --at 16:20971 [--expr …]`: who calls a function (its stack, or any expression), without pausing the page; the line:column comes from idle-calls or idle-loops.
- `failsafe.mjs [dist]`: each way a page can fail to start, caused on purpose (its script blocked, a start that throws, a script that throws as it loads, a statue that stops arriving), and what a visitor would see.
- `music.mjs [dist]`: the music's start where the browser allows it and where it refuses: when the file and the media controls' artwork are fetched against the curtain, the button before and after, a tap.
- `phone-tier.mjs [dist]`: the phone tier off and on, on a phone, a laptop and a touch tablet: the pixel budget, the morph waiting for a scroll, the stage's context let go in a hidden tab and back.
- `frame-order.mjs page [--device phone] [--js "<override>"]`: through the scroll bench's scroll, each frame's animation-frame callbacks in the order they ran, the scroll listeners before them, the style recalculations and layouts each one forced (with the function and the number of elements), and what the frame's own rendering still had to do: a recalculation forced and then written over again in the same frame is work done twice; one in the last callback is only work done early.
- `scroll-invalidations.mjs page [--device phone]`: what made style and layout dirty during a scroll, when (in a callback, in a scroll listener, or between them: an animation, the engine) and from which script.
- `boot-layout.mjs page [--device phone] [--after 3]`: every style recalculation and layout from the navigation (after a warm-up load) to some seconds after the curtain, grouped by the script that forced it or the frame's own rendering.
- `after-curtain.mjs page --before <dist> [--runs 5] [--secs 5]`: two builds, loaded alternately, from the curtain parting to some seconds after: main-thread time, style, layout, long tasks.
- `profile.mjs page [--scroll | --boot] [--secs n] [--save file.cpuprofile]`: a function profile (self and total time) through the scroll bench's scroll, a still page, or a load (`--boot`, after a warm-up load); `--save` writes Chrome's profile for DevTools.
- `idle-breakdown.mjs page [--device phone] [--secs 2] [--js "<override>"]`: a still page's main thread by the browser's own steps (script, style, layout, pre-paint, layering, commit), as self time, with counts.
- `scroll-ab.mjs page --js "<override>"`: prices one piece of per-frame work by switching it off in the page (the override may look wrong: it prices, it does not fix).
- `long-tasks.mjs page [--scroll] [--device phone]`: every task over 50 ms through the boot and the scroll bench's own scroll, with the script that ran in it, and totals by function.

## Measuring without disturbing

- **Both builds back to back, in short runs.** A number from another hour is no comparison: the graphics driver's shader cache, the owner's own browser and other programs on the machine move wall-clock times by seconds. Runs over ten minutes are also the ones the system stops when memory is short.
- **Nothing of the lab's in a still page.** The idle bench runs no in-page frame counter: a `requestAnimationFrame` loop keeps a page producing frames, and in each frame Chrome refreshes the style of every running animation, composited or not, so the counter added the very work being measured. Jank on a still page comes from the browser's long-animation-frame entries, observed passively. Each page waits until it has settled (no long task for a second, at most six). The scroll and pointer benches keep their counter, since those journeys make frames anyway.
- **A finger really scrolls.** `Input.synthesizeScrollGesture` with a touch source delivers the touches but does not scroll a page in headless Chrome; the phone's scroll drags with touch events (`Page.touchDrag`), and the bench reports the distance actually scrolled.
- **The music plays in every run** (the lab's Chrome allows autoplay), so the benches measure a visit with the music on.
- **The pixel guardrail lets a page settle** before freezing it (no long task for a second, no embedded form still loading and its frame's height unchanged for 1.5 s, at most 15 s): a statue's fade or a form's arrival caught at different moments in two builds is not a difference between them. The freeze holds the writer statue too (the write page is shot with `?debug`, which only exposes it): its eased view, lamp and glow brought to their targets, its resolution its own, one frame drawn.
- **What the guardrail still sees between two shots of one build** (at `--threshold 0`; at the default threshold 8 they are identical): one team photo filtered a little differently at 390 px (at most 5 of 255: Chrome's raster of a scaled image), the write page's statue (at most 1 of 255), now and then the Fillout form, a page of Fillout's own in a frame (its text), and once a 4-pixel dash in the sky's canvas that was never seen again. Count differences at `--threshold 0` when a claim is about every pixel, and shoot twice before calling a difference the build's.

## How a round goes

1. `npm run build`, then `node tools/perf/run.mjs --label before-<change>` (and `visual.mjs --out shots/before`).
2. Make the change; build; `run.mjs --label after-<change>`; `compare.mjs`; `visual.mjs --compare`.
3. Anything user-visible goes behind a flag; the rest ships as its own commit, with its before/after in the message.
4. After it is live and the field agrees, `gate.mjs --ratchet` locks the counters in.

The site's marks come from `src/util/perf.js` (`performance.mark('dc:<name>')`), set in `src/main.js` and `src/site/boot.js`; the home page's `?debug` still prints them. Results live in `tools/perf/results/`, baselines in `tools/perf/baselines/`, screenshots in `tools/perf/shots/` (not committed).

## Comparing two versions of the site

The lab measures whatever `--root` points at, so two builds can be compared like for like:

```bash
git worktree add ../dc-before <commit>          # the earlier version, anywhere on disk
# give it node_modules (a junction on Windows: New-Item -ItemType Junction -Path ../dc-before/node_modules -Target ./node_modules)
(cd ../dc-before && node node_modules/vite/bin/vite.js build)
node tools/perf/run.mjs --root ../dc-before/dist --label before     # absolute or relative paths both work
node tools/perf/run.mjs --label after
node tools/perf/compare.mjs tools/perf/results/<before>.json tools/perf/results/<after>.json
node tools/perf/visual.mjs --root ../dc-before/dist --out tools/perf/shots/before
node tools/perf/visual.mjs --out tools/perf/shots/after --compare tools/perf/shots/before
```

Versions before v18 have no `dc:` marks: the benches wait for them, so an older tree needs `src/util/perf.js` and the `mark()` calls in `src/main.js` and `src/site/boot.js` copied in before it is built (that is how the v17 baseline in `results/` was measured).

Two things to know about the pixel comparison: the sky is drawn at one fixed instant on both sides, the Lotties and the publication banner's rolling line are hidden (the line keeps its own time, a Web Animation now and a GSAP tween before), so a page's stars differ only where the drawing itself changed; and the coming-soon curtain is held at one instant through its `?debug` handle. Anything else that moves on its own clock (the rolling banner's phase, a statue still easing) shows up as a difference box, which `diff-report.json` records, so read the box before reading the count.

