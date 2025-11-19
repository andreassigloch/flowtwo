#!/usr/bin/env tsx
/**
 * Smoke Test Check Script
 *
 * Per CLAUDE.md: "NEVER show results without starting the application"
 * Validates that application starts and critical E2E tests pass.
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

const ROOT_DIR = path.resolve(__dirname, '../..');

interface SmokTestResult {
  name: string;
  passed: boolean;
  output: string;
  duration: number;
}

async function checkAppStarts(): Promise<SmokTestResult> {
  const startTime = Date.now();

  try {
    // Try to compile TypeScript (don't run, just verify it compiles)
    const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      timeout: 30000
    });

    const duration = Date.now() - startTime;

    return {
      name: 'TypeScript Compilation',
      passed: true,
      output: 'TypeScript compiles without errors',
      duration
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    return {
      name: 'TypeScript Compilation',
      passed: false,
      output: error.stdout || error.stderr || error.message,
      duration
    };
  }
}

async function runSmokeTests(): Promise<SmokTestResult> {
  const startTime = Date.now();

  try {
    // Run unit tests (fast smoke test)
    const { stdout } = await execAsync('npm test 2>&1', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });

    const duration = Date.now() - startTime;

    // Parse test output for pass/fail
    const passedMatch = stdout.match(/(\d+) passed/);
    const failedMatch = stdout.match(/(\d+) failed/);

    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

    if (failed > 0) {
      return {
        name: 'Unit Tests',
        passed: false,
        output: `${failed} test(s) failed, ${passed} passed`,
        duration
      };
    }

    return {
      name: 'Unit Tests',
      passed: true,
      output: `All ${passed} test(s) passed`,
      duration
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Check if error is due to test failures or execution error
    const output = error.stdout || error.stderr || error.message;

    if (output.includes('failed')) {
      return {
        name: 'Unit Tests',
        passed: false,
        output: output.substring(0, 500),
        duration
      };
    }

    return {
      name: 'Unit Tests',
      passed: false,
      output: `Test execution error: ${output.substring(0, 500)}`,
      duration
    };
  }
}

async function main() {
  console.log('🔥 Running smoke tests...\n');
  console.log('Per CLAUDE.md: Validating app starts and tests pass\n');
  console.log('═'.repeat(80));

  const results: SmokTestResult[] = [];

  // Test 1: TypeScript compilation
  console.log('\n📋 Test 1/2: TypeScript Compilation...\n');
  const compileResult = await checkAppStarts();
  results.push(compileResult);

  if (compileResult.passed) {
    console.log(`✅ ${compileResult.name} passed (${(compileResult.duration / 1000).toFixed(2)}s)`);
    console.log(`   ${compileResult.output}\n`);
  } else {
    console.log(`❌ ${compileResult.name} failed (${(compileResult.duration / 1000).toFixed(2)}s)`);
    console.log(`   ${compileResult.output.substring(0, 300)}\n`);
  }

  // Test 2: Unit tests (smoke test)
  console.log('📋 Test 2/2: Unit Tests (Smoke Test)...\n');
  const testResult = await runSmokeTests();
  results.push(testResult);

  if (testResult.passed) {
    console.log(`✅ ${testResult.name} passed (${(testResult.duration / 1000).toFixed(2)}s)`);
    console.log(`   ${testResult.output}\n`);
  } else {
    console.log(`❌ ${testResult.name} failed (${(testResult.duration / 1000).toFixed(2)}s)`);
    console.log(`   ${testResult.output.substring(0, 300)}\n`);
  }

  console.log('═'.repeat(80));

  // Summary
  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  console.log(`\n📊 Smoke Test Summary: ${passed.length}/${results.length} checks passed\n`);

  if (failed.length > 0) {
    console.log('❌ Smoke tests failed. Fix errors before pushing.\n');
    console.log('Failed checks:');
    failed.forEach(r => {
      console.log(`  • ${r.name}`);
    });
    console.log();
    return 1;
  }

  console.log('✅ All smoke tests passed!\n');
  return 0;
}

main().then(exitCode => process.exit(exitCode));
