// components/zoom-story/index.js
// <deck-zoom-story> - camera-driven data storytelling. Start close on one idea,
// pull back as it grows, regroup it, push back in.
//
// The world is drawn ONCE at fixed coordinates (layout.js) and never moves; a
// camera (src/lib/camera.js) frames it. Each beat is a pure function of its
// number (model.js: state(n) = replay(beats[0..n])), stepped by Reveal
// fragments the component injects into its own slide - so a story can also be
// split across slides (`beats="0-4"` here, a chart slide, `beats="4-8"` next)
// and every part opens exactly where the last one ended.
//
//   <deck-zoom-story story="balance-demo" class="r-stretch"></deck-zoom-story>
//   <deck-zoom-story class="r-stretch"><script type="application/json">{...}</script></deck-zoom-story>
//
// Views: balance (seesaw), bars (stacked columns), tree - see views/.
// Attributes: story (name of a /stories/<name>.js|json file), beats ("from-to",
// default all), label (aria-label), height (stage height in slide px when not
// r-stretch). Panels: light-DOM children with data-panel="<id>" are placed in
// the world (story.panels) and the camera can fly to them. Captions: any
// element in the slide with data-beat="<n>" appears on beat n.
// Authoring guide: components/zoom-story/README.md.
import { DeckElement } from '@/components/deck-element.js';
import { SHARED_STYLES } from '@/components/shared-styles.js';
import { d3 } from '@/lib/d3.js';
import { makeCamera, fitView } from '@/lib/camera.js';
import { watchSection } from '@/lib/reveal-steps.js';
import { normalise, replay, select, isVisible } from './model.js';
import { layout, placePanels, rectOf } from './layout.js';
import { balance } from './views/balance.js';
import { tree } from './views/tree.js';
import { bars } from './views/bars.js';

const VIEWS = { balance, tree, bars };

// Deck-level story files, auto-discovered like the component registry:
// saving /stories/<name>.js (default export) or <name>.json is the whole step.
const STORIES = Object.fromEntries(
	Object.entries(import.meta.glob('/stories/*.{js,json}', { eager: true, import: 'default' }))
		.map(([path, mod]) => [path.split('/').pop().replace(/\.(js|json)$/, ''), mod]),
);

const UP = /^(raise|increase|up|more|grow|add)/i;
const SVG_NS = 'http://www.w3.org/2000/svg';

class DeckZoomStory extends DeckElement {
	static tag = 'deck-zoom-story';

