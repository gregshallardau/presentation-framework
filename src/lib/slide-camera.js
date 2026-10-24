/**
 * Slide camera - a film camera over a slide, cued by fragments.
 *
 * A `<section data-camera>` becomes a fixed frame (the deck's width x height).
 * Its content is laid out exactly as any slide is, inside a `.camera-world`
 * wrapper; the camera pans and zooms that wrapper, so the slide stays put and
 * only the framing moves. A fragment carrying `data-camera="<target>"` is a
 * cue: when it is shown the camera flies to its target. Target grammar and
 * view maths: camera-targets.js. Authoring guide: docs/camera.md.
 *
 *   <section data-camera>
 *     <h2>Q3</h2>
 *     <img id="app" src="/app.png">
 *     <p class="fragment" data-camera="#app">Here.</p>
 *     <span class="fragment" data-camera="25% 25% 2x"></span>
 *     <p class="fragment" data-camera="home">Back out.</p>
 *   </section>
 *
 * Camera state is a pure function of the step: the last cue already shown
 * wins, none shown means the section's own `data-camera` value (default
 * home). So back-navigation, deep links and the overview all land correctly.
 *
 * Loaded lazily by main.js, only when the deck has a `[data-camera]` slide
 * (it pulls in d3 through camera.js).
 */
import { makeCamera, fitView } from '@/lib/camera.js';
import {
	parseTarget, homeView, pointView, magnify, clampView, pickCue, sameView, fragmentShown,
} from '@/lib/camera-targets.js';

const SELECTOR = 'section[data-camera]:not(:has(> section))';
const MAX_ZOOM = 4; // element fits never push in past this (data-camera-max-zoom); an explicit `Nx` can
const PAD = 60; // slide px of air around a fitted element
const MIN_MS = 900; // camera moves read better a touch slower than a UI transition

/**
 * @returns the camera's inspection handle (deck studio's camera overlay uses
 * it; main.js exposes it as `window.slideCamera`), or null when printing.
 */
export function initSlideCamera(Reveal) {
	if (Reveal.isPrintingPDF?.()) return null;

	const rigs = new Map();
	const state = { directing: false };
	for (const section of document.querySelectorAll(SELECTOR)) rigs.set(section, createRig(section, Reveal, state));

	const rigOf = (el) => rigs.get(el?.closest?.(SELECTOR));
	const currentSlide = () => Reveal.getCurrentSlide?.();

	const onFragment = (e) => {
		for (const f of e.fragments || [e.fragment]) {
			const rig = rigOf(f);
			if (rig) rig.update({ animate: rig.section === currentSlide() });
		}
	};
	const settle = (e) => {
		rigOf(e?.currentSlide)?.update({ animate: false });
		rigOf(e?.previousSlide)?.update({ animate: false });
	};
	const all = () => rigs.forEach((rig) => rig.update({ animate: false }));

	Reveal.on('fragmentshown', onFragment);
	Reveal.on('fragmenthidden', onFragment);
	Reveal.on('slidechanged', settle);
	Reveal.on('resize', all);
	// images and fonts move layout after first paint: re-aim once they settle
	window.addEventListener('load', all);
	all();

	const rigAt = (section) => rigs.get(section);
	return {
		/** Director mode: every camera parks at home and ignores cues, so a tool can draw the frames over the whole slide. */
		director(on) {
			state.directing = !!on;
			all();
		},
		isDirector: () => state.directing,
		/** The slide frame in slide px. */
		size: (section) => ({ width: section.clientWidth, height: section.clientHeight }),
		/** The cue deciding the step on screen: { cue: element | null, spec: its target (or the starting view) }. */
		current(section) {
			const cue = pickCue(cues(section));
			return { cue, spec: cue ? cue.dataset.camera : section.getAttribute('data-camera') || '' };
		},
		/** `[cx, cy, w]` the camera would show for a target string, or null if it can't resolve. */
		view: (section, spec) => rigAt(section)?.viewFor(spec) ?? null,
		/** The same for a given element (zoom = the optional extra push-in). */
		viewOfElement: (section, el, zoom = 1) => rigAt(section)?.viewOfElement(el, zoom) ?? null,
	};
}

