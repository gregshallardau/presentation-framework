#!/usr/bin/env node
/**
 * Print the chart catalogue as Markdown tables (one per group) for the docs, so the docs are
 * generated from the same definitions the wizard uses and cannot drift from them.
 *
 *   node scripts/chart-docs.mjs
 */
import { loadCatalog } from './chart-check.mjs';

const C = loadCatalog();
const out = [];
for (const g of C.GROUPS) {
	const types = C.TYPES.filter((t) => t.group === g.id);
	out.push(`**${g.label}** — ${g.desc.charAt(0).toLowerCase()}${g.desc.slice(1)}`, '', '| Chart | Id | Reads these columns |', '|-------|----|---------------------|');
	for (const t of types) {
		const reads = t.roles.map((r) => `${r.label.replace(/ \(.*\)$/, '')}${r.required ? '' : ' (optional)'}`).join(', ');
		out.push(`| ${t.label} | \`${t.id}\` | ${reads} |`);
	}
	out.push('');
}
console.log(out.join('\n'));
