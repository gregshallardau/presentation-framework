/*
 * deck.config.js - the deck author's Reveal.js knobs.
 * ============================================================================
 *
 * Everything under src/ is framework machinery you never edit. This file, like
 * deck.css, is a root-level surface you tune per deck. src/main.js imports it
 * and passes it to Reveal; plugins and bootstrapping stay in src/.
 *
 * Full option list: https://revealjs.com/config/
 */
export default {
	/* Slide coordinate space. Reveal scales the whole deck to fit the viewport;
	   these numbers are what you author against. 1920x1080 = true 16:9.
	   NOTE: --text-root-size (deck.css) is a fixed px value in THIS space, so a
	   taller space makes text look smaller - bump --text-root-size to match. */
	width: 1920,
	height: 1080,

	/* Empty gutter around every slide, as a fraction of the slide size.
	   Reveal's stock is 0.04; raise it (0.08) for a calmer frame, lower it
	   for edge-to-edge visuals. */
	margin: 0.06,

	/* Slide numbers: false | 'c' | 'c/t' | 'h.v' | 'h/v'.
	   Reveal draws them bottom-right on a translucent-black fill; restyle with
	   `.reveal .slide-number { ... }` in deck.css. */
	slideNumber: false,

	/* Default slide transition:
	   'slide' | 'none' | 'fade' | 'convex' | 'concave' | 'zoom'
	   Override on one slide with data-transition (HTML) or
	   `<!-- .slide: data-transition="fade" -->` (Markdown). */
	transition: 'slide',

	/* Put #/<slug> in the URL bar and restore position on reload. */
	hash: true,

	/* Type a slide number then Enter to jump straight to it. */
	jumpToSlide: true,

	/* Re-skin: the name of a [data-theme="..."] block in
	   src/styles/vars/semantic.css (e.g. 'dark'). Omit for the default skin.
	   Not a Reveal option - src/main.js applies it to <html data-theme>. */
	// theme: 'dark',

	/* ── PERSISTENT DECK CHROME ──────────────────────────────────────────
	   A logo and/or a footer line drawn on top of EVERY slide (they live
	   outside the slide transform, so they don't slide/fade between slides).
	   src/main.js reads this and injects the DOM; deck.css styles it.

	   Delete the whole `chrome` block (or comment it out) for a deck with
	   no logo or footer - that is the default.

	   `logo`   - omit for no logo. Fields:
	       src       path to the image. Put the file in `public/` (Vite serves
	                 that folder at "/"), then use "/logo.svg". A data: URI or
	                 an absolute https URL also work.
	       alt       accessibility text; "" if the logo is purely decorative.
	       position  which corner - one of:
	                   'top-left'  'top-right'  'top-center'
	                   'bottom-left'  'bottom-right'  'bottom-center'
	                 Default 'top-right'. A 'bottom-right' logo sits near
	                 Reveal's nav arrows, so keep it top or left.
	       height    CSS length for the rendered logo height (width auto).
	                 'vh' units keep it a constant fraction of the screen
	                 regardless of deck scaling. Default '4vh'.

	   `footer` - omit for no footer. Fields:
	       text      the footer string. Plain text, or simple inline HTML
	                 (&copy;, &middot;, <strong>…</strong>). It is YOUR text
	                 from YOUR config, so markup is allowed.
	       position  same six keywords as the logo. Default 'bottom-left'.

	   `hideOnTitle` - true (default) hides both on the first slide, the way
	                   most decks keep their title slide clean. Set false to
	                   show them there too. Any single slide can also opt out
	                   with a `data-hide-chrome` attribute on its <section>.

	   Restyle the injected elements in deck.css: `.reveal .deck-logo` and
	   `.reveal .deck-footer` (the footer already uses --muted and a small
	   size; the logo respects --logo-height). */
	// chrome: {
	// 	logo: { src: '/logo.svg', alt: 'Acme', position: 'top-right', height: '4vh' },
	// 	footer: { text: '&copy; 2026 Acme &middot; Confidential', position: 'bottom-left' },
	// 	hideOnTitle: true,
	// },
};
