/**
 * A budget for what every page downloads, checked against a real build.
 *
 * agents.md said "check the build output, not the intent" about heavy
 * libraries, and nothing did — so whether DOMPurify stayed out of the layout
 * chunk depended on somebody remembering to look. This reads Vite's manifest
 * after `bun run build` and fails when:
 *
 * - the shell every signed-in page loads (the client entry, the root layout
 *   and the `(app)` layout, with everything they import statically) grows
 *   past its gzipped budget; or
 * - a library that must only ever be reached through `import(…)` turns up in
 *   the static graph of any route.
 *
 * The budget sits a little above where the build stands. Raise it on purpose,
 * in the commit that needs the room, with the reason in the message — the same
 * rule as the coverage thresholds.
 *
 * Run: `bun run build && bun run check:bundle`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

/** Gzipped bytes the signed-in shell may cost, JS and CSS together. */
const SHELL_BUDGET_BYTES = 64 * 1024;

/**
 * Packages that must only be loaded on the branch that uses them, each with a
 * string that survives minification.
 *
 * Matched against the built files' contents rather than the manifest's source
 * paths: imported lazily, a package gets a chunk and a manifest key of its own,
 * but imported statically it is folded into a shared chunk and its name leaves
 * the manifest altogether — which is exactly the case this has to catch.
 */
const LAZY_ONLY = [
	{ name: 'dompurify', marker: 'data-tt-policy-suffix' },
	// The session card's dialogs: each button is drawn with the card, and the
	// dialog behind it is fetched once the page is idle or on the first tap.
	// Markers are copy from each dialog's own markup.
	{ name: 'session setup sheet', marker: 'Where you are running today' },
	{
		name: 'change-date dialog',
		marker: 'If a training is already scheduled, they will be swapped'
	},
	{ name: 'rating dialog', marker: 'Rate Perceived Exertion' },
	{ name: 'treadmill mode', marker: 'No instructions available for this training' }
];

const OUT = '.svelte-kit/output/client';
const MANIFEST = join(OUT, '.vite/manifest.json');
const GENERATED_NODES = '.svelte-kit/generated/client-optimized/nodes';

/** The route files whose nodes make up the shell. */
const SHELL_SOURCES = ['src/routes/+layout.svelte', 'src/routes/(app)/+layout.svelte'];

interface Chunk {
	file: string;
	src?: string;
	isEntry?: boolean;
	imports?: string[];
	dynamicImports?: string[];
	css?: string[];
}

type Manifest = Record<string, Chunk>;

function fail(message: string): never {
	console.error(`✖ ${message}`);
	process.exit(1);
}

/** Every manifest key reached from `roots` through static imports only. */
function staticClosure(manifest: Manifest, roots: string[]): Set<string> {
	const seen = new Set<string>();
	const stack = [...roots];
	while (stack.length) {
		const key = stack.pop()!;
		if (seen.has(key)) continue;
		seen.add(key);
		for (const next of manifest[key]?.imports ?? []) stack.push(next);
	}
	return seen;
}

function gzippedSize(file: string): number {
	return gzipSync(readFileSync(join(OUT, file))).length;
}

/** Bytes for a set of chunks, counting each JS and CSS file once. */
function weigh(manifest: Manifest, keys: Set<string>): number {
	const files = new Set<string>();
	for (const key of keys) {
		const chunk = manifest[key];
		files.add(chunk.file);
		for (const css of chunk.css ?? []) files.add(css);
	}
	let total = 0;
	for (const file of files) total += gzippedSize(file);
	return total;
}

/** The manifest key of the node whose generated module re-exports `source`. */
function nodeKeyFor(manifest: Manifest, source: string): string {
	for (const key of Object.keys(manifest)) {
		if (!key.startsWith(GENERATED_NODES)) continue;
		const generated = readFileSync(key, 'utf8');
		if (generated.includes(`/${source}"`)) return key;
	}
	return fail(`No client node found for ${source} — has the route moved?`);
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

if (!existsSync(MANIFEST)) fail(`${MANIFEST} is missing. Run \`bun run build\` first.`);

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;

const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
const nodes = Object.keys(manifest).filter((key) => key.startsWith(GENERATED_NODES));
const shellRoots = [
	...entries.filter((key) => !key.startsWith(GENERATED_NODES)),
	...SHELL_SOURCES.map((source) => nodeKeyFor(manifest, source))
];

let failed = false;

// 1. Lazy-only libraries are unreachable from any route's static graph.
for (const { name, marker } of LAZY_ONLY) {
	const lazyChunk = Object.values(manifest).find((chunk) =>
		readFileSync(join(OUT, chunk.file), 'utf8').includes(marker)
	);
	// Absent altogether would mean the marker has changed, and the check has
	// silently stopped checking anything.
	if (!lazyChunk) fail(`No built file carries ${name}'s marker "${marker}" — update it.`);

	for (const root of new Set([...shellRoots, ...nodes])) {
		for (const key of staticClosure(manifest, [root])) {
			if (readFileSync(join(OUT, manifest[key].file), 'utf8').includes(marker)) {
				console.error(`✖ ${name} is statically reachable from ${root}; it must be import()ed.`);
				failed = true;
			}
		}
	}
}
if (!failed) console.log(`✔ ${LAZY_ONLY.map((l) => l.name).join(', ')} only reached by import()`);

// 2. The shell stays within budget.
const shell = weigh(manifest, staticClosure(manifest, shellRoots));
const verdict = shell <= SHELL_BUDGET_BYTES ? '✔' : '✖';
console.log(`${verdict} signed-in shell: ${kb(shell)} gzipped (budget ${kb(SHELL_BUDGET_BYTES)})`);
if (shell > SHELL_BUDGET_BYTES) failed = true;

process.exit(failed ? 1 : 0);
