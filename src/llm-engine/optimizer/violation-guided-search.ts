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

  // CR-049: Check allocation_cohesion (FUNC allocated to >1 MOD)
  const funcAllocations: Record<string, string[]> = {};
  for (const [funcId, modId] of Object.entries(funcToMod)) {
    if (!funcAllocations[funcId]) funcAllocations[funcId] = [];
    funcAllocations[funcId].push(modId);
  }

  // Check for additional allocations (multiple MODs per FUNC)
  const funcNodes = new Set(arch.nodes.filter(n => n.type === 'FUNC').map(n => n.id));
  for (const edge of arch.edges.filter(e => e.type === 'allocate')) {
    // Direction 1: MOD → FUNC
    if (funcNodes.has(edge.target)) {
      if (!funcAllocations[edge.target]) funcAllocations[edge.target] = [];
      if (!funcAllocations[edge.target].includes(edge.source)) {
        funcAllocations[edge.target].push(edge.source);
      }
    }
    // Direction 2: FUNC → MOD (handled by funcToMod above)
  }

  for (const [funcId, mods] of Object.entries(funcAllocations)) {
    if (mods.length > 1) {
      violations.push({
        ruleId: 'allocation_cohesion',
        severity: 'soft',
        affectedNodes: [funcId, ...mods],
        message: `FUNC ${funcId} allocated to ${mods.length} MODs (should be 1): ${mods.join(', ')}`,
        suggestedOperator: 'REALLOC'
      });
    }
  }

  // CR-049: Check FUNC similarity (merge candidates)
  const funcSimilarityViolations = detectFuncSimilarityViolations(arch);
  violations.push(...funcSimilarityViolations);

  // CR-049: Check SCHEMA similarity (merge candidates)
  const schemaSimilarityViolations = detectSchemaSimilarityViolations(arch);
  violations.push(...schemaSimilarityViolations);

  return violations;
}

// ============================================================================
// CR-049: Similarity Detection Helpers
// ============================================================================

/**
 * Simple text similarity using Jaccard index on word tokens
 */
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;

  const tokenize = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-zA-ZäöüÄÖÜß0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);

  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Canonical verb mapping (from ontology-rules.json)
 */
const CANONICAL_VERBS: Record<string, string[]> = {
  'Validate': ['Check', 'Verify', 'Ensure', 'Assert', 'Prüfen', 'Validieren'],
  'Create': ['Generate', 'Build', 'Produce', 'Make', 'Erstellen', 'Erzeugen'],
  'Transform': ['Convert', 'Map', 'Translate', 'Parse', 'Transformieren', 'Konvertieren'],
  'Send': ['Emit', 'Publish', 'Dispatch', 'Notify', 'Senden', 'Versenden'],
  'Receive': ['Accept', 'Consume', 'Listen', 'Subscribe', 'Empfangen'],
  'Store': ['Save', 'Persist', 'Write', 'Cache', 'Speichern'],
  'Retrieve': ['Load', 'Fetch', 'Read', 'Get', 'Laden', 'Abrufen'],
  'Calculate': ['Compute', 'Evaluate', 'Derive', 'Berechnen']
};

/**
 * Extract canonical verb from function name
 */
function getCanonicalVerb(name: string): string | null {
  // Try to extract verb from PascalCase name (first word)
  const match = name.match(/^([A-Z][a-z]+)/);
  if (!match) return null;

  const verb = match[1];

  // Check if it's a canonical verb
  for (const [canonical, synonyms] of Object.entries(CANONICAL_VERBS)) {
    if (canonical === verb || synonyms.includes(verb)) {
      return canonical;
    }
  }

  return verb; // Return as-is if not in mapping
}

/**
 * Calculate FUNC similarity score
 * Based on ontology-rules.json funcSimilarity criteria:
 * - descriptionSemantic: 0.35
 * - actionVerb: 0.25
 * - flowStructure: 0.25
 * - reqOverlap: 0.10
 * - hierarchyPosition: 0.05
 */
function calculateFuncSimilarity(
  funcA: Architecture['nodes'][0],
  funcB: Architecture['nodes'][0],
  arch: Architecture
): number {
  let score = 0;

  // 1. Description semantic similarity (35%)
  const descrA = (funcA.properties.descr as string) || funcA.label;
  const descrB = (funcB.properties.descr as string) || funcB.label;
  score += 0.35 * textSimilarity(descrA, descrB);

  // 2. Action verb similarity (25%)
  const verbA = getCanonicalVerb(funcA.label);
  const verbB = getCanonicalVerb(funcB.label);
  if (verbA && verbB && verbA === verbB) {
    score += 0.25;
  }

  // 3. Flow structure similarity (25%)
  // Count io edges for each func
  const ioIn = (id: string) => arch.edges.filter(e => e.type === 'io' && e.target === id).length;
  const ioOut = (id: string) => arch.edges.filter(e => e.type === 'io' && e.source === id).length;

  const inA = ioIn(funcA.id), inB = ioIn(funcB.id);
  const outA = ioOut(funcA.id), outB = ioOut(funcB.id);

  if (inA === inB && outA === outB && (inA > 0 || outA > 0)) {
    score += 0.25;
  } else if ((inA > 0 && inB > 0) || (outA > 0 && outB > 0)) {
    score += 0.15; // Partial match
  }

  // 4. REQ overlap (10%) - Jaccard on satisfy edges
  const reqsA = new Set(arch.edges.filter(e => e.type === 'satisfy' && e.source === funcA.id).map(e => e.target));
  const reqsB = new Set(arch.edges.filter(e => e.type === 'satisfy' && e.source === funcB.id).map(e => e.target));
  if (reqsA.size > 0 && reqsB.size > 0) {
    const intersection = [...reqsA].filter(r => reqsB.has(r)).length;
    const union = new Set([...reqsA, ...reqsB]).size;
    score += 0.10 * (intersection / union);
  }

  // 5. Hierarchy position (5%) - same parent
  const parentA = arch.edges.find(e => e.type === 'compose' && e.target === funcA.id)?.source;
  const parentB = arch.edges.find(e => e.type === 'compose' && e.target === funcB.id)?.source;
  if (parentA && parentB && parentA === parentB) {
    score += 0.05;
  }

  return Math.min(1.0, score);
}

