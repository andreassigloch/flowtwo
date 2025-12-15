#!/usr/bin/env npx tsx
/**
 * Format E Validation Script
 *
 * Validates Format E text files before import into GraphEngine.
 * Checks syntax, references, and structure.
 *
 * Usage: npx tsx scripts/validate-format-e.ts <file.txt>
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  valid: boolean;
  nodeCount: number;
  edgeCount: number;
  errors: string[];
  warnings: string[];
}

const VALID_NODE_TYPES = ['SYS', 'FUNC', 'REQ', 'UC', 'MOD', 'ACTOR', 'FLOW', 'FCHAIN', 'TEST', 'SCHEMA'];
const VALID_ARROWS = ['-cp->', '-io->', '-sat->', '-ver->', '-alc->', '-rel->', '-compose->', '-relation->'];

function validateFormatE(content: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    nodeCount: 0,
    edgeCount: 0,
    errors: [],
    warnings: [],
  };

  const lines = content.split('\n').map((l) => l.trim());
  const nodeIds = new Set<string>();
  const edgeTargets = new Set<string>();

  let section: 'none' | 'nodes' | 'edges' = 'none';
  let hasNodesSection = false;
  let hasEdgesSection = false;
  let sysCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip empty lines
    if (!line) continue;

    // Section markers (case-insensitive) - check BEFORE comment skip
    const lineLower = line.toLowerCase();
    if (lineLower === '## nodes' || lineLower === '[nodes]') {
      section = 'nodes';
      hasNodesSection = true;
      continue;
    }
    if (lineLower === '## edges' || lineLower === '[edges]') {
      section = 'edges';
      hasEdgesSection = true;
      continue;
    }
    if (line.startsWith('## ') || line.startsWith('[')) continue; // Other sections

    // Skip comments (after section marker check)
    if (line.startsWith('#')) continue;

    // Validate nodes
    if (section === 'nodes') {
      const parts = line.split('|').map((p) => p.trim());

      if (parts.length < 3) {
        result.errors.push(`Line ${lineNum}: Invalid node syntax. Expected Name|Type|SemanticId|Description`);
        result.valid = false;
        continue;
      }

      const [name, type, semanticId] = parts;

      // Check type
      if (!VALID_NODE_TYPES.includes(type)) {
        result.errors.push(`Line ${lineNum}: Invalid node type "${type}". Valid: ${VALID_NODE_TYPES.join(', ')}`);
        result.valid = false;
      }

      // Check duplicate
      if (nodeIds.has(semanticId)) {
        result.errors.push(`Line ${lineNum}: Duplicate semanticId "${semanticId}"`);
        result.valid = false;
      }

      // Count SYS nodes
      if (type === 'SYS') sysCount++;

      nodeIds.add(semanticId);
      result.nodeCount++;
    }

    // Validate edges
    if (section === 'edges') {
      // Find arrow
      let foundArrow = '';
      for (const arrow of VALID_ARROWS) {
        if (line.includes(arrow)) {
          foundArrow = arrow;
          break;
        }
      }

      if (!foundArrow) {
        result.errors.push(`Line ${lineNum}: Invalid edge syntax. No valid arrow found. Use: ${VALID_ARROWS.slice(0, 4).join(', ')}`);
        result.valid = false;
        continue;
      }

      const parts = line.split(foundArrow).map((p) => p.trim());
      if (parts.length !== 2) {
        result.errors.push(`Line ${lineNum}: Invalid edge syntax. Expected SourceId ${foundArrow} TargetId`);
        result.valid = false;
        continue;
      }

      const [sourceId, targetPart] = parts;
      const targets = targetPart.split(',').map((t) => t.trim()).filter((t) => t);

      edgeTargets.add(sourceId);
      for (const target of targets) {
        edgeTargets.add(target);
        result.edgeCount++;
      }
    }
  }

  // Structure checks
  if (!hasNodesSection) {
    result.errors.push('Missing "## Nodes" section marker');
    result.valid = false;
  }

  if (!hasEdgesSection && result.edgeCount === 0) {
    result.warnings.push('No "## Edges" section found (OK if no edges needed)');
  }

  if (sysCount === 0) {
    result.warnings.push('No SYS node found. Graphs typically have one root SYS node.');
  } else if (sysCount > 1) {
    result.warnings.push(`Found ${sysCount} SYS nodes. Typically only one root SYS node expected.`);
  }

  // Reference checks
  for (const targetId of edgeTargets) {
    if (!nodeIds.has(targetId)) {
      result.errors.push(`Edge references non-existent node: "${targetId}"`);
      result.valid = false;
    }
  }

  return result;
}

// CLI
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: npx tsx scripts/validate-format-e.ts <file.txt>');
  console.log('');
  console.log('Validates Format E files before import into GraphEngine.');
  process.exit(0);
}

const filePath = path.resolve(args[0]);

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
const result = validateFormatE(content);

console.log(`\nValidating: ${path.basename(filePath)}`);
console.log('─'.repeat(50));

if (result.valid) {
  console.log(`✅ VALID`);
} else {
  console.log(`❌ INVALID`);
}

console.log(`   Nodes: ${result.nodeCount}`);
console.log(`   Edges: ${result.edgeCount}`);

if (result.errors.length > 0) {
  console.log('\nErrors:');
  for (const err of result.errors) {
    console.log(`  ❌ ${err}`);
  }
}

if (result.warnings.length > 0) {
  console.log('\nWarnings:');
  for (const warn of result.warnings) {
    console.log(`  ⚠️  ${warn}`);
  }
}

console.log('');
process.exit(result.valid ? 0 : 1);
