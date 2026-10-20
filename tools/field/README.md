# Field measurements: the receiver

`src/util/field.js` sends one small report per sampled visit, as the page is put away: the site's own marks
(curtain up, curtain parted, intro done, morph ready…), the paint timings, long tasks, layout shift, WebGL
context losses, whether the tab had been discarded, and the device's class (screen size, pixel ratio, cores,
memory, touch, reduced motion, network type, Save-Data). No names, no addresses, no page content: a few
hundred bytes. It is off until the pages are built with an endpoint.

The endpoint suggested here is free and stays in the owner's own Google account: a Google Sheet whose
Apps Script appends each report as a row.

## Setting it up (once, about five minutes)

1. Make a new Google Sheet (any name, e.g. "Drama Collective field data").
2. In it: **Extensions → Apps Script**. Replace the editor's contents with `receiver.gs` from this folder,
   and save.
3. **Deploy → New deployment**, type **Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Deploy,
   allow the permissions it asks for (it writes to this one sheet), and copy the **Web app URL**
   (`https://script.google.com/macros/s/…/exec`).
4. On GitHub, in the site's repository: **Settings → Secrets and variables → Actions → Variables → New
   repository variable**: name `FIELD_ENDPOINT`, value the Web app URL. Optionally `FIELD_SAMPLE`, the
   share of visits that report (default `0.1`, one in ten).
5. The next push to `main` (or **Actions → Build and deploy to GitHub Pages → Run workflow**) builds the
   pages with the endpoint. Rows appear in the sheet's `visits` tab as visitors leave pages.

**Set up (21 October 2026):** the owner's receiver is deployed, and its address is written into
`.github/workflows/pages.yml` as the endpoint the deploy uses when no `FIELD_ENDPOINT` variable is set (a
variable, if set, takes its place). Only that deploy writes the endpoint into the pages: a build on one's
own machine (the lab's) carries none, so lab runs never add rows.

To stop: archive the Apps Script deployment (the pages keep sending, to an address that no longer answers),
or take the address out of the workflow and deploy again (the pages then carry no endpoint).

## Reading it

Each row is one visit to one page. The columns that matter first: `curtain up ms` (home) and
`curtain parted ms` (other pages), by `width` / `pixel ratio` / `cores` / `network`, and `long task ms`.
These are the lab's numbers as visitors' own devices see them; the lab's benches (`tools/perf/`) are
re-aimed where the field disagrees with them.
