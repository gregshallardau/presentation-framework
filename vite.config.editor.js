/**
 * The GUI editor: `npm run edit`. The same dev server as `npm start` (same
 * aliases, same slides() assembler) plus the deck-editor plugin, which serves
 * the editor at /__editor/ and shares an in-memory overlay with slides() so the
 * preview shows unsaved buffers. See editor/README.md.
 */
import { defineConfig } from 'vite';
import slides from './build/vite-plugin-slides.js';
import deckEditor from './editor/server/plugin.js';
import { createOverlay } from './editor/server/overlay.js';

const overlay = createOverlay();

export default defineConfig({
	server: {
		port: Number(process.env.npm_config_port || 8000),
		host: '127.0.0.1',
		watch: {
			// Editor recovery copies must not trigger deck reloads.
			ignored: ['**/.editor-history/**', '**/.editor-trash/**'],
		},
	},
	resolve: {
		alias: {
			'reveal.js/plugin': '/vendor/reveal.js/plugin',
			'reveal.js': '/vendor/reveal.js/js',
			'reveal.css': '/vendor/reveal.js/css/reveal.scss',
			'@': '/src',
		},
	},
	plugins: [slides({ overlay }), deckEditor({ overlay })],
	css: {
		preprocessorOptions: {
			scss: {
				api: 'modern-compiler',
			},
		},
	},
});
