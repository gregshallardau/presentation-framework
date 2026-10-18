/**
 * Source edits for Reveal's own animation markup - the engine behind the
 * animation timeline and the auto-animate tools. Pure string functions (no DOM),
 * shared by the browser (editor.js) and the tests.
 *
 * Everything is written as Reveal-native markup, never a runtime of our own:
 *   HTML slides  attributes / classes on the element's start tag
 *   .md slides   one `<!-- .element: … -->` comment per line (element) and one
 *                `<!-- .slide: … -->` comment per sub-slide (slide)
 *
 * A target names what to edit:
 *   { kind: 'html', offset }        the `<` of an element's start tag
 *   { kind: 'md', line }            a 1-based line holding the element
 *   { kind: 'md-slide', line }      the first line of a Markdown sub-slide
 *
 * Markdown placement follows how Reveal's Markdown plugin attaches a comment:
 * to the element *before* it, or to the parent block when the comment is the
 * block's first child. So a new comment goes right after a list marker or
 * heading hashes (always the block), and at the end of a paragraph line (the
 * paragraph only when the line has no inline markup - see mdPlacementWarning).
 */

export const FRAGMENT_EFFECTS = [
	'fade-in',
	'fade-up',
	'fade-down',
	'fade-left',
	'fade-right',
	'fade-out',
	'fade-in-then-out',
	'fade-in-then-semi-out',
	'semi-fade-out',
	'current-visible',
	'grow',
	'shrink',
	'zoom-in',
	'strike',
	'highlight-red',
	'highlight-green',
	'highlight-blue',
	'highlight-current-red',
	'highlight-current-green',
	'highlight-current-blue',
];

export const EASINGS = [
	'ease',
	'ease-in',
	'ease-out',
	'ease-in-out',
	'linear',
	'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
];

/* ── HTML start tags ─────────────────────────────────────────────────── */

