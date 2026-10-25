// The editor API end to end: a real Vite dev server with the deck-editor plugin,
// running on a throwaway copy of the repo.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { fixture, startEditor } from './helpers.js';

describe('editor API', () => {
	let fx;
	let ed;
	before(async () => {
		fx = fixture();
		ed = await startEditor(fx.root);
	});
	after(async () => {
		await ed?.close();
		fx?.cleanup();
	});

	describe('charts', () => {
		it('parses a chart block (YAML or JSON) so the wizard can read it back', async () => {
			const yaml = await ed.api('/api/charts/parse', { method: 'POST', body: { source: 'mark: bar\ndata:\n  values: [{a: 1}]\n' } });
			assert.equal(yaml.status, 200);
			assert.deepEqual(yaml.body.spec, { mark: 'bar', data: { values: [{ a: 1 }] } });
			const json = await ed.api('/api/charts/parse', { method: 'POST', body: { source: '{"mark": "point"}' } });
			assert.deepEqual(json.body.spec, { mark: 'point' });
		});

		it('refuses a block that is not a spec', async () => {
			for (const source of ['- 1\n- 2', 'just text', 'a: [unclosed']) {
				const { status, body } = await ed.api('/api/charts/parse', { method: 'POST', body: { source } });
				assert.equal(status, 400, source);
				assert.match(body.detail, /chart spec/i);
			}
		});
	});

	describe('security', () => {
		it('rejects writes without the session token', async () => {
			const { status, body } = await ed.api('/api/file', {
				method: 'PUT',
				token: 'nope',
				body: { path: 'slides/010-intro.md', content: 'x', revision: null },
			});
			assert.equal(status, 403);
			assert.match(body.detail, /session expired/);
			assert.notEqual(fx.read('slides/010-intro.md'), 'x');
		});

		it('rejects cross-origin and cross-site writes', async () => {
			for (const headers of [
				{ Origin: 'http://evil.example' },
				{ 'Sec-Fetch-Site': 'cross-site' },
			]) {
				const { status } = await ed.api('/api/preview', {
					method: 'POST',
					headers,
					body: { id: 'abcdefgh', buffers: {} },
				});
				assert.equal(status, 403, JSON.stringify(headers));
			}
		});

		it('answers only on a loopback host name', async () => {
			const http = await import('node:http');
			const { port } = new URL(ed.origin);
			const status = await new Promise((resolve) => {
				http.get(
					{
						host: '127.0.0.1',
						port,
						path: '/__editor/api/tree',
						headers: { Host: `attacker.example:${port}` },
					},
					(res) => resolve(res.statusCode)
				);
			});
			assert.equal(status, 403);
		});

		it('serves the app and Monaco with a strict CSP', async () => {
			const page = await fetch(`${ed.origin}/__editor/`);
			assert.equal(page.status, 200);
			assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
			assert.match(await page.text(), /Deck studio/);
			const loader = await fetch(`${ed.origin}/__editor/vendor/monaco/vs/loader.js`);
			assert.equal(loader.status, 200);
			assert.match(loader.headers.get('content-type'), /javascript/);
			assert.equal((await fetch(`${ed.origin}/__editor/..%2f..%2fpackage.json`)).status, 404);
		});
	});

	describe('files', () => {
		it('reads, saves and reports a stale save as a 409 with the disk text', async () => {
			const file = (await ed.api('/api/file?path=slides/010-intro.md')).body;
			const saved = await ed.api('/api/file', {
				method: 'PUT',
				body: { path: file.path, content: '## Saved\n', revision: file.revision },
			});
			assert.equal(saved.status, 200);
			assert.equal(fx.read('slides/010-intro.md'), '## Saved\n');
			const stale = await ed.api('/api/file', {
				method: 'PUT',
				body: { path: file.path, content: '## Stale\n', revision: file.revision },
			});
			assert.equal(stale.status, 409);
			assert.equal(stale.body.detail.content, '## Saved\n');
			fx.git('checkout', '-q', '--', 'slides/010-intro.md');
		});

		it('changes the change signature when a file changes', async () => {
			const one = (await ed.api('/api/changes')).body.signature;
			fx.write('slides/README.md', fx.read('slides/README.md') + '\n');
			const two = (await ed.api('/api/changes')).body.signature;
			assert.notEqual(one, two);
			fx.git('checkout', '-q', '--', 'slides/README.md');
		});

		it('searches text files', async () => {
			const { results } = (await ed.api('/api/search?q=vertical%20sub-slide')).body;
			assert.ok(results.some((r) => r.path === 'slides/010-intro.md'));
		});
	});

	describe('preview overlay', () => {
		it('shows unsaved buffers only to its own preview id', async () => {
			const posted = await ed.api('/api/preview', {
				method: 'POST',
				body: {
					id: 'preview-one',
					buffers: { 'slides/010-intro.md': '## UNSAVED OVERLAY', 'deck.css': 'ignored' },
				},
			});
			assert.deepEqual(posted.body.files, ['slides/010-intro.md']);
			const html = (id) =>
				ed.server.transformIndexHtml(
					id ? `/?__preview=${id}` : '/',
					fx.read('index.html'),
					id ? `/?__preview=${id}` : '/'
				);
			assert.match(await html('preview-one'), /UNSAVED OVERLAY/);
			assert.doesNotMatch(await html('preview-two'), /UNSAVED OVERLAY/);
			assert.doesNotMatch(await html(null), /UNSAVED OVERLAY/);
			assert.match(
				await html('preview-one'),
				/id="architecture"/,
				'other slides still come from disk'
			);
		});

		it('stamps source offsets on HTML slides in a preview, never in the plain deck', async () => {
			await ed.api('/api/preview', { method: 'POST', body: { id: 'preview-src', buffers: {} } });
			const preview = await ed.server.transformIndexHtml(
				'/?__preview=preview-src',
				fx.read('index.html'),
				'/?__preview=preview-src'
			);
			assert.match(
				preview,
				/<section id="architecture" data-slug="architecture" data-studio-src="slides\/020-architecture.html:0">/
			);
			const plain = await ed.server.transformIndexHtml('/', fx.read('index.html'), '/');
			assert.doesNotMatch(plain, /data-studio-src/);
		});

		it('drops a buffer from the overlay once that file is saved', async () => {
			await ed.api('/api/preview', {
				method: 'POST',
				body: { id: 'preview-save', buffers: { 'slides/010-intro.md': '## OLD BUFFER' } },
			});
			const file = (await ed.api('/api/file?path=slides/010-intro.md')).body;
			await ed.api('/api/file', {
				method: 'PUT',
				body: { path: file.path, content: '## ON DISK\n', revision: file.revision },
			});
			const html = await ed.server.transformIndexHtml(
				'/?__preview=preview-save',
				fx.read('index.html'),
				'/?__preview=preview-save'
			);
			assert.doesNotMatch(html, /OLD BUFFER/);
			assert.match(html, /ON DISK/);
			fx.git('checkout', '-q', '--', 'slides/010-intro.md');
		});
	});

	describe('slides', () => {
		const action = (body) => ed.api('/api/slides/action', { method: 'POST', body });

		it('models the deck in Reveal order', async () => {
			const { slides } = (await ed.api('/api/deck', { method: 'POST', body: {} })).body;
			assert.deepEqual(
				slides.map((s) => [s.file, s.h]),
				[
					['000-title.html', 0],
					['010-intro.md', 1],
					['020-architecture.html', 2],
					['030-live-demo.html', 3],
				]
			);
		});

		it('inserts, stacks, moves, renames and deletes with git mv', async () => {
			let result = await action({ action: 'insert', title: 'Agenda', where: { after: 'intro' } });
			assert.equal(result.status, 200, JSON.stringify(result.body));
			assert.equal(result.body.created, 'slides/011-agenda.md');
			assert.match(fx.read('slides/011-agenda.md'), /## Agenda/);

			result = await action({
				action: 'move',
				files: ['011-agenda.md'],
				where: { verticalOf: 20 },
			});
			assert.deepEqual(result.body.renamed, [
				{ from: 'slides/020-architecture.html', to: 'slides/020.1-architecture.html' },
				{ from: 'slides/011-agenda.md', to: 'slides/020.2-agenda.md' },
			]);

			result = await action({
				action: 'move',
				files: ['030-live-demo.html'],
				where: { before: 'title' },
			});
			assert.equal(result.status, 200, JSON.stringify(result.body));
			assert.deepEqual(fx.slides(), [
				'000-live-demo.html',
				'010-title.html',
				'020-intro.md',
				'030.1-architecture.html',
				'030.2-agenda.md',
			]);
			assert.match(
				fx.git('status', '--porcelain'),
				/R {2}slides\/020-architecture.html -> slides\/030.1-architecture.html/
			);

			result = await action({
				action: 'rename-slug',
				file: '030.1-architecture.html',
				slug: 'how-it-works',
			});
			assert.equal(result.status, 200, JSON.stringify(result.body));
			assert.ok(fx.exists('slides/030.1-how-it-works.html'));
			assert.match(
				fx.read('slides/030.1-how-it-works.html'),
				/<section id="how-it-works" data-slug="how-it-works">/
			);

			result = await action({ action: 'duplicate', file: '020-intro.md' });
			assert.equal(result.body.created, 'slides/021-intro-copy.md');

			result = await action({ action: 'delete', file: '021-intro-copy.md' });
			assert.equal(result.body.removed, 'slides/021-intro-copy.md');
			assert.ok(!fx.exists('slides/021-intro-copy.md'));
			assert.ok(fx.exists(result.body.trashed));
			assert.ok(!fx.slides().some((f) => f.includes('.moving')), 'no temp files left behind');
		});

		it('rewrites #/<slug> jump links when a slug is renamed', async () => {
			fx.write(
				'slides/020-intro.md',
				fx.read('slides/020-intro.md') + '\n[Back to start](#/title)\n'
			);
			const result = await action({
				action: 'rename-slug',
				file: '010-title.html',
				slug: 'opening',
			});
			assert.ok(result.body.changed.includes('slides/020-intro.md'));
			assert.match(fx.read('slides/020-intro.md'), /\(#\/opening\)/);
		});

		it('refuses an action over a slide that changed on disk since the client read it', async () => {
			const result = await action({
				action: 'move',
				files: ['020-intro.md'],
				where: { end: true },
				revisions: { 'slides/020-intro.md': 'stale' },
			});
			assert.equal(result.status, 409);
			assert.ok(fx.exists('slides/020-intro.md'), 'nothing moved');
		});

		it('reports planner errors as 400s', async () => {
			const result = await action({
				action: 'insert',
				title: 'X',
				where: { after: 'missing-slug' },
			});
			assert.equal(result.status, 400);
			assert.match(result.body.detail, /no slide with slug "missing-slug"/);
		});

		it('renumbers the deck', async () => {
			const result = await action({ action: 'rebalance' });
			assert.equal(result.status, 200);
			assert.deepEqual(
				fx.slides().map((f) => f.split('-')[0]),
				['000', '010', '020', '030.1', '030.2']
			);
		});
	});

	describe('lint', () => {
		it('reports what npm run lint:slides reports, including unsaved text', async () => {
			fx.write('slides/040-bad.md', '<div class="no-such-class"></div>\n');
			let cli = '';
			try {
				execFileSync(process.execPath, ['scripts/lint-slide-classes.js'], {
					cwd: fx.root,
					encoding: 'utf8',
					stdio: 'pipe',
				});
			} catch (error) {
				cli = error.stderr;
			}
			const { problems } = (await ed.api('/api/lint', { method: 'POST', body: {} })).body;
			assert.equal(problems.length, cli.trim().split('\n').length);
			for (const p of problems)
				assert.ok(
					cli.includes(`${p.path.replace('slides/', '')}:${p.line} — ${p.message}`),
					p.message
				);

			const unsaved = (
				await ed.api('/api/lint', {
					method: 'POST',
					body: { buffers: { 'slides/040-bad.md': '<div class="box"></div>' } },
				})
			).body;
			assert.equal(unsaved.problems.length, 0);
		});
	});

	describe('config and catalog', () => {
		it('reads deck.config.js values and writes one key', async () => {
			const config = (await ed.api('/api/config')).body;
			assert.equal(config.values.width, 1920);
			const result = await ed.api('/api/config', {
				method: 'POST',
				body: { key: 'transition', value: 'zoom', revision: config.revision },
			});
			assert.equal(result.status, 200);
			assert.match(fx.read('deck.config.js'), /^\ttransition: 'zoom',$/m);
			const stale = await ed.api('/api/config', {
				method: 'POST',
				body: { key: 'transition', value: 'fade', revision: config.revision },
			});
			assert.equal(stale.status, 409);
		});

		it('lists skins, components and classes', async () => {
			const catalog = (await ed.api('/api/catalog')).body;
			assert.deepEqual(catalog.themes, ['dark']);
			const bar = catalog.components.find((c) => c.tag === 'deck-chart-bar');
			assert.deepEqual(bar.attributes, ['data', 'label']);
			assert.ok(catalog.classes.deck.includes('box'));
			assert.ok(catalog.properties.includes('--primary'));
		});
	});

	describe('git', () => {
		it('stages and commits deck changes, never editor history', async () => {
			let status = (await ed.api('/api/git/status')).body;
			assert.ok(status.available);
			assert.ok(
				!status.files.some((f) => f.path.startsWith('.editor-')),
				'recovery copies are hidden'
			);
			const diff = (await ed.api('/api/git/diff?path=deck.config.js&staged=false')).body;
			assert.match(diff.diff, /transition: 'zoom'/);
			assert.equal(
				(
					await ed.api('/api/git/action', {
						method: 'POST',
						body: { action: 'stage', path: 'deck.config.js' },
					})
				).status,
				200
			);
			const commit = await ed.api('/api/git/action', {
				method: 'POST',
				body: { action: 'commit', message: 'Use zoom' },
			});
			assert.equal(commit.status, 200, JSON.stringify(commit.body));
			assert.match(fx.git('log', '-1', '--format=%s'), /Use zoom/);
			status = commit.body;
			assert.ok(!status.files.some((f) => f.path === 'deck.config.js'));
			const blocked = await ed.api('/api/git/action', {
				method: 'POST',
				body: { action: 'stage', path: '.editor-history/x' },
			});
			assert.equal(blocked.status, 400);
		});
	});

	describe('build', () => {
		it('runs build:deck as a job', { timeout: 120000 }, async () => {
			const job = (await ed.api('/api/build', { method: 'POST', body: {} })).body;
			assert.equal(job.status, 'running');
			assert.equal(
				(await ed.api('/api/build', { method: 'POST', body: {} })).status,
				409,
				'one build at a time'
			);
			let state = job;
			while (state.status === 'running') {
				await new Promise((resolve) => setTimeout(resolve, 300));
				state = (await ed.api(`/api/jobs/${job.id}`)).body;
			}
			assert.equal(state.status, 'succeeded', state.log);
			assert.ok(fx.exists('deck-dist/index.html'));
		});
	});
});
