# Authoring cheatsheet

What tag / class / attribute to write on a slide, and which knob restyles it.
Architecture and the "why" live in [`framework-conventions.md`](./framework-conventions.md).

Every **knob** below is a CSS custom property. Override it in **`deck.css`** at
the repo root (uncomment the line, change the value) - it is the highest cascade
layer, so it wins with no `!important`. The framework default for each is noted.

---

## Slide files

One file per slide position in `slides/`, stitched into `index.html` in filename
order by `build/vite-plugin-slides.js`.

```
NN-<slug>.md            NN = zero-padded major (>= 3 digits), step 10
NN-<slug>.html
NN.M-<slug>.<md|html>    .M = vertical-stack minor, step 1; files sharing NN wrap in one stack
```

- `<slug>` (kebab-case) becomes the slide's `id` **and** `data-slug`. Link to it
  with `<a href="#/<slug>">`, or press `o` for the overview.
- `000-title.*` is the title slide. `010-overview.*` is the jump menu - **deck
  specific, not portable** (it names other slides' slugs).
- The step of 10 leaves room to insert later without renumbering - a slide
  between `020` and `030` becomes `025` (or `021` right after `020`). See
  `slides/README.md` for the full rule.
- Pick `.md` for prose / bullets / headings. Pick `.html` for scoped layout, a
  `<deck-*>` component, or a fully-inlined artefact.
- Prefer clicking to typing filenames? `npm run edit` opens deck studio, which
  adds, reorders, stacks and renames slides with the same numbering rules (see
  [`editor/README.md`](../editor/README.md)).

### Shape 1 - Markdown (`NN-<slug>.md`)

```md
## Heading

- point one
- point two

--

### Vertical sub-slide (reached with the down arrow)

Body.

Note: speaker note - shown in speaker view (press S), stripped from the slide.
```

No `<section>` wrapper - the plugin adds it. `--` alone on a line starts a
vertical sub-slide. A `Note:` line becomes a speaker note. Add
`<!-- .slide: data-... -->` only if the slide needs Reveal attributes.

### Shape 2 - HTML with a component (`NN-<slug>.html`)

```html
<section id="<slug>" data-slug="<slug>">
	<h2>Heading</h2>
	<deck-<component> attr="value"></deck-<component>>
</section>
```

`deck-<component>` MUST be listed in `src/components/registry.js` (its
implementation lives in the root-level `components/<component>/`). The slide only
places the tag - no `<style>`, no behaviour. Need a new one? run `artefact-builder`.

### Shape 3 - fully-inlined artefact (`NN-<slug>.html`)

```html
<section id="<slug>" data-slug="<slug>">
	<style>
		#<slug> .thing {
			color: var(--fg);
			gap: var(--space-gap);
			border-radius: var(--radius-card);
			transition: opacity var(--motion-ui-duration) var(--motion-ui-ease);
		}
	</style>
	<h2>Heading</h2>
	<div class="thing"></div>
	<script type="module">
		// zero imports; browser-native APIs only.
		// scope every lookup by the slide's own id.
		// defer any getComputedStyle custom-property read to 'load' - the
		// framework CSS is JS-injected in dev and may not be live yet.
		addEventListener('load', () => {
			const root = document.getElementById('<slug>');
			const accent = getComputedStyle(document.documentElement)
				.getPropertyValue('--primary').trim();
		});
	</script>
</section>
```

`<style>` selectors keyed under `#<slug>`. Inline `<script>`: no `import`, never
`document.currentScript` (null once bundled). Needs a library -> it is not an
inline artefact, make a `<deck-*>` with `artefact-builder`.

---

## Headings & text

Markdown `#`..`####` and raw `<h1>`..`<h4>` render the same. Sizes are `em`
multiples of `--text-root-size`.

| Want | Markdown | HTML | Default size | Restyle knob (in `deck.css`) |
|---|---|---|---|---|
| Slide title | `#` | `<h1>` | `2em` | `--r-heading1-size` |
| Section heading | `##` | `<h2>` | `1.3em` | `--r-heading2-size` |
| **Sub-heading** | `###` | `<h3>` | `1.15em` | `--r-heading3-size` |
| Minor label | `####` | `<h4>` | `1em` | `--r-heading4-size` |
| Body text | plain | `<p>` | `1em` (= `--text-root-size`), capped at `32em` wide | `--text-root-size` |
| Secondary / caption | _(none)_ | `<p class="text-muted">` | - | `--muted` |
| Smaller run of text | _(none)_ | `<small>` | `~0.6em` | - |
| Bold | `**x**` | `<strong>` / `<b>` | - | - |
| Italic | `*x*` | `<em>` / `<i>` | - | - |
| Inline code | `` `x` `` | `<code>` | inherits | `--font-code` |
| Code block | ```` ``` ```` fence | `<pre><code>` | `0.55em` | `--font-code` |
| Block quote | `> x` | `<blockquote>` | 70% width, italic | - |

Heading colour / font / weight / case / spacing:

| Aspect | Default | Knob (`deck.css`) |
|---|---|---|
| Colour | `--fg` | `--r-heading-color` |
| Font stack | `--font-heading` | `--r-heading-font` |
| Weight | `600` | `--r-heading-font-weight` |
| Case | `none` | `--r-heading-text-transform` |
| Line-height | `1.15` | `--r-heading-line-height` |
| Space below | `0.75em` | `--r-heading-margin` |

Body copy (`<p>`, `<ul>`, `<ol>`, `<blockquote>`) is capped at `32em` wide so it
reads as a column, not a full-width slab. Wrap in a `<div>` to opt a block out.

Every slide is inset from the frame by `--slide-padding` (default `4% 6%`, set in
`deck.css`). For a full-bleed slide, put `style="padding: 0"` on its `<section>`.

---

## Lists

`<ul>` / `<ol>` / `<dl>` - Markdown `-` / `1.` / definition lists. Reveal renders
them `display: inline-block`, left-aligned, indented `1em`; nested lists indent
`40px`.

Framework list rules (in `deck.css`, "Element tweaks"):

| Rule | Value | Why |
|---|---|---|
| list font-size | `0.85em` | steps list text down from prose so 6+ items fit |
| nested list font-size | `0.92em` | a 3rd level still fits |
| `li + li` margin-top | `0.4em` | vertical rhythm between items |
| line-height | `1.3` | tighter than prose |

Change these lines in `deck.css` to taste. To keep **one** list at full size,
wrap it: `<div style="font-size: 1em"><ul>...</ul></div>`.

### Glossary / definitions

Use a **`<dl>`** - not `<strong>` + a span, never a `.glossary-*` class. The
framework styles `<dt>` (term, heading weight) and `<dd>` (definition, muted,
directly under). For a wall of terms, add `.columns`:

```html
<dl class="columns box border">
	<dt>Token</dt><dd>a chunk of text — a word or word-piece.</dd>
	<dt>Vector</dt><dd>a direction and a distance; similar ideas point the same way.</dd>
	…
</dl>
```

### Newspaper columns

`.columns` (2) / `.columns-3` flow the children of any block into columns -
a glossary, a long term list. Pairs never split across a column. This is *not*
`.flex-cols` (that's for a fixed number of equal side-by-side panels).

---

## Links

```html
<a href="https://example.com">external</a>
<a href="#/other-slug">jump to another slide</a>   <!-- overview slide ONLY -->
```

Cross-slide `#/slug` links are allowed **only on the non-portable overview
slide** - a normal slide must not assume its neighbours exist.

| Aspect | Default | Knob (`deck.css`) |
|---|---|---|
| Link colour | `--primary` | `--primary` |
| Hover / active | `--primary-strong` | `--primary-strong` |

---

## Layout helpers (Reveal built-ins)

Add as a `class` on any element (or `<section>`).

| Class | Does |
|---|---|
| `r-fit-text` | scales text to fill the slide width - big one-liners |
| `r-stretch` | makes a single child (image / video / iframe) fill remaining slide height |
| `r-stack` | stacks children on top of each other (reveal one per fragment) |
| `r-hstack` / `r-vstack` | fl: children in a row / column, centred |
| `class="stack"` on `<section>` | opt this slide back into centred text (default is left-aligned) |

```html
<h2 class="r-fit-text">One Big Idea</h2>
<div class="r-hstack">
	<img src="a.png"><img src="b.png">
</div>
```

---

## Utility classes

Deck-wide helpers defined in `deck.css` ("Utility classes"). Put one on any
element inside a slide - no per-slide `<style>` needed. All built from semantic
custom properties, so they follow a re-skin.

| Class | Does |
|---|---|
| `.text-primary` | brand-colour text |
| `.text-muted` | secondary / caption text (`--muted`) |
| `.text-center` | centre-align (slide text defaults to left) |
| `.flex-cols` / `.flex-rows` | children in a row / column, `--space-block` gap |
| `.columns` / `.columns-3` | flow children into 2 / 3 newspaper columns (a `<dl>`, a long list) |
| `.list-compact` | drop the gap between items of a list inside it |
| `.box` | white padded panel, no border |
| `.box border` | + hairline border |
| `.box bar` | no border, thick left bar — a callout / "the answer" block |
| `.box primary` … | tinted fill (also `secondary` / `success` / `danger` / `warning`) |
| `.chip` | inline text in a small box — a token / tag / keyword |
| `.chip primary` … | solid coloured fill — the picked / emphasised one |
| `.chip muted` | greyed, de-emphasised |

**Colour modifiers** — `primary`, `secondary`, `success`, `danger`, `warning` —
are bare classes you add after a block class: `class="box bar danger"`,
`class="chip success"`. One word, works on every block.

```html
<p class="text-muted">context for the slide</p>

<p>Predicts <span class="chip primary">toward</span>, not
<span class="chip muted">on</span> or <span class="chip">for</span>.</p>

<div class="flex-cols">
	<div class="box">
		<h3>Before</h3>
		<ul class="list-compact"><li>…</li></ul>
	</div>
	<div class="box">
		<h3>After</h3>
		<ul class="list-compact"><li>…</li></ul>
	</div>
</div>
```

Need something not in this list and used on more than one slide? Add a class to
the "Utility classes" block in `deck.css` (semantic custom properties only). A
one-slide-only visual stays a scoped `<style>` in that slide (shape 3 above).

---

## Fragments (step-reveal)

`class="fragment"` on any element - appears on the next arrow press. Add a
variant class to change how; `data-fragment-index` to reorder.

```html
<li class="fragment">shows up on click</li>
<li class="fragment fade-up">…sliding up</li>
<li class="fragment highlight-red">…turning red</li>
<p class="fragment" data-fragment-index="1">shown first</p>
```

Variants: `fade-in-then-out`, `fade-in-then-semi-out`, `fade-up` / `-down` /
`-left` / `-right`, `fade-out`, `semi-fade-out`, `grow`, `shrink`, `strike`,
`highlight-red` / `-green` / `-blue`, `highlight-current-red` / `-green` / `-blue`.

For a build-up **across separate slides** (not within one slide), see "Step-through
across slides" below - never copy the whole slide per step.

---

## Step-through across slides (auto-animate rungs)

`.fragment` reveals incrementally *within one slide*. For a block that grows or
rearranges *across the deck's flow* - a glossary filling in, a diagram gaining a
layer per press - use `data-auto-animate` instead. Put it on two or more
consecutive `<section>`s; any element sharing a `data-id` between them tweens in
place, and anything unmatched fades in fresh. Pair it with the existing `.M`
vertical-stack minor convention (`slides/README.md`) so a rung sequence is just
consecutive minors of one major - no new numbering scheme needed.

**Don't do this** (four full slide copies, each adding one more line - the
"glossary wall" anti-pattern):

