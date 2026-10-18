// Unsaved-buffer store behind the live preview - the counterpart of md-doc
// editor's make_snapshot() overlay. The editor POSTs its dirty slide buffers
// under a per-tab preview id; build/vite-plugin-slides.js assembles
// `/?__preview=<id>` from them (falling back to disk for every other file).
// Held in memory only; nothing here is ever written to disk. transform() adds
// source positions to HTML slides (annotate.js) so preview clicks map to source.

import { annotateHtml } from './annotate.js';

const MAX_PREVIEWS = 32;

export function createOverlay() {
	const previews = new Map(); // id -> { buffers: { 'slides/<file>': text }, at }
	return {
		get(id) {
			return previews.get(id)?.buffers ?? null;
		},
		set(id, buffers) {
			previews.delete(id);
			previews.set(id, { buffers, at: Date.now() });
			while (previews.size > MAX_PREVIEWS) previews.delete(previews.keys().next().value);
		},
		transform(path, text) {
			return /\.html$/i.test(path) ? annotateHtml(text, path) : text;
		},
		// A saved file is on disk now; never let a stale buffer shadow it.
		dropPath(path) {
			for (const entry of previews.values()) delete entry.buffers[path];
		},
	};
}
