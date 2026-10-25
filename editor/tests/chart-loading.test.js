import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

for (const fail of [false, true]) {
	test(`concurrent Vega loading restores Monaco after ${fail ? 'failure' : 'success'}`, async () => {
		const amd = () => {};
		const loaded = [];
		const ctx = {define: amd, document: {
			createElement: () => ({}),
			head: {append(s) {
				loaded.push(s.src);
				queueMicrotask(() => {
					assert.equal(ctx.define, undefined);
					if (fail) s.onerror();
					else {
						if (s.src.endsWith('/vega-embed.min.js')) ctx.vegaEmbed = () => {};
						s.onload();
					}
				});
			}},
		}};
		ctx.window = ctx;
		vm.createContext(ctx);
		const source = readFileSync(new URL('../static/chart-wizard.js', import.meta.url), 'utf8').replace('root.ChartWizard = {', 'root.ChartWizard = { loadVega,');
		vm.runInContext(source, ctx);

		const results = await Promise.allSettled(Array.from({length: 8}, () => ctx.ChartWizard.loadVega('/vendor')));
		assert.strictEqual(ctx.define, amd);
		assert.equal(loaded.length, fail ? 1 : 3);
		for (const result of results) {
			assert.equal(result.status, fail ? 'rejected' : 'fulfilled');
			if (!fail) assert.strictEqual(result.value, ctx.vegaEmbed);
		}
	});
}
