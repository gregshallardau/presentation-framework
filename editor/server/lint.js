// The Problems panel: the exact checks behind `npm run lint:slides` and
// `npm run check:vocab` (scripts/lib/lint.js), run over unsaved buffers too,
// reported as [{ path, line, message, severity, source }].

import { checkSharedVocabulary, lintSlides } from '../../scripts/lib/lint.js';

export async function lint(root, buffers = {}) {
	const slideOverrides = {};
	for (const [path, text] of Object.entries(buffers)) {
		if (/^slides\/[^/]+$/.test(path)) slideOverrides[path.slice('slides/'.length)] = text;
	}
	const { issues } = await lintSlides(root, slideOverrides);
	const problems = issues.map(({ file, line, message }) => ({
		path: `slides/${file}`,
		line,
		message,
		severity: 'warning',
		source: 'lint:slides',
	}));
	const vocabOverrides = {};
	for (const key of ['deck.css', 'src/components/shared-styles.js'])
		if (key in buffers) vocabOverrides[key] = buffers[key];
	try {
		const { drift } = await checkSharedVocabulary(root, vocabOverrides);
		const deckCss = vocabOverrides['deck.css'];
		for (const { name } of drift) {
			const index = deckCss?.indexOf(`SHARED-VOCAB:start ${name}`) ?? -1;
			problems.push({
				path: 'deck.css',
				line: index >= 0 ? deckCss.slice(0, index).split('\n').length : 1,
				message: `"${name}" has drifted between deck.css and src/components/shared-styles.js - fix shared-styles.js to match deck.css`,
				severity: 'warning',
				source: 'check:vocab',
			});
		}
	} catch (error) {
		problems.push({
			path: 'deck.css',
			line: 1,
			message: error.message,
			severity: 'error',
			source: 'check:vocab',
		});
	}
	return { problems };
}
