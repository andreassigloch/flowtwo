#!/usr/bin/env tsx
/**
 * Lint Validation Check Script
 *
 * Verifies ESLint configuration and runs linting.
 * Checks for data-testid attributes (informational).
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../..');

function checkEslintConfig(): boolean {
  const possibleConfigs = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.yaml',
    '.eslintrc.yml'
  ];

  for (const config of possibleConfigs) {
    const configPath = path.join(ROOT_DIR, config);
    if (fs.existsSync(configPath)) {
      console.log(`✅ ESLint config found: ${config}\n`);
      return true;
    }
  }

  console.log('❌ No ESLint configuration file found!\n');
  console.log('Expected files:');
  possibleConfigs.forEach(c => console.log(`  • ${c}`));
  console.log('\nCreate eslint.config.js with TypeScript rules.\n');

  return false;
}

function runLint(): { success: boolean; output: string } {
  try {
    const output = execSync('npm run lint', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    return { success: true, output };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout || error.stderr || error.message
    };
  }
}

function checkDataTestId(): { count: number; files: string[] } {
  try {
    // Search for data-testid attributes in src/
    const output = execSync(
      'grep -r "data-testid" src/ --include="*.ts" --include="*.tsx" || true',
      {
        cwd: ROOT_DIR,
        encoding: 'utf-8'
      }
    );

    if (!output.trim()) {
      return { count: 0, files: [] };
    }

    const lines = output.trim().split('\n');
    const files = [...new Set(lines.map(line => line.split(':')[0]))];

    return { count: lines.length, files };
  } catch {
    return { count: 0, files: [] };
  }
}

function main() {
  console.log('🔍 Validating lint configuration...\n');

  let hasErrors = false;

  // Check 1: ESLint config exists
  const configExists = checkEslintConfig();
  if (!configExists) {
    hasErrors = true;
  }

  // Check 2: Run ESLint
  if (configExists) {
    console.log('Running ESLint...\n');
    const lintResult = runLint();

    if (lintResult.success) {
      console.log('✅ ESLint passed with no errors!\n');
      console.log(lintResult.output);
    } else {
      console.log('❌ ESLint found errors:\n');
      console.log(lintResult.output);
      console.log('\nRun `npm run lint -- --fix` to auto-fix issues.\n');
      hasErrors = true;
    }
  }

  // Check 3: data-testid usage (informational only)
  console.log('ℹ️  Checking data-testid usage (informational)...\n');
  const testIdResult = checkDataTestId();

  if (testIdResult.count === 0) {
    console.log('ℹ️  No data-testid attributes found.');
    console.log('   Note: Terminal UI may not need data-testid attributes.');
    console.log('   If building web UI in future, add data-testid for testing.\n');
  } else {
    console.log(`✅ Found ${testIdResult.count} data-testid attribute(s) in:`);
    testIdResult.files.forEach(f => console.log(`   ${f}`));
    console.log();
  }

  console.log('═'.repeat(80));

  if (hasErrors) {
    console.log('\n❌ Lint validation failed. Fix errors before pushing.\n');
    return 1;
  }

  console.log('\n✅ Lint validation passed!\n');
  return 0;
}

const exitCode = main();
process.exit(exitCode);
