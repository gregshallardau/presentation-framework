/**
 * Camera tools for deck studio: see and aim the slide camera (docs/camera.md).
 *
 * Director view parks the real camera at home, so the preview shows the whole
 * slide, and draws what the camera sees on top:
 *   solid red, dimmed outside   the frame at the step on screen
 *   dashed amber, numbered      the frames of the other steps (the camera's path)
 *   dashed blue                 what a click on the element under the pointer would frame
 * Click an element to frame it, or drag a region to frame that; either writes a
 * `data-camera` cue on the step on screen. Camera view turns the overlay off and
 * the real camera back on, to see the move as the audience will.
 *
 * Everything is ordinary markup in the open buffers (undoable, previewed before
 * saving): a `data-camera` on a fragment of the step - or, for a step with nothing
 * to show, an empty cue fragment - and `data-camera` on the section for the start
 * view. Pure text edits are in camera-edit.js.
 *
 * `api` is what animate.js shares: the probe, source mapping, commit and queue.
 */
import { applyEdits } from './source-edit.js';
import {
	addHtmlCue,
	addMdCue,
	findMdCueLine,
	idBase,
	labelOf,
	removeHtmlCueFragment,
	setMdCue,
	specFromRegion,
	uniqueId,
	viewToRect,
} from './camera-edit.js';

const COLORS = { active: '#e11d48', path: '#d97706', hover: '#315de3' };
const DRAG_PX = 6;
const READY_MS = 4000;

const isCueOnly = (node) =>
	node.tagName === 'SPAN' &&
	node.classList.contains('fragment') &&
	node.hasAttribute('data-camera') &&
	!node.childNodes.length;

