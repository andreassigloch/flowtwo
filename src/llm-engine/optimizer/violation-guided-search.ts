/**
 * CR-028 Violation-Guided Local Search
 * Main optimization algorithm with simulated annealing escape
 *
 * @author andreas@siglochconsulting
 */

import {
  Architecture,
  Variant,
  Violation,
  SearchConfig,
  SearchResult,
  SearchState,
  MoveOperatorType,
  DEFAULT_SEARCH_CONFIG
} from './types.js';
import { scoreArchitecture, formatScore } from './multi-objective-scorer.js';
import { ParetoFrontImpl, formatParetoFront } from './pareto-front.js';
import { MOVE_OPERATORS, getApplicableOperators, applyOperator } from './move-operators.js';

// ============================================================================
// Violation Detector (simplified - real one would use ontology-rules.json)
// ============================================================================

// Helper to get MOD for a FUNC (supports both edge directions)
function getFuncToModMapping(arch: Architecture): Record<string, string> {
  const funcToMod: Record<string, string> = {};
  const modNodes = new Set(arch.nodes.filter(n => n.type === 'MOD').map(n => n.id));
  const funcNodes = new Set(arch.nodes.filter(n => n.type === 'FUNC').map(n => n.id));

  for (const edge of arch.edges.filter(e => e.type === 'allocate')) {
    // Direction 1: FUNC → MOD
    if (funcNodes.has(edge.source) && modNodes.has(edge.target)) {
      funcToMod[edge.source] = edge.target;
    }
    // Direction 2: MOD → FUNC
    else if (modNodes.has(edge.source) && funcNodes.has(edge.target)) {
      funcToMod[edge.target] = edge.source;
    }
  }
  return funcToMod;
}

export function detectViolations(arch: Architecture): Violation[] {
  const violations: Violation[] = [];

  // Build FUNC→MOD mapping (supports both edge directions)
  const funcToMod = getFuncToModMapping(arch);

  // Check Miller's Law (7±2 FUNCs per MOD)
  const modFuncCount: Record<string, string[]> = {};
  for (const [funcId, modId] of Object.entries(funcToMod)) {
    if (!modFuncCount[modId]) modFuncCount[modId] = [];
    modFuncCount[modId].push(funcId);
  }

  for (const [modId, funcs] of Object.entries(modFuncCount)) {
    if (funcs.length > 9) {
      // Oversized MOD - suggest MOD_SPLIT to create a new MOD
      violations.push({
        ruleId: 'millers_law_func',
        severity: 'soft',
        affectedNodes: [modId, ...funcs],
        message: `MOD ${modId} has ${funcs.length} FUNCs (max 9)`,
        suggestedOperator: 'MOD_SPLIT'
      });
    }
    if (funcs.length < 5 && funcs.length > 0) {
      violations.push({
        ruleId: 'millers_law_func',
        severity: 'soft',
        affectedNodes: [modId, ...funcs],
        message: `MOD ${modId} has only ${funcs.length} FUNCs (min 5)`,
        suggestedOperator: 'FUNC_MERGE'
      });
    }
  }

  // Check volatility isolation (reuse funcToMod from above)
  const modHighVol: Record<string, number> = {};
  const modTotal: Record<string, number> = {};

  for (const [_funcId, modId] of Object.entries(funcToMod)) {
    modTotal[modId] = (modTotal[modId] ?? 0) + 1;
  }

  for (const func of arch.nodes.filter(n => n.type === 'FUNC')) {
    const vol = (func.properties.volatility as number) ?? 0;
    if (vol >= 0.7) {
      const modId = funcToMod[func.id];
      if (modId) {
        modHighVol[modId] = (modHighVol[modId] ?? 0) + 1;
      }
    }
  }

  // Check if high-vol FUNCs are mixed with low-vol
  // A MOD is "mixed" if it has BOTH high-vol and low-vol FUNCs
  for (const [modId, highVolCount] of Object.entries(modHighVol)) {
    const total = modTotal[modId] ?? 0;
    const lowVolCount = total - highVolCount;

    // Mixed if there are both high-vol and low-vol FUNCs in the same MOD
    if (highVolCount > 0 && lowVolCount > 0) {
      const affectedFuncs = arch.nodes
        .filter(n => n.type === 'FUNC' && funcToMod[n.id] === modId && ((n.properties.volatility as number) ?? 0) >= 0.7)
        .map(n => n.id);

      violations.push({
        ruleId: 'volatile_func_isolation',
        severity: 'soft',
        affectedNodes: [modId, ...affectedFuncs],
        message: `MOD ${modId} mixes high-vol (${highVolCount}) with low-vol (${lowVolCount}) FUNCs`,
        suggestedOperator: 'ALLOC_SHIFT'
      });
    }
  }

  // Check REQ traceability
  const reqsWithSatisfy = new Set(
    arch.edges.filter(e => e.type === 'satisfy').map(e => e.target)
  );
  const reqsWithVerify = new Set(
    arch.edges.filter(e => e.type === 'verify').map(e => e.source)
  );

  for (const req of arch.nodes.filter(n => n.type === 'REQ')) {
    if (!reqsWithSatisfy.has(req.id)) {
      violations.push({
        ruleId: 'function_requirements',
        severity: 'soft',
        affectedNodes: [req.id],
        message: `REQ ${req.id} has no satisfying FUNC`,
        suggestedOperator: 'REQ_LINK'
      });
    }
    if (!reqsWithVerify.has(req.id)) {
      violations.push({
        ruleId: 'requirements_verification',
        severity: 'soft',
        affectedNodes: [req.id],
        message: `REQ ${req.id} has no verifying TEST`,
        suggestedOperator: 'TEST_LINK'
      });
    }
  }

  // Check orphan FUNCs (no io edges)
  const funcsWithIo = new Set([
    ...arch.edges.filter(e => e.type === 'io').map(e => e.source),
    ...arch.edges.filter(e => e.type === 'io').map(e => e.target)
  ]);

  for (const func of arch.nodes.filter(n => n.type === 'FUNC')) {
    if (!funcsWithIo.has(func.id)) {
      violations.push({
        ruleId: 'isolation',
        severity: 'soft',
        affectedNodes: [func.id],
        message: `FUNC ${func.id} is isolated (no io edges)`,
        suggestedOperator: 'FLOW_REDIRECT'
      });
    }
  }

  return violations;
}

