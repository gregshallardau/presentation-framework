// Reveal-native animation markup edits (editor/static/source-edit.js).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	applyEdits,
	findMdLine,
	fragmentChange,
	fragmentOf,
	mdPlacementWarning,
	parseStartTag,
	readTarget,
	unfragmentChange,
} from '../static/source-edit.js';

const HTML = `<section id="demo" data-slug="demo">
\t<h2 class="title  big">Demo</h2>
\t<ul>
\t\t<li data-x='1'>One</li>
\t\t<li>Two</li>
\t</ul>
\t<img src="a.png" alt="A" />
</section>
`;
const at = (needle) => HTML.indexOf(needle);

describe('HTML start tags', () => {
	it('parses attributes with every quoting style', () => {
		const tag = parseStartTag(HTML, at('<li data-x'));
		assert.equal(tag.name, 'li');
		assert.deepEqual(
			tag.tokens.map((t) => [t.name, t.value]),
			[['data-x', '1']]
		);
		assert.equal(parseStartTag(HTML, at('<img')).close, ' />');
	});

	it('adds a fragment and keeps untouched attributes byte for byte', () => {
		const target = { kind: 'html', offset: at('<li data-x') };
		const next = applyEdits(HTML, [
			{ target, change: fragmentChange(readTarget(HTML, target), { effect: 'fade-up', index: 2 }) },
		]);
		assert.match(next, /<li data-x='1' class="fragment fade-up" data-fragment-index="2">One<\/li>/);
		assert.equal(next.replace(/ class="fragment fade-up" data-fragment-index="2"/, ''), HTML);
	});

	it('edits classes in place and removes them cleanly', () => {
		const target = { kind: 'html', offset: at('<h2') };
		let next = applyEdits(HTML, [{ target, change: { addClass: ['fragment', 'grow'] } }]);
		assert.match(next, /<h2 class="title big fragment grow">/);
		next = applyEdits(next, [{ target, change: unfragmentChange(readTarget(next, target)) }]);
		assert.match(next, /<h2 class="title big">/);
	});

	it('writes boolean attributes and escapes values', () => {
		const target = { kind: 'html', offset: 0 };
		const next = applyEdits(HTML, [
			{ target, change: { set: { 'data-auto-animate': true, 'data-note': 'a "b"' } } },
		]);
		assert.match(
			next,
			/^<section id="demo" data-slug="demo" data-auto-animate data-note="a &quot;b&quot;">/
		);
	});

	it('applies several edits with stale-safe offsets', () => {
		const edits = ['<li data-x', '<li>Two', '<h2'].map((needle, i) => ({
			target: { kind: 'html', offset: at(needle) },
			change: { set: { 'data-fragment-index': String(i) }, addClass: ['fragment'] },
		}));
		const next = applyEdits(HTML, edits);
		assert.match(next, /<li data-x='1' class="fragment" data-fragment-index="0">/);
		assert.match(next, /<li class="fragment" data-fragment-index="1">Two/);
		assert.match(next, /<h2 class="title big fragment" data-fragment-index="2">/);
	});
});

const MD = `## Intro

- one
- **two** things
Plain paragraph
A **bold** paragraph

--

### Sub

\`\`\`js
- not a list
\`\`\`
`;

