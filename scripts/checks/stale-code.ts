#!/usr/bin/env tsx
/**
 * Stale Code Check Script
 *
 * Finds stale code patterns:
 * - TODO, FIXME, stub, mock, placeholder comments
 * - Functions throwing "not implemented" errors
 * - Incomplete implementations
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface StaleCodeIssue {
  file: string;
  line: number;
  type: 'comment' | 'throw' | 'stub';
  severity: 'critical' | 'major' | 'minor';
  value: string;
  context: string;
}

const ROOT_DIR = path.resolve(__dirname, '../..');
const WHITELIST_PATTERNS = [
  'tests/setup.ts',
  'tests/**/*.test.ts',
  'tests/**/*.spec.ts',
  'node_modules/**'
];

const COMMENT_PATTERNS = [
  /\/\/\s*(TODO|FIXME|HACK|XXX|stub|mock|placeholder|to be implemented)/i,
  /\/\*\s*(TODO|FIXME|HACK|XXX|stub|mock|placeholder|to be implemented)/i
];

const THROW_PATTERNS = [
  /throw\s+new\s+Error\s*\(\s*['"][^'"]*not\s+(?:yet\s+)?implemented[^'"]*['"]/i,
  /throw\s+new\s+Error\s*\(\s*['"][^'"]*stub[^'"]*['"]/i,
  /throw\s+new\s+Error\s*\(\s*['"][^'"]*placeholder[^'"]*['"]/i
];

function isWhitelisted(filepath: string): boolean {
  const relativePath = path.relative(ROOT_DIR, filepath);
  return WHITELIST_PATTERNS.some(pattern => {
    if (pattern.includes('**')) {
      const regex = new RegExp(pattern.replace('**', '.*').replace('*', '[^/]*'));
      return regex.test(relativePath);
    }
    return relativePath.includes(pattern.replace('*', ''));
  });
}

function determineSeverity(file: string, line: string): 'critical' | 'major' | 'minor' {
  // Critical: throwing errors in main src code
  if (file.includes('src/') && THROW_PATTERNS.some(p => p.test(line))) {
    return 'critical';
  }

  // Major: TODO in main src code
  if (file.includes('src/') && /TODO|FIXME/i.test(line)) {
    return 'major';
  }

  // Minor: other comments
  return 'minor';
}

function checkFile(filepath: string): StaleCodeIssue[] {
  if (isWhitelisted(filepath)) {
    return [];
  }

  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const issues: StaleCodeIssue[] = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmedLine = line.trim();

    // Check for comment patterns
    for (const pattern of COMMENT_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        issues.push({
          file: filepath,
          line: lineNum,
          type: 'comment',
          severity: determineSeverity(filepath, line),
          value: match[1] || match[0],
          context: trimmedLine.substring(0, 80)
        });
        break;
      }
    }

    // Check for throw patterns
    for (const pattern of THROW_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({
          file: filepath,
          line: lineNum,
          type: 'throw',
          severity: 'critical',
          value: 'Throwing "not implemented" error',
          context: trimmedLine.substring(0, 80)
        });
        break;
      }
    }

    // Check for stub function patterns
    if (/function\s+\w+.*\{\s*\/\/\s*stub/i.test(line) ||
        /const\s+\w+\s*=\s*.*=>\s*\{\s*\/\/\s*stub/i.test(line)) {
      issues.push({
        file: filepath,
        line: lineNum,
        type: 'stub',
        severity: 'major',
        value: 'Stub function',
        context: trimmedLine.substring(0, 80)
      });
    }
  });

  return issues;
}

async function main() {
  console.log('🔍 Checking for stale code...\n');

  const files = await glob('src/**/*.ts', { cwd: ROOT_DIR, absolute: true });
  const mainFile = path.join(ROOT_DIR, 'src/main.ts');

  // Ensure main.ts is checked
  if (!files.includes(mainFile) && fs.existsSync(mainFile)) {
    files.push(mainFile);
  }

  let totalIssues = 0;
  const critical: StaleCodeIssue[] = [];
  const major: StaleCodeIssue[] = [];
  const minor: StaleCodeIssue[] = [];

  for (const file of files) {
    const issues = checkFile(file);
    if (issues.length > 0) {
      totalIssues += issues.length;
      issues.forEach(issue => {
        if (issue.severity === 'critical') critical.push(issue);
        else if (issue.severity === 'major') major.push(issue);
        else minor.push(issue);
      });
    }
  }

  if (totalIssues === 0) {
    console.log('✅ No stale code found!\n');
    return 0;
  }

  console.log(`⚠️  Found ${totalIssues} stale code issue(s):\n`);

  // Print critical issues
  if (critical.length > 0) {
    console.log('🔴 CRITICAL - Functions throwing "not implemented":\n');
    critical.forEach(issue => {
      const relativePath = path.relative(ROOT_DIR, issue.file);
      console.log(`  ${relativePath}:${issue.line}`);
      console.log(`    ${issue.context}`);
      console.log(`    → Fix: Implement function or remove stub\n`);
    });
  }

  // Print major issues
  if (major.length > 0) {
    console.log('🟡 MAJOR - TODO/FIXME/Stub comments:\n');
    major.forEach(issue => {
      const relativePath = path.relative(ROOT_DIR, issue.file);
      console.log(`  ${relativePath}:${issue.line}`);
      console.log(`    ${issue.context}`);
      console.log(`    → Fix: Complete implementation or create CR\n`);
    });
  }

  // Print minor issues (summary only)
  if (minor.length > 0) {
    console.log(`ℹ️  MINOR - ${minor.length} informational comment(s) (not blocking)\n`);
  }

  console.log('═'.repeat(80));

  const criticalCount = critical.length;
  const majorCount = major.length;

  if (criticalCount > 0) {
    console.log(`\n❌ ${criticalCount} critical issue(s) found. Fix throwing stubs before pushing.\n`);
    return 1;
  }

  if (majorCount > 0) {
    console.log(`\n⚠️  ${majorCount} major issue(s) found. Consider creating CRs for TODOs.\n`);
    return 1;
  }

  return 0;
}

main().then(exitCode => process.exit(exitCode));
