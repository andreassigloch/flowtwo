#!/usr/bin/env tsx
/**
 * Base Directory Check Script
 *
 * Ensures root directory only contains allowed configuration files.
 * Flags documentation, demo scripts, and shell scripts for relocation.
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DirectoryIssue {
  file: string;
  type: 'markdown' | 'demo' | 'script' | 'readme';
  action: string;
}

const ROOT_DIR = path.resolve(__dirname, '../..');

const ALLOWED_ROOT_FILES = [
  'README.md', // Only README allowed
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.env',
  '.env.example',
  '.gitignore',
  '.prettierrc',
  'vitest.config.ts',
  '.eslintrc.json'
];

const ALLOWED_ROOT_DIRS = [
  'node_modules',
  'src',
  'tests',
  'docs',
  'scripts',
  'examples',
  'dist',
  '.git',
  '.githooks'
];

function checkRootDirectory(): DirectoryIssue[] {
  const items = fs.readdirSync(ROOT_DIR);
  const issues: DirectoryIssue[] = [];

  for (const item of items) {
    const fullPath = path.join(ROOT_DIR, item);
    const stat = fs.statSync(fullPath);

    // Skip allowed files and directories
    if (ALLOWED_ROOT_FILES.includes(item) || ALLOWED_ROOT_DIRS.includes(item)) {
      continue;
    }

    // Skip hidden files (except .env, .gitignore which are in allowed list)
    if (item.startsWith('.')) {
      continue;
    }

    if (stat.isFile()) {
      // Markdown files (except README.md)
      if (item.endsWith('.md')) {
        issues.push({
          file: item,
          type: 'markdown',
          action: `Move to docs/archive/ or convert to CR (see documentation-audit.ts)`
        });
      }
      // Demo scripts
      else if (item.startsWith('demo') && item.endsWith('.ts')) {
        issues.push({
          file: item,
          type: 'demo',
          action: 'Move to examples/ directory'
        });
      }
      // Visualize script
      else if (item === 'visualize.ts') {
        issues.push({
          file: item,
          type: 'demo',
          action: 'Move to examples/ directory'
        });
      }
      // Shell scripts
      else if (item.endsWith('.sh')) {
        issues.push({
          file: item,
          type: 'script',
          action: 'Move to scripts/ directory'
        });
      }
    }
  }

  return issues;
}

async function checkMultipleReadmes(): DirectoryIssue[] {
  const issues: DirectoryIssue[] = [];

  // Find all README.md files (excluding root)
  const readmeFiles = await glob('**/README.md', {
    cwd: ROOT_DIR,
    absolute: false,
    ignore: ['node_modules/**', 'dist/**', 'README.md']
  });

  for (const readme of readmeFiles) {
    const dir = path.dirname(readme);

    // Determine if it's a data structure directory
    const isDataStructureDir =
      dir.includes('specs') ||
      dir.includes('views') ||
      dir.includes('examples') ||
      dir.includes('schemas');

    if (isDataStructureDir) {
      issues.push({
        file: readme,
        type: 'readme',
        action: 'Rename to howto.md (data structure documentation)'
      });
    } else {
      issues.push({
        file: readme,
        type: 'readme',
        action: 'Rename to index.md (directory overview)'
      });
    }
  }

  return issues;
}

async function main() {
  console.log('📂 Checking base directory structure...\n');

  const rootIssues = checkRootDirectory();
  const readmeIssues = await checkMultipleReadmes();
  const allIssues = [...rootIssues, ...readmeIssues];

  if (allIssues.length === 0) {
    console.log('✅ Base directory structure is clean!\n');
    return 0;
  }

  console.log(`⚠️  Found ${allIssues.length} directory issue(s):\n`);

  // Group by type
  const markdown = rootIssues.filter(i => i.type === 'markdown');
  const demos = rootIssues.filter(i => i.type === 'demo');
  const scripts = rootIssues.filter(i => i.type === 'script');
  const readmes = readmeIssues;

  if (markdown.length > 0) {
    console.log('📄 Markdown files in root (except README.md):\n');
    markdown.forEach(issue => {
      console.log(`  ${issue.file}`);
      console.log(`    → ${issue.action}\n`);
    });
  }

  if (demos.length > 0) {
    console.log('🎭 Demo scripts in root:\n');
    demos.forEach(issue => {
      console.log(`  ${issue.file}`);
      console.log(`    → ${issue.action}\n`);
    });
  }

  if (scripts.length > 0) {
    console.log('📜 Shell scripts in root:\n');
    scripts.forEach(issue => {
      console.log(`  ${issue.file}`);
      console.log(`    → ${issue.action}\n`);
    });
  }

  if (readmes.length > 0) {
    console.log('📖 Multiple README.md files (only 1 allowed in root):\n');
    readmes.forEach(issue => {
      console.log(`  ${issue.file}`);
      console.log(`    → ${issue.action}\n`);
    });
  }

  console.log('═'.repeat(80));
  console.log('\nAllowed root files:');
  ALLOWED_ROOT_FILES.forEach(f => console.log(`  ✓ ${f}`));
  console.log('\nAllowed root directories:');
  ALLOWED_ROOT_DIRS.forEach(d => console.log(`  ✓ ${d}/`));

  console.log(`\n⚠️  ${allIssues.length} file(s) need to be relocated.\n`);

  return 1;
}

main().then(exitCode => process.exit(exitCode));
