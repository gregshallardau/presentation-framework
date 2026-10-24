/**
 * Vega-Lite / Vega integration - data charts from a spec.
 * Imported lazily by components that need it, not from main.js.
 *
 * The spec carries data and encodings only. Colours, fonts and axis styling
 * come from the deck theme through `vegaConfig`, which mirrors
 * md-doc-pipeline's `md_doc/charts.py:vega_config` key for key, so a spec
 * copied between a document and a slide produces the same chart. Keep the two
 * in step when either changes.
 */

// Charts lead with the brand primary only; the rest are the validated categorical slots
// (a quiet secondary colour such as charcoal makes a poor second series).
// Validated categorical slots, fixed order (shared with md-doc-pipeline's
// mermaid.py `_CATEGORICAL` / `_CATEGORICAL_DARK`).
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

function rgb(hex) {
	let h = hex.trim().replace('#', '');
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	const n = parseInt(h.slice(0, 6), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function distance(a, b) {
	const ra = rgb(a), rb = rgb(b);
	return Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2]);
}

/** Eight series colours: `lead` colours that are clearly different first, then the
 * validated categorical colours that stay clearly different from those chosen. */
export function seriesPalette(lead, dark = false, size = 8) {
	const fallback = dark ? CATEGORICAL_DARK : CATEGORICAL;
	const chosen = [];
	for (const c of lead) {
		if (chosen.length < size && chosen.every((x) => distance(c, x) >= 90)) chosen.push(c);
	}
	for (const c of fallback) {
		if (chosen.length === size) break;
		if (chosen.every((x) => distance(c, x) >= 90)) chosen.push(c);
	}
	for (const c of fallback) {
		if (chosen.length === size) break;
		if (!chosen.includes(c)) chosen.push(c);
	}
	return chosen;
}

/** Resolve any CSS colour (var(), oklch(), color-mix(), names) to #rrggbb. A canvas
 * converts to sRGB for every syntax the browser understands; getComputedStyle would
 * hand back oklch() text unchanged. */
