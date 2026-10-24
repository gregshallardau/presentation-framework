// components/chart-vega/index.js
// Any Vega-Lite (or Vega) chart from a spec - the same spec md-doc-pipeline
// renders in documents (a ```chart block). Interactive: tooltips, selections,
// brushing and bound controls all work in the spec itself.
//
//   <deck-chart-vega label="Revenue" spec='{"data":{"values":[...]},"mark":"line",...}'></deck-chart-vega>
//   <deck-chart-vega ratio="16 / 9"> sets the box shape (default 2 / 1).
//   <deck-chart-vega><script type="application/json">{ ...spec... }</script></deck-chart-vega>
//
// The spec holds data and encodings only; colours and fonts come from the
// deck theme (see src/lib/vega.js).
import { DeckElement } from '@/components/deck-element.js';
import { SHARED_STYLES } from '@/components/shared-styles.js';
import { isVega, loadEmbed, prepareSpec, readTokens, vegaConfig } from '@/lib/vega.js';

const SAMPLE = {
	data: {
		values: [
			{ month: 'Jan', value: 12, region: 'North' },
			{ month: 'Feb', value: 19, region: 'North' },
			{ month: 'Mar', value: 14, region: 'North' },
			{ month: 'Jan', value: 8, region: 'South' },
			{ month: 'Feb', value: 15, region: 'South' },
			{ month: 'Mar', value: 21, region: 'South' },
		],
	},
	mark: { type: 'line', point: true },
	encoding: {
		x: { field: 'month', type: 'ordinal', sort: ['Jan', 'Feb', 'Mar'] },
		y: { field: 'value', type: 'quantitative' },
		color: { field: 'region', type: 'nominal' },
	},
};

// Slides are drawn on a 1920px canvas, ~2x a document column: scale type and strokes to match.
const SLIDE_SCALE = 2;

class DeckChartVega extends DeckElement {
	static tag = 'deck-chart-vega';
	static observedAttributes = ['spec', 'label', 'ratio'];

	static styles = `
		${SHARED_STYLES}
		:host { display: block; width: 100%; aspect-ratio: 2 / 1; }
		.root { position: relative; width: 100%; height: 100%; }
		.chart { width: 100%; height: 100%; }
		/* width/height: 'container' sizing measures .vega-embed, which collapses to its content by default */
		.chart .vega-embed { display: block; width: 100%; height: 100%; }
		.chart svg, .chart canvas { max-width: 100%; }
		.error { color: var(--muted); font-size: 0.8em; padding: var(--space-gap); }
	`;

	/** The Vega View - use for live control: `el.view.signal('year', 2024).run()`. */
	view = null;

	get spec() {
		const attr = this.getAttribute('spec');
		const inline = this.querySelector('script[type="application/json"]')?.textContent;
		const raw = attr ?? inline;
		if (raw === null || raw === undefined || !raw.trim()) return SAMPLE;
		try {
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' ? parsed : SAMPLE;
		} catch (e) {
			this._error = `Invalid chart spec: ${e.message}`;
			return null;
		}
	}

	render() {
		this._root = document.createElement('div');
		this._root.className = 'root';
		this._chart = document.createElement('div');
		this._chart.className = 'chart';
		this._chart.setAttribute('role', 'img');
		this._chart.setAttribute('aria-label', this.getAttribute('label') || 'chart');
		this._root.append(this._chart);
		this.shadowRoot.append(this._root);
		this._applyRatio();
		this._draw();

		this._ro = new ResizeObserver(() => this.view?.resize().runAsync());
		this._ro.observe(this);
		// Re-theme live when [data-theme] / class changes on the root.
		this._mo = new MutationObserver(() => this._draw());
		this._mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
	}

	disconnectedCallback() {
		this._ro?.disconnect();
		this._mo?.disconnect();
		this.view?.finalize();
		this.view = null;
		this._upgraded = false; // Reveal relocates nodes; render again on reconnect
	}

	attributeChangedCallback(name) {
		if (!this._upgraded) return;
		if (name === 'ratio') return this._applyRatio();
		this._draw();
	}

	/** `ratio="16 / 9"` sets the chart box; default 2 / 1. Don't use .r-stretch (it ignores slide padding). */
	_applyRatio() {
		this.style.aspectRatio = this.getAttribute('ratio') || '';
	}

	async _draw() {
		this._error = null;
		const spec = this.spec;
		this.view?.finalize();
		this.view = null;
		if (!spec) {
			this._chart.innerHTML = '';
			const err = document.createElement('div');
			err.className = 'error';
			err.textContent = this._error;
			this._chart.append(err);
			return;
		}
		const token = (this._token = Symbol());
		try {
			const embed = await loadEmbed();
			if (token !== this._token) return; // a newer draw superseded this one
			const config = vegaConfig(readTokens(this, SLIDE_SCALE));
			const result = await embed(this._chart, prepareSpec(spec), {
				mode: isVega(spec) ? 'vega' : 'vega-lite',
				renderer: 'svg',
				actions: false,
				config,
			});
			if (token !== this._token) {
				result.finalize();
				return;
			}
			this.view = result.view;
			this.dispatchEvent(new CustomEvent('chart-ready', { detail: { view: this.view } }));
		} catch (e) {
			this._chart.textContent = '';
			const err = document.createElement('div');
			err.className = 'error';
			err.textContent = `Chart error: ${e.message}`;
			this._chart.append(err);
		}
	}
}

customElements.define(DeckChartVega.tag, DeckChartVega);
