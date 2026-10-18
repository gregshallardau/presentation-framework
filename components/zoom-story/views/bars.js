// components/zoom-story/views/bars.js
// Stacked bars: root.left and root.right are two columns standing on one
// baseline, height = value, so the imbalance IS the height difference (a
// dashed line marks the shorter one's level across both). Expanding a node
// opens a new column beside it, outward, whose segments stack to exactly the
// parent's span - an icicle chart, mirrored. Collapsing slides them back in.
//
// Unlike the tree layouts, geometry depends on values (a `set` grows a bar),
// so this view supplies `place()`, re-run every beat. The height scale is
// fixed per story - the largest side total across ALL beats fills MAX_H - so
// bars stay comparable from beat to beat.
import { replay } from '../model.js';
import { readout } from './balance.js';

const COL_W = 230;
const COL_GAP = 80;
const MID = 70;          // gap between the two root columns
const MAX_H = 640;
const scales = new WeakMap();

function scaleFor(model) {
	if (!scales.has(model)) {
		let max = 0;
		for (let i = 0; i < model.beats.length; i++) {
			const v = replay(model, i).values;
			for (const s of model.sides) max = Math.max(max, Math.abs(v.get(s.id) || 0));
		}
		scales.set(model, max ? MAX_H / max : 1);
	}
	return scales.get(model);
}

const colX = (dir, depth) => dir * (MID / 2 + COL_W / 2 + depth * (COL_W + COL_GAP));

export const bars = {
	reach: 0,
	tilts: false,
	links: false,
	tilt: () => 0,
	anchor: (side) => ({ x: colX(side.dir, 0), y: 0 }),

	/** Centre-rects for every node at these values. */
	place(model, values) {
		const k = scaleFor(model);
		const pos = new Map();
		const stack = (id, top, dir) => {
			const n = model.nodes.get(id);
			const h = Math.max(0, values.get(id) || 0) * k;
			pos.set(id, { x: colX(dir, n.depth), y: top + h / 2, w: COL_W, h });
			let y = top;
			for (const c of n.children) {
				stack(c, y, dir);
				y += Math.max(0, values.get(c) || 0) * k;
			}
		};
		for (const s of model.sides) stack(s.id, -Math.max(0, values.get(s.id) || 0) * k, s.dir);
		return pos;
	},

	/** World rect of the decor (baseline, balance line, readout) for camera: 'root'. */
	rect(theta, model, values) {
		const k = scaleFor(model);
		const h = Math.max(...model.sides.map((s) => (values?.get(s.id) || 0) * k), 0);
		const half = MID / 2 + COL_W;
		return { x: -half, y: -h - 20, w: half * 2, h: h + 20 + 120 };
	},

	mount(g) {
		g.innerHTML = `
			<line class="ground baseline"/>
			<line class="level"/>
			<text class="readout" y="96"></text>`;
	},

	update() {},

	/** Per beat: baseline under every column, the dashed level of the shorter side. */
	decorate(g, model, values, pos) {
		const xs = [...pos.values()].flatMap((p) => [p.x - p.w / 2, p.x + p.w / 2]);
		const base = g.querySelector('.baseline');
		base.setAttribute('x1', Math.min(...xs) - 20);
		base.setAttribute('x2', Math.max(...xs) + 20);
		base.setAttribute('y1', 0);
		base.setAttribute('y2', 0);
		const k = scaleFor(model);
		const hs = model.sides.map((s) => (values.get(s.id) || 0) * k);
		const level = g.querySelector('.level');
		const y = -Math.min(...hs);
		const half = MID / 2 + COL_W;
		level.setAttribute('x1', -half - 10);
		level.setAttribute('x2', half + 10);
		level.setAttribute('y1', y);
		level.setAttribute('y2', y);
		level.classList.toggle('on', model.sides.length === 2 && Math.abs(hs[0] - hs[1]) > 0.5);
	},

	readout: (model, values, fmt) => (model.sides.length === 2 ? readout(model, values, fmt) : ''),
};
