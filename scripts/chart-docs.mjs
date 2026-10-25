#!/usr/bin/env node
/**
 * Print the chart catalogue as Markdown for the docs, generated from the same definitions the wizard uses
 * so the docs cannot drift from them: one table per group (with each chart's upstream source), then every
 * edit made to an upstream spec with its reason.
 *
 *   node scripts/chart-docs.mjs
 */
import { loadCatalog } from './chart-check.mjs';

const C = loadCatalog();
const out = [];
const source = (t) => (t.templates ? [...new Set(t.templates.map((x) => `\`${x.key}\``))].join(', ') : 'none (same style)');
for (const g of C.GROUPS) {
	const types = C.TYPES.filter((t) => t.group === g.id);
	if (!types.length) continue;
	out.push(`**${g.label}** — ${g.desc.charAt(0).toLowerCase()}${g.desc.slice(1)}`, '', '| Chart | Id | Reads these columns | Upstream example |', '|-------|----|---------------------|------------------|');
	for (const t of types) {
		const reads = t.roles.map((r) => `${r.label.replace(/ \(.*\)$/, '')}${r.required ? '' : ' (optional)'}`).join(', ');
		out.push(`| ${t.label} | \`${t.id}\` | ${reads} | ${source(t)} |`);
	}
	out.push('');
}
out.push('**Edits to upstream specs**', '', 'Every other chart is its upstream example with only your data and column names filled in. These are the exceptions, each removing or replacing something that only made sense for the example’s own data:', '', '| Chart | Upstream example | Edit |', '|-------|------------------|------|');
for (const e of C.EDITS) out.push(`| \`${e.type}\` | \`${e.template}\` | ${e.why.charAt(0).toUpperCase()}${e.why.slice(1)} |`);
out.push('');
console.log(out.join('\n'));
