// deck.config.js for the inspector's Deck tab - the counterpart of md-doc
// editor's frontmatter setProperty(): it edits single `key: scalar` lines in
// place, keeping every comment, and refuses anything structured (the
// `chrome` block, arrays, expressions), pointing the author to the source.
//
// SCHEMA is the editor's list of known keys. It also drives Monaco completion
// in deck.config.js, so a new framework-level key belongs here too.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.js';
import { atomicWrite, preserveRevision, revision, withWriteLock } from './files.js';

const TRANSITIONS = ['none', 'fade', 'slide', 'convex', 'concave', 'zoom'];

export const SCHEMA = {
	width: {
		type: 'int',
		min: 1,
		doc: 'Slide coordinate width in px (1920 = 16:9 with height 1080).',
	},
	height: { type: 'int', min: 1, doc: 'Slide coordinate height in px.' },
	margin: {
		type: 'number',
		min: 0,
		max: 1,
		doc: 'Empty gutter around every slide, as a fraction of the slide size.',
	},
	slideNumber: {
		type: 'enum',
		values: [false, 'c', 'c/t', 'h.v', 'h/v'],
		doc: 'Slide number format, or false for none.',
	},
	transition: { type: 'enum', values: TRANSITIONS, doc: 'Default slide transition.' },
	transitionSpeed: { type: 'enum', values: ['default', 'fast', 'slow'], doc: 'Transition speed.' },
	backgroundTransition: {
		type: 'enum',
		values: TRANSITIONS,
		doc: 'Transition for slide backgrounds.',
	},
	controls: { type: 'bool', doc: 'Show the navigation arrows.' },
	progress: { type: 'bool', doc: 'Show the progress bar.' },
	center: { type: 'bool', doc: 'Vertically centre slide content.' },
	loop: { type: 'bool', doc: 'Loop back to the first slide after the last.' },
	hash: { type: 'bool', doc: 'Put #/<slug> in the URL and restore position on reload.' },
	jumpToSlide: { type: 'bool', doc: 'Type a slide number then Enter to jump to it.' },
	theme: {
		type: 'theme',
		doc: 'A [data-theme] skin from src/styles/vars/semantic.css; empty for the default.',
	},
};

const CONFIG = 'deck.config.js';

function literal(key, value) {
	const spec = SCHEMA[key];
	if (!spec)
		throw new HttpError(400, `${key} is not an editable deck.config.js key; edit it in the source`);
	const bad = () => new HttpError(400, `${key}: ${JSON.stringify(value)} is not a valid value`);
	switch (spec.type) {
		case 'int':
		case 'number': {
			const n = Number(value);
			if (value === '' || !Number.isFinite(n) || (spec.type === 'int' && !Number.isInteger(n)))
				throw bad();
			if ((spec.min != null && n < spec.min) || (spec.max != null && n > spec.max)) throw bad();
			return String(n);
		}
		case 'bool':
			if (typeof value !== 'boolean') throw bad();
			return String(value);
		case 'enum':
			if (!spec.values.includes(value)) throw bad();
			return typeof value === 'string' ? `'${value}'` : String(value);
		case 'theme':
			if (value === '' || value == null) return null; // comment the line out
			if (typeof value !== 'string' || !/^[\w-]+$/.test(value)) throw bad();
			return `'${value}'`;
	}
	throw bad();
}

const SCALAR = /^(?:-?\d+(?:\.\d+)?|true|false|null|'[^'\\\n]*'|"[^"\\\n]*")$/;

/**
 * Returns deck.config.js with `key` set to `value`. A live `key:` line has its
 * value replaced; a commented-out `// key:` line is re-enabled; otherwise the
 * key is added before the object's closing brace. A null theme comments the
 * line out.
 */
export function setConfigText(text, key, value) {
	const code = literal(key, value);
	const line = new RegExp(
		`^([ \\t]{1,4})(//[ \\t]*)?${key}[ \\t]*:[ \\t]*(.*?)[ \\t]*,?[ \\t]*(//.*)?$`,
		'gm'
	);
	const matches = [...text.matchAll(line)];
	const live = matches.find((m) => !m[2]);
	const target = live || matches.find((m) => m[2]);
	if (target) {
		const [whole, indent, , current, comment] = target;
		if (live && !SCALAR.test(current))
			throw new HttpError(400, `${key} has a structured value; edit it in deck.config.js directly`);
		const next =
			code === null
				? live
					? `${indent}// ${key}: ${current},`
					: whole
				: `${indent}${key}: ${code},${comment ? ` ${comment}` : ''}`;
		return text.slice(0, target.index) + next + text.slice(target.index + whole.length);
	}
	if (code === null) return text;
	const close = text.lastIndexOf('};');
	if (close < 0)
		throw new HttpError(400, 'deck.config.js has no `export default { ... };` object to add to');
	return `${text.slice(0, close)}\t${key}: ${code},\n${text.slice(close)}`;
}

export async function readConfig(root, server) {
	const file = path.join(root, CONFIG);
	const text = await fsp.readFile(file, 'utf8');
	let values = {};
	let error = null;
	try {
		if (server) {
			const mod = server.moduleGraph.getModuleById(file);
			if (mod) server.moduleGraph.invalidateModule(mod);
			values = (await server.ssrLoadModule(`/${CONFIG}`)).default || {};
		}
	} catch (e) {
		error = e.message;
	}
	const editable = {};
	for (const key of Object.keys(SCHEMA)) if (key in values) editable[key] = values[key];
	return {
		path: CONFIG,
		revision: revision(text),
		values: editable,
		structured: Object.keys(values).filter((key) => !(key in SCHEMA)),
		schema: SCHEMA,
		error,
	};
}

export function writeConfig(root, { key, value, revision: expected }) {
	const file = path.join(root, CONFIG);
	return withWriteLock(async () => {
		const text = await fsp.readFile(file, 'utf8');
		if (expected && revision(text) !== expected) {
			throw new HttpError(409, {
				message: 'deck.config.js changed on disk since you opened it',
				content: text,
				revision: revision(text),
			});
		}
		const next = setConfigText(text, key, value);
		if (next !== text) {
			await preserveRevision(root, CONFIG, text);
			await atomicWrite(file, next);
		}
		return { path: CONFIG, revision: revision(next), content: next };
	});
}
