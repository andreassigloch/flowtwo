/**
 * CR-028 Architecture Optimizer
 * Moved from eval/cr-028-optimizer to main app for CR-031 integration
 *
 * @author andreas@siglochconsulting
 */

// Types
export type {
  Architecture,
  Node,
  Edge,
  NodeType,
  ScoreConfig,
  ScoreResult,
  MultiObjectiveScore,
  Violation,
  MoveOperatorType,
  MoveOperator,
  MoveResult,
  Variant,
  ParetoFront,
  SearchConfig,
  SearchState,
  SearchResult
} from './types.js';

export {
  DEFAULT_SCORE_CONFIG,
  DEFAULT_SEARCH_CONFIG
} from './types.js';

// Multi-objective scorer
export {
  scoreArchitecture,
  compareDominance,
  formatScore,
  type ScorerOptions
} from './multi-objective-scorer.js';

// Pareto front
export {
  ParetoFrontImpl,
  formatParetoFront,
  type ParetoStats
} from './pareto-front.js';

// Move operators
export {
  MOVE_OPERATORS,
  getApplicableOperators,
  applyOperator,
  tryAllOperators
} from './move-operators.js';

// Violation-guided search
export {
  detectViolations,
  violationGuidedSearch,
  runSearchWithProgress,
  type SearchCallbacks
} from './violation-guided-search.js';
