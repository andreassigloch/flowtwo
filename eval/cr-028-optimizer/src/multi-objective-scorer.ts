/**
 * CR-028 Multi-Objective Scorer
 * Calculates multiple quality scores for architecture variants
 *
 * TUNING GUIDE:
 * - Adjust weights in ScoreConfig to change objective priorities
 * - Modify params in each scorer to change sensitivity
 * - Use explore-rewards.ts to visualize score distributions
 *
 * @author andreas@siglochconsulting
 */

import {
  Architecture,
  Node,
  Edge,
  ScoreConfig,
  ScoreResult,
  MultiObjectiveScore,
  DEFAULT_SCORE_CONFIG,
  Violation
} from './types.js';

// Re-export for consumers
export type { ScoreResult };

// ============================================================================
// Scorer Interface
// ============================================================================

type ScorerFn = (
  arch: Architecture,
  config: ScoreConfig,
  violations: Violation[]
) => ScoreResult;

// ============================================================================
// Individual Scorers
// ============================================================================

/**
 * Ontology Conformance Score
 * Based on violation count and severity
 * More aggressive penalty to differentiate good/bad architectures
 */
const scoreOntologyConformance: ScorerFn = (arch, config, violations) => {
  const hardPenalty = config.params?.hardRulePenalty ?? 1.0;
  const softPenalty = config.params?.softRulePenalty ?? 0.8;
  const perViolationPenalty = config.params?.perViolationPenalty ?? 0.15;

  const hardViolations = violations.filter(v => v.severity === 'hard').length;
  const softViolations = violations.filter(v => v.severity === 'soft').length;

  // Each violation reduces score significantly
  // Hard violations: full penalty per violation
  // Soft violations: reduced penalty per violation
  const totalPenalty = Math.min(
    1.0,
    hardViolations * hardPenalty * perViolationPenalty +
    softViolations * softPenalty * perViolationPenalty
  );

  const value = Math.max(0, 1.0 - totalPenalty);

  return {
    id: 'ontology_conformance',
    value,
    rawValue: violations.length,
    details: `hard=${hardViolations}, soft=${softViolations}, penalty=${totalPenalty.toFixed(3)}`
  };
};

/**
 * Cohesion Score
 * Measures FUNC distribution across MODs (Miller's Law: 7±2)
 * More aggressive penalty for out-of-range MODs
 */
const scoreCohesion: ScorerFn = (arch, config, _violations) => {
  const idealFuncPerMod = config.params?.idealFuncPerMod ?? 7;
  const minFunc = config.params?.minFuncPerMod ?? 5;
  const maxFunc = config.params?.maxFuncPerMod ?? 9;
  const deviationPenalty = config.params?.deviationPenalty ?? 0.12;

  const mods = arch.nodes.filter(n => n.type === 'MOD');
  const funcs = arch.nodes.filter(n => n.type === 'FUNC');

  if (mods.length === 0) {
    return { id: 'cohesion', value: 0, rawValue: 0, details: 'No MODs found' };
  }

  // Count FUNCs per MOD via allocate edges
  const allocateEdges = arch.edges.filter(e => e.type === 'allocate');
  const funcCountPerMod: Record<string, number> = {};

  for (const mod of mods) {
    funcCountPerMod[mod.id] = 0;
  }

  for (const edge of allocateEdges) {
    if (funcCountPerMod[edge.target] !== undefined) {
      funcCountPerMod[edge.target]++;
    }
  }

  // Calculate penalty for out-of-range MODs
  let totalPenalty = 0;
  const modScores: string[] = [];

  for (const [modId, count] of Object.entries(funcCountPerMod)) {
    let penalty = 0;
    if (count < minFunc) {
      // Undersized: penalty per missing FUNC
      penalty = (minFunc - count) * deviationPenalty;
    } else if (count > maxFunc) {
      // Oversized: penalty per extra FUNC (stronger)
      penalty = (count - maxFunc) * deviationPenalty * 1.5;
    }
    // Within range: no penalty
    totalPenalty += penalty;
    modScores.push(`${modId}:${count}`);
  }

  const value = Math.max(0, 1.0 - totalPenalty);

  return {
    id: 'cohesion',
    value,
    rawValue: totalPenalty,
    details: `MODs(${mods.length}), FUNCs(${funcs.length}), dist=[${modScores.join(', ')}]`
  };
};

/**
 * Coupling Score
 * Measures inter-MOD dependencies (fan-out)
 * Lower coupling = higher score
 */
