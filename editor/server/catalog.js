// What a deck author can reach for, read live from the repo so it never goes
// stale: [data-theme] skins, <deck-*> components with their attributes, the
// deck.css class vocabulary and the tier-2 semantic custom properties. Feeds
// the inspector's Theme / Components tabs and Monaco completion.

import fs from 'node:fs';
import path from 'node:path';
import {
	REVEAL_NATIVE_CLASSES,
	extractClassSelectors,
	extractDeclaredCustomProperties,
} from '../../scripts/lib/lint.js';

const read = (file) => {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return '';
	}
};

export function themes(root) {
	// Comments document the mechanism with a placeholder [data-theme="name"]; skip them.
	const css = read(path.join(root, 'src/styles/vars/semantic.css')).replace(
		/\/\*[\s\S]*?\*\//g,
		''
	);
	const names = [
		...new Set([...css.matchAll(/\[data-theme=["']([\w-]+)["']\]/g)].map((m) => m[1])),
	];
	return names;
}

export function semanticProperties(root) {
	return [
		...extractDeclaredCustomProperties(read(path.join(root, 'src/styles/vars/semantic.css'))),
	].sort();
}

export function components(root) {
	const dir = path.join(root, 'components');
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'index.js')))
		.map(({ name }) => {
			const source = read(path.join(dir, name, 'index.js'));
			const attrs = source.match(/static\s+observedAttributes\s*=\s*\[([^\]]*)\]/);
			// The header comment, minus its first "// components/<name>/index.js" line.
			const header = [];
			for (const line of source.split('\n')) {
				if (!line.startsWith('//')) break;
				header.push(line.replace(/^\/\/\s?/, ''));
			}
			return {
				name,
				tag: source.match(/static\s+tag\s*=\s*['"]([\w-]+)['"]/)?.[1] || `deck-${name}`,
				attributes: attrs ? [...attrs[1].matchAll(/['"]([\w-]+)['"]/g)].map((m) => m[1]) : [],
				description: header
					.filter((line) => !line.startsWith('components/'))
					.join(' ')
					.trim(),
				path: `components/${name}/index.js`,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function classes(root) {
	const deck = [...extractClassSelectors(read(path.join(root, 'deck.css')))].sort();
	return { deck, reveal: [...REVEAL_NATIVE_CLASSES].sort() };
}

export function catalog(root) {
	return {
		themes: themes(root),
		components: components(root),
		classes: classes(root),
		properties: semanticProperties(root),
	};
}
