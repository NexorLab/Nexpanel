import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      // Context files intentionally export a hook alongside the provider
      // (standard context pattern); HMR losing hot state on them is fine.
      'react-refresh/only-export-components': 'off',
      // sync-from-storage effects (theme, drawer close on navigate,
      // useApi fetch kickoff) are deliberate external-system syncs.
      'react-hooks/set-state-in-effect': 'off',
    },
    languageOptions: {
      globals: globals.browser,
    },
  },
])
