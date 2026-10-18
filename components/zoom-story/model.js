// components/zoom-story/model.js
// The story as data, and the one rule that makes it work across slides:
// the visual state is a pure function of the beat number,
//     state(n) = replay(beats[0..n])
// so any slide can open on beat n exactly - forwards, backwards, deep link,
// overview - and a story split across slides resumes where the last part ended.
// Pure: no DOM, no d3, so it runs under plain node.

/**
 * Normalise an authored story.
 *   { root?, nodes, panels?, beats, format?, camera? }
 * Every node: { label, value?, children?, tone? }. A node with children always shows
 * the sum of its children (an authored `value` on it is ignored).
 */
export function normalise(story) {
	const nodes = new Map();
	for (const [id, n] of Object.entries(story.nodes || {})) {
		nodes.set(id, {
			id,
			label: n.label ?? id,
			tone: n.tone ?? null,      // a SHARED_STYLES colour modifier: primary, success, warning...
			value: Number(n.value ?? 0),
			children: [...(n.children || [])],
			parent: null,
			depth: 0,
			side: null,
		});
	}
	for (const n of nodes.values()) {
		n.children = n.children.filter((c) => {
			if (!nodes.has(c)) { warn(`node "${n.id}" lists unknown child "${c}"`); return false; }
			nodes.get(c).parent = n.id;
			return true;
		});
	}

	const root = { view: 'balance', ...(story.root || {}) };
	// two-sided views (balance, bars) name left/right; one-sided ones name a node
	const sides = root.left && root.right
		? [{ id: root.left, dir: -1 }, { id: root.right, dir: 1 }]
		: [{ id: root.node ?? [...nodes.values()].find((n) => !n.parent)?.id, dir: 1 }];
	for (const s of sides) {
		if (!nodes.has(s.id)) { warn(`root side "${s.id}" is not a node`); continue; }
		// children inherit their nearest ancestor's tone
		const walk = (id, depth, tone) => {
			const n = nodes.get(id);
			n.depth = depth;
			n.side = s.dir;
			n.tone = n.tone ?? tone;
			n.children.forEach((c) => walk(c, depth + 1, n.tone));
		};
		walk(s.id, 0, null);
	}

	return {
		root,
		sides: sides.filter((s) => nodes.has(s.id)),
		nodes,
		panels: new Map(Object.entries(story.panels || {})),
		beats: story.beats?.length ? story.beats : [{ show: '*' }],
		format: story.format || {},
		camera: { pad: 70, maxZoom: 2, ...(story.camera || {}) },
	};
}

/** Leaf values under `id` (the node itself when it is a leaf). */
function leaves(model, id) {
	const n = model.nodes.get(id);
	return n.children.length ? n.children.flatMap((c) => leaves(model, c)) : [id];
}

/**
 * Resolve a selector to ids. Accepts an array or csv string of tokens:
 *   'in'   that node (or panel, or 'root' - the seesaw itself)
 *   'in.*' that node and everything under it
 *   '*'    every node
 */
export function select(model, spec) {
	if (spec == null) return [];
	const tokens = Array.isArray(spec) ? spec : String(spec).split(',');
	const out = [];
	const under = (id) => [id, ...model.nodes.get(id).children.flatMap(under)];
	for (const raw of tokens) {
		const t = String(raw).trim();
		if (!t) continue;
		if (t === '*') out.push(...model.nodes.keys());
		else if (t.endsWith('.*') && model.nodes.has(t.slice(0, -2))) out.push(...under(t.slice(0, -2)));
		else if (model.nodes.has(t) || model.panels.has(t) || t === 'root') out.push(t);
		else warn(`unknown id "${t}"`);
	}
	return [...new Set(out)];
}

/** Value of every node: leaves as set, parents summed. */
export function totals(model, leafValues) {
	const v = new Map();
	const sum = (id) => {
		const n = model.nodes.get(id);
		const val = n.children.length ? n.children.reduce((s, c) => s + sum(c), 0) : leafValues.get(id);
		v.set(id, val);
		return val;
	};
	for (const n of model.nodes.values()) if (!n.parent) sum(n.id);
	return v;
}

/** Is a node on screen: shown, or opened up by an expanded parent - and not hidden. */
export function isVisible(model, s, id) {
	if (s.hidden.has(id)) return false;
	if (s.shown.has(id)) return true;
	const p = model.nodes.get(id)?.parent;
	return !!p && s.expanded.has(p) && isVisible(model, s, p);
}

/**
 * Replay beats 0..n into one state.
 * Beat verbs: show, hide, expand, collapse, set, hint, camera.
 *   set   { id: 120 } absolute, { id: '+20' } / '-20' relative. Setting a
 *         parent scales its leaves proportionally, so totals stay consistent.
 *   hint  ['raise:in', 'lower:out'] - transient, only on the beat that names it
 *   camera 'auto' (fit everything visible) | selector | panel id. Holds until
 *         the next beat that names one; resolved against the state at the beat
 *         that cued it, so later value changes never nudge the frame.
 */
export function replay(model, n) {
	const s = {
		beat: Math.max(0, Math.min(n, model.beats.length - 1)),
		shown: new Set(),
		hidden: new Set(),
		expanded: new Set(),
		leaf: new Map([...model.nodes.values()].filter((x) => !x.children.length).map((x) => [x.id, x.value])),
		hints: [],
		camera: null,
	};

	for (let i = 0; i <= s.beat; i++) {
		const b = model.beats[i] || {};
		for (const id of select(model, b.show)) { s.shown.add(id); s.hidden.delete(id); }
		for (const id of select(model, b.hide)) { s.shown.delete(id); s.hidden.add(id); }
		for (const id of select(model, b.expand)) {
			if (model.nodes.get(id)?.children.length) { s.expanded.add(id); s.hidden.delete(id); }
		}
		for (const id of select(model, b.collapse)) s.expanded.delete(id);
		for (const [id, raw] of Object.entries(b.set || {})) applySet(model, s, id, raw);
		s.hints = [].concat(b.hint || []).flatMap((h) => String(h).split(',')).map((h) => {
			const [dir, id] = h.trim().split(':');
			return { dir, id };
		}).filter((h) => model.nodes.has(h.id));

		if (b.camera != null || i === 0) {
			const spec = b.camera ?? 'auto';
			// flying to a panel shows it
			for (const id of select(model, spec === 'auto' ? [] : spec)) {
				if (model.panels.has(id)) { s.shown.add(id); s.hidden.delete(id); }
			}
			s.camera = { spec, snapshot: null };
			s.camera.snapshot = snapshot(model, s);
		}
	}

	s.values = totals(model, s.leaf);
	return s;
}

function snapshot(model, s) {
	return {
		shown: new Set(s.shown),
		hidden: new Set(s.hidden),
		expanded: new Set(s.expanded),
		values: totals(model, s.leaf),
	};
}

function applySet(model, s, id, raw) {
	if (!model.nodes.has(id)) { warn(`set: unknown node "${id}"`); return; }
	const current = totals(model, s.leaf).get(id);
	const str = String(raw).trim();
	const target = /^[+-]/.test(str) ? current + Number(str) : Number(str);
	if (!Number.isFinite(target)) { warn(`set: "${raw}" is not a number`); return; }
	const ls = leaves(model, id);
	if (ls.length === 1 && ls[0] === id) { s.leaf.set(id, target); return; }
	for (const l of ls) {
		s.leaf.set(l, current ? (s.leaf.get(l) * target) / current : target / ls.length);
	}
}

function warn(msg) {
	console.warn(`[deck-zoom-story] ${msg}`);
}
