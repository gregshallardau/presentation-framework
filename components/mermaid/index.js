// components/mermaid/index.js
// A Mermaid diagram, drawn in the browser by the real Mermaid library and styled to
// match md-doc-pipeline's diagrams (same colour recipe, rounded boxes, orthogonal
// ELK edge routing), themed from the deck's custom properties.
//
//   .md slide   a fenced ```mermaid block   (```mermaid steps  to step it)
//   .html slide <deck-mermaid steps label="..."><script type="text/mermaid">flowchart LR ...</script></deck-mermaid>
//
// Mermaid is NOT used for data charts here - use <deck-chart-vega>.
// Lives in the LIGHT DOM (no shadow root) so Reveal can see the
// `.fragment` elements `steps` adds: each node appears in source order, with the
// edge that leads into it.
import { readTokens } from '@/lib/vega.js';

const SLIDE_FONT_PX = 24; // md-doc draws labels at 12px; a 1920px slide is ~2x a page column

function mix(a, b, f) {
	const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const ra = p(a), rb = p(b);
	return '#' + ra.map((v, i) => Math.round(v + (rb[i] - v) * f).toString(16).padStart(2, '0')).join('');
}

function luminance(hex) {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

let seq = 0;
let mermaidPromise;
// ELK (orthogonal edge routing, like md-doc's renderer) is fetched with Mermaid, on first use.
const loadMermaid = () =>
	(mermaidPromise ??= Promise.all([import('mermaid'), import('@mermaid-js/layout-elk')]).then(([m, elk]) => {
		m.default.registerLayoutLoaders(elk.default);
		return m.default;
	}));

class DeckMermaid extends HTMLElement {
	static tag = 'deck-mermaid';

	connectedCallback() {
		if (this._source === undefined) {
			// `src` attribute (what Markdown fences become) or an inline <script type="text/mermaid">
			const script = this.querySelector('script[type="text/mermaid"]');
			this._source = (this.getAttribute('src') ?? script?.textContent ?? this.textContent).trim();
		}
		this._draw();
		this._mo ??= new MutationObserver(() => this._draw());
		this._mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	}

	disconnectedCallback() {
		this._mo?.disconnect();
	}

	async _draw() {
		const token = (this._token = Symbol());
		const mermaid = await loadMermaid();
		const t = readTokens(this);
		const bg = t.dark ? '#0d1117' : '#ffffff';
		// Same colour recipe as md-doc-pipeline's renderer (mermaid.py _tokens), so a diagram
		// reads the same in a document and on a slide.
		const c = t.dark
			? {
					nodeFill: mix(t.primary, bg, 0.78), nodeStroke: mix(t.primary, bg, 0.25),
					diamondFill: mix(t.secondary, bg, 0.8), diamondStroke: mix(t.secondary, bg, 0.2),
					panelFill: mix(t.primary, bg, 0.93), panelStroke: mix(t.primary, bg, 0.7),
					edge: '#7d8590', ink2: '#b1bac4', shadow: 0,
				}
			: {
					nodeFill: mix(t.primary, bg, 0.94), nodeStroke: mix(t.primary, bg, 0.55),
					diamondFill: mix(t.secondary, bg, 0.9), diamondStroke: mix(t.secondary, bg, 0.35),
					panelFill: mix(t.primary, bg, 0.975), panelStroke: mix(t.primary, bg, 0.82),
					edge: '#8a939d', ink2: t.ink2, shadow: 0.07,
				};
		const term = luminance(t.primary) < 0.4 ? '#ffffff' : '#1f2328';
		const css = `
			.node rect.label-container, .node .basic { fill: ${c.nodeFill}; stroke: ${c.nodeStroke}; stroke-width: 1.25px; rx: 6px; ry: 6px; }
			.node polygon.label-container { fill: ${c.diamondFill}; stroke: ${c.diamondStroke}; stroke-width: 1.25px; stroke-linejoin: round; }
			.node.terminal rect.label-container, .node.terminal circle, .node.terminal ellipse, .node.terminal .label-container path { fill: ${t.primary}; stroke: ${t.primary}; }
			.node.terminal .nodeLabel, .node.terminal .nodeLabel p { color: ${term}; }
			.node { filter: drop-shadow(0 1.5px 1px rgba(11, 31, 51, ${c.shadow})); }
			.nodeLabel, .nodeLabel p, .edgeLabel p { font-weight: 500; margin: 0; }
			.edgeLabel .labelBkg, .edgeLabel p { background: ${bg}; color: ${c.ink2}; font-weight: 400; font-size: 0.875em; border-radius: 3px; }
			.flowchart-link { stroke: ${c.edge}; stroke-width: 1.25px; fill: none; }
			.arrowMarkerPath, .marker { fill: ${c.edge}; stroke: ${c.edge}; }
			.cluster rect { fill: ${c.panelFill}; stroke: ${c.panelStroke}; stroke-width: 1px; rx: 8px; ry: 8px; }
			.cluster-label .nodeLabel { color: ${c.ink2}; font-weight: 600; }
		`;
		mermaid.initialize({
			startOnLoad: false,
			layout: this.getAttribute('layout') || 'elk',
			securityLevel: 'strict',
			theme: 'base',
			themeCSS: css,
			themeVariables: {
				fontFamily: t.font,
				fontSize: `${SLIDE_FONT_PX}px`,
				background: 'transparent',
				primaryColor: c.nodeFill,
				primaryBorderColor: c.nodeStroke,
				primaryTextColor: t.ink,
				lineColor: c.edge,
				textColor: t.ink,
				edgeLabelBackground: bg,
			},
			flowchart: { useMaxWidth: false, htmlLabels: true, curve: this.getAttribute('curve') || 'rounded', padding: 16, nodeSpacing: 44, rankSpacing: 64 },
		});
		let svg;
		try {
			({ svg } = await mermaid.render(`deck-mermaid-${++seq}`, this._source));
		} catch (e) {
			if (token === this._token) this.textContent = `Diagram error: ${e.message}`;
			return;
		}
		if (token !== this._token) return;
		this.innerHTML = svg;
		const el = this.querySelector('svg');
		el?.setAttribute('role', 'img');
		el?.setAttribute('aria-label', this.getAttribute('label') || 'diagram');
		el?.style.setProperty('max-width', '100%');
		el?.style.setProperty('height', 'auto');
		this._markTerminals(el);
		if (this.hasAttribute('steps')) this._applySteps(el);
	}

	/** Stadium `id(["…"])` and circle `id(("…"))` nodes are md-doc's filled terminals. */
	_markTerminals(svg) {
		const names = new Set([...this._source.matchAll(/([\w-]+)\s*\(\s*[\[(]/g)].map((m) => m[1]));
		for (const g of svg.querySelectorAll('g.node')) {
			if (names.has(this._nodeName(g))) g.classList.add('terminal');
		}
	}

	/** Nodes appear in source order, each with the edge(s) leading into it. */
	_applySteps(svg) {
		const nodes = [...svg.querySelectorAll('g.node')];
		const step = new Map(); // node id -> index
		nodes.forEach((n, i) => step.set(this._nodeName(n), i));
		const mark = (el, i) => {
			el.classList.add('fragment');
			el.dataset.fragmentIndex = String(i);
		};
		nodes.forEach((n, i) => mark(n, i));
		const paths = [...svg.querySelectorAll('path.flowchart-link')];
		const labels = [...svg.querySelectorAll('g.edgeLabel')];
		paths.forEach((p, i) => {
			const to = this._edgeTarget(p.id, step);
			if (to === undefined) return;
			mark(p, to);
			if (labels[i]) mark(labels[i], to);
		});
		window.Reveal?.syncFragments?.(this.closest('section'));
	}

	_nodeName(g) {
		// Mermaid ids nodes "<render-id>-flowchart-<name>-<n>"
		return (g.id || '').replace(/^.*?flowchart-/, '').replace(/-\d+$/, '');
	}

	/** Step an edge appears on. Edge ids are "<render-id>-L_<from>_<to>_<n>"; node names may contain "_", so try each split. */
	_edgeTarget(id, step) {
		const m = /-L_(.+)_\d+$/.exec(id || '');
		if (!m) return undefined;
		const parts = m[1].split('_');
		for (let k = 1; k < parts.length; k++) {
			const from = parts.slice(0, k).join('_'), to = parts.slice(k).join('_');
			if (step.has(from) && step.has(to)) return Math.max(step.get(from), step.get(to)); // wait for both ends
		}
		return undefined;
	}
}

customElements.define(DeckMermaid.tag, DeckMermaid);
