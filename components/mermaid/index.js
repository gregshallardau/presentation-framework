// components/mermaid/index.js
// A Mermaid diagram drawn by md-doc-pipeline's renderer - the same one that
// draws diagrams in documents, so a diagram looks the same in both.
//
// Author it in a slide:
//   .md   a fenced ```mermaid block
//   .html <deck-mermaid><script type="text/mermaid">flowchart LR ...</script></deck-mermaid>
//
// Slide assembly (build/mermaid.js) draws each diagram once per deck theme and
// swaps the block for <deck-mermaid data-id="...">; this component shows the
// SVG for the active [data-theme] and switches live when it changes.
import { DeckElement } from '@/components/deck-element.js';
import { SHARED_STYLES } from '@/components/shared-styles.js';

// Documents draw diagrams at body-text size; a 1920px slide is ~2x a page column.
const SLIDE_SCALE = 2;

let dataset;
function data() {
	if (dataset) return dataset;
	try {
		dataset = JSON.parse(document.getElementById('deck-mermaid-data')?.textContent || '{}');
	} catch {
		dataset = {};
	}
	return dataset;
}

class DeckMermaid extends DeckElement {
	static tag = 'deck-mermaid';
	static observedAttributes = ['data-id', 'label'];

	static styles = `
		${SHARED_STYLES}
		:host { display: block; text-align: center; }
		svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
		.note { color: var(--muted); font-size: 0.8em; }
		pre { text-align: left; white-space: pre-wrap; font: 0.7em var(--font-code); }
	`;

	render() {
		this._draw();
		this._mo = new MutationObserver(() => this._draw());
		this._mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	}

	disconnectedCallback() {
		this._mo?.disconnect();
		this._upgraded = false; // Reveal relocates nodes; render again on reconnect
	}

	attributeChangedCallback() {
		if (this._upgraded) this._draw();
	}

	_draw() {
		const variants = data()[this.dataset.id];
		const root = this.shadowRoot;
		root.replaceChildren();
		if (!variants) {
			root.append(this._note('Diagram not drawn: slides are assembled by the deck build (build/mermaid.js).'));
			return;
		}
		const variant = variants[document.documentElement.dataset.theme || ''] ?? variants[''];
		if (variant.error) {
			root.append(this._note(`Diagram not drawn: ${variant.error}`));
			if (variant.source) {
				const pre = document.createElement('pre');
				pre.textContent = variant.source;
				root.append(pre);
			}
			return;
		}
		const wrap = document.createElement('div');
		wrap.setAttribute('role', 'img');
		wrap.setAttribute('aria-label', this.getAttribute('label') || 'diagram');
		wrap.innerHTML = variant.svg;
		const svg = wrap.querySelector('svg');
		const natural = parseFloat(svg?.getAttribute('viewBox')?.split(/\s+/)[2]);
		if (svg && natural) {
			svg.removeAttribute('width');
			svg.style.width = `${natural * SLIDE_SCALE}px`;
		}
		root.append(wrap);
	}

	_note(text) {
		const el = document.createElement('div');
		el.className = 'note';
		el.textContent = text;
		return el;
	}
}

customElements.define(DeckMermaid.tag, DeckMermaid);
