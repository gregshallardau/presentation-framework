# Deck studio

A browser editor for this framework's decks. It is the same studio as
md-doc-pipeline's browser editor (`md-doc-edit`): the same layout, Monaco
editor, revision-safe saves, drafts, command palette and Git panel. The
preview pane is different. Instead of a rendered PDF, it shows **the real
deck**, running on the same Vite dev server as `npm start`, and it includes
the edits you haven't saved yet.

```
npm run edit        # http://127.0.0.1:8000/__editor/  (opens in your browser)
```

Everything runs on your machine. The editor only answers on `localhost`, and
nothing is fetched from the internet.

## Launch

`npm run edit` starts Vite with `vite.config.editor.js`. That is the dev
server `npm start` uses, plus the `deck-editor` plugin
(`editor/server/plugin.js`). The terminal prints two URLs:

- **Local** (`/`) is the deck itself, as `npm start` serves it.
- **Editor** (`/__editor/`) is the studio.

The port follows `npm start`: it is 8000 unless you pass
`npm run edit --port=9000`. The server binds to `127.0.0.1`. `npm start` and
`npm run build:deck` never load the editor.

## Editing and preview

- **Slides panel** (left rail, first icon): every file in `slides/` in Reveal
  order, numbered as Reveal numbers them (`3`, `4.1`, `4.2` …). It shows
  vertical stacks, sub-slide counts, speaker notes, problems and unsaved
  changes. Click a slide to open it.
- **Editor**: Monaco with Reveal-aware Markdown. That covers the `--` vertical
  fence, `Note:` speaker notes and `<!-- .slide: -->` / `<!-- .element: -->`
  directives. Autocomplete (`Ctrl Space`) offers:
  - deck.css and Reveal classes inside `class="…"`
  - `<deck-*>` components and their attributes
  - Reveal's `data-*` attributes
  - semantic custom properties inside `var(--…)`
  - `deck.config.js` keys

  Hovering a `<deck-*>` tag shows the component's description. The toolbar
  inserts fragments, a vertical sub-slide, speaker notes, slide attributes,
  components and links to other slides.
- **Live preview**: the real deck in an iframe. Slide edits you haven't saved
  are sent to the dev server under a per-tab preview id. The deck is then
  assembled from them (`/?__preview=<id>`) and reloads on the same slide,
  about 0.6 s after you stop typing (you can change this in Settings).
  - Saved files reload through Vite as usual, so CSS, components and
    `deck.config.js` changes show **on save**.
  - **Follow cursor** moves the preview to the slide, or the `--` sub-slide,
    under the cursor. Moving through the preview opens the matching file.
  - The toolbar has previous/next, the overview, speaker view, a skin
    preview, the print/PDF view and a reload button.
