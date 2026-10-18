// Path confinement, revision-checked saves and recovery history (editor/server/files.js).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { HISTORY_DIR, readFile, revision, safePath, scanTree, writeFile } from '../server/files.js';
import { fixture } from './helpers.js';

describe('files', () => {
	let fx;
	before(() => {
		fx = fixture();
	});
	after(() => fx.cleanup());

	it('confines paths to the deck folder', () => {
		for (const bad of [
			'../etc/passwd',
			'/etc/passwd',
			'slides/../../x.md',
			'vendor/reveal.js/js/index.ts',
			'node_modules/vite/package.json',
			'.git/config',
			'.editor-history/x.txt',
			'deck-dist/index.html',
			'',
		]) {
			assert.throws(
				() => safePath(fx.root, bad),
				(error) => error.status === 400,
				bad
			);
		}
		assert.equal(
			safePath(fx.root, 'slides/010-intro.md'),
			path.join(fx.root, 'slides/010-intro.md')
		);
	});

	it('refuses a symlink that points outside the deck', () => {
		fs.symlinkSync('/etc', path.join(fx.root, 'outside'));
		assert.throws(() => safePath(fx.root, 'outside/hosts.md'), /escapes/);
	});

	it('only edits text files', () => {
		assert.throws(() => safePath(fx.root, 'public/logo.png'), /text files/);
		assert.ok(safePath(fx.root, 'public/logo.png', { editable: false }));
	});

	it('saves only on a matching revision and keeps the replaced text in history', async () => {
		const file = await readFile(fx.root, 'slides/010-intro.md');
		const saved = await writeFile(fx.root, 'slides/010-intro.md', '## One\n', file.revision);
		assert.equal(saved.revision, revision('## One\n'));
		assert.equal(fx.read('slides/010-intro.md'), '## One\n');
		const history = path.join(fx.root, HISTORY_DIR, 'slides/010-intro.md', `${file.revision}.txt`);
		assert.equal(fs.readFileSync(history, 'utf8'), file.content);

		await assert.rejects(
			writeFile(fx.root, 'slides/010-intro.md', '## Two\n', file.revision),
			(error) => {
				assert.equal(error.status, 409);
				assert.equal(error.detail.content, '## One\n');
				assert.equal(error.detail.revision, saved.revision);
				return true;
			}
		);
		assert.equal(fx.read('slides/010-intro.md'), '## One\n');
	});

	it('creates a file only when it does not exist yet', async () => {
		await writeFile(fx.root, 'notes/new.md', 'hello', null);
		assert.equal(fx.read('notes/new.md'), 'hello');
		await assert.rejects(
			writeFile(fx.root, 'notes/new.md', 'again', null),
			(error) => error.status === 409
		);
	});

	it('leaves no temp files behind', () => {
		assert.deepEqual(
			fs.readdirSync(path.join(fx.root, 'slides')).filter((f) => f.endsWith('.tmp')),
			[]
		);
	});

	it('lists the tree without machinery or hidden folders', async () => {
		const { tree } = await scanTree(fx.root);
		const top = tree.map((node) => node.name);
		for (const hidden of ['node_modules', 'vendor', '.git', '.editor-history'])
			assert.ok(!top.includes(hidden), hidden);
		assert.ok(top.includes('slides') && top.includes('deck.css'));
		assert.equal(
			tree.findIndex((node) => node.type !== 'dir') >
				tree.findLastIndex((node) => node.type === 'dir'),
			true,
			'folders first'
		);
	});
});
