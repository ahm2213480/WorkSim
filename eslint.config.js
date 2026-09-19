import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  { files: ['client/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': hooks }, rules: hooks.configs.recommended.rules },
  // Real-browser checks run snippets inside the page via page.evaluate(), so
  // those files legitimately use browser globals inside those callbacks.
  {
    files: ['scripts/e2e-mobile-*.mjs', 'scripts/capture-screenshots.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
