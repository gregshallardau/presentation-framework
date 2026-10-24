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
	parseTarget, homeView, pointView, magnify, clampView, pickCue, sameView,
} from '@/lib/camera-targets.js';

const SELECTOR = 'section[data-camera]:not(:has(> section))';
const MAX_ZOOM = 4; // element fits never push in past this; an explicit `Nx` can
const PAD = 60; // slide px of air around a fitted element
const MIN_MS = 900; // camera moves read better a touch slower than a UI transition

export function initSlideCamera(Reveal) {
	if (Reveal.isPrintingPDF?.()) return;

	const rigs = new Map();
	for (const section of document.querySelectorAll(SELECTOR)) rigs.set(section, createRig(section, Reveal));

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
}

function createRig(section, Reveal) {
	const { world } = mount(section, Reveal);
	const size = () => ({ width: section.clientWidth, height: section.clientHeight });
	const camera = makeCamera(({ k, tx, ty }) => {
		// at rest, no transform at all: text stays on its native pixel grid
		const rest = Math.abs(k - 1) < 1e-6 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01;
		world.style.transform = rest ? '' : `translate(${tx}px, ${ty}px) scale(${k})`;
	}, size);
	let aimed = null; // the view last asked for, so unrelated fragments don't restart a move

	function update({ animate }) {
		const { width, height } = size();
		if (!width) return; // display:none (a far-off slide): it re-aims when it becomes current

		const cue = pickCue(cues(section));
		const target = parseTarget(cue ? cue.dataset.camera : section.getAttribute('data-camera'));
		let view = resolve(target, section, world, width, height);
		if (!view) return;
		if (!section.hasAttribute('data-camera-free')) view = clampView(view, width, height);
		if (sameView(view, aimed)) return;

		const first = aimed === null;
		aimed = view;
		const ms = animate && !first ? duration(section, cue) : 0;
		if (ms > 0) camera.easeTo(view, { duration: ms });
		else camera.zoomTo(view);
	}

	return { section, update };
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
	const rect = rectOf(world, el);
	if (!rect) return null;
	const pad = Number(section.dataset.cameraPad);
	const fit = fitView([rect], {
		pad: Number.isFinite(pad) ? pad : PAD,
		aspect: width / height,
		minW: width / MAX_ZOOM,
	});
	return magnify(fit, target.zoom);
}

/**
 * An element's rect in slide px, measured through whatever transform is live
 * (Reveal's scale times the camera's), so it is right mid-move too.
 */
function rectOf(world, el) {
	const w = world.getBoundingClientRect();
	const t = el.getBoundingClientRect();
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
