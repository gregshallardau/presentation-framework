// Pure slide-insertion / move planning, shared by scripts/make-slide.js (the
// CLI scaffolder) and editor/server/slide-actions.js (the GUI editor) so both
// number new and moved slides identically. Nothing here touches the disk:
// every function takes a parsed slide list (listSlideFiles) and returns the
// renames + new filename the caller then applies.
//
// Throws SlidePlanError (with the CLI's own wording) when a request can't be
// satisfied, so the CLI can print it and exit and the editor can return a 400.

import { readdirSync, existsSync } from 'node:fs';
import {
	SLIDE_RE,
	natSort,
	parseSlideFilename,
	formatSlideFilename,
	kebabCase,
	pickGapMajor,
	rebalanceMajors,
	MAJOR_STEP,
} from './slide-files.js';

export class SlidePlanError extends Error {}

const fail = (message) => {
	throw new SlidePlanError(message);
};

// slides/ listing in deck order, each { file, major, minor, slug, ext }.
export function listSlideFiles(dir) {
	if (!existsSync(dir)) fail(`${dir} does not exist`);
	return readdirSync(dir)
		.filter((f) => SLIDE_RE.test(f) && f.toLowerCase() !== 'readme.md')
		.sort(natSort)
		.map((f) => ({ file: f, ...parseSlideFilename(f) }));
}

const majorsSorted = (slides) => [...new Set(slides.map((s) => s.major))].sort((a, b) => a - b);

function neighbours(slides, major) {
	const majors = majorsSorted(slides);
	const idx = majors.indexOf(major);
	return { lower: majors[idx - 1] ?? null, upper: majors[idx + 1] ?? null };
}

function findBySlug(slides, slug) {
	const found = slides.find((x) => x.slug === slug);
	if (!found) fail(`no slide with slug "${slug}" found in slides/`);
	return found;
}

// Applies a rename list to an in-memory slide list (no disk access).
function renamed(slides, renames) {
	const map = new Map(renames.map((r) => [r.from, r.to]));
	return slides.map((s) => {
		const to = map.get(s.file);
		return to ? { ...s, ...parseSlideFilename(to), file: to } : s;
	});
}

// Free major on one side of `anchor`, rebalancing the whole deck first when the
// gap is exhausted. `slides` must not contain the slide(s) being placed.
function gapBeside(slides, anchorSlug, side) {
	const anchor = findBySlug(slides, anchorSlug);
	let { lower, upper } = neighbours(slides, anchor.major);
	if (side === 'after') lower = anchor.major;
	else upper = anchor.major;
	let gap = pickGapMajor(lower, upper);
	if (gap != null) return { major: gap, renames: [], slides };
	// exhausted - rebalance the whole deck, then re-resolve the same anchor relationship.
	// Before a first slide numbered 000 there is no gap even then, so start at 010.
	const tight = side === 'before' && anchor.major === majorsSorted(slides)[0];
	const { renames } = rebalanceMajors(slides, tight ? MAJOR_STEP : 0);
	const fresh = renamed(slides, renames);
	const freshAnchor = findBySlug(fresh, anchorSlug);
	const n2 = neighbours(fresh, freshAnchor.major);
	gap = side === 'after' ? pickGapMajor(freshAnchor.major, n2.upper) : pickGapMajor(n2.lower, freshAnchor.major);
	return { major: gap, renames, slides: fresh };
}

// Target {major, minor} for joining the stack at `major` (promoting a bare
// major to .1 first, so it can take a vertical sibling).
function stackSlot(slides, major) {
	if (!Number.isInteger(major) || major < 0) fail('--vertical-of must be a non-negative integer');
	const siblings = slides.filter((s) => s.major === major);
	if (!siblings.length) fail(`--vertical-of ${major}: no slide with major ${major} exists yet`);
	const renames = [];
	const bareMajor = siblings.find((s) => s.minor == null);
	if (bareMajor) renames.push({ from: bareMajor.file, to: formatSlideFilename({ ...bareMajor, minor: 1 }) });
	const usedMinors = siblings.filter((s) => s.minor != null).map((s) => s.minor);
	return { major, minor: usedMinors.length ? Math.max(...usedMinors) + 1 : 2, renames };
}

export function stubBody(format, title, slug) {
	return format === 'md'
		? `## ${title}\n\n- TODO: content\n`
		: `<section id="${slug}" data-slug="${slug}">\n\t<h2>${title}</h2>\n\t<!-- TODO: content -->\n</section>\n`;
}

/**
 * Plans a new slide. `where` is exactly one of:
 *   { after: slug } | { before: slug } | { position: N } | { verticalOf: N } | { end: true }
 * Returns { renames, newFile, body, slug, rebalanced, promoted }. `renames`
 * are applied first, in order (bottom-up for a rebalance).
 */