- **Animate** and **Morphs** open the animation timeline and the auto-animate
  highlight (see [Animation](#animation)).
- **Present** (the ↗ button) opens the deck in its own window. That window
  follows the editor too.

## Slide management

Every structural change goes through `scripts/lib/slide-plan.js`, the planner
behind `npm run make:slide`, so the editor and the CLI number slides the same
way (see `slides/README.md`). Tracked files move with `git mv`, so their
history follows them.

| Do this | How |
|---|---|
| Add a slide | `+` in the Slides heading, or *Add a slide*. It lands after the open slide. |
| Insert before or after a slide, or below it in a stack | The slide's `…` menu |
| Reorder | Drag a slide onto the **top or bottom edge** of another |
| Add a slide to a stack | Drag it onto the **middle** of a slide in that stack |
| Move a whole stack | Drag its *Stack* header |
| Take a slide out of a stack | `…` → *Move out of the stack* |
| Duplicate | `…` → *Duplicate* (inside a stack, the copy joins the stack) |
| Rename a slug | `…` → *Rename slug*. This also updates the slide's `id`/`data-slug` and every `#/<slug>` jump link in `slides/`. |
| Delete | `…` → *Delete*. The file is moved to `.editor-trash/`, never removed. |
| Renumber the whole deck | `…` beside the slide count → *Renumber the deck* |

Unsaved slide edits are saved first, because these actions rename files.

## Animation

Deck studio edits the motion Reveal already has: fragments, slide transitions
and auto-animate. It doesn't add an animation runtime, and everything it writes
is ordinary Reveal markup:

- in an HTML slide, `class="fragment fade-up"`, `data-fragment-index`,
  `data-transition` and `data-auto-animate*` on the tags themselves
- in a Markdown slide, the same attributes in `<!-- .element: … -->` and
  `<!-- .slide: … -->` comments

Data-driven motion, such as a D3 chart's transitions, lives inside the
`<deck-*>` D3 components (see the artefact-builder skill). You place those
from the Components inspector.

Each edit goes into the open buffer as one undoable change. The preview shows
it straight away, and nothing reaches disk until you save. Use
**Save slides** in the timeline to save every changed slide file at once.

### Timeline

**Animate** in the preview toolbar opens the timeline for the slide on screen.

| Row | What it holds |
|---|---|
| **Arrive** | The slide's transition and speed, plus auto-animate (duration, easing, restart). **Replay arrival** runs the transition from the previous slide again. **Make next rung** copies the slide right after itself with auto-animate on both, ready for you to change the copy. |
| **Morphs** | The elements Reveal will tween in from the previous slide. The bar under each one shows its delay and duration. |
| **Step 1…n** | The slide's fragments in play order, one row per step. Each element is a chip with its effect (fade-up, grow, highlight-red, …). |

- **Add an element:** click **Add element**, then click the element in the
  preview. It becomes a new last step.
- **Reorder:** drag a chip to another step, or onto *New step*. Drag a step
  header to reorder whole steps. Reordering writes an explicit
  `data-fragment-index` on every fragment of the slide.
- **Preview a step:** click a step header to show the slide at that step.
  **Play steps** runs through them all.
- **Edit one element:** pick it (a chip, or **Pick in the preview**). The
  panel on the right sets its effect and step, or stops animating it.

### Auto-animate

**Morphs** in the preview toolbar (or *Show morphs* in the timeline) outlines
what auto-animate will do between the slide on screen and its neighbours:

- **blue:** morphs in from the previous slide
- **violet:** morphs on to the next slide
- **dashed green:** fades in, because nothing matched
- **dashed orange:** has no match on the next slide

The pairs come from Reveal's own matcher (`AutoAnimate` in
`vendor/reveal.js/js/controllers/autoanimate.js`), run on the live deck. So
the outlines include Reveal's implicit matches: same-text headings,
paragraphs and list items, same-`src` images, and code blocks.

For a picked element you can:

- **Link to next slide…:** click the matching element on the next slide.
  Both get the same `data-id`, and both slides get `data-auto-animate` if they
  lack it. Reveal only pairs elements of the same type, so linking an `<h2>`
  to an `<h3>` warns you that they will cross-fade rather than morph.
- **Unlink:** removes a `data-id` pair. A pair Reveal made by matching
  identical text can't be unlinked; change the text on one side instead.
- **Duration, Delay, Easing:** sets this element's
  `data-auto-animate-duration` / `-delay` / `-easing`, overriding the
  slide's values.

### How the preview maps to source

In an editor preview (never in `npm start` or a build), every element of an
HTML slide carries `data-studio-src="<file>:<offset>"`, the position of its
tag in the text you are editing. A click in the preview therefore names the
exact tag to change. Markdown elements are matched to their source line by
text.

Edits wait until the preview has caught up with the previous edit, so a
quick series of changes never edits stale positions.

**Markdown caveat:** Reveal attaches an `.element` comment to the element
just before it. So the editor puts new comments at the start of list items
and headings, where they always reach the whole block. In a paragraph with
inline formatting (bold, a link…), the comment would land on the last
formatted word instead, and the inspector warns you. Use a list item or an
HTML slide for those.

## Inspector

The sliders button above the preview opens the inspector:

- **Slide**: the open slide's file, slug, position and speaker notes.
- **Deck**: a form for `deck.config.js`'s Reveal options (size, margin,
  transition, slide numbers, controls…). Each change rewrites that one line and
  keeps every comment. Structured options such as `chrome` are edited in the
  source.
- **Theme**: preview any `[data-theme]` skin from
  `src/styles/vars/semantic.css`, then make it the deck default. That sets
  `theme` in `deck.config.js`. The tab also shows the skin's resolved colours
  and fonts, read from the live preview.
- **Components**: every `<deck-*>` in `components/` with its attributes. One
  click inserts a tag at the cursor. Below that is the deck.css class list.

## Problems

The Problems panel and the status bar run the checks behind
`npm run lint:slides` and `npm run check:vocab` (`scripts/lib/lint.js`), and
they include unsaved edits. Unknown classes, unregistered `<deck-*>` tags,
tier-1 custom properties in slides and deck.css / shared-styles.js drift show
up as warnings in the editor and as counts in the Slides panel.

