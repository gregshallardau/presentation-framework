/**
 * Single module entry for the framework.
 *   styles -> component registry -> Reveal (+ plugins) -> library bootstrapping
 *
 * Loaded from index.html via <script type="module" src="/src/main.js">.
 * Deck-author Reveal knobs (size, transition, slide numbers...) live in the
 * root-level deck.config.js; plugins and bootstrap stay here as machinery.
 */
import '/src/styles/index.css';
import '@/components/registry.js';

import Reveal from 'reveal.js';
import RevealNotes from 'reveal.js/plugin/notes';
import RevealMarkdown from 'reveal.js/plugin/markdown';
import RevealHighlight from 'reveal.js/plugin/highlight';

import deckConfig from '/deck.config.js';
import { initGsap } from '@/lib/gsap.js';
import { initAlpine } from '@/lib/alpine.js';
// d3.js is imported lazily by the components that use it.

const { chrome, theme, ...revealConfig } = deckConfig;

// deck.config.js `theme` names a [data-theme] skin (src/styles/vars/semantic.css).
// An explicit <html data-theme> in index.html still wins.
if (theme && !document.documentElement.dataset.theme) document.documentElement.dataset.theme = theme;

const deck = new Reveal({
	...revealConfig,
	plugins: [RevealNotes, RevealMarkdown, RevealHighlight],
});

deck.initialize().then(() => {
	if (chrome) mountChrome(chrome);
	initGsap();
	initAlpine();
});

window.Reveal = deck;

/**
 * Persistent deck chrome (logo + footer) from deck.config.js `chrome`.
 * Appended to .reveal so it sits over every slide, outside the slide transform.
 */
function mountChrome({ logo, footer, hideOnTitle = true }) {
	const root = document.querySelector('.reveal');

	if (logo?.src) {
		const el = document.createElement('div');
		el.className = 'deck-logo';
		el.dataset.pos = logo.position || 'top-right';
		if (logo.height) el.style.setProperty('--logo-height', logo.height);
		const img = document.createElement('img');
		img.src = logo.src;
		img.alt = logo.alt || '';
		el.append(img);
		root.append(el);
	}

	if (footer?.text) {
		const el = document.createElement('div');
		el.className = 'deck-footer';
		el.dataset.pos = footer.position || 'bottom-left';
		el.innerHTML = footer.text; // deck-author string; may carry simple markup
		root.append(el);
	}

	const sync = () => {
		const cur = deck.getCurrentSlide();
		const hide =
			cur?.hasAttribute('data-hide-chrome') ||
			(hideOnTitle && deck.getIndices().h === 0 && deck.getIndices().v === 0);
		root.classList.toggle('deck-chrome-hidden', !!hide);
	};
	deck.on('slidechanged', sync);
	sync();
}
