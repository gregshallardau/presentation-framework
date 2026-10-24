// Run with: npm run test:camera  (node --test src/lib/*.test.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isFixedLayout, isVega, prepareFixed, prepareSpec, resolveBuiltinData, seriesPalette, vegaConfig } from './vega.js';

const keyPaths = (obj, prefix = '') =>
	Object.entries(obj)
		.flatMap(([k, v]) => {
			const p = prefix ? `${prefix}.${k}` : k;
			return v && typeof v === 'object' && !Array.isArray(v) ? keyPaths(v, p) : [p];
		})
		.sort();

test('vegaConfig sets the same keys as md-doc-pipeline charts.vega_config', () => {
	const expected = JSON.parse(readFileSync(new URL('./fixtures/chart-config-keys.json', import.meta.url), 'utf8'));
	const config = vegaConfig({ dark: false, scale: 1, font: 'Inter', ink: '#111111', ink2: '#555555', line: '#cccccc', grid: '#e6e6e6', primary: '#2563eb', secondary: '#374151' });
	assert.deepEqual(keyPaths(config), expected);
});

test('palette leads with the brand primary, never runs short, and ignores a quiet secondary', () => {
	const p = seriesPalette(['#2563eb']);
	assert.equal(p.length, 8);
	assert.equal(p[0], '#2563eb');
	assert.equal(new Set(p).size, 8);
	const t = { dark: false, scale: 1, font: 'x', ink: '#000000', ink2: '#000000', line: '#000000', grid: '#dddddd', primary: '#2563eb', secondary: '#374151' };
	assert.ok(!vegaConfig(t).range.category.includes('#374151'));
});

test('slide scale grows type and strokes', () => {
	const t = { dark: false, font: 'x', ink: '#000000', ink2: '#000000', line: '#000000', primary: '#2563eb', secondary: '#374151' };
	assert.equal(vegaConfig({ ...t, scale: 2 }).axis.labelFontSize, 22);
	assert.equal(vegaConfig({ ...t, scale: 2 }).line.strokeWidth, 4);
});

test('isVega and prepareSpec', () => {
	assert.equal(isVega({ mark: 'bar' }), false);
	assert.equal(isVega({ $schema: 'https://vega.github.io/schema/vega/v5.json' }), true);
	assert.equal(isVega({ marks: [] }), true);
	const s = prepareSpec({ mark: 'bar' });
	assert.equal(s.width, 'container');
	assert.deepEqual(s.autosize, { type: 'fit', contains: 'padding' });
	assert.equal(prepareSpec({ mark: 'bar', width: 300 }).width, 300);
});

test('fixed layouts: full Vega, compound and numeric-size specs keep their own size', () => {
	assert.equal(isFixedLayout({ mark: 'bar' }), false);
	assert.equal(isFixedLayout({ mark: 'bar', width: 'container', height: 'container' }), false);
	assert.equal(isFixedLayout({ mark: 'bar', width: 300, height: 200 }), true);
	assert.equal(isFixedLayout({ repeat: { row: ['a'] }, spec: {} }), true);
	assert.equal(isFixedLayout({ $schema: 'https://vega.github.io/schema/vega/v6.json', marks: [] }), true);
	assert.deepEqual([prepareFixed({ marks: [] }).width, prepareFixed({ marks: [] }).height], [560, 360]);
	assert.equal(prepareFixed({ marks: [], width: 300, height: 100 }).width, 300);
	// a compound spec must not gain a top-level size
	assert.equal('width' in prepareSpec({ repeat: { row: ['a'] }, spec: {} }), false);
});

test('built-in datasets: unknown names fail loudly, specs without any pass through untouched', async () => {
	const plain = { data: { values: [{ a: 1 }] }, mark: 'bar' };
	assert.equal(await resolveBuiltinData(plain), plain);
	await assert.rejects(() => resolveBuiltinData({ data: { url: 'vega-datasets:nope' }, mark: 'geoshape' }), /Unknown built-in dataset/);
});
