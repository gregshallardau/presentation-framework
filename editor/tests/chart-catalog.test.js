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
				const svg = await renderSpec(spec, datasets);
				assert.ok(svg.length > 200, `${t.id} with ${id}=${v}`);
				variants++;
			}
		}
	}
	assert.ok(variants > 150);
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

test('hierarchy input: duplicate names, loops and several roots are handled', () => {
	const t = C.chartType('treemap');
	const base = C.sampleState(t);
	const dup = { ...base, table: { columns: ['Name', 'Parent', 'Size'], rows: [['a', '', ''], ['b', 'a', '1'], ['b', 'a', '2']] }, types: { Name: 'nominal', Parent: 'nominal', Size: 'quantitative' } };
	assert.throws(() => C.buildSpec(dup), /appears twice/);
	const loop = { ...dup, table: { columns: ['Name', 'Parent', 'Size'], rows: [['a', 'b', ''], ['b', 'a', '']] } };
	assert.throws(() => C.buildSpec(loop), /own ancestor/);
	const forest = { ...dup, table: { columns: ['Name', 'Parent', 'Size'], rows: [['x', '', '3'], ['y', '', '4']] } };
	const spec = C.buildSpec(forest);
	assert.ok(spec.data[0].values.some((n) => n.parent === null && n.name === 'All'), 'several roots get a synthetic All');
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

test('every chart reopens from its own block, as that type, in both block formats', () => {
	for (const t of C.TYPES) {
		const st = C.sampleState(t);
		st.userTyped = {};
		const spec = C.buildSpec(st);
		for (const format of ['yaml-fence', 'deck-element']) {
			const code = C.codeFor(format, spec, 'A label', st);
			const doc = `Intro\n\n${code}\nOutro\n`;
			const hit = C.findBlock(doc, doc.indexOf('Intro') + 12, format);
			assert.ok(hit, `${t.id}/${format}: block not found`);
			assert.equal(hit.text, code, `${t.id}/${format}: the block is the whole thing, nothing around it`);
			assert.equal(C.findBlock(doc, 2, format), null, `${t.id}/${format}: the cursor outside a block finds none`);
			const read = C.readBlock(hit.text, format);
			assert.ok(!read.error, `${t.id}/${format}: ${read.error}`);
			assert.equal(read.edited, false, `${t.id}/${format}: untouched block reads as edited`);
			assert.equal(read.state.type, t.id);
			assert.deepEqual(plain(read.state.table), plain(st.table));
			assert.deepEqual(plain(read.state.map), plain(st.map));
			// the restored state rebuilds the very same chart
			assert.deepEqual(plain(C.buildSpec({ ...read.state, opts: read.state.opts })), plain(spec), `${t.id}/${format}: rebuilt chart differs`);
		}
	}
});

test('the settings comment does not change how the chart block parses', () => {
	const st = C.sampleState(C.chartType('bar'));
	const spec = C.buildSpec(st);
	const code = C.codeFor('yaml-fence', spec, '', st);
	assert.match(code, /^```chart\n# chart-wizard: \{/);
	assert.deepEqual(plain(YAML.parse(code.split('\n').slice(1, -2).join('\n'))), plain(spec));
});

test('a block changed by hand is flagged; a block the wizard did not write is refused', () => {
	const st = C.sampleState(C.chartType('line'));
	for (const format of ['yaml-fence', 'deck-element']) {
		const code = C.codeFor(format, C.buildSpec(st), '', st);
		const tweaked = format === 'yaml-fence' ? code.replace('mark:', 'mark_:') : code.replace('"mark"', '"mark_"');
		assert.notEqual(tweaked, code);
		assert.equal(C.readBlock(tweaked, format).edited, true, format);
		// re-indenting alone is not an edit
		assert.equal(C.readBlock(code.replace(/\n {2}/g, '\n    '), format).edited, false, format);
	}
	assert.match(C.readBlock('```chart\nmark: bar\n```\n', 'yaml-fence').error, /not made by the wizard/);
	assert.match(C.readBlock('<deck-chart-vega>\n<script type="application/json">{}</script>\n</deck-chart-vega>', 'deck-element').error, /not made by the wizard/);
	const bad = C.codeFor('yaml-fence', C.buildSpec(st), '', st).replace(/"t":"line"/, '"t":"nope"');
	assert.match(C.readBlock(bad, 'yaml-fence').error, /does not have/);
	const gone = C.codeFor('yaml-fence', C.buildSpec(st), '', st).replace(/"m":\{[^}]*\}/, '"m":{"x":"missing_col"}');
	assert.match(C.readBlock(gone, 'yaml-fence').error, /no longer there/);
});

test('Venn, pictogram and contour plots are in the catalogue', () => {
	for (const id of ['venn', 'pictogram', 'contour']) assert.ok(C.TYPES.some((t) => t.id === id), id);
});
