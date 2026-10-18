// components/zoom-story/views/balance.js
// The seesaw: a beam on a fulcrum, root.left's node on the left end and
// root.right's on the right. Tilt follows the RELATIVE imbalance, so the same
// rule reads the same whether the totals are 1 or 1,000,000:
//     θ = clamp(TILT · (right − left) / (left + right), ±MAX)
// Positive θ = right end down (SVG y points down).
import { ANCHOR } from '../layout.js';

const L = 320;                       // beam half-length
const FULCRUM = { w: 110, h: 100 };
const BEAM_T = 12;                   // beam thickness
const TILT = (40 * Math.PI) / 180;
const MAX = (14 * Math.PI) / 180;
const SIT = ANCHOR.h / 2 + BEAM_T;    // card centre above the beam end

export const balance = {
	reach: L,

	tilt(model, values) {
		const a = values.get(model.root.left) ?? 0;
		const b = values.get(model.root.right) ?? 0;
		if (a + b === 0) return 0;
		return Math.max(-MAX, Math.min(MAX, (TILT * (b - a)) / (Math.abs(a) + Math.abs(b))));
	},

	/** Centre of a side's anchor card at tilt θ. */
	anchor(side, theta) {
		return { x: side.dir * L * Math.cos(theta), y: side.dir * L * Math.sin(theta) - SIT };
	},

	/** World rect the seesaw itself occupies (for camera: 'root'). */
	rect(theta) {
		const lift = L * Math.abs(Math.sin(theta));
		return {
			x: -L - ANCHOR.w / 2,
			y: -SIT - ANCHOR.h / 2 - lift,
			w: 2 * L + ANCHOR.w,
			h: SIT + ANCHOR.h / 2 + lift + FULCRUM.h + 70,
		};
	},

	/** Build the decor into an SVG group (once). */
	mount(g) {
		g.innerHTML = `
			<path class="fulcrum" d="M0,${BEAM_T / 2} L${FULCRUM.w / 2},${FULCRUM.h} L${-FULCRUM.w / 2},${FULCRUM.h} Z"/>
			<line class="ground" x1="${-FULCRUM.w}" x2="${FULCRUM.w}" y1="${FULCRUM.h}" y2="${FULCRUM.h}"/>
			<g class="beam"><rect x="${-L - 20}" y="${-BEAM_T / 2}" width="${2 * L + 40}" height="${BEAM_T}" rx="${BEAM_T / 2}"/></g>
			<circle class="pivot" r="${BEAM_T * 0.7}"/>
			<text class="readout" y="${FULCRUM.h + 52}"></text>`;
	},

	/** Per-frame update of the decor for tilt θ. */
	update(g, theta) {
		g.querySelector('.beam').setAttribute('transform', `rotate(${(theta * 180) / Math.PI})`);
	},

	readout(model, values, fmt) {
		const l = model.nodes.get(model.root.left);
		const r = model.nodes.get(model.root.right);
		const a = values.get(l.id); const b = values.get(r.id);
		if (Math.abs(a - b) < 1e-9) return 'In balance';
		const [big, small] = a > b ? [l, r] : [r, l];
		return `${big.label} exceeds ${small.label} by ${fmt(Math.abs(a - b))}`;
	},
};
