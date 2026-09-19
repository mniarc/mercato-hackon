/** @type {import('jest').Config} */
// Standalone regression suite (see .dev-docs/bugfixes/README.md).
//
// It reuses the app's module resolution and MikroORM-aware transformer, but is a
// SEPARATE project from `jest.config.cjs`: it only collects specs under
// `tests/regression/**` and pins `isolatedModules` so a single regression file
// can be run in isolation (red-before-fix, green-after-fix) without tripping the
// whole-program `rootDir` inference (TS5011) that the main config's inline
// tsconfig override exposes when fewer than all files are compiled.
const base = require('./jest.config.cjs')

module.exports = {
  ...base,
  testMatch: ['<rootDir>/tests/regression/**/*.test.(ts|tsx)'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '<rootDir>/scripts/jest-mikroorm-transformer.cjs',
      {
        // Reference the real tsconfig FILE (not an inline object): it carries
        // `isolatedModules: true`, so ts-jest transpiles each spec on its own and
        // never triggers whole-program `rootDir` inference (TS5011).
        tsconfig: '<rootDir>/tsconfig.regression.json',
      },
    ],
  },
}
