// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

// eslint.config.js
import { globalIgnores } from 'eslint/config';

export default tseslint.config(
	{
		files: ['**/*.{js,ts,jsx,tsx}'],
		ignores: ['**/node_modules/**', '**/$*/**', '**/.svelte-kit/**', '$*', '.svelte-kit']
	},
	eslint.configs.recommended,
	tseslint.configs.recommended,
	{
		rules: {
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
	// Generated output — build artifacts and coverage reports, never edited.
	// Mirrors the "Output" section of .gitignore; eslint does not read .gitignore
	// itself, so a plain `npm run build && npm run lint` would otherwise lint the
	// minified bundles.
	globalIgnores(['.svelte-kit', '.output', '.vercel', '.netlify', '.wrangler', 'build', 'coverage'])
);
