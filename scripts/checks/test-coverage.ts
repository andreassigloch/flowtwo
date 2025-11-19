#!/usr/bin/env tsx
/**
 * Test Coverage Check Script
 *
 * Enforces test pyramid distribution (70% unit / 20% integration / 10% E2E)
 * and validates test coverage thresholds per CLAUDE.md requirements.
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../..');

interface TestStats {
  unit: { files: number; tests: number };
  integration: { files: number; tests: number };
  e2e: { files: number; tests: number };
  total: number;
}

interface Issue {
  type: 'pyramid' | 'skipped' | 'coverage';
  severity: 'critical' | 'warning';
  message: string;
}

async function countTests(pattern: string): Promise<{ files: number; tests: number }> {
  const files = await glob(pattern, { cwd: ROOT_DIR, absolute: true });
  let testCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');

    // Count test cases (test(...), it(...), describe(...))
    const testMatches = content.match(/\b(test|it)\s*\(/g) || [];
    testCount += testMatches.length;

    // Count skipped tests
    const skippedMatches = content.match(/\b(test|it)\.skip\s*\(/g) || [];
    skippedCount += skippedMatches.length;
  }

  return { files: files.length, tests: testCount };
}

async function getTestStats(): Promise<TestStats> {
  const [unit, integration, e2e] = await Promise.all([
    countTests('tests/unit/**/*.test.ts'),
    countTests('tests/integration/**/*.test.ts'),
    countTests('tests/e2e/**/*.spec.ts')
  ]);

  return {
    unit,
    integration,
    e2e,
    total: unit.tests + integration.tests + e2e.tests
  };
}

async function checkSkippedTests(): Promise<Issue | null> {
  const allTestFiles = await glob('tests/**/*.{test,spec}.ts', {
    cwd: ROOT_DIR,
    absolute: true
  });

  let skippedCount = 0;

  for (const file of allTestFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const skippedMatches = content.match(/\b(test|it|describe)\.skip\s*\(/g) || [];
    skippedCount += skippedMatches.length;
  }

  if (skippedCount > 0) {
    return {
      type: 'skipped',
      severity: 'critical',
      message: `Found ${skippedCount} skipped test(s). All tests must run in CI. Remove .skip() or fix failing tests.`
    };
  }

  return null;
}

function validateTestPyramid(stats: TestStats): Issue[] {
  const issues: Issue[] = [];

  if (stats.total === 0) {
    issues.push({
      type: 'coverage',
      severity: 'critical',
      message: 'No tests found! At least 70% unit tests required.'
    });
    return issues;
  }

  const unitPercent = (stats.unit.tests / stats.total) * 100;
  const integrationPercent = (stats.integration.tests / stats.total) * 100;
  const e2ePercent = (stats.e2e.tests / stats.total) * 100;

  // CLAUDE.md requirement: 70% unit / 20% integration / 10% E2E
  // Allow ±10% variance
  if (unitPercent < 60) {
    issues.push({
      type: 'pyramid',
      severity: 'critical',
      message: `Unit tests: ${unitPercent.toFixed(1)}% (should be ~70%). Add more unit tests.`
    });
  }

  if (integrationPercent < 10 && stats.total > 10) {
    issues.push({
      type: 'pyramid',
      severity: 'warning',
      message: `Integration tests: ${integrationPercent.toFixed(1)}% (should be ~20%). Consider adding integration tests.`
    });
  }

  if (e2ePercent > 20 && stats.total > 10) {
    issues.push({
      type: 'pyramid',
      severity: 'warning',
      message: `E2E tests: ${e2ePercent.toFixed(1)}% (should be ~10%). Too many E2E tests - convert some to unit/integration.`
    });
  }

  return issues;
}

async function main() {
  console.log('📊 Checking test coverage and pyramid distribution...\n');

  const stats = await getTestStats();
  const issues: Issue[] = [];

  // Check for skipped tests
  const skippedIssue = await checkSkippedTests();
  if (skippedIssue) {
    issues.push(skippedIssue);
  }

  // Validate test pyramid
  const pyramidIssues = validateTestPyramid(stats);
  issues.push(...pyramidIssues);

  // Print statistics
  console.log('Test Statistics:\n');
  console.log(`  Unit Tests:        ${stats.unit.tests.toString().padStart(3)} tests in ${stats.unit.files} file(s)`);
  console.log(`  Integration Tests: ${stats.integration.tests.toString().padStart(3)} tests in ${stats.integration.files} file(s)`);
  console.log(`  E2E Tests:         ${stats.e2e.tests.toString().padStart(3)} tests in ${stats.e2e.files} file(s)`);
  console.log(`  Total:             ${stats.total.toString().padStart(3)} tests\n`);

  if (stats.total > 0) {
    const unitPercent = (stats.unit.tests / stats.total) * 100;
    const integrationPercent = (stats.integration.tests / stats.total) * 100;
    const e2ePercent = (stats.e2e.tests / stats.total) * 100;

    console.log('Test Pyramid Distribution:\n');
    console.log(`  Unit:        ${unitPercent.toFixed(1)}% (target: ~70%)`);
    console.log(`  Integration: ${integrationPercent.toFixed(1)}% (target: ~20%)`);
    console.log(`  E2E:         ${e2ePercent.toFixed(1)}% (target: ~10%)\n`);
  }

  // Report issues
  if (issues.length === 0) {
    console.log('✅ Test pyramid distribution is healthy!\n');
    return 0;
  }

  const critical = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');

  if (critical.length > 0) {
    console.log('🔴 CRITICAL Issues:\n');
    critical.forEach(issue => {
      console.log(`  ${issue.message}\n`);
    });
  }

  if (warnings.length > 0) {
    console.log('🟡 WARNINGS:\n');
    warnings.forEach(issue => {
      console.log(`  ${issue.message}\n`);
    });
  }

  console.log('═'.repeat(80));

  if (critical.length > 0) {
    console.log(`\n❌ ${critical.length} critical test coverage issue(s) found.\n`);
    return 1;
  }

  console.log(`\n⚠️  ${warnings.length} warning(s). Consider addressing before next release.\n`);
  return 0;
}

main().then(exitCode => process.exit(exitCode));
