/**
 * The animation timeline and auto-animate tools. Everything here edits
 * Reveal's own markup through source-edit.js - fragments, data-fragment-index,
 * transitions, data-auto-animate*, data-id - in the open buffers (undoable,
 * previewed before saving), never a runtime of its own.
 *
 * The timeline shows the slide in the preview:
 *   Arrive    transition + auto-animate settings for the slide
 *   Morphs    elements Reveal will tween in from the previous slide
 *   Step 1…n  fragment steps, each a row of element chips
 * Chips drag between steps; step headers drag to reorder and click to scrub.
 *
 * `host` is the editor (editor.js): frame access, buffers, edits, navigation
 * and UI helpers.
 */
import { createProbe } from './probe.js';
import { createCameraTools } from './camera.js';
import { closeMenu, openMenu } from './context-menu.js';
import {
	EASINGS,
	FRAGMENT_EFFECTS,
	applyEdits,
	findMdLine,
	fragmentChange,
	fragmentOf,
	mdPlacementWarning,
	parseStartTag,
	readTarget,
	replaceInnerHtml,
	replaceMdText,
	unfragmentChange,
} from './source-edit.js';

const TRANSITIONS = ['', 'none', 'fade', 'slide', 'convex', 'concave', 'zoom'];
const slugify = (text) =>
	String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 32);

