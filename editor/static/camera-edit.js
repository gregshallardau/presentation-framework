/**
 * Camera edits for deck studio - the pure half (no DOM), shared by the browser
 * (camera.js) and the tests. Same shape as source-edit.js, which it builds on.
 *
 * A camera cue is `data-camera="<target>"` on a fragment (see docs/camera.md).
 * The studio writes it on an existing fragment of the step, or - when a step
 * has nothing to show - on an empty cue fragment: <span class="fragment"
 * data-camera="..."></span>.
 */
import { elementRange, parseStartTag } from './source-edit.js';

const round = (n, places) => {
	const f = 10 ** places;
	return Math.round(n * f) / f;
};
const trim = (n) => String(n);

/** The cue fragment markup for a target. */
export const cueFragment = (spec) => `<span class="fragment" data-camera="${spec}"></span>`;

/* ── Frames and targets ──────────────────────────────────────────────── */

/** A view `[cx, cy, w]` as the slide-px rectangle the camera sees. */
export function viewToRect([cx, cy, w], width, height) {
	const h = (w * height) / width;
	return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * A slide-px region as a position target, `"25% 30% 2x"`. The camera's frame
 * keeps the slide's aspect ratio, so the frame is the smallest one that holds
 * the whole region, centred on it.
 */
export function specFromRegion({ x, y, w, h }, width, height) {
	const frameW = Math.max(w, (h * width) / height, 1);
	const zoom = Math.max(1, width / frameW);
	const pct = (v, size) => trim(round((v / size) * 100, 1));
	return `${pct(x + w / 2, width)}% ${pct(y + h / 2, height)}% ${trim(round(zoom, 2))}x`;
}

/** A position target from a view (a frame the user nudged or typed). */
export function specFromView(view, width, height) {
	const r = viewToRect(view, width, height);
	return specFromRegion(r, width, height);
}

/** What a target is called in the UI. */
export function labelOf(spec) {
	const s = (spec ?? '').trim();
	if (!s || s.toLowerCase() === 'home') return 'home';
	return s;
}

/* ── Element ids (an element target is a selector, so the element needs one) ── */

/** A kebab slug for an element's id: its text, else its tag. */
export function idBase(text, tag) {
	const slug = String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 24)
		.replace(/-+$/, '');
	return slug || String(tag || 'target').toLowerCase();
}

/** `base`, or `base-2`, `base-3`... - whichever is not in `taken`. */
export function uniqueId(base, taken) {
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/* ── Adding and removing cue-only fragments ──────────────────────────── */

/**
 * Appends a cue fragment to an HTML slide: before its closing tag (and before
 * a trailing speaker-notes <aside>), indented like its siblings.
 * `offset` is the `<` of the slide's `<section>`.
 */
export function addHtmlCue(text, offset, spec) {
	const { innerStart, innerEnd } = elementRange(text, offset);
	const inner = text.slice(innerStart, innerEnd);
	const aside = [...inner.matchAll(/^[ \t]*<aside\b/gm)].pop();
	if (aside) {
		// above the notes, at the aside's own indent (its siblings')
		const at = innerStart + aside.index;
		return text.slice(0, at) + /^[ \t]*/.exec(aside[0])[0] + cueFragment(spec) + '\n' + text.slice(at);
	}
	const lineStart = text.lastIndexOf('\n', innerEnd - 1) + 1;
	const lead = text.slice(lineStart, innerEnd);
	if (lead.trim()) {
		// the closing tag shares a line with content: put the cue straight before it
		return text.slice(0, innerEnd) + cueFragment(spec) + text.slice(innerEnd);
	}
	// the closing tag is on its own line: one indent level deeper than it
	return text.slice(0, lineStart) + lead + '\t' + cueFragment(spec) + '\n' + text.slice(lineStart);
}

const MD_CUE = /<span\s+class="fragment"\s+data-camera="[^"]*"\s*><\/span>/;

/** The 1-based line of the `nth` cue-only fragment within Markdown lines [from, to]. */
export function findMdCueLine(text, from, to, nth = 0) {
	const lines = text.split('\n');
	const hits = [];
	for (let line = from; line <= Math.min(to, lines.length); line++)
		if (MD_CUE.test(lines[line - 1])) hits.push(line);
	return hits[nth] ?? null;
}

/** Appends a cue fragment to a Markdown sub-slide (lines [from, to]), above its `Note:`. */
export function addMdCue(text, from, to, spec) {
	const lines = text.split('\n');
	const last = Math.min(to, lines.length);
	let at = last; // insert after this 1-based line
	for (let line = from; line <= last; line++) {
		if (/^Note:/.test(lines[line - 1])) {
			at = line - 1;
			break;
		}
	}
	while (at > from && !lines[at - 1].trim()) at--;
	const block = [cueFragment(spec)];
	if (lines[at - 1]?.trim()) block.unshift('');
	lines.splice(at, 0, ...block);
	return lines.join('\n');
}

/** Rewrites the target of the Markdown cue-only fragment on `line`; null removes the line. */
export function setMdCue(text, line, spec) {
	const lines = text.split('\n');
	if (!MD_CUE.test(lines[line - 1] || '')) throw new Error('No camera cue on that line.');
	if (spec === null) {
		lines.splice(line - 1, 1);
		// don't leave a doubled blank line where the cue was
		if (!lines[line - 2]?.trim() && !lines[line - 1]?.trim() && line - 2 >= 0) lines.splice(line - 1, 1);
	} else lines[line - 1] = lines[line - 1].replace(MD_CUE, cueFragment(spec));
	return lines.join('\n');
}

/**
 * If the HTML element at `offset` is a cue-only fragment (an empty span with
 * only class / data-camera / data-fragment-index), returns the text with it
 * removed, along with the line it sat on. Otherwise null: the caller should
 * just drop the attribute.
 */
export function removeHtmlCueFragment(text, offset) {
	const tag = parseStartTag(text, offset);
	if (tag.name !== 'span') return null;
	if (tag.tokens.some((t) => !['class', 'data-camera', 'data-fragment-index'].includes(t.name)))
		return null;
	const range = elementRange(text, offset);
	if (!range || text.slice(range.innerStart, range.innerEnd).trim()) return null;
	// take the whole line when the span is alone on it
	const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
	const lineEnd = text.indexOf('\n', range.end);
	const before = text.slice(lineStart, offset);
	const after = text.slice(range.end, lineEnd < 0 ? text.length : lineEnd);
	if (!before.trim() && !after.trim())
		return text.slice(0, lineStart) + text.slice(lineEnd < 0 ? text.length : lineEnd + 1);
	return text.slice(0, offset) + text.slice(range.end);
}
