// Executable version of slide-builder's "Portability lint" class/tag/var rules
// (.claude/skills/slide-builder/SKILL.md). Catches exactly the failure mode
// found in the real deck ai-training-101-v2: a `.title-slide` class was
// referenced in a slide but never defined anywhere, so it silently did
// nothing - nothing caught it because the check only ever existed as prose
// an agent reasoned about, never ran.
//
// The allowlist of "real" classes is auto-extracted from deck.css itself
// (plus a small static list of Reveal-native fragment/layout classes), so
// it can't go stale as deck.css grows. Registered <deck-*> tags are read from
// the repo-root components/ folder listing - that IS the manifest under the
// auto-discovery model (src/components/registry.js just globs it at build
// time; there is no separate list to parse). A slide's own scoped <style>
// block (the "fully inlined artefact" shape) may define additional classes
// local to that one file - those are allowed only in the file that defines
// them.

//
// The rules themselves live in lib/lint.js, shared with the GUI editor's
// Problems panel (editor/server/lint.js).

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { lintSlides } from './lib/lint.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const { issues, slideFiles, vocab } = await lintSlides(root);
const { frameworkClasses, components: registeredComponentNames } = vocab;

if (issues.length) {
	console.error(issues.map(({ file, line, message }) => `✗ ${file}:${line} — ${message}`).join('\n'));
	process.exit(1);
}

console.log(`✓ ${slideFiles.length} slide file${slideFiles.length === 1 ? '' : 's'} clean (${frameworkClasses.size} known classes, ${registeredComponentNames.size} registered <deck-*> component${registeredComponentNames.size === 1 ? '' : 's'})`);
