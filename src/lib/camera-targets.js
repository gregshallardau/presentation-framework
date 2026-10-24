/**
 * Camera targets - the pure half of slide-camera.js (no DOM, no imports), so
 * the grammar and the view maths can be unit-tested under plain node.
 *
 * A target is the string in a `data-camera` attribute:
 *
 *   home                  the whole slide
 *   25% 30% 2x            centre of the view at 25% across, 30% down, 2x zoom
 *   25% 30%               same, at the default point zoom
 *   #chart                fit this element (any selector inside the slide)
 *   #chart 1.5x           fit it, then push in a further 1.5x
 *
 * Zoom is magnification: 1x is the full slide, 2x shows half its width.
 * A view is `[cx, cy, w]` in slide px (the camera.js convention): the slide
 * point at the centre of the frame and the slide width visible across it.
 */

/** Zoom for `25% 30%` with no `Nx`: a point target with no zoom would be home. */
export const DEFAULT_POINT_ZOOM = 2;

const NUM = '-?\\d*\\.?\\d+';
const POINT = new RegExp(`^(${NUM})%\\s+(${NUM})%(?:\\s+(\\d*\\.?\\d+)x)?$`, 'i');
const ZOOM_SUFFIX = /\s+(\d*\.?\d+)x$/i;

const positive = (n, fallback) => (Number.isFinite(n) && n > 0 ? n : fallback);

/**
 * @param {string|null|undefined} raw a `data-camera` value
 * @returns {{kind:'home'}
 *   | {kind:'point', x:number, y:number, zoom:number}
 *   | {kind:'element', selector:string, zoom:number}}
 */
export function parseTarget(raw) {
	const s = (raw ?? '').trim();
	if (!s || s.toLowerCase() === 'home') return { kind: 'home' };

	const point = s.match(POINT);
	if (point) {
		return {
			kind: 'point',
			x: Number(point[1]) / 100,
			y: Number(point[2]) / 100,
			zoom: positive(Number(point[3]), DEFAULT_POINT_ZOOM),
		};
	}

	const suffix = s.match(ZOOM_SUFFIX);
	return {
		kind: 'element',
		selector: suffix ? s.slice(0, suffix.index).trim() : s,
		zoom: suffix ? positive(Number(suffix[1]), 1) : 1,
	};
}

/** The whole slide. */
export function homeView(width, height) {
	return [width / 2, height / 2, width];
}

/** A view centred on a fractional slide position at a magnification. */
export function pointView({ x, y, zoom }, width, height) {
	return [x * width, y * height, width / zoom];
}

/** Magnify a view about its own centre (zoom > 1 pushes in). */
export function magnify([cx, cy, w], zoom) {
	return [cx, cy, w / zoom];
}

/**
 * Slide the view back inside the slide so the camera never shows the void
 * beyond an edge. A view wider or taller than the slide is centred on that
 * axis instead (there is nothing to clamp against).
 */
export function clampView([cx, cy, w], width, height) {
	const h = (w * height) / width;
	const fit = (c, size, max) => (size >= max ? max / 2 : Math.min(Math.max(c, size / 2), max - size / 2));
	return [fit(cx, w, width), fit(cy, h, height), w];
}

/**
 * The cue that decides the camera for the current step: among the cue
 * fragments already shown, the one latest in fragment order (ties go to the
 * later in document order). Returns null when no cue has fired - the slide's
 * own starting view applies. This is what makes camera state a pure function
 * of the step number, so back-navigation and deep links land correctly.
 *
 * @template T
 * @param {{ cue: T, index: number, visible: boolean }[]} cues in document order
 * @returns {T|null}
 */
export function pickCue(cues) {
	let best = null;
	for (const c of cues) {
		if (c.visible && (best === null || c.index >= best.index)) best = c;
	}
	return best ? best.cue : null;
}

/** True when two views are the same to within half a pixel. */
export function sameView(a, b) {
	return !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) < 0.5);
}