```
999-glossary-token.html         <dl>…Token…</dl>
999-glossary-vector.html        <dl>…Token…Vector…</dl>          (copy of the above + 1 line)
999-glossary-weight-model.html  <dl>…Token…Vector…Weight…</dl>   (copy of the above + 1 line)
999-glossary-prompt.html        <dl>…Token…Vector…Weight…Prompt…</dl>
```

**Do this instead** - one rung per minor, each just the previous file plus one
new `data-id`'d entry:

```html
<!-- slides/07.1-glossary.html -->
<section id="glossary" data-slug="glossary" data-auto-animate>
	<h2>Glossary</h2>
	<dl class="columns">
		<dt data-id="term-token">Token</dt>
		<dd data-id="def-token">a chunk of text - a word or word-piece.</dd>
	</dl>
</section>
```

```html
<!-- slides/07.2-glossary.html -->
<section id="glossary-2" data-slug="glossary-2" data-auto-animate>
	<h2>Glossary</h2>
	<dl class="columns">
		<dt data-id="term-token">Token</dt>
		<dd data-id="def-token">a chunk of text - a word or word-piece.</dd>
		<dt data-id="term-vector">Vector</dt>
		<dd data-id="def-vector">a direction and a distance; similar ideas point the same way.</dd>
	</dl>
</section>
```

