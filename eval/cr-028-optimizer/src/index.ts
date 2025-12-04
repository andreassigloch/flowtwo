#!/usr/bin/env npx tsx
/**
 * CR-028 Optimizer Sandbox - Main Entry Point
 * Run optimization on fixtures and display results
 *
 * Usage: npm run run
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Architecture } from './types.js';
import { scoreArchitecture, formatScore } from './multi-objective-scorer.js';
import { formatParetoFront, ParetoFrontImpl } from './pareto-front.js';
import { runSearchWithProgress, detectViolations } from './violation-guided-search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures/architectures');

// ============================================================================
// Load Fixture
// ============================================================================

function loadFixture(name: string): Architecture {
  const filePath = path.join(FIXTURES_DIR, `${name}.json`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  return {
    id: data.id,
    nodes: data.nodes,
    edges: data.edges,
    metadata: { description: data.description }
  };
}

function listFixtures(): string[] {
  return fs.readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const fixtureName = args[0];

  console.log('=== CR-028 Optimizer Sandbox ===\n');

  if (!fixtureName || fixtureName === '--list') {
    console.log('Available fixtures:');
    for (const name of listFixtures()) {
      const arch = loadFixture(name);
      const violations = detectViolations(arch);
      const score = scoreArchitecture(arch, violations);
      console.log(`  ${name.padEnd(25)} score=${score.weighted.toFixed(3)} violations=${violations.length}`);
    }
    console.log('\nUsage: npm run run -- <fixture-name>');
    console.log('Example: npm run run -- millers-violation');
    return;
  }

  // Load and score initial architecture
  console.log(`Loading fixture: ${fixtureName}`);
  const arch = loadFixture(fixtureName);

  console.log(`\nArchitecture: ${arch.id}`);
  console.log(`Nodes: ${arch.nodes.length}`);
  console.log(`Edges: ${arch.edges.length}`);

  // Initial scoring
  console.log('\n--- Initial State ---');
  const violations = detectViolations(arch);
  const score = scoreArchitecture(arch, violations, { verbose: true });

  console.log(`\nViolations (${violations.length}):`);
  for (const v of violations) {
    console.log(`  [${v.severity}] ${v.ruleId}: ${v.message}`);
  }

  // Run optimization
  console.log('\n--- Running Optimization ---\n');
  const result = runSearchWithProgress(arch, {
    maxIterations: 30,
    randomSeed: 42
  });

  // Summary
  console.log('\n--- Optimization Summary ---');
  console.log(`Success: ${result.success}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Convergence: ${result.convergenceReason}`);
  console.log(`Variants generated: ${result.stats.totalVariantsGenerated}`);
  console.log(`Variants rejected: ${result.stats.variantsRejected}`);

  console.log('\nOperator usage:');
  for (const [op, count] of Object.entries(result.stats.operatorUsage)) {
    console.log(`  ${op}: ${count}`);
  }

  console.log('\nScore improvement:');
  const initialScore = result.stats.scoreHistory[0];
  const finalScore = result.bestVariant.score;
  console.log(`  Initial: ${formatScore(initialScore!)}`);
  console.log(`  Final:   ${formatScore(finalScore)}`);
  console.log(`  Delta:   ${(finalScore.weighted - initialScore!.weighted).toFixed(4)}`);

  // Final violations
  const finalViolations = detectViolations(result.bestVariant.architecture);
  console.log(`\nFinal violations (${finalViolations.length}):`);
  for (const v of finalViolations) {
    console.log(`  [${v.severity}] ${v.ruleId}: ${v.message}`);
  }
}

main().catch(console.error);
