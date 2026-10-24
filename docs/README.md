# docs/

| File | For |
|---|---|
| [`cheatsheet.md`](./cheatsheet.md) | authoring a slide: what tag / class / attribute to write, and the knob that restyles it. Start here. |
| [`framework-conventions.md`](./framework-conventions.md) | the architecture: CSS custom-property tiers, cascade layers, the component contract, slide portability, assembly. The authoring skills read this first. |
| [`camera.md`](./camera.md) | the slide camera: `data-camera` on a section, and fragments that push in, pan, or pull back to an element or a `25% 30% 2x` position. |
| [`plan-format.md`](./plan-format.md) | the `presentation-plan.md` schema - written by `presentation-planner`, read by `deck-builder`. |

Also worth knowing:

- **[`editor/README.md`](../editor/README.md)** - deck studio (`npm run edit`), the
  browser editor: live preview of unsaved edits, drag-to-reorder slides, a
  `deck.config.js` / skin / component inspector, lint, Git and build.
- **`deck.css`** (repo root) - the one file you edit to re-skin a deck: a
  commented menu of brand knobs (`--primary`, `--bg`, `--fg`, `--muted`, `--font-*`, type
  scale), deck-wide element tweaks, and the utility classes (`.text-muted`,
  `.flex-cols`, `.box`, …). Each knob says where you'll see it.
- **`deck.config.js`** (repo root) - the Reveal knobs a deck tunes: slide size,
  transition, `slideNumber`, `hash`, and `chrome` (a logo + footer drawn on
  every slide). The `src/` tree stays untouched.
- **`slides/README.md`** - the slide numbering + portability contract in full.
- **`src/components/README.md`** - the `<deck-*>` component contract (framework
  machinery: base class, registry, shared styles).
- **`components/README.md`** (repo root) - where this deck's own `<deck-*>`
  implementations live, and how that differs from `src/components/`.

Authoring skills (in `.claude/skills/`), in workflow order: `presentation-planner`
(interview -> `presentation-plan.md`) -> `deck-builder` (plan/outline ->
`slides/` stubs) -> `slide-builder` (per-slide edits), with `artefact-builder`
(`<deck-*>` components) and `skin-builder` (`[data-theme]` skins) alongside.

`artefact-builder` builds each `<deck-*>` from a kind recipe in its `reference/`
folder (`d3-chart`, `d3-circle-pack`, `svg-diagram`, `gsap-hero`,
`alpine-interactive`, `radial-meter`, `animated-counter`, `stat-tiles`,
`timeline-stepper`, `confidence-bars`), all importing the one shared style
vocabulary - `SHARED_STYLES` from `src/components/shared-styles.js`, documented in
`component-styles.md`.

## Credits

- D3 chart technique in `artefact-builder/reference/d3-chart.md` is adapted from
  [chrisvoncsefalvay/claude-d3js-skill](https://github.com/chrisvoncsefalvay/claude-d3js-skill)
  (MIT), re-homed onto this framework's shadow-DOM component + semantic-variable
  model.
- `artefact-builder/reference/d3-circle-pack.md` follows d3's
  [Zoomable circle packing](https://observablehq.com/@d3/zoomable-circle-packing)
  example (ISC), similarly re-homed.
