/**
 * Markdown slides: turn a fenced ```chart block into <deck-chart-vega>.
 *
 * The block is the same one md-doc-pipeline documents use - a Vega-Lite spec as
 * YAML (or JSON) - so a chart copied between a document and a slide just works.
 * The spec travels as JSON in a `spec` attribute (HTML-escaped, newline-free) and the
 * open tag sits alone on its line, so Markdown keeps it a block rather than a <p>
 * (which the 32em reading measure would cap). `vega-lite` and `vega` are accepted as
 * the fence language too. A block that does not parse is left as a code block.
 *
 * Options after the language become attributes: ```chart ratio="16 / 9" label="Revenue"
 */
import YAML from 'yaml';
import { parseOptions } from './mermaid-fences.js';

const FENCE = /^```(?:chart|vega-lite|vega)([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm;

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function transformChartFences(text, warn = (m) => console.warn(m)) {
	return text.replace(FENCE, (whole, info, src) => {
		let spec;
		try {
			spec = YAML.parse(src);
			if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('a chart spec must be a mapping');
		} catch (e) {
			warn(`[chart] a \`\`\`chart block was left as code: ${e.message.split('\n')[0]}`);
			return whole;
		}
		return `<deck-chart-vega${parseOptions(info)} spec="${escapeAttr(JSON.stringify(spec))}">\n</deck-chart-vega>\n`;
	});
}
