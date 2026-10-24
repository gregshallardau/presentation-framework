/**
 * deck-editor - the GUI editor as a Vite dev-server plugin.
 *
 * The browser-side app (editor/static/) follows md-doc editor's studio; this
 * plugin is the Node counterpart of its FastAPI backend, mounted on the same
 * dev server that serves the deck, so the live preview is the real deck.
 *
 *   /__editor/                     the editor app (editor/static/)
 *   /__editor/vendor/monaco/vs/*   Monaco, from node_modules/monaco-editor
 *   /__editor/api/*                JSON API (see editor/README.md#service-apis)
 *   /?__preview=<id>               the deck with the editor's unsaved buffers
 *
 * Security mirrors md-doc editor: requests must name a loopback Host (blocks
 * DNS rebinding); writes must be same-origin and carry the per-server session
 * token from /api/capabilities; the editor page gets a CSP that forbids remote
 * resources. Only loaded by vite.config.editor.js - never by `npm start` or
 * `build:deck`.
 */
import { randomBytes } from 'node:crypto';
import YAML from 'yaml';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, readJson, sendJson } from './http.js';
import {
	TRASH_DIR,
	changeSignature,
	readFile,
	safePath,
	scanTree,
	search,
	withWriteLock,
	writeFile,
} from './files.js';
import { deckModel } from './deck.js';
import { slideAction } from './slide-actions.js';
import { readConfig, writeConfig } from './config.js';
import { catalog } from './catalog.js';
import { lint } from './lint.js';
import { gitAction, gitDiff, gitStatus } from './git.js';
import { createJobs } from './jobs.js';

export const BASE = '/__editor';
const STATIC_DIR = fileURLToPath(new URL('../static/', import.meta.url));
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

const CONTENT_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.json': 'application/json; charset=utf-8',
	'.ttf': 'font/ttf',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.png': 'image/png',
};

const CSP =
	"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
	"style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
	"font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; " +
	"frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";

function hostname(host = '') {
	return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
}

async function serveStatic(res, dir, relative, { cache = false } = {}) {
	const full = path.resolve(dir, relative || 'index.html');
	if (!full.startsWith(dir)) throw new HttpError(404, 'Not found');
	let data;
	try {
		data = await fsp.readFile(full);
	} catch {
		throw new HttpError(404, 'Not found');
	}
	res.statusCode = 200;
	res.setHeader('Content-Type', CONTENT_TYPES[path.extname(full)] || 'application/octet-stream');
	res.setHeader('Cache-Control', cache ? 'public, max-age=86400, immutable' : 'no-store');
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.end(data);
}

/**
 * @param {{ overlay: ReturnType<import('./overlay.js').createOverlay>, allowedHosts?: string[] }} options
 */
