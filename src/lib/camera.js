/**
 * Camera - a 2D "film camera" over a world that is drawn once and never moves.
 *
 * A view is `[cx, cy, w]`: the world point at the centre of the stage and the
 * world width visible across it (the d3.interpolateZoom convention). The
 * camera turns a view into a transform for one world element, so content keeps
 * its authored coordinates and only the framing changes.
 *
 * Moves use d3.interpolateZoom (van Wijk & Nuij), the smooth pan+zoom path
 * that pulls back, travels, then pushes in. A plain CSS transition interpolates
 * translate and scale independently, which swings the frame off course on
 * large zoom ratios.
 *
 * Generalised from the ideas-map camera; stage size is passed in, not imported.
 */
import { d3 } from '@/lib/d3.js';

/**
 * Fit a view around world-space rects (`{x, y, w, h}`, x/y = top-left).
 *
 * @param {{x:number,y:number,w:number,h:number}[]} rects
 * @param {{pad?: number, aspect?: number, minW?: number}} opts
 *   aspect = stage width / stage height; minW caps the zoom-in (view never
 *   narrower than this many world units).
 * @returns {[number, number, number]} view
 */
export function fitView(rects, { pad = 60, aspect = 16 / 9, minW = 0 } = {}) {
	if (!rects.length) return [0, 0, Math.max(minW, 1)];
	const x0 = Math.min(...rects.map((r) => r.x));
	const y0 = Math.min(...rects.map((r) => r.y));
	const x1 = Math.max(...rects.map((r) => r.x + r.w));
	const y1 = Math.max(...rects.map((r) => r.y + r.h));
	const w = Math.max(x1 - x0 + pad * 2, (y1 - y0 + pad * 2) * aspect, minW, 1);
	return [(x0 + x1) / 2, (y0 + y1) / 2, w];
}

/**
 * @param {(t: {k:number, tx:number, ty:number, view:number[]}) => void} apply
 *   called with the stage transform for every frame
 * @param {() => {width:number, height:number}} stageSize current stage px size
 */
export function makeCamera(apply, stageSize) {
	let current = [0, 0, 1];
	let timer = null;

	function set(view) {
		current = view;
		const { width, height } = stageSize();
		if (!width) return;
		const [cx, cy, w] = view;
		const k = width / w;
		apply({ k, tx: width / 2 - cx * k, ty: height / 2 - cy * k, view });
	}

	function stop() {
		timer?.stop();
		timer = null;
	}

	return {
		view: () => current,
		/** Jump straight to a view. */
		zoomTo(view) { stop(); set(view); },
		/** Re-apply the current view (after a stage resize). */
		refresh() { set(current); },
		stop,
		/** Tween to a view along the interpolateZoom path. */
		easeTo(target, { duration = 0, ease = d3.easeCubicInOut } = {}) {
			stop();
			if (duration <= 0) { set(target); return; }
			const i = d3.interpolateZoom(current, target);
			timer = d3.timer((elapsed) => {
				const t = Math.min(1, elapsed / duration);
				set(i(ease(t)));
				if (t === 1) stop();
			});
		},
	};
}
