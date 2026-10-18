// The checks behind scripts/lint-slide-classes.js and
// scripts/check-shared-vocabulary.js, as functions that return findings
// instead of printing and exiting - so the GUI editor (editor/server/lint.js)
// shows exactly what the CLIs report. See each CLI's header comment for the
// rationale of the rules themselves.

import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

// Reveal-native classes: not defined in deck.css, not invented by a slide author.
export const REVEAL_NATIVE_CLASSES = new Set([
	'fragment', 'visible', 'current-fragment',
	'fade-in-then-out', 'fade-in-then-semi-out', 'fade-up', 'fade-down',
	'fade-left', 'fade-right', 'fade-out', 'semi-fade-out',
	'grow', 'shrink', 'strike', 'zoom-in',
	'highlight-red', 'highlight-green', 'highlight-blue',
	'highlight-current-red', 'highlight-current-green', 'highlight-current-blue',
	'current-visible',
	'stack',
	'r-fit-text', 'r-stretch', 'r-stack', 'r-hstack', 'r-vstack',
	'notes', // Reveal speaker notes
	'language-javascript', 'language-python', 'language-json', 'language-bash', 'language-html', 'language-css', // Highlight.js language classes
]);

export function extractClassSelectors(cssText) {
	const classes = new Set();
	const re = /\.([a-zA-Z][\w-]*)/g;
	let match;
	while ((match = re.exec(cssText))) classes.add(match[1]);
	return classes;
}

export function extractDeclaredCustomProperties(cssText) {
	const names = new Set();
	const re = /(--[a-zA-Z][\w-]*)\s*:/g;
	let match;
	while ((match = re.exec(cssText))) names.add(match[1]);
	return names;
}

export async function listRegisteredComponentNames(root) {
	try {
		const entries = await readdir(resolve(root, 'components'), { withFileTypes: true });
		return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
	} catch {
		return new Set(); // components/ doesn't exist yet - nothing registered
	}
}

function lineOf(text, index) {
	return text.slice(0, index).split('\n').length;
}

// The class/tag/var vocabulary a slide may use.
export async function slideVocabulary(root) {
	const [deckCss, primitivesCss, components] = await Promise.all([
		readFile(resolve(root, 'deck.css'), 'utf8'),
		readFile(resolve(root, 'src/styles/vars/primitives.css'), 'utf8'),
		listRegisteredComponentNames(root),
	]);
	return {
		deckClasses: extractClassSelectors(deckCss),
		frameworkClasses: new Set([...extractClassSelectors(deckCss), ...REVEAL_NATIVE_CLASSES]),
		tier1Names: extractDeclaredCustomProperties(primitivesCss),
		components,
	};
}

/**
 * Lints one slide file's text against `vocab` (slideVocabulary).
 * Returns [{ file, line, message }].
 */
export function lintSlideText(name, fileText, vocab) {
	const issues = [];
	// HTML comments (illustrative/commented-out markup) aren't live content -
	// blank them out (preserving offsets, so reported line numbers stay accurate).
	const text = fileText.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

	// classes defined in this slide's own scoped <style> block (shape 3:
	// fully inlined artefact) are locally allowed, in this file only.
	const localClasses = new Set();
	for (const styleMatch of text.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
		for (const c of extractClassSelectors(styleMatch[1])) localClasses.add(c);
	}

	for (const classMatch of text.matchAll(/\bclass=["']([^"']*)["']/g)) {
		for (const token of classMatch[1].split(/\s+/).filter(Boolean)) {
			if (!vocab.frameworkClasses.has(token) && !localClasses.has(token)) {
				issues.push({ file: name, line: lineOf(text, classMatch.index), message: `unknown class "${token}" (not in deck.css, Reveal's built-ins, or this file's own scoped <style>)` });
			}
		}
	}

	for (const tagMatch of text.matchAll(/<(deck-[\w-]+)[\s>]/g)) {
		const componentName = tagMatch[1].replace(/^deck-/, '');
		if (!vocab.components.has(componentName)) {
			issues.push({ file: name, line: lineOf(text, tagMatch.index), message: `<${tagMatch[1]}> has no matching components/${componentName}/ folder` });
		}
	}

	for (const varMatch of text.matchAll(/var\((--[a-zA-Z][\w-]*)/g)) {
		if (vocab.tier1Names.has(varMatch[1])) {
			issues.push({ file: name, line: lineOf(text, varMatch.index), message: `var(${varMatch[1]}) is a tier-1 primitive; use the tier-2 semantic property instead` });
		}
	}
	return issues;
}

// Lints every slides/*.{html,md}. `overrides` maps a slide filename to unsaved text.
export async function lintSlides(root, overrides = {}) {
	const vocab = await slideVocabulary(root);
	const slidesDir = resolve(root, 'slides');
	const slideFiles = (await readdir(slidesDir))
		.filter((name) => ['.html', '.md'].includes(extname(name)))
		.sort();
	const issues = [];
	for (const name of slideFiles) {
		const text = overrides[name] ?? (await readFile(resolve(slidesDir, name), 'utf8'));
		issues.push(...lintSlideText(name, text, vocab));
	}
	return { issues, slideFiles, vocab };
}

const LIGHT_DOM_PREFIX = '.reveal .slides section ';

function extractRegions(text) {
	const regions = new Map();
	const re = /\/\*\s*SHARED-VOCAB:start\s+(\S+)\s*\*\/([\s\S]*?)\/\*\s*SHARED-VOCAB:end\s*\*\//g;
	let match;
	while ((match = re.exec(text))) {
		const [, name, body] = match;
		if (regions.has(name)) {
			throw new Error(`duplicate SHARED-VOCAB region "${name}"`);
		}
		regions.set(name, body);
	}
	return regions;
}

function normalize(body) {
	return body
		.replace(/\/\*[\s\S]*?\*\//g, ' ')            // strip comments (docs are allowed to differ)
		.split(LIGHT_DOM_PREFIX).join('')             // deck.css's only mechanical difference
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Compares the SHARED-VOCAB regions of deck.css and shared-styles.js.
 * Returns { names, drift: [{ name, deck, shared }] }.
 */
export async function checkSharedVocabulary(root, overrides = {}) {
	const [deckCss, sharedStylesJs] = await Promise.all([
		overrides['deck.css'] ?? readFile(resolve(root, 'deck.css'), 'utf8'),
		overrides['src/components/shared-styles.js'] ?? readFile(resolve(root, 'src/components/shared-styles.js'), 'utf8'),
	]);
	const deckRegions = extractRegions(deckCss);
	const sharedRegions = extractRegions(sharedStylesJs);
	const names = [...deckRegions.keys()].filter((name) => sharedRegions.has(name));
	const drift = [];
	for (const name of names) {
		const deck = normalize(deckRegions.get(name));
		const shared = normalize(sharedRegions.get(name));
		if (deck !== shared) drift.push({ name, deck, shared });
	}
	return { names, drift };
}
