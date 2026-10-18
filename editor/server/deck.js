// The deck as the editor sees it: every slides/ file in Reveal order with its
// horizontal index h and the vertical index v of each sub-slide, so a cursor
// line can be turned into Reveal.slide(h, v). Grouping and ordering mirror
// assemble() in build/vite-plugin-slides.js exactly (same filter, natSort,
// major grouping - including the Infinity group of unnumbered files).

import fs from 'node:fs';
import path from 'node:path';
import { SLIDE_RE, natSort, parseSlideFilename } from '../../scripts/lib/slide-files.js';

const VFENCE = /^--\s*$/; // same fence as the loader's VSEP ("\n--\n")

const stripTags = (html) =>
	html
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();

export function slideTitle(text, ext) {
	if (ext === 'md') {
		const heading = text.match(/^#{1,6}\s+(.+)$/m);
		return heading ? heading[1].replace(/[*_`]/g, '').trim() : null;
	}
	const heading = text.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i);
	return heading ? stripTags(heading[2]) || null : null;
}

/**
 * Sub-slide start lines (1-based) of one file. A Markdown file splits on `--`
 * lines; an HTML file whose outer <section> nests <section>s is itself a stack,
 * one sub-slide per nested section. A plain file is one sub-slide at line 1.
 */
export function subslideLines(text, ext) {
	const lines = text.split(/\r?\n/);
	if (ext === 'md') {
		const starts = [1];
		lines.forEach((line, i) => {
			if (VFENCE.test(line)) starts.push(i + 2);
		});
		return starts;
	}
	const masked = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
	const opens = [...masked.matchAll(/<section[\s>]/gi)].map(
		(m) => masked.slice(0, m.index).split('\n').length
	);
	return opens.length > 1 ? opens.slice(1) : [1];
}

function hasNotes(text, ext) {
	return ext === 'md' ? /^Note:/m.test(text) : /<aside[^>]*class=["'][^"']*\bnotes\b/i.test(text);
}

/**
 * Builds the deck model. `overrides` maps 'slides/<file>' to unsaved text.
 * Returns { slides: [{ file, path, slug, ext, major, minor, h, v, stack,
 * title, notes, subslides: [{ v, line }] }], count }.
 */
export function deckModel(root, overrides = {}) {
	const dir = path.join(root, 'slides');
	if (!fs.existsSync(dir)) return { slides: [], count: 0 };
	const files = fs
		.readdirSync(dir)
		.filter((f) => SLIDE_RE.test(f) && f.toLowerCase() !== 'readme.md')
		.sort(natSort);

	const groups = new Map();
	for (const f of files) {
		const meta = parseSlideFilename(f);
		if (!groups.has(meta.major)) groups.set(meta.major, []);
		groups.get(meta.major).push({ f, meta });
	}

	const slides = [];
	let h = 0;
	for (const [, items] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
		let v = 0;
		for (const { f, meta } of items) {
			const rel = `slides/${f}`;
			let text = overrides[rel];
			if (text == null) {
				try {
					text = fs.readFileSync(path.join(dir, f), 'utf8');
				} catch {
					text = '';
				}
			}
			const starts = subslideLines(text, meta.ext);
			slides.push({
				file: f,
				path: rel,
				slug: meta.slug,
				ext: meta.ext,
				major: Number.isFinite(meta.major) ? meta.major : null,
				minor: meta.minor,
				h,
				v,
				stack: items.length > 1,
				title: slideTitle(text, meta.ext) || meta.slug,
				notes: hasNotes(text, meta.ext),
				subslides: starts.map((line, i) => ({ v: v + i, line })),
			});
			v += starts.length;
		}
		h++;
	}
	return { slides, count: h };
}

// Reveal indices for a cursor line inside one slide of the model.
export function indicesAt(slide, line) {
	let current = slide.subslides[0];
	for (const sub of slide.subslides) if (sub.line <= line) current = sub;
	return { h: slide.h, v: current.v };
}