const scoreCoupling: ScorerFn = (arch, config, _violations) => {
  const maxFanOut = config.params?.maxFanOut ?? 7;
  const penaltyFactor = config.params?.fanOutPenaltyFactor ?? 0.1;

  const mods = arch.nodes.filter(n => n.type === 'MOD');

  if (mods.length <= 1) {
    return { id: 'coupling', value: 1.0, rawValue: 0, details: 'Single MOD, no coupling' };
  }

  // Build MOD→FUNC mapping
  const modToFuncs: Record<string, Set<string>> = {};
  const funcToMod: Record<string, string> = {};

  for (const mod of mods) {
    modToFuncs[mod.id] = new Set();
  }

  for (const edge of arch.edges.filter(e => e.type === 'allocate')) {
    const funcId = edge.source;
    const modId = edge.target;
    if (modToFuncs[modId]) {
      modToFuncs[modId].add(funcId);
      funcToMod[funcId] = modId;
    }
  }

  // Calculate fan-out per MOD (FLOWs crossing MOD boundaries)
  const fanOutPerMod: Record<string, number> = {};

  for (const mod of mods) {
    fanOutPerMod[mod.id] = 0;
  }

  for (const edge of arch.edges.filter(e => e.type === 'io')) {
    const sourceMod = funcToMod[edge.source];
    const targetMod = funcToMod[edge.target];

    if (sourceMod && targetMod && sourceMod !== targetMod) {
      fanOutPerMod[sourceMod]++;
    }
  }

  // Score based on fan-out exceeding threshold
  let totalPenalty = 0;
  const modDetails: string[] = [];

  for (const [modId, fanOut] of Object.entries(fanOutPerMod)) {
    if (fanOut > maxFanOut) {
      totalPenalty += (fanOut - maxFanOut) * penaltyFactor;
    }
    modDetails.push(`${modId}:${fanOut}`);
  }

  const value = Math.max(0, 1.0 - totalPenalty);

  return {
    id: 'coupling',
    value,
    rawValue: totalPenalty,
    details: `fan-out=[${modDetails.join(', ')}], maxAllowed=${maxFanOut}`
  };
};

/**
 * Volatility Isolation Score
 * High-volatility FUNCs should be isolated in dedicated MODs
 * Penalty for mixing high-vol with low-vol FUNCs
 */
const scoreVolatilityIsolation: ScorerFn = (arch, config, _violations) => {
  const highVolThreshold = config.params?.highVolatilityThreshold ?? 0.7;
  const mixedModPenalty = config.params?.mixedModPenalty ?? 0.4;

  const funcs = arch.nodes.filter(n => n.type === 'FUNC');
  const highVolFuncs = funcs.filter(f =>
    (f.properties.volatility as number ?? 0) >= highVolThreshold
  );

  if (highVolFuncs.length === 0) {
    return { id: 'volatility_isolation', value: 1.0, rawValue: 0, details: 'No high-volatility FUNCs' };
  }

  // Check if high-vol FUNCs are in dedicated MODs
  const allocateEdges = arch.edges.filter(e => e.type === 'allocate');
  const funcToMod: Record<string, string> = {};
  const modFuncCount: Record<string, number> = {};
  const modHighVolCount: Record<string, number> = {};

  for (const edge of allocateEdges) {
    funcToMod[edge.source] = edge.target;
    modFuncCount[edge.target] = (modFuncCount[edge.target] ?? 0) + 1;
  }

  for (const func of highVolFuncs) {
    const modId = funcToMod[func.id];
    if (modId) {
      modHighVolCount[modId] = (modHighVolCount[modId] ?? 0) + 1;
    }
  }

  // Count MODs that mix high-vol with low-vol FUNCs
  let mixedModCount = 0;
  for (const [modId, highVolCount] of Object.entries(modHighVolCount)) {
    const totalInMod = modFuncCount[modId] ?? 0;
    const lowVolCount = totalInMod - highVolCount;
    // MOD is "mixed" if it has both high-vol and low-vol FUNCs
    if (highVolCount > 0 && lowVolCount > 0) {
      mixedModCount++;
    }
  }

  // Penalty based on number of mixed MODs
  const penalty = mixedModCount * mixedModPenalty;
  const value = Math.max(0, 1.0 - penalty);

  return {
    id: 'volatility_isolation',
    value,
    rawValue: mixedModCount,
    details: `highVol=${highVolFuncs.length}, mixedMODs=${mixedModCount}, penalty=${penalty.toFixed(2)}`
  };
};

/**
 * Traceability Score
 * Measures REQ←FUNC and REQ→TEST coverage
 */
const scoreTraceability: ScorerFn = (arch, config, _violations) => {
  const reqCoverageWeight = config.params?.reqCoverageWeight ?? 0.5;
  const testCoverageWeight = config.params?.testCoverageWeight ?? 0.5;

  const reqs = arch.nodes.filter(n => n.type === 'REQ');
  const funcs = arch.nodes.filter(n => n.type === 'FUNC');
  const tests = arch.nodes.filter(n => n.type === 'TEST');

  if (reqs.length === 0) {
    return { id: 'traceability', value: 1.0, rawValue: 0, details: 'No REQs to trace' };
  }

  // FUNC→REQ coverage (satisfy edges)
  const satisfyEdges = arch.edges.filter(e => e.type === 'satisfy');
  const reqsWithFunc = new Set(satisfyEdges.map(e => e.target));
  const funcCoverage = reqsWithFunc.size / reqs.length;

  // REQ→TEST coverage (verify edges)
  const verifyEdges = arch.edges.filter(e => e.type === 'verify');
  const reqsWithTest = new Set(verifyEdges.map(e => e.source));
  const testCoverage = tests.length > 0 ? reqsWithTest.size / reqs.length : 0;

  const value = funcCoverage * reqCoverageWeight + testCoverage * testCoverageWeight;

  return {
    id: 'traceability',
    value,
    rawValue: funcCoverage + testCoverage,
    details: `REQs=${reqs.length}, funcCov=${(funcCoverage * 100).toFixed(0)}%, testCov=${(testCoverage * 100).toFixed(0)}%`
  };
};

