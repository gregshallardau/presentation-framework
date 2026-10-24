// Run with: npm run test:build  (node --test build/*.test.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrerender, parseRules, readThemes } from './mermaid.js';

const root = new URL('..', import.meta.url).pathname;

test('parseRules flattens @layer and keeps selectors', () => {
	const rules = parseRules('@layer a, b; @layer a { :root { --x: 1; } [data-theme="d"] { --x: 2; } }');
	assert.deepEqual(rules.map((r) => r.selector), [':root', '[data-theme="d"]']);
});

test('readThemes resolves the deck tokens for the default skin and each [data-theme]', () => {
	const themes = readThemes(root);
	assert.ok('' in themes && 'dark' in themes);
	assert.match(themes[''].primary, /^#[0-9a-f]{6}$/);
	assert.equal(themes[''].mode, 'light');
	assert.equal(themes.dark.mode, 'dark');
	assert.notEqual(themes[''].primary, themes.dark.primary);
});

test('transform swaps markdown fences and html blocks for placeholders', () => {
	const mm = createPrerender(root, { render: (jobs) => jobs.map(() => ({ svg: '<svg/>' })) });
	const md = mm.transform('## T\n\n```mermaid\nflowchart LR\n A-->B\n```\n\ntext', 'md');
	assert.match(md, /<deck-mermaid data-id="[0-9a-f]{10}">\n<\/deck-mermaid>/);
	assert.ok(!md.includes('```'));
	const html = mm.transform('<deck-mermaid label="x"><script type="text/mermaid">pie\n "a": 1</script></deck-mermaid>', 'html');
	assert.match(html, /<deck-mermaid label="x" data-id="[0-9a-f]{10}"><\/deck-mermaid>/);
});

test('finalize renders once per skin and escapes < in the JSON', () => {
	let seen;
	const mm = createPrerender(root, { render: (jobs) => ((seen = jobs), jobs.map(() => ({ svg: '<svg>a</svg>' }))) });
	mm.transform('```mermaid\nflowchart LR\n A-->B\n```', 'md');
	const block = mm.finalize();
	assert.equal(seen.length, Object.keys(readThemes(root)).length);
	assert.ok(block.startsWith('<script type="application/json" id="deck-mermaid-data">'));
	assert.ok(!block.slice(60, -9).includes('<'));
});

test('a failed render leaves the source visible and warns, not throws', () => {
	const warnings = [];
	const mm = createPrerender(root, { render: () => { throw new Error('no md-doc'); }, warn: (m) => warnings.push(m) });
	mm.transform('```mermaid\nflowchart LR\n zz-unique-1-->B\n```', 'md');
	const block = mm.finalize();
	assert.match(block, /md-doc unavailable/);
	assert.ok(warnings.length >= 1);
});
