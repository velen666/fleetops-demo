import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import pluginVueA11y from 'eslint-plugin-vuejs-accessibility'

export default defineConfigWithVueTs(
  {
    ignores: [
      'dist/**',
      'dist-ssr/**',
      'node_modules/**',
      'test-results/**',
      'e2e-report/**',
      'e2e/screenshots/**',
      'coverage/**',
      'src/components/ui/**',
      'playwright.config.ts',
      'e2e/**/*.ts',
    ],
  },
  ...pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  ...pluginVueA11y.configs['flat/recommended'],
  skipFormatting,
  {
    name: 'fleetops-frontend/rules',
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'error',
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
      'no-debugger': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'vuejs-accessibility/aria-role': 'warn',
      'vuejs-accessibility/label-has-for': 'off',
      'vuejs-accessibility/no-autofocus': 'off',
      'vuejs-accessibility/anchor-has-content': 'off',
    },
  },
)
