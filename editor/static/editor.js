/* Deck studio. The framework owns the deck; this client owns buffers and interaction.
 *
 * Structure follows md-doc editor's studio client (md_doc_web_editor/static/editor.js):
 * one IIFE, one `state` object, an api() wrapper carrying the session token,
 * revision-safe saves with a conflict diff, localStorage drafts, splitters,
 * a command palette, a Git panel and 1 s change polling. What differs is the
 * preview - the real deck in an iframe, steered with the Reveal API - and the
 * Slides panel, inspector and Problems panel, which are deck-specific. */
(() => {
	'use strict';
	const BASE = '/__editor';
	const $ = (id) => document.getElementById(id);
	const icons = {
		folder: 'M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
		'folder-open':
			'M3 8V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2 M3 8h17a1 1 0 0 1 1 1l-3 10H5a2 2 0 0 1-2-2Z',
		markdown:
			'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z M14 3v6h6 M7 17v-5l3 3 3-3v5 M17 12v5 m-2-2 2 2 2-2',
		file: 'M5 3h9l5 5v13H5Z M14 3v6h5 M9 13h6 M9 17h5',
		files: 'M8 3h10v14H8Z M5 7H3v14h11v-2',
		slides: 'M3 5h18v12H3Z M8 21h8 M12 17v4',
		stack: 'M4 4h16v6H4Z M4 14h16v6H4Z',
		steps: 'M4 18h4v-4h4v-4h4V6h4',
		notes: 'M5 3h14v18H5Z M9 8h6 M9 12h6 M9 16h3',
		grid: 'M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z',
		component: 'M12 2 21 7v10l-9 5-9-5V7Z M12 22V12 M21 7l-9 5-9-5',
		play: 'M7 4v16l13-8Z',
		search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l6 6',
		sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1',
		help: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
		download: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
		'chevron-down': 'm7 9 5 5 5-5',
		'chevron-right': 'm9 6 6 6-6 6',
		'chevron-left': 'm15 6-6 6 6 6',
		'chevron-up': 'm7 15 5-5 5 5',
		list: 'M9 6h12 M9 12h12 M9 18h12 M3 6h.01 M3 12h.01 M3 18h.01',
		git: 'M6 3v12a4 4 0 0 0 4 4h6 M18 5v9 M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
		external: 'M14 3h7v7 M21 3l-9 9 M10 3H3v18h18v-7',
		maximize: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',
		settings:
			'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
		'file-plus': 'M14 3H5v18h14V8Z M14 3v5h5 M12 12v6 M9 15h6',
		refresh: 'M20 8a8 8 0 0 0-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0 0 14 3l3-3 M21 21v-5h-5',
		more: 'M5 12h.01 M12 12h.01 M19 12h.01',
		shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z M8 12l3 3 5-6',
		save: 'M4 3h13l4 4v14H3V3Z M7 3v7h9V3 M7 21v-7h10v7',
		heading: 'M5 4v16 M19 4v16 M5 12h14',
		link: 'm10 14 4-4 M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
		plus: 'M12 5v14 M5 12h14',
		columns: 'M3 4h18v16H3Z M12 4v16',
		sliders: 'M5 3v5 M5 12v9 M12 3v10 M12 17v4 M19 3v3 M19 10v11 M2 8h6 M9 17h6 M16 6h6',
		panel: 'M3 4h18v16H3Z M9 4v16',
		printer: 'M6 9V3h12v6 M6 17H3V9h18v8h-3 M6 14h12v7H6Z M17 12h.01',
		close: 'm6 6 12 12 M18 6 6 18',
		check: 'm5 12 4 4 10-10',
		alert: 'M12 3 2 21h20Z M12 9v5 M12 18h.01',
		code: 'm8 7-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16',
		image: 'M3 3h18v18H3Z m3 18 5-6 4 4 3-3 3 5 M8 9h.01',
		moon: 'M20 14A9 9 0 0 1 10 4a9 9 0 1 0 10 10',
		undo: 'M3 8h11a7 7 0 0 1 0 14 M3 8l5-5 M3 8l5 5',
		trash: 'M3 6h18 M9 6V3h6v3 M6 6v15h12V6 M10 10v7 M14 10v7',
		copy: 'M8 8h13v13H8Z M16 8V3H3v13h5',
		edit: 'm15 3 6 6-12 12H3v-6Z M12 6l6 6',
		move: 'M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3',
		palette:
			'M12 3a9 9 0 1 0 0 18c1 0 2-1 2-2s-1-1-1-2 1-2 2-2h2a4 4 0 0 0 4-4c0-4-4-8-9-8Z M7 12h.01 M9 8h.01 M14 7h.01',
	};
	function icon(name) {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.classList.add('icon');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');
		const path = document.createElementNS(svg.namespaceURI, 'path');
		path.setAttribute('d', icons[name] || icons.file);
		svg.append(path);
		return svg;
	}
	function hydrate(root = document) {
		root.querySelectorAll('[data-icon]').forEach((node) => {
			if (!node.childElementCount) node.append(icon(node.dataset.icon));
		});
	}
	function el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	}
	function escape(text) {
		const node = document.createElement('span');
		node.textContent = String(text ?? '');
		return node.innerHTML;
	}
	const state = {
		workspace: null,
		session: null,
		client: crypto.randomUUID(),
		files: [],
		tree: [],
		deck: { slides: [], count: 0 },
		catalog: null,
		config: null,
		buffers: new Map(),
		active: null,
		editor: null,
		fallback: null,
		nav: null,
		layout: 'split',
		navWidth: 260,
		editRatio: 0.5,
		horizontalRatio: 0.5,
		appearance: 'system',
		auto: true,
		follow: true,
		previewDelay: 600,
		previewTheme: '',
		previewSent: null,
		previewTimer: null,
		lintTimer: null,
		deckTimer: null,
		problems: [],
		changeSignature: null,
		commands: [],
		commandIndex: 0,
		loadingFiles: new Map(),
		recoveryDrafts: {},
		openSequence: 0,
		inspectTab: 'slide',
		job: null,
		frameIndices: null,
		navigatingTo: null,
		presentWindow: null,
	};
	let monacoReady;
	// Separate journals prevent another editor tab from erasing recovery text.
	const recoveryJournalName = 'recovery:' + crypto.randomUUID();
	const recoveryJournal = {};
	const current = () => state.buffers.get(state.active);
	const dirty = (buffer) => !!buffer && buffer.content !== buffer.saved;
	const isSlide = (path) =>
		/^slides\/[^/]+\.(md|html)$/i.test(path || '') && !/readme\.md$/i.test(path);
	const frameWindow = () => $('deck-frame').contentWindow;
	const reveal = () => {
		try {
			const deck = frameWindow()?.Reveal;
			return deck?.isReady?.() ? deck : null;
		} catch {
			return null;
		}
	};
	function key(name) {
		return `deck-studio:${state.workspace?.workspace || 'pending'}:${name}`;
	}
	function readStorage(name, fallback) {
		try {
			return JSON.parse(localStorage.getItem(key(name))) ?? fallback;
		} catch {
			return fallback;
		}
	}
	function store(name, value) {
		try {
			localStorage.setItem(key(name), JSON.stringify(value));
		} catch {
			if (!state.storageWarning) {
				state.storageWarning = true;
				toast('Draft recovery storage is unavailable. Save your changes to disk.', true);
			}
		}
	}
	async function api(url, options = {}, retried = false) {
		const response = await fetch(BASE + url, {
			cache: 'no-store',
			...options,
			headers: {
				'Content-Type': 'application/json',
				'X-Editor-Token': state.session || '',
				...options.headers,
			},
		});
		let data;
		try {
			data = await response.json();
		} catch {
			data = { detail: `Request failed (${response.status})` };
		}
		if (!response.ok) {
			// The dev server restarts (and mints a new token) when its config changes.
			if (response.status === 403 && !retried && /session expired/i.test(data.detail || '')) {
				const capabilities = await api('/api/capabilities', {}, true);
				state.session = capabilities.session;
				return api(url, options, true);
			}
			const error = new Error(
				typeof data.detail === 'string'
					? data.detail
					: data.detail?.message || `Request failed (${response.status})`
			);
			error.status = response.status;
			error.detail = data.detail;
			throw error;
		}
		return data;
	}
	const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) });
	function toast(message, error = false, action = null) {
		const node = el('div', 'toast' + (error ? ' error' : ''));
		node.append(icon(error ? 'alert' : 'check'), el('p', null, message));
		if (action) {
			const button = el('button', null, action.label);
			button.onclick = () => {
				action.run();
				node.remove();
			};
			node.append(button);
		}
		const close = el('button', 'icon-button small');
		close.setAttribute('aria-label', 'Dismiss');
		close.append(icon('close'));
		close.onclick = () => node.remove();
		node.append(close);
		$('toast-stack').append(node);
		setTimeout(() => node.remove(), action ? 18000 : 6000);
	}
	function dialog(title, body, actions = [], wide = false) {
		const node = $('form-dialog');
		if (node.open) node.close();
		node.classList.toggle('wide-dialog', wide);
		$('dialog-title').textContent = title;
		$('dialog-body').replaceChildren();
		if (typeof body === 'string') $('dialog-body').innerHTML = body;
		else $('dialog-body').append(body);
		$('dialog-actions').replaceChildren();
		for (const item of actions) {
			const button = el(
				'button',
				'button ' + (item.primary ? 'primary' : '') + (item.danger ? ' danger' : ''),
				item.label
			);
			button.type = 'button';
			button.onclick = async () => {
				button.disabled = true;
				try {
					await item.run(node);
				} catch (error) {
					toast(error.message, true);
				} finally {
					button.disabled = false;
				}
			};
			$('dialog-actions').append(button);
		}
		hydrate(node);
		node.showModal();
		setTimeout(() => node.querySelector('input,textarea,select')?.focus(), 0);
		return node;
	}
	function confirmDialog(title, message, options) {
		return new Promise((resolve) => {
			let settled = false;
			const node = dialog(
				title,
				`<p>${escape(message)}</p>`,
				options.map((option) => ({
					...option,
					run: () => {
						settled = true;
						node.close();
						resolve(option.value);
					},
				}))
			);
			node.addEventListener(
				'close',
				() => {
					if (!settled && !node.open) resolve(null);
				},
				{ once: true }
			);
		});
	}
	function option(label, description, iconName, run) {
		const button = el('button', 'option-button');
		button.type = 'button';
		button.append(icon(iconName));
		const text = el('span');
		text.append(el('strong', null, label), el('small', null, description));
		button.append(text);
		button.onclick = async () => {
			$('form-dialog').close();
			try {
				await run();
			} catch (error) {
				toast(error.message, true);
			}
		};
		return button;
	}

	/* ── Buffers, drafts and saving ─────────────────────────────────────── */

	function persist() {
		store('session', {
			paths: [...state.buffers.values()].map((buffer) => buffer.path),
			active: state.active,
		});
		const drafts = { ...state.recoveryDrafts };
		for (const [path, buffer] of state.buffers) {
			if (dirty(buffer)) {
				drafts[path] = { content: buffer.content, saved: buffer.saved, revision: buffer.revision };
				recoveryJournal[path] = { ...drafts[path], updatedAt: Date.now() };
			} else delete drafts[path];
		}
		if (Object.keys(recoveryJournal).length) store(recoveryJournalName, recoveryJournal);
		store('drafts', drafts);
		updateSaveState();
	}
	function updateSaveState() {
		const count = [...state.buffers.values()].filter(dirty).length;
		const buffer = current();
		$('save-btn').disabled = !buffer || !dirty(buffer) || !!buffer.saving;
		$('save-status').textContent = count
			? `${count} unsaved ${count === 1 ? 'file' : 'files'}`
			: 'All changes saved';
		renderTabs();
		document.title =
			(buffer ? (dirty(buffer) ? '• ' : '') + buffer.path.split('/').pop() + ' · ' : '') +
			'Deck studio';
	}
	function language(buffer) {
		if (/\.md$/i.test(buffer.path)) return 'deck-markdown';
		if (/\.html$/i.test(buffer.path)) return 'html';
		if (/\.css$/i.test(buffer.path)) return 'css';
		if (/\.(m?js|ts)$/i.test(buffer.path)) return 'javascript';
		if (/\.json$/i.test(buffer.path)) return 'json';
		return 'plaintext';
	}
	const languageNames = {
		'deck-markdown': 'Markdown slide',
		html: 'HTML',
		css: 'CSS',
		javascript: 'JavaScript',
		json: 'JSON',
		plaintext: 'Text',
	};
	function changed(value) {
		const buffer = current();
		if (!buffer) return;
		buffer.content = value;
		buffer.edited = true;
		persist();
		renderSlides();
		if (isSlide(buffer.path)) {
			schedulePreview();
			scheduleDeck();
		}
		scheduleLint();
	}
	function sourceEditorOptions(extra = {}) {
		return {
			theme: document.documentElement.dataset.theme === 'dark' ? 'vs-dark' : 'deck-light',
			fontSize: 13,
			fontFamily: '"SFMono-Regular",Consolas,"Liberation Mono",monospace',
			lineHeight: 23,
			minimap: { enabled: false },
			wordWrap: 'on',
			scrollBeyondLastLine: false,
			padding: { top: 22, bottom: 20 },
			automaticLayout: true,
			renderLineHighlight: 'gutter',
			occurrencesHighlight: 'off',
			smoothScrolling: true,
			roundedSelection: false,
			overviewRulerBorder: false,
			lineNumbersMinChars: 3,
			quickSuggestions: { other: true, comments: true, strings: true },
			scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 },
			...extra,
		};
	}
	function initMonaco() {
		return new Promise((resolve) => {
			if (typeof window.require !== 'function') {
				fallback();
				resolve();
				return;
			}
			window.require.config({
				paths: { vs: new URL(BASE + '/vendor/monaco/vs', location.href).href },
			});
			let settled = false;
			const done = () => {
				if (!settled) {
					settled = true;
					resolve();
				}
			};
			window.require(
				['vs/editor/editor.main'],
				() => {
					try {
						window.registerDeckLanguages?.(monaco, () => ({
							catalog: state.catalog,
							schema: state.config?.schema,
						}));
						state.editor = monaco.editor.create(
							$('monaco'),
							sourceEditorOptions({ value: '', language: 'deck-markdown' })
						);
						state.editor.onDidChangeModelContent(() => {
							if (!state.switching) changed(state.editor.getValue());
						});
						state.editor.onDidChangeCursorPosition((event) => {
							$('editor-position').textContent =
								`Ln ${event.position.lineNumber}, Col ${event.position.column}`;
							if (!state.switching) followCursor();
						});
						state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save());
						state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () =>
							insert('bold')
						);
						state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () =>
							insert('italic')
						);
						applyAppearance();
						done();
					} catch (error) {
						fallback();
						done();
						toast('Source editor is using the local text fallback.', true);
					}
				},
				() => {
					fallback();
					done();
				}
			);
			setTimeout(() => {
				if (!settled) {
					fallback();
					done();
				}
			}, 12000);
		});
	}
	function fallback() {
		if (state.editor) return;
		const input = el('textarea', 'md-doc-local-editor');
		input.setAttribute('aria-label', 'Slide source');
		input.spellcheck = false;
		input.oninput = () => changed(input.value);
		input.onkeyup = input.onclick = () => followCursor();
		$('monaco').replaceChildren(input);
		state.fallback = input;
	}
	function cursorLine() {
		if (state.editor) return state.editor.getPosition()?.lineNumber || 1;
		if (state.fallback)
			return state.fallback.value.slice(0, state.fallback.selectionStart).split('\n').length;
		return 1;
	}
	async function loadBuffer(path) {
		if (!state.buffers.has(path)) {
			if (state.loadingFiles.has(path)) await state.loadingFiles.get(path);
			else {
				const loading = (async () => {
					const data = await api('/api/file?path=' + encodeURIComponent(path));
					const draft = state.recoveryDrafts[path];
					delete state.recoveryDrafts[path];
					const buffer = { ...data, saved: data.content, model: null, viewState: null };
					if (draft && draft.content !== data.content) {
						buffer.edited = true;
						buffer.content = draft.content;
						buffer.saved = draft.saved;
						buffer.revision = draft.revision;
						toast('Recovered an unsaved draft: ' + path, false, {
							label: 'Compare',
							run: () => compareBuffer(buffer, data),
						});
					}
					state.buffers.set(path, buffer);
				})();
				state.loadingFiles.set(path, loading);
				try {
					await loading;
				} finally {
					state.loadingFiles.delete(path);
				}
			}
		}
		return state.buffers.get(path);
	}
	async function openFile(path, line = null, { follow = true } = {}) {
		const file = state.files.find((item) => item.path === path);
		if (file && ['image', 'pdf', 'other'].includes(file.type)) {
			window.open('/' + path, '_blank', 'noopener');
			return;
		}
		const sequence = ++state.openSequence;
		await monacoReady;
		await loadBuffer(path);
		if (sequence !== state.openSequence) return state.buffers.get(path);
		const previous = current();
		if (previous && state.editor) previous.viewState = state.editor.saveViewState();
		state.active = path;
		const buffer = current();
		state.switching = true;
		if (state.editor) {
			if (!buffer.model)
				buffer.model = monaco.editor.createModel(
					buffer.content,
					language(buffer),
					monaco.Uri.parse('inmemory://deck/' + encodeURI(path))
				);
			state.editor.setModel(buffer.model);
			if (buffer.viewState) state.editor.restoreViewState(buffer.viewState);
			if (line) {
				state.editor.setPosition({ lineNumber: line, column: 1 });
				state.editor.revealLineInCenter(line);
			}
			state.editor.focus();
		} else if (state.fallback) state.fallback.value = buffer.content;
		state.switching = false;
		$('welcome').hidden = true;
		renderBreadcrumbs();
		$('editor-language').textContent = languageNames[language(buffer)];
		$('format-toolbar').hidden = !/\.(md|html)$/i.test(path);
		// Keep md-doc's "preview tab" behaviour: an untouched file closes when another opens.
		if (
			previous &&
			previous.path !== path &&
			!previous.edited &&
			!dirty(previous) &&
			!previous.saving &&
			!previous.pinned
		) {
			state.buffers.delete(previous.path);
			previous.model?.dispose();
		}
		applyMarkers();
		updateSaveState();
		renderSlides();
		renderTree();
		if (state.nav === 'files' && window.innerWidth <= 850)
			$('workbench').classList.remove('mobile-nav');
		persist();
		if (follow) followCursor(true);
		if (state.inspectTab === 'slide' && !$('inspector').hidden) renderInspector();
		return buffer;
	}
	function renderBreadcrumbs() {
		const parts = (state.active || '').split('/');
		$('editor-filename').replaceChildren();
		parts.forEach((part, index) => {
			if (index) $('editor-filename').append(icon('chevron-right'));
			$('editor-filename').append(el(index === parts.length - 1 ? 'strong' : 'span', null, part));
		});
	}
	function renderTabs() {
		const container = $('document-tabs');
		container.replaceChildren();
		for (const [path, buffer] of state.buffers) {
			const tab = el('div', 'document-tab' + (path === state.active ? ' active' : ''));
			const button = el('button');
			button.setAttribute('role', 'tab');
			button.setAttribute('aria-selected', path === state.active ? 'true' : 'false');
			button.append(
				icon(isSlide(path) ? 'slides' : /\.(css|js|json)$/.test(path) ? 'code' : 'file'),
				el('span', 'tab-name', path.split('/').pop())
			);
			button.title = path;
			button.onclick = () => openFile(path);
			button.ondblclick = () => {
				buffer.pinned = true;
			};
			if (dirty(buffer)) button.append(el('span', 'dirty-dot'));
			const close = el('button', 'tab-close');
			close.title = 'Close ' + path;
			close.setAttribute('aria-label', close.title);
			close.append(icon('close'));
			close.onclick = () => closeFile(path);
			tab.append(button, close);
			container.append(tab);
		}
		if (!state.buffers.size) container.append(el('span', 'tabs-empty', 'Your slides'));
	}
	async function closeFile(path, { force = false } = {}) {
		const buffer = state.buffers.get(path);
		if (!buffer) return;
		if (buffer.saving) {
			toast('Wait for the save to finish before closing this file.', true);
			return;
		}
		if (dirty(buffer) && !force) {
			const choice = await confirmDialog(
				'Close unsaved file?',
				path + ' has changes that are not saved to disk.',
				[
					{ label: 'Cancel', value: 'cancel' },
					{ label: 'Discard', value: 'discard', danger: true },
					{ label: 'Save & close', value: 'save', primary: true },
				]
			);
			if (!choice || choice === 'cancel') return;
			if (choice === 'save' && (!(await save(path)) || dirty(buffer))) return;
		}
		state.buffers.delete(path);
		buffer.model?.dispose();
		if (state.active === path) {
			state.active = null;
			const next = [...state.buffers.keys()].pop();
			if (next) await openFile(next);
			else {
				$('welcome').hidden = false;
				$('editor-filename').textContent = 'No file selected';
				if (state.editor) state.editor.setModel(null);
			}
		}
		persist();
		renderTree();
		renderSlides();
		schedulePreview(0);
	}
	async function save(path = null) {
		path ??= state.active;
		const buffer = state.buffers.get(path);
		if (!buffer || buffer.saving) return false;
		if (!dirty(buffer)) return true;
		const content = buffer.content;
		buffer.saving = true;
		updateSaveState();
		try {
			const result = await api('/api/file', {
				method: 'PUT',
				body: JSON.stringify({ path, content, revision: buffer.revision }),
			});
			buffer.saved = content;
			buffer.revision = result.revision;
			toast('Saved ' + path.split('/').pop());
			persist();
			renderTree();
			renderSlides();
			// Vite reloads the deck on its own for saved files; drop the overlay copy now.
			schedulePreview(0, { reload: false });
			scheduleLint(0);
			if (path === 'deck.config.js') loadConfig().catch(() => {});
			if (/\.css$|^components\//.test(path)) loadCatalog().catch(() => {});
			return !dirty(buffer);
		} catch (error) {
			if (error.status === 409) compareBuffer(buffer, error.detail);
			else toast(error.message, true);
			return false;
		} finally {
			buffer.saving = false;
			updateSaveState();
		}
	}
	async function saveAll(filter = () => true) {
		for (const buffer of [...state.buffers.values()])
			if (dirty(buffer) && filter(buffer.path) && !(await save(buffer.path))) return false;
		return true;
	}
	function setBufferContent(buffer, content) {
		state.switching = true;
		try {
			if (buffer.model && buffer.model.getValue() !== content) buffer.model.setValue(content);
			else if (!buffer.model && state.active === buffer.path && state.fallback)
				state.fallback.value = content;
		} finally {
			state.switching = false;
		}
		buffer.content = content;
	}
	function compareBuffer(buffer, disk) {
		const reviewedContent = buffer.content;
		const body = el('div');
		body.append(
			el(
				'p',
				null,
				'The disk file and your draft differ. Review them before choosing how to continue.'
			)
		);
		body.append(el('label', null, 'Your draft'));
		const draft = el('textarea', 'input');
		draft.value = buffer.content;
		draft.readOnly = true;
		body.append(draft, el('label', null, 'Current disk file'));
		const stored = el('textarea', 'input');
		stored.value = disk.content;
		stored.readOnly = true;
		body.append(stored);
		dialog(
			'Review file changes',
			body,
			[
				{ label: 'Keep editing', run: (d) => d.close() },
				{
					label: 'Use disk version',
					run: (d) => {
						if (buffer.saving || buffer.content !== reviewedContent) {
							toast('Your draft changed during review. Keep editing and compare again.', true);
							return;
						}
						buffer.saved = disk.content;
						buffer.revision = disk.revision;
						setBufferContent(buffer, disk.content);
						persist();
						schedulePreview(0);
						d.close();
					},
				},
				{
					label: 'Save my draft',
					primary: true,
					run: async (d) => {
						if (buffer.saving || buffer.content !== reviewedContent) {
							toast('Your draft changed during review. Keep editing and compare again.', true);
							return;
						}
						buffer.revision = disk.revision;
						if (await save(buffer.path)) d.close();
					},
				},
			],
			true
		);
	}
	const dirtyBuffers = (filter = () => true) =>
		Object.fromEntries(
			[...state.buffers]
				.filter(([path, buffer]) => dirty(buffer) && filter(path))
				.map(([path, buffer]) => [path, buffer.content])
		);

	/* ── Deck model and the Slides panel ────────────────────────────────── */

	async function loadDeck() {
		state.deck = await post('/api/deck', { buffers: dirtyBuffers(isSlide) });
		renderSlides();
		if (state.active) {
			renderBreadcrumbs();
			if (slideFor(state.active)) followCursor();
		}
		$('deck-count').textContent =
			`${state.deck.count} ${state.deck.count === 1 ? 'slide' : 'slides'} · ${state.deck.slides.length} files`;
	}
	function scheduleDeck() {
		clearTimeout(state.deckTimer);
		state.deckTimer = setTimeout(() => loadDeck().catch(() => {}), 700);
	}
	const slideFor = (path) => state.deck.slides.find((slide) => slide.path === path);
	const position = (slide, v = slide.v) =>
		`${slide.h + 1}${state.deck.slides.some((s) => s.h === slide.h && s !== slide) || slide.subslides.length > 1 ? '.' + (v + 1) : ''}`;
	function renderSlides() {
		const panel = $('slides-panel');
		if (!panel || state.nav !== 'slides') return;
		const filter = $('file-filter').value.toLowerCase();
		panel.replaceChildren();
		const groups = new Map();
		for (const slide of state.deck.slides) {
			if (filter && !(slide.title + ' ' + slide.file).toLowerCase().includes(filter)) continue;
			if (!groups.has(slide.h)) groups.set(slide.h, []);
			groups.get(slide.h).push(slide);
		}
		const counts = {};
		for (const problem of state.problems) counts[problem.path] = (counts[problem.path] || 0) + 1;
		const list = el('ol', 'slide-list');
		for (const [h, slides] of groups) {
			const stacked = slides[0].stack;
			const group = el('li', 'slide-group' + (stacked ? ' stacked' : ''));
			if (stacked) {
				const header = el('div', 'stack-header');
				header.draggable = true;
				header.append(icon('stack'), el('span', null, `Stack · ${slides.length} slides`));
				header.title = 'Drag to move the whole stack';
				header.ondragstart = (event) =>
					startDrag(
						event,
						slides.map((s) => s.file)
					);
				group.append(header);
			}
			for (const slide of slides) {
				const item = el('div', 'slide-item' + (slide.path === state.active ? ' active' : ''));
				item.draggable = true;
				item.dataset.file = slide.file;
				const number = el('span', 'slide-number', position(slide));
				const text = el('span', 'slide-text');
				text.append(el('strong', null, slide.title), el('small', null, slide.file));
				const meta = el('span', 'slide-meta');
				if (slide.subslides.length > 1) {
					const badge = el('span', 'slide-badge', `+${slide.subslides.length - 1}`);
					badge.title = `${slide.subslides.length} vertical sub-slides in this file`;
					meta.append(badge);
				}
				if (slide.notes) {
					const notes = icon('notes');
					notes.setAttribute('aria-label', 'Has speaker notes');
					meta.append(notes);
				}
				if (counts[slide.path]) {
					const problems = el('span', 'slide-badge warn', String(counts[slide.path]));
					problems.title = `${counts[slide.path]} problem(s)`;
					meta.append(problems);
				}
				if (dirty(state.buffers.get(slide.path))) meta.append(el('span', 'dirty-dot'));
				const more = el('button', 'icon-button small slide-more');
				more.title = 'Slide actions';
				more.setAttribute('aria-label', 'Actions for ' + slide.file);
				more.append(icon('more'));
				more.onclick = (event) => {
					event.stopPropagation();
					slideMenu(slide);
				};
				item.append(number, text, meta, more);
				item.onclick = () => openFile(slide.path);
				item.oncontextmenu = (event) => {
					event.preventDefault();
					slideMenu(slide);
				};
				item.ondragstart = (event) => startDrag(event, [slide.file]);
				item.ondragover = (event) => dragOver(event, item);
				item.ondragleave = () => item.removeAttribute('data-drop');
				item.ondrop = (event) => drop(event, item, slide);
				group.append(item);
			}
			list.append(group);
			group.dataset.h = String(h);
		}
		panel.append(list);
		if (!state.deck.slides.length)
			panel.append(
				el(
					'p',
					'tree-empty',
					filter ? 'No slides match this filter.' : 'No slides yet. Use + to add the first one.'
				)
			);
		const add = el('button', 'button ghost wide slide-add');
		add.append(icon('plus'), document.createTextNode('Add a slide'));
		add.onclick = () => newSlide();
		panel.append(add);
	}
	function startDrag(event, files) {
		event.stopPropagation();
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('application/x-deck-slides', JSON.stringify(files));
		state.dragging = files;
	}
	function dropZone(event, item) {
		const rect = item.getBoundingClientRect();
		const y = (event.clientY - rect.top) / rect.height;
		return y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'stack';
	}
	function dragOver(event, item) {
		if (!state.dragging || state.dragging.includes(item.dataset.file)) return;
		event.preventDefault();
		item.dataset.drop = dropZone(event, item);
	}
	async function drop(event, item, target) {
		event.preventDefault();
		const zone = dropZone(event, item);
		item.removeAttribute('data-drop');
		const files = state.dragging;
		state.dragging = null;
		if (!files || files.includes(target.file)) return;
		if (zone === 'stack' && files.length > 1) {
			toast("A stack can't go inside another stack. Drop it above or below a slide.", true);
			return;
		}
		// Before/after a stacked slide places the moved slide(s) beside the whole stack.
		const where =
			zone === 'stack'
				? target.major == null
					? null
					: { verticalOf: target.major }
				: { [zone]: target.slug };
		if (!where) {
			toast("That slide has no NN- number, so it can't take a stack.", true);
			return;
		}
		await slideAction(
			{ action: 'move', files, where },
			files.length > 1 ? 'Moved stack' : 'Moved slide'
		);
	}
	function slideMenu(slide) {
		const body = el('div');
		const siblings = state.deck.slides.filter((s) => s.h === slide.h);
		body.append(
			option('Open', slide.path, 'file', () => openFile(slide.path)),
			option('Insert a slide after', 'A new horizontal slide right after this one', 'plus', () =>
				newSlide({ where: { after: slide.slug } })
			),
			option('Insert a slide before', 'A new horizontal slide right before this one', 'plus', () =>
				newSlide({ where: { before: slide.slug } })
			)
		);
		if (slide.major != null)
			body.append(
				option(
					'Add a slide below (vertical)',
					'Make or extend a vertical stack here',
					'stack',
					() => newSlide({ where: { verticalOf: slide.major } })
				)
			);
		body.append(
			option('Duplicate', 'Copy this slide next to it', 'copy', () =>
				slideAction({ action: 'duplicate', file: slide.file }, 'Duplicated slide')
			),
			option('Rename slug', `#/${slide.slug} - updates its id and jump links`, 'edit', () =>
				renameSlug(slide)
			)
		);
		if (siblings.length > 1) {
			const last = siblings[siblings.length - 1];
			const anchor = last === slide ? siblings[siblings.length - 2] : last;
			body.append(
				option(
					'Move out of the stack',
					'Becomes its own horizontal slide after the stack',
					'move',
					() =>
						slideAction(
							{ action: 'move', files: [slide.file], where: { after: anchor.slug } },
							'Moved out of the stack'
						)
				)
			);
		}
		body.append(
			option('Show in preview', `Slide ${position(slide)}`, 'slides', () =>
				navigateTo(slide.h, slide.v)
			),
			option('Delete', 'Moves the file to .editor-trash/', 'trash', async () => {
				const choice = await confirmDialog(
					'Delete slide?',
					`Move ${slide.path} to .editor-trash/? You can restore it from there.`,
					[
						{ label: 'Cancel', value: false },
						{ label: 'Delete', value: true, danger: true },
					]
				);
				if (choice) await slideAction({ action: 'delete', file: slide.file }, 'Deleted slide');
			})
		);
		dialog(`${position(slide)} · ${slide.title}`, body);
	}
	function newSlide({ where = null } = {}) {
		const active = slideFor(state.active);
		const defaultWhere = where || (active ? { after: active.slug } : { end: true });
		const describe = (w) =>
			w.end
				? 'at the end of the deck'
				: w.after
					? `after ${w.after}`
					: w.before
						? `before ${w.before}`
						: `below slide ${w.verticalOf} (vertical stack)`;
		dialog(
			'Add a slide',
			`<p>The file is numbered into the gap ${escape(describe(defaultWhere))}, the same way <code>npm run make:slide</code> does it.</p>
      <label for="slide-title">Title</label><input class="input" id="slide-title" placeholder="What this slide says">
      <label for="slide-slug">Slug (optional)</label><input class="input" id="slide-slug" placeholder="derived from the title">
      <label for="slide-format">Format</label><select class="input" id="slide-format"><option value="md">Markdown</option><option value="html">HTML</option></select>`,
			[
				{ label: 'Cancel', run: (d) => d.close() },
				{
					label: 'Add slide',
					primary: true,
					run: async (d) => {
						const title = $('slide-title').value.trim();
						if (!title) {
							$('slide-title').focus();
							return;
						}
						const result = await slideAction(
							{
								action: 'insert',
								title,
								slug: $('slide-slug').value.trim() || undefined,
								format: $('slide-format').value,
								where: defaultWhere,
							},
							null
						);
						if (result) d.close();
					},
				},
			]
		);
	}
	function renameSlug(slide) {
		dialog(
			'Rename slug',
			`<p>Renames <code>${escape(slide.file)}</code>, updates its <code>id</code>/<code>data-slug</code> and every <code>#/${escape(slide.slug)}</code> jump link in slides/.</p><label for="new-slug">New slug</label><input class="input" id="new-slug" value="${escape(slide.slug)}">`,
			[
				{ label: 'Cancel', run: (d) => d.close() },
				{
					label: 'Rename',
					primary: true,
					run: async (d) => {
						if (
							await slideAction(
								{ action: 'rename-slug', file: slide.file, slug: $('new-slug').value },
								'Renamed slug'
							)
						)
							d.close();
					},
				},
			]
		);
	}
	async function slideAction(request, message) {
		// Structural edits rename files; unsaved slide text must be on disk first.
		if (Object.keys(dirtyBuffers(isSlide)).length) {
			const choice = await confirmDialog(
				'Save slide changes first?',
				'Reorganising slides renames files on disk. Save your unsaved slide edits before continuing.',
				[
					{ label: 'Cancel', value: false },
					{ label: 'Save all & continue', value: true, primary: true },
				]
			);
			if (!choice || !(await saveAll(isSlide))) return null;
		}
		const revisions = Object.fromEntries(
			[...state.buffers]
				.filter(([path]) => isSlide(path))
				.map(([path, buffer]) => [path, buffer.revision])
		);
		let result;
		try {
			result = await post('/api/slides/action', { ...request, revisions });
		} catch (error) {
			toast(error.message, true);
			return null;
		}
		for (const { from, to } of result.renamed) {
			const buffer = state.buffers.get(from);
			if (!buffer) continue;
			state.buffers.delete(from);
			buffer.path = to;
			state.buffers.set(to, buffer);
			if (state.active === from) state.active = to;
		}
		if (result.removed) await closeFile(result.removed, { force: true });
		for (const path of result.changed) {
			const buffer = state.buffers.get(path);
			if (buffer && !dirty(buffer)) {
				const disk = await api('/api/file?path=' + encodeURIComponent(path));
				buffer.saved = disk.content;
				buffer.revision = disk.revision;
				setBufferContent(buffer, disk.content);
			}
		}
		await Promise.all([loadTree(), loadDeck()]);
		persist();
		if (result.created) {
			await openFile(result.created);
			toast('Created ' + result.created);
		} else if (message)
			toast(
				message + (result.renamed.length ? ` · ${result.renamed.length} file(s) renumbered` : '')
			);
		schedulePreview(0);
		scheduleLint(0);
		return result;
	}

	/* ── Live preview ───────────────────────────────────────────────────── */

	function setRenderState(text, kind = '') {
		const node = $('preview-status');
		node.textContent = text;
		node.className = 'render-state ' + kind;
		$('preview-loading').hidden = kind !== 'updating';
	}
	function previewUrl() {
		const indices = state.frameIndices;
		return `/?__preview=${state.client}${indices ? `#/${indices.h}/${indices.v}` : ''}`;
	}
	function schedulePreview(delay = state.previewDelay, { reload = true } = {}) {
		clearTimeout(state.previewTimer);
		if (!state.auto && delay !== 0) {
			setRenderState('Paused', 'stale');
			return;
		}
		state.previewTimer = setTimeout(
			() => sendPreview(reload).catch((error) => setRenderState(error.message, 'failed')),
			delay
		);
	}
	async function sendPreview(reload) {
		const buffers = dirtyBuffers(isSlide);
		const signature = JSON.stringify(buffers);
		if (signature === state.previewSent) return;
		state.previewSent = signature;
		await post('/api/preview', { id: state.client, buffers });
		const count = Object.keys(buffers).length;
		$('preview-time').textContent = count
			? `Showing ${count} unsaved slide file${count === 1 ? '' : 's'}`
			: 'Showing saved files';
		if (reload) reloadFrame();
	}
	function reloadFrame() {
		setRenderState('Updating', 'updating');
		try {
			if (frameWindow()?.location.pathname === '/') frameWindow().location.reload();
			else $('deck-frame').src = previewUrl();
		} catch {
			$('deck-frame').src = previewUrl();
		}
	}
	function attachFrame() {
		const win = frameWindow();
		let attempts = 0;
		const wait = () => {
			const deck = win?.Reveal;
			if (deck?.isReady?.()) return hook(deck);
			if (deck?.on && !deck.__studioWaiting) {
				deck.__studioWaiting = true;
				deck.on('ready', () => hook(deck));
			}
			if (attempts++ < 100) setTimeout(wait, 100);
			else setRenderState('Deck did not start', 'failed');
		};
		const hook = (deck) => {
			if (deck.__studioHooked) return;
			deck.__studioHooked = true;
			applyPreviewTheme();
			deck.on('slidechanged', onFrameSlide);
			deck.on('overviewshown', () => setRenderState('Overview', ''));
			deck.on('overviewhidden', () => setRenderState('Ready', ''));
			setRenderState('Ready', '');
			// A (re)loaded deck follows the editor, never the other way round: the
			// restored hash can name a slide whose number just changed.
			const pending = state.pendingNavigation;
			state.pendingNavigation = null;
			showFramePosition();
			if (pending) navigateTo(pending.h, pending.v);
			else if (slideFor(state.active)) followCursor(true);
			// Errors inside slide scripts surface here rather than vanishing in the iframe.
			win.addEventListener('error', (event) =>
				setRenderState('Slide script error: ' + event.message, 'failed')
			);
		};
		wait();
	}
	function showFramePosition() {
		const deck = reveal();
		if (!deck) return null;
		const { h, v } = deck.getIndices();
		state.frameIndices = { h, v: v || 0 };
		$('deck-position').textContent =
			`${h + 1}${v ? '.' + (v + 1) : ''} / ${deck.getHorizontalSlides().length}`;
		const slide = slideAt(h, v || 0);
		$('preview-document').textContent = slide ? `${slide.path} · ${slide.title}` : '—';
		return { h, v, slide };
	}
	function onFrameSlide() {
		const shown = showFramePosition();
		if (!shown) return;
		const { h, v, slide } = shown;
		const target = state.navigatingTo;
		state.navigatingTo = null;
		if (target && target.h === h && target.v === (v || 0)) return;
		// The author navigated inside the preview: bring the matching source along.
		if (state.follow && slide && slide.path !== state.active) {
			const sub = slide.subslides.find((s) => s.v === (v || 0));
			openFile(slide.path, sub?.line || 1, { follow: false }).catch(() => {});
		}
		syncPresent(h, v || 0);
	}
	function slideAt(h, v) {
		const candidates = state.deck.slides.filter((slide) => slide.h === h);
		return candidates.find((slide) => slide.subslides.some((sub) => sub.v === v)) || candidates[0];
	}
	function navigateTo(h, v) {
		const deck = reveal();
		if (!deck) {
			state.pendingNavigation = { h, v };
			return;
		}
		const now = deck.getIndices();
		if (now.h === h && (now.v || 0) === v) return;
		state.navigatingTo = { h, v };
		deck.slide(h, v);
		syncPresent(h, v);
	}
	function followCursor(force = false) {
		const buffer = current();
		const slide = buffer && slideFor(buffer.path);
		if (!slide) {
			$('editor-slide').textContent = '—';
			return;
		}
		const starts = window.deckSubslideLines
			? window.deckSubslideLines(buffer.content, slide.ext)
			: [1];
		const line = cursorLine();
		let index = 0;
		starts.forEach((start, i) => {
			if (start <= line) index = i;
		});
		const v = slide.v + index;
		$('editor-slide').textContent = `Slide ${position(slide, v)}`;
		if (state.follow || force) navigateTo(slide.h, v);
	}
	function syncPresent(h, v) {
		const target = state.presentWindow;
		if (!target || target.closed) return;
		try {
			const deck = target.Reveal;
			if (deck?.isReady?.()) {
				const now = deck.getIndices();
				if (now.h !== h || (now.v || 0) !== v) deck.slide(h, v);
			}
		} catch {}
	}
	function applyPreviewTheme() {
		try {
			const root = frameWindow().document.documentElement;
			const theme = state.previewTheme || state.config?.values?.theme || '';
			if (theme) root.dataset.theme = theme;
			else delete root.dataset.theme;
		} catch {}
		if (state.inspectTab === 'theme' && !$('inspector').hidden) renderInspector();
	}
	function renderThemeSelect() {
		const select = $('preview-theme');
		const themes = state.catalog?.themes || [];
		const deckTheme = state.config?.values?.theme || '';
		select.replaceChildren(
			el('option', null, deckTheme ? `Deck skin (${deckTheme})` : 'Deck skin (default)')
		);
		select.firstChild.value = '';
		for (const name of ['default', ...themes]) {
			const item = el('option', null, `Preview: ${name}`);
			item.value = name;
			select.append(item);
		}
		select.value = state.previewTheme;
	}

	/* ── Lint / Problems ────────────────────────────────────────────────── */

	function scheduleLint(delay = 1200) {
		clearTimeout(state.lintTimer);
		state.lintTimer = setTimeout(() => runLint().catch(() => {}), delay);
	}
	async function runLint() {
		const { problems } = await post('/api/lint', { buffers: dirtyBuffers() });
		state.problems = problems;
		$('diagnostic-count').replaceChildren(
			icon(problems.length ? 'alert' : 'check'),
			document.createTextNode(
				problems.length
					? `${problems.length} issue${problems.length === 1 ? '' : 's'}`
					: 'No issues'
			)
		);
		applyMarkers();
		renderProblems();
		renderSlides();
		return problems;
	}
	function applyMarkers() {
		if (!state.editor || !window.monaco) return;
		for (const [path, buffer] of state.buffers) {
			if (!buffer.model) continue;
			monaco.editor.setModelMarkers(
				buffer.model,
				'deck-lint',
				state.problems
					.filter((problem) => problem.path === path)
					.map((problem) => ({
						startLineNumber: problem.line,
						endLineNumber: problem.line,
						startColumn: 1,
						endColumn: buffer.model.getLineMaxColumn(
							Math.min(problem.line, buffer.model.getLineCount())
						),
						message: `${problem.message} (${problem.source})`,
						severity:
							problem.severity === 'error'
								? monaco.MarkerSeverity.Error
								: monaco.MarkerSeverity.Warning,
					}))
			);
		}
	}
	function renderProblems() {
		const panel = $('problems-panel');
		panel.replaceChildren();
		const intro = el(
			'p',
			'inspector-note',
			'The checks behind npm run lint:slides and npm run check:vocab, including unsaved edits.'
		);
		const run = el('button', 'button ghost wide', 'Check deck now');
		run.onclick = () =>
			runLint().then((p) => toast(p.length ? `${p.length} issue(s) found` : 'No issues found'));
		panel.append(intro, run);
		if (!state.problems.length)
			panel.append(
				el(
					'p',
					'inspector-note',
					'No issues. Every class, component tag and custom property resolves.'
				)
			);
		for (const problem of state.problems) {
			const button = el('button', 'search-result problem-item');
			button.append(
				el('strong', null, `${problem.path}:${problem.line}`),
				el('small', null, problem.message)
			);
			button.onclick = () => openFile(problem.path, problem.line);
			panel.append(button);
		}
	}

	/* ── File tree ──────────────────────────────────────────────────────── */

	async function loadTree() {
		const result = await api('/api/tree');
		state.tree = result.tree;
		state.scanWarnings = result.scanWarnings || [];
		$('workspace-path').textContent = result.workspace;
		$('workspace-path').title = result.workspace;
		state.files = [];
		const flatten = (nodes) =>
			nodes.forEach((node) => {
				if (node.type === 'dir') flatten(node.children);
				else state.files.push(node);
			});
		flatten(result.tree);
		if (readStorage('folders', null) === null) store('folders', ['slides', 'components']);
		renderTree();
	}
	function renderTree() {
		const container = $('file-tree');
		if (state.nav !== 'files') return;
		const filter = $('file-filter').value.toLowerCase();
		container.replaceChildren();
		const build = (nodes) => {
			const list = el('ul', 'tree-list');
			for (const node of nodes) {
				if (node.type === 'dir') {
					const children = build(node.children);
					if (filter && !children.childElementCount) continue;
					const item = el('li');
					const details = el('details', 'tree-folder');
					details.open = !!filter || readStorage('folders', []).includes(node.path);
					const summary = el('summary');
					const chevron = icon('chevron-down');
					chevron.classList.add('chevron');
					const folderIcon = icon(details.open ? 'folder-open' : 'folder');
					const badge = el('span', 'document-count', String(node.documentCount || 0));
					badge.title = `${node.documentCount || 0} Markdown/HTML files`;
					summary.append(chevron, folderIcon, el('span', 'folder-name', node.name), badge);
					summary.title = node.path;
					details.append(summary, children);
					details.ontoggle = () => {
						folderIcon
							.querySelector('path')
							.setAttribute('d', icons[details.open ? 'folder-open' : 'folder']);
						if (filter) return;
						const folders = new Set(readStorage('folders', []));
						details.open ? folders.add(node.path) : folders.delete(node.path);
						store('folders', [...folders]);
					};
					item.append(details);
					list.append(item);
				} else {
					if (filter && !node.path.toLowerCase().includes(filter)) continue;
					const item = el('li');
					const button = el(
						'button',
						'tree-file ' + node.type + (node.path === state.active ? ' active' : '')
					);
					button.dataset.path = node.path;
					button.title = node.path;
					button.append(
						icon(
							node.type === 'image'
								? 'image'
								: ['css', 'js', 'json'].includes(node.type)
									? 'code'
									: isSlide(node.path)
										? 'slides'
										: 'markdown'
						),
						el('span', 'file-name', node.name)
					);
					if (dirty(state.buffers.get(node.path))) button.append(el('span', 'dirty-dot'));
					button.onclick = () => openFile(node.path);
					button.oncontextmenu = (event) => {
						event.preventDefault();
						fileMenu(node.path);
					};
					item.append(button);
					list.append(item);
				}
			}
			return list;
		};
		const list = build(state.tree);
		container.append(list);
		if (!list.childElementCount)
			container.append(
				el('p', 'tree-empty', filter ? 'No files match this filter.' : 'No editable files found.')
			);
	}
	function fileMenu(path) {
		const body = el('div');
		body.append(
			option('Open', path, 'file', () => openFile(path)),
			option('Rename or move', 'Change the path of this file', 'edit', () => renameFile(path)),
			option('Move to trash', 'Moves the file to .editor-trash/', 'trash', async () => {
				const choice = await confirmDialog('Move to trash?', `Move ${path} to .editor-trash/?`, [
					{ label: 'Cancel', value: false },
					{ label: 'Move to trash', value: true, danger: true },
				]);
				if (!choice) return;
				await post('/api/files/action', { action: 'trash', path });
				await closeFile(path, { force: true });
				await Promise.all([loadTree(), loadDeck()]);
				toast('Moved to .editor-trash/');
			})
		);
		dialog(path, body);
	}
	function renameFile(path) {
		dialog(
			'Rename or move',
			`<p>Slides are numbered by filename; use the Slides panel to reorder them.</p><label for="rename-path">New path</label><input class="input" id="rename-path" value="${escape(path)}">`,
			[
				{ label: 'Cancel', run: (d) => d.close() },
				{
					label: 'Rename',
					primary: true,
					run: async (d) => {
						const to = $('rename-path').value.trim();
						if (!to || to === path) return d.close();
						if (dirty(state.buffers.get(path)) && !(await save(path))) return;
						await post('/api/files/action', { action: 'rename', path, to });
						const buffer = state.buffers.get(path);
						if (buffer) {
							state.buffers.delete(path);
							buffer.path = to;
							state.buffers.set(to, buffer);
							if (state.active === path) state.active = to;
						}
						d.close();
						await Promise.all([loadTree(), loadDeck()]);
						persist();
					},
				},
			]
		);
	}
	function newFile() {
		const folder = state.active?.includes('/')
			? state.active.slice(0, state.active.lastIndexOf('/') + 1)
			: '';
		dialog(
			'Create a file',
			`<p>For a new slide use <strong>Add a slide</strong>, which numbers it for you.</p><label for="new-path">File path</label><input class="input" id="new-path" value="${escape(folder)}untitled.md">`,
			[
				{ label: 'Cancel', run: (d) => d.close() },
				{
					label: 'Create',
					primary: true,
					run: async (d) => {
						const path = $('new-path').value.trim();
						await post('/api/files/action', { action: 'create', path, content: '' });
						d.close();
						await Promise.all([loadTree(), loadDeck()]);
						await openFile(path);
					},
				},
			]
		);
	}

	/* ── Inspector: slide, deck config, theme, components ───────────────── */

	async function loadConfig() {
		state.config = await api('/api/config');
		renderThemeSelect();
		applyPreviewTheme();
		applyAspect();
		if (!$('inspector').hidden) renderInspector();
	}
	async function loadCatalog() {
		state.catalog = await api('/api/catalog');
		renderThemeSelect();
		if (!$('inspector').hidden) renderInspector();
	}
	function applyAspect() {
		const { width = 1920, height = 1080 } = state.config?.values || {};
		$('deck-frame-wrap').style.setProperty('--deck-aspect', `${width} / ${height}`);
	}
	function section(title) {
		const node = el('div', 'inspector-section');
		node.append(el('h3', null, title));
		return node;
	}
	function renderInspector() {
		document
			.querySelectorAll('[data-inspect]')
			.forEach((button) =>
				button.classList.toggle('active', button.dataset.inspect === state.inspectTab)
			);
		const content = $('inspector-content');
		content.replaceChildren();
		({
			slide: inspectSlide,
			deck: inspectDeck,
			theme: inspectTheme,
			components: inspectComponents,
		})[state.inspectTab](content);
		hydrate(content);
	}
	function inspectSlide(content) {
		const slide = slideFor(state.active);
		if (!slide) {
			content.append(
				el(
					'p',
					'inspector-note',
					'Open a slide from the Slides panel to see where it sits in the deck.'
				)
			);
			return;
		}
		const where = section('POSITION');
		for (const [label, value] of [
			['File', slide.path],
			['Slug', `#/${slide.slug}`],
			['Position', `${position(slide)}${slide.stack ? ' · in a vertical stack' : ''}`],
			['Sub-slides', String(slide.subslides.length)],
		]) {
			const row = el('div', 'property');
			row.append(el('label', null, label), el('div', 'inspector-value', value));
			where.append(row);
		}
		const actions = el('div', 'inspector-actions');
		for (const [label, run] of [
			['Rename slug', () => renameSlug(slide)],
			[
				'Duplicate',
				() => slideAction({ action: 'duplicate', file: slide.file }, 'Duplicated slide'),
			],
			['More…', () => slideMenu(slide)],
		]) {
			const button = el('button', 'button ghost', label);
			button.onclick = run;
			actions.append(button);
		}
		where.append(actions);
		content.append(where);
		const notes = section('SPEAKER NOTES');
		const text = current()?.content || '';
		const found =
			slide.ext === 'md'
				? text.match(/^Note:([\s\S]*?)(?=^--\s*$|$(?![\s\S]))/m)?.[1]
				: text.match(/<aside[^>]*class=["'][^"']*\bnotes\b[^>]*>([\s\S]*?)<\/aside>/i)?.[1];
		notes.append(
			found?.trim()
				? el('pre', 'theme-source', found.trim())
				: el(
						'p',
						'inspector-note',
						slide.ext === 'md'
							? 'Add a line starting with Note: for speaker notes.'
							: 'Add <aside class="notes">…</aside> for speaker notes.'
					)
		);
		content.append(notes);
	}
	function inspectDeck(content) {
		const config = state.config;
		if (!config) {
			content.append(el('p', 'inspector-note', 'Loading deck.config.js…'));
			return;
		}
		if (config.error)
			content.append(
				el('p', 'diagnostic-error', 'deck.config.js could not be loaded: ' + config.error)
			);
		const intro = el(
			'p',
			'inspector-note',
			'Edits rewrite the matching line in deck.config.js and keep its comments. The preview reloads when it saves.'
		);
		content.append(intro);
		const form = section('REVEAL OPTIONS');
		for (const [name, spec] of Object.entries(config.schema)) {
			if (spec.type === 'theme') continue;
			const row = el('div', 'property');
			const label = el('label', null, name);
			label.htmlFor = 'config-' + name;
			let input;
			const value = config.values[name];
			if (spec.type === 'bool') {
				input = el('select', 'input');
				for (const v of ['', 'true', 'false']) {
					const item = el('option', null, v === '' ? '(Reveal default)' : v);
					item.value = v;
					input.append(item);
				}
				input.value = value === undefined ? '' : String(value);
			} else if (spec.type === 'enum') {
				input = el('select', 'input');
				input.append(Object.assign(el('option', null, '(Reveal default)'), { value: '' }));
				for (const v of spec.values)
					input.append(Object.assign(el('option', null, String(v)), { value: JSON.stringify(v) }));
				input.value = value === undefined ? '' : JSON.stringify(value);
			} else {
				input = el('input', 'input');
				input.type = 'number';
				if (spec.type === 'number') input.step = '0.01';
				input.value = value ?? '';
			}
			input.id = 'config-' + name;
			input.onchange = () => {
				if (input.value === '')
					return toast('Remove a key by editing deck.config.js directly.', true);
				const parsed =
					spec.type === 'bool'
						? input.value === 'true'
						: spec.type === 'enum'
							? JSON.parse(input.value)
							: Number(input.value);
				setConfig(name, parsed);
			};
			row.append(label, input, el('div', 'provenance', spec.doc));
			form.append(row);
		}
		content.append(form);
		const structured = section('STRUCTURED OPTIONS');
		structured.append(
			el(
				'p',
				'inspector-note',
				config.structured.length
					? `${config.structured.join(', ')} - edit these in the source.`
					: 'Logo and footer chrome, and any other nested option, are edited in the source.'
			)
		);
		const open = el('button', 'button ghost wide', 'Open deck.config.js');
		open.onclick = () => openFile('deck.config.js');
		structured.append(open);
		content.append(structured);
	}
	async function setConfig(name, value) {
		const buffer = state.buffers.get('deck.config.js');
		if (dirty(buffer)) {
			toast('Save or discard your deck.config.js edits first.', true);
			return;
		}
		try {
			const result = await post('/api/config', {
				key: name,
				value,
				revision: state.config?.revision,
			});
			if (buffer) {
				buffer.saved = result.content;
				buffer.revision = result.revision;
				setBufferContent(buffer, result.content);
			}
			toast(`deck.config.js · ${name} updated`);
			await loadConfig();
		} catch (error) {
			toast(error.message, true);
			await loadConfig().catch(() => {});
		}
	}
	function inspectTheme(content) {
		const themes = state.catalog?.themes || [];
		const deckTheme = state.config?.values?.theme || '';
		const pick = section('SKIN');
		pick.append(
			el(
				'p',
				'inspector-note',
				'Skins are [data-theme] blocks in src/styles/vars/semantic.css. Preview one here, then make it the deck default.'
			)
		);
		for (const name of ['', ...themes]) {
			const row = el('label', 'theme-choice');
			const radio = el('input');
			radio.type = 'radio';
			radio.name = 'theme-choice';
			radio.checked =
				(state.previewTheme === 'default' ? '' : state.previewTheme || deckTheme) === name;
			radio.onchange = () => {
				state.previewTheme = name || 'default';
				$('preview-theme').value = state.previewTheme;
				applyPreviewTheme();
			};
			row.append(
				radio,
				el('span', null, name || 'default'),
				name === deckTheme ? el('span', 'exact-badge', 'deck default') : ''
			);
			pick.append(row);
		}
		const apply = el('button', 'button primary wide', 'Use the previewed skin for this deck');
		const previewed = state.previewTheme === 'default' ? '' : state.previewTheme;
		apply.disabled = !state.previewTheme || previewed === deckTheme;
		apply.onclick = async () => {
			await setConfig('theme', previewed);
			state.previewTheme = '';
			renderThemeSelect();
			applyPreviewTheme();
		};
		pick.append(apply);
		content.append(pick);
		const swatches = section('RESOLVED COLOURS (FROM THE PREVIEW)');
		const grid = el('div', 'swatch-grid');
		let style = null;
		try {
			style = frameWindow().getComputedStyle(frameWindow().document.documentElement);
		} catch {}
		for (const name of [
			'--bg',
			'--fg',
			'--muted',
			'--line',
			'--primary',
			'--primary-strong',
			'--secondary',
			'--success',
			'--warning',
			'--danger',
		]) {
			const value = style?.getPropertyValue(name).trim();
			if (!value) continue;
			const swatch = el('div', 'swatch');
			const chip = el('span', 'swatch-chip');
			chip.style.background = value;
			swatch.append(chip, el('code', null, name), el('small', null, value));
			grid.append(swatch);
		}
		swatches.append(
			grid.childElementCount
				? grid
				: el('p', 'inspector-note', 'Open the preview to read the live values.')
		);
		for (const font of ['--font-heading', '--font-body']) {
			const value = style?.getPropertyValue(font).trim();
			if (value) swatches.append(el('p', 'inspector-note', `${font}: ${value}`));
		}
		const source = el('button', 'button ghost wide', 'Open semantic.css');
		source.onclick = () => openFile('src/styles/vars/semantic.css');
		swatches.append(source);
		content.append(swatches);
	}
	function inspectComponents(content) {
		const components = state.catalog?.components || [];
		const list = section(`COMPONENTS · ${components.length}`);
		list.append(
			el(
				'p',
				'inspector-note',
				'Reusable <deck-*> elements from components/. Insert puts a tag at the cursor.'
			)
		);
		for (const component of components) {
			const card = el('div', 'field-card component-card');
			const name = el('button', null, `<${component.tag}>`);
			name.onclick = () => insertComponent(component);
			const actions = el('div', 'property-row');
			const insertButton = el('button', 'text-button', 'Insert');
			insertButton.onclick = () => insertComponent(component);
			const source = el('button', 'text-button', 'Source');
			source.onclick = () => openFile(component.path);
			actions.append(insertButton, source);
			card.append(
				name,
				el('p', null, component.description || ''),
				el(
					'p',
					'provenance',
					component.attributes.length
						? 'Attributes: ' + component.attributes.join(', ')
						: 'No attributes'
				),
				actions
			);
			list.append(card);
		}
		content.append(list);
		const classes = section('DECK.CSS CLASSES');
		const chips = el('div', 'class-chips');
		for (const name of state.catalog?.classes.deck || []) {
			const chip = el('button', 'class-chip', name);
			chip.title = 'Insert class name';
			chip.onclick = () => insertText(name);
			chips.append(chip);
		}
		classes.append(chips);
		content.append(classes);
	}

	/* ── Inserting ──────────────────────────────────────────────────────── */

	function insertText(text) {
		if (!current()) return toast('Open a slide first.', true);
		if (state.editor) {
			const selection = state.editor.getSelection();
			state.editor.executeEdits('deck-studio', [
				{ range: selection, text, forceMoveMarkers: true },
			]);
			state.editor.focus();
		} else if (state.fallback) {
			const input = state.fallback;
			input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
			changed(input.value);
		}
	}
	function componentSnippet(component) {
		const attrs = component.attributes
			.map((name) => (name === 'data' ? ` data='[]'` : ` ${name}=""`))
			.join('');
		return `<${component.tag}${attrs}></${component.tag}>`;
	}
	function insertComponent(component) {
		insertText(componentSnippet(component));
	}
	function selected() {
		if (state.editor)
			return state.editor.getModel()?.getValueInRange(state.editor.getSelection()) || '';
		if (state.fallback)
			return state.fallback.value.slice(state.fallback.selectionStart, state.fallback.selectionEnd);
		return '';
	}
	function insert(kind) {
		const buffer = current();
		if (!buffer) return;
		const md = /\.md$/i.test(buffer.path);
		const text = selected();
		const snippets = {
			heading: md ? `## ${text || 'Heading'}` : `<h2>${text || 'Heading'}</h2>`,
			bold: md ? `**${text || 'bold'}**` : `<strong>${text || 'bold'}</strong>`,
			italic: md ? `*${text || 'italic'}*` : `<em>${text || 'italic'}</em>`,
			list: md ? `\n- ${text || 'Point'}\n` : `<ul>\n\t<li>${text || 'Point'}</li>\n</ul>`,
			fragment: md
				? `${text || 'Revealed step'} <!-- .element: class="fragment" -->`
				: `<span class="fragment">${text || 'Revealed step'}</span>`,
			vertical: md ? '\n--\n\n' : null,
			notes: md ? '\nNote: ' : `<aside class="notes">\n\t${text || 'Speaker notes'}\n</aside>`,
			'slide-attrs': md ? `<!-- .slide: data-transition="fade" -->\n` : null,
		};
		const snippet = snippets[kind];
		if (snippet == null)
			return toast(
				kind === 'vertical'
					? "In HTML, nest <section>s inside the slide's <section> to make a vertical stack."
					: 'In HTML, put data-* attributes on the <section> tag (try typing data- inside it).',
				true
			);
		insertText(snippet);
	}
	function insertMenu() {
		const body = el('div');
		for (const component of state.catalog?.components || [])
			body.append(
				option(`<${component.tag}>`, component.description || component.path, 'component', () =>
					insertComponent(component)
				)
			);
		body.append(
			option('Jump link to a slide', 'Links to #/<slug>', 'link', () => linkMenu()),
			option('Background colour', 'data-background-color on this slide', 'palette', () =>
				insertText(
					/\.md$/i.test(state.active || '')
						? `<!-- .slide: data-background-color="var(--primary)" -->\n`
						: ` data-background-color="var(--primary)"`
				)
			)
		);
		dialog('Insert', body, [], true);
	}
	function linkMenu() {
		const body = el('div');
		for (const slide of state.deck.slides)
			body.append(
				option(`${position(slide)} · ${slide.title}`, `#/${slide.slug}`, 'link', () =>
					insertText(
						/\.md$/i.test(state.active || '')
							? `[${slide.title}](#/${slide.slug})`
							: `<a href="#/${slide.slug}">${escape(slide.title)}</a>`
					)
				)
			);
		dialog('Link to a slide', body);
	}

	/* ── Build ──────────────────────────────────────────────────────────── */

	function buildMenu() {
		const body = el('div');
		body.append(
			option('Build the deck', 'npm run build:deck → deck-dist/ (a static site)', 'play', () =>
				startBuild()
			),
			option('Preview the last build', 'Serve deck-dist/ locally and open it', 'external', () =>
				previewBuild()
			),
			option(
				'Print / save as PDF',
				"Opens Reveal's print view; use the browser's print dialog",
				'printer',
				() => window.open('/?print-pdf', '_blank', 'noopener')
			),
			option('Present', 'Open the deck in its own window, following the editor', 'slides', () =>
				present()
			)
		);
		body.append(
			el(
				'p',
				'inspector-note',
				'Building and previewing use saved files only. Save first to include your edits.'
			)
		);
		dialog('Build & present', body);
	}
	async function startBuild() {
		const dirtyCount = [...state.buffers.values()].filter(dirty).length;
		if (dirtyCount) {
			const choice = await confirmDialog(
				'Build with unsaved changes?',
				`${dirtyCount} file(s) have unsaved edits that the build will not include.`,
				[
					{ label: 'Cancel', value: null },
					{ label: 'Build saved files', value: 'build' },
					{ label: 'Save all & build', value: 'save', primary: true },
				]
			);
			if (!choice) return;
			if (choice === 'save' && !(await saveAll())) return;
		}
		let job;
		try {
			job = await post('/api/build', {});
		} catch (error) {
			if (error.detail?.job) job = await api('/api/jobs/' + error.detail.job);
			else throw error;
		}
		state.job = job.id;
		$('build-button').classList.add('building');
		showDiagnostics();
		pollBuild();
	}
	async function pollBuild() {
		if (!state.job) return;
		const job = await api('/api/jobs/' + state.job);
		state.jobData = job;
		renderDiagnostics();
		if (job.status === 'running') return setTimeout(() => pollBuild().catch(() => {}), 500);
		$('build-button').classList.remove('building');
		state.job = null;
		if (job.status === 'succeeded')
			toast(`Built deck-dist/ in ${((job.finished - job.started) / 1000).toFixed(1)} s`, false, {
				label: 'Preview build',
				run: () => previewBuild(),
			});
		else toast(`Build ${job.status}. See the build log.`, true);
	}
	async function previewBuild() {
		const { url } = await post('/api/build/preview', {});
		window.open(url, '_blank', 'noopener');
	}
	function showDiagnostics() {
		$('diagnostics-panel').hidden = false;
		renderDiagnostics();
	}
	function renderDiagnostics() {
		const content = $('diagnostics-content');
		content.replaceChildren();
		const job = state.jobData;
		if (job) {
			content.append(
				el(
					'p',
					job.status === 'failed' ? 'diagnostic-error' : 'diagnostic-info',
					`Build ${job.status}${job.finished ? ` · ${((job.finished - job.started) / 1000).toFixed(1)} s` : ''}`
				)
			);
			const log = el('pre', null, job.log || 'Starting…');
			content.append(log);
			setTimeout(() => (log.scrollTop = log.scrollHeight), 0);
		} else content.append(el('p', 'diagnostic-info', 'No build yet. Use Build → Build the deck.'));
		const status = $('preview-status').textContent;
		if ($('preview-status').classList.contains('failed'))
			content.append(el('p', 'diagnostic-error', status));
	}
	function present() {
		if (state.presentWindow && !state.presentWindow.closed) {
			state.presentWindow.focus();
			return;
		}
		const indices = state.frameIndices || { h: 0, v: 0 };
		state.presentWindow = window.open(
			`/?__preview=${state.client}#/${indices.h}/${indices.v}`,
			'deck-studio-present-' + state.client
		);
		if (!state.presentWindow)
			toast('Allow pop-ups for the editor to open the presenter window.', true);
	}

	/* ── Layout, appearance, navigation ─────────────────────────────────── */

	function nav(name) {
		if (
			state.nav === name &&
			!$('workbench').classList.contains('nav-hidden') &&
			(window.innerWidth > 850 || $('workbench').classList.contains('mobile-nav'))
		) {
			actions['nav-toggle']();
			return;
		}
		state.nav = name;
		$('sidebar').dataset.navigationPanel = name;
		$('sidebar-title').textContent = {
			slides: 'SLIDES',
			files: 'FILES',
			search: 'SEARCH',
			problems: 'PROBLEMS',
			git: 'SOURCE CONTROL',
		}[name];
		const panels = {
			slides: 'slides-panel',
			files: 'file-tree',
			search: 'search-panel',
			problems: 'problems-panel',
			git: 'git-panel',
		};
		for (const [panel, id] of Object.entries(panels)) $(id).hidden = panel !== name;
		$('file-filter').hidden = !['slides', 'files'].includes(name);
		$('file-filter').placeholder = name === 'slides' ? 'Filter slides…' : 'Filter files…';
		document
			.querySelectorAll('.rail-button[data-nav]')
			.forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
		$('workbench').classList.remove('nav-hidden');
		if (window.innerWidth <= 850) $('workbench').classList.toggle('mobile-nav');
		if (name === 'search') $('workspace-query').focus();
		if (name === 'git') loadGit().catch((error) => toast(error.message, true));
		if (name === 'slides') renderSlides();
		if (name === 'files') renderTree();
		if (name === 'problems') renderProblems();
		applyLayout();
	}
	function applyAppearance() {
		const dark =
			state.appearance === 'dark' ||
			(state.appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.dataset.theme = dark ? 'dark' : 'light';
		state.editor?.updateOptions({ theme: dark ? 'vs-dark' : 'deck-light' });
		const button = $('appearance-button');
		button.querySelector('svg path').setAttribute('d', icons[dark ? 'sun' : 'moon']);
		$('appearance-label').textContent = dark ? 'Light mode' : 'Dark mode';
		button.setAttribute('aria-pressed', String(dark));
		store('appearance', state.appearance);
	}
	function applyLayout() {
		const bench = $('workbench');
		if (['split', 'horizontal'].includes(state.layout)) state.lastPreviewLayout = state.layout;
		const previewVisible =
			state.layout !== 'source' &&
			(window.innerWidth > 850 || ['preview', 'horizontal'].includes(state.layout));
		$('preview-toggle').setAttribute('aria-pressed', String(previewVisible));
		$('preview-toggle').title = previewVisible ? 'Hide preview' : 'Show preview';
		$('preview-toggle-label').textContent = previewVisible ? 'Hide preview' : 'Show preview';
		for (const value of ['source', 'preview', 'horizontal'])
			bench.classList.toggle('layout-' + value, state.layout === value);
		const available =
			bench.clientWidth - 46 - (bench.classList.contains('nav-hidden') ? 0 : state.navWidth) - 10;
		const width = Math.max(320, Math.min(available - 320, available * state.editRatio));
		const navHidden = bench.classList.contains('nav-hidden');
		bench.style.setProperty('--nav-width', (navHidden ? 0 : state.navWidth) + 'px');
		bench.style.setProperty('--nav-splitter-width', navHidden ? '0px' : '5px');
		bench.style.setProperty('--edit-fraction', Math.max(0, width) + 'px');
		bench.style.setProperty('--horizontal-split', state.horizontalRatio * 100 + '%');
		$('preview-splitter').setAttribute(
			'aria-orientation',
			state.layout === 'horizontal' ? 'horizontal' : 'vertical'
		);
		$('preview-splitter').setAttribute('aria-valuenow', String(Math.round(available - width)));
		$('preview-splitter').setAttribute('aria-valuemax', String(Math.max(320, available - 320)));
		$('nav-splitter').setAttribute('aria-valuenow', String(Math.round(state.navWidth)));
		state.editor?.layout();
		store('layout', {
			layout: state.layout,
			navWidth: state.navWidth,
			editRatio: state.editRatio,
			horizontalRatio: state.horizontalRatio,
			navHidden: $('workbench').classList.contains('nav-hidden'),
		});
	}
	function splitters() {
		for (const id of ['nav-splitter', 'preview-splitter']) {
			const node = $(id);
			node.onpointerdown = (event) => {
				if (event.button !== 0) return;
				const start = event.clientX,
					startY = event.clientY,
					navWidth = state.navWidth,
					ratio = state.editRatio,
					horizontal = state.horizontalRatio;
				node.setPointerCapture(event.pointerId);
				node.classList.add('resizing');
				// The shield keeps the iframe from swallowing pointer moves mid-drag.
				$('resize-shield').hidden = false;
				const available = $('workbench').clientWidth - 46 - state.navWidth - 10;
				node.onpointermove = (move) => {
					if (id === 'nav-splitter')
						state.navWidth = Math.max(180, Math.min(420, navWidth + move.clientX - start));
					else if (state.layout === 'horizontal')
						state.horizontalRatio = Math.max(
							0.2,
							Math.min(0.8, horizontal + (move.clientY - startY) / $('workbench').clientHeight)
						);
					else
						state.editRatio = Math.max(
							320 / available,
							Math.min(1 - 320 / available, ratio + (move.clientX - start) / available)
						);
					applyLayout();
				};
				const end = () => {
					node.onpointermove = null;
					node.classList.remove('resizing');
					$('resize-shield').hidden = true;
				};
				node.onpointerup = end;
				node.onlostpointercapture = end;
			};
			node.ondblclick = () => {
				if (id === 'nav-splitter') state.navWidth = 260;
				else {
					state.editRatio = 0.5;
					state.horizontalRatio = 0.5;
				}
				applyLayout();
			};
			node.onkeydown = (event) => {
				const directions = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
				if (!(event.key in directions)) return;
				event.preventDefault();
				const amount = event.shiftKey ? 64 : 16;
				if (id === 'nav-splitter')
					state.navWidth = Math.max(
						180,
						Math.min(420, state.navWidth + directions[event.key] * amount)
					);
				else {
					const available = $('workbench').clientWidth - 46 - state.navWidth - 10;
					if (state.layout === 'horizontal')
						state.horizontalRatio = Math.max(
							0.2,
							Math.min(
								0.8,
								state.horizontalRatio +
									(directions[event.key] * amount) / $('workbench').clientHeight
							)
						);
					else
						state.editRatio = Math.max(
							320 / available,
							Math.min(
								1 - 320 / available,
								state.editRatio + (directions[event.key] * amount) / available
							)
						);
				}
				applyLayout();
			};
		}
	}
	function layoutMenu() {
		const body = el('div');
		for (const [value, label, description, iconName] of [
			['split', 'Side by side', 'Source on the left, the deck on the right', 'columns'],
			['horizontal', 'Stacked', 'Source above the deck', 'panel'],
			['source', 'Source only', 'More room for writing', 'code'],
			['preview', 'Preview only', 'Just the deck', 'slides'],
		])
			body.append(
				option(label, description, iconName, () => {
					state.layout = value;
					applyLayout();
				})
			);
		dialog('Workspace layout', body);
	}
	function settings() {
		dialog(
			'Studio settings',
			`<label for="setting-delay">Live preview delay</label><select class="input" id="setting-delay"><option value="300">Fast (0.3 s)</option><option value="600">Balanced (0.6 s)</option><option value="1500">Calm (1.5 s)</option></select>
      <label for="setting-appearance">Appearance</label><select class="input" id="setting-appearance"><option value="system">Match the system</option><option value="light">Light</option><option value="dark">Dark</option></select>
      <p class="inspector-note">Drafts are kept in this browser until saved. Every save keeps the previous version in .editor-history/.</p>`,
			[
				{
					label: 'Done',
					primary: true,
					run: (d) => {
						state.previewDelay = Number($('setting-delay').value);
						store('previewDelay', state.previewDelay);
						state.appearance = $('setting-appearance').value;
						applyAppearance();
						d.close();
					},
				},
			]
		);
		$('setting-delay').value = String(state.previewDelay);
		$('setting-appearance').value = state.appearance;
	}
	function help() {
		const rows = [
			['Ctrl S', 'Save the current file'],
			['Ctrl P', 'Quick open a slide or file'],
			['Ctrl K / F1', 'Commands'],
			['Ctrl B / Ctrl I', 'Bold / italic'],
			['Ctrl Space', 'Suggest classes, components, attributes'],
			['Drag a slide', 'Top/bottom edge: move before/after · middle: add to that stack'],
			['Esc', 'Close panels and dialogs'],
		];
		dialog(
			'Keyboard shortcuts',
			`<div class="shortcut-list">${rows.map(([k, d]) => `<div><kbd>${escape(k)}</kbd><span>${escape(d)}</span></div>`).join('')}</div>
      <p class="inspector-note">In the preview, Reveal's own keys work too: arrows, Esc for the overview, S for speaker view.</p>`,
			[{ label: 'Close', primary: true, run: (d) => d.close() }]
		);
	}
	function deckActions() {
		const body = el('div');
		body.append(
			option('Add a slide at the end', 'A new slide after the last one', 'plus', () =>
				newSlide({ where: { end: true } })
			),
			option(
				'Renumber the deck',
				'Rename every slide back to clean step-10 numbers',
				'list',
				async () => {
					const choice = await confirmDialog(
						'Renumber every slide?',
						'Renames slide files to 000, 010, 020… keeping their order. Tracked files are moved with git mv.',
						[
							{ label: 'Cancel', value: false },
							{ label: 'Renumber', value: true, primary: true },
						]
					);
					if (choice) await slideAction({ action: 'rebalance' }, 'Renumbered the deck');
				}
			),
			option('Open slides/README.md', 'The slide file conventions', 'file', () =>
				openFile('slides/README.md')
			),
			option('Open deck.css', "The deck's utilities and molecules", 'code', () =>
				openFile('deck.css')
			)
		);
		dialog('Deck', body);
	}

	/* ── Command palette ────────────────────────────────────────────────── */

	function commandPalette(kind = 'files') {
		$('command-query').value = kind === 'commands' ? '> ' : '';
		state.commandIndex = 0;
		commandResults();
		if (!$('command-dialog').open) $('command-dialog').showModal();
		$('command-query').focus();
		$('command-query').setSelectionRange(
			$('command-query').value.length,
			$('command-query').value.length
		);
	}
	function matchScore(value, query) {
		value = value.toLowerCase();
		if (!query) return 0;
		const direct = value.indexOf(query);
		if (direct >= 0) return direct;
		let position = -1,
			score = 100;
		for (const character of query.replace(/\s+/g, '')) {
			const next = value.indexOf(character, position + 1);
			if (next < 0) return Infinity;
			score += next - position - 1;
			position = next;
		}
		return score;
	}
	function commandResults() {
		const input = $('command-query');
		const raw = input.value.trimStart();
		const commands = raw.startsWith('>');
		const query = (commands ? raw.slice(1) : raw).trim().toLowerCase();
		$('command-hint').textContent = commands
			? 'Commands · remove > to search slides and files'
			: 'Slides & files · type > for commands';
		const commandList = [
			['Add a slide', 'new-slide', ''],
			['Create a file', 'new-file', ''],
			['Save file', 'save', 'Ctrl S'],
			['Build the deck', 'build', ''],
			['Build & present menu', 'build-menu', ''],
			['Present in a new window', 'present', ''],
			['Slide overview', 'overview', ''],
			['Speaker view', 'speaker', ''],
			['Check deck (lint)', 'lint', ''],
			['Change layout', 'layout', ''],
			['Inspector', 'inspector', ''],
			['Deck actions', 'deck-actions', ''],
			['Focus mode', 'focus', ''],
			['Studio settings', 'settings', ''],
			['Source control', 'git', ''],
			['Insert a component', 'insert-menu', ''],
		];
		const items = [];
		if (commands) {
			for (const [title, action, shortcut] of commandList) {
				const score = matchScore(title, query);
				if (!Number.isFinite(score)) continue;
				items.push({
					title,
					detail: 'Command',
					icon: 'settings',
					shortcut,
					score,
					run: () =>
						action === 'save' ? save() : action === 'git' ? nav('git') : actions[action](),
				});
			}
		} else {
			for (const slide of state.deck.slides) {
				const score = Math.min(matchScore(slide.title, query), matchScore(slide.file, query) + 10);
				if (!Number.isFinite(score)) continue;
				items.push({
					title: `${position(slide)} · ${slide.title}`,
					detail: slide.path,
					score: score - 5,
					icon: 'slides',
					run: () => openFile(slide.path),
				});
			}
			for (const file of state.files) {
				if (isSlide(file.path) || ['image', 'pdf', 'other'].includes(file.type)) continue;
				const score = Math.min(matchScore(file.name, query), matchScore(file.path, query) + 30);
				if (!Number.isFinite(score)) continue;
				items.push({
					title: file.name,
					detail: file.path,
					score,
					icon: ['css', 'js', 'json'].includes(file.type) ? 'code' : 'file',
					run: () => openFile(file.path),
				});
			}
		}
		if (query) items.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
		state.commands = items.slice(0, 70);
		state.commandIndex = Math.min(state.commandIndex, Math.max(0, state.commands.length - 1));
		const container = $('command-results');
		container.replaceChildren();
		state.commands.forEach((item, index) => {
			const button = el(
				'button',
				'command-item' + (index === state.commandIndex ? ' selected' : '')
			);
			button.id = 'command-option-' + index;
			button.setAttribute('role', 'option');
			button.setAttribute('aria-selected', index === state.commandIndex ? 'true' : 'false');
			button.append(icon(item.icon));
			const text = el('span', 'command-detail');
			text.append(el('strong', null, item.title), el('small', null, item.detail));
			button.append(text);
			if (item.shortcut) button.append(el('kbd', null, item.shortcut));
			button.onclick = () => executeCommand(index);
			container.append(button);
		});
		if (state.commands.length)
			input.setAttribute('aria-activedescendant', 'command-option-' + state.commandIndex);
		else {
			input.removeAttribute('aria-activedescendant');
			container.append(
				el(
					'p',
					'diagnostic-info',
					commands ? 'No matching commands.' : 'Nothing matches. Type > to search commands.'
				)
			);
		}
	}
	async function executeCommand(index) {
		const command = state.commands[index];
		if (!command) return;
		$('command-dialog').close();
		try {
			await command.run();
		} catch (error) {
			toast(error.message, true);
		}
	}

	/* ── Git (ported from md-doc editor) ────────────────────────────────── */

	async function loadGit() {
		const data = await api('/api/git/status');
		$('git-branch').lastElementChild.textContent = data.branch || 'No Git';
		const container = $('git-panel');
		container.replaceChildren();
		if (!data.available) {
			container.append(el('p', 'inspector-note', 'This deck is not inside a Git repository.'));
			return;
		}
		const heading = el('div', 'git-heading');
		heading.append(icon('git'), el('span', null, data.branch));
		container.append(heading);
		const controls = el('div', 'property-row');
		controls.append(
			option('New branch', 'Create from current branch', 'git', () => gitBranch()),
			option('Pull', 'Fast-forward only', 'refresh', () => gitPull())
		);
		container.append(controls);
		const staged = data.files.filter((f) => f.staged),
			unstaged = data.files.filter((f) => !f.staged || f.code[1] !== ' ');
		for (const [label, list] of [
			['STAGED CHANGES', staged],
			['CHANGES', unstaged],
		]) {
			container.append(el('label', 'field-label', label + ' · ' + list.length));
			for (const item of list) {
				const row = el('div', 'git-file');
				const diff = el('button', null, item.path);
				diff.title = item.path;
				diff.onclick = () => gitDiff(item.path, label === 'STAGED CHANGES');
				row.append(diff, el('span', 'git-code', item.code));
				if (label === 'CHANGES' && item.code !== '??' && item.code[1] === 'M') {
					const discard = el('button', 'icon-button small');
					discard.title = 'Discard working changes';
					discard.setAttribute('aria-label', discard.title + ' ' + item.path);
					discard.append(icon('trash'));
					discard.onclick = async () => {
						const choice = await confirmDialog(
							'Discard changes?',
							`Restore ${item.path} to its last committed or staged version? The discarded text is kept in .editor-history/.`,
							[
								{ label: 'Cancel', value: false },
								{ label: 'Discard', value: true, danger: true },
							]
						);
						if (!choice) return;
						try {
							await post('/api/git/action', { action: 'discard', path: item.path });
							await loadGit();
							await checkChanges(true);
						} catch (error) {
							toast(error.message, true);
						}
					};
					row.append(discard);
				}
				const stage = el('button', 'icon-button small');
				stage.title = label === 'STAGED CHANGES' ? 'Unstage' : 'Stage';
				stage.setAttribute('aria-label', stage.title + ' ' + item.path);
				stage.append(icon(label === 'STAGED CHANGES' ? 'undo' : 'plus'));
				stage.onclick = async () => {
					try {
						await post('/api/git/action', {
							action: label === 'STAGED CHANGES' ? 'unstage' : 'stage',
							path: item.path,
						});
						await loadGit();
					} catch (error) {
						toast(error.message, true);
					}
				};
				row.append(stage);
				container.append(row);
			}
		}
		if (!data.files.length) container.append(el('p', 'inspector-note', 'No changes in this deck.'));
		const message = el('textarea', 'input git-message');
		message.placeholder = 'Commit message';
		message.setAttribute('aria-label', 'Commit message');
		const commit = el('button', 'button primary wide', 'Commit staged changes');
		commit.disabled = !staged.length;
		commit.onclick = async () => {
			if (!message.value.trim()) {
				message.focus();
				return;
			}
			try {
				const choice = await confirmDialog(
					'Commit staged changes?',
					`Commit ${staged.length} file(s) on ${data.branch} with message: ${message.value}`,
					[
						{ label: 'Cancel', value: false },
						{ label: 'Commit', value: true, primary: true },
					]
				);
				if (choice) {
					await post('/api/git/action', { action: 'commit', message: message.value });
					await loadGit();
					toast('Committed staged changes');
				}
			} catch (error) {
				toast(error.message, true);
			}
		};
		container.append(message, commit, el('label', 'field-label', 'RECENT COMMITS'));
		for (const [hash, subject, ago] of data.history || []) {
			const item = el('div', 'git-log');
			item.append(el('strong', null, subject), el('span', null, hash + ' · ' + ago));
			container.append(item);
		}
	}
	async function gitDiff(path, staged) {
		const data = await api('/api/git/diff?path=' + encodeURIComponent(path) + '&staged=' + staged);
		const pre = el('pre', 'git-diff');
		for (const line of data.diff.split('\n'))
			pre.append(
				el(
					'div',
					line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : '',
					line
				)
			);
		dialog(
			(staged ? 'Staged diff: ' : 'Diff: ') + path,
			pre,
			[{ label: 'Close', run: (d) => d.close() }],
			true
		);
	}
	function gitBranch() {
		dialog(
			'Create a Git branch',
			`<p>Create and switch to a new branch from the current commit.</p><label for="branch-name">Branch name</label><input class="input" id="branch-name" placeholder="talk/new-section">`,
			[
				{ label: 'Cancel', run: (d) => d.close() },
				{
					label: 'Create branch',
					primary: true,
					run: async (d) => {
						await post('/api/git/action', {
							action: 'branch',
							branch: $('branch-name').value.trim(),
						});
						d.close();
						await loadGit();
					},
				},
			]
		);
	}
	async function gitPull() {
		const choice = await confirmDialog(
			'Pull repository changes?',
			'Fetch and fast-forward the current branch from its configured upstream. Git will stop if a merge is needed.',
			[
				{ label: 'Cancel', value: false },
				{ label: 'Pull changes', value: true, primary: true },
			]
		);
		if (choice) {
			await post('/api/git/action', { action: 'pull' });
			toast('Repository updated');
			await checkChanges(true);
			await loadGit();
		}
	}

	/* ── Change polling (as md-doc editor) ──────────────────────────────── */

	async function checkChanges(force = false) {
		if ((document.hidden && !force) || state.checkingChanges) return;
		state.checkingChanges = true;
		try {
			const data = await api('/api/changes');
			$('connection-dot').classList.remove('offline');
			$('connection-status').textContent = 'Connected';
			if (force || state.pendingFileRefresh || data.signature !== state.changeSignature) {
				const first = state.changeSignature === null;
				state.pendingFileRefresh = false;
				await Promise.all([loadTree(), loadDeck()]);
				for (const [path, buffer] of state.buffers) {
					try {
						const observedRevision = buffer.revision;
						if (buffer.saving) {
							state.pendingFileRefresh = true;
							continue;
						}
						const disk = await api('/api/file?path=' + encodeURIComponent(path));
						if (
							state.buffers.get(path) !== buffer ||
							buffer.saving ||
							buffer.revision !== observedRevision
						) {
							state.pendingFileRefresh = true;
							continue;
						}
						if (disk.revision !== buffer.revision) {
							if (!dirty(buffer) || disk.content === buffer.content) {
								const viewState = state.active === path ? state.editor?.saveViewState() : null;
								buffer.saved = disk.content;
								buffer.revision = disk.revision;
								setBufferContent(buffer, disk.content);
								if (viewState) state.editor.restoreViewState(viewState);
							} else if (disk.content === buffer.saved) {
								buffer.revision = disk.revision;
							}
						}
					} catch (error) {
						state.pendingFileRefresh = error.status !== 404;
						if (error.status === 404) toast('File removed on disk: ' + path, true);
					}
				}
				persist();
				if (!first) {
					scheduleLint(300);
					if (state.nav === 'git') await loadGit();
				}
			}
			state.changeSignature = data.signature;
		} catch {
			$('connection-dot').classList.add('offline');
			$('connection-status').textContent = 'Reconnecting…';
		} finally {
			state.checkingChanges = false;
		}
	}

	/* ── Actions and start-up ───────────────────────────────────────────── */

	const actions = {
		'quick-open': () => commandPalette('files'),
		appearance: () => {
			const dark = document.documentElement.dataset.theme === 'dark';
			state.appearance = dark ? 'light' : 'dark';
			applyAppearance();
		},
		help,
		settings,
		layout: layoutMenu,
		'deck-actions': deckActions,
		'new-slide': () => newSlide(),
		'new-file': newFile,
		'refresh-tree': () => checkChanges(true),
		'open-first': () =>
			state.deck.slides[0]
				? openFile(state.deck.slides[0].path)
				: newSlide({ where: { end: true } }),
		'toggle-preview': () => {
			state.layout = state.layout === 'source' ? state.lastPreviewLayout || 'split' : 'source';
			applyLayout();
		},
		'maximize-preview': () => {
			state.layout = state.layout === 'preview' ? state.lastPreviewLayout || 'split' : 'preview';
			applyLayout();
		},
		inspector: () => {
			$('inspector').hidden = !$('inspector').hidden;
			if (!$('inspector').hidden) renderInspector();
		},
		focus: () => {
			$('studio').classList.toggle('focus');
			applyLayout();
		},
		'nav-toggle': () => {
			if (window.innerWidth <= 850) $('workbench').classList.toggle('mobile-nav');
			else $('workbench').classList.toggle('nav-hidden');
			applyLayout();
		},
		diagnostics: () => {
			$('diagnostics-panel').hidden = !$('diagnostics-panel').hidden;
			if (!$('diagnostics-panel').hidden) renderDiagnostics();
		},
		lint: () =>
			runLint().then((problems) => {
				toast(
					problems.length ? `${problems.length} issue(s) found` : 'No issues found',
					!!problems.length
				);
				if (problems.length) nav('problems');
			}),
		'refresh-preview': () => {
			state.previewSent = null;
			schedulePreview(0);
			reloadFrame();
		},
		overview: () => reveal()?.toggleOverview(),
		speaker: () => {
			const notes = reveal()?.getPlugin?.('notes');
			if (notes) notes.open();
			else toast('The deck has no speaker notes plugin.', true);
		},
		'print-view': () => window.open('/?print-pdf', '_blank', 'noopener'),
		present,
		'build-menu': buildMenu,
		build: () => startBuild(),
		'insert-menu': insertMenu,
		'editor-find': () => state.editor?.getAction('actions.find')?.run(),
	};
	async function init() {
		hydrate();
		monacoReady = initMonaco();
		splitters();
		document.addEventListener('click', (event) => {
			const action = event.target.closest('[data-action]');
			if (action) {
				const fn = actions[action.dataset.action];
				if (fn)
					Promise.resolve()
						.then(fn)
						.catch((error) => toast(error.message, true));
			}
			const tool = event.target.closest('[data-insert]');
			if (tool) insert(tool.dataset.insert);
			const rail = event.target.closest('[data-nav]');
			if (rail) nav(rail.dataset.nav);
			const inspection = event.target.closest('[data-inspect]');
			if (inspection) {
				state.inspectTab = inspection.dataset.inspect;
				renderInspector();
			}
		});
		$('save-btn').onclick = () => save();
		$('dialog-close').onclick = () => $('form-dialog').close();
		$('dialog-form').onsubmit = (event) => event.preventDefault();
		for (const id of ['command-dialog', 'form-dialog'])
			$(id).addEventListener('click', (event) => {
				if (event.target === $(id)) {
					const rect = $(id).getBoundingClientRect();
					if (
						event.clientX < rect.left ||
						event.clientX > rect.right ||
						event.clientY < rect.top ||
						event.clientY > rect.bottom
					)
						$(id).close();
				}
			});
		$('file-filter').oninput = () => (state.nav === 'slides' ? renderSlides() : renderTree());
		$('auto-preview').onchange = () => {
			state.auto = $('auto-preview').checked;
			store('auto', state.auto);
			if (state.auto) schedulePreview(0);
			else setRenderState('Paused', 'stale');
		};
		$('follow-cursor').onchange = () => {
			state.follow = $('follow-cursor').checked;
			store('follow', state.follow);
			if (state.follow) followCursor(true);
		};
		$('preview-theme').onchange = () => {
			state.previewTheme = $('preview-theme').value;
			applyPreviewTheme();
		};
		$('deck-prev').onclick = () => reveal()?.prev();
		$('deck-next').onclick = () => reveal()?.next();
		$('deck-frame').addEventListener('load', attachFrame);
		let searchTimer;
		$('workspace-query').oninput = () => {
			clearTimeout(searchTimer);
			searchTimer = setTimeout(async () => {
				const query = $('workspace-query').value;
				try {
					const result = await api('/api/search?q=' + encodeURIComponent(query));
					if (query !== $('workspace-query').value) return;
					$('search-results').replaceChildren();
					for (const item of result.results) {
						const button = el('button', 'search-result');
						button.append(
							el('strong', null, item.path + ':' + item.line),
							el('small', null, item.text)
						);
						button.onclick = () => openFile(item.path, item.line);
						$('search-results').append(button);
					}
					if (!result.results.length && query)
						$('search-results').append(el('p', 'inspector-note', 'No matches.'));
				} catch (error) {
					toast(error.message, true);
				}
			}, 250);
		};
		$('command-query').oninput = () => {
			state.commandIndex = 0;
			commandResults();
		};
		$('command-query').onkeydown = (event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				state.commandIndex = Math.max(
					0,
					Math.min(
						state.commands.length - 1,
						state.commandIndex + (event.key === 'ArrowDown' ? 1 : -1)
					)
				);
				commandResults();
				$('command-results').children[state.commandIndex]?.scrollIntoView({ block: 'nearest' });
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				executeCommand(state.commandIndex);
			}
		};
		document.addEventListener(
			'keydown',
			(event) => {
				if (event.key === 'Escape') {
					$('studio').classList.remove('focus');
					$('inspector').hidden = true;
					$('workbench').classList.remove('mobile-nav');
					applyLayout();
				}
				if (event.key === 'F1') {
					event.preventDefault();
					event.stopPropagation();
					commandPalette('commands');
					return;
				}
				if (!(event.ctrlKey || event.metaKey)) return;
				if (['p', 'k', 's'].includes(event.key.toLowerCase())) {
					event.preventDefault();
					event.stopPropagation();
					if (event.key.toLowerCase() === 's') save();
					else
						commandPalette(
							event.key.toLowerCase() === 'p' && !event.shiftKey ? 'files' : 'commands'
						);
				}
			},
			true
		);
		window.addEventListener('beforeunload', (event) => {
			if ([...state.buffers.values()].some(dirty)) {
				event.preventDefault();
				event.returnValue = '';
			}
		});
		new ResizeObserver(() => applyLayout()).observe($('workbench'));
		matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
			if (state.appearance === 'system') applyAppearance();
		});
		try {
			state.workspace = await api('/api/capabilities');
			state.session = state.workspace.session;
			$('workspace-button').title = state.workspace.workspace;
			$('workspace-name').textContent = state.workspace.name;
			$('workspace-button').onclick = () => nav('files');
			state.recoveryDrafts = readStorage('drafts', {});
			const layout = readStorage('layout', {});
			Object.assign(state, {
				layout: layout.layout || 'split',
				navWidth: layout.navWidth || 260,
				editRatio: layout.editRatio || 0.5,
				horizontalRatio: layout.horizontalRatio || 0.5,
			});
			$('workbench').classList.toggle('nav-hidden', !!layout.navHidden);
			state.appearance = readStorage('appearance', 'system');
			state.auto = readStorage('auto', true);
			state.follow = readStorage('follow', true);
			state.previewDelay = readStorage('previewDelay', 600);
			$('auto-preview').checked = state.auto;
			$('follow-cursor').checked = state.follow;
			applyAppearance();
			await Promise.all([
				loadTree(),
				loadDeck(),
				loadConfig().catch(() => {}),
				loadCatalog().catch(() => {}),
			]);
			nav('slides');
			applyLayout();
			// The preview starts on the overlay id, so unsaved drafts show from the first paint.
			await sendPreview(false).catch(() => {});
			$('deck-frame').src = previewUrl();
			const session = readStorage('session', {});
			for (const path of session.paths || [])
				try {
					await loadBuffer(path);
				} catch {}
			const requested = new URLSearchParams(location.search).get('file');
			const start =
				requested || (session.active && state.buffers.has(session.active) ? session.active : null);
			if (start) await openFile(start);
			await checkChanges(true);
			await runLint().catch(() => {});
			loadGit().catch(() => {});
			setInterval(checkChanges, 1000);
			window.addEventListener('focus', () => checkChanges());
			document.addEventListener('visibilitychange', () => checkChanges());
		} catch (error) {
			toast('Could not connect to the deck: ' + error.message, true);
			$('connection-status').textContent = 'Disconnected';
		}
	}
	document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
