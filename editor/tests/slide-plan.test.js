// The shared slide planner (scripts/lib/slide-plan.js) and make-slide.js parity.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseSlideFilename } from '../../scripts/lib/slide-files.js';
import {
	planInsert,
	planMove,
	planRebalance,
	planRenameSlug,
} from '../../scripts/lib/slide-plan.js';
import { REPO } from './helpers.js';

const deck = (...files) => files.map((file) => ({ file, ...parseSlideFilename(file) }));
const BASE = deck('000-title.html', '010-intro.md', '020-architecture.html', '030-live-demo.html');
const TIGHT = deck('000-a.md', '001-b.md', '002-c.html', '010.1-d.md', '010.2-e.md');

describe('planInsert', () => {
	it('slots into the gap after or before a slug', () => {
		assert.equal(planInsert(BASE, { title: 'New', after: 'intro' }).newFile, '011-new.md');
		assert.equal(planInsert(BASE, { title: 'New', before: 'intro' }).newFile, '001-new.md');
		assert.equal(planInsert(BASE, { title: 'New', end: true }).newFile, '040-new.md');
	});

	it('promotes a bare major to .1 for a vertical sibling', () => {
		const plan = planInsert(BASE, { title: 'Below', verticalOf: 20, format: 'html' });
		assert.deepEqual(plan.renames, [
			{ from: '020-architecture.html', to: '020.1-architecture.html' },
		]);
		assert.equal(plan.newFile, '020.2-below.html');
		assert.ok(plan.promoted && !plan.rebalanced);
		assert.match(plan.body, /<section id="below" data-slug="below">/);
	});

	it('rebalances the deck when the gap is exhausted', () => {
		const plan = planInsert(TIGHT, { title: 'Z', before: 'c' });
		assert.ok(plan.rebalanced);
		assert.equal(plan.newFile, '011-z.md');
		assert.deepEqual(plan.renames.map((r) => r.to).sort(), [
			'010-b.md',
			'020-c.html',
			'030.1-d.md',
			'030.2-e.md',
		]);
	});

	it('refuses a taken slug or major', () => {
		assert.throws(() => planInsert(BASE, { title: 'Intro', end: true }), /already used/);
		assert.throws(() => planInsert(BASE, { title: 'X', position: 10 }), /already used/);
		assert.throws(() => planInsert(BASE, { title: 'X' }), /exactly one/);
	});
});

describe('planMove', () => {
	it('moves one slide before another', () => {
		assert.deepEqual(planMove(BASE, ['030-live-demo.html'], { before: 'intro' }).renames, [
			{ from: '030-live-demo.html', to: '001-live-demo.html' },
		]);
	});

	it('moves a slide into a stack and promotes the bare major', () => {
		const { renames } = planMove(BASE, ['010-intro.md'], { verticalOf: 20 });
		assert.deepEqual(renames, [
			{ from: '020-architecture.html', to: '020.1-architecture.html' },
			{ from: '010-intro.md', to: '020.2-intro.md' },
		]);
	});

	it('moves a whole stack in front of a first slide numbered 000, keeping its minors', () => {
		const final = Object.fromEntries(
			planMove(TIGHT, ['010.1-d.md', '010.2-e.md'], { before: 'a' }).renames.map((r) => [
				r.from,
				r.to,
			])
		);
		assert.equal(final['010.1-d.md'], '000.1-d.md');
		assert.equal(final['010.2-e.md'], '000.2-e.md');
		assert.equal(final['000-a.md'], '010-a.md');
	});

	it('inserts in front of a first slide numbered 000', () => {
		const plan = planInsert(BASE, { title: 'Z', before: 'title' });
		assert.equal(plan.newFile, '000-z.md');
		assert.deepEqual(
			plan.renames.find((r) => r.from === '000-title.html'),
			{ from: '000-title.html', to: '010-title.html' }
		);
	});

	it('takes a slide out of a stack to after it', () => {
		const { renames } = planMove(TIGHT, ['010.1-d.md'], { after: 'e' });
		assert.equal(renames.length, 1);
		assert.equal(renames[0].from, '010.1-d.md');
		assert.ok(
			parseSlideFilename(renames[0].to).major > 10 &&
				parseSlideFilename(renames[0].to).minor === null,
			renames[0].to
		);
	});

	it('folds a rebalance into one final mapping per file', () => {
		const { renames } = planMove(TIGHT, ['000-a.md'], { after: 'b' });
		const froms = renames.map((r) => r.from);
		assert.equal(new Set(froms).size, froms.length);
		const final = Object.fromEntries(renames.map((r) => [r.from, r.to]));
		const order = TIGHT.map((s) => final[s.file] || s.file).sort((x, y) =>
			x.localeCompare(y, undefined, { numeric: true })
		);
		assert.deepEqual(
			order.map((f) => parseSlideFilename(f).slug),
			['b', 'a', 'c', 'd', 'e']
		);
	});
});

describe('planRenameSlug / planRebalance', () => {
	it('renames the slug and keeps the number', () => {
		assert.deepEqual(planRenameSlug(BASE, '010-intro.md', 'Welcome Everyone').renames, [
			{ from: '010-intro.md', to: '010-welcome-everyone.md' },
		]);
		assert.throws(() => planRenameSlug(BASE, '010-intro.md', 'title'), /already used/);
	});

	it('renumbers to step-10 majors', () => {
		const { renames } = planRebalance(TIGHT);
		assert.deepEqual(Object.fromEntries(renames.map((r) => [r.from, r.to])), {
			'001-b.md': '010-b.md',
			'002-c.html': '020-c.html',
			'010.1-d.md': '030.1-d.md',
			'010.2-e.md': '030.2-e.md',
		});
	});
});

describe('make-slide.js CLI', () => {
	it('prints the same plan it always did', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-plan-'));
		fs.mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
		fs.mkdirSync(path.join(dir, 'slides'));
		for (const f of fs.readdirSync(path.join(REPO, 'scripts/lib')))
			fs.copyFileSync(path.join(REPO, 'scripts/lib', f), path.join(dir, 'scripts/lib', f));
		fs.copyFileSync(
			path.join(REPO, 'scripts/make-slide.js'),
			path.join(dir, 'scripts/make-slide.js')
		);
		for (const f of ['000-a.md', '001-b.md', '002-c.html', '010.1-d.md', '010.2-e.md'])
			fs.writeFileSync(path.join(dir, 'slides', f), '');
		const run = (...args) =>
			execFileSync(
				process.execPath,
				['scripts/make-slide.js', '--title', 'Z', ...args, '--dry-run'],
				{ cwd: dir, encoding: 'utf8' }
			);
		assert.equal(
			run('--after', 'a'),
			'(dry run - no files touched)\n' +
				'  [gap exhausted - rebalancing 4 file(s) to round step-10 numbers first]\n' +
				'  git mv slides/010.2-e.md slides/030.2-e.md\n' +
				'  git mv slides/010.1-d.md slides/030.1-d.md\n' +
				'  git mv slides/002-c.html slides/020-c.html\n' +
				'  git mv slides/001-b.md slides/010-b.md\n' +
				'  write slides/001-z.md\n'
		);
		assert.equal(
			run('--vertical-of', '10'),
			'(dry run - no files touched)\n  write slides/010.3-z.md\n'
		);
		fs.rmSync(dir, { recursive: true, force: true });
	});
});
