import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import YAML from 'yaml';

const FILE = new URL('../static/chart-wizard.js', import.meta.url);
const source = readFileSync(FILE, 'utf8');
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(source, ctx);
const W = ctx.ChartWizard;

// Objects built inside the vm context have another realm's prototypes; compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const typesOf = (t) => Object.fromEntries(t.columns.map((c, i) => [c, W.inferType(t.rows.map((r) => r[i]))]));
const stateFor = (chart, opts = {}) => {
	const table = W.parseTable(W.SAMPLES[chart.sample]);
	const types = typesOf(table);
	return { type: chart.id, table, types, map: W.autoMap(chart, table, types, {}), opts: { agg: 'none', sort: 'data', stack: 'stacked', legend: true, points: true, ...opts } };
};

test('chart-wizard.js is byte-identical to the copy in md-doc-pipeline (same recorded SHA-256 there)', () => {
	const recorded = readFileSync(new URL('./chart-wizard.sha256', import.meta.url), 'utf8').trim();
	assert.equal(createHash('sha256').update(source).digest('hex'), recorded,
		'chart-wizard.js changed: copy it to md-doc-web-editor/md_doc_web_editor/static/ and update chart-wizard.sha256 in BOTH repos');
});

test('parseTable handles tabs, semicolons, quotes and duplicate headers', () => {
	assert.deepEqual(plain(W.parseTable('a\tb\n1\t2\n3\t4')), { columns: ['a', 'b'], rows: [['1', '2'], ['3', '4']] });
	assert.deepEqual(plain(W.parseTable('a;b\n1;2').columns), ['a', 'b']);
	assert.deepEqual(plain(W.parseTable('name,note\n"Smith, J","say ""hi"""').rows), [['Smith, J', 'say "hi"']]);
	assert.deepEqual(plain(W.parseTable('x,x,\n1,2,3').columns), ['x', 'x_2', 'column3']);
	assert.deepEqual(plain(W.parseTable('')), { columns: [], rows: [] });
});

test('inferType', () => {
	assert.equal(W.inferType(['1', '2.5', '-3', '']), 'quantitative');
	assert.equal(W.inferType(['2024-01-05', '2024-02-01']), 'temporal');
	assert.equal(W.inferType(['Jan', '2']), 'nominal');
});

test('every chart type builds a spec from its sample, and its YAML reads back identically', () => {
	for (const chart of W.CHART_TYPES) {
		const state = stateFor(chart);
		const spec = W.buildSpec(state);
		assert.ok(spec.data.values.length && spec.mark && spec.encoding, chart.id);
		assert.deepEqual(YAML.parse(W.toYaml(spec)), JSON.parse(JSON.stringify(spec)), `${chart.id}: YAML round trip`);
		const fence = W.codeFor('yaml-fence', spec);
		assert.match(fence, /^```chart\n[\s\S]*\n```\n$/, chart.id);
	}
});

test('options change the spec', () => {
	const line = W.CHART_TYPES.find((c) => c.id === 'line');
	assert.equal(W.buildSpec({ ...stateFor(line), map: { x: 'Month', y: 'Revenue', color: 'Region' } }).encoding.color.field, 'Region');
	const bar = W.CHART_TYPES.find((c) => c.id === 'bar');
	const grouped = W.buildSpec({ ...stateFor(bar, { stack: 'grouped' }), map: { x: 'Region', y: 'Revenue', color: 'Region' } });
	assert.deepEqual(plain(grouped.encoding.xOffset), { field: 'Region' });
	assert.equal(W.buildSpec(stateFor(bar, { agg: 'sum' })).encoding.y.aggregate, 'sum');
	assert.equal(W.buildSpec(stateFor(bar, { title: 'T' })).title, 'T');
	assert.equal(W.buildSpec(stateFor(line)).encoding.x.sort, null, 'line keeps the data order');
});

test('missing columns or data are readable errors', () => {
	const bar = W.CHART_TYPES.find((c) => c.id === 'bar');
	assert.throws(() => W.buildSpec({ ...stateFor(bar), map: {} }), /Choose a column/);
	assert.throws(() => W.buildSpec({ ...stateFor(bar), table: { columns: ['a'], rows: [] } }), /at least one row/);
});

test('deck-element output is a <deck-chart-vega> with a JSON script that cannot close itself', () => {
	const spec = { data: { values: [{ a: '</script>' }] }, mark: 'bar' };
	const html = W.codeFor('deck-element', spec, 'Rev "A"');
	assert.match(html, /^<deck-chart-vega label="Rev &quot;A&quot;">/);
	assert.ok(!html.slice(0, html.lastIndexOf('</script>')).includes('</script>'));
	const json = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/)[1];
	assert.deepEqual(JSON.parse(json), spec);
});