let ctx2d;
function toHex(_el, value) {
	ctx2d ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	ctx2d.clearRect(0, 0, 1, 1);
	ctx2d.fillStyle = '#000000';
	ctx2d.fillStyle = value; // an unparseable value leaves the black default
	ctx2d.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx2d.getImageData(0, 0, 1, 1).data;
	return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Theme tokens read live from the deck's semantic custom properties. */
export function readTokens(el, scale = 1) {
	const cs = getComputedStyle(el);
	const get = (name) => cs.getPropertyValue(name).trim();
	const bg = toHex(el, get('--bg') || '#ffffff');
	const dark = rgbLuminance(bg) < 0.4;
	return {
		dark,
		scale,
		font: get('--font-body') || 'sans-serif',
		ink: toHex(el, get('--fg') || '#1f2328'),
		ink2: toHex(el, get('--muted') || '#57606a'),
		line: toHex(el, get('--line') || '#c3c2b7'),
		grid: mix(toHex(el, get('--line') || '#c3c2b7'), bg, 0.5),
		primary: toHex(el, get('--primary') || CATEGORICAL[0]),
		secondary: toHex(el, get('--secondary') || CATEGORICAL[1]),
	};
}

/** `a` mixed toward `b` by `f` (0 = a, 1 = b), as #rrggbb. */
function mix(a, b, f) {
	const ra = rgb(a), rb = rgb(b);
	return '#' + ra.map((v, i) => Math.round(v + (rb[i] - v) * f).toString(16).padStart(2, '0')).join('');
}

function rgbLuminance(hex) {
	const [r, g, b] = rgb(hex).map((v) => v / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Vega `config` from theme tokens - same keys as md_doc.charts.vega_config. */
export function vegaConfig(t) {
	const k = t.scale || 1; // slides are drawn on a 1920px canvas: type and strokes scale up
	const palette = seriesPalette([t.primary], t.dark);
	return {
		background: null,
		font: t.font,
		view: { stroke: null },
		range: { category: palette, ordinal: palette },
		title: { font: t.font, color: t.ink, fontSize: 14 * k, fontWeight: 600, anchor: 'start' },
		axis: {
			labelFont: t.font,
			titleFont: t.font,
			labelColor: t.ink2,
			titleColor: t.ink2,
			labelFontSize: 11 * k,
			titleFontSize: 11 * k,
			titleFontWeight: 500,
			domainColor: t.line,
			tickColor: t.line,
			gridColor: t.grid,
			tickSize: 5 * k,
			labelPadding: 2 * k,
			labelAngle: 0,
			labelOverlap: true,
			labelSeparation: 6,
		},
		legend: {
			labelFont: t.font,
			titleFont: t.font,
			labelColor: t.ink2,
			titleColor: t.ink2,
			labelFontSize: 11 * k,
			titleFontSize: 11 * k,
			symbolSize: 100 * k * k,
		},
		text: { font: t.font, color: t.ink, fontSize: 11 * k },
		mark: { color: palette[0] },
		line: { strokeWidth: 2 * k },
		point: { size: 30 * k * k },
		circle: { size: 30 * k * k },
		square: { size: 30 * k * k },
	};
}

/** True for a full Vega spec, false for Vega-Lite (the default). Mirrors charts.is_vega. */
export function isVega(spec) {
	if (spec.$schema) return /\/vega\//.test(spec.$schema);
	return 'marks' in spec && !('mark' in spec);
}

/** Defaults a slide needs, mirroring charts.prepare_spec (size via the host box). */
const COMPOUND_KEYS = ['repeat', 'facet', 'concat', 'hconcat', 'vconcat'];

export function prepareSpec(spec) {
	const out = { ...spec };
	// Repeats, facets and concatenations size their inner views; a top-level width would be invalid.
	if (COMPOUND_KEYS.some((k) => k in out)) return out;
	if (out.width === undefined) out.width = 'container';
	if (out.height === undefined) out.height = 'container';
	if (out.autosize === undefined) out.autosize = { type: 'fit', contains: 'padding' };
	return out;
}

/** True when the spec carries its own layout (a full Vega spec, a compound spec, or a numeric size). */
export function isFixedLayout(spec) {
	return isVega(spec) || COMPOUND_KEYS.some((k) => k in spec) || (typeof spec.width === 'number' && typeof spec.height === 'number');
}

/** A full Vega spec with no size gets a document-column default (mirrors md-doc's charts.prepare_spec). */
export function prepareFixed(spec) {
	const out = { ...spec };
	if (isVega(out) && !COMPOUND_KEYS.some((k) => k in out)) {
		if (typeof out.width !== 'number') out.width = 560;
		if (typeof out.height !== 'number') out.height = 360;
	}
	return out;
}

// Basemaps referenced as `url: vega-datasets:<name>` - bundled, never fetched (see ./data/README.md).
const BUILTIN_DATA = {
	'world-110m': () => import('./data/world-110m.json'),
	'us-10m': () => import('./data/us-10m.json'),
};
const DATASET_SCHEME = 'vega-datasets:';

/** A copy of `spec` with every built-in dataset url replaced by inline values. */
export async function resolveBuiltinData(spec) {
	const names = new Set();
	(function find(n) {
		if (Array.isArray(n)) return n.forEach(find);
		if (!n || typeof n !== 'object') return;
		if (typeof n.url === 'string' && n.url.startsWith(DATASET_SCHEME)) names.add(n.url.slice(DATASET_SCHEME.length));
		Object.values(n).forEach(find);
	})(spec);
	if (!names.size) return spec;
	const data = {};
	for (const name of names) {
		if (!BUILTIN_DATA[name]) throw new Error(`Unknown built-in dataset “${name}” (available: ${Object.keys(BUILTIN_DATA).join(', ')})`);
		data[name] = (await BUILTIN_DATA[name]()).default;
	}
	const swap = (n) => {
		if (Array.isArray(n)) return n.map(swap);
		if (!n || typeof n !== 'object') return n;
		const out = {};
		for (const [k, v] of Object.entries(n)) out[k] = swap(v);
		if (typeof out.url === 'string' && out.url.startsWith(DATASET_SCHEME)) {
			out.values = data[out.url.slice(DATASET_SCHEME.length)];
			delete out.url;
		}
		return out;
	};
	return swap(spec);
}

export async function loadEmbed() {
	const mod = await import('vega-embed');
	return mod.default;
}
