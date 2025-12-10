#!/usr/bin/env npx tsx
/**
 * Validate Format E Model against Ontology Rules
 *
 * Usage: npx tsx scripts/validate-model.ts models/graphengineCr38.formatE.md
 *
 * @author andreas@siglochconsulting
 */

import { readFileSync } from 'fs';
import { FormatEParser } from '../src/shared/parsers/format-e-parser.js';
import { UnifiedRuleEvaluator } from '../src/llm-engine/validation/unified-rule-evaluator.js';
import { UnifiedAgentDBService } from '../src/llm-engine/agentdb/unified-agentdb-service.js';

async function main() {
  const modelPath = process.argv[2] || 'models/graphengineCr38.formatE.md';

  console.log(`\n📄 Loading model: ${modelPath}\n`);

  // Read and extract operations block
  const content = readFileSync(modelPath, 'utf-8');
  const operationsMatch = content.match(/<operations>([\s\S]*?)<\/operations>/);

  if (!operationsMatch) {
    console.error('❌ No <operations> block found in file');
    process.exit(1);
  }

  const formatEContent = operationsMatch[1];

  // Parse Format E using parseDiff (operations format with + prefixes)
  const parser = new FormatEParser();
  console.log('🔍 Parsing Format E operations...\n');

  let diff;
  try {
    diff = parser.parseDiff(formatEContent, 'graphengine-ws', 'GraphEngineCR38.SY.001');
  } catch (e) {
    console.error('❌ Parse error:', e);
    process.exit(1);
  }

  // Extract nodes and edges from operations
  const nodes = new Map<string, any>();
  const edges = new Map<string, any>();

  for (const op of diff.operations) {
    if (op.type === 'add_node' && op.node) {
      nodes.set(op.node.semanticId, op.node);
    }
    if (op.type === 'add_edge' && op.edge) {
      const edgeKey = `${op.edge.sourceId}-${op.edge.type}-${op.edge.targetId}`;
      edges.set(edgeKey, op.edge);
    }
  }

  console.log(`✅ Parsed successfully:`);
  console.log(`   - Operations: ${diff.operations.length}`);
  console.log(`   - Nodes: ${nodes.size}`);
  console.log(`   - Edges: ${edges.size}`);

  // Count by type
  const nodeTypes = new Map<string, number>();
  for (const node of nodes.values()) {
    nodeTypes.set(node.type, (nodeTypes.get(node.type) || 0) + 1);
  }
  console.log('\n📊 Node distribution:');
  for (const [type, count] of Array.from(nodeTypes.entries()).sort()) {
    console.log(`   - ${type}: ${count}`);
  }

  const edgeTypes = new Map<string, number>();
  for (const edge of edges.values()) {
    edgeTypes.set(edge.type, (edgeTypes.get(edge.type) || 0) + 1);
  }
  console.log('\n📊 Edge distribution:');
  for (const [type, count] of Array.from(edgeTypes.entries()).sort()) {
    console.log(`   - ${type}: ${count}`);
  }

  // Initialize AgentDB and load graph
  console.log('\n🔄 Loading into AgentDB...');
  const agentDB = new UnifiedAgentDBService();
  await agentDB.initialize('graphengine-ws', 'GraphEngineCR38.SY.001');

  // Load nodes and edges
  for (const [_id, node] of nodes) {
    agentDB.setNode(node);
  }
  for (const [_id, edge] of edges) {
    agentDB.setEdge(edge);
  }

  console.log(`   AgentDB loaded: ${nodes.size} nodes, ${edges.size} edges`);

  // Run validation
  console.log('\n🔍 Running ontology validation...\n');
  const evaluator = new UnifiedRuleEvaluator(agentDB);
  const result = await evaluator.evaluate('all');

  // Display results
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                   VALIDATION RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`📈 Reward Score: ${(result.rewardScore * 100).toFixed(1)}%`);
  console.log(`❌ Errors: ${result.errorCount}`);
  console.log(`⚠️  Warnings: ${result.warningCount}`);

  if (result.violations.length > 0) {
    console.log('\n📋 Violations:\n');

    const errors = result.violations.filter(v => v.severity === 'error');
    const warnings = result.violations.filter(v => v.severity === 'warning');

    // Group by ruleId
    const errorsByRule = new Map<string, typeof errors>();
    for (const e of errors) {
      const rule = e.ruleId || 'unknown';
      if (!errorsByRule.has(rule)) errorsByRule.set(rule, []);
      errorsByRule.get(rule)!.push(e);
    }

    if (errors.length > 0) {
      console.log('ERRORS:');
      for (const [ruleId, ruleErrors] of errorsByRule) {
        console.log(`  ❌ [${ruleId}] (${ruleErrors.length} violations)`);
        for (const v of ruleErrors.slice(0, 5)) {
          console.log(`     - ${v.semanticId || 'N/A'}: ${v.reason}`);
          if (v.suggestion) console.log(`       💡 ${v.suggestion}`);
        }
        if (ruleErrors.length > 5) {
          console.log(`     ... and ${ruleErrors.length - 5} more`);
        }
      }
    }

    if (warnings.length > 0) {
      console.log('\nWARNINGS:');
      for (const v of warnings.slice(0, 10)) {
        console.log(`  ⚠️  [${v.ruleId}] ${v.semanticId}`);
        console.log(`     ${v.reason}`);
      }
      if (warnings.length > 10) {
        console.log(`  ... and ${warnings.length - 10} more warnings`);
      }
    }
  } else {
    console.log('\n✅ No violations found!');
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  // Cleanup
  await agentDB.shutdown();

  process.exit(result.errorCount > 0 ? 1 : 0);
}

main().catch(console.error);
