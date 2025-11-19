#!/usr/bin/env tsx
/**
 * Module Size Check Script
 *
 * Enforces 500-line limit per file.
 * Identifies files that need refactoring.
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ModuleSizeIssue {
  file: string;
  lines: number;
  limit: number;
  percentOver: number;
  severity: 'critical' | 'major' | 'warning';
}

const ROOT_DIR = path.resolve(__dirname, '../..');
const LINE_LIMIT = 500;
const EXCLUDE_PATTERNS = [
  'node_modules/**',
  'tests/**',
  'dist/**',
  '*.test.ts',
  '*.spec.ts'
];

function isExcluded(filepath: string): boolean {
  const relativePath = path.relative(ROOT_DIR, filepath);
  return EXCLUDE_PATTERNS.some(pattern => {
    if (pattern.includes('**')) {
      const regex = new RegExp(pattern.replace('**', '.*').replace('*', '[^/]*'));
      return regex.test(relativePath);
    }
    return relativePath.includes(pattern.replace('*', ''));
  });
}

function countLines(filepath: string): number {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  // Count non-empty, non-comment-only lines
  let count = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle block comments
    if (trimmed.startsWith('/*')) {
      inBlockComment = true;
    }
    if (trimmed.endsWith('*/')) {
      inBlockComment = false;
      continue;
    }
    if (inBlockComment) {
      continue;
    }

    // Skip empty lines and single-line comments
    if (trimmed === '' || trimmed.startsWith('//')) {
      continue;
    }

    count++;
  }

  return count;
}

function determineSeverity(percentOver: number): 'critical' | 'major' | 'warning' {
  if (percentOver >= 30) return 'critical';
  if (percentOver >= 10) return 'major';
  return 'warning';
}

async function main() {
  console.log('📏 Checking module sizes...\n');

  const files = await glob('src/**/*.ts', { cwd: ROOT_DIR, absolute: true });
  const issues: ModuleSizeIssue[] = [];

  for (const file of files) {
    if (isExcluded(file)) continue;

    const lines = countLines(file);
    if (lines > LINE_LIMIT) {
      const percentOver = Math.round(((lines - LINE_LIMIT) / LINE_LIMIT) * 100);
      issues.push({
        file,
        lines,
        limit: LINE_LIMIT,
        percentOver,
        severity: determineSeverity(percentOver)
      });
    }
  }

  if (issues.length === 0) {
    console.log('✅ All modules are within the 500-line limit!\n');
    return 0;
  }

  // Sort by lines descending
  issues.sort((a, b) => b.lines - a.lines);

  console.log(`⚠️  Found ${issues.length} module(s) exceeding 500-line limit:\n`);

  const critical = issues.filter(i => i.severity === 'critical');
  const major = issues.filter(i => i.severity === 'major');
  const warning = issues.filter(i => i.severity === 'warning');

  if (critical.length > 0) {
    console.log('🔴 CRITICAL (>30% over limit):\n');
    critical.forEach(issue => {
      const relativePath = path.relative(ROOT_DIR, issue.file);
      console.log(`  ${relativePath}`);
      console.log(`    Lines: ${issue.lines} (${issue.percentOver}% over ${issue.limit})`);
      console.log(`    → Refactor: Split into smaller modules\n`);
    });
  }

  if (major.length > 0) {
    console.log('🟡 MAJOR (10-30% over limit):\n');
    major.forEach(issue => {
      const relativePath = path.relative(ROOT_DIR, issue.file);
      console.log(`  ${relativePath}`);
      console.log(`    Lines: ${issue.lines} (${issue.percentOver}% over ${issue.limit})`);
      console.log(`    → Consider: Extracting helpers/utilities\n`);
    });
  }

  if (warning.length > 0) {
    console.log('🟠 WARNING (<10% over limit):\n');
    warning.forEach(issue => {
      const relativePath = path.relative(ROOT_DIR, issue.file);
      console.log(`  ${relativePath}`);
      console.log(`    Lines: ${issue.lines} (${issue.percentOver}% over ${issue.limit})\n`);
    });
  }

  console.log('═'.repeat(80));
  console.log('\nRefactoring Suggestions:');
  console.log('  • Extract command handlers to separate files');
  console.log('  • Split parsing/serialization/validation logic');
  console.log('  • Move utility functions to shared modules');
  console.log('  • Separate query builders from client classes\n');

  if (critical.length > 0 || major.length > 0) {
    console.log(`⚠️  ${critical.length + major.length} file(s) need refactoring.\n`);
    return 1;
  }

  return 0;
}

main().then(exitCode => process.exit(exitCode));
