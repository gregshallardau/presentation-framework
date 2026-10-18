// Source control for the editor - a port of md-doc editor's git_api.py
// (status / diff / action) to the deck folder. Git runs via execFile (no
// shell), never touches .editor-history or .editor-trash, and commits only
// what the author staged.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { HttpError } from './http.js';
import { HISTORY_DIR, TRASH_DIR, preserveRevision, safePath, toRelative } from './files.js';

function git(root, args, { check = true } = {}) {
	return new Promise((resolve, reject) => {
		execFile(
			'git',
			['-C', root, ...args],
			{ timeout: 30000, maxBuffer: 16 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error && error.code === 'ENOENT')
					return reject(new HttpError(503, 'Git is unavailable on this machine'));
				const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
				if (check && code)
					return reject(new HttpError(422, (stderr || stdout || error.message).trim()));
				resolve({ code, stdout, stderr });
			}
		);
	});
}

const internal = (path) =>
	path.split('/').some((part) => part === HISTORY_DIR || part === TRASH_DIR);

async function repoRoot(root) {
	const result = await git(root, ['rev-parse', '--show-toplevel'], { check: false });
	return result.code ? null : fs.realpathSync(result.stdout.trim());
}

export async function gitStatus(root) {
	const top = await repoRoot(root);
	if (!top) return { available: false, files: [], branch: '' };
	const raw = (
		await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])
	).stdout;
	const entries = raw.split('\0');
	const files = [];
	const realRoot = fs.realpathSync(root);
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (!entry) continue;
		const code = entry.slice(0, 2);
		const name = entry.slice(3);
		const original = /[RC]/.test(code) ? entries[++i] : null;
		const path = toRelative(realRoot, `${top}/${name}`);
		if (path.startsWith('..') || internal(path)) continue;
		files.push({ path, code, staged: code[0] !== ' ' && code[0] !== '?', original });
	}
	const branch = (await git(root, ['branch', '--show-current'])).stdout.trim() || 'Detached HEAD';
	const upstream = await git(root, ['rev-parse', '--abbrev-ref', '@{upstream}'], { check: false });
	const history = await git(root, ['log', '-8', '--format=%h%x09%s%x09%ar', '--', '.'], {
		check: false,
	});
	return {
		available: true,
		branch,
		root: top,
		files,
		upstream: upstream.code ? null : upstream.stdout.trim(),
		history: history.stdout
			.split('\n')
			.filter(Boolean)
			.map((line) => line.split('\t')),
	};
}

// Git paths may name deleted files, so confine them without requiring existence.
function gitPath(root, path) {
	if (internal(path || ''))
		throw new HttpError(400, 'Editor recovery files are not part of the deck');
	safePath(root, path, { editable: false });
	return path;
}

export async function gitDiff(root, path, staged) {
	gitPath(root, path);
	let diff = (
		await git(root, [
			'diff',
			'--no-ext-diff',
			'--no-textconv',
			...(staged ? ['--cached'] : []),
			'--',
			path,
		])
	).stdout;
	if (!diff) {
		const tracked = (await git(root, ['ls-files', '--', path])).stdout;
		const full = `${root}/${path}`;
		if (!tracked && fs.existsSync(full) && fs.statSync(full).size < 2 * 1024 * 1024) {
			diff = `New file\n${await fsp.readFile(full, 'utf8')}`;
		}
	}
	return { diff: diff.slice(0, 200000), path, staged };
}

export async function gitAction(root, { action, path = '', message = '', branch = '' }) {
	if (!(await repoRoot(root))) throw new HttpError(400, 'This deck is not in a Git repository');
	if (action === 'stage') {
		await git(root, ['add', '--', gitPath(root, path)]);
	} else if (action === 'unstage') {
		const head = await git(root, ['rev-parse', '--verify', 'HEAD'], { check: false });
		await git(
			root,
			head.code
				? ['rm', '--cached', '--', gitPath(root, path)]
				: ['restore', '--staged', '--', gitPath(root, path)]
		);
	} else if (action === 'discard') {
		// Working-tree changes only, tracked files only; the discarded text is kept in history.
		gitPath(root, path);
		const tracked = (await git(root, ['ls-files', '--', path])).stdout;
		if (!tracked)
			throw new HttpError(400, `${path} is untracked; delete it from the file tree instead`);
		const full = `${root}/${path}`;
		if (fs.existsSync(full)) await preserveRevision(root, path, await fsp.readFile(full, 'utf8'));
		await git(root, ['restore', '--worktree', '--', path]);
	} else if (action === 'commit') {
		if (!message.trim() || message.length > 10000)
			throw new HttpError(400, 'Enter a commit message');
		const staged = (await gitStatus(root)).files.filter((file) => file.staged);
		if (!staged.length) throw new HttpError(400, 'Stage the files you want to commit first');
		// A plain commit takes the whole index; refuse if it holds work from outside the deck.
		const index = (await git(root, ['diff', '--cached', '--name-only', '-z'])).stdout
			.split('\0')
			.filter(Boolean);
		if (index.length > staged.length)
			throw new HttpError(
				409,
				'Files outside this deck are staged too; commit them from a terminal first'
			);
		await git(root, ['commit', '-m', message]);
	} else if (action === 'branch') {
		if (!branch || branch.startsWith('-')) throw new HttpError(400, 'Enter a valid branch name');
		await git(root, ['check-ref-format', '--branch', branch]);
		await git(root, ['switch', '-c', branch]);
	} else if (action === 'pull') {
		await git(root, ['pull', '--ff-only']);
	} else {
		throw new HttpError(400, 'Unknown Git action');
	}
	return gitStatus(root);
}