function createRig(section, Reveal, state) {
	const { world } = mount(section, Reveal);
	const size = () => ({ width: section.clientWidth, height: section.clientHeight });
	const camera = makeCamera(({ k, tx, ty }) => {
		// at rest, no transform at all: text stays on its native pixel grid
		const rest = Math.abs(k - 1) < 1e-6 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01;
		world.style.transform = rest ? '' : `translate(${tx}px, ${ty}px) scale(${k})`;
	}, size);
	let aimed = null; // the view last asked for, so unrelated fragments don't restart a move

	/** A target's view as the camera would frame it (clamped unless data-camera-free). */
	function viewFor(spec) {
		const { width, height } = size();
		if (!width) return null;
		const view = resolve(parseTarget(spec), section, world, width, height);
		return view && clamp(view, width, height);
	}
	function viewOfElement(el, zoom) {
		const { width, height } = size();
		const view = width && fitElement(el, zoom, section, world, width, height);
		return view ? clamp(view, width, height) : null;
	}
	const clamp = (view, width, height) =>
		section.hasAttribute('data-camera-free') ? view : clampView(view, width, height);

	function update({ animate }) {
		const { width, height } = size();
		if (!width) return; // display:none (a far-off slide): it re-aims when it becomes current

		if (state.directing) {
			aimed = null;
			camera.zoomTo(homeView(width, height));
			return;
		}
		const cue = pickCue(cues(section));
		const view = viewFor(cue ? cue.dataset.camera : section.getAttribute('data-camera'));
		if (!view) return;
		if (sameView(view, aimed)) return;

		const first = aimed === null;
		aimed = view;
		const ms = animate && !first ? duration(section, cue) : 0;
		if (ms > 0) camera.easeTo(view, { duration: ms });
		else camera.zoomTo(view);
	}

	return { section, update, viewFor, viewOfElement };
}

/** Wrap the slide's content in a world the camera can move. Idempotent. */
function mount(section, Reveal) {
	let world = section.querySelector(':scope > .camera-world');
	if (world) return { world };

	// world = the frame-sized thing the camera moves; flow = the slide's own
	// content, a plain block so it lays out as it would without a camera
	world = document.createElement('div');
	world.className = 'camera-world';
	const flow = document.createElement('div');
	flow.className = 'camera-flow';
	world.append(flow);
	const fixed = document.createElement('div');
	fixed.className = 'camera-fixed';

	// speaker notes stay where the notes plugin looks for them; data-fixed
	// elements sit above the camera and don't move with it
	for (const node of [...section.childNodes]) {
		if (node.nodeType === 1 && node.matches('aside.notes')) continue;
		(node.nodeType === 1 && node.hasAttribute('data-fixed') ? fixed : flow).append(node);
	}
	section.prepend(world);
	if (fixed.childElementCount) section.append(fixed);

	// the frame is the deck's configured slide, not the height of its content
	const { height, center } = Reveal.getConfig();
	if (typeof height === 'number') section.style.height = `${height}px`;
	// Reveal centres slide content vertically; a camera slide does the same
	world.toggleAttribute('data-centered', !!center || section.classList.contains('center'));
	Reveal.layout?.();
	return { world };
}

/** Every cue fragment, in document order, with the state pickCue needs. */
function cues(section) {
	return [...section.querySelectorAll('.fragment[data-camera]')].map((cue) => ({
		cue,
		index: Number(cue.dataset.fragmentIndex),
		visible: cue.classList.contains('visible'),
	}));
}

function resolve(target, section, world, width, height) {
	if (target.kind === 'home') return homeView(width, height);
	if (target.kind === 'point') return pointView(target, width, height);

	if (target.kind === 'revealed') return fitRevealed(target, section, world, width, height);

	let el = null;
	try {
		el = world.querySelector(target.selector);
	} catch {
		console.warn(`[slide-camera] "${target.selector}" is not a valid selector`);
		return null;
	}
	if (!el) {
		console.warn(`[slide-camera] no element matches "${target.selector}" on #${section.id || 'slide'}`);
		return null;
	}
	return fitElement(el, target.zoom, section, world, width, height);
}

/** The view that frames an element, then pushes in a further `zoom`. */
function fitElement(el, zoom, section, world, width, height) {
	const rect = rectOf(world, el);
	return rect ? fitRects([rect], zoom, section, width, height) : null;
}

