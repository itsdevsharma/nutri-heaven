module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // `rootDir: 'src'` keeps compiled spec files out of the build output;
  // e2e specs live in `test/` and are run from there, never compiled.
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
};
