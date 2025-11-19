#!/usr/bin/env tsx
/**
 * Quality Check Orchestrator
 *
 * Runs all quality checks and aggregates results.
 * Used in Git pre-push hook to enforce code quality.
 *
 * @author andreas@siglochconsulting
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const CHECKS_DIR = path.join(__dirname, 'checks');

interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  duration: number;
}

async function runCheck(name: string, scriptPath: string): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const { stdout } = await execAsync(`npx tsx ${scriptPath}`, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
    });

    const duration = Date.now() - startTime;

    return {
      name,
      passed: true,
      output: stdout,
      duration
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    return {
      name,
      passed: false,
      output: error.stdout || error.stderr || error.message,
      duration
    };
  }
}

function printSeparator() {
  console.log('═'.repeat(80));
}

async function main() {
  console.log('\n🔍 Running Code Quality Checks (parallel execution)\n');
  printSeparator();

  const checks = [
    { name: 'Stale Code', script: 'stale-code.ts' },
    { name: 'Hardcoded Values', script: 'hardcoded-values.ts' },
    { name: 'Module Size', script: 'module-size.ts' },
    { name: 'Base Directory', script: 'base-directory.ts' },
    { name: 'Test Coverage', script: 'test-coverage.ts' },
    { name: 'Smoke Tests', script: 'smoke-test.ts' },
    { name: 'Lint Validation', script: 'lint-validation.ts' }
  ];

  console.log(`\n📋 Starting ${checks.length} checks concurrently...\n`);

  // Run all checks in parallel
  const checkPromises = checks.map(check =>
    runCheck(check.name, path.join(CHECKS_DIR, check.script))
  );

  const results = await Promise.all(checkPromises);

  // Print individual check outputs
  console.log('\n📄 Check Outputs:\n');
  printSeparator();

  results.forEach(result => {
    console.log(`\n📋 ${result.name}:\n`);
    console.log(result.output);
    printSeparator();
  });

  // Summary
  console.log('\n📊 Quality Check Summary\n');

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  console.log('Results:');
  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    const duration = (r.duration / 1000).toFixed(2);
    console.log(`  ${icon} ${r.name} (${duration}s)`);
  });

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const maxDuration = Math.max(...results.map(r => r.duration));

  console.log(`\nTotal: ${passed.length}/${results.length} checks passed`);
  console.log(`Parallel execution time: ${(maxDuration / 1000).toFixed(2)}s`);
  console.log(`Sequential would have taken: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Time saved: ${((totalDuration - maxDuration) / 1000).toFixed(2)}s\n`);

  printSeparator();

  if (failed.length > 0) {
    console.log('\n❌ Quality checks FAILED\n');
    console.log('Fix the issues above before pushing to remote.\n');
    console.log('To bypass checks (not recommended): git push --no-verify\n');
    return 1;
  }

  console.log('\n✅ All quality checks PASSED!\n');
  return 0;
}

main()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('\n❌ Fatal error running quality checks:\n');
    console.error(error);
    process.exit(1);
  });