export function createAnimator(host) {
	const { el, icon, toast } = host;
	let probe = null;
	let selected = null; // { slide, tag, text, nth } identity of the selected element
	let highlight = false;
	let aa = null;
	let playing = null;
	let renderToken = 0;
	const panel = () => document.getElementById('timeline-panel');
	const isOpen = () => !panel().hidden;

	/* ── Frame wiring ───────────────────────────────────────────────── */

	let frameChanged = () => {};
	// After an edit the reloaded slide shows every step, so animated (hidden)
	// elements stay visible and right-clickable.
	let showAllSteps = false;
	function onFrameReady(win) {
		probe = createProbe(win);
		camera.onFrameReady(win);
		frameChanged();
		const deck = win.Reveal;
		const refresh = () => {
			if (isOpen()) render();
			else if (highlight) drawHighlight();
		};
		deck.on('slidechanged', () => {
			refresh();
		});
		deck.on('fragmentshown', () => isOpen() && markStep());
		deck.on('fragmenthidden', () => isOpen() && markStep());
		win.addEventListener('resize', () => highlight && drawHighlight());
		win.document.addEventListener('pointerdown', closeMenu, true);
		probe.onContextMenu((info) =>
			info.edit ? attempt(editText)(info.element) : contextMenu(info)
		);
		refresh();
	}

	/**
	 * Runs on a freshly loaded preview before it is swapped in (still hidden):
	 * after an edit, show the slide with every step revealed so animated
	 * elements stay visible and right-clickable. Returns true if it moved.
	 */
	function beforeShow(win) {
		if (!showAllSteps) return false;
		showAllSteps = false;
		const deck = win.Reveal;
		const slide = deck.getCurrentSlide();
		const indices = [...slide.querySelectorAll('.fragment')]
			.filter((el) => el.closest('section') === slide)
			.map((el) => Number(el.getAttribute('data-fragment-index') || 0));
		if (!indices.length) return false;
		const { h, v } = deck.getIndices();
		deck.slide(h, v, Math.max(...indices));
		return true;
	}

	/**
	 * probe.pick() that survives a preview reload (a save, a config change):
	 * the pick moves to the new document instead of waiting on the old one.
	 */
	async function pick(options) {
		for (;;) {
			const current = probe;
			const reloaded = new Promise((resolve) => (frameChanged = () => resolve(undefined)));
			const result = await Promise.race([current.pick(options), reloaded]);
			frameChanged = () => {};
			if (result !== undefined) return result;
			current.stopPicking();
			if (!probe || probe === current) return null;
		}
	}

	async function drawHighlight() {
		if (!probe) return null;
		if (!highlight) {
			probe.clear('aa');
			return null;
		}
		try {
			aa = await probe.highlightAutoAnimate();
		} catch (error) {
			toast('Auto-animate highlight failed: ' + error.message, true);
		}
		return aa;
	}

	function setHighlight(on) {
		highlight = on;
		document.getElementById('aa-toggle')?.classList.toggle('active', on);
		document.getElementById('aa-toggle')?.setAttribute('aria-pressed', String(on));
		drawHighlight();
		if (isOpen()) render();
	}

	/* ── Mapping the preview to source ──────────────────────────────── */

	/** Where the current slide lives: { slideEl, path, ext, md: { from, to } | null, target }. */
	function slideSource(slideEl = probe.current()) {
		const annotated = slideEl.getAttribute('data-studio-src');
		if (annotated) {
			const [path, offset] = annotated.split(':');
			return { slideEl, path, ext: 'html', target: { kind: 'html', offset: Number(offset) } };
		}
		const outer = slideEl.hasAttribute('data-slug')
			? slideEl
			: slideEl.parentElement?.closest('section[data-slug]');
		const model =
			outer && host.deck().slides.find((s) => s.slug === outer.getAttribute('data-slug'));
		if (!model || model.ext !== 'md') return null;
		const local =
			outer === slideEl
				? 0
				: [...outer.children].filter((c) => c.tagName === 'SECTION').indexOf(slideEl);
		const subs = model.subslides;
		const sub = subs[Math.max(0, local)] || subs[0];
		const next = subs[subs.indexOf(sub) + 1];
		return {
			slideEl,
			path: model.path,
			ext: 'md',
			md: { from: sub.line, to: next ? next.line - 2 : Number.MAX_SAFE_INTEGER },
			target: { kind: 'md-slide', line: sub.line },
		};
	}

	function identity(elm, slideEl) {
		const d = probe.describe(elm);
		const same = [...slideEl.querySelectorAll(elm.tagName)].filter(
			(x) => probe.describe(x).text === d.text
		);
		return {
			slide: slideKey(slideEl),
			tag: d.tag,
			text: d.text,
			src: d.src,
			nth: same.indexOf(elm),
		};
	}

	// Reveal indices survive a preview reload; source offsets do not.
	function slideKey(slideEl) {
		const { h, v } = host.reveal().getIndices(slideEl);
		return `${h}.${v || 0}`;
	}

	function find(identityOf, slideEl = probe.current()) {
		if (!identityOf || identityOf.slide !== slideKey(slideEl)) return null;
		const same = [...slideEl.querySelectorAll(identityOf.tag)].filter(
			(x) => probe.describe(x).text === identityOf.text
		);
		return same[identityOf.nth] || null;
	}

	/** { path, target, warning } for an element, or throws a readable error. */
	async function elementSource(elm, slide = slideSource(elm.closest('section'))) {
		if (!slide) throw new Error('This slide has no source file the editor knows.');
		const buffer = await host.buffer(slide.path);
		if (slide.ext === 'html') {
			const src = elm.getAttribute('data-studio-src');
			if (!src)
				throw new Error(
					'This element is generated at runtime (a script or component), so it has no source tag to edit.'
				);
			const [path, offset] = src.split(':');
			const tag = parseStartTag(buffer.content, Number(offset));
			if (tag.name !== elm.tagName.toLowerCase()) throw stale();
			return { path, target: { kind: 'html', offset: Number(offset) }, warning: null };
		}
		const id = identity(elm, slide.slideEl);
		const line = findMdLine(buffer.content, slide.md.from, slide.md.to, id);
		if (!line) throw new Error('Could not find this element in the Markdown source.');
		return {
			path: slide.path,
			target: { kind: 'md', line },
			warning: mdPlacementWarning(buffer.content.split('\n')[line - 1]),
		};
	}

	const stale = () =>
		new Error('The preview is catching up with your edits. Try again in a moment.');
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	/**
	 * Waits until the preview shows the current buffers, so its data-studio-src
	 * offsets match the text being edited. Every edit reloads the preview.
	 */
	async function settle() {
		if (host.frameCurrent() && probe && host.reveal()) return;
		host.refreshPreview();
		const end = Date.now() + 10000;
		while (Date.now() < end) {
			await sleep(100);
			if (host.frameCurrent() && probe && host.reveal() && probe.current()) return;
		}
		throw stale();
	}

	/** The same element in the settled preview (it is a new document after a reload). */
	async function live(elm) {
		if (host.frameCurrent() && elm.isConnected) return elm;
		const id = identity(elm, elm.closest('section'));
		await settle();
		const found = find(id);
		if (!found) throw new Error('That element changed; pick it again.');
		return found;
	}

	function ensureCurrent() {
		if (!host.frameCurrent()) throw stale();
	}

	/**
	 * Applies [{ path, target, change }] grouped per file, in one undo step per file.
	 * The reloaded preview shows every step, unless `keepStep` (the camera tools
	 * edit the step you are looking at, so it stays on it).
	 */
	async function commit(edits, message, { keepStep = false } = {}) {
		const byPath = new Map();
		for (const edit of edits) {
			if (!byPath.has(edit.path)) byPath.set(edit.path, []);
			byPath.get(edit.path).push({ target: edit.target, change: edit.change });
		}
		for (const [path, list] of byPath) {
			const buffer = await host.buffer(path);
			await host.setContent(path, applyEdits(buffer.content, list));
		}
		if (message) toast(message);
		refresh({ keepStep });
	}

	/** Reloads the preview after an edit made outside commit(). */
	function refresh({ keepStep = false } = {}) {
		showAllSteps = !keepStep;
		host.refreshPreview();
	}

	// Edits run one at a time: each waits for the preview the previous one caused.
	let queue = Promise.resolve();
	const attempt =
		(fn) =>
		(...args) =>
			(queue = queue.then(async () => {
				try {
					await fn(...args);
				} catch (error) {
					toast(error.message, true);
				}
			}));

	/* ── Fragment structure ─────────────────────────────────────────── */

	/** Rewrites every fragment on the slide to explicit step indices from `plan` (arrays of elements). */
	async function writeSteps(plan, removed = [], message, effects = new Map()) {
		ensureCurrent();
		const edits = [];
		for (const [i, elements] of plan.filter((s) => s.length).entries()) {
			for (const elm of elements) {
				const src = await elementSource(elm);
				const current = readTarget((await host.buffer(src.path)).content, src.target);
				const effect = effects.get(elm) || fragmentOf(current).effect || 'fade-in';
				edits.push({ ...src, change: fragmentChange(current, { effect, index: i }) });
			}
		}
		for (const elm of removed) {
			const src = await elementSource(elm);
			edits.push({
				...src,
				change: unfragmentChange(readTarget((await host.buffer(src.path)).content, src.target)),
			});
		}
		await commit(edits, message);
	}

	const plan = () => probe.steps().map((s) => [...s.elements]);

	async function moveToStep(elm, stepIndex) {
		elm = await live(elm);
		const steps = plan().map((s) => s.filter((x) => x !== elm));
		if (stepIndex >= steps.length) steps.push([elm]);
		else steps[stepIndex].push(elm);
		await writeSteps(steps, [], null);
	}

	async function reorderStep(from, to) {
		await settle();
		const steps = plan();
		const [moved] = steps.splice(from, 1);
		steps.splice(to, 0, moved);
		await writeSteps(steps, [], null);
	}

	async function addElement() {
		await settle();
		const elm = await pick({ hint: 'Click an element to animate' });
		if (!elm) return;
		selected = identity(elm, probe.current());
		if (!elm.classList.contains('fragment')) {
			const src = await elementSource(elm);
			if (src.warning) toast(src.warning, true);
			const steps = plan();
			steps.push([elm]);
			await writeSteps(steps, [], 'Added as a new step');
		} else render();
	}

	async function setEffect(elm, effect) {
		elm = await live(elm);
		const src = await elementSource(elm);
		const current = readTarget((await host.buffer(src.path)).content, src.target);
		await commit([
			{ ...src, change: fragmentChange(current, { effect, index: fragmentOf(current).index }) },
		]);
	}

	async function removeFragment(elm) {
		elm = await live(elm);
		const steps = plan().map((s) => s.filter((x) => x !== elm));
		await writeSteps(steps, [elm], 'Removed from the animation');
	}

	/* ── Slide-level and element-level attributes ───────────────────── */

	async function setSlideAttrs(set, message) {
		await settle();
		const slide = slideSource();
		if (!slide) throw new Error('This slide has no source file the editor knows.');
		await commit([{ path: slide.path, target: slide.target, change: { set } }], message);
	}

	async function setElementAttrs(elm, set, message) {
		elm = await live(elm);
		const src = await elementSource(elm);
		await commit([{ ...src, change: { set } }], message);
	}

	async function slideAttrs() {
		const slide = slideSource();
		if (!slide) return null;
		return readTarget((await host.buffer(slide.path)).content, slide.target).attrs;
	}

	/** Gives an element an effect: changes it on a fragment, or adds a new last step. */
	async function animateAs(elm, effect) {
		elm = await live(elm);
		if (elm.classList.contains('fragment')) return setEffect(elm, effect);
		const src = await elementSource(elm);
		if (src.warning) toast(src.warning, true);
		const steps = plan();
		steps.push([elm]);
		await writeSteps(steps, [], `Animated with ${effect}`, new Map([[elm, effect]]));
	}

	async function toggleClass(elm, cls) {
		elm = await live(elm);
		const src = await elementSource(elm);
		const current = readTarget((await host.buffer(src.path)).content, src.target);
		const on = !current.classes.includes(cls);
		await commit([{ ...src, change: on ? { addClass: [cls] } : { removeClass: [cls] } }]);
	}

	/**
	 * Edits an element's text in the preview and writes it back: the tag's
	 * content in HTML, the line's text in Markdown (markers and comments kept).
	 */
	async function editText(elm) {
		elm = await live(elm);
		const src = await elementSource(elm);
		const text = (await host.buffer(src.path)).content;
		const write = (html) =>
			src.target.kind === 'html'
				? replaceInnerHtml(text, src.target.offset, html)
				: replaceMdText(text, src.target.line, html);
		write(elm.innerHTML); // refuses block content or multi-line paragraphs before editing starts
		const html = await probe.editInline(elm);
		if (html === null) return;
		await host.setContent(src.path, write(html));
		host.refreshPreview();
	}

	async function editTiming(elm) {
		elm = await live(elm);
		const src = await elementSource(elm);
		const { attrs } = readTarget((await host.buffer(src.path)).content, src.target);
		const body = el('div');
		const input = (name, label, placeholder) => {
			const node = el('input', 'input');
			node.type = 'number';
			node.min = '0';
			node.step = '0.1';
			node.placeholder = placeholder;
			node.value = attrs[name] ?? '';
			node.dataset.attr = name;
			body.append(el('label', null, label), node);
		};
		input('data-auto-animate-duration', 'Duration (seconds)', 'slide default');
		input('data-auto-animate-delay', 'Delay (seconds)', '0');
		const easing = el('select', 'input');
		easing.dataset.attr = 'data-auto-animate-easing';
		for (const value of ['', ...EASINGS]) {
			const option = el('option', null, value || 'slide default');
			option.value = value;
			easing.append(option);
		}
		easing.value = attrs['data-auto-animate-easing'] ?? '';
		body.append(el('label', null, 'Easing'), easing);
		host.dialog(`Auto-animate timing · <${elm.tagName.toLowerCase()}>`, body, [
			{ label: 'Cancel', run: (d) => d.close() },
			{
				label: 'Apply',
				primary: true,
				run: async (d) => {
					const set = {};
					for (const node of body.querySelectorAll('[data-attr]'))
						set[node.dataset.attr] = node.value || null;
					d.close();
					await attempt(setElementAttrs)(elm, set, 'Timing updated');
				},
			},
		]);
	}

	/* ── Right-click menus ──────────────────────────────────────────── */

	async function contextMenu({ element, slide, x, y }) {
		// A right-click on a preview that is about to reload: wait, then use the
		// same element in the new document.
		if (!host.frameCurrent()) {
			const id = element && identity(element, slide);
			await settle();
			slide = probe.current();
			element = id ? find(id) : null;
		}
		const deck = host.reveal();
		if (!deck || !probe) return;
		const state = await probe.autoAnimateState().catch(() => null);
		const attrs = (await slideAttrs().catch(() => null)) || {};
		// A chart in the slide: reopen the chart wizard on its block.
		const chart = element?.closest?.('deck-chart-vega');
		const chartItems = chart ? [{ label: 'Edit chart…', run: () => host.editChart(chart) }, { separator: true }] : [];
		const items = chart
			? [...chartItems, { label: 'Slide', items: slideItems(slide, attrs) }]
			: element
				? [
						...(await elementItems(element, state)),
						{ label: 'Slide', items: slideItems(slide, attrs) },
					]
				: slideItems(slide, attrs);
		openMenu(items, { x, y });
	}

	async function elementItems(elm, state) {
		let current;
		try {
			const src = await elementSource(elm);
			current = readTarget((await host.buffer(src.path)).content, src.target);
		} catch (error) {
			return [
				{ label: error.message, disabled: true },
				{ label: 'Show in source', run: () => select(elm) },
			];
		}
		const fragment = fragmentOf(current);
		const steps = probe.steps();
		const position = steps.findIndex((s) => s.elements.includes(elm));
		const paired =
			state?.incoming?.pairs.some((p) => p.to === elm) ||
			state?.outgoing?.pairs.some((p) => p.from === elm);
		const classes = host.catalog()
			? [...host.catalog().classes.deck, 'r-fit-text', 'r-stretch']
			: [];
		const d = probe.describe(elm);
		return [
			{ label: `<${d.tag}> ${d.text.slice(0, 32)}`, disabled: true },
			{
				label: 'Animate',
				hint: fragment.fragment ? fragment.effect : '',
				items: [
					...FRAGMENT_EFFECTS.map((effect) => ({
						label: effect,
						checked: fragment.fragment && fragment.effect === effect,
						run: attempt(() => animateAs(elm, effect)),
					})),
					{ separator: true },
					{
						label: 'Step',
						disabled: !fragment.fragment,
						items: [
							...steps.map((_, i) => ({
								label: `Step ${i + 1}`,
								checked: i === position,
								run: attempt(() => moveToStep(elm, i)),
							})),
							{ label: 'New last step', run: attempt(() => moveToStep(elm, steps.length)) },
						],
					},
					{
						label: 'Stop animating',
						disabled: !fragment.fragment,
						run: attempt(() => removeFragment(elm)),
					},
				],
			},
			{
				label: 'Auto-animate',
				items: [
					{ label: 'Link to next slide…', run: attempt(() => linkToNext(elm)) },
					{ label: 'Unlink', disabled: !paired, run: attempt(() => unlink(elm)) },
					{ label: 'Timing…', run: attempt(() => editTiming(elm)) },
					{
						label: 'Show morphs on this slide',
						checked: highlight,
						run: () => setHighlight(!highlight),
					},
				],
			},
			{
				label: 'Style',
				filter: true,
				disabled: !classes.length,
				items: classes.map((cls) => ({
					label: cls,
					checked: current.classes.includes(cls),
					hover: (on) => !current.classes.includes(cls) && probe.previewClass(elm, cls, on),
					run: attempt(() => toggleClass(elm, cls)),
				})),
			},
			{ label: 'Edit text', hint: 'double-click', run: attempt(() => editText(elm)) },
			{ separator: true },
			{ label: 'Show in source', run: () => select(elm) },
			{
				label: 'Open in timeline',
				run: () => {
					toggle(true);
					select(elm);
				},
			},
		];
	}

	function slideItems(slideEl, attrs) {
		const auto = 'data-auto-animate' in attrs;
		const transitions = ['', 'none', 'fade', 'slide', 'convex', 'concave', 'zoom'];
		const items = [
			{
				label: 'Transition',
				hint: attrs['data-transition'] || 'deck default',
				items: transitions.map((t) => ({
					label: t || 'deck default',
					checked: (attrs['data-transition'] || '') === t,
					run: attempt(() => setSlideAttrs({ 'data-transition': t || null })),
				})),
			},
			{
				label: 'Auto-animate',
				checked: auto,
				run: attempt(() =>
					setSlideAttrs(
						{ 'data-auto-animate': auto ? null : true },
						auto ? 'Auto-animate off' : 'Auto-animate on'
					)
				),
			},
			{ label: 'Make next rung', run: attempt(makeNextRung) },
		];
		const src = slideSource(slideEl);
		const model = src && host.deck().slides.find((s) => s.path === src.path);
		if (model) items.push({ separator: true }, ...host.slideCommands(model));
		return items;
	}

	/* ── Auto-animate tools ─────────────────────────────────────────── */

	async function linkToNext(elm) {
		elm = await live(elm);
		const here = probe.current();
		const { next } = probe.neighbours(here);
		if (!next) throw new Error('This is the last slide; there is nothing to link to.');
		const fromSrc = await elementSource(elm);
		const fromSlide = slideSource(here);
		const back = host.reveal().getIndices(here);
		host.quietSlide(host.reveal().getIndices(next));
		let target;
		try {
			target = await pick({
				color: '#7c3aed',
				hint: `Click the element <${elm.tagName.toLowerCase()}> should morph into`,
			});
		} finally {
			host.quietSlide(back);
		}
		if (!target) return;
		if (target.tagName !== elm.tagName)
			toast(
				`Reveal pairs by element type and data-id: <${elm.tagName.toLowerCase()}> and <${target.tagName.toLowerCase()}> will cross-fade, not morph.`,
				true
			);
		const toSrc = await elementSource(target);
		const toSlide = slideSource(next);
		const id =
			elm.getAttribute('data-id') ||
			target.getAttribute('data-id') ||
			slugify(probe.describe(elm).text) ||
			`el-${Date.now().toString(36)}`;
		const edits = [
			{ ...fromSrc, change: { set: { 'data-id': id } } },
			{ ...toSrc, change: { set: { 'data-id': id } } },
		];
		for (const slide of [fromSlide, toSlide]) {
			if (!slide.slideEl.hasAttribute('data-auto-animate'))
				edits.push({
					path: slide.path,
					target: slide.target,
					change: { set: { 'data-auto-animate': true } },
				});
		}
		await commit(edits, `Linked with data-id="${id}"`);
		if (!highlight) setHighlight(true);
	}

	async function unlink(elm) {
		elm = await live(elm);
		const state = await probe.autoAnimateState();
		const pairs = [
			...(state.incoming?.pairs || []).filter((p) => p.to === elm),
			...(state.outgoing?.pairs || []).filter((p) => p.from === elm),
		];
		if (!pairs.length) throw new Error('This element is not paired with a neighbouring slide.');
		const implicit = pairs.find((p) => p.how !== 'data-id');
		if (implicit)
			throw new Error(
				implicit.how === 'text'
					? 'Reveal pairs these automatically because their text is identical. Change the text on one slide (or use a different element) to stop the morph.'
					: 'Reveal pairs these automatically because they show the same source file.'
			);
		const edits = [];
		for (const p of pairs)
			for (const x of [p.from, p.to])
				edits.push({ ...(await elementSource(x)), change: { set: { 'data-id': null } } });
		await commit(edits, 'Unlinked');
	}

	async function makeNextRung() {
		await settle();
		const slide = slideSource();
		if (!slide) throw new Error('This slide has no source file the editor knows.');
		if (slide.ext === 'md') {
			const buffer = await host.buffer(slide.path);
			let text = applyEdits(buffer.content, [
				{ target: slide.target, change: { set: { 'data-auto-animate': true } } },
			]);
			const lines = text.split('\n');
			let end = lines.length;
			for (let i = slide.md.from; i < lines.length; i++)
				if (/^--\s*$/.test(lines[i])) {
					end = i;
					break;
				}
			let last = end;
			while (last > slide.md.from && !lines[last - 1].trim()) last--;
			const copy = lines.slice(slide.md.from - 1, last);
			lines.splice(last, 0, '', '--', '', ...copy);
			text = lines.join('\n');
			await host.setContent(slide.path, text);
			toast('Added the next rung as a vertical sub-slide');
			host.refreshPreview();
			return;
		}
		const model = host.deck().slides.find((s) => s.path === slide.path);
		const outer =
			slide.target.offset === 0 ||
			/^\s*$/.test((await host.buffer(slide.path)).content.slice(0, slide.target.offset));
		if (!model || !outer)
			throw new Error(
				'Make a rung from a whole slide file; nested HTML sections are copied by hand.'
			);
		await commit([
			{ path: slide.path, target: slide.target, change: { set: { 'data-auto-animate': true } } },
		]);
		await host.slideAction({ action: 'duplicate', file: model.file }, 'Added the next rung');
	}

	async function replay() {
		const deck = host.reveal();
		const here = probe.current();
		const { prev } = probe.neighbours(here);
		if (!prev) return toast('This is the first slide.', true);
		const to = deck.getIndices(here);
		host.quietSlide(deck.getIndices(prev), { autoAnimate: false });
		setTimeout(() => host.quietSlide(to), 120);
	}

	function play() {
		const deck = host.reveal();
		if (!deck) return;
		clearInterval(playing);
		const { h, v } = deck.getIndices();
		const total = probe.steps().length;
		host.quietSlide({ h, v, f: -1 });
		let shown = 0;
		playing = setInterval(() => {
			if (shown++ >= total) return clearInterval(playing);
			deck.nextFragment();
		}, 900);
	}

	function scrub(stepIndex) {
		const deck = host.reveal();
		clearInterval(playing);
		const { h, v } = deck.getIndices();
		host.quietSlide({ h, v, f: stepIndex });
	}

	/* ── Rendering ──────────────────────────────────────────────────── */

	function markStep() {
		const deck = host.reveal();
		const f = deck?.getIndices().f;
		panel()
			.querySelectorAll('.tl-step')
			.forEach((row) =>
				row.classList.toggle('shown', f !== undefined && Number(row.dataset.index) <= f)
			);
	}

	function chip(elm, extra = '') {
		const d = probe.describe(elm);
		// A div, not a button: step chips hold an effect <select>.
		const node = el('div', 'tl-chip' + extra);
		node.tabIndex = 0;
		node.setAttribute('role', 'button');
		node.onkeydown = (event) => {
			if (event.key === 'Enter' && event.target === node) select(elm);
		};
		node.append(el('code', null, `<${d.tag}>`), el('span', null, d.text || d.src || ''));
		node.title = d.text;
		const sel = selected && find(selected) === elm;
		if (sel) node.classList.add('selected');
		node.onclick = () => select(elm);
		node.onmouseenter = () => probe.draw([{ el: elm, color: '#f59e0b', fill: true }], 'hover');
		node.onmouseleave = () => probe.clear('hover');
		return node;
	}

	async function select(elm) {
		selected = identity(elm, probe.current());
		probe.flash(elm);
		try {
			const src = await elementSource(elm);
			if (src.target.kind === 'md') host.openAt(src.path, src.target.line);
			else
				host.openAt(
					src.path,
					(await host.buffer(src.path)).content.slice(0, src.target.offset).split('\n').length
				);
		} catch {}
		render();
	}

	function choice(options, value, onchange, label) {
		const node = el('select', 'input tl-select');
		node.setAttribute('aria-label', label);
		for (const [v, text] of options) {
			const o = el('option', null, text);
			o.value = v;
			node.append(o);
		}
		node.value = value ?? '';
		node.onchange = () => onchange(node.value);
		return node;
	}

	function field(label, input) {
		const wrap = el('label', 'tl-field');
		wrap.append(el('span', null, label), input);
		return wrap;
	}

	function numberInput(value, onchange, label, step = '0.1') {
		const node = el('input', 'input tl-number');
		node.type = 'number';
		node.min = '0';
		node.step = step;
		node.placeholder = 'default';
		node.value = value ?? '';
		node.setAttribute('aria-label', label);
		node.onchange = () => onchange(node.value === '' ? null : node.value);
		return node;
	}

	async function render() {
		const token = ++renderToken;
		const root = panel();
		const body = root.querySelector('.tl-body');
		if (!probe || !host.reveal()) {
			body.replaceChildren(el('p', 'inspector-note', 'Waiting for the preview…'));
			return;
		}
		const here = probe.current();
		const slide = slideSource(here);
		const deck = host.reveal();
		const { h, v } = deck.getIndices(here);
		const attrs = slide ? await slideAttrs().catch(() => ({})) : {};
		const state = await probe.autoAnimateState().catch(() => null);
		if (token !== renderToken) return;
		if (highlight) drawHighlight();
		root.querySelector('.tl-title').textContent =
			`ANIMATION · SLIDE ${h + 1}${v ? '.' + (v + 1) : ''}${slide ? ' · ' + slide.path : ''}`;

		const rows = el('div', 'tl-rows');
		const inspector = el('div', 'tl-inspector');

		// Arrive: transition + auto-animate
		const arrive = el('div', 'tl-row tl-arrive');
		arrive.append(el('div', 'tl-label', 'Arrive'));
		const controls = el('div', 'tl-lane');
		controls.append(
			field(
				'Transition',
				choice(
					TRANSITIONS.map((t) => [t, t || 'deck default']),
					attrs['data-transition'],
					attempt((value) => setSlideAttrs({ 'data-transition': value || null })),
					'Slide transition'
				)
			),
			field(
				'Speed',
				choice(
					[
						['', 'default'],
						['fast', 'fast'],
						['slow', 'slow'],
					],
					attrs['data-transition-speed'],
					attempt((value) => setSlideAttrs({ 'data-transition-speed': value || null })),
					'Transition speed'
				)
			)
		);
		const autoToggle = el('label', 'tl-switch');
		const autoInput = el('input');
		autoInput.type = 'checkbox';
		autoInput.checked = 'data-auto-animate' in attrs;
		autoInput.onchange = attempt(() =>
			setSlideAttrs(
				{ 'data-auto-animate': autoInput.checked ? true : null },
				autoInput.checked
					? 'Auto-animate on: matching elements morph between this slide and its auto-animate neighbours'
					: 'Auto-animate off'
			)
		);
		autoToggle.append(autoInput, el('span', null, 'Auto-animate'));
		controls.append(autoToggle);
		if ('data-auto-animate' in attrs) {
			controls.append(
				field(
					'Duration (s)',
					numberInput(
						attrs['data-auto-animate-duration'],
						attempt((value) => setSlideAttrs({ 'data-auto-animate-duration': value })),
						'Auto-animate duration'
					)
				),
				field(
					'Easing',
					choice(
						[['', 'default'], ...EASINGS.map((e) => [e, e])],
						attrs['data-auto-animate-easing'],
						attempt((value) => setSlideAttrs({ 'data-auto-animate-easing': value || null })),
						'Auto-animate easing'
					)
				)
			);
			const restart = el('label', 'tl-switch');
			const restartInput = el('input');
			restartInput.type = 'checkbox';
			restartInput.checked = 'data-auto-animate-restart' in attrs;
			restartInput.onchange = attempt(() =>
				setSlideAttrs({ 'data-auto-animate-restart': restartInput.checked ? true : null })
			);
			restart.title = 'Start a new auto-animate sequence here (no morph from the previous slide)';
			restart.append(restartInput, el('span', null, 'Restart'));
			controls.append(restart);
		}
		const replayButton = el('button', 'button ghost small', 'Replay arrival');
		replayButton.onclick = replay;
		const rung = el('button', 'button ghost small', 'Make next rung');
		rung.title = 'Copy this slide right after it with auto-animate on both - then change the copy';
		rung.onclick = attempt(makeNextRung);
		controls.append(replayButton, rung);
		arrive.append(controls);
		rows.append(arrive);
		rows.append(camera.renderRow(attrs));

		// Morphs from the previous slide (with per-element timing bars)
		if (state?.incoming || state?.outgoing) {
			const morphs = el('div', 'tl-row tl-morphs');
			morphs.append(el('div', 'tl-label', 'Morphs'));
			const lane = el('div', 'tl-lane');
			const duration = Number(attrs['data-auto-animate-duration'] || 1);
			for (const pair of state.incoming?.pairs || []) {
				const c = chip(pair.to, ' morph');
				const d = Number(pair.to.getAttribute('data-auto-animate-duration') || duration);
				const delay = Number(pair.to.getAttribute('data-auto-animate-delay') || 0);
				const bar = el('span', 'tl-bar');
				bar.style.setProperty('--start', String(delay / Math.max(duration, delay + d)));
				bar.style.setProperty('--length', String(d / Math.max(duration, delay + d)));
				bar.title = `${pair.how === 'data-id' ? 'data-id' : 'matched by ' + pair.how} · delay ${delay}s · ${d}s`;
				c.append(bar);
				lane.append(c);
			}
			if (state.incoming?.enters.length)
				lane.append(el('span', 'tl-note', `+ ${state.incoming.enters.length} fade in`));
			if (!state.incoming) lane.append(el('span', 'tl-note', 'No morph from the previous slide.'));
			if (state.outgoing)
				lane.append(
					el('span', 'tl-note', `→ ${state.outgoing.pairs.length} morph on to the next slide`)
				);
			morphs.append(lane);
			rows.append(morphs);
		}

		// Fragment steps
		const steps = probe.steps();
		steps.forEach((step, position) => {
			const row = el('div', 'tl-row tl-step');
			row.dataset.index = String(step.index);
			const head = el('button', 'tl-label tl-step-head', `Step ${position + 1}`);
			head.type = 'button';
			head.title = 'Click to show the slide at this step · drag to reorder';
			head.draggable = true;
			head.onclick = () => scrub(step.index);
			head.ondragstart = (event) =>
				event.dataTransfer.setData('application/x-step', String(position));
			const lane = el('div', 'tl-lane');
			for (const elm of step.elements) {
				const c = chip(elm);
				c.draggable = true;
				c.ondragstart = (event) => {
					event.dataTransfer.setData(
						'application/x-chip',
						String(steps.flatMap((s) => s.elements).indexOf(elm))
					);
				};
				const fx = choice(
					FRAGMENT_EFFECTS.map((e) => [e, e]),
					[...elm.classList].find((x) => FRAGMENT_EFFECTS.includes(x)) || 'fade-in',
					attempt((value) => setEffect(elm, value)),
					'Effect'
				);
				fx.onclick = (event) => event.stopPropagation();
				c.append(fx);
				lane.append(c);
			}
			row.append(head, lane);
			dropTarget(row, steps, position);
			rows.append(row);
		});
		const add = el('div', 'tl-row tl-new');
		add.append(el('div', 'tl-label', steps.length ? 'New step' : 'Steps'));
		const addLane = el('div', 'tl-lane');
		const addButton = el('button', 'button ghost small');
		addButton.append(icon('plus'), document.createTextNode(' Add an element from the preview'));
		addButton.onclick = attempt(addElement);
		addLane.append(
			addButton,
			el(
				'span',
				'tl-note',
				steps.length
					? 'or drop a chip here for a step of its own'
					: 'Fragments appear one step at a time.'
			)
		);
		add.append(addLane);
		dropTarget(add, steps, steps.length);
		rows.append(add);

		renderInspector(inspector, state);
		body.replaceChildren(rows, inspector);
		camera.syncChrome();
		markStep();
	}

	function dropTarget(row, steps, position) {
		row.ondragover = (event) => {
			const types = event.dataTransfer.types;
			if (
				types.includes('application/x-chip') ||
				(types.includes('application/x-step') && position < steps.length)
			) {
				event.preventDefault();
				row.classList.add('drop');
			}
		};
		row.ondragleave = () => row.classList.remove('drop');
		row.ondrop = attempt(async (event) => {
			event.preventDefault();
			row.classList.remove('drop');
			const chipIndex = event.dataTransfer.getData('application/x-chip');
			const stepIndex = event.dataTransfer.getData('application/x-step');
			if (chipIndex !== '')
				await moveToStep(steps.flatMap((s) => s.elements)[Number(chipIndex)], position);
			else if (stepIndex !== '' && Number(stepIndex) !== position)
				await reorderStep(Number(stepIndex), position);
		});
	}

	async function renderInspector(container, state) {
		const elm = find(selected);
		const pickButton = el(
			'button',
			'button ghost small tl-pick',
			elm ? 'Pick another element' : 'Pick in the preview'
		);
		pickButton.onclick = attempt(async () => {
			const picked = await pick();
			if (picked) select(picked);
		});
		if (!elm) {
			container.append(
				el('h3', null, 'ELEMENT'),
				el(
					'p',
					'inspector-note',
					'Pick an element - a chip here, or "Add an element" and click it in the preview - to set its effect, step and auto-animate pairing.'
				),
				pickButton
			);
			return;
		}
		container.append(pickButton);
		const d = probe.describe(elm);
		container.append(el('h3', null, `<${d.tag}> ${d.text.slice(0, 40)}`));
		let src;
		try {
			src = await elementSource(elm);
		} catch (error) {
			container.append(el('p', 'diagnostic-error', error.message));
			return;
		}
		const buffer = await host.buffer(src.path);
		const current = readTarget(buffer.content, src.target);
		const fragment = fragmentOf(current);
		if (src.warning) container.append(el('p', 'tl-warning', src.warning));

		const frag = el('div', 'tl-group');
		frag.append(el('h4', null, 'Step-by-step (fragment)'));
		if (fragment.fragment) {
			const steps = probe.steps();
			const position = steps.findIndex((s) => s.elements.includes(elm));
			frag.append(
				field(
					'Effect',
					choice(
						FRAGMENT_EFFECTS.map((e) => [e, e]),
						fragment.effect,
						attempt((value) => setEffect(elm, value)),
						'Effect'
					)
				),
				field(
					'Step',
					choice(
						[
							...steps.map((_, i) => [String(i), `Step ${i + 1}`]),
							[String(steps.length), 'New last step'],
						],
						String(position),
						attempt((value) => moveToStep(elm, Number(value))),
						'Step'
					)
				)
			);
			const remove = el('button', 'button ghost small', 'Stop animating');
			remove.onclick = attempt(() => removeFragment(elm));
			frag.append(remove);
		} else {
			const make = el('button', 'button primary small', 'Reveal this as a new step');
			make.onclick = attempt(async () => {
				const steps = plan();
				steps.push([elm]);
				await writeSteps(steps, [], 'Added as a new step');
			});
			frag.append(make);
		}
		container.append(frag);

		const auto = el('div', 'tl-group');
		auto.append(el('h4', null, 'Auto-animate'));
		const pairIn = state?.incoming?.pairs.find((p) => p.to === elm);
		const pairOut = state?.outgoing?.pairs.find((p) => p.from === elm);
		auto.append(
			el(
				'p',
				'inspector-note',
				pairIn || pairOut
					? [
							pairIn &&
								`Morphs in from the previous slide (${pairIn.how === 'data-id' ? 'data-id' : 'same ' + pairIn.how}).`,
							pairOut &&
								`Morphs on to the next slide (${pairOut.how === 'data-id' ? 'data-id' : 'same ' + pairOut.how}).`,
						]
							.filter(Boolean)
							.join(' ')
					: state?.incoming || state?.outgoing
						? 'Not paired: it fades in or out during the morph.'
						: 'This slide does not auto-animate with its neighbours. Linking turns it on.'
			)
		);
		const idInput = el('input', 'input');
		idInput.value = current.attrs['data-id'] || '';
		idInput.placeholder = 'no data-id';
		idInput.onchange = attempt(() =>
			setElementAttrs(elm, { 'data-id': idInput.value.trim() || null })
		);
		auto.append(field('data-id', idInput));
		const link = el('button', 'button ghost small', 'Link to next slide…');
		link.title = 'Click the matching element on the next slide; both get the same data-id';
		link.onclick = attempt(() => linkToNext(elm));
		const unlinkButton = el('button', 'button ghost small', 'Unlink');
		unlinkButton.disabled = !(pairIn || pairOut);
		unlinkButton.onclick = attempt(() => unlink(elm));
		const buttons = el('div', 'tl-buttons');
		buttons.append(link, unlinkButton);
		auto.append(
			buttons,
			field(
				'Duration (s)',
				numberInput(
					current.attrs['data-auto-animate-duration'],
					attempt((value) => setElementAttrs(elm, { 'data-auto-animate-duration': value })),
					'Element duration'
				)
			),
			field(
				'Delay (s)',
				numberInput(
					current.attrs['data-auto-animate-delay'],
					attempt((value) => setElementAttrs(elm, { 'data-auto-animate-delay': value })),
					'Element delay'
				)
			),
			field(
				'Easing',
				choice(
					[['', 'slide default'], ...EASINGS.map((e) => [e, e])],
					current.attrs['data-auto-animate-easing'],
					attempt((value) => setElementAttrs(elm, { 'data-auto-animate-easing': value || null })),
					'Element easing'
				)
			)
		);
		container.append(auto);
	}

	/** The toolbar's Camera button: open the timeline and show / hide the director overlay. */
	function cameraToggle() {
		if (!isOpen()) toggle(true);
		return camera.setDirector(!camera.directing());
	}

	function toggle(force) {
		const node = panel();
		node.hidden = force === undefined ? !node.hidden : !force;
		document.getElementById('timeline-toggle')?.classList.toggle('active', !node.hidden);
		if (!node.hidden) render();
		else {
			clearInterval(playing);
			probe?.clear('hover');
		}
		host.layout();
	}

	function wire() {
		const root = panel();
		root.querySelector('[data-tl="close"]').onclick = () => toggle(false);
		root.querySelector('[data-tl="play"]').onclick = play;
		root.querySelector('[data-tl="add"]').onclick = attempt(addElement);
		root.querySelector('[data-tl="highlight"]').onchange = (event) =>
			setHighlight(event.target.checked);
		root.querySelector('[data-tl="save"]').onclick = attempt(() => host.saveSlides());
	}
	wire();

	const camera = createCameraTools({
		host,
		el,
		icon,
		toast,
		api: {
			probe: () => probe,
			slideSource,
			elementSource,
			commit,
			refresh,
			attempt,
			settle,
			live,
			scrub,
			setSlideAttrs,
		},
	});

	return {
		cameraToggle,
		cameraActive: () => camera.directing(),
		onFrameReady,
		beforeShow,
		toggle,
		setHighlight: (on) => {
			panel().querySelector('[data-tl="highlight"]').checked = on;
			setHighlight(on);
		},
		highlight: () => highlight,
		render,
		contextMenu,
	};
}