describe('Markdown comments', () => {
	it('puts a new element comment right after the list marker', () => {
		const next = applyEdits(MD, [
			{ target: { kind: 'md', line: 4 }, change: { addClass: ['fragment'] } },
		]);
		assert.equal(next.split('\n')[3], '- <!-- .element: class="fragment" --> **two** things');
	});

	it('appends to a plain paragraph and warns about inline markup', () => {
		const next = applyEdits(MD, [
			{ target: { kind: 'md', line: 5 }, change: { addClass: ['fragment'] } },
		]);
		assert.equal(next.split('\n')[4], 'Plain paragraph <!-- .element: class="fragment" -->');
		assert.equal(mdPlacementWarning('Plain paragraph'), null);
		assert.match(mdPlacementWarning('A **bold** paragraph'), /inline formatting/);
		assert.equal(mdPlacementWarning('- **two**'), null);
	});

	it('edits an existing comment in place, wherever it is', () => {
		const src = 'Text <!-- .element: class="fragment" data-fragment-index="1" -->';
		const target = { kind: 'md', line: 1 };
		assert.deepEqual(fragmentOf(readTarget(src, target)), {
			fragment: true,
			effect: 'fade-in',
			index: 1,
		});
		const next = applyEdits(src, [
			{ target, change: fragmentChange(readTarget(src, target), { effect: 'grow', index: null }) },
		]);
		assert.equal(next, 'Text <!-- .element: class="fragment grow" -->');
		assert.equal(
			applyEdits(next, [{ target, change: unfragmentChange(readTarget(next, target)) }]),
			'Text'
		);
	});

	it('writes bare data-* booleans that Reveal can parse', () => {
		const next = applyEdits('- one', [
			{
				target: { kind: 'md', line: 1 },
				change: { set: { 'data-id': 'one', 'data-auto-animate-delay': '0.2' } },
			},
		]);
		assert.equal(next, '- <!-- .element: data-id="one" data-auto-animate-delay="0.2" --> one');
	});

	it('refuses lines inside code fences', () => {
		assert.throws(
			() =>
				applyEdits(MD, [{ target: { kind: 'md', line: 13 }, change: { addClass: ['fragment'] } }]),
			/code block/
		);
	});

	it('adds, edits and removes the slide comment of the right sub-slide', () => {
		let next = applyEdits(MD, [
			{ target: { kind: 'md-slide', line: 9 }, change: { set: { 'data-auto-animate': true } } },
		]);
		assert.equal(next.split('\n')[9], '<!-- .slide: data-auto-animate -->');
		assert.deepEqual(readTarget(next, { kind: 'md-slide', line: 9 }).attrs, {
			'data-auto-animate': '',
		});
		assert.deepEqual(readTarget(next, { kind: 'md-slide', line: 1 }).attrs, {});
		next = applyEdits(next, [
			{
				target: { kind: 'md-slide', line: 9 },
				change: { set: { 'data-auto-animate-duration': '2' } },
			},
		]);
		assert.equal(
			next.split('\n')[9],
			'<!-- .slide: data-auto-animate data-auto-animate-duration="2" -->'
		);
		next = applyEdits(next, [
			{
				target: { kind: 'md-slide', line: 9 },
				change: { set: { 'data-auto-animate': null, 'data-auto-animate-duration': null } },
			},
		]);
		assert.equal(next, MD);
	});

	it('finds the source line of a rendered element', () => {
		assert.equal(findMdLine(MD, 1, 7, { tag: 'li', text: 'two things' }), 4);
		assert.equal(findMdLine(MD, 1, 7, { tag: 'h2', text: 'Intro' }), 1);
		assert.equal(findMdLine(MD, 1, 7, { tag: 'p', text: 'A bold paragraph' }), 6);
		assert.equal(findMdLine(MD, 9, 15, { tag: 'li', text: 'not a list' }), null);
		assert.equal(findMdLine('- a\n- a\n', 1, 2, { tag: 'li', text: 'a', nth: 1 }), 2);
	});
});

describe('inline text editing', async () => {
	const { elementRange, replaceInnerHtml, replaceMdText, inlineHtmlToMd } =
		await import('../static/source-edit.js');
	const SRC = `<section>
	<div class="a"><div>inner</div><!-- </div> --></div>
	<p class="lead">Hello <strong>bold</strong> world</p>
	<img src="x.png">
	<ul><li>One</li></ul>
</section>`;

	it('finds the content range across nested same-name tags and comments', () => {
		const at = SRC.indexOf('<div class="a">');
		const range = elementRange(SRC, at);
		assert.equal(SRC.slice(range.innerStart, range.innerEnd), '<div>inner</div><!-- </div> -->');
		assert.equal(elementRange(SRC, SRC.indexOf('<img')), null);
	});

	it('replaces inline content, keeps attributes, refuses block content', () => {
		const at = SRC.indexOf('<p');
		const next = replaceInnerHtml(SRC, at, 'Hi <b>there</b> <span data-studio-src="x">you</span>');
		assert.match(next, /<p class="lead">Hi <b>there<\/b> <span>you<\/span><\/p>/);
		assert.throws(() => replaceInnerHtml(SRC, SRC.indexOf('<ul'), 'x'), /block markup/);
		assert.throws(() => replaceInnerHtml(SRC, SRC.indexOf('<div class="a">'), 'x'), /block markup/);
	});

	it('converts inline HTML back to Markdown', () => {
		assert.equal(
			inlineHtmlToMd('A <strong>b</strong> <em>c</em> <code>d</code> <a href="#/x">e</a> &amp; f'),
			'A **b** *c* `d` [e](#/x) & f'
		);
	});

	it('replaces a Markdown line between its marker and comments', () => {
		const md =
			'- <!-- .element: class="fragment" --> Old **text** <!-- .element: data-id="a" -->\n- next\n';
		assert.equal(
			replaceMdText(md, 1, 'New <strong>text</strong>').split('\n')[0],
			'- <!-- .element: class="fragment" --> New **text** <!-- .element: data-id="a" -->'
		);
		assert.equal(
			replaceMdText('## Title\n\nBody\n', 1, 'Better “title”'),
			'## Better "title"\n\nBody\n'
		);
	});

	it('refuses paragraphs spanning lines and code fences', () => {
		assert.throws(() => replaceMdText('First line\nsecond line\n', 1, 'x'), /several source lines/);
		assert.throws(() => replaceMdText('```\ncode\n```\n', 2, 'x'), /code block/);
	});
});
