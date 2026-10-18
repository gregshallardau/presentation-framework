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
		await page
			.locator('.slide-item[data-file="030-live-demo.html"]')
			.dragTo(page.locator('.slide-item[data-file="010-intro.md"]'), {
				targetPosition: { x: 40, y: 3 },
			});
		await until(async () => fx.exists('slides/001-live-demo.html'), 'moved file');
	});

	await step('drop on the middle of a slide to stack it', async () => {
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
			async () => (await page.locator('.slide-group.stacked').count()) === 1,
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
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');
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
