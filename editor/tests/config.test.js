// deck.config.js line edits (editor/server/config.js).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { setConfigText } from '../server/config.js';
import { REPO } from './helpers.js';

const CONFIG = fs.readFileSync(`${REPO}/deck.config.js`, 'utf8');

describe('setConfigText', () => {
	it('replaces a scalar value in place, keeping comments', () => {
		const next = setConfigText(CONFIG, 'transition', 'fade');
		assert.match(next, /^\ttransition: 'fade',$/m);
		assert.equal(next.split('\n').length, CONFIG.split('\n').length);
		assert.equal(next.replace("transition: 'fade'", "transition: 'slide'"), CONFIG);
	});

	it('handles numbers and booleans', () => {
		assert.match(setConfigText(CONFIG, 'width', 1280), /^\twidth: 1280,$/m);
		assert.match(setConfigText(CONFIG, 'margin', 0.1), /^\tmargin: 0.1,$/m);
		assert.match(setConfigText(CONFIG, 'hash', false), /^\thash: false,$/m);
		assert.match(setConfigText(CONFIG, 'slideNumber', 'c/t'), /^\tslideNumber: 'c\/t',$/m);
	});

	it('re-enables a commented-out key and comments it out again', () => {
		const on = setConfigText(CONFIG, 'theme', 'dark');
		assert.match(on, /^\ttheme: 'dark',$/m);
		const off = setConfigText(on, 'theme', '');
		assert.match(off, /^\t\/\/ theme: 'dark',$/m);
	});

	it('adds a missing key before the closing brace', () => {
		const next = setConfigText(CONFIG, 'controls', false);
		assert.match(next, /\tcontrols: false,\n};\s*$/);
	});

	it('refuses unknown keys, bad values and structured values', () => {
		assert.throws(() => setConfigText(CONFIG, 'chrome', 'x'), /not an editable/);
		assert.throws(() => setConfigText(CONFIG, 'transition', 'spin'), /not a valid value/);
		assert.throws(() => setConfigText(CONFIG, 'width', 1.5), /not a valid value/);
		assert.throws(() => setConfigText(CONFIG, 'theme', 'x"; alert(1)'), /not a valid value/);
		assert.throws(
			() => setConfigText('export default {\n\twidth: W * 2,\n};\n', 'width', 10),
			/structured/
		);
	});
});
