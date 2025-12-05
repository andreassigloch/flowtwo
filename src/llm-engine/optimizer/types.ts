/**
 * CR-028 Architecture Optimization - Core Types
 * Moved from eval/cr-028-optimizer to main app for CR-031 integration
 * @author andreas@siglochconsulting
 */

// ============================================================================
// Graph Structure (simplified for optimization)
// ============================================================================

export type NodeType = 'SYS' | 'UC' | 'REQ' | 'FUNC' | 'FLOW' | 'SCHEMA' | 'MOD' | 'TEST';

export interface Node {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, unknown>;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  type: string; // 'satisfy', 'allocate', 'io', 'verify', etc.
}

export interface Architecture {
  id: string;
  nodes: Node[];
  edges: Edge[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Scoring System (tunable)
// ============================================================================

export interface ScoreConfig {
  id: string;
  weight: number;
  enabled: boolean;
  // Tunable parameters per score type
  params?: Record<string, number>;
}

export interface ScoreResult {
  id: string;
  value: number;        // 0.0 - 1.0
  rawValue?: number;    // Before normalization
  details?: string;     // Explanation for debugging
}

export interface MultiObjectiveScore {
  scores: ScoreResult[];
  weighted: number;     // Weighted sum (for hill climbing)
  timestamp: number;
}

// Default scoring configuration - TUNABLE
// Tuned for realistic differentiation between good and bad architectures
export const DEFAULT_SCORE_CONFIG: ScoreConfig[] = [
  {
    id: 'ontology_conformance',
    weight: 0.30,
    enabled: true,
    params: {
      hardRulePenalty: 1.0,   // Full penalty for hard rule violations
      softRulePenalty: 0.8,   // Strong penalty for soft rule violations
      perViolationPenalty: 0.15  // Each violation costs 15%
    }
  },
  {
    id: 'cohesion',
    weight: 0.25,
    enabled: true,
    params: {
      idealFuncPerMod: 7,     // Miller's number
      minFuncPerMod: 5,
      maxFuncPerMod: 9,
      deviationPenalty: 0.12  // Per-FUNC deviation from ideal
    }
  },
  {
    id: 'coupling',
    weight: 0.15,
    enabled: true,
    params: {
      maxFanOut: 7,           // Card & Glass threshold
      fanOutPenaltyFactor: 0.15
    }
  },
  {
    id: 'volatility_isolation',
    weight: 0.15,
    enabled: true,
    params: {
      highVolatilityThreshold: 0.7,
      mixedModPenalty: 0.4    // Penalty when high-vol mixed with low-vol
    }
  },
  {
    id: 'traceability',
    weight: 0.10,
    enabled: true,
    params: {
      reqCoverageWeight: 0.5,   // FUNC→REQ coverage
      testCoverageWeight: 0.5   // REQ→TEST coverage
    }
  },
  {
    id: 'connectivity',
    weight: 0.10,
    enabled: true,
    params: {
      // Percentage of FUNCs that must have io edges
      minConnectedRatio: 0.9
    }
  }
];

// ============================================================================
// Violations
// ============================================================================

export interface Violation {
  ruleId: string;
  severity: 'hard' | 'soft';
  affectedNodes: string[];
  message: string;
  suggestedOperator?: MoveOperatorType;
}

// ============================================================================
// Move Operators (Generic, Node-Type-Agnostic)
// ============================================================================

export type MoveOperatorType =
  // Generic operators - work on any node type (6 core operations)
  | 'SPLIT'            // Split node into two (oversized → 2 smaller)
  | 'MERGE'            // Merge two nodes into one (undersized → 1 larger)
  | 'LINK'             // Add edge between nodes (missing connection)
  | 'REALLOC'          // Move child from one parent to another
  | 'CREATE'           // Create new node (parent, container, or sibling)
  | 'DELETE'           // Remove node and reassign children
  // Legacy aliases (for backward compatibility)
  | 'FUNC_SPLIT'
  | 'FUNC_MERGE'
  | 'MOD_SPLIT'
  | 'FLOW_REDIRECT'
  | 'FLOW_CONSOLIDATE'
  | 'ALLOC_SHIFT'
  | 'ALLOC_REBALANCE'
  | 'REQ_LINK'
  | 'TEST_LINK';

export interface MoveOperator {
  type: MoveOperatorType;
  applicableTo: Violation['ruleId'][];  // Which violations this operator can fix
  apply(arch: Architecture, violation: Violation): Architecture | null;
  // Returns null if operator cannot be applied
}

export interface MoveResult {
  operator: MoveOperatorType;
  success: boolean;
  before: Architecture;
  after: Architecture | null;
  affectedNodes: string[];
  description: string;
}

// ============================================================================
// Variants & Pareto Front
// ============================================================================

export interface Variant {
  id: string;
  architecture: Architecture;
  score: MultiObjectiveScore;
  parentId: string | null;
  appliedOperator: MoveOperatorType | null;
  generation: number;
}

export interface ParetoFront {
  variants: Variant[];
  maxSize: number;
  // Returns true if variant was added (is non-dominated)
  add(variant: Variant): boolean;
  // Get variants sorted by specific objective
  sortedBy(objectiveId: string): Variant[];
}

// ============================================================================
// Search Algorithm Config
// ============================================================================

export interface SearchConfig {
  maxIterations: number;
  convergenceThreshold: number;  // Stop if improvement < this
  convergenceWindow: number;     // Check convergence over N iterations
  annealingInitialTemp: number;
  annealingDecay: number;
  paretoFrontSize: number;
  randomSeed?: number;           // For reproducibility
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  maxIterations: 50,
  convergenceThreshold: 0.01,
  convergenceWindow: 5,
  annealingInitialTemp: 0.3,
  annealingDecay: 0.95,
  paretoFrontSize: 5,
  randomSeed: 42
};

// ============================================================================
// Search State & Results
// ============================================================================

export interface SearchState {
  iteration: number;
  currentBest: Variant;
  paretoFront: Variant[];
  temperature: number;
  improvementHistory: number[];  // Last N improvements
  converged: boolean;
}

export interface SearchResult {
  success: boolean;
  iterations: number;
  paretoFront: Variant[];
  bestVariant: Variant;
  convergenceReason: 'threshold' | 'max_iterations' | 'no_improvement';
  stats: {
    totalVariantsGenerated: number;
    variantsRejected: number;
    operatorUsage: Record<MoveOperatorType, number>;
    scoreHistory: MultiObjectiveScore[];
  };
}
