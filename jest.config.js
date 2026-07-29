/** Unit tests cover the pure logic in src/core, src/venmo and src/ocr only —
 *  no React Native runtime needed, so this stays a plain node/ts-jest setup. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  collectCoverageFrom: ['src/core/**/*.ts', 'src/venmo/**/*.ts', 'src/ocr/extract.ts'],
};