export function createCameraTools({ host, api, el, icon, toast }) {
	let win = null;
	let directing = false;
	let detach = () => {};

	const probe = () => api.probe();
	const ctl = () => win?.slideCamera || null;
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	/** The slide on screen, if it has a camera mounted. */
	function cameraSection() {
		const slide = probe()?.current();
		return slide?.matches('section[data-camera]') &&
			slide.querySelector(':scope > .camera-world')
			? slide
			: null;
	}

	/** { f, steps, step, position } - where the deck is in the slide's fragments. */
	function where() {
		const steps = probe().steps();
		const f = host.reveal()?.getIndices().f ?? -1;
		const position = f >= 0 ? steps.findIndex((s) => s.index === f) : -1;
		return { f, steps, position, step: position >= 0 ? steps[position] : null };
	}

	const cueOf = (step) => step?.elements.find((e) => e.hasAttribute('data-camera')) || null;

	/* ── Overlay ────────────────────────────────────────────────────── */

	function drawOverlay() {
		const p = probe();
		if (!p) return;
		p.clear('cam');
		const section = cameraSection();
		const c = ctl();
		if (!directing || !section || !c) return;

		const space = p.slideSpace(section);
		const { width, height } = c.size(section);
		const frame = (view) => space.toScreen(viewToRect(view, width, height));
		const { steps, position } = where();
		const now = c.current(section);
		const items = [];

		const start = c.view(section, section.getAttribute('data-camera'));
		if (start && now.cue) items.push({ rect: frame(start), color: COLORS.path, dashed: true, label: 'start' });
		steps.forEach((step, i) => {
			const cue = cueOf(step);
			if (!cue || cue === now.cue) return;
			const view = c.view(section, cue.getAttribute('data-camera'));
			if (view) items.push({ rect: frame(view), color: COLORS.path, dashed: true, label: String(i + 1) });
		});

		const view = c.view(section, now.spec);
		if (view) {
			const owner = now.cue ? steps.findIndex((s) => s.elements.includes(now.cue)) : -1;
			const who = !now.cue ? 'Start' : `${owner === position ? 'Step' : 'Holding step'} ${owner + 1}`;
			items.push({ rect: frame(view), color: COLORS.active, mask: true, label: `${who} · ${labelOf(now.spec)}` });
		}
		p.drawFrames(items, 'cam');
	}

	function hover(elm) {
		const p = probe();
		p.clear('cam-hover');
		const section = cameraSection();
		const c = ctl();
		if (!elm || !section || !c) return;
		const view = c.viewOfElement(section, elm);
		if (!view) return;
		const { width, height } = c.size(section);
		const space = p.slideSpace(section);
		const id = elm.getAttribute('id');
		p.drawFrames(
			[
				{
					rect: space.toScreen(viewToRect(view, width, height)),
					color: COLORS.hover,
					dashed: true,
					label: `click to frame ${id ? '#' + id : '<' + elm.tagName.toLowerCase() + '>'}`,
				},
			],
			'cam-hover'
		);
	}

	/* ── Writing cues ───────────────────────────────────────────────── */

	/**
	 * Sets the camera for the step on screen: a `data-camera` on one of its
	 * fragments (the one already carrying a cue, else the first), or the
	 * section's own when no fragment has been shown yet (the start view).
	 * `extra` are element edits that must land in the same change (an id).
	 */
	async function writeCue(spec, extra = []) {
		await api.settle();
		const section = cameraSection();
		if (!section) throw new Error('Turn the camera on for this slide first.');
		const slide = api.slideSource(section);
		if (!slide) throw new Error('This slide has no source file the editor knows.');
		const { step } = where();
		const message = `Camera: ${labelOf(spec)}`;

		if (!step) {
			const set = { 'data-camera': spec === 'home' ? true : spec };
			return api.commit(
				[...extra, { path: slide.path, target: slide.target, change: { set } }],
				message,
				{ keepStep: true }
			);
		}

		const cue = cueOf(step) || step.elements[0];
		if (slide.ext === 'md' && isCueOnly(cue)) {
			// a cue-only fragment in Markdown has no text to find it by: find its line
			const nth = [...section.querySelectorAll('span.fragment[data-camera]')]
				.filter(isCueOnly)
				.indexOf(cue);
			const buffer = await host.buffer(slide.path);
			const line = findMdCueLine(buffer.content, slide.md.from, slide.md.to, nth);
			if (!line) throw new Error('Could not find this camera step in the Markdown source.');
			let text = applyEdits(
				buffer.content,
				extra.filter((e) => e.path === slide.path).map(({ target, change }) => ({ target, change }))
			);
			text = setMdCue(text, line, spec);
			await host.setContent(slide.path, text);
			toast(message);
			return api.refresh({ keepStep: true });
		}

		const src = await api.elementSource(cue, slide);
		if (src.warning) toast(src.warning, true);
		return api.commit([...extra, { ...src, change: { set: { 'data-camera': spec } } }], message, {
			keepStep: true,
		});
	}

	/** An element becomes the target: it gets an id if it has none, and `#id` is the cue. */
	async function aimAtElement(elm) {
		await api.settle();
		elm = await api.live(elm);
		let id = elm.getAttribute('id');
		const extra = [];
		if (!id) {
			const taken = new Set([...win.document.querySelectorAll('[id]')].map((n) => n.id));
			id = uniqueId(idBase(probe().describe(elm).text, elm.tagName), taken);
			const src = await api.elementSource(elm);
			if (src.warning) toast(src.warning, true);
			extra.push({ ...src, change: { set: { id } } });
		}
		await writeCue(`#${id}`, extra);
	}

	async function aimAtRegion(region) {
		const section = cameraSection();
		const { width, height } = ctl().size(section);
		await writeCue(specFromRegion(region, width, height));
	}

	async function clearCue() {
		await api.settle();
		const section = cameraSection();
		const slide = section && api.slideSource(section);
		const { step } = where();
		if (!section || !slide) return;
		if (!step) {
			return api.commit(
				[{ path: slide.path, target: slide.target, change: { set: { 'data-camera': true } } }],
				'Camera: start view reset to home',
				{ keepStep: true }
			);
		}
		const cue = cueOf(step);
		if (!cue) return toast('This step has no camera move of its own.', true);

		if (isCueOnly(cue)) {
			const buffer = await host.buffer(slide.path);
			let text = null;
			if (slide.ext === 'html') {
				const src = await api.elementSource(cue, slide);
				text = removeHtmlCueFragment(buffer.content, src.target.offset);
			} else {
				const nth = [...section.querySelectorAll('span.fragment[data-camera]')]
					.filter(isCueOnly)
					.indexOf(cue);
				const line = findMdCueLine(buffer.content, slide.md.from, slide.md.to, nth);
				if (line) text = setMdCue(buffer.content, line, null);
			}
			if (text !== null) {
				await host.setContent(slide.path, text);
				toast('Removed the camera step');
				return api.refresh({ keepStep: false });
			}
		}
		const src = await api.elementSource(cue, slide);
		await api.commit([{ ...src, change: { set: { 'data-camera': null } } }], 'Camera move removed', {
			keepStep: true,
		});
	}

	/** A new step with nothing to show but a camera move, after the last one. */
	async function addCameraStep() {
		await api.settle();
		const section = cameraSection();
		const slide = section && api.slideSource(section);
		if (!slide) throw new Error('Turn the camera on for this slide first.');
		const spec = labelOf(ctl().current(section).spec);
		const buffer = await host.buffer(slide.path);
		const text =
			slide.ext === 'html'
				? addHtmlCue(buffer.content, slide.target.offset, spec)
				: addMdCue(buffer.content, slide.md.from, slide.md.to, spec);
		await host.setContent(slide.path, text);
		toast('Added a camera step. Click an element or drag a region to aim it.');
		api.refresh({ keepStep: false }); // lands on the last step: the new one
	}

	/* ── Aiming with the pointer ────────────────────────────────────── */

	function attachGestures() {
		detach();
		const doc = win.document;
		const p = probe();
		let down = null;
		let dragging = false;

		const sectionOf = (event) => {
			const section = cameraSection();
			return section && section.contains(event.target) ? section : null;
		};
		// the 16:9 frame that holds a dragged box, in slide px
		const region = (a, b, section) => {
			const space = p.slideSpace(section);
			const p0 = space.toSlide(a.x, a.y);
			const p1 = space.toSlide(b.x, b.y);
			return {
				x: Math.min(p0.x, p1.x),
				y: Math.min(p0.y, p1.y),
				w: Math.abs(p1.x - p0.x),
				h: Math.abs(p1.y - p0.y),
			};
		};
		const drawDrag = (box, section) => {
			const { width, height } = ctl().size(section);
			const spec = specFromRegion(box, width, height);
			const zoom = Number(/ ([\d.]+)x$/.exec(spec)[1]);
			const w = width / zoom;
			const cx = box.x + box.w / 2;
			const cy = box.y + box.h / 2;
			const rect = p.slideSpace(section).toScreen(viewToRect([cx, cy, w], width, height));
			p.drawFrames([{ rect, color: COLORS.active, mask: true, label: spec }], 'cam-drag');
		};

		const onDown = (event) => {
			if (event.button !== 0 || event.shiftKey) return;
			const section = sectionOf(event);
			if (!section) return;
			event.preventDefault();
			event.stopPropagation();
			down = { x: event.clientX, y: event.clientY, section, target: event.target };
			dragging = false;
		};
		const onMove = (event) => {
			if (!directing || !cameraSection()) return;
			if (!down) {
				const found = sectionOf(event) && p.selectable(doc.elementFromPoint(event.clientX, event.clientY));
				hover(found && cameraSection().contains(found) ? found : null);
				return;
			}
			if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > DRAG_PX) dragging = true;
			if (dragging) {
				hover(null);
				drawDrag(region(down, { x: event.clientX, y: event.clientY }, down.section), down.section);
			}
		};
		const onUp = (event) => {
			if (!down) return;
			const { section, target } = down;
			const box = dragging ? region(down, { x: event.clientX, y: event.clientY }, section) : null;
			down = null;
			dragging = false;
			p.clear('cam-drag');
			event.preventDefault();
			event.stopPropagation();
			if (box) {
				if (box.w > 4 && box.h > 4) api.attempt(aimAtRegion)(box);
				return;
			}
			const elm = p.selectable(target);
			if (elm && section.contains(elm)) api.attempt(aimAtElement)(elm);
		};
		// a link in a slide must not navigate while aiming
		const onClick = (event) => {
			if (sectionOf(event)) {
				event.preventDefault();
				event.stopPropagation();
			}
		};
		const onLeave = () => hover(null);

		doc.addEventListener('pointerdown', onDown, true);
		doc.addEventListener('pointermove', onMove, true);
		doc.addEventListener('pointerup', onUp, true);
		doc.addEventListener('click', onClick, true);
		doc.documentElement.addEventListener('pointerleave', onLeave);
		doc.documentElement.dataset.cameraAiming = 'true'; // a readiness signal for the browser test
		detach = () => {
			delete doc.documentElement.dataset.cameraAiming;
			doc.removeEventListener('pointerdown', onDown, true);
			doc.removeEventListener('pointermove', onMove, true);
			doc.removeEventListener('pointerup', onUp, true);
			doc.removeEventListener('click', onClick, true);
			doc.documentElement.removeEventListener('pointerleave', onLeave);
			p.clear('cam-hover');
			p.clear('cam-drag');
			detach = () => {};
		};
	}

	/* ── Director view on / off ─────────────────────────────────────── */

	/** Waits for the preview's camera (it loads just after Reveal is ready). */
	async function whenCamera() {
		const end = Date.now() + READY_MS;
		while (!ctl() && Date.now() < end) await sleep(60);
		return ctl();
	}

	async function applyDirector() {
		if (!win) return;
		if (!directing) {
			detach();
			ctl()?.director(false);
			probe()?.clear('cam');
			return;
		}
		const c = await whenCamera();
		if (!c || !directing) return syncChrome();
		c.director(true);
		attachGestures();
		syncChrome();
		drawOverlay();
	}

	function setDirector(on) {
		directing = on;
		document.getElementById('cam-toggle')?.classList.toggle('active', on);
		document.getElementById('cam-toggle')?.setAttribute('aria-pressed', String(on));
		return applyDirector();
	}

	/** Called for each freshly loaded preview. */
	function onFrameReady(frameWindow) {
		win = frameWindow;
		detach = () => {};
		const deck = frameWindow.Reveal;
		const redraw = () => {
			syncChrome();
			drawOverlay();
		};
		deck.on('fragmentshown', redraw);
		deck.on('fragmenthidden', redraw);
		deck.on('slidechanged', redraw);
		deck.on('slidetransitionend', redraw);
		frameWindow.addEventListener('resize', redraw);
		if (directing) applyDirector();
	}

	/* ── The timeline row ───────────────────────────────────────────── */

	let row = null;

	/** The "Camera" row of the timeline. `attrs` are the slide's own attributes. */
	function renderRow(attrs) {
		row = el('div', 'tl-row tl-camera');
		row.append(el('div', 'tl-label', 'Camera'));
		const lane = el('div', 'tl-lane');
		const on = 'data-camera' in attrs;

		const toggle = el('label', 'tl-switch');
		const box = el('input');
		box.type = 'checkbox';
		box.checked = on;
		box.onchange = api.attempt(() =>
			api.setSlideAttrs(
				{ 'data-camera': box.checked ? true : null },
				box.checked
					? 'Camera on: fragments with data-camera now move it'
					: 'Camera off for this slide'
			)
		);
		toggle.append(box, el('span', null, 'Camera'));
		toggle.title = 'Move a camera over this slide, cued by fragments';
		lane.append(toggle);

		if (!on) {
			lane.append(
				el('span', 'tl-note', 'Turn on to push in, pan and pull back over this slide, one step at a time.')
			);
			row.append(lane);
			return row;
		}

		const view = el('div', 'tl-seg');
		view.setAttribute('role', 'group');
		for (const [value, label, hint] of [
			[true, 'Director view', 'Show the whole slide with the camera frames drawn on it'],
			[false, 'Camera view', 'Show what the audience sees'],
		]) {
			const b = el('button', 'tl-seg-button', label);
			b.type = 'button';
			b.title = hint;
			b.dataset.director = String(value);
			b.onclick = () => setDirector(value);
			view.append(b);
		}
		lane.append(view);

		const chips = el('div', 'tl-cam-chips');
		chips.dataset.role = 'chips';
		lane.append(chips);

		const target = el('input', 'input tl-cam-target');
		target.dataset.role = 'target';
		target.placeholder = '#id  ·  25% 30% 2x  ·  revealed  ·  home';
		target.setAttribute('aria-label', 'Camera target for this step');
		target.title = 'The camera target for the step on screen. Enter to apply.';
		target.onkeydown = (event) => {
			event.stopPropagation();
			if (event.key === 'Enter') {
				const spec = target.value.trim() || 'home';
				const section = cameraSection();
				if (section && ctl() && !ctl().view(section, spec))
					return toast(`Nothing on the slide matches "${spec}".`, true);
				api.attempt(() => writeCue(spec))();
			}
		};
		const home = el('button', 'button ghost small', 'Home');
		home.title = 'Frame the whole slide at this step';
		home.onclick = api.attempt(() => writeCue('home'));
		const revealed = el('button', 'button ghost small', 'Revealed');
		revealed.title = 'Frame everything shown so far: the camera follows the reveal, widening as each step adds more';
		revealed.onclick = api.attempt(() => writeCue('revealed'));
		const clear = el('button', 'button ghost small', 'Clear');
		clear.title = 'Remove this step’s camera move (the camera holds the previous framing)';
		clear.onclick = api.attempt(clearCue);
		const add = el('button', 'button ghost small');
		add.append(icon('plus'), document.createTextNode(' Camera step'));
		add.title = 'Add a step that only moves the camera';
		add.onclick = api.attempt(addCameraStep);
		lane.append(target, home, revealed, clear, add);

		lane.append(
			el('span', 'tl-note', 'Click an element, or drag a region, on the slide to aim the camera at this step.')
		);
		row.append(lane);
		syncChrome();
		return row;
	}

	/** Keeps the row (chips, target field, view toggle) in step with the deck. */
	function syncChrome() {
		if (!row?.isConnected || !probe() || !host.reveal()) return;
		for (const b of row.querySelectorAll('.tl-seg-button'))
			b.classList.toggle('active', (b.dataset.director === 'true') === directing);

		const section = cameraSection();
		const c = ctl();
		const chips = row.querySelector('[data-role="chips"]');
		const target = row.querySelector('[data-role="target"]');
		if (!chips || !target) return;
		const { steps, position } = where();
		const now = section && c ? c.current(section) : { spec: '', cue: null };

		const make = (label, spec, own, index, active) => {
			const b = el('button', 'tl-cam-chip' + (active ? ' active' : '') + (own ? ' has-cue' : ''));
			b.type = 'button';
			b.append(el('b', null, label), el('span', null, own ? labelOf(spec) : 'holds'));
			b.title = own ? `${label}: ${spec || 'home'}` : `${label}: no camera move, the camera holds`;
			b.onclick = () => api.scrub(index);
			return b;
		};
		chips.replaceChildren(
			make('Start', section?.getAttribute('data-camera') || '', true, -1, position < 0),
			...steps.map((step, i) => {
				const cue = cueOf(step);
				return make(`Step ${i + 1}`, cue?.getAttribute('data-camera'), !!cue, step.index, i === position);
			})
		);
		if (document.activeElement !== target) target.value = labelOf(now.spec);
	}

	return { renderRow, onFrameReady, setDirector, syncChrome, directing: () => directing };
}
