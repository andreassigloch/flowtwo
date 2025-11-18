import { defineConfig } from 'vitest/config';

/**
 * Test Pyramid Strategy: 70% Unit / 20% Integration / 10% E2E
 *
 * Quality Gates (ALL must pass):
 * - Unit test coverage ≥80%
 * - Integration test coverage ≥60%
 * - E2E smoke tests: 100% pass rate
 * - Contract violations: 0
 * - Test isolation failures: 0
 *
 * @author andreas@siglochconsulting
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      },
      exclude: [
        'tests/**',
        'dist/**',
        '**/*.config.ts',
        '**/*.d.ts'
      ]
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/e2e/**/*.test.ts'
    ]
  }
});