## Saves and recovery

These work exactly as in md-doc's editor:

- Every save carries the revision (sha256) the editor last read. If the file
  changed on disk in the meantime, the save stops and a review dialog
  compares your draft with the disk version.
- Before a file is replaced, its previous text is kept in
  `.editor-history/<path>/<sha>.txt` (the newest 20 per file). Writes are
  atomic: the file is written to a temp file, then renamed into place.
- Unsaved drafts are kept in the browser (localStorage) and offered back if
  the tab closes.
- Changes made outside the editor (another editor, `git checkout`, an agent)
  are picked up within a second. Clean files reload; changed ones are left
  alone.

`.editor-history/` and `.editor-trash/` are git-ignored.

## Source control

The Git panel shows what changed, with diffs. From it you can stage, unstage,
commit, discard working changes (the discarded text goes to
`.editor-history/` first), create a branch and fast-forward pull. Git runs
without a shell. A commit is refused while files outside the deck are
staged.

## Build

Use **Build** in the header:

- **Build the deck** runs `npm run build:deck` as a job and streams its log
  into the diagnostics drawer.
- **Preview the last build** serves `deck-dist/` with `vite preview` on a
  local port.
- **Print / save as PDF** opens Reveal's `?print-pdf` view.

Builds use saved files only.

## Service APIs

All routes are under `/__editor/api`. Requests must use a loopback `Host`.
Writes (`POST`/`PUT`) must be same-origin and carry `X-Editor-Token` from
`/api/capabilities`. Errors return `{ detail }`, as md-doc's editor does.

| Route | Purpose |
|---|---|
| `GET /api/capabilities` | Session token, deck name and folder, Git availability |
| `GET /api/tree` | Editable files, folders first (no `node_modules`, `vendor`, output or dot-folders) |
| `GET /api/file?path=` | `{ path, content, type, revision }` |
| `PUT /api/file` | `{ path, content, revision }`. A stale revision gives 409 with the disk `content`/`revision`. |
| `POST /api/files/action` | `create` / `rename` / `trash` |
| `GET /api/changes` | Change signature, polled each second |
| `GET /api/search?q=` | Text search across editable files |
| `POST /api/deck` | Deck model: `{ slides: [{ file, h, v, title, subslides… }] }`, using unsaved `buffers` |
| `POST /api/slides/action` | `insert` / `duplicate` / `delete` / `move` / `rename-slug` / `rebalance` |
| `POST /api/preview` | `{ id, buffers }`. The unsaved slide buffers that `/?__preview=<id>` assembles from. |
| `GET` / `POST /api/config` | Read `deck.config.js`, or set one `{ key, value, revision }` |
| `GET /api/catalog` | Skins, components, deck.css classes, semantic properties |
| `POST /api/lint` | Problems for the deck plus unsaved `buffers` |
| `GET /api/git/status`, `GET /api/git/diff`, `POST /api/git/action` | Source control |
| `POST /api/build`, `GET` / `DELETE /api/jobs/:id`, `POST /api/build/preview` | Build jobs and the build preview server |

## Code layout

```
vite.config.editor.js     npm run edit: slides({ overlay }) + deckEditor({ overlay })
editor/server/            the API (Node, no extra dependencies)
  plugin.js               routes, security, static files, Monaco
  files.js deck.js slide-actions.js overlay.js annotate.js config.js catalog.js lint.js git.js jobs.js
editor/static/            the app: index.html, editor.js, tokenizers.js, editor.css
  animate.js              animation timeline + auto-animate tools
  probe.js                inside the preview: picking, outlines, steps, Reveal's auto-animate pairs
  source-edit.js          reads/writes Reveal attributes in HTML tags and Markdown comments
editor/tests/             node:test suites + browser/smoke.mjs
```

Monaco comes from the `monaco-editor` dev dependency, pinned to md-doc's
version (0.52.2) and loaded through its AMD loader. Nothing is bundled.

When a new framework-level `deck.config.js` key appears, add it to `SCHEMA` in
`editor/server/config.js`. That list drives both the Deck form and
autocomplete.

## Verification

```
npm run test:editor           # API, planner, deck model, config, animation markup edits, lint parity, Git, build
npm run test:editor:browser   # drives the editor in Chromium (playwright-core)
```

The browser test needs a Chromium for `playwright-core`. Set `CHROMIUM_PATH`
to its executable, or run `npx playwright-core install chromium` once. It
prints a folder of step-by-step screenshots.
