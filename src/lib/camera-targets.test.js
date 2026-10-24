import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseTarget, homeView, pointView, magnify, clampView, pickCue, sameView, DEFAULT_POINT_ZOOM,
} from './camera-targets.js';

test('parseTarget: home and empty', () => {
	assert.deepEqual(parseTarget('home'), { kind: 'home' });
	assert.deepEqual(parseTarget(''), { kind: 'home' });
	assert.deepEqual(parseTarget(null), { kind: 'home' });
	assert.deepEqual(parseTarget('  HOME '), { kind: 'home' });
});

test('parseTarget: point with and without zoom', () => {
	assert.deepEqual(parseTarget('25% 30% 2x'), { kind: 'point', x: 0.25, y: 0.3, zoom: 2 });
	assert.deepEqual(parseTarget('50% 50%'), { kind: 'point', x: 0.5, y: 0.5, zoom: DEFAULT_POINT_ZOOM });
	assert.deepEqual(parseTarget('0% 100% 1.5x'), { kind: 'point', x: 0, y: 1, zoom: 1.5 });
	assert.deepEqual(parseTarget('-10% 110% 2x'), { kind: 'point', x: -0.1, y: 1.1, zoom: 2 });
});

test('parseTarget: element with optional extra zoom', () => {
	assert.deepEqual(parseTarget('#chart'), { kind: 'element', selector: '#chart', zoom: 1 });
	assert.deepEqual(parseTarget('#chart 1.5x'), { kind: 'element', selector: '#chart', zoom: 1.5 });
	assert.deepEqual(parseTarget('.row > .cell 2x'), { kind: 'element', selector: '.row > .cell', zoom: 2 });
});

test('parseTarget: a zero or junk zoom falls back rather than dividing by zero', () => {
	assert.equal(parseTarget('#a 0x').zoom, 1);
	assert.equal(parseTarget('10% 10% 0x').zoom, DEFAULT_POINT_ZOOM);
});

test('views: home, point, magnify', () => {
	assert.deepEqual(homeView(1920, 1080), [960, 540, 1920]);
	assert.deepEqual(pointView({ x: 0.25, y: 0.25, zoom: 2 }, 1920, 1080), [480, 270, 960]);
	assert.deepEqual(magnify([100, 200, 800], 2), [100, 200, 400]);
});

test('clampView: keeps the frame inside the slide', () => {
	// 2x at the top-left corner: the view is 960x540, so its centre cannot be nearer than 480,270
	assert.deepEqual(clampView([0, 0, 960], 1920, 1080), [480, 270, 960]);
	assert.deepEqual(clampView([1920, 1080, 960], 1920, 1080), [1440, 810, 960]);
	// already inside: untouched
	assert.deepEqual(clampView([900, 500, 960], 1920, 1080), [900, 500, 960]);
});

test('clampView: a view as wide as or wider than the slide is centred', () => {
	assert.deepEqual(clampView([100, 100, 1920], 1920, 1080), [960, 540, 1920]);
	assert.deepEqual(clampView([100, 100, 4000], 1920, 1080), [960, 540, 4000]);
});

test('pickCue: latest shown cue in fragment order wins; none shown = null', () => {
	const cue = (name, index, visible) => ({ cue: name, index, visible });
	assert.equal(pickCue([cue('a', 0, true), cue('b', 1, true), cue('c', 2, false)]), 'b');
	assert.equal(pickCue([cue('a', 0, false), cue('b', 1, false)]), null);
	assert.equal(pickCue([]), null);
	// document order is not fragment order: index decides
	assert.equal(pickCue([cue('late', 3, true), cue('early', 1, true)]), 'late');
	// a tie goes to the later element
	assert.equal(pickCue([cue('x', 1, true), cue('y', 1, true)]), 'y');
});

test('sameView', () => {
	assert.equal(sameView([1, 2, 3], [1.2, 2, 3.1]), true);
	assert.equal(sameView([1, 2, 3], [2, 2, 3]), false);
	assert.equal(sameView(null, [1, 2, 3]), false);
});
