import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	viewToRect, specFromRegion, specFromView, labelOf, idBase, uniqueId, cueFragment,
	addHtmlCue, addMdCue, findMdCueLine, setMdCue, removeHtmlCueFragment,
} from '../static/camera-edit.js';
import { parseTarget } from '../../src/lib/camera-targets.js';

const W = 1920;
const H = 1080;

test('viewToRect: the frame keeps the slide aspect', () => {
	assert.deepEqual(viewToRect([960, 540, 1920], W, H), { x: 0, y: 0, w: 1920, h: 1080 });
	assert.deepEqual(viewToRect([480, 270, 960], W, H), { x: 0, y: 0, w: 960, h: 540 });
});

test('specFromRegion: a region becomes a position target the camera can parse back', () => {
	// top-left quarter: centre 25%/25%, 2x
	assert.equal(specFromRegion({ x: 0, y: 0, w: 960, h: 540 }, W, H), '25% 25% 2x');
	const spec = specFromRegion({ x: 480, y: 100, w: 640, h: 360 }, W, H);
	assert.equal(spec, '41.7% 25.9% 3x');
	const t = parseTarget(spec);
	assert.equal(t.kind, 'point');
	assert.ok(Math.abs(t.x - 0.417) < 1e-9 && Math.abs(t.y - 0.259) < 1e-9 && t.zoom === 3);
});

test('specFromRegion: a tall region zooms out to hold it; the whole slide is 1x', () => {
	// 200 wide but 900 tall: the 16:9 frame must be 1600 wide to hold the height
	assert.equal(specFromRegion({ x: 100, y: 90, w: 200, h: 900 }, W, H), '10.4% 50% 1.2x');
	assert.equal(specFromRegion({ x: 0, y: 0, w: 1920, h: 1080 }, W, H), '50% 50% 1x');
	// bigger than the slide never zooms below 1x (the camera clamps the centre back onto the slide)
	assert.equal(specFromRegion({ x: -100, y: 0, w: 2400, h: 1080 }, W, H), '57.3% 50% 1x');
});

test('specFromView round-trips a view', () => {
	assert.equal(specFromView([480, 270, 960], W, H), '25% 25% 2x');
});

test('labelOf', () => {
	assert.equal(labelOf(''), 'home');
	assert.equal(labelOf(' HOME '), 'home');
	assert.equal(labelOf('#chart'), '#chart');
});

test('ids: slug from text, falling back to the tag, kept unique', () => {
	assert.equal(idBase('Rent: up 55% in six months', 'div'), 'rent-up-55-in-six-months');
	assert.equal(idBase('', 'IMG'), 'img');
	assert.equal(idBase('???', 'p'), 'p');
	assert.equal(uniqueId('rent', new Set()), 'rent');
	assert.equal(uniqueId('rent', new Set(['rent'])), 'rent-2');
	assert.equal(uniqueId('rent', new Set(['rent', 'rent-2'])), 'rent-3');
});

const HTML = `<section id="a" data-slug="a" data-camera>
	<h2>Title</h2>
	<p class="fragment">One</p>
</section>
`;

test('addHtmlCue: before the closing tag, indented like its siblings', () => {
	const out = addHtmlCue(HTML, 0, '#x');
	assert.equal(
		out,
		`<section id="a" data-slug="a" data-camera>
	<h2>Title</h2>
	<p class="fragment">One</p>
	${cueFragment('#x')}
</section>
`
	);
});

test('addHtmlCue: goes above a trailing speaker-notes aside', () => {
	const src = `<section id="a">
	<p>Hi</p>
	<aside class="notes">Say hi</aside>
</section>
`;
	const out = addHtmlCue(src, 0, 'home');
	assert.equal(
		out,
		`<section id="a">
	<p>Hi</p>
	${cueFragment('home')}
	<aside class="notes">Say hi</aside>
</section>
`
	);
});

test('addHtmlCue: a nested section (a vertical stack) gets it inside its own tag', () => {
	const src = `<section id="stack">
	<section id="one">
		<p>A</p>
	</section>
	<section id="two">
		<p>B</p>
	</section>
</section>
`;
	const out = addHtmlCue(src, src.indexOf('<section id="two"'), '10% 10% 2x');
	assert.match(out, /<p>B<\/p>\n\t\t<span class="fragment" data-camera="10% 10% 2x"><\/span>\n\t<\/section>/);
	assert.ok(out.indexOf('data-camera') > out.indexOf('id="two"'));
});

test('removeHtmlCueFragment: a pure cue span goes, with its line; anything else is left to the caller', () => {
	const src = addHtmlCue(HTML, 0, '#x');
	const at = src.indexOf('<span');
	assert.equal(removeHtmlCueFragment(src, at), HTML);
	// has content: not a pure cue
	const withText = '<section>\n\t<span class="fragment" data-camera="#x">hi</span>\n</section>\n';
	assert.equal(removeHtmlCueFragment(withText, withText.indexOf('<span')), null);
	// not a span
	const para = '<section>\n\t<p class="fragment" data-camera="#x"></p>\n</section>\n';
	assert.equal(removeHtmlCueFragment(para, para.indexOf('<p')), null);
	// extra attributes: keep the element
	const extra = '<section>\n\t<span class="fragment" id="k" data-camera="#x"></span>\n</section>\n';
	assert.equal(removeHtmlCueFragment(extra, extra.indexOf('<span')), null);
});

const MD = `## First

- one

--

## Second

- two

Note: say two
`;

test('Markdown: add, find, retarget and remove a cue fragment', () => {
	// sub-slide 2 spans lines 7..11
	const added = addMdCue(MD, 7, 11, '#x');
	assert.equal(
		added,
		`## First

- one

--

## Second

- two

${cueFragment('#x')}

Note: say two
`
	);
	const line = findMdCueLine(added, 7, 12, 0);
	assert.equal(line, 11);
	assert.equal(findMdCueLine(added, 1, 5, 0), null);
	assert.match(setMdCue(added, line, '50% 50% 3x'), /data-camera="50% 50% 3x"/);
	assert.equal(setMdCue(added, line, null), MD);
	assert.throws(() => setMdCue(added, 1, 'home'), /No camera cue/);
});

test('Markdown: a sub-slide with no Note: gets the cue at its end', () => {
	const src = '## A\n\n- one\n';
	assert.equal(addMdCue(src, 1, 3, 'home'), `## A\n\n- one\n\n${cueFragment('home')}\n`);
});
