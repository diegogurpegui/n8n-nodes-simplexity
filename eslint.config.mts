import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.node,
    },
  },
  plugins: {
    'n8n-nodes-base': n8nNodesBase,
  },
  rules: {
    ...n8nNodesBase.configs.nodes.rules,
    'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'warn',
    'n8n-nodes-base/node-class-description-outputs-wrong': 'warn',
  },
});
