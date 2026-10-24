/**
 * Mermaid diagrams for slides, drawn by md-doc-pipeline's own renderer.
 *
 * The deck has no Mermaid of its own: documents and slides share ONE renderer
 * (`md-doc diagram render`), so a diagram looks the same in both. Slide
 * assembly (build/vite-plugin-slides.js) hands every slide file to
 * `createPrerender().transform()`, which:
 *
 *   - replaces a fenced ```mermaid block in a .md slide, or
 *     <deck-mermaid><script type="text/mermaid">…</script></deck-mermaid> in an
 *     .html slide, with <deck-mermaid data-id="…"></deck-mermaid>;
 *   - and, in `finalize()`, renders each diagram once per deck theme (the
 *     default plus every [data-theme] skin) into one JSON data block that
 *     components/mermaid reads.
 *
 * Theme tokens are resolved here from the deck's CSS (primitives, semantic
 * vars, deck.css, [data-theme] blocks), so there is no browser in the build.
 *
 * md-doc is found via $MD_DOC_CMD (e.g. "uv run --project ../md-doc-pipeline
 * md-doc"), else `md-doc` on PATH, else `python3 -m md_doc`.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CSS_FILES = ['src/styles/vars/primitives.css', 'src/styles/vars/semantic.css', 'deck.css'];

const MD_FENCE = /^```mermaid[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;
const HTML_BLOCK =
	/<deck-mermaid([^>]*)>\s*<script\s+type="text\/mermaid">([\s\S]*?)<\/script>\s*<\/deck-mermaid>/gi;

// ── CSS tokens ────────────────────────────────────────────────────────────

function stripComments(css) {
	return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Flatten nested at-rules (@layer, @media …) into [{ selector, body }] rules. */
export function parseRules(css, out = []) {
	let i = 0;
	let start = 0;
	while (i < css.length) {
		const ch = css[i];
		if (ch === ';') {
			start = i + 1; // statement at-rule: `@layer a, b;`, `@import …;`
		} else if (ch === '{') {
			let depth = 1;
			let j = i + 1;
			while (j < css.length && depth) {
				if (css[j] === '{') depth++;
				else if (css[j] === '}') depth--;
				j++;
			}
			const selector = css.slice(start, i).trim();
			const body = css.slice(i + 1, j - 1);
			if (selector.startsWith('@')) parseRules(body, out);
			else out.push({ selector, body });
			i = j;
			start = j;
			continue;
		}
		i++;
	}
	return out;
}

function declarations(body) {
	const vars = {};
	for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) vars[m[1]] = m[2];
	return vars;
}

/** { '': {--x: value}, dark: {…} } - raw custom properties per skin, in source order. */
export function readSkins(root) {
	const skins = { '': {} };
	for (const file of CSS_FILES) {
		const p = path.join(root, file);
		if (!fs.existsSync(p)) continue;
		for (const { selector, body } of parseRules(stripComments(fs.readFileSync(p, 'utf8')))) {
			const themed = selector.match(/\[data-theme\s*=\s*["']?([\w-]+)["']?\]/);
			const isRoot = /(^|,)\s*(:root|html|:host)\b/.test(selector);
			if (!themed && !isRoot) continue;
			const name = themed ? themed[1] : '';
			skins[name] = { ...skins[name], ...declarations(body) };
		}
	}
	return skins;
}

function resolveValue(value, vars, depth = 0) {
	if (depth > 12) return value;
	return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, name, fallback) => {
		const found = vars[name];
		if (found !== undefined) return resolveValue(found, vars, depth + 1);
		return fallback !== undefined ? resolveValue(fallback.trim(), vars, depth + 1) : '';
	});
}

function toHex(value) {
	const v = (value || '').trim().toLowerCase();
	let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/);
	if (m) {
		const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
		return `#${h}`;
	}
	m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
	if (m) return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
	return null;
}

