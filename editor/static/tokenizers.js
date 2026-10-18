/**
 * Monaco language support for deck studio - the counterpart of md-doc
 * editor's tokenizers.js.
 *
 * Registers:
 *   deck-markdown  .md slides: Markdown plus Reveal's `--` vertical fence,
 *                  `Note:` speaker notes, <!-- .slide: --> / <!-- .element: -->
 *                  directives, inline HTML and <deck-*> components
 *   deck-light     custom Monaco theme
 * and completion + hover providers for Markdown, HTML and deck.config.js fed
 * by the live catalog (/__editor/api/catalog): deck.css classes, Reveal
 * classes, <deck-*> tags and their attributes, Reveal data-* attributes,
 * semantic custom properties and deck.config.js keys.
 *
 * Usage (inside the Monaco require() callback):
 *   registerDeckLanguages(monaco, () => ({ catalog, schema }));
 */

(function (global) {
	'use strict';

	// Reveal's per-slide / per-element data attributes (https://revealjs.com).
	const REVEAL_ATTRIBUTES = [
		['data-transition', 'Slide transition: none | fade | slide | convex | concave | zoom'],
		['data-transition-speed', 'default | fast | slow'],
		['data-background-color', 'Solid slide background colour'],
		['data-background-image', 'Background image URL'],
		['data-background-size', 'CSS background-size for the image'],
		['data-background-gradient', 'CSS gradient background'],
		['data-background-video', 'Background video URL'],
		['data-background-iframe', 'Background web page URL'],
		['data-background-opacity', '0–1 opacity of the background media'],
		['data-auto-animate', 'Animate matching elements from the previous slide'],
		['data-auto-animate-id', 'Group auto-animated slides'],
		['data-visibility', '"hidden" skips the slide; "uncounted" excludes it from numbering'],
		['data-state', 'Adds a class to the viewport while the slide is shown'],
		['data-autoslide', 'Milliseconds before advancing automatically'],
		['data-timing', 'Seconds planned for this slide (speaker view pacing)'],
		['data-hide-chrome', 'Hide the deck logo/footer on this slide (deck.config.js chrome)'],
		['data-fragment-index', 'Order of a fragment within the slide'],
		['data-id', 'Pairs elements across slides for auto-animate'],
	];

	const MARKDOWN = {
		defaultToken: '',
		tokenPostfix: '.md',
		tokenizer: {
			root: [
				[/^--\s*$/, 'keyword.fence'],
				[/^Note:/, { token: 'keyword.notes', next: '@notes' }],
				[/<!--\s*\.(slide|element):/, { token: 'keyword.directive', next: '@directive' }],
				[/<!--/, { token: 'comment', next: '@comment' }],
				[/^\s*```\s*[\w-]*\s*$/, { token: 'string.code', next: '@codeblock' }],
				[/^(#{1,6})(\s.*)$/, ['keyword.heading', 'markup.heading']],
				[/^\s*([-*+]|\d+\.)\s/, 'keyword.list'],
				[/^\s*>.*$/, 'comment.quote'],
				[/<\/?deck-[\w-]+/, { token: 'tag.component', next: '@tag' }],
				[/<\/?[a-zA-Z][\w-]*/, { token: 'tag', next: '@tag' }],
				[/\*\*[^*]+\*\*/, 'strong'],
				[/\*[^*\s][^*]*\*/, 'emphasis'],
				[/_[^_\s][^_]*_/, 'emphasis'],
				[/`[^`]+`/, 'string.code'],
				[/!?\[[^\]]*\]\([^)]*\)/, 'string.link'],
			],
			notes: [
				[/^--\s*$/, { token: 'keyword.fence', next: '@pop' }],
				[/.*$/, 'comment.notes'],
			],
			directive: [
				[/-->/, { token: 'keyword.directive', next: '@pop' }],
				[/[\w-]+(?==)/, 'attribute.name'],
				[/"[^"]*"|'[^']*'/, 'attribute.value'],
				[/./, 'keyword.directive'],
			],
			comment: [
				[/-->/, { token: 'comment', next: '@pop' }],
				[/./, 'comment'],
			],
			codeblock: [
				[/^\s*```\s*$/, { token: 'string.code', next: '@pop' }],
				[/.*$/, 'string.code'],
			],
			tag: [
				[/\/?>/, { token: 'tag', next: '@pop' }],
				[/[\w:-]+(?==)/, 'attribute.name'],
				[/[\w:-]+/, 'attribute.name'],
				[/"[^"]*"|'[^']*'/, 'attribute.value'],
				[/[=\s]/, ''],
			],
		},
	};

	const LIGHT_THEME = {
		base: 'vs',
		inherit: true,
		rules: [
			{ token: 'keyword.heading', foreground: '315de3', fontStyle: 'bold' },
			{ token: 'markup.heading', foreground: '1e293b', fontStyle: 'bold' },
			{ token: 'keyword.list', foreground: '315de3' },
			{ token: 'keyword.fence', foreground: 'c2410c', fontStyle: 'bold' },
			{ token: 'keyword.notes', foreground: '7c3aed', fontStyle: 'bold' },
			{ token: 'comment.notes', foreground: '7c3aed', fontStyle: 'italic' },
			{ token: 'keyword.directive', foreground: 'b45309' },
			{ token: 'attribute.name', foreground: '0f766e' },
			{ token: 'attribute.value', foreground: '16a34a' },
			{ token: 'tag', foreground: '0f766e' },
			{ token: 'tag.component', foreground: 'db2777', fontStyle: 'bold' },
			{ token: 'strong', fontStyle: 'bold' },
			{ token: 'emphasis', fontStyle: 'italic' },
			{ token: 'string.code', foreground: '374151' },
			{ token: 'string.link', foreground: '2563eb' },
			{ token: 'comment', foreground: '94a3b8' },
			{ token: 'comment.quote', foreground: '64748b', fontStyle: 'italic' },
		],
		colors: {},
	};

	// What the text before the cursor on this line is in the middle of.
	function context(model, position) {
		const line = model.getValueInRange({
			startLineNumber: position.lineNumber,
			startColumn: 1,
			endLineNumber: position.lineNumber,
			endColumn: position.column,
		});
		const classAttr = line.match(/\bclass=["']([^"']*)$/);
		if (classAttr) return { kind: 'class', partial: classAttr[1].split(/\s+/).pop() };
		const cssVar = line.match(/var\(\s*(--[\w-]*)$/);
		if (cssVar) return { kind: 'var', partial: cssVar[1] };
		const openTag = line.match(/<([\w-]+)(?:\s+[^<>]*)?\s([\w-]*)$/);
		if (openTag && !/>/.test(line.slice(line.lastIndexOf('<'))))
			return { kind: 'attribute', tag: openTag[1], partial: openTag[2] };
		const tagName = line.match(/<([\w-]*)$/);
		if (tagName) return { kind: 'tag', partial: tagName[1] };
		if (/^\s*[\w]*$/.test(line)) return { kind: 'line', partial: line.trim() };
		return { kind: null };
	}

	function range(monaco, position, partial) {
		return new monaco.Range(
			position.lineNumber,
			position.column - partial.length,
			position.lineNumber,
			position.column
		);
	}

	function slideCompletions(monaco, get, model, position, markdown) {
		const { catalog } = get();
		if (!catalog) return { suggestions: [] };
		const ctx = context(model, position);
		const K = monaco.languages.CompletionItemKind;
		const Snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
		const suggestions = [];
		if (ctx.kind === 'class') {
			const r = range(monaco, position, ctx.partial);
			for (const name of catalog.classes.deck)
				suggestions.push({
					label: name,
					kind: K.Class,
					detail: 'deck.css',
					insertText: name,
					range: r,
				});
			for (const name of catalog.classes.reveal)
				suggestions.push({
					label: name,
					kind: K.Keyword,
					detail: 'Reveal built-in',
					insertText: name,
					range: r,
				});
		} else if (ctx.kind === 'var') {
			const r = range(monaco, position, ctx.partial);
			for (const name of catalog.properties)
				suggestions.push({
					label: name,
					kind: K.Variable,
					detail: 'semantic custom property',
					insertText: name,
					range: r,
				});
		} else if (ctx.kind === 'attribute') {
			const r = range(monaco, position, ctx.partial);
			const component = catalog.components.find((c) => c.tag === ctx.tag);
			if (component) {
				for (const attr of component.attributes) {
					suggestions.push({
						label: attr,
						kind: K.Property,
						detail: component.tag,
						insertText: `${attr}="$1"`,
						insertTextRules: Snippet,
						range: r,
					});
				}
			}
			if (ctx.tag === 'section' || !component) {
				for (const [attr, doc] of REVEAL_ATTRIBUTES) {
					suggestions.push({
						label: attr,
						kind: K.Property,
						detail: 'Reveal',
						documentation: doc,
						insertText: `${attr}="$1"`,
						insertTextRules: Snippet,
						range: r,
					});
				}
			}
			suggestions.push({
				label: 'class',
				kind: K.Property,
				insertText: 'class="$1"',
				insertTextRules: Snippet,
				range: r,
			});
		} else if (ctx.kind === 'tag') {
			const r = range(monaco, position, ctx.partial);
			for (const c of catalog.components) {
				const attrs = c.attributes
					.filter((a) => a !== 'data')
					.map((a, i) => ` ${a}="$${i + 2}"`)
					.join('');
				const data = c.attributes.includes('data') ? ` data='$1'` : '';
				suggestions.push({
					label: c.tag,
					kind: K.Module,
					detail: 'component',
					documentation: c.description,
					insertText: `${c.tag}${data}${attrs}></${c.tag}>`,
					insertTextRules: Snippet,
					range: r,
				});
			}
			for (const [tag, text] of [
				['section', 'section>\n\t$0\n</section>'],
				['aside', 'aside class="notes">\n\t$0\n</aside>'],
				['span', 'span class="fragment">$0</span>'],
			]) {
				suggestions.push({
					label: tag,
					kind: K.Snippet,
					insertText: text,
					insertTextRules: Snippet,
					range: r,
				});
			}
		} else if (markdown && ctx.kind === 'line') {
			const r = range(monaco, position, ctx.partial);
			for (const [label, text, doc] of [
				['--', '--\n\n', 'Vertical sub-slide fence'],
				['Note:', 'Note: $0', 'Speaker notes (to the end of the slide)'],
				[
					'.slide',
					'<!-- .slide: data-transition="${1|fade,slide,zoom,none|}" -->',
					'Attributes for this slide',
				],
				[
					'.element',
					'<!-- .element: class="fragment" -->',
					'Attributes for the element on this line',
				],
				[
					'fragment',
					'<!-- .element: class="fragment" -->',
					'Reveal the element on this line step by step',
				],
			]) {
				suggestions.push({
					label,
					kind: K.Snippet,
					documentation: doc,
					insertText: text,
					insertTextRules: Snippet,
					range: r,
				});
			}
		}
		return { suggestions };
	}

	function configCompletions(monaco, get, model, position) {
		const { schema, catalog } = get();
		if (!schema) return { suggestions: [] };
		const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
		if (!/^\s*\w*$/.test(line)) return { suggestions: [] };
		const partial = line.trim();
		const r = range(monaco, position, partial);
		const K = monaco.languages.CompletionItemKind;
		const Snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
		return {
			suggestions: Object.entries(schema).map(([key, spec]) => {
				let value = '$1';
				if (spec.type === 'bool') value = '${1|true,false|}';
				if (spec.type === 'enum')
					value = `\${1|${spec.values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(',')}|}`;
				if (spec.type === 'theme' && catalog?.themes.length)
					value = `\${1|${catalog.themes.map((t) => `'${t}'`).join(',')}|}`;
				return {
					label: key,
					kind: K.Property,
					documentation: spec.doc,
					insertText: `${key}: ${value},`,
					insertTextRules: Snippet,
					range: r,
				};
			}),
		};
	}

	function hover(monaco, get, model, position) {
		const { catalog } = get();
		const word = model.getWordAtPosition(position);
		if (!catalog || !word) return null;
		const lineText = model.getLineContent(position.lineNumber);
		const start = lineText.lastIndexOf('<', word.startColumn - 1);
		const tag = start >= 0 ? lineText.slice(start + 1).match(/^\/?(deck-[\w-]+)/)?.[1] : null;
		const component = tag && catalog.components.find((c) => c.tag === tag);
		if (component) {
			return {
				contents: [
					{ value: `**<${component.tag}>** · \`${component.path}\`` },
					{ value: component.description || '' },
					{
						value: component.attributes.length
							? `Attributes: ${component.attributes.map((a) => `\`${a}\``).join(', ')}`
							: '',
					},
				],
			};
		}
		const attr = REVEAL_ATTRIBUTES.find(
			([name]) => lineText.slice(word.startColumn - 1).startsWith(name) || name.endsWith(word.word)
		);
		if (attr && lineText.includes(attr[0]))
			return { contents: [{ value: `**${attr[0]}** · Reveal` }, { value: attr[1] }] };
		return null;
	}

	function registerDeckLanguages(monaco, get) {
		monaco.languages.register({ id: 'deck-markdown' });
		monaco.languages.setMonarchTokensProvider('deck-markdown', MARKDOWN);
		monaco.languages.setLanguageConfiguration('deck-markdown', {
			comments: { blockComment: ['<!--', '-->'] },
			brackets: [
				['[', ']'],
				['(', ')'],
				['<', '>'],
			],
			autoClosingPairs: [
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '"', close: '"' },
				{ open: '`', close: '`' },
				{ open: '**', close: '**' },
			],
			surroundingPairs: [
				{ open: '**', close: '**' },
				{ open: '*', close: '*' },
				{ open: '_', close: '_' },
				{ open: '`', close: '`' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '"', close: '"' },
			],
		});
		monaco.editor.defineTheme('deck-light', LIGHT_THEME);

		const triggers = ['"', "'", ' ', '<', '-', '.'];
		for (const language of ['deck-markdown', 'html']) {
			monaco.languages.registerCompletionItemProvider(language, {
				triggerCharacters: triggers,
				provideCompletionItems: (model, position) =>
					slideCompletions(monaco, get, model, position, language === 'deck-markdown'),
			});
			monaco.languages.registerHoverProvider(language, {
				provideHover: (model, position) => hover(monaco, get, model, position),
			});
		}
		monaco.languages.registerCompletionItemProvider('css', {
			triggerCharacters: ['-', '('],
			provideCompletionItems: (model, position) => {
				const { catalog } = get();
				const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
				const match = line.match(/var\(\s*(--[\w-]*)$/);
				if (!catalog || !match) return { suggestions: [] };
				const r = range(monaco, position, match[1]);
				return {
					suggestions: catalog.properties.map((name) => ({
						label: name,
						kind: monaco.languages.CompletionItemKind.Variable,
						detail: 'semantic custom property',
						insertText: name,
						range: r,
					})),
				};
			},
		});
		monaco.languages.registerCompletionItemProvider('javascript', {
			provideCompletionItems: (model, position) =>
				/deck\.config\.js$/.test(model.uri.path)
					? configCompletions(monaco, get, model, position)
					: { suggestions: [] },
		});
	}

	// Sub-slide start lines, mirroring editor/server/deck.js subslideLines().
	function subslideLines(text, ext) {
		const lines = text.split(/\r?\n/);
		if (ext === 'md') {
			const starts = [1];
			lines.forEach((line, i) => {
				if (/^--\s*$/.test(line)) starts.push(i + 2);
			});
			return starts;
		}
		const masked = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
		const opens = [...masked.matchAll(/<section[\s>]/gi)].map(
			(m) => masked.slice(0, m.index).split('\n').length
		);
		return opens.length > 1 ? opens.slice(1) : [1];
	}

	global.registerDeckLanguages = registerDeckLanguages;
	global.deckSubslideLines = subslideLines;
})(window);
