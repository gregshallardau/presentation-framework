// Build jobs - the counterpart of md-doc editor's export jobs (/api/jobs/{id}).
// A job runs exactly `npm run build:deck` (vite build -c vite.config.deck.js)
// in a child process; the client polls its status and log tail. One build at a
// time. After a successful build, a Vite preview server can serve deck-dist/
// so the published output can be checked before it ships.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { HttpError } from './http.js';

const LOG_LIMIT = 200 * 1024;
const KEEP_JOBS = 10;

export function createJobs(root) {
	const jobs = new Map();
	let previewServer = null;

	const viteBin = () =>
		path.join(
			path.dirname(createRequire(path.join(root, 'package.json')).resolve('vite/package.json')),
			'bin',
			'vite.js'
		);

	function view(job) {
		const { child, ...rest } = job;
		return rest;
	}

	function start() {
		const running = [...jobs.values()].find((job) => job.status === 'running');
		if (running)
			throw new HttpError(409, { message: 'A build is already running', job: running.id });
		const job = {
			id: randomUUID(),
			kind: 'build',
			status: 'running',
			log: '',
			started: Date.now(),
			finished: null,
			output: 'deck-dist/index.html',
		};
		const append = (chunk) => {
			job.log = (job.log + chunk.toString()).slice(-LOG_LIMIT);
		};
		const child = spawn(process.execPath, [viteBin(), 'build', '-c', 'vite.config.deck.js'], {
			cwd: root,
			env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		job.child = child;
		child.stdout.on('data', append);
		child.stderr.on('data', append);
		child.on('error', (error) => {
			append(`\n${error.message}\n`);
			job.status = 'failed';
			job.finished = Date.now();
		});
		child.on('close', (code, signal) => {
			if (job.status === 'running')
				job.status = signal
					? 'cancelled'
					: code === 0 && fs.existsSync(path.join(root, job.output))
						? 'succeeded'
						: 'failed';
			job.code = code;
			job.finished = Date.now();
			delete job.child;
		});
		jobs.set(job.id, job);
		while (jobs.size > KEEP_JOBS) jobs.delete(jobs.keys().next().value);
		return view(job);
	}

	function get(id) {
		const job = jobs.get(id);
		if (!job) throw new HttpError(404, 'No such job');
		return view(job);
	}

	function cancel(id) {
		const job = jobs.get(id);
		if (!job) throw new HttpError(404, 'No such job');
		if (job.status === 'running') {
			job.status = 'cancelled';
			job.child?.kill('SIGTERM');
		}
		return view(job);
	}

	// Serves deck-dist/ with `vite preview` on a free local port; reused once started.
	async function preview() {
		if (!fs.existsSync(path.join(root, 'deck-dist', 'index.html')))
			throw new HttpError(400, 'Build the deck first');
		if (!previewServer) {
			const { preview: vitePreview } = await import('vite');
			previewServer = await vitePreview({
				root,
				configFile: path.join(root, 'vite.config.deck.js'),
				logLevel: 'warn',
				preview: { host: '127.0.0.1', port: 4173, strictPort: false, open: false },
			});
		}
		return { url: previewServer.resolvedUrls?.local?.[0] || 'http://127.0.0.1:4173/' };
	}

	async function close() {
		for (const job of jobs.values()) job.child?.kill('SIGTERM');
		await previewServer?.close?.();
		previewServer = null;
	}

	return { start, get, cancel, preview, close };
}