// ============================================================================
// Random Number Generator (seeded for reproducibility)
// ============================================================================

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ============================================================================
// Main Search Algorithm
// ============================================================================

export interface SearchCallbacks {
  onIteration?: (state: SearchState) => void;
  onNewBest?: (variant: Variant) => void;
  onParetoUpdate?: (front: ParetoFrontImpl) => void;
  verbose?: boolean;
}

export function violationGuidedSearch(
  initialArch: Architecture,
  config: Partial<SearchConfig> = {},
  callbacks: SearchCallbacks = {}
): SearchResult {
  const cfg: SearchConfig = { ...DEFAULT_SEARCH_CONFIG, ...config };
  const rng = new SeededRandom(cfg.randomSeed ?? Date.now());

  // Stats tracking
  const stats = {
    totalVariantsGenerated: 0,
    variantsRejected: 0,
    operatorUsage: {} as Record<MoveOperatorType, number>,
    scoreHistory: [] as ReturnType<typeof scoreArchitecture>[]
  };

  // Initialize
  const initialViolations = detectViolations(initialArch);
  const initialScore = scoreArchitecture(initialArch, initialViolations);

  const initialVariant: Variant = {
    id: 'v0',
    architecture: initialArch,
    score: initialScore,
    parentId: null,
    appliedOperator: null,
    generation: 0
  };

  const paretoFront = new ParetoFrontImpl(cfg.paretoFrontSize);
  paretoFront.add(initialVariant);

  let state: SearchState = {
    iteration: 0,
    currentBest: initialVariant,
    paretoFront: paretoFront.getVariants(),
    temperature: cfg.annealingInitialTemp,
    improvementHistory: [],
    converged: false
  };

  stats.scoreHistory.push(initialScore);

  if (callbacks.verbose) {
    console.log('=== Violation-Guided Local Search ===');
    console.log(`Initial score: ${formatScore(initialScore)}`);
    console.log(`Initial violations: ${initialViolations.length}`);
    console.log('');
  }

  // Main loop
  for (let iter = 0; iter < cfg.maxIterations; iter++) {
    state.iteration = iter;

    // Detect violations in current best
    const violations = detectViolations(state.currentBest.architecture);

    if (violations.length === 0) {
      if (callbacks.verbose) {
        console.log(`Iteration ${iter}: No violations - converged!`);
      }
      state.converged = true;
      break;
    }

    // Get applicable operators
    const applicableOps = getApplicableOperators(violations);
    if (applicableOps.length === 0) {
      if (callbacks.verbose) {
        console.log(`Iteration ${iter}: No applicable operators`);
      }
      continue;
    }

    // Generate candidate variants
    const candidates: Variant[] = [];

    for (const violation of violations) {
      // Use suggested operator or try random one
      const op = violation.suggestedOperator ?? rng.choice(applicableOps);

      if (!MOVE_OPERATORS[op]) continue;

      const result = applyOperator(state.currentBest.architecture, op, violation);

      if (result.success && result.after) {
        stats.totalVariantsGenerated++;
        stats.operatorUsage[op] = (stats.operatorUsage[op] ?? 0) + 1;

        const newViolations = detectViolations(result.after);
        const newScore = scoreArchitecture(result.after, newViolations);

        // Check for hard rule violations (constraint propagation)
        const hasHardViolation = newViolations.some(v => v.severity === 'hard');
        if (hasHardViolation) {
          stats.variantsRejected++;
          continue;
        }

        const variant: Variant = {
          id: `v${iter}_${candidates.length}`,
          architecture: result.after,
          score: newScore,
          parentId: state.currentBest.id,
          appliedOperator: op,
          generation: iter + 1
        };

        candidates.push(variant);
      }
    }

    if (candidates.length === 0) {
      if (callbacks.verbose) {
        console.log(`Iteration ${iter}: No valid candidates generated`);
      }
      continue;
    }

    // Select best candidate or accept worse with simulated annealing
    candidates.sort((a, b) => b.score.weighted - a.score.weighted);
    const bestCandidate = candidates[0];

    const improvement = bestCandidate.score.weighted - state.currentBest.score.weighted;
    state.improvementHistory.push(improvement);

    // Keep history bounded
    if (state.improvementHistory.length > cfg.convergenceWindow) {
      state.improvementHistory.shift();
    }

    let accepted = false;

    if (improvement > 0) {
      // Always accept improvement
      state.currentBest = bestCandidate;
      accepted = true;
    } else {
      // Simulated annealing: accept worse solution with probability
      const acceptProb = Math.exp(improvement / state.temperature);
      if (rng.next() < acceptProb) {
        state.currentBest = bestCandidate;
        accepted = true;
      }
    }

    if (accepted) {
      // Update Pareto front
      const added = paretoFront.add(bestCandidate);
      state.paretoFront = paretoFront.getVariants();

      if (added && callbacks.onParetoUpdate) {
        callbacks.onParetoUpdate(paretoFront);
      }

      if (improvement > 0 && callbacks.onNewBest) {
        callbacks.onNewBest(bestCandidate);
      }
    }

    stats.scoreHistory.push(state.currentBest.score);

    // Decay temperature
    state.temperature *= cfg.annealingDecay;

    // Check convergence
    if (state.improvementHistory.length >= cfg.convergenceWindow) {
      const avgImprovement = state.improvementHistory.reduce((a, b) => a + b, 0) / state.improvementHistory.length;
      if (Math.abs(avgImprovement) < cfg.convergenceThreshold) {
        state.converged = true;
        if (callbacks.verbose) {
          console.log(`Iteration ${iter}: Converged (avg improvement ${avgImprovement.toFixed(4)})`);
        }
        break;
      }
    }

    if (callbacks.onIteration) {
      callbacks.onIteration(state);
    }

    if (callbacks.verbose) {
      console.log(
        `Iteration ${iter}: score=${state.currentBest.score.weighted.toFixed(3)} ` +
        `imp=${improvement >= 0 ? '+' : ''}${improvement.toFixed(4)} ` +
        `temp=${state.temperature.toFixed(3)} ` +
        `violations=${violations.length} ` +
        `accepted=${accepted}`
      );
    }
  }

  // Determine convergence reason
  let convergenceReason: SearchResult['convergenceReason'];
  if (state.converged) {
    const violations = detectViolations(state.currentBest.architecture);
    convergenceReason = violations.length === 0 ? 'threshold' : 'no_improvement';
  } else {
    convergenceReason = 'max_iterations';
  }

  const best = paretoFront.getBest() ?? state.currentBest;

  if (callbacks.verbose) {
    console.log('');
    console.log('=== Search Complete ===');
    console.log(`Iterations: ${state.iteration + 1}`);
    console.log(`Convergence: ${convergenceReason}`);
    console.log(`Best score: ${formatScore(best.score)}`);
    console.log('');
    console.log(formatParetoFront(paretoFront));
  }

  return {
    success: best.score.weighted >= 0.7, // Configurable threshold
    iterations: state.iteration + 1,
    paretoFront: paretoFront.getVariants(),
    bestVariant: best,
    convergenceReason,
    stats
  };
}

// ============================================================================
// Utility: Run search with progress logging
// ============================================================================

export function runSearchWithProgress(
  arch: Architecture,
  config?: Partial<SearchConfig>
): SearchResult {
  return violationGuidedSearch(arch, config, {
    verbose: true,
    onNewBest: (variant) => {
      console.log(`  >> New best: ${formatScore(variant.score)}`);
    }
  });
}