const ATTR = /(\s+)([^\s=>/"']+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>"']+))?/y;

/** Parses the start tag at `offset`: { name, end, tokens: [{ ws, name, raw, value }], close }. */
export function parseStartTag(text, offset) {
	const head = /^<([a-zA-Z][\w:-]*)/.exec(text.slice(offset, offset + 64));
	if (!head) throw new Error(`No start tag at offset ${offset}`);
	let i = offset + head[0].length;
	const tokens = [];
	for (;;) {
		ATTR.lastIndex = i;
		const m = ATTR.exec(text);
		if (!m) break;
		const value = m[4] === undefined ? '' : m[4].replace(/^["']|["']$/g, '');
		tokens.push({ ws: m[1], name: m[2], raw: m[0], value, bare: m[4] === undefined });
		i = ATTR.lastIndex;
	}
	const close = /^\s*\/?>/.exec(text.slice(i, i + 64));
	if (!close) throw new Error(`Unterminated start tag at offset ${offset}`);
	return {
		name: head[1].toLowerCase(),
		start: offset,
		attrsEnd: i,
		end: i + close[0].length,
		tokens,
		close: close[0],
	};
}

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Attributes of a parsed tag or comment as a plain object. */
function toObject(tokens) {
	const attrs = {};
	for (const token of tokens) attrs[token.name] = token.value;
	return attrs;
}

/**
 * Applies `change` ({ set: { name: value | null | true }, addClass: [], removeClass: [] })
 * to the start tag at `offset`. `true` writes a bare (boolean) attribute,
 * `null` removes one. Untouched attributes keep their exact text.
 */
function editStartTag(text, offset, change) {
	const tag = parseStartTag(text, offset);
	const tokens = tag.tokens.map((t) => ({ ...t }));
	const set = {};
	if (change.addClass?.length || change.removeClass?.length) {
		const current = tokens.find((t) => t.name === 'class');
		const classes = new Set((current?.value || '').split(/\s+/).filter(Boolean));
		for (const c of change.removeClass || []) classes.delete(c);
		for (const c of change.addClass || []) classes.add(c);
		set.class = classes.size ? [...classes].join(' ') : null;
	}
	Object.assign(set, change.set); // class first: the conventional attribute order
	for (const [name, value] of Object.entries(set)) {
		const index = tokens.findIndex((t) => t.name === name);
		if (value === null || value === undefined) {
			if (index >= 0) tokens.splice(index, 1);
			continue;
		}
		const raw = value === true ? name : `${name}="${escapeAttr(value)}"`;
		if (index >= 0) tokens[index].raw = tokens[index].ws + raw;
		else tokens.push({ ws: ' ', name, raw: ' ' + raw });
	}
	const rebuilt = `<${text.slice(offset + 1, offset + 1 + tag.name.length)}${tokens.map((t) => t.raw).join('')}${tag.close}`;
	return text.slice(0, offset) + rebuilt + text.slice(tag.end);
}

/* ── Markdown comments ───────────────────────────────────────────────── */

const ELEMENT_COMMENT = /<!--\s*\.element:?\s*([\s\S]*?)\s*-->/;
const SLIDE_COMMENT = /<!--\s*\.slide:\s*([\s\S]*?)\s*-->/;
// Reveal's own attribute grammar inside these comments (plugin/markdown).
const COMMENT_ATTR = /([^"= ]+?)="([^"]+?)"|(data-[^"= ]+?)(?=[" ]|$)/g;

function parseCommentAttrs(body) {
	const tokens = [];
	for (const m of body.matchAll(COMMENT_ATTR)) {
		tokens.push(
			m[2] !== undefined ? { name: m[1], value: m[2] } : { name: m[3], value: '', bare: true }
		);
	}
	return tokens;
}

function serializeCommentAttrs(tokens) {
	return tokens.map((t) => (t.bare ? t.name : `${t.name}="${t.value}"`)).join(' ');
}

function applyToTokens(tokens, change) {
	tokens = tokens.map((t) => ({ ...t }));
	const set = {};
	if (change.addClass?.length || change.removeClass?.length) {
		const classes = new Set(
			(tokens.find((t) => t.name === 'class')?.value || '').split(/\s+/).filter(Boolean)
		);
		for (const c of change.removeClass || []) classes.delete(c);
		for (const c of change.addClass || []) classes.add(c);
		set.class = classes.size ? [...classes].join(' ') : null;
	}
	Object.assign(set, change.set); // class first: the conventional attribute order
	for (const [name, value] of Object.entries(set)) {
		const index = tokens.findIndex((t) => t.name === name);
		if (value === null || value === undefined || value === '') {
			if (index >= 0) tokens.splice(index, 1);
			continue;
		}
		// Reveal's comment grammar has no empty values: booleans are bare data-* names.
		const token =
			value === true
				? { name, value: '', bare: true }
				: { name, value: String(value).replace(/"/g, "'") };
		if (value === true && !name.startsWith('data-'))
			throw new Error(`${name} needs a value in a Markdown comment`);
		if (index >= 0) tokens[index] = token;
		else tokens.push(token);
	}
	return tokens;
}

const LIST_OR_HEADING = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|\s*#{1,6}\s+|\s*>\s?)/;

/** True when `line` (1-based) is inside a fenced code block of `lines`. */
function inFence(lines, line) {
	let open = false;
	for (let i = 0; i < line - 1; i++) if (/^\s*(```|~~~)/.test(lines[i])) open = !open;
	return open || /^\s*(```|~~~)/.test(lines[line - 1] || '');
}

/**
 * Why a new `.element` comment on this line might not land on the block, or
 * null. Reveal attaches a trailing comment to the element before it, so a
 * paragraph line with inline markup would style its last inline element.
 */
export function mdPlacementWarning(lineText) {
	if (ELEMENT_COMMENT.test(lineText) || LIST_OR_HEADING.test(lineText)) return null;
	if (
		/\*\*|__|\*[^*\s]|_[^_\s]|`|\[[^\]]*\]\(|<[a-zA-Z]/.test(
			lineText.replace(/^!\[[^\]]*\]\([^)]*\)\s*$/, '')
		)
	)
		return 'This paragraph has inline formatting, so Reveal attaches the attribute to its last formatted word. Put the paragraph in a list item, or use an HTML slide, to target the whole block.';
	return null;
}

function editMdLine(text, line, change) {
	const lines = text.split('\n');
	if (line < 1 || line > lines.length) throw new Error(`Line ${line} is outside the file`);
	if (inFence(lines, line))
		throw new Error('That line is inside a code block; Reveal cannot attach attributes there');
	const current = lines[line - 1];
	const existing = ELEMENT_COMMENT.exec(current);
	const tokens = applyToTokens(existing ? parseCommentAttrs(existing[1]) : [], change);
	const comment = tokens.length ? `<!-- .element: ${serializeCommentAttrs(tokens)} -->` : '';
	let next;
	if (existing) {
		next =
			current.slice(0, existing.index) +
			comment +
			current.slice(existing.index + existing[0].length);
		if (!comment) next = next.replace(/\s{2,}/g, (s, i) => (i === 0 ? s : ' ')).replace(/\s+$/, '');
	} else if (!comment) {
		next = current;
	} else {
		const lead = LIST_OR_HEADING.exec(current);
		next = lead
			? lead[0] + comment + ' ' + current.slice(lead[0].length)
			: current.replace(/\s*$/, '') + ' ' + comment;
	}
	lines[line - 1] = next;
	return lines.join('\n');
}

/** First and last (inclusive) line of the Markdown sub-slide starting at `line`. */
function mdSlideRange(lines, line) {
	let end = lines.length;
	for (let i = line - 1; i < lines.length; i++) {
		if (i > line - 1 && /^--\s*$/.test(lines[i])) {
			end = i;
			break;
		}
	}
	return [line, end];
}

function editMdSlide(text, line, change) {
	const lines = text.split('\n');
	const [first, last] = mdSlideRange(lines, line);
	let at = -1;
	let m = null;
	for (let i = first - 1; i < last; i++) {
		m = SLIDE_COMMENT.exec(lines[i]);
		if (m) {
			at = i;
			break;
		}
	}
	const tokens = applyToTokens(m ? parseCommentAttrs(m[1]) : [], change);
	const comment = tokens.length ? `<!-- .slide: ${serializeCommentAttrs(tokens)} -->` : '';
	if (at >= 0) {
		const replaced = lines[at].slice(0, m.index) + comment + lines[at].slice(m.index + m[0].length);
		if (replaced.trim()) lines[at] = replaced;
		else lines.splice(at, 1);
	} else if (comment) {
		// After the fence's blank line, so the comment stays inside this sub-slide.
		let insert = first - 1;
		while (insert < last - 1 && !lines[insert].trim()) insert++;
		lines.splice(insert, 0, comment);
	}
	return lines.join('\n');
}

/* ── Public API ──────────────────────────────────────────────────────── */

/** Reads { attrs, classes } of a target. */
export function readTarget(text, target) {
	let tokens = [];
	if (target.kind === 'html') tokens = parseStartTag(text, target.offset).tokens;
	else if (target.kind === 'md') {
		const m = ELEMENT_COMMENT.exec(text.split('\n')[target.line - 1] || '');
		tokens = m ? parseCommentAttrs(m[1]) : [];
	} else if (target.kind === 'md-slide') {
		const lines = text.split('\n');
		const [first, last] = mdSlideRange(lines, target.line);
		for (let i = first - 1; i < last; i++) {
			const m = SLIDE_COMMENT.exec(lines[i]);
			if (m) {
				tokens = parseCommentAttrs(m[1]);
				break;
			}
		}
	}
	const attrs = toObject(tokens);
	return { attrs, classes: (attrs.class || '').split(/\s+/).filter(Boolean) };
}

function editOne(text, target, change) {
	if (target.kind === 'html') return editStartTag(text, target.offset, change);
	if (target.kind === 'md') return editMdLine(text, target.line, change);
	if (target.kind === 'md-slide') return editMdSlide(text, target.line, change);
	throw new Error(`Unknown target kind ${target.kind}`);
}

/**
 * Applies several { target, change } edits to one file's text. HTML edits run
 * from the last offset to the first so every offset stays valid; Markdown line
 * edits never move other lines (slide comments are applied last).
 */
export function applyEdits(text, edits) {
	// Slide comments may insert a line, so they go last, bottom sub-slide first.
	const order = (e) =>
		e.target.kind === 'html'
			? e.target.offset
			: e.target.kind === 'md'
				? e.target.line
				: e.target.line - 1e9;
	const sorted = [...edits].sort((a, b) => order(b) - order(a));
	for (const { target, change } of sorted) text = editOne(text, target, change);
	return text;
}

/* ── Fragments ───────────────────────────────────────────────────────── */

/** { fragment, effect, index } from a target's classes / attributes. */
export function fragmentOf({ attrs, classes }) {
	if (!classes.includes('fragment')) return { fragment: false, effect: null, index: null };
	const effect = classes.find((c) => FRAGMENT_EFFECTS.includes(c)) || 'fade-in';
	const index = attrs['data-fragment-index'];
	return {
		fragment: true,
		effect,
		index: index === undefined || index === '' ? null : Number(index),
	};
}

/** The change that makes a target a fragment with `effect` at step `index` (null = DOM order). */
export function fragmentChange(current, { effect = 'fade-in', index = null } = {}) {
	const removeClass = FRAGMENT_EFFECTS.filter((e) => e !== effect && current.classes.includes(e));
	return {
		addClass: ['fragment', ...(effect === 'fade-in' ? [] : [effect])],
		removeClass,
		set: { 'data-fragment-index': index === null ? null : String(index) },
	};
}

export function unfragmentChange(current) {
	return {
		removeClass: ['fragment', ...FRAGMENT_EFFECTS.filter((e) => current.classes.includes(e))],
		set: { 'data-fragment-index': null },
	};
}

/* ── Markdown element lookup ─────────────────────────────────────────── */

const plain = (s) =>
	s
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/(\*\*|__|\*|_|`|~~)/g, '')
		.replace(/&[a-z]+;/g, ' ')
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

/**
 * Finds the source line of a rendered Markdown element within lines
 * [from, to] (1-based, inclusive). `element` = { tag, text, src, nth } where
 * nth counts earlier elements of the same tag with the same text.
 */
export function findMdLine(text, from, to, element) {
	const lines = text.split('\n');
	const want = plain(element.text || '');
	const candidates = [];
	for (let line = from; line <= Math.min(to, lines.length); line++) {
		const raw = lines[line - 1];
		if (!raw.trim() || /^--\s*$/.test(raw) || inFence(lines, line)) continue;
		if (element.tag === 'img') {
			if (element.src && raw.includes(element.src.replace(/^.*\//, ''))) candidates.push(line);
			continue;
		}
		const body = plain(raw.replace(LIST_OR_HEADING, '').replace(/^Note:.*/, ''));
		if (!body) continue;
		if (want && (body === want || want.startsWith(body) || body.startsWith(want.slice(0, 40))))
			candidates.push(line);
	}
	return candidates[element.nth || 0] ?? candidates[0] ?? null;
}

/* ── Inline text editing ─────────────────────────────────────────────── */

const VOID = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'source',
	'track',
	'wbr',
]);
export const INLINE = new Set([
	'a',
	'b',
	'strong',
	'i',
	'em',
	'code',
	'span',
	'br',
	'sub',
	'sup',
	'mark',
	'small',
	's',
	'u',
]);

/**
 * The content range of the element whose start tag is at `offset`:
 * { innerStart, innerEnd, end } - or null for a void / self-closing tag.
 * Nested same-name tags are counted; comments and raw text are skipped.
 */
export function elementRange(text, offset) {
	const tag = parseStartTag(text, offset);
	if (VOID.has(tag.name) || tag.close.includes('/')) return null;
	if (tag.name === 'script' || tag.name === 'style' || tag.name === 'textarea') {
		const close = text.toLowerCase().indexOf(`</${tag.name}`, tag.end);
		if (close < 0) throw new Error(`<${tag.name}> at ${offset} is never closed`);
		return { innerStart: tag.end, innerEnd: close, end: text.indexOf('>', close) + 1 };
	}
	const re = new RegExp(`<!--[\\s\\S]*?-->|<(/?)${tag.name}(?=[\\s>/])[^>]*>`, 'gi');
	re.lastIndex = tag.end;
	let depth = 1;
	let m;
	while ((m = re.exec(text))) {
		if (m[0].startsWith('<!--')) continue;
		if (m[1]) depth--;
		else if (!m[0].endsWith('/>')) depth++;
		if (depth === 0) return { innerStart: tag.end, innerEnd: m.index, end: m.index + m[0].length };
	}
	throw new Error(`<${tag.name}> at ${offset} is never closed`);
}

const tagsIn = (html) =>
	[...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) =>
		m[1].toLowerCase()
	);

/** Keeps inline tags (href on links only), unwraps everything else. */
export function cleanInlineHtml(html) {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g, (all, slash, name, attrs) => {
			const tag = name.toLowerCase();
			if (!INLINE.has(tag)) return '';
			if (slash) return `</${tag}>`;
			if (tag === 'a') {
				const href = /\bhref\s*=\s*("[^"]*"|'[^']*')/.exec(attrs);
				return href ? `<a href=${href[1]}>` : '<a>';
			}
			return tag === 'br' ? '<br>' : `<${tag}>`;
		})
		.replace(/&nbsp;/g, ' ');
}

/**
 * Replaces the content of the HTML element at `offset` with `html` (inline
 * markup only), keeping the source's surrounding whitespace. Refuses elements
 * whose source holds block markup - those are edited in the code pane.
 */
export function replaceInnerHtml(text, offset, html) {
	const range = elementRange(text, offset);
	if (!range) throw new Error('This element has no text content to edit.');
	const inner = text.slice(range.innerStart, range.innerEnd);
	if (tagsIn(inner).some((name) => !INLINE.has(name)))
		throw new Error('This element contains block markup; edit it in the code pane.');
	const lead = /^\s*/.exec(inner)[0];
	const trail = /\s*$/.exec(inner)[0];
	return (
		text.slice(0, range.innerStart) +
		lead +
		cleanInlineHtml(html).trim() +
		trail +
		text.slice(range.innerEnd)
	);
}

const decode = (s) =>
	s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');

/** Inline HTML from the preview back to Markdown. */
export function inlineHtmlToMd(html) {
	let md = cleanInlineHtml(html)
		.replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, '**$2**')
		.replace(/<(em|i)>([\s\S]*?)<\/\1>/g, '*$2*')
		.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
		.replace(/<a href=(["'])(.*?)\1>([\s\S]*?)<\/a>/g, '[$3]($2)')
		.replace(/<\/?(span|a)>/g, '');
	md = md.replace(/\s*\n\s*/g, ' ');
	return decode(md).trim();
}

/**
 * Replaces the text of the Markdown block on `line` with `inlineHtml`
 * (converted back to Markdown), keeping its list/heading marker and any
 * `.element` comments. Refuses paragraphs that run onto the next line.
 */
export function replaceMdText(text, line, inlineHtml) {
	const lines = text.split('\n');
	const current = lines[line - 1];
	if (current === undefined || !current.trim())
		throw new Error('Could not find this element in the Markdown source.');
	if (inFence(lines, line))
		throw new Error('That line is inside a code block; edit it in the code pane.');
	const lead = (LIST_OR_HEADING.exec(current) || [''])[0];
	const next = lines[line] ?? '';
	if (
		!/^\s*#/.test(current) &&
		next.trim() &&
		!LIST_OR_HEADING.test(next) &&
		!/^\s*(--\s*$|Note:|```|~~~|<!--|\||<)/.test(next)
	)
		throw new Error('This paragraph runs over several source lines; edit it in the code pane.');
	let rest = current.slice(lead.length);
	const opening = /^<!--\s*\.element:[\s\S]*?-->\s*/.exec(rest);
	const head = opening ? opening[0] : '';
	rest = rest.slice(head.length);
	const closing = /\s*<!--[\s\S]*?-->\s*$/.exec(rest);
	const tail = closing ? closing[0] : '';
	const original = closing ? rest.slice(0, closing.index) : rest;
	let replacement = inlineHtmlToMd(inlineHtml);
	// Reveal's Markdown runs smartypants; keep straight punctuation if the source used it.
	if (!/[‘’“”…–—]/.test(original))
		replacement = replacement
			.replace(/[‘’]/g, "'")
			.replace(/[“”]/g, '"')
			.replace(/…/g, '...')
			.replace(/—/g, '---')
			.replace(/–/g, '--');
	lines[line - 1] = lead + head + replacement + tail;
	return lines.join('\n');
}
