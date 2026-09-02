#!/usr/bin/env bun
/**
 * Export the training plan as JSON and CSV.
 *
 * Talks to Trenara directly rather than through the app: nothing here needs a
 * dev server, a Supabase project or a browser session, because the plan is a
 * read and the API will answer a Bearer token on its own. What it does share
 * with the app is the shapes — the types and the normalisation live in
 * `src/lib/plan-export`, under the same tests as the rest of the codebase, so
 * an upstream change breaks this in the same place it breaks the app.
 *
 * Usage:
 *   bun run scripts/extract-plan.ts --to 2026-12-06
 *   bun run scripts/extract-plan.ts --from 2026-09-01 --to 2026-12-06 --format csv
 *
 * Credentials, from the environment or a `.env` beside this repo:
 *   TRENARA_ACCESS_TOKEN                        an existing Bearer, or
 *   TRENARA_EMAIL + TRENARA_PASSWORD + BASIC_BEARER_TOKEN   to sign in
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Goal, Schedule } from '../src/lib/server/trenara/types';
import { buildExport } from '../src/lib/plan-export/normalize';
import { requireDate, todayKey, toUnixSeconds, weekAnchors } from '../src/lib/plan-export/range';
import { blocksCsv, entriesCsv, sessionsCsv, weeksCsv } from '../src/lib/plan-export/tables';
import { toJsonl } from '../src/lib/plan-export/jsonl';
import { toLocalDateString } from '../src/lib/utils/date';

/**
 * Overridable so the script can be pointed at a stub, which is the only way to
 * exercise it end to end without a live account. Production is the default; a
 * run that sets this is a run that knows it is not talking to Trenara.
 */
const BASE_URL = process.env.TRENARA_BASE_URL ?? 'https://backend-prod.trenara.com';

/**
 * Trenara allows 60 requests a minute in a fixed window, and a week costs one
 * request. Three months is about fourteen — comfortably inside it — but a run
 * with a wide `--from` is not, so requests are spaced rather than fired at once.
 * Spacing does not help a fixed window on its own; what it buys is that a 429,
 * when it comes, arrives with most of the export already in hand.
 */
const REQUEST_SPACING_MS = 250;

/**
 * `jsonl` is the default because it is the one shape that is both a single
 * file and directly analysable: `jq` and `pandas.read_json(lines=True)` read it
 * with no parser of their own, and a session keeps its blocks on its own line.
 * `json` is the same data as one tree, `csv` the flat tables a spreadsheet wants.
 */
const FORMATS = ['jsonl', 'json', 'csv'] as const;
type Format = (typeof FORMATS)[number];

interface Args {
	from: string;
	to: string;
	out: string;
	format: Format;
	includeRaw: boolean;
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		from: todayKey(),
		to: '',
		out: './plan-export',
		format: 'jsonl',
		includeRaw: true
	};

	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const value = argv[i + 1];
		switch (flag) {
			case '--from':
				args.from = value;
				i++;
				break;
			case '--to':
				args.to = value;
				i++;
				break;
			case '--out':
				args.out = value;
				i++;
				break;
			case '--format':
				if (!FORMATS.includes(value as Format)) {
					throw new Error(`--format must be one of ${FORMATS.join(', ')}, got "${value}".`);
				}
				args.format = value as Format;
				i++;
				break;
			case '--no-raw':
				args.includeRaw = false;
				break;
			case '--help':
			case '-h':
				console.log(usage());
				process.exit(0);
				break;
			default:
				throw new Error(`Unknown argument "${flag}".\n\n${usage()}`);
		}
	}

	if (!args.to) throw new Error(`--to is required.\n\n${usage()}`);
	return args;
}

function usage(): string {
	return [
		'Usage: bun run scripts/extract-plan.ts --to <YYYY-MM-DD> [options]',
		'',
		'  --from <YYYY-MM-DD>  First day to export. Default: today.',
		'  --to   <YYYY-MM-DD>  Last day to export. Required.',
		'  --out  <dir>         Output directory. Default: ./plan-export',
		'  --format <fmt>       jsonl (default, one file), json, or csv.',
		'  --no-raw             Omit the untouched upstream payloads.'
	].join('\n');
}

/**
 * Environment, with a `.env` file folded in.
 *
 * Read rather than required through `$env/static/private`: that binding only
 * exists inside a SvelteKit build, and this has to run from a plain shell.
 * Real environment variables win over the file, so a one-off
 * `TRENARA_ACCESS_TOKEN=… bun run …` overrides whatever is committed to habit.
 */
