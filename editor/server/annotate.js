// Source positions for the preview. In an editor preview (/?__preview=<id>)
// every element of an HTML slide carries data-studio-src="<file>:<offset>",
// the offset of its start tag in the text the editor holds. Clicking an
// element in the preview then names the exact tag the animation tools edit
// (editor/static/source-edit.js). Never applied to `npm start` or a build.

import { parseStartTag } from '../static/source-edit.js';

const RAW_TEXT = new Set(['script', 'style', 'textarea']);

export function annotateHtml(text, file) {
	let out = '';
	let copied = 0;
	let i = 0;
	while ((i = text.indexOf('<', i)) >= 0) {
		if (text.startsWith('<!--', i)) {
			const end = text.indexOf('-->', i + 4);
			i = end < 0 ? text.length : end + 3;
			continue;
		}
		if (!/[a-zA-Z]/.test(text[i + 1] || '')) {
			i++;
			continue;
		}
		let tag;
		try {
			tag = parseStartTag(text, i);
		} catch {
			i++;
			continue;
		}
		const insert = tag.attrsEnd;
		out += text.slice(copied, insert) + ` data-studio-src="${file}:${i}"`;
		copied = insert;
		i = tag.end;
		if (RAW_TEXT.has(tag.name)) {
			const close = text.toLowerCase().indexOf(`</${tag.name}`, i);
			i = close < 0 ? text.length : close;
		}
	}
	return out + text.slice(copied);
}
