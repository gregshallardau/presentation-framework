// Structural slide edits for the editor's Slides panel: insert, duplicate,
// delete, move (incl. into / out of a stack), rename-slug and rebalance.
// Numbering comes from scripts/lib/slide-plan.js - the same planner behind
// `npm run make:slide` - so GUI and CLI never disagree about a filename.
//
// Safety:
// - The client sends `revisions` ({ 'slides/<file>': sha }) for every open
//   buffer; a request touching a file whose disk revision differs is a 409.
// - Renames are applied in two phases (every source to a temp name, then to
//   its target), so chains like a -> b, b -> c never collide. Tracked files
//   move with `git mv`, so history follows them (as make-slide.js does).
// - Delete moves the file to .editor-trash/, never unlinks it.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
	SlidePlanError,
	listSlideFiles,
	planInsert,
	planMove,
	planRenameSlug,
	planRebalance,
} from '../../scripts/lib/slide-plan.js';
import { HttpError } from './http.js';
import { TRASH_DIR, atomicWrite, preserveRevision, revision, withWriteLock } from './files.js';

const run = promisify(execFile);

async function isGitTracked(root, rel) {
	try {
		await run('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root });
		return true;
	} catch {
		return false;
	}
}

async function move(root, fromRel, toRel) {
	if (await isGitTracked(root, fromRel)) {
		await run('git', ['mv', '--', fromRel, toRel], { cwd: root });
	} else {
		await fsp.rename(path.join(root, fromRel), path.join(root, toRel));
	}
}

// Applies a final from -> to mapping of slides/ basenames in two phases.
export async function applyRenames(root, renames) {
	const dir = path.join(root, 'slides');
	const sources = new Set(renames.map((r) => r.from));
	for (const { to } of renames) {
		if (fs.existsSync(path.join(dir, to)) && !sources.has(to))
			throw new HttpError(409, `slides/${to} already exists`);
	}
	const staged = [];
	for (const [i, { from, to }] of renames.entries()) {
		const temp = `.__editor-move-${process.pid}-${i}-${from}.moving`; // no .md/.html suffix: never assembled mid-move
		await move(root, `slides/${from}`, `slides/${temp}`);
		staged.push({ temp, to });
	}
	for (const { temp, to } of staged) await move(root, `slides/${temp}`, `slides/${to}`);
}

function checkRevisions(root, files, revisions = {}) {
	for (const file of files) {
		const rel = `slides/${file}`;
		const expected = revisions[rel];
		if (expected === undefined) continue;
		let current = null;
		try {
			current = revision(fs.readFileSync(path.join(root, rel), 'utf8'));
		} catch {}
		if (current !== expected)
			throw new HttpError(409, `${rel} changed on disk; reload it before reorganising slides`);
	}
}

function plan(fn) {
	try {
		return fn();
	} catch (error) {
		if (error instanceof SlidePlanError) throw new HttpError(400, error.message);
		throw error;
	}
}

const rel = (file) => `slides/${file}`;
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const renamedPaths = (renames) => renames.map(({ from, to }) => ({ from: rel(from), to: rel(to) }));

function uniqueSlug(slides, base) {
	let slug = `${base}-copy`;
	for (let n = 2; slides.some((s) => s.slug === slug); n++) slug = `${base}-copy-${n}`;
	return slug;
}

// Rewrites the opening <section>'s id / data-slug when they carry the old slug.
function retagSection(text, oldSlug, newSlug) {
	const end = text.indexOf('>');
	if (end < 0) return text;
	const open = text.slice(0, end + 1);
	const retagged = open
		.replace(new RegExp(`(\\bid=["'])${escapeRe(oldSlug)}(["'])`), `$1${newSlug}$2`)
		.replace(new RegExp(`(\\bdata-slug=["'])${escapeRe(oldSlug)}(["'])`), `$1${newSlug}$2`);
	return retagged + text.slice(end + 1);
}

/**
 * Runs one action. Returns { renamed: [{from, to}], created?, removed?, changed: [paths] }
 * with repo-relative paths, so the client can re-key or reload open buffers.
 */
export function slideAction(root, request) {
	const dir = path.join(root, 'slides');
	return withWriteLock(async () => {
		const slides = plan(() => listSlideFiles(dir));
		const { action, revisions } = request;
		const result = { renamed: [], changed: [] };

		if (action === 'insert') {
			const { title, slug, format = 'md', where = {} } = request;
			const p = plan(() => planInsert(slides, { title, slug, format, ...where }));
			checkRevisions(
				root,
				p.renames.map((r) => r.from),
				revisions
			);
			await applyRenames(root, p.renames);
			await atomicWrite(path.join(dir, p.newFile), p.body);
			return { ...result, renamed: renamedPaths(p.renames), created: rel(p.newFile) };
		}

		if (action === 'duplicate') {
			const source = slides.find((s) => s.file === request.file);
			if (!source) throw new HttpError(404, `no slide file "${request.file}" in slides/`);
			const slug = uniqueSlug(slides, source.slug);
			const where =
				source.minor != null && Number.isFinite(source.major)
					? { verticalOf: source.major }
					: { after: source.slug };
			const p = plan(() => planInsert(slides, { title: slug, slug, format: source.ext, ...where }));
			checkRevisions(
				root,
				p.renames.map((r) => r.from),
				revisions
			);
			const text = await fsp.readFile(path.join(dir, source.file), 'utf8');
			await applyRenames(root, p.renames);
			await atomicWrite(
				path.join(dir, p.newFile),
				source.ext === 'html' ? retagSection(text, source.slug, slug) : text
			);
			return { ...result, renamed: renamedPaths(p.renames), created: rel(p.newFile) };
		}

		if (action === 'delete') {
			const source = slides.find((s) => s.file === request.file);
			if (!source) throw new HttpError(404, `no slide file "${request.file}" in slides/`);
			checkRevisions(root, [source.file], revisions);
			const trash = path.join(root, TRASH_DIR);
			await fsp.mkdir(trash, { recursive: true });
			const stamp = new Date().toISOString().replace(/[:.]/g, '-');
			await fsp.rename(path.join(dir, source.file), path.join(trash, `${stamp}-${source.file}`));
			return {
				...result,
				removed: rel(source.file),
				trashed: `${TRASH_DIR}/${stamp}-${source.file}`,
			};
		}

		if (action === 'move') {
			const files = Array.isArray(request.files) ? request.files : [request.file];
			const p = plan(() => planMove(slides, files, request.where || {}));
			checkRevisions(
				root,
				p.renames.map((r) => r.from),
				revisions
			);
			await applyRenames(root, p.renames);
			return { ...result, renamed: renamedPaths(p.renames) };
		}

		if (action === 'rename-slug') {
			const p = plan(() => planRenameSlug(slides, request.file, request.slug));
			checkRevisions(
				root,
				slides.map((s) => s.file),
				revisions
			);
			const target = p.renames[0]?.to ?? request.file;
			await applyRenames(root, p.renames);
			// Keep the slide's own id and every #/<slug> jump link pointing at it.
			const link = new RegExp(`#/${escapeRe(p.oldSlug)}(?=["'/)\\s?#]|$)`, 'g');
			for (const file of fs.readdirSync(dir).filter((f) => /\.(html|md)$/i.test(f))) {
				const full = path.join(dir, file);
				const before = await fsp.readFile(full, 'utf8');
				let after = before.replace(link, `#/${p.slug}`);
				if (file === target && /\.html$/i.test(file))
					after = retagSection(after, p.oldSlug, p.slug);
				if (after !== before) {
					await preserveRevision(root, rel(file), before);
					await atomicWrite(full, after);
					result.changed.push(rel(file));
				}
			}
			return { ...result, renamed: renamedPaths(p.renames) };
		}

		if (action === 'rebalance') {
			const p = plan(() => planRebalance(slides));
			checkRevisions(
				root,
				p.renames.map((r) => r.from),
				revisions
			);
			await applyRenames(root, p.renames);
			return { ...result, renamed: renamedPaths(p.renames) };
		}

		throw new HttpError(400, `Unknown slide action "${action}"`);
	});
}
