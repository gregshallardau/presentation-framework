// Shared slide-filename parsing/numbering, used by both
// build/vite-plugin-slides.js (the runtime assembler) and scripts/make-slide.js
// (the scaffolder) so the NN[.M]-<slug>.<ext> convention is defined in exactly
// one place - two parsers drifting apart would silently misnumber or
// misassemble slides. See slides/README.md for the convention itself:
// >=3-digit majors, step 10, gap-based (insert in the gap, never renumber
// unless the gap is exhausted).

export const SLIDE_RE = /\.(html|md)$/i;
export const MAJOR_STEP = 10;
export const MAJOR_DIGITS = 3;

export const natSort = (a, b) => a.localeCompare(b, undefined, { numeric: true });

// "020.1-architecture.html" -> { major: 20, minor: 1, slug: "architecture", ext: "html" }
export function parseSlideFilename(file) {
	const m = /^(\d+)(?:\.(\d+))?[-_.]?(.*?)\.(html|md)$/i.exec(file);
	if (!m) {
		return {
			major: Infinity,
			minor: null,
			slug: file.replace(SLIDE_RE, '').toLowerCase(),
			ext: file.split('.').pop().toLowerCase(),
		};
	}
	return {
		major: Number(m[1]),
		minor: m[2] != null ? Number(m[2]) : null,
		slug: (m[3] || `slide-${m[1]}`).toLowerCase(),
		ext: m[4].toLowerCase(),
	};
}

export function padMajor(n) {
	return String(n).padStart(MAJOR_DIGITS, '0');
}

// "<major>[.<minor>]-<slug>.<ext>"
export function formatSlideFilename({ major, minor, slug, ext }) {
	const majorPart = padMajor(major);
	const minorPart = minor != null ? `.${minor}` : '';
	return `${majorPart}${minorPart}-${slug}.${ext}`;
}

export function kebabCase(text) {
	return text
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

const roundDownToStep = (n) => Math.floor(n / MAJOR_STEP) * MAJOR_STEP;

/**
 * Picks a free major strictly between `lower` (exclusive, or null for "no
 * lower bound") and `upper` (exclusive, or null for "no upper bound"),
 * inserting "right after lower" per slides/README.md's example ("to slot
 * right after 020, insert 021"). Returns null if the gap is exhausted
 * (upper - lower <= 1) - the caller must rebalance first.
 */
export function pickGapMajor(lower, upper) {
	if (lower == null && upper == null) return 0; // empty deck
	if (lower == null) return upper > 0 ? 0 : null; // inserting before the very first slide
	if (upper == null) return roundDownToStep(lower) === lower ? lower + MAJOR_STEP : roundDownToStep(lower) + MAJOR_STEP; // append after the last
	if (upper - lower <= 1) return null; // gap exhausted - caller must rebalance
	return lower + 1;
}

/**
 * Renumbers every major in `slides` (an array of {major, minor, ext, slug,
 * file}) back to clean, evenly-spaced step-10 multiples, preserving order.
 * Returns a rename list ({from, to} file basenames) to apply bottom-up.
 * This is slides/README.md's "gap of exactly 1 - rebalance ... back to round
 * step-10 numbers" escape hatch, applied to the whole deck (the simple,
 * always-correct interpretation of "that local run of slides (or the whole
 * deck)"). `start` is the first major (0 by default; MAJOR_STEP leaves room
 * in front of the first slide).
 */
export function rebalanceMajors(slides, start = 0) {
	const majorsInOrder = [...new Set(slides.map((s) => s.major))].sort((a, b) => a - b);
	const remap = new Map(majorsInOrder.map((major, i) => [major, start + i * MAJOR_STEP]));
	const renames = [];
	for (const s of slides) {
		const newMajor = remap.get(s.major);
		if (newMajor !== s.major) {
			renames.push({ from: s.file, to: formatSlideFilename({ ...s, major: newMajor }) });
		}
	}
	// bottom-up (descending original major) so a renumber pass never collides mid-flight
	renames.sort((a, b) => b.from.localeCompare(a.from, undefined, { numeric: true }));
	return { renames, remap };
}
