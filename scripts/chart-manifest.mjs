#!/usr/bin/env node
/**
 * Refresh the SHA-256 manifest of the shared chart files after editing them:
 *
 *   node scripts/chart-manifest.mjs            write editor/tests/chart-wizard.sha256.json
 *   node scripts/chart-manifest.mjs --copy DIR copy the files to DIR (md-doc's studio static folder)
 *                                              and write its manifest next to its tests (DIR/../../tests)
 *
 * The same manifest lives in both repos; a test in each compares it with the files on disk.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STATIC = new URL('../editor/static/', import.meta.url).pathname;
const files = readdirSync(STATIC).filter((f) => /^chart-.*\.js$/.test(f)).sort();
const manifest = Object.fromEntries(files.map((f) => [f, createHash('sha256').update(readFileSync(path.join(STATIC, f))).digest('hex')]));
const json = JSON.stringify(manifest, null, 2) + '\n';
writeFileSync(new URL('../editor/tests/chart-wizard.sha256.json', import.meta.url), json);
const at = process.argv.indexOf('--copy');
if (at > 0) {
	const dest = path.resolve(process.argv[at + 1]);
	for (const f of readdirSync(dest).filter((x) => /^chart-.*\.js$/.test(x))) if (!files.includes(f)) throw new Error(`${dest}/${f} no longer exists upstream; remove it`);
	for (const f of files) copyFileSync(path.join(STATIC, f), path.join(dest, f));
	writeFileSync(path.resolve(dest, '..', '..', 'tests', 'chart-wizard.sha256.json'), json);
	console.log(`copied ${files.length} files to ${dest}`);
}
console.log(`manifest: ${files.length} files`);