export default function deckEditor({ overlay, allowedHosts = [] } = {}) {
	if (!overlay) throw new Error('deckEditor() needs the overlay shared with slides({ overlay })');
	const token = randomBytes(24).toString('hex');
	const hosts = new Set([...LOOPBACK, ...allowedHosts]);
	let root = process.cwd();
	let server = null;
	let jobs = null;

	const routes = {
		'GET /api/capabilities': async () => {
			const status = await gitStatus(root).catch(() => ({ available: false }));
			return {
				session: token,
				name: path.basename(root),
				workspace: root,
				git: !!status.available,
				remote: false,
				base: BASE,
			};
		},
		'GET /api/tree': async () => ({ workspace: root, ...(await scanTree(root)) }),
		'GET /api/file': ({ query }) => readFile(root, query.get('path')),
		'PUT /api/file': async ({ body }) => {
			const result = await writeFile(root, body.path, body.content, body.revision);
			overlay.dropPath(body.path);
			return result;
		},
		'POST /api/files/action': async ({ body }) => {
			const { action, path: rel, to } = body;
			if (action === 'create') return writeFile(root, rel, body.content ?? '', null);
			const full = safePath(root, rel, { editable: false });
			if (!fs.existsSync(full)) throw new HttpError(404, `${rel} does not exist`);
			return withWriteLock(async () => {
				if (action === 'trash') {
					const stamp = new Date().toISOString().replace(/[:.]/g, '-');
					const target = path.join(root, TRASH_DIR, `${stamp}-${rel.replace(/[\\/]/g, '__')}`);
					await fsp.mkdir(path.dirname(target), { recursive: true });
					await fsp.rename(full, target);
					return { removed: rel };
				}
				if (action === 'rename') {
					const dest = safePath(root, to, { editable: false });
					if (fs.existsSync(dest)) throw new HttpError(409, `${to} already exists`);
					await fsp.mkdir(path.dirname(dest), { recursive: true });
					await fsp.rename(full, dest);
					return { renamed: [{ from: rel, to }] };
				}
				throw new HttpError(400, `Unknown file action "${action}"`);
			});
		},
		// A chart block's YAML (or JSON) as a spec, so the chart wizard can read an existing chart back.
		'POST /api/charts/parse': ({ body }) => {
			try {
				const spec = YAML.parse(String(body.source ?? ''));
				if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('a chart spec must be a mapping (Vega-Lite or Vega)');
				return { spec };
			} catch (error) {
				throw new HttpError(400, `Invalid chart spec: ${String(error.message).split('\n')[0]}`);
			}
		},
		'GET /api/changes': async () => ({ signature: await changeSignature(root) }),
		'GET /api/search': async ({ query }) => ({ results: await search(root, query.get('q')) }),
		'POST /api/deck': ({ body }) => deckModel(root, body.buffers || {}),
		'POST /api/slides/action': ({ body }) => slideAction(root, body),
		'POST /api/preview': ({ body }) => {
			if (typeof body.id !== 'string' || !/^[\w-]{8,64}$/.test(body.id))
				throw new HttpError(400, 'Invalid preview id');
			const buffers = {};
			for (const [key, text] of Object.entries(body.buffers || {})) {
				if (/^slides\/[^/]+\.(md|html)$/i.test(key) && typeof text === 'string')
					buffers[key] = text;
			}
			overlay.set(body.id, buffers);
			return { url: `/?__preview=${encodeURIComponent(body.id)}`, files: Object.keys(buffers) };
		},
		'GET /api/config': () => readConfig(root, server),
		'POST /api/config': ({ body }) => writeConfig(root, body),
		'GET /api/catalog': () => catalog(root),
		'POST /api/lint': ({ body }) => lint(root, body.buffers || {}),
		'GET /api/git/status': () => gitStatus(root),
		'GET /api/git/diff': ({ query }) =>
			gitDiff(root, query.get('path'), query.get('staged') === 'true'),
		'POST /api/git/action': ({ body }) => gitAction(root, body),
		'POST /api/build': () => jobs.start(),
		'POST /api/build/preview': () => jobs.preview(),
	};

	async function handle(req, res) {
		const url = new URL(req.originalUrl || req.url, 'http://localhost');
		if (!hosts.has(hostname(req.headers.host))) {
			throw new HttpError(
				403,
				'The editor only answers on localhost; pass allowedHosts to deckEditor() to change that'
			);
		}
		if (WRITE_METHODS.has(req.method)) {
			const origin = req.headers.origin;
			if (
				origin &&
				origin !== `http://${req.headers.host}` &&
				origin !== `https://${req.headers.host}`
			) {
				throw new HttpError(403, 'Cross-origin writes are not allowed');
			}
			if (req.headers['sec-fetch-site'] === 'cross-site')
				throw new HttpError(403, 'Cross-site writes are not allowed');
			if (req.headers['x-editor-token'] !== token)
				throw new HttpError(403, 'Editor session expired; reload the page');
		}
		res.setHeader('Content-Security-Policy', CSP);
		res.setHeader('Referrer-Policy', 'no-referrer');

		let sub = url.pathname.slice(BASE.length);
		if (sub === '') {
			res.statusCode = 302;
			res.setHeader('Location', `${BASE}/`);
			return res.end();
		}
		if (sub.startsWith('/api/')) {
			const jobMatch = sub.match(/^\/api\/jobs\/([\w-]+)$/);
			let route;
			if (jobMatch && req.method === 'GET') route = () => jobs.get(jobMatch[1]);
			else if (jobMatch && req.method === 'DELETE') route = () => jobs.cancel(jobMatch[1]);
			else route = routes[`${req.method} ${sub}`];
			if (!route) throw new HttpError(404, `No route ${req.method} ${sub}`);
			const body = WRITE_METHODS.has(req.method) ? await readJson(req) : {};
			const result = await route({ query: url.searchParams, body });
			return sendJson(res, 200, result);
		}
		if (sub.startsWith('/vendor/monaco/')) {
			const monaco =
				path.join(
					path.dirname(
						createRequire(path.join(root, 'package.json')).resolve('monaco-editor/package.json')
					),
					'min'
				) + path.sep;
			return serveStatic(res, monaco, decodeURIComponent(sub.slice('/vendor/monaco/'.length)), {
				cache: true,
			});
		}
		if (sub.startsWith('/vendor/vega-datasets/')) {
			// Built-in basemaps for the chart wizard's preview (the same files the deck component uses).
			const name = decodeURIComponent(sub.slice('/vendor/vega-datasets/'.length));
			if (!/^(world-110m|us-10m)\.json$/.test(name)) throw new HttpError(404, `No dataset ${name}`);
			return serveStatic(res, path.join(root, 'src', 'lib', 'data') + path.sep, name, { cache: true });
		}
		if (sub.startsWith('/vendor/vega/')) {
			// The chart wizard's live preview: the same Vega packages the deck's <deck-chart-vega> uses.
			const file = decodeURIComponent(sub.slice('/vendor/vega/'.length));
			const packages = { 'vega.min.js': 'vega', 'vega-lite.min.js': 'vega-lite', 'vega-embed.min.js': 'vega-embed' };
			if (!packages[file]) throw new HttpError(404, `No vendor file ${file}`);
			const build = path.join(root, 'node_modules', packages[file], 'build') + path.sep;
			return serveStatic(res, build, file, { cache: true });
		}
		return serveStatic(res, STATIC_DIR, decodeURIComponent(sub.slice(1)));
	}

	return {
		name: 'deck-editor',
		configResolved(config) {
			root = path.resolve(config.root);
		},
		configureServer(viteServer) {
			server = viteServer;
			jobs = createJobs(root);
			viteServer.httpServer?.on('close', () => jobs.close());
			viteServer.middlewares.use((req, res, next) => {
				const pathname = (req.originalUrl || req.url).split('?')[0];
				if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return next();
				handle(req, res).catch((error) => {
					if (!(error instanceof HttpError)) {
						viteServer.config.logger.error(`[deck-editor] ${error.stack || error.message}`);
						error = new HttpError(500, error.message);
					}
					if (!res.headersSent) sendJson(res, error.status, { detail: error.detail });
				});
			});
			const print = viteServer.printUrls.bind(viteServer);
			viteServer.printUrls = () => {
				print();
				const local = viteServer.resolvedUrls?.local?.[0];
				if (local)
					viteServer.config.logger.info(
						`  \x1b[32m➜\x1b[0m  \x1b[1mEditor\x1b[0m:  ${new URL(`${BASE}/`, local).href}`
					);
			};
		},
	};
}
