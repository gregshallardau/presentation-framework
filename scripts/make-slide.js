#!/usr/bin/env node
// Mechanical slide scaffolder - does the error-prone-by-hand parts of
// slide-builder's "Procedure - new / structural" (gap-based position
// resolution, the rebalance-if-exhausted fallback, the file template) so an
// agent doesn't re-derive that arithmetic from prose every time. It does NOT
// write slide prose/content - see docs/cheatsheet.md for the body shapes and
// slide-builder's SKILL.md for what goes in the stub.
//
// Numbering follows slides/README.md: >=3-digit majors, step 10, gap-based -
// most inserts land in the existing gap between neighbours and touch no
// other file; only an exhausted gap (neighbours are consecutive integers)
// triggers a whole-deck rebalance back to round step-10 numbers.
//
// Usage:
//   node scripts/make-slide.js --title "Text" --after <slug> [--format md|html] [--slug <slug>]
//   node scripts/make-slide.js --title "Text" --before <slug>
//   node scripts/make-slide.js --title "Text" --position <N>   (N must be a free major)
//   node scripts/make-slide.js --title "Text" --vertical-of <N>
//   node scripts/make-slide.js --title "Text" --end
// Add --dry-run to print the plan (rebalance + new file) without touching disk.

//
// The planning itself lives in lib/slide-plan.js, shared with the GUI editor
// (editor/server/slide-actions.js) so both number slides identically.

import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SlidePlanError, listSlideFiles, planInsert } from './lib/slide-plan.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLIDES_DIR = resolve(root, 'slides');

function parseArgs(argv) {
	const args = { format: 'md' };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--dry-run') { args.dryRun = true; continue; }
		if (a === '--end') { args.end = true; continue; }
		if (!a.startsWith('--')) continue;
		const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		args[key] = argv[++i];
	}
	return args;
}

function fail(message) {
	console.error(`✗ ${message}`);
	process.exit(1);
}

function isGitTracked(path) {
	try {
		execFileSync('git', ['ls-files', '--error-unmatch', path], { cwd: root, stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function movePath(fromRel, toRel) {
	const from = resolve(SLIDES_DIR, fromRel);
	const to = resolve(SLIDES_DIR, toRel);
	if (isGitTracked(`slides/${fromRel}`)) {
		execFileSync('git', ['mv', `slides/${fromRel}`, `slides/${toRel}`], { cwd: root });
	} else {
		renameSync(from, to);
	}
}

const args = parseArgs(process.argv.slice(2));

let plan;
try {
	const { dryRun, ...request } = args;
	plan = planInsert(listSlideFiles(SLIDES_DIR), request);
} catch (error) {
	if (error instanceof SlidePlanError) fail(error.message);
	throw error;
}
const { renames: pendingRenames, newFile, body, rebalanced } = plan;

console.log(args.dryRun ? '(dry run - no files touched)' : 'Applying:');
if (rebalanced) {
	console.log(`  [gap exhausted - rebalancing ${pendingRenames.length} file(s) to round step-10 numbers first]`);
} else if (pendingRenames.length) {
	console.log(`  [promoting the bare major to .1 so it can take a vertical sibling]`);
}
for (const { from, to } of pendingRenames) console.log(`  git mv slides/${from} slides/${to}`);
console.log(`  write slides/${newFile}`);

if (args.dryRun) process.exit(0);

for (const { from, to } of pendingRenames) movePath(from, to);
mkdirSync(SLIDES_DIR, { recursive: true });
writeFileSync(resolve(SLIDES_DIR, newFile), body, 'utf8');

console.log(`\n✓ created slides/${newFile}`);
if (rebalanced) console.log(`✓ rebalanced ${pendingRenames.length} file(s)`);
