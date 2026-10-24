# Slide camera

A camera that moves over one slide, cued by fragments. The slide is laid out once, like any
slide; each press flies the camera to a target: an element, a position, or the whole slide.
It is the "YouTube explainer" move: push in on the chart, pan to the next thing, pull back.

```html
<section data-camera>
  <h2>Q3 results</h2>
  <div class="flex-cols">
    <deck-chart-line id="trend" data='[...]'></deck-chart-line>
    <div id="rent" class="box primary">Rent</div>
  </div>

  <p class="fragment" data-camera="#trend">Push in on the chart.</p>
  <p class="fragment" data-camera="#rent">Pan across to rent.</p>
  <p class="fragment" data-camera="70% 58% 2x">Fly to a position.</p>
  <span class="fragment" data-camera="home"></span>   <!-- a silent cue: no visible content -->
</section>
```

Demo: `slides/090-camera-demo.html`.

## Targets (`data-camera` on a fragment)

| Value | Camera goes to |
|---|---|
| `home` (or empty) | the whole slide |
| `#chart`, `.row > .cell` | fits that element (any selector inside the slide), with air around it |
| `#chart 1.5x` | fits it, then pushes in a further 1.5x (it will crop a wide element) |
| `25% 30% 2x` | the view centred 25% across and 30% down the slide, at 2x |
| `25% 30%` | the same, at the default point zoom (2x) |

**Zoom is magnification.** `1x` is the whole slide, `2x` shows half its width, `4x` a quarter.
The camera never shows beyond the slide edge: a position near a corner is nudged inward so the
frame stays on the slide.

## On the section

| Attribute | Effect |
|---|---|
| `data-camera` | turns the camera on. Its value is the **starting view**: empty or `home` by default, or any target above |
| `data-camera-free` | allow the camera past the slide edges (no clamping) |
| `data-camera-pad="120"` | air around a fitted element in slide px (default 60) |

## On a cue fragment

| Attribute | Effect |
|---|---|
| `data-camera-duration="1500"` | this move's length in ms (default: `--motion-hero-duration`, at least 900) |

## On any child of the section

| Attribute | Effect |
|---|---|
| `data-fixed` | stays put while the camera moves (a caption, a logo). It sits above the camera in the slide gutter, so leave room for it |

## How it behaves

- **The camera state is a function of the step.** The last cue already shown wins; with none
  shown, the starting view applies. Stepping back, deep links, reload and the overview all land
  on the right view with no replay.
- **Cues are ordinary fragments.** `data-fragment-index` reorders them, several can share one
  press, and they can carry a normal effect (`fade-up`, `highlight-red`, ...) or none.
- **The slide is a fixed frame** (`deck.config.js` `width` x `height`) and clips to it. Content
  is centred vertically when `center` is on, as on any slide. The gutter (`--slide-padding`)
  moves onto the content, so it lays out the same as without a camera.
- `prefers-reduced-motion` makes every move an instant cut. PDF export ignores the camera.

## Limits

- `.r-stretch` / `.stretch` only work on direct children of a `<section>`, and a camera slide
  wraps its content, so size things with the layout utilities (`.flex-cols`, explicit heights)
  instead.
- It zooms live DOM: text, SVG and `<deck-*>` components stay sharp; a raster image is only as
  sharp as its file, so use a large source for anything you push in on past 2x.
- A camera slide in a vertical stack works; a stack parent itself does not take `data-camera`.
- For a camera over **number stories** (seesaw, bars) use `<deck-zoom-story>`, which has its
  own world and beats. This is the general version for ordinary slide content.

## Code

| File | |
|---|---|
| `src/lib/camera-targets.js` | the grammar and the view maths (pure; `npm run test:camera`) |
| `src/lib/slide-camera.js` | mounting, the fragment listener, measuring elements |
| `src/lib/camera.js` | the shared camera (`interpolateZoom` flight), also used by `<deck-zoom-story>` |
| `src/styles/theme/camera.css` | structural CSS (`@layer theme`) |

`main.js` loads `slide-camera.js` lazily, only when the deck has a `[data-camera]` slide.
