#!/usr/bin/env node
// Browser smoke test for deck studio: drives the real editor in Chromium against
// a throwaway copy of this repo. `npm run test:editor:browser`
//
// Needs a Chromium for playwright-core: set CHROMIUM_PATH to its executable, or
// run `npx playwright-core install chromium` once. Screenshots of each step are
// written to a temp folder, printed at the end.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { fixture, startEditor } from '../helpers.js';

const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-studio-shots-'));
const fx = fixture();
// An auto-animate pair for the animation steps.
fx.write(
	'slides/040.1-growth.html',
	'<section id="growth" data-slug="growth" data-auto-animate>\n\t<h2>Growth</h2>\n\t<div class="box" data-id="card">Q1</div>\n\t<p>Last quarter</p>\n</section>\n'
);
fx.write(
	'slides/040.2-growth-2.html',
	'<section id="growth-2" data-slug="growth-2" data-auto-animate>\n\t<h2>Growth</h2>\n\t<div class="box" data-id="card">Q1 → Q2</div>\n\t<p>This quarter</p>\n\t<ul>\n\t\t<li class="fragment">First point</li>\n\t\t<li>Second point</li>\n\t</ul>\n</section>\n'
);
fx.git('add', '-A');
fx.git('commit', '-qm', 'auto-animate fixture');
const ed = await startEditor(fx.root, { live: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

const wait = (ms) => page.waitForTimeout(ms);
const until = async (fn, what, ms = 8000) => {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (await fn().catch(() => false)) return;
		await wait(150);
	}
	assert.fail(`timed out waiting for ${what}`);
};
const indices = () =>
	page.evaluate(() => document.getElementById('deck-frame').contentWindow.Reveal?.getIndices());
const frameText = () =>
	page.evaluate(
		() => document.getElementById('deck-frame').contentDocument.querySelector('.slides').textContent
	);
let n = 0;
async function step(name, fn) {
	process.stdout.write(`▶ ${name} … `);
	await fn();
	await page.screenshot({
		path: path.join(shots, `${String(++n).padStart(2, '0')}-${name.replace(/\W+/g, '-')}.png`),
	});
	console.log('ok');
}

try {
	await page.goto(`${ed.origin}/__editor/`);
	await page.waitForSelector('.slide-item');

	await step('open a slide and the preview follows', async () => {
		await page.click('.slide-item[data-file="010-intro.md"]');
		await until(async () => (await indices())?.h === 1, 'preview on slide 2');
	});

	await step('unsaved edits show in the preview', async () => {
		await page.click('.monaco-editor .view-line >> nth=0');
		await page.keyboard.press('End');
		await page.keyboard.type(' LIVE');
		await until(async () => (await frameText()).includes('Intro LIVE'), 'overlay in preview');
		assert.ok(!fx.read('slides/010-intro.md').includes('LIVE'), 'not saved yet');
	});

	await step('the cursor drives vertical sub-slides', async () => {
		await page.keyboard.press('Control+End');
		await until(async () => (await indices())?.v === 1, 'preview on sub-slide 2.2');
		assert.equal(await page.textContent('#editor-slide'), 'Slide 2.2');
	});

	await step('save writes the file', async () => {
		await page.keyboard.press('Control+s');
		await until(async () => fx.read('slides/010-intro.md').includes('Intro LIVE'), 'save');
	});

	await step('a disk change during editing opens the conflict review', async () => {
		await page.keyboard.type(' draft');
		fx.write('slides/010-intro.md', fx.read('slides/010-intro.md') + '\nEXTERNAL\n');
		await page.keyboard.press('Control+s');
		await until(
			async () => (await page.textContent('#dialog-title')) === 'Review file changes',
			'conflict dialog'
		);
		await page.click('#dialog-actions >> text=Use disk version');
		await until(
			async () => !(await page.locator('.document-tab.active .dirty-dot').count()),
			'clean buffer'
		);
	});

	await step('add a slide after the current one', async () => {
		await page.click('[data-action="new-slide"] >> nth=0');
		await page.fill('#slide-title', 'Agenda');
		await page.click('#dialog-actions >> text=Add slide');
		await until(async () => fx.exists('slides/011-agenda.md'), 'new slide file');
		await until(
			async () => (await page.textContent('.document-tab.active .tab-name')) === '011-agenda.md',
			'new slide opened'
		);
	});

	await step('drag a slide before another', async () => {
		await wait(800); // let the slide list settle after the last change
		await page
			.locator('.slide-item[data-file="030-live-demo.html"]')
			.dragTo(page.locator('.slide-item[data-file="010-intro.md"]'), {
				targetPosition: { x: 40, y: 3 },
			});
		await until(async () => fx.exists('slides/001-live-demo.html'), 'moved file');
	});

	await step('drop on the middle of a slide to stack it', async () => {
		await wait(800); // let the slide list settle after the last change
		const target = page.locator('.slide-item[data-file="020-architecture.html"]');
		const box = await target.boundingBox();
		await page
			.locator('.slide-item[data-file="011-agenda.md"]')
			.dragTo(target, { targetPosition: { x: 60, y: box.height / 2 } });
		await until(
			async () =>
				fx.exists('slides/020.2-agenda.md') && fx.exists('slides/020.1-architecture.html'),
			'stacked files'
		);
		await until(
			async () =>
				(await page
					.locator('.slide-group.stacked .slide-item[data-file="020.2-agenda.md"]')
					.count()) === 1,
			'stack in the panel'
		);
	});

	await step('preview a skin and make it the deck default', async () => {
		await page.selectOption('#preview-theme', 'dark');
		assert.equal(
			await page.evaluate(
				() => document.getElementById('deck-frame').contentDocument.documentElement.dataset.theme
			),
			'dark'
		);
		await page.click('[data-action="inspector"] >> nth=0');
		await page.click('[data-inspect="theme"]');
		await page.click('text=Use the previewed skin for this deck');
		await until(
			async () => /^\ttheme: 'dark',$/m.test(fx.read('deck.config.js')),
			'theme in config'
		);
	});

	await step('change a Reveal option in the inspector', async () => {
		await page.click('[data-inspect="deck"]');
		await page.selectOption('#config-transition', '"fade"');
		await until(
			async () => /^\ttransition: 'fade',$/m.test(fx.read('deck.config.js')),
			'transition in config'
		);
		await page.keyboard.press('Escape');
	});

	await step('problems show for unsaved text', async () => {
		await page.click('.slide-item[data-file="000-title.html"]');
		await wait(300);
		await page.keyboard.press('Control+End');
		await page.keyboard.type('\n<div class="not-a-class"></div>');
		await until(
			async () => (await page.textContent('#diagnostic-count')).includes('1 issue'),
			'lint issue'
		);
		// Put the saved text back (typing makes several undo stops).
		await page.evaluate(
			(text) =>
				monaco.editor
					.getModels()
					.find((m) => m.uri.path.endsWith('000-title.html'))
					.setValue(text),
			fx.read('slides/000-title.html')
		);
		await until(
			async () => (await page.textContent('#diagnostic-count')).includes('No issues'),
			'lint clean again'
		);
	});

	const buffer = (file) =>
		page.evaluate(
			(f) =>
				monaco.editor
					.getModels()
					.find((m) => m.uri.path.endsWith(f))
					?.getValue() || '',
			file
		);
	const frame = page.frameLocator('#deck-frame');
	// Picking starts once the preview has caught up with the last edit.
	const picking = () => frame.locator('#__studio-overlay', { hasText: 'Esc to cancel' }).waitFor();

	await step('the morph highlight shows what Reveal pairs', async () => {
		await page.click('.slide-item[data-file="040.2-growth-2.html"]');
		await until(
			async () => (await indices())?.h === 4 && (await indices())?.v === 1,
			'preview on the rung'
		);
		await page.click('#timeline-toggle');
		await page.check('[data-tl="highlight"]');
		await until(
			() =>
				page.evaluate(
					() =>
						document
							.getElementById('deck-frame')
							.contentDocument.querySelectorAll('#__studio-overlay [data-layer="aa"]').length >= 3
				),
			'morph boxes'
		);
		assert.equal(
			await page.locator('.tl-morphs .tl-chip').count(),
			2,
			'card (data-id) and heading (text)'
		);
	});

	await step('add an element to the timeline', async () => {
		await page.click('[data-tl="add"]');
		await picking();
		await frame.locator('li', { hasText: 'Second point' }).click();
		await until(
			async () =>
				/<li class="fragment" data-fragment-index="1">Second point/.test(
					await buffer('040.2-growth-2.html')
				),
			'new step in source'
		);
		await until(async () => (await page.locator('.tl-step').count()) === 2, 'two steps');
	});

	await step('change an effect and the slide transition', async () => {
		await page
			.locator('.tl-step .tl-chip', { hasText: 'Second point' })
			.locator('select')
			.selectOption('grow');
		await until(
			async () => /class="fragment grow"/.test(await buffer('040.2-growth-2.html')),
			'grow effect'
		);
		await page.locator('.tl-arrive select').first().selectOption('zoom');
		await until(
			async () => /data-transition="zoom"/.test(await buffer('040.2-growth-2.html')),
			'transition'
		);
	});

	await step('reorder steps by dragging a step header', async () => {
		await page.locator('.tl-step-head').nth(1).dragTo(page.locator('.tl-step-head').nth(0));
		await until(
			async () =>
				/class="fragment grow" data-fragment-index="0">Second/.test(
					await buffer('040.2-growth-2.html')
				),
			'reordered'
		);
	});

	await step('link elements across slides with a data-id, then unlink', async () => {
		await page.click('.slide-item[data-file="040.1-growth.html"]');
		await until(async () => (await indices())?.v === 0 && (await indices())?.h === 4, 'first rung');
		await wait(600);
		await page.click('.tl-pick');
		await picking();
		await frame.locator('p', { hasText: 'Last quarter' }).click();
		await page.click('.tl-inspector >> text=Link to next slide…');
		await picking();
		await frame.locator('p', { hasText: 'This quarter' }).click();
		await until(
			async () =>
				/<p data-id="last-quarter">Last quarter/.test(await buffer('040.1-growth.html')) &&
				/<p data-id="last-quarter">This quarter/.test(await buffer('040.2-growth-2.html')),
			'data-id on both'
		);
		await until(
			async () => (await page.textContent('.tl-inspector')).includes('Morphs on to the next slide'),
			'pair recognised'
		);
		await page.click('.tl-inspector >> text=Unlink');
		await until(
			async () =>
				!/data-id="last-quarter"/.test(
					(await buffer('040.1-growth.html')) + (await buffer('040.2-growth-2.html'))
				),
			'unlinked'
		);
	});

	await step('make the next rung of a Markdown slide', async () => {
		await page.click('.slide-item[data-file="010-intro.md"]');
		await until(
			async () => (await page.textContent('#preview-document')).startsWith('slides/010-intro.md'),
			'intro'
		);
		await wait(600);
		await page.click('.tl-arrive >> text=Make next rung');
		await until(
			async () => (await buffer('010-intro.md')).split(/\n--\n/).length === 3,
			'third sub-slide'
		);
		assert.match(await buffer('010-intro.md'), /^<!-- \.slide: data-auto-animate -->\n## Intro/);
		await page.click('[data-tl="save"]');
		await until(
			async () =>
				/data-transition="zoom"/.test(fx.read('slides/040.2-growth-2.html')) &&
				fx.read('slides/010-intro.md').includes('.slide: data-auto-animate'),
			'saved'
		);
		await page.click('[data-tl="close"]');
	});

	await step('build the deck', async () => {
		await page.click('#build-button');
		await page.click('text=Build the deck');
		await wait(300);
		const unsaved = page.locator('#dialog-actions >> text=Build saved files');
		if (await unsaved.count()) await unsaved.click();
		await until(
			async () =>
				fx.exists('deck-dist/index.html') &&
				!(await page.locator('#build-button.building').count()),
			'build',
			90000
		);
	});

	assert.deepEqual(errors, [], 'no page errors');
	console.log(`\n✓ deck studio smoke test passed · screenshots in ${shots}`);
} catch (error) {
	await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {});
	console.error(`\n✗ ${error.message}\n  screenshots in ${shots}`);
	process.exitCode = 1;
} finally {
	await browser.close();
	await ed.close();
	fx.cleanup();
}
