#!/usr/bin/env npx tsx
/**
 * CR-028 Reward Math Explorer
 * Interactive tool for tuning scoring weights and parameters
 *
 * Usage: npm run explore
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Architecture, ScoreConfig, DEFAULT_SCORE_CONFIG } from './types.js';
import { scoreArchitecture, formatScore } from './multi-objective-scorer.js';
import { detectViolations } from './violation-guided-search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures/architectures');

// ============================================================================
// Fixture Loading
// ============================================================================

interface Fixture {
  name: string;
  arch: Architecture;
  expectedScore: { min: number; max: number };
}

function loadFixtures(): Fixture[] {
  const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
  const fixtures: Fixture[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
    const data = JSON.parse(content);
    fixtures.push({
      name: data.id,
      arch: {
        id: data.id,
        nodes: data.nodes,
        edges: data.edges,
        metadata: { description: data.description }
      },
      expectedScore: data.expectedScore
    });
  }

  return fixtures;
}

// ============================================================================
// Scoring Matrix
// ============================================================================

function printScoringMatrix(fixtures: Fixture[], config: ScoreConfig[]): void {
  console.log('\n=== Scoring Matrix ===\n');

  // Header
  const scoreIds = config.filter(c => c.enabled).map(c => c.id.slice(0, 8));
  console.log(
    'Fixture'.padEnd(25) +
    scoreIds.map(id => id.padStart(10)).join('') +
    '  WEIGHTED'.padStart(10) +
    '  EXPECTED'.padStart(12) +
    '  STATUS'
  );
  console.log('-'.repeat(25 + scoreIds.length * 10 + 32));

  for (const fixture of fixtures) {
    const violations = detectViolations(fixture.arch);
    const score = scoreArchitecture(fixture.arch, violations, { config });

    const scoreValues = config
      .filter(c => c.enabled)
      .map(c => {
        const s = score.scores.find(s => s.id === c.id);
        return (s?.value ?? 0).toFixed(2).padStart(10);
      })
      .join('');

    const weighted = score.weighted.toFixed(3).padStart(10);
    const expected = `${fixture.expectedScore.min.toFixed(2)}-${fixture.expectedScore.max.toFixed(2)}`.padStart(12);

    const inRange = score.weighted >= fixture.expectedScore.min && score.weighted <= fixture.expectedScore.max;
    const status = inRange ? '  OK' : '  MISS';

    console.log(fixture.name.padEnd(25) + scoreValues + weighted + expected + status);
  }
}

// ============================================================================
// Weight Sensitivity Analysis
// ============================================================================

function analyzeSensitivity(fixtures: Fixture[], baseConfig: ScoreConfig[]): void {
  console.log('\n=== Weight Sensitivity Analysis ===\n');

  const variations = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5];

  for (const scoreConfig of baseConfig.filter(c => c.enabled)) {
    console.log(`\nVarying ${scoreConfig.id}:`);
    console.log('Weight'.padEnd(10) + fixtures.map(f => f.name.slice(0, 12).padStart(14)).join(''));

    for (const weight of variations) {
      const modifiedConfig = baseConfig.map(c =>
        c.id === scoreConfig.id ? { ...c, weight } : c
      );

      // Normalize weights
      const totalWeight = modifiedConfig.filter(c => c.enabled).reduce((sum, c) => sum + c.weight, 0);
      const normalizedConfig = modifiedConfig.map(c => ({
        ...c,
        weight: totalWeight > 0 ? c.weight / totalWeight : c.weight
      }));

      const scores = fixtures.map(fixture => {
        const violations = detectViolations(fixture.arch);
        return scoreArchitecture(fixture.arch, violations, { config: normalizedConfig });
      });

      console.log(
        weight.toFixed(1).padEnd(10) +
        scores.map(s => s.weighted.toFixed(3).padStart(14)).join('')
      );
    }
  }
}

// ============================================================================
// Violation Analysis
// ============================================================================

function analyzeViolations(fixtures: Fixture[]): void {
  console.log('\n=== Violation Analysis ===\n');

  for (const fixture of fixtures) {
    const violations = detectViolations(fixture.arch);
    console.log(`${fixture.name}:`);

    if (violations.length === 0) {
      console.log('  No violations');
    } else {
      for (const v of violations) {
        console.log(`  [${v.severity}] ${v.ruleId}: ${v.message}`);
        console.log(`    Suggested: ${v.suggestedOperator ?? 'none'}`);
      }
    }
    console.log('');
  }
}

// ============================================================================
// Parameter Tuning Guide
// ============================================================================

function printTuningGuide(): void {
  console.log('\n=== Parameter Tuning Guide ===\n');

  console.log('Score Weights (must sum to 1.0):');
  for (const config of DEFAULT_SCORE_CONFIG) {
    console.log(`  ${config.id}: ${config.weight} ${config.enabled ? '' : '(disabled)'}`);
  }

  console.log('\nScore Parameters:');
  for (const config of DEFAULT_SCORE_CONFIG) {
    if (config.params) {
      console.log(`  ${config.id}:`);
      for (const [key, value] of Object.entries(config.params)) {
        console.log(`    ${key}: ${value}`);
      }
    }
  }

  console.log('\nTo tune:');
  console.log('1. Edit DEFAULT_SCORE_CONFIG in src/types.ts');
  console.log('2. Run: npm run explore');
  console.log('3. Check if fixture scores match expected ranges');
  console.log('4. Adjust weights/params and repeat');
}

// ============================================================================
// Custom Config Experiment
// ============================================================================

function experimentWithConfig(fixtures: Fixture[]): void {
  console.log('\n=== Custom Configuration Experiment ===\n');

  // Example: prioritize traceability
  const traceabilityFirst: ScoreConfig[] = [
    { id: 'ontology_conformance', weight: 0.20, enabled: true, params: { hardRulePenalty: 1.0, softRulePenalty: 0.5 } },
    { id: 'cohesion', weight: 0.15, enabled: true, params: { idealFuncPerMod: 7, minFuncPerMod: 5, maxFuncPerMod: 9 } },
    { id: 'coupling', weight: 0.15, enabled: true, params: { maxFanOut: 7, fanOutPenaltyFactor: 0.1 } },
    { id: 'volatility_isolation', weight: 0.10, enabled: true, params: { highVolatilityThreshold: 0.7, isolationBonus: 0.2 } },
    { id: 'traceability', weight: 0.40, enabled: true, params: { reqCoverageWeight: 0.5, testCoverageWeight: 0.5 } }
  ];

  console.log('Experiment: Traceability-first (weight 0.40)');
  printScoringMatrix(fixtures, traceabilityFirst);

  // Example: cohesion-focused
  const cohesionFirst: ScoreConfig[] = [
    { id: 'ontology_conformance', weight: 0.20, enabled: true, params: { hardRulePenalty: 1.0, softRulePenalty: 0.5 } },
    { id: 'cohesion', weight: 0.40, enabled: true, params: { idealFuncPerMod: 7, minFuncPerMod: 5, maxFuncPerMod: 9 } },
    { id: 'coupling', weight: 0.20, enabled: true, params: { maxFanOut: 7, fanOutPenaltyFactor: 0.1 } },
    { id: 'volatility_isolation', weight: 0.10, enabled: true, params: { highVolatilityThreshold: 0.7, isolationBonus: 0.2 } },
    { id: 'traceability', weight: 0.10, enabled: true, params: { reqCoverageWeight: 0.5, testCoverageWeight: 0.5 } }
  ];

  console.log('\nExperiment: Cohesion-first (weight 0.40)');
  printScoringMatrix(fixtures, cohesionFirst);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('CR-028 Reward Math Explorer');
  console.log('===========================\n');

  const fixtures = loadFixtures();
  console.log(`Loaded ${fixtures.length} fixtures from ${FIXTURES_DIR}`);

  // 1. Show current scoring matrix
  printScoringMatrix(fixtures, DEFAULT_SCORE_CONFIG);

  // 2. Analyze violations
  analyzeViolations(fixtures);

  // 3. Sensitivity analysis
  analyzeSensitivity(fixtures, DEFAULT_SCORE_CONFIG);

  // 4. Custom experiments
  experimentWithConfig(fixtures);

  // 5. Tuning guide
  printTuningGuide();
}

main().catch(console.error);