/** The tightest view that holds these slide-px rects (with air around), then a further `zoom`. */
function fitRects(rects, zoom, section, width, height) {
	const pad = Number(section.dataset.cameraPad);
	const max = Number(section.dataset.cameraMaxZoom);
	const fit = fitView(rects, {
		pad: Number.isFinite(pad) ? pad : PAD,
		aspect: width / height,
		minW: width / (max > 0 ? max : MAX_ZOOM),
	});
	return magnify(fit, zoom);
}

/**
 * `revealed`: the tightest view around everything on screen so far inside the
 * scope (the whole slide by default), so the camera widens only as much as the
 * next fragment forces it to. null while nothing is shown.
 */
function fitRevealed(target, section, world, width, height) {
	let roots;
	try {
		roots = target.scope ? [...world.querySelectorAll(target.scope)] : [world.querySelector('.camera-flow') || world];
	} catch {
		console.warn(`[slide-camera] "${target.scope}" is not a valid selector`);
		return null;
	}
	if (!roots.length) {
		console.warn(`[slide-camera] no element matches "${target.scope}" on #${section.id || 'slide'}`);
		return null;
	}
	const found = [];
	for (const root of roots) collectShown(root, found);
	const rects = found.map((r) => slideRect(world, r)).filter(Boolean);
	return rects.length ? fitRects(rects, target.zoom, section, width, height) : null;
}

// never part of what the audience sees
const NOT_PAINTED = new Set(['SCRIPT', 'STYLE', 'ASIDE', 'TEMPLATE', 'NOSCRIPT', 'DEFS', 'TITLE', 'DESC', 'MARKER', 'SYMBOL', 'CLIPPATH', 'MASK']);
// painted whole, never looked inside: SVG shapes and replaced elements
const SHAPES = new Set(['CIRCLE', 'ELLIPSE', 'LINE', 'PATH', 'POLYGON', 'POLYLINE', 'RECT', 'IMAGE', 'USE']);
const REPLACED = new Set(['IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'PICTURE', 'HR', 'INPUT', 'METER', 'PROGRESS']);

/**
 * Pushes the viewport rects of what is shown under `root`: text, shapes,
 * images and `<deck-*>` components, skipping fragments that are not on screen.
 * An element with its own background or border counts too, unless a hidden
 * fragment sits inside it (its box would then frame the hidden part).
 * Returns true if anything hidden was skipped under `root`.
 */
function collectShown(root, out) {
	let skipped = false;
	for (const node of root.childNodes) {
		if (node.nodeType === Node.TEXT_NODE) {
			if (!node.nodeValue.trim()) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			out.push(range.getBoundingClientRect());
			continue;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) continue;
		if (NOT_PAINTED.has(node.tagName.toUpperCase())) continue;
		if (node.classList.contains('fragment') && !fragmentShown(node.classList)) {
			skipped = true;
			continue;
		}
		const style = getComputedStyle(node);
		if (style.display === 'none') continue;

		const tag = node.tagName.toUpperCase();
		if (SHAPES.has(tag) || REPLACED.has(tag) || tag.includes('-')) {
			out.push(node.getBoundingClientRect());
			continue;
		}
		const before = out.length;
		const hiddenInside = collectShown(node, out);
		skipped ||= hiddenInside;
		const boxed = style.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(style.borderTopWidth) > 0;
		if (boxed && !hiddenInside && !(node instanceof SVGElement) && out.length > before) out.push(node.getBoundingClientRect());
	}
	return skipped;
}

/**
 * An element's rect in slide px, measured through whatever transform is live
 * (Reveal's scale times the camera's), so it is right mid-move too.
 */
function rectOf(world, el) {
	return slideRect(world, el.getBoundingClientRect());
}

function slideRect(world, t) {
	const w = world.getBoundingClientRect();
	const scale = w.width / world.offsetWidth;
	if (!scale || (!t.width && !t.height)) return null;
	return { x: (t.left - w.left) / scale, y: (t.top - w.top) / scale, w: t.width / scale, h: t.height / scale };
}

function duration(section, cue) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
	const custom = Number(cue?.dataset.cameraDuration);
	if (Number.isFinite(custom) && cue?.hasAttribute('data-camera-duration')) return custom;
	const raw = getComputedStyle(section).getPropertyValue('--motion-hero-duration').trim();
	const v = parseFloat(raw);
	if (!Number.isFinite(v)) return 900;
	return Math.max(MIN_MS, raw.endsWith('ms') ? v : v * 1000);
}
