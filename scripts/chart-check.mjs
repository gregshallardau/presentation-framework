#!/usr/bin/env node
/**
 * Render every chart type in the catalogue from its own sample data with the Vega engine
 * the deck ships (vega + vega-lite from node_modules), and report failures.
 *
 *   node scripts/chart-check.mjs              check all types
 *   node scripts/chart-check.mjs bar line     check these ids only
 *   node scripts/chart-check.mjs --out DIR    also write DIR/<id>.json (spec) for other renderers
 *
 * Exits non-zero if any type fails to build or render, or renders nothing.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import * as vega from 'vega';
import * as vl from 'vega-lite';

const STATIC = new URL('../editor/static/', import.meta.url);
export function loadCatalog() {
	const files = readdirSync(STATIC).filter((f) => /^chart-(core|templates|geo-data|types-.*)\.js$/.test(f)).sort((a, b) => { const rank = (f) => (f.includes('core') ? 0 : f.includes('templates') ? 1 : f.includes('upstream') ? 3 : 2); return rank(a) - rank(b) || a.localeCompare(b); });
	const ctx = { console };
	ctx.window = ctx;
	ctx.globalThis = ctx;
	vm.createContext(ctx);
	for (const f of files) vm.runInContext(readFileSync(new URL(f, STATIC), 'utf8'), ctx, { filename: f });
	return ctx.ChartCatalog;
}

export async function renderSpec(spec, datasets = {}) {
	const s = JSON.parse(JSON.stringify(spec));
	inlineDatasets(s, datasets);
	if (!s.width || s.width === 'container') s.width = 480;
	if (!s.height || s.height === 'container') s.height = 300;
	const isVega = /\/vega\//.test(s.$schema || '') || ('marks' in s && !('mark' in s));
	const compiled = isVega ? s : vl.compile(s).spec;
	const view = new vega.View(vega.parse(compiled), { renderer: 'none' });
	return view.toSVG();
}

function inlineDatasets(node, datasets) {
	if (Array.isArray(node)) return node.forEach((n) => inlineDatasets(n, datasets));
	if (!node || typeof node !== 'object') return;
	if (typeof node.url === 'string' && node.url.startsWith('vega-datasets:')) {
		const name = node.url.slice('vega-datasets:'.length);
		node.values = datasets[name] ??= JSON.parse(readFileSync(new URL(`../src/lib/data/${name}.json`, import.meta.url), 'utf8'));
		delete node.url;
	}
	for (const v of Object.values(node)) inlineDatasets(v, datasets);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);
	const outAt = args.indexOf('--out');
	const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
	const C = loadCatalog();
	if (out) mkdirSync(out, { recursive: true });
	const only = args.filter((a) => !a.startsWith('-'));
	let bad = 0, n = 0;
	const datasets = {};
	for (const t of C.TYPES) {
		if (only.length && !only.includes(t.id)) continue;
		n++;
		try {
			const spec = C.sampleSpec(t);
			if (out) writeFileSync(`${out}/${t.id}.json`, JSON.stringify(spec));
			if (t.browserOnly) { console.log(`skip ${t.id.padEnd(22)} ${t.browserOnly} (browser only)`); n--; continue; }
			const svg = await renderSpec(spec, datasets);
			const marks = (svg.match(/<(path|rect|circle|text|line)\b/g) || []).length;
			if (marks < 3) throw new Error(`rendered almost nothing (${marks} elements)`);
			console.log(`ok   ${t.id.padEnd(22)} ${String(marks).padStart(5)} elements`);
		} catch (e) {
			bad++;
			console.log(`FAIL ${t.id.padEnd(22)} ${String(e.message).split('\n')[0].slice(0, 160)}`);
		}
	}
	console.log(`\n${n - bad}/${n} chart types render`);
	process.exit(bad ? 1 : 0);
}
