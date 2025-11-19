#!/usr/bin/env tsx
/**
 * Hardcoded Values Check Script
 *
 * Scans for hardcoded values that should use configuration:
 * - Ports (3001, 3003)
 * - Paths (/tmp/*, absolute paths)
 * - Magic numbers (0.7 temperature, 5 retries)
 * - URLs (ws://localhost:...)
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HardcodedIssue {
  file: string;
  line: number;
  type: 'port' | 'path' | 'temperature' | 'url' | 'magic-number';
  value: string;
  suggestion: string;
}

const ROOT_DIR = path.resolve(__dirname, '../..');
const WHITELIST_PATTERNS = [
  'tests/**',
  '**/*.test.ts',
  '**/*.spec.ts',
  '.env.example',
  'vitest.config.ts',
  'node_modules/**'
];

const PATTERNS = {
  port: /(?:port|PORT)\s*[=:]\s*(?:process\.env\.\w+\s*\|\|\s*)?['"]?(300[0-9]|808[0-9])['"]?/g,
  hardcodedPort: /['"]300[0-9]['"]/g,
  path: /['"](\/tmp\/[^'"]+|\/Users\/[^'"]+|\/home\/[^'"]+)['"]/g,
  temperature: /temperature\s*[=:]\s*0\.7/gi,
  wsUrl: /ws:\/\/localhost:[0-9]+/g,
  reconnectAttempts: /(?:maxReconnect|max_reconnect|reconnect)(?:Attempts|Count)?\s*[=:]\s*[0-9]+/gi
};

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

function checkFile(filepath: string): HardcodedIssue[] {
  if (isWhitelisted(filepath)) {
    return [];
  }

  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const issues: HardcodedIssue[] = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Check for hardcoded ports
    const portMatches = line.match(PATTERNS.hardcodedPort);
    if (portMatches) {
      portMatches.forEach(match => {
        issues.push({
          file: filepath,
          line: lineNum,
          type: 'port',
          value: match,
          suggestion: 'Use config.WS_PORT or environment variable'
        });
      });
    }

    // Check for hardcoded paths
    const pathMatches = line.match(PATTERNS.path);
    if (pathMatches) {
      pathMatches.forEach(match => {
        if (!match.includes('node_modules') && !match.includes('.git')) {
          issues.push({
            file: filepath,
            line: lineNum,
            type: 'path',
            value: match,
            suggestion: 'Use config.LOG_PATH, config.FIFO_PATH, or os.tmpdir()'
          });
        }
      });
    }

    // Check for hardcoded temperature
    const tempMatches = line.match(PATTERNS.temperature);
    if (tempMatches) {
      issues.push({
        file: filepath,
        line: lineNum,
        type: 'temperature',
        value: '0.7',
        suggestion: 'Use config.LLM_TEMPERATURE'
      });
    }

    // Check for hardcoded WebSocket URLs
    const urlMatches = line.match(PATTERNS.wsUrl);
    if (urlMatches) {
      urlMatches.forEach(match => {
        issues.push({
          file: filepath,
          line: lineNum,
          type: 'url',
          value: match,
          suggestion: 'Use config.WS_URL'
        });
      });
    }

    // Check for hardcoded reconnect attempts
    const reconnectMatches = line.match(PATTERNS.reconnectAttempts);
    if (reconnectMatches) {
      reconnectMatches.forEach(match => {
        if (!match.includes('process.env') && !match.includes('config.')) {
          issues.push({
            file: filepath,
            line: lineNum,
            type: 'magic-number',
            value: match,
            suggestion: 'Use config.WS_MAX_RECONNECT_ATTEMPTS'
          });
        }
      });
    }
  });

  return issues;
}

async function main() {
  console.log('🔍 Checking for hardcoded values...\n');

  const files = await glob('src/**/*.ts', { cwd: ROOT_DIR, absolute: true });
  const demoFiles = await glob('demo*.ts', { cwd: ROOT_DIR, absolute: true });
  const allFiles = [...files, ...demoFiles];

  let totalIssues = 0;
  const issuesByType = new Map<string, HardcodedIssue[]>();

  for (const file of allFiles) {
    const issues = checkFile(file);
    if (issues.length > 0) {
      totalIssues += issues.length;
      issues.forEach(issue => {
        const existing = issuesByType.get(issue.type) || [];
        issuesByType.set(issue.type, [...existing, issue]);
      });
    }
  }

  if (totalIssues === 0) {
    console.log('✅ No hardcoded values found!\n');
    return 0;
  }

  console.log(`❌ Found ${totalIssues} hardcoded value(s):\n`);

  // Print issues grouped by type
  const typeLabels = {
    port: '🔌 Hardcoded Ports',
    path: '📂 Hardcoded Paths',
    temperature: '🌡️  Hardcoded Temperature',
    url: '🌐 Hardcoded URLs',
    'magic-number': '🔢 Magic Numbers'
  };

  for (const [type, issues] of issuesByType) {
    console.log(`${typeLabels[type as keyof typeof typeLabels] || type}:`);
    issues.forEach(issue => {
      const relativePath = path.relative(ROOT_DIR, issue.file);
      console.log(`  ${relativePath}:${issue.line}`);
      console.log(`    Found: ${issue.value}`);
      console.log(`    Fix: ${issue.suggestion}\n`);
    });
  }

  console.log('═'.repeat(80));
  console.log(`\n❌ ${totalIssues} hardcoded value(s) found. Create src/shared/config.ts and replace them.\n`);

  return 1;
}

main().then(exitCode => process.exit(exitCode));
