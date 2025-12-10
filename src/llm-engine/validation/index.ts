/**
 * Validation Module
 *
 * Provides rule-based validation for INCOSE/SysML 2.0 conformant graphs.
 *
 * CR-030: Evaluation Criteria Implementation
 *
 * @author andreas@siglochconsulting
 */

// Types
export type {
  PhaseId,
  RuleSeverity,
  RuleType,
  IntegrityRule,
  ValidationRule,
  SimilarityThresholds,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  PhaseDefinition,
  RewardConfig,
  OntologyRulesConfig,
  RuleViolation,
  SimilarityMatch,
  ValidationResult,
  NodeEmbedding,
} from './types.js';

// Rule Loader
export {
  RuleLoader,
  getRuleLoader,
  createRuleLoader,
} from './rule-loader.js';

// Similarity Scorer
export type { NodeData } from './similarity-scorer.js';
export {
  SimilarityScorer,
  getSimilarityScorer,
  createSimilarityScorer,
} from './similarity-scorer.js';

// Rule Evaluator (Unified - reads from AgentDB)
export {
  UnifiedRuleEvaluator,
  getUnifiedRuleEvaluator,
  createUnifiedRuleEvaluator,
  createEvaluatorFromGraph,
  clearEvaluatorCache,
} from './unified-rule-evaluator.js';

// CR-038 Phase 4: Background Validator
export {
  BackgroundValidator,
  createBackgroundValidator,
  type BackgroundValidatorOptions,
} from './background-validator.js';