Rule of thumb: single-slide, a few small reveals → `.fragment`. A whole block
growing or rearranging across the deck's flow → auto-animate rungs.

In deck studio (`npm run edit`), **Animate** lays these out as a timeline you
edit by clicking and dragging. **Morphs** outlines exactly what Reveal will tween
between neighbouring slides, and links elements with a `data-id`. See
[`editor/README.md#animation`](../editor/README.md#animation). You can also right-click any element in its
preview to animate, auto-animate, style or edit it in place
([`#editing-in-the-preview`](../editor/README.md#editing-in-the-preview)).

---

## Slide backgrounds & transitions

Attributes on `<section>` (in `.md`, use `<!-- .slide: ... -->`).

| Attribute | Example |
|---|---|
| `data-background-color` | `data-background-color="var(--fg)"` |
| `data-background-image` | `data-background-image="/public/hero.jpg"` |
| `data-background-gradient` | `data-background-gradient="linear-gradient(to bottom, var(--primary), #000)"` |
| `data-background-video` | `data-background-video="/public/clip.mp4"` |
| `data-transition` | `data-transition="fade"` (`none` / `slide` / `convex` / `concave` / `zoom`) |
| `data-auto-animate` | put on two consecutive `<section>`s - matching elements tween between them |

Background colours accept semantic custom properties.

---

## Components

`<deck-*>` custom elements - reusable widgets (diagram, chart, badge, animated
hero). Defined once in `components/<name>/index.js` (repo root - deck content,
not `src/`), listed in `src/components/registry.js` (framework machinery).

- **"Does `deck-x` exist?"** -> read `src/components/registry.js` (the `COMPONENTS`
  map). Nothing else is authoritative.
- **Need a new one** -> run `artefact-builder`. Do not hand-write a component
  definition inside a slide.
- On a slide: place the tag, pass data through attributes / slots. Never style it
  from the slide.

---

## Logo & footer (deck chrome)

A logo and/or a footer line on every slide - set in **`deck.config.js`**, not on
each slide:

```js
chrome: {
	logo:   { src: '/logo.svg', alt: 'Acme', position: 'top-right', height: '4vh' },
	footer: { text: '&copy; 2026 Acme &middot; Confidential', position: 'bottom-left' },
	hideOnTitle: true,
}
```

- Logo file goes in `public/` (served at `/`). `position`: any of `top-left`
  `top-right` `top-center` `bottom-left` `bottom-right` `bottom-center` (logo
  defaults `top-right`, footer `bottom-left`).
- Hidden on the title slide by default (`hideOnTitle: false` to keep them). Any
  slide opts out with `<section … data-hide-chrome>`.
- Footer size / font: `--footer-size` (default `0.45em`) and `--footer-font`
  (default `--font-body`) knobs in `deck.css`. Restyle `.reveal .deck-logo` /
  `.reveal .deck-footer` there for anything more.

---

## The style knobs (semantic custom properties)

Full role set - defaults in `src/styles/vars/semantic.css`, override the ones you
need in `deck.css`.

| Knob | Role |
|---|---|
| `--bg` | slide / page background |
| `--fg` | body + heading text |
| `--muted` | secondary text |
| `--line` | hairlines, table rules, `<hr>` |
| `--primary` / `--primary-strong` / `--primary-fg` | brand colour · hover · text-on-fill |
| `--secondary` / `--secondary-strong` / `--secondary-fg` | second colour · hover · text-on-fill |
| `--success` / `--danger` / `--warning` (+ `-fg`) | status colours |
| `--space-inline` | horizontal rhythm unit |
| `--space-block` | vertical rhythm unit (gap below headings, between blocks) |
| `--space-gap` | small flex/grid gap |
| `--radius-control` / `--radius-card` / `--radius-round` | corner radii |
| `--font-heading` / `--font-body` / `--font-code` | font stacks |
| `--motion-hero-duration` / `--motion-hero-ease` | big / section-break motion |
| `--motion-ui-duration` / `--motion-ui-ease` | small UI transitions |

A whole alternate palette (light + dark, per-client themes) is a
`[data-theme="name"]` block, added by `skin-builder` - not `deck.css`.

---

## "I want to change…" → where

| Change | Do this |
|---|---|
| Brand colour on one element | `class="text-primary"` on it |
| A caption / secondary line | `class="text-muted"` |
| Two things side by side | wrap them in `<div class="flex-cols">` |
| A bordered box | `class="box"` |
| Link / brand colour (whole deck) | `--primary` (+ `--primary-strong`) in `deck.css` |
| Slide background colour | `--bg` in `deck.css` |
| Body text size (whole deck) | `--text-root-size` in `deck.css` |
| Sub-heading (`<h3>`) size | `--r-heading3-size` in `deck.css` |
| Heading weight / capitalisation | `--r-heading-font-weight` / `--r-heading-text-transform` in `deck.css` |
| Space between bullets | the `li + li` rule in `deck.css` |
| List text too big / small | the `:is(ul, ol)` font-size in `deck.css` |
| Fonts | `--font-heading` / `--font-body` in `deck.css` (load the webfont in `index.html` first) |
| Slide size / default transition / slide numbers | `deck.config.js` (repo root) |
| Logo / footer on every slide | `chrome` in `deck.config.js` |
| A full brand theme / dark mode | run `skin-builder` → `[data-theme]` block in `semantic.css` |
| Add a chart / diagram / animated widget | run `artefact-builder` → a `<deck-*>` |
| Add / rewrite / reorder a slide | run `slide-builder` |
| A one-slide-only visual | scoped `<style>` + inline `<script>` in that slide file (Shape 3 above) |
