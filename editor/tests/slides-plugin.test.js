// build/vite-plugin-slides.js reload modes: Vite's full-reload by default,
// the deck:slides-changed event under the editor (which refreshes its own
// preview off screen, so it never flashes).
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import slides from '../../build/vite-plugin-slides.js';

function fakeServer() {
	const handlers = {};
	const sent = [];
	return {
		sent,
		fire: (event, file) => handlers[event]?.(file),
		server: {
			watcher: {
				add() {},
				on(event, fn) {
					handlers[event] = fn;
					return this;
				},
			},
			ws: { send: (message) => sent.push(message) },
		},
	};
}

function run(options) {
	const plugin = slides(options);
	const root = path.resolve('/deck');
	plugin.configResolved({ root });
	const fake = fakeServer();
	plugin.configureServer(fake.server);
	fake.fire('change', path.join(root, 'slides', '010-intro.md'));
	fake.fire('change', path.join(root, 'deck.css'));
	return fake.sent;
}

describe('slides() reloads', () => {
	it('sends a full reload for slide changes by default', () => {
		assert.deepEqual(run(), [{ type: 'full-reload' }]);
	});

	it("sends deck:slides-changed (and no full reload) with reload: 'event'", () => {
		assert.deepEqual(run({ reload: 'event' }), [{ type: 'custom', event: 'deck:slides-changed' }]);
	});
});