	static styles = `
		${SHARED_STYLES}
		:host { position: relative; aspect-ratio: 16 / 9; }
		:host(.r-stretch), :host([height]) { aspect-ratio: auto; }
		/* r-stretch writes an inline full-slide width that ignores the section's
		   padding; a shadow !important outranks it so the stage fits the content box */
		:host(.r-stretch) { width: auto !important; }
		.stage { position: absolute; inset: 0; overflow: hidden; }
		.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; --ts: 1; }
		svg.decor { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; }

		.seesaw { opacity: 0; transition: opacity var(--motion-hero-duration) var(--motion-hero-ease); }
		.seesaw.on { opacity: 1; }
		.fulcrum, .pivot { fill: var(--muted); }
		.ground { stroke: var(--line); stroke-width: 4; stroke-linecap: round; }
		.beam rect { fill: var(--fg); }
		.readout { fill: var(--muted); font-family: var(--font-body); font-size: 30px; text-anchor: middle; }

		.link {
			fill: none; stroke: var(--muted); stroke-width: 3; opacity: 0;
			transition: opacity var(--motion-hero-duration) var(--motion-hero-ease);
		}
		.link.on { opacity: 0.55; }

		.card {
			position: absolute; left: 0; top: 0;
			opacity: 0; pointer-events: none;
			transform: translate(var(--hx), var(--hy)) scale(0.3);
			transition:
				transform var(--motion-hero-duration) var(--motion-hero-ease),
				opacity var(--motion-hero-duration) var(--motion-hero-ease);
		}
		.card.on { opacity: 1; pointer-events: auto; transform: translate(var(--x), var(--y)); }
		/* anchors ride the beam: their position is set every tilt frame */
		.card.anchor { transform: translate(var(--x), var(--y)); transition: opacity var(--motion-hero-duration) var(--motion-hero-ease); }
		.face {
			box-sizing: border-box; width: 100%; height: 100%;
			display: flex; flex-direction: column; align-items: center; justify-content: center;
			border: 3px solid var(--c, var(--line));
			border-radius: var(--radius-card);
			background: color-mix(in srgb, var(--c, var(--muted)) 14%, var(--bg));
			transform: scale(var(--ts));
			font-family: var(--font-body);
			line-height: 1.1;
		}
		.label { color: var(--muted); font-size: 24px; }
		.value { color: var(--fg); font-size: 40px; font-weight: 700; font-variant-numeric: tabular-nums; }
		.anchor .label { font-size: 28px; }
		.anchor .value { font-size: 52px; }

		.hint {
			position: absolute; left: 50%; opacity: 0;
			color: var(--c, var(--primary)); font: 600 26px var(--font-body); white-space: nowrap;
			transform: translateX(-50%) scale(var(--ts));
			transition: opacity var(--motion-ui-duration) var(--motion-ui-ease);
		}
		.hint.up { bottom: 100%; margin-bottom: 0.5em; }
		.hint.down { top: 100%; margin-top: 0.5em; }
		.hint.on { opacity: 1; }

		.panel {
			position: absolute; left: 0; top: 0; opacity: 0; pointer-events: none;
			transition: opacity var(--motion-hero-duration) var(--motion-hero-ease);
		}
		.panel.on { opacity: 1; pointer-events: auto; }
		::slotted(*) { width: 100%; }

		/* bars: segments resize with their values and slide in/out of their parent's column */
		.bars .card { transition-property: transform, opacity, width, height; }
		.bars .card { transform: translate(var(--hx), var(--hy)); }
		.bars .card.on { transform: translate(var(--x), var(--y)); }
		.bars .face { transform: none; border-radius: var(--radius-control); }
		.bars .card.thin .face { flex-direction: row; gap: 0.4em; }
		.bars .card.thin .label, .bars .card.thin .value { font-size: 22px; }
		.bars .card.tiny .face > * { display: none; }
		.level { stroke: var(--fg); stroke-width: 3; stroke-dasharray: 10 8; opacity: 0; transition: opacity var(--motion-hero-duration) var(--motion-hero-ease); }
		.level.on { opacity: 0.6; }

		.world.instant, .world.instant * { transition: none !important; }
		.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
		@media (prefers-reduced-motion: reduce) {
			.card, .link, .panel, .seesaw, .hint { transition: none; }
		}
	`;

	/* ---------------------------------------------------------------- setup */

	render() {
		this._model = normalise(this._readStory());
		const m = this._model;
		this._view = VIEWS[m.root.view] ?? tree;
		this._fmt = formatter(m.format);
		const [from, to] = this._range();
		this._from = from;
		this._to = to;

		// world geometry: rest positions (θ = 0) for everything
		this._pos = layout(m, (side) => this._view.anchor(side, 0), this._view.reach);
		this._panels = placePanels(m, this._pos);
		this._theta = 0;
		this._beat = null;

		if (this.hasAttribute('height')) this.style.height = `${Number(this.getAttribute('height'))}px`;
		this._build();
		this._injectFragments();

		this._camera = makeCamera(({ k, tx, ty }) => {
			this._world.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
			this._world.style.setProperty('--ts', String(Math.min(1.4, Math.max(1, 1 / k))));
		}, () => ({ width: this._stage.clientWidth, height: this._stage.clientHeight }));

		this._ro = new ResizeObserver(() => {
			if (!this._stage.clientWidth) return;
			if (this._state) this._camera.zoomTo(this._target(this._state));
		});
		this._ro.observe(this._stage);

		this._go(from, false);
		this._unwatch = watchSection(this, ({ animate }) => this._go(this._beatFromDom(), animate));
	}

	connectedCallback() {
		super.connectedCallback();
		// Reveal relocates slide nodes: re-attach what disconnectedCallback dropped.
		if (this._upgraded && !this._unwatch) {
			this._ro.observe(this._stage);
			this._unwatch = watchSection(this, ({ animate }) => this._go(this._beatFromDom(), animate));
		}
	}

	disconnectedCallback() {
		this._unwatch?.();
		this._unwatch = null;
		this._ro?.disconnect();
		this._camera?.stop();
		this._tilt?.stop();
	}

