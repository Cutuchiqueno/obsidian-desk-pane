// Bundles every `src/**/*.test.ts` with esbuild and runs the bundles with `node --test`. Bundling
// keeps the sources' extensionless imports working without a separate TypeScript setup for Node.
import esbuild from 'esbuild';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const outdir = '.test-build';

function findTests(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return findTests(path);
		return entry.name.endsWith('.test.ts') ? [path] : [];
	});
}

const entryPoints = findTests('src');
if (entryPoints.length === 0) {
	console.error('No test files found.');
	process.exit(1);
}

rmSync(outdir, { recursive: true, force: true });
const result = await esbuild.build({
	entryPoints,
	outbase: 'src',
	outdir,
	outExtension: { '.js': '.mjs' },
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node18',
	// The tested modules must not need Obsidian; if one does, the test fails loudly at import.
	external: ['obsidian'],
	sourcemap: 'inline',
	metafile: true,
	logLevel: 'warning',
});

const outputs = Object.keys(result.metafile.outputs).filter((file) => file.endsWith('.test.mjs'));
const run = spawnSync(process.execPath, ['--test', ...outputs], { stdio: 'inherit' });
process.exit(run.status ?? 1);
