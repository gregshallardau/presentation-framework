/**
 * The chart catalogue (editor/static/chart-*.js), shared with md-doc-pipeline's studio.
 * Every chart type is built from its own sample and rendered with the Vega engine the deck ships.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import YAML from 'yaml';
import { loadCatalog, renderSpec } from '../../scripts/chart-check.mjs';

const STATIC = new URL('../static/', import.meta.url);
const C = loadCatalog();
// Objects built inside the vm have another realm's prototypes; compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const datasets = {};

test('the shared files are byte-identical to the copies in md-doc-pipeline (same manifest there)', () => {
	const manifest = JSON.parse(readFileSync(new URL('./chart-wizard.sha256.json', import.meta.url), 'utf8'));
	const files = readdirSync(STATIC).filter((f) => /^chart-.*\.js$/.test(f)).sort();
	assert.deepEqual(files, Object.keys(manifest).sort(), 'the set of chart-*.js files changed: update chart-wizard.sha256.json in BOTH repos');
	for (const f of files) {
		const got = createHash('sha256').update(readFileSync(new URL(f, STATIC))).digest('hex');
		assert.equal(got, manifest[f], `${f} changed: copy it to md-doc-web-editor/md_doc_web_editor/static/ and refresh chart-wizard.sha256.json in BOTH repos (node scripts/chart-manifest.mjs)`);
	}
});

test('the wizard lists every file it loads', () => {
	const src = readFileSync(new URL('chart-wizard.js', STATIC), 'utf8');
	const listed = [...src.matchAll(/'(chart-[\w-]+\.js)'/g)].map((m) => m[1]);
	const onDisk = readdirSync(STATIC).filter((f) => /^chart-.*\.js$/.test(f) && f !== 'chart-wizard.js');
	assert.deepEqual([...new Set(listed)].sort(), onDisk.sort());
});

test('catalogue shape: unique ids, real groups, complete definitions', () => {
	const ids = C.TYPES.map((t) => t.id);
	assert.equal(new Set(ids).size, ids.length, 'duplicate chart ids');
	assert.ok(C.TYPES.length >= 80, `only ${C.TYPES.length} chart types`);
	const groups = new Set(C.GROUPS.map((g) => g.id));
	for (const g of C.GROUPS) assert.ok(C.TYPES.some((t) => t.group === g.id), `group ${g.id} is empty`);
	for (const t of C.TYPES) {
		assert.ok(groups.has(t.group), `${t.id}: unknown group ${t.group}`);
		assert.ok(t.label && t.desc && typeof t.build === 'function' && C.SAMPLES[t.sample] !== undefined, `${t.id}: incomplete`);
		assert.ok(t.roles.length > 0, `${t.id}: no roles`);
		for (const o of t.options) assert.ok(C.OPTIONS[o], `${t.id}: unknown option ${o}`);
	}
});

test('every chart type renders from its sample, identically on a second run', async () => {
	for (const t of C.TYPES) {
		const spec = C.sampleSpec(t);
		if (t.browserOnly) continue; // needs a canvas, which Node lacks; md-doc's tests and the browser check cover it
		const a = await renderSpec(spec, datasets);
		assert.ok((a.match(/<(path|rect|circle|text|line)\b/g) || []).length >= 3, `${t.id} drew almost nothing`);
		// Vega numbers clip paths and gradients from a global counter, so ignore those ids.
		const same = (svg) => svg.replace(/(clip|gradient_)\d+/g, '$1');
		if (t.random) continue; // upstream resamples (bootstrap confidence intervals); the type says so
		assert.equal(same(a), same(await renderSpec(spec, datasets)), `${t.id} is not deterministic`);
	}
});

test('every chart type: spec -> YAML -> spec is lossless, and the fence parses back', () => {
	for (const t of C.TYPES) {
		const spec = plain(C.sampleSpec(t));
		assert.deepEqual(YAML.parse(C.toYaml(spec)), spec, `${t.id}: YAML round trip`);
		const fence = C.codeFor('yaml-fence', spec);
		assert.match(fence, /^```chart\n[\s\S]*\n```\n$/, t.id);
		const html = C.codeFor('deck-element', spec, 'a "label"');
		assert.deepEqual(JSON.parse(html.match(/<script type="application\/json">([\s\S]*?)<\/script>/)[1]), spec, `${t.id}: deck element JSON`);
	}
});

test('every option of every chart type builds and renders in each state', async () => {
	let variants = 0;
	for (const t of C.TYPES) {
		for (const id of t.options) {
			const o = C.OPTIONS[id];
			const values = o.kind === 'select' ? o.choices.map((c) => c[0]) : o.kind === 'check' ? [true, false] : o.kind === 'number' ? [o.min ?? 1, o.max ?? 10] : [''];
			for (const v of values) {
				const st = C.sampleState(t);
				st.opts = { [o.key || id]: v };
				const spec = C.buildSpec(st);
				if (t.browserOnly) continue;
				const svg = await renderSpec(spec, datasets);
				assert.ok(svg.length > 200, `${t.id} with ${id}=${v}`);
				variants++;
			}
		}
	}
	assert.ok(variants >= 10, `${variants} option variants`);
});

test('roles: a missing required column and empty data are readable errors', () => {
	const t = C.chartType('bar');
	const st = C.sampleState(t);
	assert.throws(() => C.buildSpec({ ...st, map: {} }), /Choose a column/);
	assert.throws(() => C.buildSpec({ ...st, table: { columns: st.table.columns, rows: [] } }), /at least one row/);
	assert.throws(() => C.buildSpec({ ...C.sampleState(C.chartType('scatter-matrix')), map: { cols: ['Height'] } }), /at least 2/);
});

test('parseTable handles tabs, semicolons, quotes and duplicate headers', () => {
	assert.deepEqual(plain(C.parseTable('a\tb\n1\t2\n3\t4')), { columns: ['a', 'b'], rows: [['1', '2'], ['3', '4']] });
	assert.deepEqual(plain(C.parseTable('a;b\n1;2').columns), ['a', 'b']);
	assert.deepEqual(plain(C.parseTable('name,note\n"Smith, J","say ""hi"""').rows), [['Smith, J', 'say "hi"']]);
	assert.deepEqual(plain(C.parseTable('x,x,\n1,2,3').columns), ['x', 'x_2', 'column3']);
	assert.deepEqual(plain(C.parseTable('')), { columns: [], rows: [] });
});

test('inferType', () => {
	assert.equal(C.inferType(['1', '2.5', '-3', '']), 'quantitative');
	assert.equal(C.inferType(['2024-01-05', '2024-02-01']), 'temporal');
	assert.equal(C.inferType(['Jan', '2']), 'nominal');
});

test('hierarchy input: duplicate ids, several roots and missing parents get a readable message', () => {
	const base = C.sampleState(C.chartType('treemap'));
	const withRows = (rows) => ({ ...base, table: { columns: ['Id', 'Name', 'Parent', 'Size'], rows } });
	assert.throws(() => C.buildSpec(withRows([['1', 'a', '', ''], ['2', 'b', '1', '1'], ['2', 'c', '1', '2']])), /appears twice/);
	assert.throws(() => C.buildSpec(withRows([['1', 'a', '', ''], ['2', 'b', '', '1']])), /exactly one root/);
	assert.throws(() => C.buildSpec(withRows([['1', 'a', '9', ''], ['2', 'b', '1', '1']])), /No row is the root|not the id/);
	assert.throws(() => C.buildSpec(withRows([['1', 'a', '', ''], ['2', 'b', '7', '1']])), /not the id of any row/);
});

test('maps: names, ISO codes and FIPS match; unknowns are reported, not drawn', () => {
	assert.equal(C.geoMatch.country('United States')[2], 'USA');
	assert.equal(C.geoMatch.country('usa')[0], 840);
	assert.equal(C.geoMatch.country('Côte d’Ivoire')[1], 'CI');
	assert.equal(C.geoMatch.country('UK')[2], 'GBR');
	assert.equal(C.geoMatch.state('California')[1], 'CA');
	assert.equal(C.geoMatch.state('06')[1], 'CA');
	assert.equal(C.geoMatch.state('tx')[2], 'Texas');
	const st = C.sampleState(C.chartType('map-world'));
	st.table.rows.push(['Atlantis', '5']);
	const warnings = [];
	C.buildSpec(st, warnings);
	assert.match(warnings.join(' '), /Atlantis/);
	assert.throws(() => C.buildSpec({ ...st, table: { columns: ['Country', 'Value'], rows: [['Atlantis', '1']] } }), /None of the values/);
});

test('built-in datasets resolve locally and unknown ones fail loudly', async () => {
	const spec = C.sampleSpec(C.chartType('map-us'));
	assert.deepEqual(plain(C.datasetNames(spec)), ['us-10m']);
	const loaded = [];
	const out = await C.resolveDatasets(spec, async (n) => (loaded.push(n), { type: 'Topology' }));
	assert.deepEqual(loaded, ['us-10m']);
	assert.deepEqual(plain(C.datasetNames(out)), []);
	assert.ok(JSON.stringify(out).includes('"Topology"'));
});

test('every chart is read back from its spec alone: same type, same data, same columns', () => {
	for (const t of C.TYPES) {
		const st = C.sampleState(t);
		const spec = plain(C.buildSpec(st));
		const got = C.readSpec(spec).filter((g) => g.type === t.id);
		assert.ok(got.length, `${t.id}: not recognised from its own spec`);
		assert.equal(got[0].state.table.rows.length, st.table.rows.length, `${t.id}: rows`);
		// rebuilding from what was read gives the same chart back
		assert.deepEqual(plain(C.comparable(C.buildSpec(got[0].state))), plain(C.comparable(spec)), `${t.id}: rebuilt chart differs`);
	}
});

test('blocks carry nothing but the spec, in both formats, and are found by the cursor', () => {
	const st = C.sampleState(C.chartType('bar'));
	const spec = C.buildSpec(st);
	for (const format of ['yaml-fence', 'deck-element']) {
		const code = C.codeFor(format, spec, 'A label');
		assert.ok(!/wizard|usermeta/i.test(code), `${format}: no wizard bookkeeping in the block`);
		assert.ok(!code.split('\n').some((l) => /^#/.test(l)), `${format}: no comment lines`);
		const doc = `Intro\n\n${code}\nOutro\n`;
		const hit = C.findBlock(doc, doc.indexOf('Intro') + 12, format);
		assert.equal(hit.text, code);
		assert.equal(C.findBlock(doc, 2, format), null);
		assert.deepEqual(format === 'deck-element' ? JSON.parse(C.blockSource(hit.text, format)) : YAML.parse(C.blockSource(hit.text, format)), plain(spec));
	}
});

test('an edited block is read as the same chart with the new data, titles and legend', () => {
	const st = C.sampleState(C.chartType('bar-grouped'));
	const spec = plain(C.buildSpec({ ...st, opts: { title: 'Sales', xTitle: 'Quarter', yTitle: 'Revenue', legend: false } }));
	spec.data.values[0].Value = 999; // the user changes a number in the block
	const got = C.readSpec(spec).find((g) => g.type === 'bar-grouped');
	assert.ok(got, 'still a grouped bar');
	assert.equal(got.state.table.rows[0][got.state.table.columns.indexOf('Value')], '999');
	assert.deepEqual(plain(got.state.map), plain(st.map));
	assert.equal(got.state.opts.title, 'Sales');
	assert.equal(got.state.opts.xTitle, 'Quarter');
	assert.equal(got.state.opts.yTitle, 'Revenue');
	assert.equal(got.state.opts.legend, false);
});

test('option variants are read from which upstream example the block is', () => {
	const labelled = plain(C.buildSpec({ ...C.sampleState(C.chartType('hbar')), opts: { labels: true } }));
	assert.equal(C.readSpec(labelled).find((g) => g.type === 'hbar').state.opts.labels, true);
	const loess = plain(C.buildSpec({ ...C.sampleState(C.chartType('scatter-trend')), opts: { fit: 'loess' } }));
	assert.equal(C.readSpec(loess).find((g) => g.type === 'scatter-trend').state.opts.fit, 'loess');
});

test('an upstream example pasted by hand, with the user’s own columns, is recognised', () => {
	const spec = plain(C.TEMPLATES['vega-lite/point_2d'].spec);
	spec.data = { values: [{ height: 170, weight: 65 }, { height: 182, weight: 80 }, { height: 158, weight: 52 }] };
	spec.encoding.x.field = 'height';
	spec.encoding.y.field = 'weight';
	const got = C.readSpec(spec).find((g) => g.type === 'scatter');
	assert.ok(got);
	assert.equal(got.state.map.x, 'height');
	assert.equal(got.state.map.y, 'weight');
	assert.equal(C.readSpec({ mark: 'bar', data: { values: [{ a: 1 }] }, encoding: { x: { field: 'a', type: 'nominal' }, y: { aggregate: 'count' }, color: { value: 'red' } } }).filter((g) => g.type === 'scatter').length, 0);
});

test('Venn, pictogram and contour plots are in the catalogue', () => {
	for (const id of ['venn', 'pictogram', 'contour']) assert.ok(C.TYPES.some((t) => t.id === id), id);
});

test('no template reuses an input field name for a value it computes (unless the data takes the example’s names)', () => {
	const produced = (n, acc = new Set()) => {
		if (Array.isArray(n)) n.forEach((x) => produced(x, acc));
		else if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { if (k === 'as') [].concat(v).forEach((x) => typeof x === 'string' && acc.add(x)); produced(v, acc); }
		return acc;
	};
	for (const t of C.TYPES.filter((x) => x.templates)) {
		for (const tp of t.templates) {
			const spec = JSON.parse(JSON.stringify(C.TEMPLATES[tp.key].spec));
			for (const e of tp.edits || []) e.apply(spec, { records: [], f: () => 'x', list: () => [] });
			const clash = Object.values(tp.fields).filter((f) => produced(spec).has(f));
			assert.ok(!clash.length || tp.rename === 'data', `${t.id}/${tp.key}: ${clash} is also computed by the spec; set rename: 'data'`);
		}
	}
});
