module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  /**
   * `@nestjs/jwt` 12 ships ESM only (`"type": "module"`) and Jest's CommonJS
   * runtime cannot `require()` ESM — even though Node 22 can, because
   * `require(esm)` has been unflagged since 22.12. That mismatch is why the API
   * boots while this suite failed with "Cannot use import statement outside a
   * module" as soon as anything pulled in `JwtService`.
   *
   * So that one package is transpiled to CommonJS with ts-jest (a dedicated
   * `allowJs` tsconfig, diagnostics off — it is third-party code) while every
   * other node_modules entry is still skipped. Revisit once `@nestjs/jwt`
   * ships dual CJS/ESM builds again.
   *
   * Patterns use character classes ([.] [/] [+]) so they carry no escaping
   * that would have to survive YAML/JSON/JavaScript layers.
   */
  transform: {
    '^.+[.]ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.json',
      },
    ],
    '^.+[.]js$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.jest-esm.json',
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: ['[/]node_modules[/](?!([.]pnpm[/])?@nestjs[/+]jwt)'],
};
