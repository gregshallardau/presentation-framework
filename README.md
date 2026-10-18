# Presentation Framework

A personal presentation framework built **on** reveal.js 6 - not wrapped around it.
Reveal.js is the base; the only daily command is `npm start` (Reveal's own Vite dev
server). GSAP, D3, Alpine, custom-property theming and a multi-file slide loader all
ride that one pipeline invisibly.

## Daily workflow

```
npm start          # Reveal's Vite dev server on http://localhost:8000  (the only command)
npm run edit       # the same server + deck studio, a browser editor at /__editor/
npm run build:deck # static export of the current deck -> deck-dist/  (for publishing)
```

**Deck studio** (`npm run edit`) is an optional browser editor for slides: Monaco on
the left, the real deck live beside it (unsaved edits included), a drag-to-reorder
slide list, and inspectors for `deck.config.js`, skins and components. It follows
md-doc-pipeline's browser editor. See [`editor/README.md`](editor/README.md).

`npm run build` (Reveal's own full build, regenerates `vendor/reveal.js/dist/`)
still works - run it after merging an upstream update.

## Architecture

- **Base:** reveal.js 6.0.1, kept intact and isolated under `vendor/reveal.js/`
  (`js/`, `css/`, `plugin/`, `dist/`, `test/`, `examples/`, build `scripts/`) -
  the vendored library, separate from this framework's own layer (`src/`) and
  from deck content (`slides/`, `components/`, `deck.css`). Upstream is the git
  remote `upstream`; `git fetch upstream && git merge upstream/<tag>` won't merge
  cleanly any more (upstream's own layout still has `js/`/`css/`/`plugin/`/... at
  its root) - see `docs/framework-conventions.md` section 1 for the resolution
  procedure.
- **Entry:** `src/main.js` - the single module (styles -> component registry ->
  Reveal + Notes + Markdown -> GSAP / Alpine). `index.html` carries no `<link>`s;
  all CSS flows through `main.js` so it is cascade-layered.

### Custom-property tiers (single source of truth)

| Tier | File | What |
|---|---|---|
| 1 primitive | `src/styles/vars/primitives.css` | raw values (`--color-*`, `--size-*`, ...) |
| 2 semantic  | `src/styles/vars/semantic.css`   | role names (`--bg`, `--fg`, `--primary`, ...) + `[data-theme]` skins |
| theme map   | `src/styles/theme/deck.css`      | semantic -> Reveal's `--r-*` API (framework plumbing) |
| deck look   | **`deck.css`** (repo root)       | the one file you edit per deck: brand knobs + deck-wide element tweaks |

Components, GSAP, D3 and Alpine consume **tier 2 only**. These are CSS custom
properties / CSS variables - not "tokens".

### Making a deck your own

Edit **`deck.css` at the repo root**. It carries a commented menu of brand knobs
(`--primary`, `--bg`, `--fg`, `--muted`, `--font-*`, `--text-root-size`) - uncomment and
change - plus the deck-wide element tweaks (list sizing, etc.). It loads last, in
`@layer deck` (the highest layer), so anything set there wins with no
`!important`. The tiered files under `src/styles/vars/` hold the full system and
sane defaults; `deck.css` is the 90% surface.

### Cascade layers (low -> high)

```
reveal.reset, reveal.base, reveal.theme, vars.primitive, vars.semantic, theme, components, deck
```

Reveal's own CSS is wrapped into the `reveal.*` layers by
`src/styles/vendor/reveal-base.scss` so deck styling overrides it by layer, not by
specificity. `index.html` also carries the bare `@layer` order statement so a
minifier can't reorder precedence.

### Canonical components

One definition per component in `components/<name>/index.js` (repo root - deck
content, not `src/`), listed once in `src/components/registry.js` (framework
machinery). Slides place a `<deck-*>` tag - never restyle, never duplicate
markup/style/behaviour. See `src/components/README.md` and `components/README.md`.

### Slides

One file per slide in `slides/` (`.md` or `.html`, `NN[.M]-<slug>` naming).
`build/vite-plugin-slides.js` stitches them into `index.html`'s `<!-- @slides -->`
marker at dev and build time. Each slide is written to be **portable** - copy it
into another framework deck and it renders. See `slides/README.md`.

### Re-skin

```js
document.documentElement.dataset.theme = 'dark';
```

A skin is a `[data-theme="<name>"]` block in `src/styles/vars/semantic.css`.

## Editing a deck

The `src/` tree is framework machinery - you don't touch it. Two root-level
files are the deck-author surface:

- **`deck.css`** - look: brand knobs, type scale, element tweaks, utility classes.
- **`deck.config.js`** - Reveal knobs: slide size, transition, `slideNumber`, `hash`.

Plus `slides/` (one file per slide) and `index.html` (the `.reveal > .slides`
skeleton).

## Docs

- `docs/cheatsheet.md` - authoring reference: what tag / class / attribute to
  write on a slide, and the knob that restyles it. Start here.
- `docs/framework-conventions.md` - the architecture in full (custom-property
  tiers, cascade layers, component + portability contracts, assembly).

## Authoring skills

`.claude/skills/`, roughly in workflow order:

- `presentation-planner` - Q&A interview -> `presentation-plan.md` (a brief + a
  section outline)
- `deck-builder` - a plan or an outline -> `slides/` stubs (title, overview,
  a stub per section, closing takeaways)
- `slide-builder` - add / edit / reorder / renumber individual slides
- `artefact-builder` - a reusable `<deck-*>` component (chart, diagram, hero)
- `skin-builder` - a `[data-theme]` brand skin

Each reads `docs/framework-conventions.md` first.

## Deviations from a plain reveal.js 6.0.1 checkout

- `package.json`: `name` kept as `reveal.js` (so `plugin/*/index.ts` self-reference
  imports still resolve under `tsc`); identity, `dependencies`, and a `build:deck`
  script added; `react:*` scripts removed. All library paths (`main`/`module`/
  `types`/`files`/`exports`, and every script) point into `vendor/reveal.js/`.
- `vite.config.ts`: `@ -> /src` alias + the `slides()` plugin (two lines), plus
  the `reveal.js`/`reveal.js/plugin`/`reveal.css` aliases and the library's
  `outDir` retargeted at `vendor/reveal.js/`.
- Removed: `react/`, `.github/`, `demo.html`. Kept `css/theme/` (its sources feed
  `npm run build`; nothing links the compiled output) and `test/` / `examples/` -
  all now under `vendor/reveal.js/`, isolated from this framework's own `src/`.
- `src/styles/vendor/reveal-base.scss` uses Sass `@import` (deprecation warnings,
  not errors) to inline Reveal's CSS inside `@layer` blocks.

---

Built on [reveal.js](https://revealjs.com) by Hakim El Hattab - MIT licensed
(`LICENSE`).
