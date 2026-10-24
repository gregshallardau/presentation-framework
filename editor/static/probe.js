/**
 * The editor's hands inside the preview iframe (same origin): element picking,
 * highlight boxes, fragment steps and auto-animate pairs. Used by animate.js.
 *
 * Auto-animate pairs come from Reveal's own AutoAnimate controller
 * (vendor/reveal.js/js/controllers/autoanimate.js) run against the live deck,
 * so what the highlight shows is exactly what Reveal will tween - including its
 * implicit text / image / code matching and its config.autoAnimateMatcher.
 */

const OVERLAY_ID = '__studio-overlay';
const BLOCKS = 'li, p, h1, h2, h3, h4, h5, h6, blockquote, pre, table, img, figure, dt, dd';

let AutoAnimate = null;
async function autoAnimateController() {
	if (!AutoAnimate)
		AutoAnimate = (await import('/vendor/reveal.js/js/controllers/autoanimate.js')).default;
	return AutoAnimate;
}

export function createProbe(win) {
	const doc = win.document;
	const deck = win.Reveal;

	function layer() {
		let node = doc.getElementById(OVERLAY_ID);
		if (!node) {
			node = doc.createElement('div');
			node.id = OVERLAY_ID;
			node.style.cssText =
				'position:fixed;inset:0;pointer-events:none;z-index:2147483000;font:600 11px/1.2 system-ui,sans-serif';
			doc.body.append(node);
		}
		return node;
	}

	/** Draws boxes: [{ el, color, label, dashed, fill }]. */
	function draw(items, key = 'default') {
		const root = layer();
		root.querySelectorAll(`[data-layer="${key}"]`).forEach((n) => n.remove());
		for (const item of items) {
			const r = item.el.getBoundingClientRect();
			if (!r.width && !r.height) continue;
			const box = doc.createElement('div');
			box.dataset.layer = key;
			box.style.cssText =
				`position:fixed;left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;` +
				`border:2px ${item.dashed ? 'dashed' : 'solid'} ${item.color};border-radius:5px;box-sizing:border-box;` +
				(item.fill ? `background:${item.color}22;` : '');
			if (item.label) {
				const tag = doc.createElement('span');
				tag.textContent = item.label;
				tag.style.cssText = `position:absolute;left:-2px;top:-19px;padding:2px 6px;border-radius:4px;background:${item.color};color:#fff;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis`;
				box.append(tag);
			}
			root.append(box);
		}
	}
	const clear = (key) => draw([], key);

	/**
	 * Draws frames from rectangles in the preview's viewport px (not elements):
	 * [{ rect: { left, top, width, height }, color, label, dashed, mask }].
	 * `mask` dims everything outside the frame - "what the camera sees".
	 */
	function drawFrames(items, key = 'frames') {
		const root = layer();
		root.querySelectorAll(`[data-layer="${key}"]`).forEach((n) => n.remove());
		for (const item of items) {
			const r = item.rect;
			const box = doc.createElement('div');
			box.dataset.layer = key;
			box.style.cssText =
				`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;` +
				`border:${item.mask ? 3 : 2}px ${item.dashed ? 'dashed' : 'solid'} ${item.color};box-sizing:border-box;` +
				(item.mask ? 'box-shadow:0 0 0 9999px rgba(15,23,42,.5);' : '');
			if (item.label) {
				const tag = doc.createElement('span');
				tag.textContent = item.label;
				tag.style.cssText = `position:absolute;left:-2px;top:-22px;padding:2px 7px;border-radius:4px;background:${item.color};color:#fff;white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis`;
				// a frame at the top edge would push its label off screen: tuck it inside
				if (r.top < 26) tag.style.top = '4px';
				box.append(tag);
			}
			root.append(box);
		}
	}

	/**
	 * Slide px <-> preview viewport px for a slide section, through Reveal's
	 * scale. Measured live, so it is right at any window size.
	 */
	function slideSpace(section) {
		const box = section.getBoundingClientRect();
		const scale = box.width / section.clientWidth || 1;
		return {
			scale,
			toScreen: ({ x, y, w, h }) => ({
				left: box.left + x * scale,
				top: box.top + y * scale,
				width: w * scale,
				height: h * scale,
			}),
			toSlide: (clientX, clientY) => ({
				x: (clientX - box.left) / scale,
				y: (clientY - box.top) / scale,
			}),
		};
	}

	const current = () => deck.getCurrentSlide();

	function describe(el) {
		const tag = el.tagName.toLowerCase();
		const text = (el.getAttribute('alt') || el.textContent || '').replace(/\s+/g, ' ').trim();
		return {
			tag,
			text: text.slice(0, 80),
			src: el.getAttribute('src') || el.getAttribute('data-src') || '',
			id: el.getAttribute('data-id') || '',
		};
	}

	/** The element a click should select: an annotated HTML element, or a Markdown block. */
	function selectable(el) {
		if (!el || el.nodeType !== 1 || el.closest(`#${OVERLAY_ID}`)) return null;
		const slide = el.closest('section');
		if (!slide) return null;
		if (slide.closest('[data-markdown]') || slide.hasAttribute('data-markdown')) {
			return el.matches('img') ? el : el.closest(BLOCKS);
		}
		const annotated = el.closest('[data-studio-src]');
		return annotated && annotated.tagName !== 'SECTION' ? annotated : null;
	}

	/**
	 * Hover-outline + click to choose an element on the current slide.
	 * Resolves with the element, or null on Escape.
	 */
	let cancelPick = null;
	function pick({ color = '#315de3', hint = 'Click an element' } = {}) {
		cancelPick?.();
		return new Promise((resolve) => {
			const root = layer();
			const banner = doc.createElement('div');
			banner.textContent = `${hint} · Esc to cancel`;
			banner.style.cssText = `position:fixed;left:50%;top:10px;transform:translateX(-50%);padding:6px 12px;border-radius:6px;background:${color};color:#fff;font:600 12px system-ui,sans-serif;z-index:2147483001`;
			root.append(banner);
			let hovered = null;
			const move = (event) => {
				const el = selectable(doc.elementFromPoint(event.clientX, event.clientY));
				if (el === hovered) return;
				hovered = el;
				draw(el ? [{ el, color, fill: true, label: `<${el.tagName.toLowerCase()}>` }] : [], 'pick');
			};
			const finish = (value) => {
				cancelPick = null;
				doc.removeEventListener('mousemove', move, true);
				doc.removeEventListener('click', click, true);
				doc.removeEventListener('keydown', key, true);
				banner.remove();
				clear('pick');
				resolve(value);
			};
			const click = (event) => {
				const el = selectable(event.target);
				event.preventDefault();
				event.stopPropagation();
				if (el && current().contains(el)) finish(el);
			};
			const key = (event) => {
				if (event.key === 'Escape') {
					event.stopPropagation();
					finish(null);
				}
			};
			doc.addEventListener('mousemove', move, true);
			doc.addEventListener('click', click, true);
			doc.addEventListener('keydown', key, true);
			cancelPick = () => finish(undefined);
			win.focus();
		});
	}

	/** Ends a pick in progress; it resolves undefined (not null, which is Escape). */
	const stopPicking = () => cancelPick?.();

	/** Fragment steps of the current slide: [{ index, elements }], in play order. */
	function steps(slide = current()) {
		const groups = new Map();
		for (const el of slide.querySelectorAll('.fragment')) {
			if (el.closest('section') !== slide) continue;
			const index = Number(el.getAttribute('data-fragment-index') || 0);
			if (!groups.has(index)) groups.set(index, []);
			groups.get(index).push(el);
		}
		return [...groups.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([index, elements]) => ({ index, elements }));
	}

	/* ── Auto-animate ───────────────────────────────────────────────── */

	function linear() {
		return deck.getSlides();
	}
	function neighbours(slide = current()) {
		const slides = linear();
		const i = slides.indexOf(slide);
		return { prev: slides[i - 1] || null, next: slides[i + 1] || null };
	}
	// Reveal's shouldAutoAnimateBetween(), for a forward move from -> to.
	function animates(from, to) {
		return (
			!!from &&
			!!to &&
			from.hasAttribute('data-auto-animate') &&
			to.hasAttribute('data-auto-animate') &&
			from.getAttribute('data-auto-animate-id') === to.getAttribute('data-auto-animate-id') &&
			!to.hasAttribute('data-auto-animate-restart')
		);
	}
	function unmatched(root, matched) {
		return [...root.children].reduce((result, el) => {
			const contains = [...matched].some((m) => el !== m && el.contains(m));
			if (!matched.has(el) && !contains && !el.closest(`#${OVERLAY_ID}`)) result.push(el);
			if (contains) result = result.concat(unmatched(el, matched));
			return result;
		}, []);
	}
	async function pairs(from, to) {
		const Controller = await autoAnimateController();
		const controller = new Controller(deck);
		return controller.getAutoAnimatableElements(from, to).map((pair) => ({
			from: pair.from,
			to: pair.to,
			how:
				pair.from.hasAttribute('data-id') &&
				pair.from.getAttribute('data-id') === pair.to.getAttribute('data-id')
					? 'data-id'
					: pair.from.matches('img, video, iframe')
						? 'source'
						: 'text',
		}));
	}

	/**
	 * The current slide's auto-animate picture:
	 * { incoming: { from, pairs, enters } | null, outgoing: { to, pairs, leaves } | null }
	 */
	async function autoAnimateState(slide = current()) {
		const { prev, next } = neighbours(slide);
		const result = {
			slide,
			incoming: null,
			outgoing: null,
			flagged: slide.hasAttribute('data-auto-animate'),
		};
		if (animates(prev, slide)) {
			const list = await pairs(prev, slide);
			result.incoming = {
				from: prev,
				pairs: list,
				enters: unmatched(slide, new Set(list.map((p) => p.to))),
			};
		}
		if (animates(slide, next)) {
			const list = await pairs(slide, next);
			result.outgoing = {
				to: next,
				pairs: list,
				leaves: unmatched(slide, new Set(list.map((p) => p.from))),
			};
		}
		return result;
	}

	const label = (el, how) => {
		const id = el.getAttribute('data-id');
		const d = describe(el);
		return `${how === 'data-id' && id ? `#${id}` : how === 'text' ? '“' + d.text.slice(0, 24) + '”' : `<${d.tag}>`}`;
	};

	const COLORS = { morph: '#315de3', out: '#7c3aed', enters: '#16a34a', leaves: '#ea580c' };

	async function highlightAutoAnimate() {
		const aa = await autoAnimateState();
		const items = [];
		const inSet = new Map((aa.incoming?.pairs || []).map((p) => [p.to, p]));
		const outSet = new Map((aa.outgoing?.pairs || []).map((p) => [p.from, p]));
		for (const [el, p] of inSet) {
			const both = outSet.has(el);
			items.push({
				el,
				color: COLORS.morph,
				label: `${both ? '⇄' : '←'} ${label(el, p.how)}${both ? '' : ' morphs in'}`,
			});
		}
		for (const [el, p] of outSet)
			if (!inSet.has(el))
				items.push({ el, color: COLORS.out, label: `→ ${label(el, p.how)} morphs on` });
		for (const el of aa.incoming?.enters || [])
			items.push({ el, color: COLORS.enters, dashed: true, label: 'fades in' });
		for (const el of aa.outgoing?.leaves || [])
			if (!inSet.has(el) && !(aa.incoming?.enters || []).includes(el))
				items.push({ el, color: COLORS.leaves, dashed: true, label: 'no match next' });
		draw(items, 'aa');
		return aa;
	}

	/* ── Right-click editing ────────────────────────────────────────── */

	/**
	 * Calls handler({ element | null, slide, x, y, edit }) on a right-click
	 * (edit: false) or a double-click on an element (edit: true). x/y are in
	 * the editor page's coordinates. Shift + right-click keeps the browser menu.
	 */
	function onContextMenu(handler) {
		const toPage = (event) => {
			const box = win.frameElement.getBoundingClientRect();
			return { x: box.left + event.clientX, y: box.top + event.clientY };
		};
		const editing = () => doc.activeElement?.isContentEditable;
		doc.addEventListener(
			'contextmenu',
			(event) => {
				if (event.shiftKey || editing()) return;
				const slide = current();
				if (!slide) return;
				event.preventDefault();
				const found = selectable(event.target);
				const element = found && slide.contains(found) ? found : null;
				if (element) flash(element, '#315de3');
				handler({ element, slide, edit: false, ...toPage(event) });
			},
			true
		);
		doc.addEventListener(
			'dblclick',
			(event) => {
				if (editing()) return;
				const found = selectable(event.target);
				if (!found || !current()?.contains(found)) return;
				event.preventDefault();
				handler({ element: found, slide: current(), edit: true, ...toPage(event) });
			},
			true
		);
	}

	/**
	 * Edits an element's text in place. Enter (or clicking away) commits and
	 * resolves the new innerHTML; Esc restores it and resolves null.
	 * Shift+Enter inserts a line break. Reveal ignores keys while a
	 * contenteditable has focus; key events are also kept from bubbling.
	 */
	function editInline(el) {
		return new Promise((resolve) => {
			const before = el.innerHTML;
			const style = el.getAttribute('style');
			el.setAttribute('contenteditable', 'true');
			el.style.outline = '2px solid #315de3';
			el.style.outlineOffset = '4px';
			el.style.cursor = 'text';
			el.focus();
			const range = doc.createRange();
			range.selectNodeContents(el);
			const selection = win.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
			let settled = false;
			const done = (value) => {
				if (settled) return;
				settled = true;
				el.removeEventListener('keydown', key, true);
				el.removeEventListener('blur', blur);
				el.removeAttribute('contenteditable');
				if (style === null) el.removeAttribute('style');
				else el.setAttribute('style', style);
				selection.removeAllRanges();
				resolve(value);
			};
			const key = (event) => {
				event.stopPropagation();
				if (event.key === 'Escape') {
					event.preventDefault();
					el.innerHTML = before;
					done(null);
				} else if (event.key === 'Enter' && event.shiftKey) {
					event.preventDefault();
					doc.execCommand('insertLineBreak');
				} else if (event.key === 'Enter') {
					event.preventDefault();
					done(el.innerHTML === before ? null : el.innerHTML);
				}
			};
			const blur = () => done(el.innerHTML === before ? null : el.innerHTML);
			el.addEventListener('keydown', key, true);
			el.addEventListener('blur', blur);
		});
	}

	/** Temporarily shows (or hides) a class, for hover previews in menus. */
	function previewClass(el, cls, on) {
		el.classList.toggle(cls, on);
	}

	function flash(el, color = '#f59e0b') {
		draw([{ el, color, fill: true }], 'flash');
		win.setTimeout(() => clear('flash'), 900);
	}

	return {
		onContextMenu,
		editInline,
		previewClass,
		stopPicking,
		draw,
		drawFrames,
		slideSpace,
		clear,
		describe,
		selectable,
		pick,
		steps,
		neighbours,
		animates,
		autoAnimateState,
		highlightAutoAnimate,
		flash,
		current,
		COLORS,
	};
}