export function planInsert(slides, { title, slug: rawSlug, format = 'md', ...where }) {
	if (!title) fail('--title "..." is required');
	const modeFlags = ['after', 'before', 'position', 'verticalOf'].filter((k) => where[k] != null).length + (where.end ? 1 : 0);
	if (modeFlags !== 1) fail('pass exactly one of --after <slug> / --before <slug> / --position <N> / --vertical-of <N> / --end');
	if (!['md', 'html'].includes(format)) fail('--format must be "md" or "html"');

	const slug = rawSlug ? kebabCase(rawSlug) : kebabCase(title);
	if (!slug) fail('could not derive a slug - pass --slug explicitly');
	const taken = slides.find((s) => s.slug === slug);
	if (taken) fail(`slug "${slug}" is already used by slides/${taken.file}`);

	let renames = [];
	let rebalanced = false;
	let promoted = false;
	let targetMajor;
	let targetMinor = null;

	if (where.end) {
		const majors = majorsSorted(slides);
		targetMajor = pickGapMajor(majors.length ? majors[majors.length - 1] : null, null);
	} else if (where.position != null) {
		targetMajor = Number(where.position);
		if (!Number.isInteger(targetMajor) || targetMajor < 0) fail('--position must be a non-negative integer');
		if (slides.some((s) => s.major === targetMajor)) {
			fail(`major ${targetMajor} is already used - pick a free number (see slides/README.md's gap rule), or use --after/--before to have it computed`);
		}
	} else if (where.verticalOf != null) {
		const slot = stackSlot(slides, Number(where.verticalOf));
		({ major: targetMajor, minor: targetMinor, renames } = slot);
		promoted = renames.length > 0;
	} else {
		const gap = gapBeside(slides, where.after ?? where.before, where.after != null ? 'after' : 'before');
		targetMajor = gap.major;
		renames = gap.renames;
		rebalanced = renames.length > 0 || gap.slides !== slides;
	}

	const newFile = formatSlideFilename({ major: targetMajor, minor: targetMinor, slug, ext: format });
	return { renames, newFile, body: stubBody(format, title, slug), slug, rebalanced, promoted };
}

/**
 * Plans moving existing slide file(s) - one slide, or every file of one stack
 * (they keep their minors) - to a new place. `where` is one of:
 *   { after: slug } | { before: slug } | { end: true } | { verticalOf: N }
 * `after`/`before` name a slide that is NOT being moved. Returns
 * { renames } as a final from -> to mapping; apply it with a two-phase rename
 * (it may contain chains such as a -> b while b -> c).
 */
export function planMove(slides, files, where) {
	const moving = files.map((f) => slides.find((s) => s.file === f) || fail(`no slide file "${f}" in slides/`));
	const others = slides.filter((s) => !files.includes(s.file));
	const keepMinors = moving.length > 1;
	let renames = [];
	let targets;

	if (where.verticalOf != null) {
		const major = Number(where.verticalOf);
		const slot = stackSlot(others, major);
		renames = slot.renames;
		targets = moving.map((s, i) => ({ ...s, major, minor: slot.minor + i }));
	} else {
		let major;
		if (where.end) {
			const majors = majorsSorted(others);
			major = pickGapMajor(majors.length ? majors[majors.length - 1] : null, null);
		} else {
			const gap = gapBeside(others, where.after ?? where.before, where.after != null ? 'after' : 'before');
			({ major, renames } = gap);
		}
		targets = moving.map((s) => ({ ...s, major, minor: keepMinors ? s.minor : null }));
	}

	for (const t of targets) {
		const to = formatSlideFilename(t);
		if (to !== t.file) renames.push({ from: t.file, to });
	}
	return { renames: collapse(renames) };
}

// Plans renaming one slide's slug, keeping its position.
export function planRenameSlug(slides, file, newSlug) {
	const slide = slides.find((s) => s.file === file) || fail(`no slide file "${file}" in slides/`);
	const slug = kebabCase(newSlug || '');
	if (!slug) fail('enter a slug made of letters, digits and dashes');
	const taken = slides.find((s) => s.slug === slug && s.file !== file);
	if (taken) fail(`slug "${slug}" is already used by slides/${taken.file}`);
	if (slide.major === Infinity) fail(`slides/${file} has no NN- number prefix; rename it by hand`);
	const to = formatSlideFilename({ ...slide, slug });
	return { renames: to === file ? [] : [{ from: file, to }], slug, oldSlug: slide.slug };
}

// Plans the deck-wide step-10 renumber.
export function planRebalance(slides) {
	return { renames: collapse(rebalanceMajors(slides.filter((s) => s.major !== Infinity)).renames) };
}

// Folds a sequential rename list into one final from -> to mapping.
function collapse(renames) {
	const final = new Map();
	for (const { from, to } of renames) {
		const origin = [...final.entries()].find(([, v]) => v === from)?.[0] ?? from;
		final.set(origin, to);
	}
	return [...final.entries()].filter(([from, to]) => from !== to).map(([from, to]) => ({ from, to }));
}
