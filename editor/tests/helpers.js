// Shared fixtures for the editor tests: a throwaway copy of this repo (so slide
// actions, saves and Git run against real files without touching the working
// tree) and a real Vite dev server running the editor plugin on it.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SKIP = new Set([
	'node_modules',
	'.git',
	'deck-dist',
	'.editor-history',
	'.editor-trash',
	'.vite',
]);

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

/** A copy of the repo in a temp dir, committed into a fresh Git repo. */
export function fixture() {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'deck-editor-')));
	fs.cpSync(REPO, root, {
		recursive: true,
		filter: (src) => !SKIP.has(path.basename(src)) || path.dirname(src) !== REPO,
	});
	fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
	fs.appendFileSync(path.join(root, '.gitignore'), '\nnode_modules\n');
	git(root, 'init', '-q', '-b', 'main');
	git(root, 'add', '-A');
	git(
		root,
		'-c',
		'user.name=Test',
		'-c',
		'user.email=test@example.com',
		'commit',
		'-qm',
		'fixture'
	);
	git(root, 'config', 'user.name', 'Test');
	git(root, 'config', 'user.email', 'test@example.com');
	return {
		root,
		read: (rel) => fs.readFileSync(path.join(root, rel), 'utf8'),
		write: (rel, text) => fs.writeFileSync(path.join(root, rel), text),
		exists: (rel) => fs.existsSync(path.join(root, rel)),
		slides: () =>
			fs
				.readdirSync(path.join(root, 'slides'))
				.filter((f) => f !== 'README.md')
				.sort(),
		git: (...args) => git(root, ...args),
		cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
	};
}

/**
 * Starts the editor's Vite dev server (as vite.config.editor.js) on a free port.
 * `live` keeps file watching and the HMR socket on, as `npm run edit` has them.
 */
export async function startEditor(root, { live = false } = {}) {
	const { createServer } = await import('vite');
	const { default: slides } = await import('../../build/vite-plugin-slides.js');
	const { default: deckEditor } = await import('../server/plugin.js');
	const { createOverlay } = await import('../server/overlay.js');
	const overlay = createOverlay();
	const server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		server: live
			? {
					host: '127.0.0.1',
					port: 0,
					watch: { ignored: ['**/.editor-history/**', '**/.editor-trash/**'] },
				}
			: { host: '127.0.0.1', port: 0, ws: false, watch: null },
		optimizeDeps: live ? {} : { noDiscovery: true, include: [] },
		resolve: {
			alias: {
				'reveal.js/plugin': '/vendor/reveal.js/plugin',
				'reveal.js': '/vendor/reveal.js/js',
				'@': '/src',
			},
		},
		plugins: [slides({ overlay }), deckEditor({ overlay })],
	});
	await server.listen();
	const origin = new URL(server.resolvedUrls.local[0]).origin;
	const capabilities = await (await fetch(`${origin}/__editor/api/capabilities`)).json();

	/** Calls the editor API; returns { status, body }. */
	async function api(
		route,
		{ method = 'GET', body, token = capabilities.session, headers = {} } = {}
	) {
		const response = await fetch(`${origin}/__editor${route}`, {
			method,
			headers: { 'Content-Type': 'application/json', 'X-Editor-Token': token, ...headers },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const text = await response.text();
		let data;
		try {
			data = JSON.parse(text);
		} catch {
			data = text;
		}
		return { status: response.status, body: data };
	}
	return {
		server,
		origin,
		token: capabilities.session,
		capabilities,
		api,
		close: () => server.close(),
	};
}
