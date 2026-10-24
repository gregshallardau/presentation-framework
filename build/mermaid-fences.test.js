// Run with: npm run test:build  (node --test build/*.test.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, transformFences } from './mermaid-fences.js';

test('a fence becomes a block <deck-mermaid> with the source in src', () => {
	const out = transformFences('## T\n\n```mermaid\nflowchart LR\n  A["x"] --> B\n\n  B --> C\n```\n\nafter');
	assert.equal(
		out,
		'## T\n\n<deck-mermaid src="flowchart LR&#10;  A[&quot;x&quot;] --&gt; B&#10;&#10;  B --&gt; C">\n</deck-mermaid>\n\n\nafter'
	);
	assert.ok(!out.includes('```'));
});

test('options after the language become attributes', () => {
	assert.equal(parseOptions(' steps label="Review flow" layout=dagre'), ' steps label="Review flow" layout="dagre"');
	assert.equal(parseOptions(''), '');
});

test('other fences are untouched', () => {
	const md = '```js\nconst a = 1;\n```';
	assert.equal(transformFences(md), md);
});
