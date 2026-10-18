// Keeps deck.css (light-DOM, slide-level utilities) and
// src/components/shared-styles.js's SHARED_STYLES (the shadow-DOM copy every
// <deck-*> component imports into `static styles`) from silently drifting
// apart. Each shared block is wrapped in matching
// `/* SHARED-VOCAB:start <name> */` / `/* SHARED-VOCAB:end */` sentinels in
// both files. This script extracts every named region, strips documentation
// comments and deck.css's light-DOM selector prefix, and diffs what's left.
// A region present in only one file (e.g. .token-row, which has no deck.css
// counterpart) is not compared - only names that exist in both.
//
// On drift: fix shared-styles.js to match deck.css, never the reverse -
// deck.css is the source of truth a deck author actually edits.
//
// .claude/skills/artefact-builder/reference/component-styles.md is pure human
// documentation of shared-styles.js (components import the real file, never
// copy from the doc) - not checked here, since it holds no CSS of its own.

//
// The comparison itself lives in lib/lint.js, shared with the GUI editor's
// Problems panel (editor/server/lint.js).

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { checkSharedVocabulary } from './lib/lint.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const { names: sharedNames, drift } = await checkSharedVocabulary(root);

for (const { name, deck, shared } of drift) {
	console.error(`✗ "${name}" has drifted between deck.css and src/components/shared-styles.js\n`);
	console.error(`  deck.css:\n    ${deck}\n`);
	console.error(`  shared-styles.js:\n    ${shared}\n`);
	console.error(`  Fix shared-styles.js to match deck.css, never the reverse.\n`);
}

if (drift.length) {
	process.exit(1);
}

console.log(`✓ shared vocabulary in sync (${sharedNames.length} region${sharedNames.length === 1 ? '' : 's'}: ${sharedNames.join(', ')})`);