	_readStory() {
		const name = this.getAttribute('story');
		if (name) {
			if (STORIES[name]) return STORIES[name];
			console.warn(`[deck-zoom-story] no /stories/${name}.js or .json`);
			return { nodes: {} };
		}
		const script = this.querySelector(':scope > script[type="application/json"]');
		try {
			return JSON.parse(script?.textContent || '{}');
		} catch (e) {
			console.warn('[deck-zoom-story] inline story is not valid JSON', e);
			return { nodes: {} };
		}
	}

	_range() {
		const last = this._model.beats.length - 1;
		const [a, b] = (this.getAttribute('beats') || '').split('-').map((s) => s.trim());
		const from = clamp(a === '' || a == null ? 0 : Number(a), 0, last);
		const to = clamp(b === '' || b == null ? last : Number(b), from, last);
		return [from, to];
	}

	_build() {
		const m = this._model;
		this._stage = el('div', 'stage');
		this._stage.setAttribute('role', 'figure');
		this._stage.setAttribute('aria-label', this.getAttribute('label') || 'zoom story');
		this._world = el('div', `world ${m.root.view}`);
		this._stage.append(this._world);

		const svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('class', 'decor');
		svg.setAttribute('aria-hidden', 'true');
		this._links = document.createElementNS(SVG_NS, 'g');
		this._seesaw = document.createElementNS(SVG_NS, 'g');
		this._seesaw.setAttribute('class', 'seesaw');
		this._view.mount(this._seesaw);
		svg.append(this._links, this._seesaw);
		this._world.append(svg);

		this._cards = new Map();
		this._linkEls = new Map();
		const tones = { [-1]: 'primary', 1: 'warning' };
		for (const n of m.nodes.values()) {
			const p = this._pos.get(n.id);
			if (!p) continue;
			// colour: SHARED_STYLES modifiers (.primary/.warning/...) set --c
			const card = el('div', `card ${n.tone || tones[n.side] || 'primary'}`);
			if (n.depth === 0 && this._view.tilts) card.classList.add('anchor');
			card.style.width = `${p.w}px`;
			card.style.height = `${p.h}px`;
			const parent = n.parent ? this._pos.get(n.parent) : p;
			// --x/--y = where it sits; --hx/--hy = where it hides (folded into its parent)
			setXY(card, '--x', '--y', p);
			setXY(card, '--hx', '--hy', parent);
			card.innerHTML = `<div class="hint up"></div><div class="face"><span class="label"></span><span class="value"></span></div><div class="hint down"></div>`;
			card.querySelector('.label').textContent = n.label;
			this._cards.set(n.id, card);
			this._world.append(card);

			if (n.parent && this._view.links) {
				const path = document.createElementNS(SVG_NS, 'path');
				path.setAttribute('class', 'link');
				this._links.append(path);
				this._linkEls.set(n.id, path);
			}
		}

		this._panelEls = new Map();
		for (const [id, r] of this._panels) {
			const panel = el('div', 'panel');
			panel.style.width = `${r.w}px`;
			panel.style.height = `${r.h}px`;
			panel.style.transform = `translate(${r.x - r.w / 2}px, ${r.y - r.h / 2}px)`;
			const slot = document.createElement('slot');
			slot.name = `panel-${id}`;
			panel.append(slot);
			this._panelEls.set(id, panel);
			this._world.append(panel);
		}
		for (const child of this.querySelectorAll(':scope > [data-panel]')) {
			child.slot = `panel-${child.dataset.panel}`;
		}

		this._live = el('p', 'sr');
		this._live.setAttribute('aria-live', 'polite');
		this.shadowRoot.append(this._stage, this._live);
		this._placeLinks(0);
	}

	/** One empty marker fragment per beat after the first, plus data-beat captions. */
	_injectFragments() {
		for (let b = this._from + 1; b <= this._to; b++) {
			const mark = el('span', 'fragment zs-beat');
			mark.setAttribute('aria-hidden', 'true');
			mark.dataset.fragmentIndex = String(b - this._from - 1);
			this.append(mark);
		}
		const section = this.closest('section');
		for (const cap of section?.querySelectorAll('[data-beat]') || []) {
			const b = Number(cap.dataset.beat);
			if (!(b > this._from && b <= this._to)) continue;
			cap.classList.add('fragment');
			cap.dataset.fragmentIndex = String(b - this._from - 1);
		}
		if (window.Reveal?.isReady?.()) window.Reveal.syncFragments?.();
	}

