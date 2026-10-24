// Run with: npm run test:build  (node --test build/*.test.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { transformChartFences } from './chart-fences.js';

const attrSpec = (out) => JSON.parse(out.match(/spec="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

test('a YAML chart fence becomes a block <deck-chart-vega> carrying the spec as JSON', () => {
	const md = 'text\n\n```chart\ndata:\n  values:\n    - {m: Jan, v: 12}\n\n    - {m: Feb, v: 19}\nmark: line\nencoding:\n  x: {field: m, type: ordinal}\n```\n\nafter';
	const out = transformChartFences(md);
	assert.match(out, /<deck-chart-vega spec="[^"\n]*">\n<\/deck-chart-vega>/);
	assert.deepEqual(attrSpec(out).data.values, [{ m: 'Jan', v: 12 }, { m: 'Feb', v: 19 }]);
	assert.equal(attrSpec(out).mark, 'line');
	assert.ok(!out.includes('```'));
});

test('vega-lite / vega fences and options work; JSON is valid YAML', () => {
	const out = transformChartFences('```vega-lite ratio="16 / 9"\n{"mark": "bar", "data": {"values": []}}\n```');
	assert.match(out, /^<deck-chart-vega ratio="16 \/ 9" spec=/);
	assert.equal(attrSpec(out).mark, 'bar');
});

test('an unparseable block is left as code with a warning', () => {
	const warnings = [];
	const md = '```chart\nnot: [valid\n```';
	assert.equal(transformChartFences(md, (m) => warnings.push(m)), md);
	assert.equal(warnings.length, 1);
});

test('other fences are untouched', () => {
	const md = '```js\nconst a = 1;\n```';
	assert.equal(transformChartFences(md), md);
});