/**
 * Connectivity Score
 * Measures how many FUNCs have io (data flow) edges
 * Isolated FUNCs reduce score
 */
const scoreConnectivity: ScorerFn = (arch, config, _violations) => {
  const funcs = arch.nodes.filter(n => n.type === 'FUNC');

  if (funcs.length === 0) {
    return { id: 'connectivity', value: 1.0, rawValue: 0, details: 'No FUNCs' };
  }

  // Find FUNCs with io edges (source or target)
  const ioEdges = arch.edges.filter(e => e.type === 'io');
  const connectedFuncs = new Set<string>();

  for (const edge of ioEdges) {
    // Check if source or target is a FUNC
    if (funcs.some(f => f.id === edge.source)) {
      connectedFuncs.add(edge.source);
    }
    if (funcs.some(f => f.id === edge.target)) {
      connectedFuncs.add(edge.target);
    }
  }

  const connectedRatio = connectedFuncs.size / funcs.length;
  const isolatedCount = funcs.length - connectedFuncs.size;

  // List isolated FUNCs for details
  const isolatedFuncs = funcs
    .filter(f => !connectedFuncs.has(f.id))
    .map(f => f.label || f.id)
    .slice(0, 5); // Show max 5

  const moreCount = isolatedCount > 5 ? ` +${isolatedCount - 5} more` : '';

  return {
    id: 'connectivity',
    value: connectedRatio,
    rawValue: isolatedCount,
    details: `FUNCs=${funcs.length}, connected=${connectedFuncs.size} (${(connectedRatio * 100).toFixed(0)}%), isolated=[${isolatedFuncs.join(', ')}${moreCount}]`
  };
};

// ============================================================================
// Scorer Registry
// ============================================================================

const SCORERS: Record<string, ScorerFn> = {
  ontology_conformance: scoreOntologyConformance,
  cohesion: scoreCohesion,
  coupling: scoreCoupling,
  volatility_isolation: scoreVolatilityIsolation,
  traceability: scoreTraceability,
  connectivity: scoreConnectivity
};

// ============================================================================
// Main Scoring Function
// ============================================================================

export interface ScorerOptions {
  config?: ScoreConfig[];
  verbose?: boolean;
}

export function scoreArchitecture(
  arch: Architecture,
  violations: Violation[],
  options: ScorerOptions = {}
): MultiObjectiveScore {
  const config = options.config ?? DEFAULT_SCORE_CONFIG;
  const scores: ScoreResult[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const scoreConfig of config) {
    if (!scoreConfig.enabled) continue;

    const scorer = SCORERS[scoreConfig.id];
    if (!scorer) {
      console.warn(`Unknown scorer: ${scoreConfig.id}`);
      continue;
    }

    const result = scorer(arch, scoreConfig, violations);
    scores.push(result);

    weightedSum += result.value * scoreConfig.weight;
    totalWeight += scoreConfig.weight;

    if (options.verbose) {
      console.log(`  ${result.id}: ${result.value.toFixed(3)} (w=${scoreConfig.weight}) - ${result.details}`);
    }
  }

  const weighted = totalWeight > 0 ? weightedSum / totalWeight : 0;

  if (options.verbose) {
    console.log(`  TOTAL: ${weighted.toFixed(3)}`);
  }

  return {
    scores,
    weighted,
    timestamp: Date.now()
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compare two scores for Pareto dominance
 * Returns: 1 if a dominates b, -1 if b dominates a, 0 if neither
 */
export function compareDominance(a: MultiObjectiveScore, b: MultiObjectiveScore): -1 | 0 | 1 {
  let aBetter = 0;
  let bBetter = 0;

  for (let i = 0; i < a.scores.length; i++) {
    const aVal = a.scores[i]?.value ?? 0;
    const bVal = b.scores[i]?.value ?? 0;

    if (aVal > bVal) aBetter++;
    if (bVal > aVal) bBetter++;
  }

  if (aBetter > 0 && bBetter === 0) return 1;  // a dominates b
  if (bBetter > 0 && aBetter === 0) return -1; // b dominates a
  return 0; // Neither dominates
}

/**
 * Pretty-print a score for debugging
 */
export function formatScore(score: MultiObjectiveScore): string {
  const parts = score.scores.map(s => `${s.id}=${s.value.toFixed(2)}`);
  return `[${parts.join(', ')}] = ${score.weighted.toFixed(3)}`;
}
