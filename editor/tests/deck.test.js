// The deck model (editor/server/deck.js) must index slides exactly as Reveal does.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { deckModel, indicesAt, subslideLines } from '../server/deck.js';
import { fixture } from './helpers.js';

describe('deck model', () => {
	let fx;
	before(() => {
		fx = fixture();
		fx.write('slides/020.1-architecture.html', fx.read('slides/020-architecture.html'));
		fx.git('rm', '-q', 'slides/020-architecture.html');
		fx.write('slides/020.2-detail.md', '## Detail\n\n--\n\n## More\n');
		fx.write(
			'slides/040-nested.html',
			'<section>\n\t<section><h2>A</h2></section>\n\t<section><h2>B</h2></section>\n</section>\n'
		);
	});
	after(() => fx.cleanup());

	it('numbers horizontals by major and verticals across a stack', () => {
		const { slides, count } = deckModel(fx.root);
		const at = Object.fromEntries(
			slides.map((s) => [s.file, [s.h, s.v, s.subslides.map((x) => x.v)]])
		);
		assert.equal(count, 5);
		assert.deepEqual(at['000-title.html'], [0, 0, [0]]);
		assert.deepEqual(at['010-intro.md'], [1, 0, [0, 1]]);
		assert.deepEqual(at['020.1-architecture.html'], [2, 0, [0]]);
		assert.deepEqual(at['020.2-detail.md'], [2, 1, [1, 2]]);
		assert.deepEqual(at['030-live-demo.html'], [3, 0, [0]]);
		assert.deepEqual(at['040-nested.html'], [4, 0, [0, 1]]);
		assert.ok(slides.find((s) => s.file === '020.2-detail.md').stack);
	});

	it('reads titles and notes, preferring unsaved buffers', () => {
		const { slides } = deckModel(fx.root, {
			'slides/010-intro.md': '# Changed title\n\nNote: hi\n',
		});
		const intro = slides.find((s) => s.file === '010-intro.md');
		assert.equal(intro.title, 'Changed title');
		assert.equal(intro.notes, true);
		assert.deepEqual(intro.subslides, [{ v: 0, line: 1 }]);
	});

	it('ignores Reveal attribute comments in titles', () => {
		const { slides } = deckModel(fx.root, {
			'slides/010-intro.md':
				'<!-- .slide: data-auto-animate -->\n## <!-- .element: data-id="intro" --> Intro\n',
		});
		assert.equal(slides.find((s) => s.file === '010-intro.md').title, 'Intro');
	});

	it('maps a cursor line to Reveal indices', () => {
		const intro = deckModel(fx.root).slides.find((s) => s.file === '010-intro.md');
		assert.deepEqual(indicesAt(intro, 1), { h: 1, v: 0 });
		assert.deepEqual(indicesAt(intro, 9), { h: 1, v: 1 });
	});

	it('ignores commented-out sections', () => {
		assert.deepEqual(
			subslideLines('<section>\n<!-- <section></section> -->\n</section>', 'html'),
			[1]
		);
	});
});
