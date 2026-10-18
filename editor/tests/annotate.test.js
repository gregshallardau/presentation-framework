// Preview source positions (editor/server/annotate.js).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { annotateHtml } from '../server/annotate.js';
import { parseStartTag } from '../static/source-edit.js';

const SLIDE = `<section id="a">
	<!-- <p>commented</p> -->
	<style>.x > p { color: red }</style>
	<p class="x">One <strong>two</strong></p>
	<script type="module">if (1 < 2) document.querySelector('<p>')</script>
	<img src="a.png" />
</section>`;

describe('annotateHtml', () => {
	const out = annotateHtml(SLIDE, 'slides/a.html');
	const marks = [...out.matchAll(/data-studio-src="slides\/a\.html:(\d+)"/g)].map((m) =>
		Number(m[1])
	);

	it('marks every real start tag with the offset of its "<"', () => {
		const tags = marks.map((offset) => parseStartTag(SLIDE, offset).name);
		assert.deepEqual(tags, ['section', 'style', 'p', 'strong', 'script', 'img']);
	});

	it('skips comments and the contents of style and script', () => {
		assert.ok(!out.includes('<p>commented</p> data-studio'));
		assert.match(out, /<!-- <p>commented<\/p> -->/);
		assert.match(out, /\.x > p \{ color: red \}/);
		assert.match(out, /document\.querySelector\('<p>'\)/);
	});

	it('keeps self-closing tags valid', () => {
		assert.match(out, /<img src="a.png" data-studio-src="slides\/a.html:\d+" \/>/);
	});
});
