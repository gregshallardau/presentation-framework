// Revision-safe file access for the editor - the Node counterpart of md-doc
// editor's snapshots.py (revision / safe_path / atomic_write /
// preserve_revision) and inventory.py (scan_tree).
//
// - Every path is repo-relative, confined to the repo root (symlinks resolved),
//   and never inside machinery or output folders (DENIED) or a dot-folder.
// - A save carries the revision (sha256) the client last read; a mismatch is a
//   409 carrying the current disk content, so the client can show a diff.
// - Before a file is replaced, its previous content is kept under
//   .editor-history/<path>/<sha>.txt (newest HISTORY_LIMIT per file).
// - Writes go to a temp file in the same folder and are renamed into place.

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.js';

export const DENIED = new Set(['node_modules', 'vendor', 'deck-dist', 'dist', 'presentation']);
export const HISTORY_DIR = '.editor-history';
export const TRASH_DIR = '.editor-trash';
export const HISTORY_LIMIT = 20;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 10000;

const TEXT_TYPES = {
	'.md': 'md',
	'.html': 'html',
	'.css': 'css',
	'.js': 'js',
	'.mjs': 'js',
	'.ts': 'js',
	'.json': 'json',
	'.txt': 'text',
	'.yml': 'text',
	'.yaml': 'text',
	'.svg': 'text',
};
const ASSET_TYPES = new Set([
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.ico',
	'.woff',
	'.woff2',
	'.ttf',
	'.otf',
	'.pdf',
]);

export const revision = (content) => createHash('sha256').update(content).digest('hex');

export function fileType(name) {
	const ext = path.extname(name).toLowerCase();
	if (TEXT_TYPES[ext]) return TEXT_TYPES[ext];
	if (ASSET_TYPES.has(ext)) return ext === '.pdf' ? 'pdf' : 'image';
	return 'other';
}

const isEditable = (name) => Boolean(TEXT_TYPES[path.extname(name).toLowerCase()]);

/**
 * Resolves a repo-relative path for reading or writing. Throws a 400 for an
 * absolute path, an escape (`..`, or a symlink pointing outside), a denied or
 * hidden folder, or a non-text file.
 */
export function safePath(root, relative, { editable = true } = {}) {
	if (
		typeof relative !== 'string' ||
		!relative ||
		path.isAbsolute(relative) ||
		relative.includes('\0')
	) {
		throw new HttpError(400, 'Enter a path relative to the deck folder');
	}
	const parts = relative.split(/[\\/]+/).filter(Boolean);
	if (parts.some((part) => part === '..')) throw new HttpError(400, 'Path escapes the deck folder');
	if (parts.some((part) => part.startsWith('.')))
		throw new HttpError(400, 'Hidden files cannot be edited here');
	if (DENIED.has(parts[0]))
		throw new HttpError(
			400,
			`${parts[0]}/ is framework machinery or build output and cannot be edited here`
		);
	const full = path.resolve(root, ...parts);
	if (!full.startsWith(root + path.sep)) throw new HttpError(400, 'Path escapes the deck folder');
	// Resolve symlinks on the deepest existing ancestor, so a link cannot point outside.
	let probe = full;
	while (!fs.existsSync(probe) && probe !== root) probe = path.dirname(probe);
	const real = fs.realpathSync(probe);
	const realRoot = fs.realpathSync(root);
	if (real !== realRoot && !real.startsWith(realRoot + path.sep))
		throw new HttpError(400, 'Path escapes the deck folder');
	if (editable && !isEditable(full))
		throw new HttpError(400, 'Only text files (Markdown, HTML, CSS, JS, JSON) can be edited');
	return full;
}

export const toRelative = (root, full) => path.relative(root, full).split(path.sep).join('/');

// Serialises writes, so two saves can't interleave their check-and-replace.
let writeChain = Promise.resolve();
export function withWriteLock(fn) {
	const run = writeChain.then(fn, fn);
	writeChain = run.catch(() => {});
	return run;
}

export async function atomicWrite(full, content) {
	await fsp.mkdir(path.dirname(full), { recursive: true });
	const temp = path.join(
		path.dirname(full),
		`.${path.basename(full)}.${randomBytes(4).toString('hex')}.tmp`
	);
	try {
		await fsp.writeFile(temp, content, 'utf8');
		await fsp.rename(temp, full);
	} finally {
		await fsp.rm(temp, { force: true });
	}
}

// Keeps a copy of `content` (the version about to be replaced) in history.
export async function preserveRevision(root, relative, content) {
	const dir = path.join(root, HISTORY_DIR, ...relative.split('/'));
	await fsp.mkdir(dir, { recursive: true });
	const target = path.join(dir, `${revision(content)}.txt`);
	if (!fs.existsSync(target)) await fsp.writeFile(target, content, 'utf8');
	const entries = await Promise.all(
		(await fsp.readdir(dir)).map(async (name) => ({
			name,
			mtime: (await fsp.stat(path.join(dir, name))).mtimeMs,
		}))
	);
	entries.sort((a, b) => b.mtime - a.mtime);
	for (const old of entries.slice(HISTORY_LIMIT))
		await fsp.rm(path.join(dir, old.name), { force: true });
}