	_beatFromDom() {
		return this._from + this.querySelectorAll(':scope > .zs-beat.visible').length;
	}

	/* ---------------------------------------------------------------- beats */

	_go(n, animate) {
		if (n === this._beat && this._state) return;
		const m = this._model;
		const s = replay(m, n);
		this._state = s;
		this._beat = n;

		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const dur = animate && !reduced ? this._dur() : 0;
		if (!dur) {
			this._world.classList.add('instant');
			requestAnimationFrame(() => requestAnimationFrame(() => this._world.classList.remove('instant')));
		}

		const hints = new Map(s.hints.map((h) => [h.id, h.dir]));
		for (const [id, card] of this._cards) {
			card.classList.toggle('on', isVisible(m, s, id));
			card.querySelector('.value').textContent = this._fmt(s.values.get(id));
			const dir = hints.get(id);
			const up = card.querySelector('.hint.up');
			const down = card.querySelector('.hint.down');
			up.classList.toggle('on', !!dir && UP.test(dir));
			down.classList.toggle('on', !!dir && !UP.test(dir));
			if (dir) (UP.test(dir) ? up : down).textContent = `${UP.test(dir) ? '▲' : '▼'} ${dir}`;
		}
		for (const [id, path] of this._linkEls) path.classList.toggle('on', isVisible(m, s, id));
		for (const [id, panel] of this._panelEls) panel.classList.toggle('on', s.shown.has(id) && !s.hidden.has(id));
		if (this._view.place) this._placeAll(s.values);
		this._seesaw.classList.toggle('on', s.shown.has('root'));
		const readout = this._seesaw.querySelector('.readout');
		if (readout) readout.textContent = this._view.readout(m, s.values, this._fmt);

		this._tiltTo(this._view.tilt(m, s.values), dur);
		const target = this._target(s);
		if (dur) this._camera.easeTo(target, { duration: dur });
		else this._camera.zoomTo(target);

		this._live.textContent = this._describe(s);
	}

	/** Camera view for a state: resolved against the snapshot of the beat that cued it. */
	_target(s) {
		const m = this._model;
		const snap = s.camera.snapshot;
		const theta = this._view.tilt(m, snap.values);
		const ids = s.camera.spec === 'auto'
			? [
				...[...m.nodes.keys()].filter((id) => isVisible(m, snap, id)),
				...[...m.panels.keys()].filter((id) => snap.shown.has(id) && !snap.hidden.has(id)),
				...(snap.shown.has('root') ? ['root'] : []),
			]
			: select(m, s.camera.spec);
		const rectsAt = (values, th) => {
			const geom = this._geom(values, th);
			const panels = placePanels(m, geom);
			return ids.map((id) => {
				if (id === 'root') return this._view.rect(th, m, values);
				const p = panels.get(id) ?? geom.get(id);
				return p ? rectOf(p) : null;
			}).filter(Boolean);
		};
		const width = this._stage.clientWidth || 16;
		const height = this._stage.clientHeight || 9;
		const opts = { pad: m.camera.pad, aspect: width / height, minW: width / m.camera.maxZoom };
		const held = rectsAt(snap.values, theta);
		const view = fitView(held, opts);
		// The camera holds - unless holding would crop what it framed (a bar
		// grew, the seesaw tipped): then it widens just enough, like the
		// word-association slide's "only as much as the next word forces".
		const now = rectsAt(s.values, this._view.tilt(m, s.values));
		return now.every((r) => inside(r, view, width / height)) ? view : fitView([...held, ...now], opts);
	}

	/** Node centre-rects for these values: a view's own place(), or the fixed
	 *  layout with each anchor riding the seesaw at tilt θ. */
	_geom(values, theta) {
		if (this._view.place) return this._view.place(this._model, values);
		const pos = new Map(this._pos);
		for (const side of this._model.sides) {
			pos.set(side.id, { ...this._pos.get(side.id), ...this._view.anchor(side, theta) });
		}
		return pos;
	}

