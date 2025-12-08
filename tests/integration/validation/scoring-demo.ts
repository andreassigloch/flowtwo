/**
 * CR-030 Scoring Demo
 *
 * Interactive demonstration of the validation scoring system.
 * Run with: npx tsx tests/integration/validation/scoring-demo.ts
 *
 * @author andreas@siglochconsulting
 */

import { getRuleLoader } from '../../../src/llm-engine/validation/rule-loader.js';
import { createSimilarityScorer, type NodeData } from '../../../src/llm-engine/validation/similarity-scorer.js';
// Note: UnifiedRuleEvaluator requires AgentDB, so demo only shows static structure

// ANSI colors for terminal output
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

function header(text: string): void {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);
}

function section(text: string): void {
  console.log(`\n${BOLD}${YELLOW}▶ ${text}${RESET}\n`);
}

function success(text: string): void {
  console.log(`${GREEN}✓${RESET} ${text}`);
}

function warning(text: string): void {
  console.log(`${YELLOW}⚠${RESET} ${text}`);
}

function error(text: string): void {
  console.log(`${RED}✗${RESET} ${text}`);
}

function info(text: string): void {
  console.log(`${DIM}  ${text}${RESET}`);
}

async function main() {
  header('CR-030 Validation Scoring Demo');

  // ============================================================
  // 1. Rule Loader Demo
  // ============================================================
  section('1. Rule Loader - Loading from ontology-rules.json');

  const loader = getRuleLoader();
  const config = loader.load();

  success(`Loaded ontology rules v${config.version}`);
  info(`Source: settings/ontology-rules.json`);

  console.log(`\n  ${BOLD}Rules Summary:${RESET}`);
  console.log(`  ├─ Integrity Rules: ${loader.getIntegrityRules().length}`);
  console.log(`  ├─ Validation Rules: ${loader.getValidationRules().length}`);
  console.log(`  └─ Total Rules: ${loader.getIntegrityRules().length + loader.getValidationRules().length}`);

  // Show rules by phase
  console.log(`\n  ${BOLD}Rules by Phase:${RESET}`);
  for (const phase of ['phase1_requirements', 'phase2_logical', 'phase3_physical', 'phase4_verification'] as const) {
    const intRules = loader.getIntegrityRulesForPhase(phase);
    const valRules = loader.getValidationRulesForPhase(phase);
    console.log(`  ├─ ${phase}: ${intRules.length} integrity, ${valRules.length} validation`);
  }

  // Show thresholds
  console.log(`\n  ${BOLD}Similarity Thresholds:${RESET}`);
  const thresholds = loader.getFuncSimilarityThresholds();
  console.log(`  ├─ Near-duplicate: ${thresholds.nearDuplicate} (merge automatically)`);
  console.log(`  ├─ Merge candidate: ${thresholds.mergeCandidate} (flag for review)`);
  console.log(`  └─ Review: ${thresholds.review} (optional review)`);

  // ============================================================
  // 2. Similarity Scorer Demo
  // ============================================================
  section('2. Similarity Scorer - Detecting duplicates and merge candidates');

  const scorer = createSimilarityScorer();

  // Test scenario: e-commerce system with potential duplicates
  const testNodes: NodeData[] = [
    // Near-duplicates (same name, different descriptions)
    {
      uuid: '1',
      semanticId: 'ValidateOrder.FN.001',
      type: 'FUNC',
      name: 'ValidateOrder',
      description: 'Validates incoming order data for completeness',
    },
    {
      uuid: '2',
      semanticId: 'ValidateOrder.FN.002',
      type: 'FUNC',
      name: 'ValidateOrder',
      description: 'Checks order validity before processing',
    },

    // Merge candidates (similar names)
    {
      uuid: '3',
      semanticId: 'ProcessPayment.FN.001',
      type: 'FUNC',
      name: 'ProcessPayment',
      description: 'Processes credit card payments',
    },
    {
      uuid: '4',
      semanticId: 'ProcessPaymentRefund.FN.001',
      type: 'FUNC',
      name: 'ProcessPaymentRefund',
      description: 'Processes payment refunds',
    },

    // Distinct functions
    {
      uuid: '5',
      semanticId: 'SendNotification.FN.001',
      type: 'FUNC',
      name: 'SendNotification',
      description: 'Sends email and push notifications to users',
    },
    {
      uuid: '6',
      semanticId: 'CalculateShipping.FN.001',
      type: 'FUNC',
      name: 'CalculateShipping',
      description: 'Calculates shipping costs based on weight and destination',
    },

    // Schema near-duplicates
    {
      uuid: '7',
      semanticId: 'OrderSchema.SC.001',
      type: 'SCHEMA',
      name: 'OrderSchema',
      description: 'Data schema for order objects',
    },
    {
      uuid: '8',
      semanticId: 'OrderSchema.SC.002',
      type: 'SCHEMA',
      name: 'OrderSchema',
      description: 'Order data structure definition',
    },
  ];

  console.log(`  ${BOLD}Test Nodes:${RESET}`);
  for (const node of testNodes) {
    console.log(`  ├─ ${node.semanticId} (${node.type}): ${node.name}`);
  }

  // Find all similarity matches
  console.log(`\n  ${BOLD}Pairwise Similarity Analysis:${RESET}`);

  const matches = await scorer.findAllSimilarityMatches(testNodes, 0.5);

  if (matches.length === 0) {
    info('No similarity matches found above 0.5 threshold');
  } else {
    for (const match of matches) {
      const scoreColor = match.score >= 0.85 ? RED : match.score >= 0.70 ? YELLOW : GREEN;
      const label = match.score >= 0.85 ? 'NEAR-DUPLICATE' : match.score >= 0.70 ? 'MERGE CANDIDATE' : 'REVIEW';

      console.log(`\n  ${scoreColor}${BOLD}${label}${RESET} (score: ${match.score.toFixed(3)})`);
      console.log(`  ├─ Node A: ${match.nodeA.semanticId}`);
      console.log(`  │  └─ "${match.nodeA.description}"`);
      console.log(`  ├─ Node B: ${match.nodeB.semanticId}`);
      console.log(`  │  └─ "${match.nodeB.description}"`);
      console.log(`  ├─ Match type: ${match.matchType}`);
      console.log(`  └─ Recommendation: ${BOLD}${match.recommendation.toUpperCase()}${RESET}`);
    }
  }

  // Show specific pairwise scores
  console.log(`\n  ${BOLD}Specific Score Examples:${RESET}`);

  const pairs = [
    [testNodes[0], testNodes[1]], // Exact name match
    [testNodes[2], testNodes[3]], // Prefix match
    [testNodes[4], testNodes[5]], // Distinct
  ];

  for (const [a, b] of pairs) {
    const score = await scorer.getSimilarityScore(a, b);
    const scoreColor = score >= 0.85 ? RED : score >= 0.70 ? YELLOW : GREEN;
    console.log(`  ├─ ${a.name} ↔ ${b.name}: ${scoreColor}${score.toFixed(3)}${RESET}`);
  }

  // Cache stats
  const cacheStats = scorer.getCacheStats();
  console.log(`\n  ${BOLD}Embedding Cache:${RESET}`);
  console.log(`  └─ Cached embeddings: ${cacheStats.size}`);

  // ============================================================
  // 3. Rule Evaluator Demo (requires AgentDB)
  // ============================================================
  section('3. Rule Evaluator - Phase Gate Validation');

  // UnifiedRuleEvaluator requires AgentDB, so we show the available phases
  console.log(`  ${BOLD}Phase Gate Evaluation (requires AgentDB):${RESET}\n`);
  console.log(`  ${DIM}To run actual validation, use the /validate command in the app.${RESET}\n`);

  for (const phase of ['phase1_requirements', 'phase2_logical', 'phase3_physical', 'phase4_verification'] as const) {
    const phaseDef = loader.getPhaseDefinition(phase);
    console.log(`  ${BOLD}${phase}${RESET}`);
    console.log(`    ├─ Name: ${phaseDef?.name || 'N/A'}`);
    console.log(`    ├─ Description: ${phaseDef?.description || 'N/A'}`);
    console.log(`    └─ Gate threshold: ${phaseDef?.minRewardForGate || 'N/A'}`);
    console.log();
  }

  // ============================================================
  // 4. Reward Calculation Explanation
  // ============================================================
  section('4. Reward Calculation Formula');

  const rewardConfig = loader.getRewardConfig();

  console.log(`  ${BOLD}Formula:${RESET}`);
  console.log(`  ${DIM}${rewardConfig.formula}${RESET}\n`);

  console.log(`  ${BOLD}Component Weights:${RESET}`);
  for (const [key, value] of Object.entries(rewardConfig.componentWeights)) {
    console.log(`  ├─ ${key}: ${(value * 100).toFixed(0)}%`);
  }

  console.log(`\n  ${BOLD}Structural Rule Weights (top 5):${RESET}`);
  const sortedWeights = Object.entries(rewardConfig.structuralRuleWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [rule, weight] of sortedWeights) {
    console.log(`  ├─ ${rule}: ${(weight * 100).toFixed(0)}%`);
  }

  console.log(`\n  ${BOLD}Success Threshold:${RESET} ${rewardConfig.successThreshold}`);
  console.log(`  ${BOLD}Hard Rule Failure:${RESET} ${rewardConfig.hardRuleFailure}`);

  // ============================================================
  // 5. Phase Thresholds
  // ============================================================
  section('5. Phase Transition Thresholds');

  console.log(`  ${BOLD}Requirements to advance to next phase:${RESET}\n`);

  const phaseThresholds = rewardConfig.phaseThresholds;
  for (const [transition, metrics] of Object.entries(phaseThresholds)) {
    console.log(`  ${BOLD}${transition}:${RESET}`);
    for (const [metric, threshold] of Object.entries(metrics)) {
      console.log(`    ├─ ${metric} >= ${threshold}`);
    }
    console.log();
  }

  // ============================================================
  // Summary
  // ============================================================
  header('Demo Complete');

  console.log(`  ${BOLD}What you saw:${RESET}`);
  console.log(`  1. Rule loader extracted ${loader.getIntegrityRules().length + loader.getValidationRules().length} rules from JSON`);
  console.log(`  2. Similarity scorer found ${matches.length} potential duplicates/merge candidates`);
  console.log(`  3. Rule evaluator structure for phase gate validation`);
  console.log(`  4. Reward calculation formula and weights`);
  console.log(`  5. Phase transition thresholds\n`);

  console.log(`  ${BOLD}To test with real data:${RESET}`);
  console.log(`  1. Start Neo4j: ${DIM}docker-compose up neo4j${RESET}`);
  console.log(`  2. Create nodes in the graph`);
  console.log(`  3. Call evaluator.evaluate('phase2_logical', workspaceId, systemId)`);
  console.log(`  4. Check violations and reward score\n`);
}

main().catch(console.error);
