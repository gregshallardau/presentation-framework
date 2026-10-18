/**
 * A small context menu for the editor page: nested submenus, ✓ states,
 * disabled items, separators, an optional filter box (long lists such as
 * the deck.css classes), hover callbacks (live previews) and full keyboard
 * use - arrows, Enter, Esc, ←/→ for submenus. Clicking outside closes it.
 *
 * Item: { label, hint?, checked?, disabled?, run?(), items?: Item[] | () => Item[],
 *         filter?: boolean, hover?(on), separator?: true }
 */

let openRoot = null;

export function closeMenu() {
	openRoot?.close();
}

export function openMenu(items, { x, y }) {
	closeMenu();
	const stack = [];
	const layer = document.createElement('div');
	layer.className = 'ctx-layer';
	document.body.append(layer);

	function close() {
		for (const level of stack) level.leave?.();
		layer.remove();
		document.removeEventListener('pointerdown', outside, true);
		document.removeEventListener('keydown', key, true);
		window.removeEventListener('blur', close);
		window.removeEventListener('resize', close);
		if (openRoot?.close === close) openRoot = null;
	}

	function place(menu, left, top, from) {
		menu.style.left = `${left}px`;
		menu.style.top = `${top}px`;
		const box = menu.getBoundingClientRect();
		if (box.right > innerWidth - 8)
			menu.style.left = `${Math.max(8, from ? from.left - box.width : innerWidth - box.width - 8)}px`;
		if (box.bottom > innerHeight - 8)
			menu.style.top = `${Math.max(8, innerHeight - box.height - 8)}px`;
	}

	function build(list, depth, left, top, from) {
		while (stack.length > depth) stack.pop().menu.remove();
		const menu = document.createElement('div');
		menu.className = 'ctx-menu';
		menu.setAttribute('role', 'menu');
		const level = { menu, rows: [], index: -1, leave: null };
		stack.push(level);
		const resolved = typeof list === 'function' ? list() : list;
		const wantsFilter = stack[depth - 1]?.filterNext;
		let filterInput = null;
		const render = (query = '') => {
			menu.querySelectorAll('.ctx-item, .ctx-sep, .ctx-empty').forEach((n) => n.remove());
			level.rows = [];
			const q = query.trim().toLowerCase();
			for (const item of resolved) {
				if (item.separator) {
					if (!q)
						menu.append(Object.assign(document.createElement('div'), { className: 'ctx-sep' }));
					continue;
				}
				if (q && !item.label.toLowerCase().includes(q)) continue;
				const row = document.createElement('button');
				row.type = 'button';
				row.className = 'ctx-item' + (item.items ? ' has-sub' : '');
				row.setAttribute('role', 'menuitem');
				row.disabled = !!item.disabled;
				const check = document.createElement('span');
				check.className = 'ctx-check';
				check.textContent = item.checked ? '✓' : '';
				const label = document.createElement('span');
				label.className = 'ctx-label';
				label.textContent = item.label;
				row.append(check, label);
				if (item.hint) {
					const hint = document.createElement('span');
					hint.className = 'ctx-hint';
					hint.textContent = item.hint;
					row.append(hint);
				}
				const index = level.rows.length;
				level.rows.push({ row, item });
				row.onmouseenter = () => focusRow(level, index, true);
				row.onclick = () => activate(level, index);
				menu.append(row);
			}
			if (!level.rows.length)
				menu.append(
					Object.assign(document.createElement('div'), {
						className: 'ctx-empty',
						textContent: 'Nothing matches',
					})
				);
		};
		if (wantsFilter) {
			filterInput = document.createElement('input');
			filterInput.className = 'ctx-filter';
			filterInput.placeholder = 'Filter…';
			filterInput.oninput = () => {
				level.index = -1;
				render(filterInput.value);
			};
			menu.append(filterInput);
		}
		render();
		layer.append(menu);
		place(menu, left, top, from);
		// Right-clicks start in the preview iframe: bring keyboard focus here.
		menu.tabIndex = -1;
		setTimeout(() => (filterInput || menu).focus({ preventScroll: true }), 0);
		return level;
	}

	function focusRow(level, index, fromPointer = false) {
		const depth = stack.indexOf(level);
		const previous = level.rows[level.index];
		if (previous && level.index !== index) previous.item.hover?.(false);
		level.index = index;
		level.rows.forEach(({ row }, i) => row.classList.toggle('active', i === index));
		const current = level.rows[index];
		if (!current) return;
		if (!fromPointer) current.row.scrollIntoView({ block: 'nearest' });
		current.item.hover?.(true);
		level.leave = () => current.item.hover?.(false);
		if (current.item.items && !current.item.disabled) {
			level.filterNext = !!current.item.filter;
			const box = current.row.getBoundingClientRect();
			build(current.item.items, depth + 1, box.right - 2, box.top - 5, box);
		} else while (stack.length > depth + 1) stack.pop().menu.remove();
	}

	function activate(level, index) {
		const current = level.rows[index];
		if (!current || current.item.disabled) return;
		if (current.item.items) {
			focusRow(level, index);
			const child = stack[stack.indexOf(level) + 1];
			if (child) focusRow(child, 0);
			return;
		}
		current.item.hover?.(false);
		close();
		Promise.resolve().then(() => current.item.run?.());
	}

	function key(event) {
		const level = stack[stack.length - 1];
		const depth = stack.length - 1;
		const typing = event.target.classList?.contains('ctx-filter');
		const move = (delta) => {
			const count = level.rows.length;
			if (!count) return;
			let i = level.index;
			for (let n = 0; n < count; n++) {
				i = (i + delta + count) % count;
				if (!level.rows[i].item.disabled) break;
			}
			focusRow(level, i);
		};
		if (event.key === 'Escape') {
			event.preventDefault();
			if (depth > 0) {
				stack.pop().menu.remove();
				stack[stack.length - 1].menu.querySelector('.ctx-item.active')?.focus();
			} else close();
		} else if (event.key === 'ArrowDown') move(1);
		else if (event.key === 'ArrowUp') move(-1);
		else if (event.key === 'ArrowRight' && !typing) {
			if (level.rows[level.index]?.item.items) activate(level, level.index);
		} else if (event.key === 'ArrowLeft' && !typing && depth > 0) stack.pop().menu.remove();
		else if (event.key === 'Enter') activate(level, Math.max(0, level.index));
		else return;
		event.preventDefault();
		event.stopPropagation();
	}

	function outside(event) {
		if (!layer.contains(event.target)) close();
	}

	build(items, 0, x, y);
	document.addEventListener('pointerdown', outside, true);
	document.addEventListener('keydown', key, true);
	window.addEventListener('blur', close);
	window.addEventListener('resize', close);
	openRoot = { close };
	return { close };
}
