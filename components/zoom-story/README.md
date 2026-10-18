# `<deck-zoom-story>`: camera-driven data storytelling

Start close on one idea, pull back as it grows, fold it back up, push back in.
You give it variables (a tree of values) and a list of beats. It runs the
story, one Reveal press per beat.

It works on three ideas:

1. **Draw the world once.** Every node has a fixed world position, computed
   from the whole tree (`layout.js`). Nothing moves when siblings appear. Only
   the camera moves (`src/lib/camera.js`, a `d3.interpolateZoom` pan and zoom).
2. **A beat is a pure function of its number.** `state(n) = replay(beats[0..n])`
   (`model.js`). Going forwards, backwards, deep links and the overview all just
   land on beat *n*. This is also what lets one story span several slides.
3. **Fragments drive it.** The component adds one empty fragment per beat to
   its own slide, so you never hand-write fragments.

## Place it

```html
<!-- a story file: stories/<name>.js (default export) or stories/<name>.json -->
<deck-zoom-story class="r-stretch" story="balance-demo"></deck-zoom-story>

<!-- or inline, for small stories -->
<deck-zoom-story class="r-stretch">
	<script type="application/json">{ "nodes": {...}, "beats": [...] }</script>
</deck-zoom-story>
```

| Attribute | |
|---|---|
| `story` | name of a file in the deck's `stories/` folder (auto-discovered, nothing to register) |
| `beats` | `"from-to"` range of beats this slide plays (default: all). Beat `from` shows on arrival; each press advances one. |
| `label` | accessible name |
| `height` | stage height in slide px, if not using `r-stretch` (default 16:9) |

## The story

```js
export default {
	root: { view: 'balance', left: 'in', right: 'out' },   // or view: 'bars'; or { view: 'tree', node: 'revenue' }
	format: { prefix: '$', suffix: '', decimals: 0 },
	camera: { pad: 70, maxZoom: 2 },                        // optional defaults
	nodes: {
		in:  { label: 'In',  tone: 'success', children: ['salary', 'side'] },
		salary: { label: 'Salary', value: 4800 },
		side:   { label: 'Side income', value: 1200 },
		out: { label: 'Out', tone: 'danger', value: 6000 },
	},
	panels: { 'rent-chart': { at: 'rent', side: 'outer', w: 560, h: 330 } },
	beats: [ { show: 'in,out', camera: 'in,out' }, ... ],
};
```

- **Nodes.** A node with `children` always shows the **sum** of its children,
  so the regroup is real arithmetic. `tone` is a shared colour modifier
  (`primary`, `secondary`, `success`, `warning`, `danger`), and children
  inherit it.
- **Views.** `balance` is a seesaw with `left` / `right` on the ends. The tilt
  follows the *relative* imbalance `(right − left) / (left + right)`, so the
  same rule holds at every scale. Each side's subtree fans outward from its
  end. `bars` puts `left` / `right` side by side as two columns on one baseline,
  height = value, with a dashed line at the shorter one's level. `expand` opens
  a node as a new column beside it whose segments stack to exactly its height
  (a mirrored icicle chart). Its height scale is fixed per story (the largest
  total in any beat fills the frame) so bars stay comparable across beats.
  `tree` is a single tree growing right from the origin. The same nodes and
  beats work in every view: `stories/bars-demo.js` is `balance-demo` with
  `view: 'bars'`.
- **Adding a view.** A view is a small object in `views/` registered in
  `VIEWS` (`index.js`). It provides `anchor`/`tilt` for fixed tree layouts, or
  `place(model, values)` to compute every node's rect per beat (as `bars`
  does), plus `mount`/`update`/`decorate` for its own SVG decor and `rect` for
  `camera: 'root'`.
- **Panels.** Any element can sit in the world, such as a `<deck-chart-*>`.
  Put it inside the tag with `data-panel="<id>"`. `story.panels[id]` places it
  beside node `at` (`side`: `outer` (the default), `above`, `below`, `left`,
  `right`), or at an absolute `{ x, y, w, h }`.

## Beat verbs

Each beat is an object. Any of these can be combined:

| Verb | Value | Effect |
|---|---|---|
| `show` | selector | put nodes / panels / `root` (the seesaw itself) on screen |
| `hide` | selector | take them off |
| `expand` | selector | open a node: its children fan out from it |
| `collapse` | selector | fold children back into their parent (`'*'` = everything) |
| `set` | `{ id: 120 }` / `{ id: '+20' }` | change a value. Setting a parent scales its leaves proportionally. Totals and tilt follow. |
| `hint` | `['raise:in', 'lower:out']` | lever arrows (▲ for raise/increase/up/more/grow/add, ▼ otherwise), on this beat only |
| `camera` | `'auto'` / selector / panel id | `auto` fits everything visible. Flying to a panel shows it. **Holds** until a later beat names a new one, unless holding would crop what it framed (a bar grew), in which case it widens just enough. |

Selectors are a csv string or array: `'in'`, `'in.*'` (in and everything under
it), `'*'` (every node).

**Rule of thumb** (from the word-association slide): change either the camera
or the state on a press, not both. The eye can follow one change at a time.
The regroup (`collapse` + `camera`) is the one deliberate exception.

## Captions

Any element in the slide with `data-beat="n"` appears on beat *n*. It becomes
a fragment that shares that beat's index:

```html
<p data-beat="3">Two ways back to balance.</p>
```

## Splitting a story around other slides

```html
<section data-transition="none"> <deck-zoom-story story="cash" beats="0-5" class="r-stretch"></deck-zoom-story> </section>
<section> <deck-chart-line data='...'></deck-chart-line> </section>
<section data-transition="none"> <deck-zoom-story story="cash" beats="5-8" class="r-stretch"></deck-zoom-story> </section>
```

Part 2 opens on beat 5, exactly where part 1 ended, because both replay the
same beats. Use `data-transition="none"` on the story slides so the hand-off
is seamless.

Demo: `slides/040-zoom-story-inline.html`, `050`–`070` (seesaw, split
around a chart slide), `080` (bars), `stories/balance-demo.js` and
`stories/bars-demo.js`.
