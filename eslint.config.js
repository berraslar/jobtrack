import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A05: ham SQL'de string birleştirme yasak — `sql` etiketli şablon kullanılmalı.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(raw|unsafe|execute|query)$/] > TemplateLiteral[expressions.length>0]',
          message: 'Ham SQL içinde değişken birleştirme yasak; parametreli sorgu kullanın (A05).',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(raw|unsafe|execute|query)$/] > BinaryExpression[operator='+']",
          message: 'Ham SQL içinde string birleştirme yasak; parametreli sorgu kullanın (A05).',
        },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Arayüzde nesne erişimleri TypeScript'in sabit birleşim anahtarlarıyla (örn. STAGE_LABELS[stage])
      // yapılır ve React çıktıyı kaçışlar; kural burada yalnızca yanlış alarm üretir.
      // Sunucu kodunda (kullanıcı girdisinin anahtara dönüşebildiği yer) kural açık kalır.
      'security/detect-object-injection': 'off',
      // A05: React'in otomatik kaçışlamasını devre dışı bırakan API yasak.
      'no-restricted-properties': [
        'error',
        { property: 'dangerouslySetInnerHTML', message: 'dangerouslySetInnerHTML yasak (A05).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML yasak (A05).',
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Fastify işleyicileri değer döndürmek için async olmalı; await içermeleri gerekmez.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // k6 betikleri: k6 çalışma zamanının ortam değişkeni nesnesi.
    files: ['scripts/load/**/*.js'],
    languageOptions: { globals: { __ENV: 'readonly' } },
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // FR-22: yer imi betiği LinkedIn sayfasında, tarayıcıda çalışır.
    files: ['apps/web/bookmarklet/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
);