function luminance(hex) {
	const n = parseInt(hex.slice(1), 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * md-doc diagram theme per skin: { '': {primary, accent, body, muted, font, surface, mode, brand}, dark: … }.
 * A token that does not resolve to a plain colour is left out, so md-doc's default applies.
 */
export function readThemes(root) {
	const skins = readSkins(root);
	const themes = {};
	for (const name of Object.keys(skins)) {
		const vars = { ...skins[''], ...skins[name] };
		const get = (token) => resolveValue(vars[token] ?? '', vars);
		const theme = { brand: '1' };
		const colours = { primary: '--primary', accent: '--secondary', body: '--fg', muted: '--muted', surface: '--bg' };
		for (const [key, token] of Object.entries(colours)) {
			const hex = toHex(get(token));
			if (hex) theme[key] = hex;
		}
		const font = get('--font-body');
		if (font) theme.font = font;
		if (theme.surface) theme.mode = luminance(theme.surface) < 0.4 ? 'dark' : 'light';
		themes[name] = theme;
	}
	return themes;
}

// ── md-doc ────────────────────────────────────────────────────────────────

function mdDocCommands() {
	if (process.env.MD_DOC_CMD) return [process.env.MD_DOC_CMD.trim().split(/\s+/)];
	return [['md-doc'], ['python3', '-m', 'md_doc']];
}

/** Render jobs [{source, theme}] -> [{svg}|{error}] with md-doc. Throws if md-doc is unavailable. */
export function renderJobs(jobs, cwd = process.cwd()) {
	if (!jobs.length) return [];
	let lastError = 'md-doc not found';
	for (const [cmd, ...args] of mdDocCommands()) {
		const res = spawnSync(cmd, [...args, 'diagram', 'render'], {
			input: JSON.stringify(jobs),
			encoding: 'utf8',
			cwd,
			maxBuffer: 256 * 1024 * 1024,
		});
		if (res.error || res.status !== 0) {
			lastError = res.error?.message || res.stderr?.trim().split('\n').pop() || `exit ${res.status}`;
			continue;
		}
		try {
			const out = JSON.parse(res.stdout);
			if (Array.isArray(out) && out.length === jobs.length) return out;
			lastError = 'unexpected md-doc output';
		} catch {
			lastError = 'md-doc printed output that is not JSON';
		}
	}
	throw new Error(lastError);
}

// ── slide transform ───────────────────────────────────────────────────────

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

// Rendered SVG by sha1(source + theme); survives across assemblies in one dev session.
const cache = new Map();

export function createPrerender(root, { render = renderJobs, warn = (m) => console.warn(m) } = {}) {
	const sources = new Map(); // id -> source text

	function register(source) {
		const text = source.replace(/\r\n/g, '\n').trim();
		const id = hash(text);
		sources.set(id, text);
		return id;
	}

	return {
		/** Swap mermaid blocks in one slide file for <deck-mermaid data-id> placeholders. */
		transform(text, ext) {
			if (ext === 'md') {
				// Open tag alone on its line: Markdown keeps it a block, not a <p> (which the 32em measure would cap).
				return text.replace(MD_FENCE, (_, src) => `<deck-mermaid data-id="${register(src)}">\n</deck-mermaid>\n`);
			}
			return text.replace(HTML_BLOCK, (_, attrs, src) => `<deck-mermaid${attrs} data-id="${register(src)}"></deck-mermaid>`);
		},

		/** The JSON data block for every diagram seen, or '' when there were none. */
		finalize() {
			if (!sources.size) return '';
			const themes = readThemes(root);
			const jobs = [];
			const missing = [];
			for (const [id, source] of sources) {
				for (const [name, theme] of Object.entries(themes)) {
					const key = hash(source + JSON.stringify(theme));
					if (!cache.has(key)) missing.push({ key, source, theme });
					jobs.push({ id, name, key });
				}
			}
			if (missing.length) {
				try {
					const results = render(missing.map(({ source, theme }) => ({ source, theme })), root);
					missing.forEach((m, i) => cache.set(m.key, results[i]));
				} catch (e) {
					warn(`[deck-mermaid] diagrams not drawn: ${e.message} (set MD_DOC_CMD to your md-doc command)`);
					missing.forEach((m) => cache.set(m.key, { error: `md-doc unavailable: ${e.message}` }));
				}
			}
			const data = {};
			const warned = new Set();
			for (const { id, name, key } of jobs) {
				const result = cache.get(key);
				if (result?.error && !warned.has(id)) {
					warned.add(id);
					warn(`[deck-mermaid] ${result.error}`);
				}
				(data[id] ??= {})[name] = result?.svg ? { svg: result.svg } : { error: result?.error || 'not rendered', source: sources.get(id) };
			}
			// '<' is escaped so SVG text can never close the script element.
			const json = JSON.stringify(data).replace(/</g, '\\u003c');
			return `<script type="application/json" id="deck-mermaid-data">${json}</script>`;
		},
	};
}