export async function readFile(root, relative) {
	const full = safePath(root, relative);
	let stat;
	try {
		stat = await fsp.stat(full);
	} catch {
		throw new HttpError(404, `${relative} does not exist`);
	}
	if (!stat.isFile()) throw new HttpError(400, `${relative} is not a file`);
	if (stat.size > MAX_FILE_BYTES) throw new HttpError(413, `${relative} is larger than 20 MiB`);
	const content = await fsp.readFile(full, 'utf8');
	return { path: relative, content, type: fileType(full), revision: revision(content) };
}

/**
 * Saves `content` if the disk file still has `expected` revision (null for a
 * file that must not exist yet). Returns { path, revision }.
 */
export function writeFile(root, relative, content, expected) {
	const full = safePath(root, relative);
	if (typeof content !== 'string') throw new HttpError(400, 'File content must be text');
	if (Buffer.byteLength(content) > MAX_FILE_BYTES)
		throw new HttpError(413, 'File is larger than 20 MiB');
	return withWriteLock(async () => {
		let current = null;
		try {
			current = await fsp.readFile(full, 'utf8');
		} catch {}
		const currentRevision = current === null ? null : revision(current);
		if (currentRevision !== (expected ?? null)) {
			throw new HttpError(409, {
				message:
					current === null
						? `${relative} was removed on disk`
						: `${relative} changed on disk since you opened it`,
				content: current ?? '',
				revision: currentRevision,
			});
		}
		if (current !== null && current !== content) await preserveRevision(root, relative, current);
		await atomicWrite(full, content);
		return { path: relative, revision: revision(content) };
	});
}

// Walks the deck folder, skipping denied, hidden and output folders.
export async function walk(root, visit) {
	let count = 0;
	const warnings = [];
	async function dir(full) {
		let entries;
		try {
			entries = await fsp.readdir(full, { withFileTypes: true });
		} catch (error) {
			warnings.push({ path: toRelative(root, full), message: error.code || error.message });
			return;
		}
		entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
		for (const entry of entries) {
			if (entry.name.startsWith('.')) continue;
			const child = path.join(full, entry.name);
			if (full === root && DENIED.has(entry.name)) continue;
			if (entry.isDirectory()) {
				if ((await visit(child, entry, true)) !== false) await dir(child);
			} else if (entry.isFile()) {
				if (++count > MAX_FILES) return;
				await visit(child, entry, false);
			}
		}
	}
	await dir(root);
	return { warnings, truncated: count > MAX_FILES };
}

// Nested file tree in md-doc editor's shape: { type:'dir', name, path, children } | { type, name, path }.
export async function scanTree(root) {
	const top = { children: [] };
	const byDir = new Map([[root, top]]);
	const { warnings } = await walk(root, (full, entry, isDir) => {
		const parent = byDir.get(path.dirname(full));
		const relative = toRelative(root, full);
		if (isDir) {
			const node = { type: 'dir', name: entry.name, path: relative, children: [] };
			parent.children.push(node);
			byDir.set(full, node);
		} else {
			parent.children.push({ type: fileType(entry.name), name: entry.name, path: relative });
		}
	});
	const prune = (nodes) =>
		nodes.filter((node) => {
			if (node.type !== 'dir') return true;
			node.children = prune(node.children);
			node.documentCount = node.children.reduce(
				(sum, child) =>
					sum +
					(child.type === 'dir'
						? child.documentCount
						: ['md', 'html'].includes(child.type)
							? 1
							: 0),
				0
			);
			return node.children.length > 0;
		});
	// Folders first, like md-doc's tree.
	const order = (nodes) => {
		nodes.sort((a, b) => (b.type === 'dir') - (a.type === 'dir'));
		nodes.forEach((node) => node.children && order(node.children));
		return nodes;
	};
	return { tree: order(prune(top.children)), scanWarnings: warnings };
}

// A cheap signature of every file's mtime+size, polled by the client each second.
export async function changeSignature(root) {
	const hash = createHash('sha256');
	await walk(root, async (full, entry, isDir) => {
		if (isDir) return;
		try {
			const stat = await fsp.stat(full);
			hash.update(`${toRelative(root, full)}\0${stat.mtimeMs}\0${stat.size}\n`);
		} catch {}
	});
	return hash.digest('hex').slice(0, 32);
}

// Plain-text search across editable files: [{ path, line, text }].
export async function search(root, query, limit = 200) {
	const results = [];
	const needle = String(query || '').toLowerCase();
	if (!needle.trim()) return results;
	await walk(root, async (full, entry, isDir) => {
		if (isDir || results.length >= limit || !isEditable(entry.name)) return;
		if (entry.name === 'package-lock.json') return;
		let text;
		try {
			const stat = await fsp.stat(full);
			if (stat.size > 2 * 1024 * 1024) return;
			text = await fsp.readFile(full, 'utf8');
		} catch {
			return;
		}
		text.split('\n').forEach((line, i) => {
			if (results.length < limit && line.toLowerCase().includes(needle)) {
				results.push({
					path: toRelative(root, full),
					line: i + 1,
					text: line.trim().slice(0, 200),
				});
			}
		});
	});
	return results;
}