async function loadEnv(): Promise<Record<string, string>> {
	const fromFile: Record<string, string> = {};
	try {
		const text = await readFile(resolve(process.cwd(), '.env'), 'utf8');
		for (const line of text.split('\n')) {
			const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
			if (!match) continue;
			fromFile[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
		}
	} catch {
		// No .env is the normal case for a one-off run; the environment may well
		// carry everything needed.
	}
	return { ...fromFile, ...(process.env as Record<string, string>) };
}

/** A Bearer token: the one supplied, or one minted from email and password. */
async function resolveToken(env: Record<string, string>): Promise<string> {
	if (env.TRENARA_ACCESS_TOKEN) return env.TRENARA_ACCESS_TOKEN;

	const { TRENARA_EMAIL, TRENARA_PASSWORD, BASIC_BEARER_TOKEN } = env;
	if (!TRENARA_EMAIL || !TRENARA_PASSWORD || !BASIC_BEARER_TOKEN) {
		throw new Error(
			'No credentials. Set TRENARA_ACCESS_TOKEN, or all three of ' +
				'TRENARA_EMAIL, TRENARA_PASSWORD and BASIC_BEARER_TOKEN.'
		);
	}

	// Form-encoded and Basic-authorised — the one endpoint in this API that is
	// neither JSON nor Bearer. See docs/backend-api.md.
	const body = new URLSearchParams({
		grant_type: 'password',
		username: TRENARA_EMAIL,
		password: TRENARA_PASSWORD
	});

	const response = await fetch(`${BASE_URL}/oauth/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${BASIC_BEARER_TOKEN}`
		},
		body: body.toString()
	});

	if (!response.ok) {
		throw new Error(`Sign-in failed: ${response.status} ${await response.text()}`);
	}
	const auth = (await response.json()) as { access_token?: string };
	if (!auth.access_token) throw new Error('Sign-in answered without an access_token.');
	return auth.access_token;
}

/**
 * One GET, with the two failures that are worth telling apart.
 *
 * A 401 means the token is stale, which is a thing the operator can fix; a 429
 * means the minute's budget is spent, and is never retried here — retrying a
 * refusal for going too fast is the one response guaranteed to make it worse.
 */
async function get<T>(path: string, token: string): Promise<T> {
	const response = await fetch(`${BASE_URL}${path}`, {
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
	});

	if (response.status === 401) {
		throw new Error(`401 from ${path}. The access token is expired or not valid for this account.`);
	}
	if (response.status === 429) {
		const retry = response.headers.get('retry-after') ?? '?';
		throw new Error(`429 from ${path}. Rate limited; retry-after ${retry}s.`);
	}
	if (!response.ok) {
		throw new Error(`${response.status} from ${path}: ${await response.text()}`);
	}
	return (await response.json()) as T;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const from = requireDate(args.from, '--from');
	const to = requireDate(args.to, '--to');
	if (from > to) throw new Error(`--from (${args.from}) is after --to (${args.to}).`);

	const env = await loadEnv();
	const token = await resolveToken(env);
	const anchors = weekAnchors(from, to);

	console.error(
		`Exporting ${args.from} → ${args.to}: ${anchors.length} weeks ` +
			`(${toLocalDateString(anchors[0])} → ${toLocalDateString(anchors[anchors.length - 1])})`
	);

	const goal = await get<Goal>('/api/goal', token).catch((error) => {
		console.error(`  goal unavailable: ${(error as Error).message}`);
		return null;
	});

	const schedules: Schedule[] = [];
	for (const [index, anchor] of anchors.entries()) {
		const stamp = toUnixSeconds(anchor);
		process.stderr.write(`  week ${index + 1}/${anchors.length} (${toLocalDateString(anchor)})\r`);
		schedules.push(await get<Schedule>(`/api/schedule/week/?timestamp=${stamp}`, token));
		if (index < anchors.length - 1) await sleep(REQUEST_SPACING_MS);
	}
	process.stderr.write('\n');

	const plan = buildExport(schedules, {
		from: args.from,
		to: args.to,
		goal,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		source: `${BASE_URL}/api/schedule/week/`,
		includeRaw: args.includeRaw
	});

	const outDir = resolve(process.cwd(), args.out);
	await mkdir(outDir, { recursive: true });
	const files: [string, string][] =
		args.format === 'jsonl'
			? [['plan.jsonl', toJsonl(plan)]]
			: args.format === 'json'
				? [['plan.json', JSON.stringify(plan, null, 2)]]
				: [
						['sessions.csv', sessionsCsv(plan)],
						['blocks.csv', blocksCsv(plan)],
						['entries.csv', entriesCsv(plan)],
						['weeks.csv', weeksCsv(plan)]
					];
	for (const [name, contents] of files) {
		await writeFile(join(outDir, name), contents, 'utf8');
	}

	const plannedKm = plan.weeks.reduce((total, week) => total + week.planned_distance_km, 0);
	console.error(
		`Wrote ${files.map(([name]) => name).join(', ')} to ${outDir}\n` +
			`  ${plan.sessions.length} sessions, ${plan.strength.length} strength, ` +
			`${plan.entries.length} logged activities across ${plan.weeks.length} weeks\n` +
			`  ${plannedKm.toFixed(1)} km planned in range`
	);
}

main().catch((error: unknown) => {
	console.error(`\n${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
