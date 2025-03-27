// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// eslint.config.js
import { globalIgnores } from "eslint/config";


export default tseslint.config(
  {
    files: ['**/*.{js,ts,jsx,tsx}'],
    ignores: [
      '**/node_modules/**',
      '**/$*/**',
      '**/.svelte-kit/**',
      '$*',
      '.svelte-kit'
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  globalIgnores(['.svelte-kit'])
);
