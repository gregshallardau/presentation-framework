/**
 * Markdown slides: turn a fenced ```mermaid block into <deck-mermaid>.
 *
 * Reveal's Markdown plugin hands the slide text to `marked`, which would end an
 * HTML block at the first blank line inside a diagram. So the source travels in a
 * `src` attribute (newlines as &#10;), and the open tag sits alone on its line so
 * Markdown keeps it a block rather than wrapping it in a <p> (the 32em reading
 * measure would cap that).
 *
 * Options after the language become attributes: ```mermaid steps label="Review flow"
 */
const FENCE = /^```mermaid([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm;

const escapeAttr = (s) =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '&#10;');

/** `steps label="a b" layout=dagre` -> ` steps label="a b" layout="dagre"` */
export function parseOptions(info) {
	const out = [];
	for (const m of info.matchAll(/([\w-]+)(?:=(?:"([^"]*)"|(\S+)))?/g)) {
		out.push(m[2] !== undefined || m[3] !== undefined ? `${m[1]}="${escapeAttr(m[2] ?? m[3])}"` : m[1]);
	}
	return out.length ? ' ' + out.join(' ') : '';
}

export function transformFences(text) {
	return text.replace(FENCE, (_, info, src) => `<deck-mermaid${parseOptions(info)} src="${escapeAttr(src.trim())}">\n</deck-mermaid>\n`);
}
