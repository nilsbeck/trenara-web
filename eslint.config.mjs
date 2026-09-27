// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

// eslint.config.js
import { globalIgnores } from 'eslint/config';

/**
 * The invariants in agents.md §7 that grep can see, turned into errors.
 *
 * agents.md says of itself that a rule nobody runs is not a rule; these are the
 * ones cheap enough to enforce mechanically. Each message names the section to
 * read. Where a site breaks one on purpose, it carries an
 * `eslint-disable-next-line` with the reason beside it — that comment is what
 * tells a decision apart from a regression.
 */
const bannedSyntax = [
	{
		selector: "TSNonNullExpression > MemberExpression[object.name='locals'][property.name='user']",
		message: 'Use requireUser(locals), never locals.user! — see agents.md §7, Identity and access.'
	},
	{
		selector:
			"CallExpression[callee.property.name=/^(slice|split|substring)$/] > MemberExpression > CallExpression[callee.property.name='toISOString']",
		message:
			"toISOString() is the UTC day, not the runner's. Use $lib/utils/date — see agents.md §9, Dates."
	},
	{
		selector: "CallExpression[callee.name='setInterval']",
		message:
			'Polling must pause in a hidden tab. Use $lib/utils/revalidation — see agents.md §7, Requests and caching.'
	},
	{
		selector:
			"AssignmentExpression > MemberExpression[property.name=/^(innerHTML|outerHTML)$/], CallExpression[callee.property.name='insertAdjacentHTML']",
		message:
			'Markup reaches the DOM only through $lib/utils/sanitize — see agents.md §3, XSS & sanitization.'
	},
	{
		selector: "ImportExpression[source.value='dompurify']",
		message: 'Load DOMPurify through loadSanitizer() in $lib/utils/sanitize, which owns its config.'
	}
];

/** Everything above except the rules a given file is the sanctioned home of. */
function bannedSyntaxExcept(...allowed) {
	return [
		'error',
		...bannedSyntax.filter((rule) => !allowed.some((a) => rule.selector.includes(a)))
	];
}

export default tseslint.config(
	{
		files: ['**/*.{js,ts,jsx,tsx}'],
		ignores: ['**/node_modules/**', '**/$*/**', '**/.svelte-kit/**', '$*', '.svelte-kit']
	},
	eslint.configs.recommended,
	tseslint.configs.recommended,
	{
		rules: {
			'no-restricted-syntax': ['error', ...bannedSyntax],
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'dompurify',
							message:
								'A static import ships DOMPurify in whichever chunk imports it. Use loadSanitizer() from $lib/utils/sanitize.'
						},
						{ name: 'axios', message: 'Use fetch — agents.md §5.' },
						{ name: 'svelte/store', message: 'Client state is runes — agents.md §9, Client state.' }
					],
					patterns: [
						{ group: ['lodash', 'lodash/*', 'lodash-es'], message: 'Use native JS — agents.md §5.' }
					]
				}
			],
			// `const { omitted: _, ...rest } = obj` is the idiomatic way to drop a
			// key, and `_`-prefixed bindings are deliberate placeholders.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					ignoreRestSiblings: true
				}
			]
		}
	},
	/**
	 * Components, which the linter could not see at all.
	 *
	 * The config matched only `.{js,ts,jsx,tsx}` and there was no Svelte parser,
	 * so roughly thirty-five components — the whole UI — went unlinted. That is
	 * how a `children: any` in the app layout survived a passing `bun run lint`
	 * although `agents.md` says "No `any`": the one file the rule was broken in
	 * was a file the rule was never applied to.
	 */
	...svelte.configs.recommended,
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: tseslint.parser,
				extraFileExtensions: ['.svelte']
			}
		},
		rules: {
			// Svelte 5 runes are compiler constructs; the base rule reads a `$state`
			// reassignment in a template as a mutation of an outer binding.
			'no-undef': 'off',

			/**
			 * Off, because this codebase reassigns rather than mutates.
			 *
			 * The rule wants `SvelteMap`/`SvelteSet`/`SvelteDate` wherever one of
			 * the built-ins appears in reactive code, on the assumption that it
			 * will be mutated in place and the mutation expected to be noticed.
			 * That is not the pattern here: the stores build a new `Map` and
			 * assign it (`seenMessageIds = withSeen(…)`), and the calendar's dates
			 * are constructed, read and thrown away. Swapping in the reactive
			 * wrappers would add a proxy to every date arithmetic helper on the
			 * calendar's hot path to buy reactivity that nothing asks for.
			 *
			 * Worth revisiting if a store ever does start mutating in place —
			 * that is the case the rule is genuinely for.
			 */
			'svelte/prefer-svelte-reactivity': 'off',

			/**
			 * Off: the app is served from the root and has no `base` path.
			 *
			 * The rule wants every `href` wrapped in `resolve()` so a base path
			 * can be prepended. There is none configured, none planned, and the
			 * service worker's one path-sensitive lookup already reads `files`
			 * rather than writing a literal. Turning it on would put a function
			 * call around every link in the app to defend against a setting that
			 * does not exist.
			 */
			'svelte/no-navigation-without-resolve': 'off',
			// Some Trenara payload fields are only ever rendered, and destructuring
			// them out of props is how a component says what it accepts.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					ignoreRestSiblings: true
				}
			]
		}
	},
	// The sanctioned homes of two of the banned patterns: the one timer that is
	// gated on visibility, and the one module allowed to load DOMPurify.
	{
		files: ['src/lib/utils/revalidation.ts'],
		rules: { 'no-restricted-syntax': bannedSyntaxExcept('setInterval') }
	},
	{
		files: ['src/lib/utils/sanitize.ts'],
		rules: { 'no-restricted-syntax': bannedSyntaxExcept('dompurify') }
	},
	// Tests build fixtures with fixed UTC timestamps and fake timers on purpose.
	{
		files: ['**/*.test.ts'],
		rules: { 'no-restricted-syntax': bannedSyntaxExcept('toISOString', 'setInterval') }
	},
	// Generated output — build artifacts and coverage reports, never edited.
	// Mirrors the "Output" section of .gitignore; eslint does not read .gitignore
	// itself, so a plain `npm run build && npm run lint` would otherwise lint the
	// minified bundles.
	globalIgnores(['.svelte-kit', '.output', '.vercel', '.netlify', '.wrangler', 'build', 'coverage'])
);