/**
 * Detect FUNC similarity violations
 */
function detectFuncSimilarityViolations(arch: Architecture): Violation[] {
  const violations: Violation[] = [];
  const funcs = arch.nodes.filter(n => n.type === 'FUNC');

  // Pairwise comparison
  for (let i = 0; i < funcs.length; i++) {
    for (let j = i + 1; j < funcs.length; j++) {
      const similarity = calculateFuncSimilarity(funcs[i], funcs[j], arch);

      if (similarity >= 0.85) {
        violations.push({
          ruleId: 'func_near_duplicate',
          severity: 'hard',
          affectedNodes: [funcs[i].id, funcs[j].id],
          message: `Near-duplicate FUNCs: ${funcs[i].label} / ${funcs[j].label} (similarity ${(similarity * 100).toFixed(0)}%)`,
          suggestedOperator: 'MERGE'
        });
      } else if (similarity >= 0.70) {
        violations.push({
          ruleId: 'func_merge_candidate',
          severity: 'soft',
          affectedNodes: [funcs[i].id, funcs[j].id],
          message: `Merge candidate FUNCs: ${funcs[i].label} / ${funcs[j].label} (similarity ${(similarity * 100).toFixed(0)}%)`,
          suggestedOperator: 'MERGE'
        });
      }
    }
  }

  return violations;
}

/**
 * Calculate SCHEMA similarity score
 * Based on ontology-rules.json schemaSimilarity criteria:
 * - structSimilarity: 0.50
 * - nameSimilarity: 0.25
 * - usagePattern: 0.25
 */
function calculateSchemaSimilarity(
  schemaA: Architecture['nodes'][0],
  schemaB: Architecture['nodes'][0],
  arch: Architecture
): number {
  let score = 0;

  // 1. Struct similarity (50%)
  const structA = (schemaA.properties.struct as string) || '';
  const structB = (schemaB.properties.struct as string) || '';

  if (structA && structB) {
    try {
      const jsonA = typeof structA === 'string' ? JSON.parse(structA) : structA;
      const jsonB = typeof structB === 'string' ? JSON.parse(structB) : structB;

      // Compare field names
      const fieldsA = new Set(Object.keys(jsonA));
      const fieldsB = new Set(Object.keys(jsonB));
      const intersection = [...fieldsA].filter(f => fieldsB.has(f)).length;
      const union = new Set([...fieldsA, ...fieldsB]).size;

      if (union > 0) {
        score += 0.50 * (intersection / union);
      }
    } catch {
      // If JSON parsing fails, fall back to text similarity
      score += 0.50 * textSimilarity(structA, structB);
    }
  }

  // 2. Name similarity (25%)
  score += 0.25 * textSimilarity(schemaA.label, schemaB.label);

  // 3. Usage pattern (25%) - same FLOWs use them
  const flowsA = new Set(
    arch.edges
      .filter(e => e.type === 'relation' && e.target === schemaA.id)
      .map(e => e.source)
  );
  const flowsB = new Set(
    arch.edges
      .filter(e => e.type === 'relation' && e.target === schemaB.id)
      .map(e => e.source)
  );

  if (flowsA.size > 0 && flowsB.size > 0) {
    const intersection = [...flowsA].filter(f => flowsB.has(f)).length;
    const union = new Set([...flowsA, ...flowsB]).size;
    score += 0.25 * (intersection / union);
  }

  return Math.min(1.0, score);
}

/**
 * Detect SCHEMA similarity violations
 */
function detectSchemaSimilarityViolations(arch: Architecture): Violation[] {
  const violations: Violation[] = [];
  const schemas = arch.nodes.filter(n => n.type === 'SCHEMA');

  // Pairwise comparison
  for (let i = 0; i < schemas.length; i++) {
    for (let j = i + 1; j < schemas.length; j++) {
      const similarity = calculateSchemaSimilarity(schemas[i], schemas[j], arch);

      if (similarity >= 0.85) {
        violations.push({
          ruleId: 'schema_near_duplicate',
          severity: 'hard',
          affectedNodes: [schemas[i].id, schemas[j].id],
          message: `Near-duplicate SCHEMAs: ${schemas[i].label} / ${schemas[j].label} (similarity ${(similarity * 100).toFixed(0)}%)`,
          suggestedOperator: 'MERGE'
        });
      } else if (similarity >= 0.70) {
        violations.push({
          ruleId: 'schema_merge_candidate',
          severity: 'soft',
          affectedNodes: [schemas[i].id, schemas[j].id],
          message: `Merge candidate SCHEMAs: ${schemas[i].label} / ${schemas[j].label} (similarity ${(similarity * 100).toFixed(0)}%)`,
          suggestedOperator: 'MERGE'
        });
      }
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

  const state: SearchState = {
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
