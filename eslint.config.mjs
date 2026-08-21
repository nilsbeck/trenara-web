// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

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
	// Generated output — build artifacts and coverage reports, never edited.
	// Mirrors the "Output" section of .gitignore; eslint does not read .gitignore
	// itself, so a plain `npm run build && npm run lint` would otherwise lint the
	// minified bundles.
	globalIgnores(['.svelte-kit', '.output', '.vercel', '.netlify', '.wrangler', 'build', 'coverage'])
);
