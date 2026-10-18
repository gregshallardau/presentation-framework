/**
 * Reveal fragment wiring for stepped components.
 *
 * `class="fragment"` cannot work inside a shadow root (Reveal styles it from
 * its own light-DOM sheet), so a component that steps through beats listens
 * for Reveal's fragment events on its OWN <section> and reads the state Reveal
 * has already applied to the DOM. Scoping to the section matters: a bare
 * Reveal.on() listener fires for every slide in the deck.
 */

/** Runs fn once window.Reveal exists (main.js sets it before deck.initialize() resolves). */
export function whenReveal(fn) {
	if (window.Reveal) { fn(window.Reveal); return () => {}; }
	const t = setInterval(() => {
		if (window.Reveal) {
			clearInterval(t);
			fn(window.Reveal);
		}
	}, 30);
	return () => clearInterval(t);
}

/**
 * Call `onChange({ animate, current })` whenever this element's slide may have
 * changed step: a fragment shown/hidden on it (animate = true), or any slide
 * change / deck ready (animate = false: deep link, overview, navigating back -
 * fragment events do not replay, so the caller re-reads the DOM).
 *
 * @param {Element} el an element inside the slide's <section>
 * @returns {() => void} unsubscribe
 */
export function watchSection(el, onChange) {
	const section = el.closest('section');
	if (!section) return () => {};
	let off = () => {};

	const stopPolling = whenReveal((Reveal) => {
		const current = () => section.contains(Reveal.getCurrentSlide?.());
		const frag = (e) => {
			const fs = e.fragments || [e.fragment];
			if (fs.some((f) => f && section.contains(f))) onChange({ animate: current(), current: current() });
		};
		const slide = () => onChange({ animate: false, current: current() });

		Reveal.on('fragmentshown', frag);
		Reveal.on('fragmenthidden', frag);
		Reveal.on('slidechanged', slide);
		Reveal.on('ready', slide);
		off = () => {
			Reveal.off('fragmentshown', frag);
			Reveal.off('fragmenthidden', frag);
			Reveal.off('slidechanged', slide);
			Reveal.off('ready', slide);
		};
		if (Reveal.isReady?.()) slide();
	});

	return () => { stopPolling(); off(); };
}
