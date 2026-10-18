// components/zoom-story/layout.js
// World coordinates for the whole story, computed once from the FULL tree, so
// a node never moves when its siblings expand - the camera does the moving
// (the word-association slide's "draw the board once" rule).
//
// World units are CSS px of the un-zoomed world. Each side's root (the anchor:
// In / Out on a seesaw) sits at the view's anchor point; its subtree fans
// outward, one column per depth, each node centred on the span its leaves need.
// Pure: no DOM.

export const ANCHOR = { w: 260, h: 120 };
export const NODE = { w: 210, h: 96 };
export const GAP_X = 360;   // centre-to-centre per depth
export const GAP_Y = 140;   // centre-to-centre per leaf row

export const size = (n) => (n.depth === 0 ? ANCHOR : NODE);

function leafCount(model, id) {
	const n = model.nodes.get(id);
	return n.children.length ? n.children.reduce((s, c) => s + leafCount(model, c), 0) : 1;
}

/**
 * Rest positions (centres) for every node, given each side's anchor at rest.
 * @param {(side) => {x:number,y:number}} anchorAt rest anchor for a side
 * @param {number} reach x distance from the view's centre to a side's anchor
 * @returns {Map<string, {x:number, y:number, w:number, h:number}>}
 */
export function layout(model, anchorAt, reach) {
	const pos = new Map();
	const place = (id, cx, cy, dir) => {
		const n = model.nodes.get(id);
		pos.set(id, { x: cx, y: cy, ...size(n) });
		let start = cy - (leafCount(model, id) * GAP_Y) / 2;
		for (const c of n.children) {
			const span = leafCount(model, c) * GAP_Y;
			const cn = model.nodes.get(c);
			place(c, dir * (reach + cn.depth * GAP_X), start + span / 2, dir);
			start += span;
		}
	};
	for (const side of model.sides) {
		const a = anchorAt(side);
		place(side.id, a.x, a.y, side.dir);
	}
	return pos;
}

/** A node/panel centre-box as a top-left rect. */
export const rectOf = (p) => ({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h });

/**
 * Panel rects. Spec: { at, side?, w?, h?, gap? } placed beside node `at`
 * (side: 'outer' (default, away from centre) | 'above' | 'below' | 'left' |
 * 'right'), or { x, y, w, h } as an absolute world centre.
 */
export function placePanels(model, pos) {
	const out = new Map();
	for (const [id, p] of model.panels) {
		const w = p.w ?? 480;
		const h = p.h ?? Math.round(w * 0.6);
		const gap = p.gap ?? 40;
		const at = pos.get(p.at);
		if (!at) { out.set(id, { x: p.x ?? 0, y: p.y ?? 0, w, h }); continue; }
		const dir = model.nodes.get(p.at).side ?? 1;
		const side = p.side ?? 'outer';
		const dx = (at.w + w) / 2 + gap;
		const dy = (at.h + h) / 2 + gap;
		const off = {
			outer: [dir * dx, 0], left: [-dx, 0], right: [dx, 0],
			above: [0, -dy], below: [0, dy],
		}[side] || [dir * dx, 0];
		out.set(id, { x: at.x + off[0], y: at.y + off[1], w, h });
	}
	return out;
}