	/** place() views: every card, panel and the decor follow this beat's values. */
	_placeAll(values) {
		const m = this._model;
		const geom = this._geom(values, 0);
		for (const [id, card] of this._cards) {
			const p = geom.get(id);
			const n = m.nodes.get(id);
			const parent = n.parent ? geom.get(n.parent) : p;
			card.style.width = `${p.w}px`;
			card.style.height = `${p.h}px`;
			setXY(card, '--x', '--y', p);
			// hidden = folded into the parent's column, at its own height
			setXY(card, '--hx', '--hy', { ...p, x: parent.x });
			card.classList.toggle('thin', p.h < 84);
			card.classList.toggle('tiny', p.h < 30);
		}
		for (const [id, r] of placePanels(m, geom)) {
			const panel = this._panelEls.get(id);
			panel.style.width = `${r.w}px`;
			panel.style.height = `${r.h}px`;
			panel.style.transform = `translate(${r.x - r.w / 2}px, ${r.y - r.h / 2}px)`;
		}
		this._view.decorate?.(this._seesaw, m, values, geom);
	}

	/* ------------------------------------------------------------- the tilt */

	_tiltTo(target, dur) {
		this._tilt?.stop();
		const from = this._theta;
		if (!dur || from === target) { this._placeLinks(target); return; }
		const ease = d3.easeCubicInOut;
		this._tilt = d3.timer((elapsed) => {
			const t = Math.min(1, elapsed / dur);
			this._placeLinks(from + (target - from) * ease(t));
			if (t === 1) this._tilt.stop();
		});
	}

	/** Per tilt frame: beam, anchor cards, and every connector. */
	_placeLinks(theta) {
		this._theta = theta;
		this._view.update(this._seesaw, theta);
		if (!this._view.tilts && !this._linkEls.size) return;
		const live = this._geom(this._state?.values, theta);
		if (this._view.tilts) {
			for (const side of this._model.sides) {
				const card = this._cards.get(side.id);
				setXY(card, '--x', '--y', live.get(side.id));
				setXY(card, '--hx', '--hy', live.get(side.id));
			}
		}
		for (const [id, path] of this._linkEls) {
			const n = this._model.nodes.get(id);
			const c = live.get(id);
			const p = live.get(n.parent);
			const dir = n.side ?? 1;
			const x0 = p.x + (dir * p.w) / 2;
			const x1 = c.x - (dir * c.w) / 2;
			const mx = (x0 + x1) / 2;
			path.setAttribute('d', `M${x0},${p.y} C${mx},${p.y} ${mx},${c.y} ${x1},${c.y}`);
		}
	}

	/* ------------------------------------------------------------ utilities */

	_dur() {
		const raw = this.cssVar('--motion-hero-duration');
		const v = parseFloat(raw);
		if (!Number.isFinite(v)) return 900;
		// camera moves read better a touch slower than a UI transition
		return Math.max(900, raw.endsWith('ms') ? v : v * 1000);
	}

	_describe(s) {
		const m = this._model;
		const vis = [...m.nodes.values()].filter((n) => isVisible(m, s, n.id));
		const parts = vis.map((n) => `${n.label} ${this._fmt(s.values.get(n.id))}`);
		const r = s.shown.has('root') ? this._view.readout(m, s.values, this._fmt) : '';
		return [parts.join(', '), r].filter(Boolean).join('. ');
	}
}

function el(tag, cls) {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	return e;
}

function setXY(node, kx, ky, p) {
	node.style.setProperty(kx, `${p.x - p.w / 2}px`);
	node.style.setProperty(ky, `${p.y - p.h / 2}px`);
}

/** Is a world rect within a view [cx, cy, w] on a stage of this aspect? */
function inside(r, [cx, cy, w], aspect) {
	const h = w / aspect;
	const e = 1;   // tolerance, world units
	return r.x >= cx - w / 2 - e && r.x + r.w <= cx + w / 2 + e
		&& r.y >= cy - h / 2 - e && r.y + r.h <= cy + h / 2 + e;
}

function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}

function formatter({ prefix = '', suffix = '', decimals = 0, locale } = {}) {
	const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
	return (v) => (v == null || !Number.isFinite(v) ? '' : `${v < 0 ? '−' : ''}${prefix}${nf.format(Math.abs(v))}${suffix}`);
}

customElements.define(DeckZoomStory.tag, DeckZoomStory);
