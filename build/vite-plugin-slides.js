/**
 * deck-slides - assembles slides/*.{html,md} into Reveal's <div class="slides">
 * at the `<!-- @slides -->` marker in index.html.
 *
 * - Runs via transformIndexHtml (order: 'pre'), so it fires identically for
 *   `npm start`, `vite build`, and `build:deck`.
 * - Slide files are read with fs, never imported - they stay out of the module
 *   graph. The dev watcher triggers a full reload on add/change/unlink; the reload
 *   re-runs transformIndexHtml. Reveal restores position from `hash: true`.
 *
 * Conventions (see slides/README.md):
 *   NN[.M]-<slug>.<html|md>   NN = zero-padded major (step 10, gaps left for
 *                             inserting later without renumbering), .M = vertical-stack minor
 *   one file  = one horizontal slide position
 *   shared NN = one vertical <section> stack, files ordered by .M
 *   .html body = exactly one <section>...</section> (may nest <section>s)
 *   .md body   = raw Markdown (wrapped here as an inline text/template)
 *
 * Preview overlay (used only by the GUI editor, editor/server/plugin.js): pass
 * `slides({ overlay })`, where `overlay.get(id)` returns { 'slides/<file>': text }
 * for unsaved editor buffers. A request for `/?__preview=<id>` then assembles
 * from those buffers instead of the files on disk (and passes every file through
 * `overlay.transform(key, text)` when defined). Without an overlay, or
 * without the query parameter, assembly is unchanged.
 *
 * Reloads: by default a slide-file change sends Vite's `full-reload` to every
 * page. `slides({ reload: 'event' })` (the GUI editor) sends the custom HMR
 * event `deck:slides-changed` instead; src/main.js reloads ordinary deck pages
 * on it, while editor previews are refreshed by the editor itself - off
 * screen, so the visible preview never flashes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SLIDE_RE, natSort, parseSlideFilename as parse } from '../scripts/lib/slide-files.js';

const DIR = 'slides';
const MARKER = '<!-- @slides -->';
const VSEP = '\\r?\\n--\\r?\\n'; // "--" fence => vertical sub-slide within one .md file
const NSEP = '^Note:';

function renderMd(raw, slug) {
	const safe = raw.replace(/<\/script>/gi, '<\\/script>');
	return (
		`<section data-markdown id="${slug}" data-slug="${slug}" ` +
		`data-separator-vertical="${VSEP}" data-separator-notes="${NSEP}">` +
		`<script type="text/template">\n${safe}\n</script></section>`
	);
}

function injectAttrs(html, slug) {
	const openTag = html.slice(0, html.indexOf('>') + 1);
	if (/\bdata-slug=/.test(openTag) || /\bid=/.test(openTag)) return html; // author set one
	return html.replace(/<section(\s|>)/i, `<section id="${slug}" data-slug="${slug}"$1`);
}

function assemble(root, read = (file) => fs.readFileSync(file, 'utf8')) {
	const dir = path.join(root, DIR);
	if (!fs.existsSync(dir)) return '';

	const files = fs
		.readdirSync(dir)
		.filter((f) => SLIDE_RE.test(f) && f.toLowerCase() !== 'readme.md')
		.sort(natSort);

	const groups = new Map();
	for (const f of files) {
		const meta = parse(f);
		if (!groups.has(meta.major)) groups.set(meta.major, []);
		groups.get(meta.major).push({ f, meta });
	}

	const out = [];
	for (const [, items] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
		const sections = items.map(({ f, meta }) => {
			const raw = read(path.join(dir, f));
			return meta.ext === 'md'
				? renderMd(raw, meta.slug)
				: injectAttrs(raw.trim(), meta.slug);
		});
		out.push(
			sections.length > 1
				? `<section class="stack">\n${sections.join('\n')}\n</section>`
				: sections[0]
		);
	}
	return out.join('\n');
}

// Reader that prefers the overlay's unsaved buffers, keyed 'slides/<file>', and
// lets the overlay decorate every file (the editor adds source positions).
function overlayReader(overlay, buffers) {
	return (file) => {
		const key = `${DIR}/${path.basename(file)}`;
		const text = buffers[key] ?? fs.readFileSync(file, 'utf8');
		return overlay.transform ? overlay.transform(key, text) : text;
	};
}

function previewId(url) {
	if (!url || !url.includes('__preview=')) return null;
	return new URL(url, 'http://localhost').searchParams.get('__preview');
}

export default function slidesPlugin({ overlay, reload: reloadMode = 'full' } = {}) {
	let root = process.cwd();
	return {
		name: 'deck-slides',
		enforce: 'pre',
		configResolved(cfg) {
			root = cfg.root;
		},
		transformIndexHtml: {
			order: 'pre',
			handler(html, ctx) {
				if (!html.includes(MARKER)) {
					this?.warn?.(`[deck-slides] "${MARKER}" not found in index.html - no slides injected`);
					return html;
				}
				const id = overlay && previewId(ctx?.originalUrl);
				const buffers = id ? overlay.get(id) : null;
				return html.replace(MARKER, () => (buffers ? assemble(root, overlayReader(overlay, buffers)) : assemble(root)));
			},
		},
		configureServer(server) {
			const dir = path.join(root, DIR);
			server.watcher.add(dir);
			const reload = (file) => {
				if (file.startsWith(dir) && SLIDE_RE.test(file)) {
					server.ws.send(
						reloadMode === 'event' ? { type: 'custom', event: 'deck:slides-changed' } : { type: 'full-reload' }
					);
				}
			};
			server.watcher.on('add', reload).on('unlink', reload).on('change', reload);
		},
	};
}
