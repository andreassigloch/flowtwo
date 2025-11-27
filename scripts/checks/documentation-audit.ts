#!/usr/bin/env tsx
/**
 * Documentation Audit Script
 *
 * Analyzes all .md files in project root and categorizes them:
 * - ✅ Implemented features → Archive
 * - 📋 Unimplemented features → Convert to CR
 * - 🗑️ Outdated/superseded → Archive as obsolete
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuditResult {
  file: string;
  category: 'implemented' | 'unimplemented' | 'outdated' | 'merge';
  action: string;
  reason: string;
}

const ROOT_DIR = path.resolve(__dirname, '../..');
const ALLOWED_ROOT_FILES = [
  'README.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.env',
  '.env.example',
  '.gitignore',
  '.prettierrc',
  'vitest.config.ts'
];

function getRootMarkdownFiles(): string[] {
  const files = fs.readdirSync(ROOT_DIR);
  return files.filter(f =>
    f.endsWith('.md') &&
    f !== 'README.md' &&
    !fs.statSync(path.join(ROOT_DIR, f)).isDirectory()
  );
}

function analyzeFile(filename: string): AuditResult {
  const filepath = path.join(ROOT_DIR, filename);
  const content = fs.readFileSync(filepath, 'utf-8');

  // Phase completion documents
  if (filename.match(/^PHASE\d+(_COMPLETE|_PROGRESS|_TMUX_VERIFIED)\.md$/)) {
    return {
      file: filename,
      category: 'implemented',
      action: `Move to docs/archive/phases/${filename}`,
      reason: 'Phase completion documentation - historical record'
    };
  }

  // Test reports
  if (filename.match(/E2E_TEST_REPORT\.md/)) {
    return {
      file: filename,
      category: 'implemented',
      action: `Move to docs/archive/${filename}`,
      reason: 'Historical test report'
    };
  }

  // Quick fix documents
  if (filename.match(/QUICK_FIX\.md/)) {
    return {
      file: filename,
      category: 'implemented',
      action: `Move to docs/archive/${filename}`,
      reason: 'Historical fix documentation'
    };
  }

  // Terminal solution
  if (filename === '3TERMINAL_SOLUTION.md') {
    // Check if startup.sh exists (multi-terminal solution)
    const startupShExists = fs.existsSync(path.join(ROOT_DIR, 'startup.sh'));

    if (startupShExists) {
      return {
        file: filename,
        category: 'implemented',
        action: `Move to docs/archive/${filename}`,
        reason: 'Multi-terminal solution implemented (startup.sh exists)'
      };
    } else {
      return {
        file: filename,
        category: 'unimplemented',
        action: 'Create CR for terminal solution',
        reason: 'Terminal solution not fully implemented'
      };
    }
  }

  // Implementation status
  if (filename === 'IMPLEMENTATION_STATUS.md') {
    return {
      file: filename,
      category: 'outdated',
      action: `Move to docs/archive/obsolete/${filename}`,
      reason: 'Superseded by actual code implementation and phase docs'
    };
  }

  // How to run / Quick start / Usage guide
  if (filename.match(/(HOW_TO_RUN|QUICKSTART|USAGE_GUIDE)\.md/)) {
    return {
      file: filename,
      category: 'merge',
      action: `Merge relevant sections into root README.md, then delete`,
      reason: 'Content should be in main README.md'
    };
  }

  // Troubleshooting
  if (filename === 'TROUBLESHOOTING.md') {
    return {
      file: filename,
      category: 'merge',
      action: `Merge into docs/TROUBLESHOOTING.md or root README.md section`,
      reason: 'Troubleshooting should be consolidated'
    };
  }

  // Simplification proposal
  if (filename === 'SIMPLIFY_PROPOSAL.md') {
    // Check if content mentions unimplemented features
    if (content.includes('TODO') || content.includes('proposal') || content.includes('consider')) {
      return {
        file: filename,
        category: 'unimplemented',
        action: 'Review content - potentially create CR-007-simplification-tasks.md',
        reason: 'Contains proposals that may not be implemented'
      };
    } else {
      return {
        file: filename,
        category: 'outdated',
        action: `Move to docs/archive/obsolete/${filename}`,
        reason: 'Proposals likely superseded by current implementation'
      };
    }
  }

  // Default: needs manual review
  return {
    file: filename,
    category: 'outdated',
    action: `Move to docs/archive/${filename}`,
    reason: 'Default: archive for historical reference'
  };
}

function main() {
  console.log('📋 Documentation Audit Report\n');
  console.log('═'.repeat(80));

  const mdFiles = getRootMarkdownFiles();

  if (mdFiles.length === 0) {
    console.log('✅ No documentation files found in root (except README.md)');
    return 0;
  }

  console.log(`\nFound ${mdFiles.length} markdown files in root directory:\n`);

  const results: AuditResult[] = mdFiles.map(analyzeFile);

  // Group by category
  const implemented = results.filter(r => r.category === 'implemented');
  const unimplemented = results.filter(r => r.category === 'unimplemented');
  const outdated = results.filter(r => r.category === 'outdated');
  const merge = results.filter(r => r.category === 'merge');

  // Print results
  if (implemented.length > 0) {
    console.log('✅ IMPLEMENTED - Move to Archive:\n');
    implemented.forEach(r => {
      console.log(`   ${r.file}`);
      console.log(`   → ${r.action}`);
      console.log(`   Reason: ${r.reason}\n`);
    });
  }

  if (unimplemented.length > 0) {
    console.log('📋 UNIMPLEMENTED - Create Change Requests:\n');
    unimplemented.forEach(r => {
      console.log(`   ${r.file}`);
      console.log(`   → ${r.action}`);
      console.log(`   Reason: ${r.reason}\n`);
    });
  }

  if (outdated.length > 0) {
    console.log('🗑️  OUTDATED - Move to Archive/Obsolete:\n');
    outdated.forEach(r => {
      console.log(`   ${r.file}`);
      console.log(`   → ${r.action}`);
      console.log(`   Reason: ${r.reason}\n`);
    });
  }

  if (merge.length > 0) {
    console.log('🔀 MERGE - Consolidate into README.md:\n');
    merge.forEach(r => {
      console.log(`   ${r.file}`);
      console.log(`   → ${r.action}`);
      console.log(`   Reason: ${r.reason}\n`);
    });
  }

  console.log('═'.repeat(80));
  console.log('\nSummary:');
  console.log(`  ✅ Implemented: ${implemented.length}`);
  console.log(`  📋 Unimplemented: ${unimplemented.length}`);
  console.log(`  🗑️  Outdated: ${outdated.length}`);
  console.log(`  🔀 Merge: ${merge.length}`);
  console.log(`  📊 Total: ${results.length}`);

  // Exit with warning if any files need attention
  if (results.length > 0) {
    console.log('\n⚠️  Action required: Clean up root directory documentation');
    return 1;
  }

  return 0;
}

const exitCode = main();
process.exit(exitCode);
