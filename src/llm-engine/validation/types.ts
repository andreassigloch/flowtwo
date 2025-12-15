/**
 * Validation Module Types
 *
 * Types for ontology rule loading, evaluation, and similarity scoring.
 *
 * CR-030: Evaluation Criteria Implementation
 *
 * @author andreas@siglochconsulting
 */

/**
 * Phase identifier from ontology-rules.json
 */
export type PhaseId =
  | 'all'
  | 'phase1_requirements'
  | 'phase2_logical'
  | 'phase3_physical'
  | 'phase4_verification';

/**
 * Rule severity levels
 */
export type RuleSeverity = 'error' | 'warning' | 'info';

/**
 * Rule type (hard rules block phase gates)
 */
export type RuleType = 'hard' | 'soft';

/**
 * Integrity rule from ontology-rules.json
 */
export interface IntegrityRule {
  id: string;
  description: string;
  phase: PhaseId;
  severity: RuleSeverity;
  type: RuleType;
  cypher: string;
}

/**
 * Validation rule from ontology-rules.json
 */
export interface ValidationRule {
  id: string;
  description: string;
  phase: PhaseId;
  severity: RuleSeverity;
  weight: number;
  type?: RuleType;
  cypher?: string;
  threshold?: number;
  note?: string;
}

/**
 * Similarity thresholds from ontology-rules.json
 */
export interface SimilarityThresholds {
  nearDuplicate: number;
  mergeCandidate: number;
  review: number;
}

/**
 * Node type definition from ontology-rules.json
 */
export interface NodeTypeDefinition {
  name: string;
  description: string;
  abbreviation: string;
  color: string;
  ansiColor: string;
  requiredProperties: string[];
  optionalProperties?: Record<string, unknown>;
  propertyConstraints: Record<string, unknown>;
  allowedOutgoingEdges: string[];
  allowedTargets: Record<string, string[]>;
}

/**
 * Edge type definition from ontology-rules.json
 */
export interface EdgeTypeDefinition {
  name: string;
  description: string;
  isNesting: boolean;
  isChain?: boolean;
  visualStyle: string;
  validConnections: Array<{ source: string; target: string }>;
}

/**
 * Phase definition from ontology-rules.json
 */
export interface PhaseDefinition {
  name: string;
  description: string;
  deliverables: string[];
  gateRules: string[];
}

/**
 * Reward calculation config from ontology-rules.json
 */
export interface RewardConfig {
  description: string;
  formula: string;
  hardRuleFailure: string;
  successThreshold: number;
  componentWeights: Record<string, number>;
  structuralRuleWeights: Record<string, number>;
  phaseThresholds: Record<string, Record<string, number>>;
}

/**
 * Full ontology rules configuration
 */
export interface OntologyRulesConfig {
  $schema: string;
  id: string;
  version: string;
  description: string;
  meta: {
    sources: string[];
    standards: string[];
    created: string;
    updated: string;
    author: string;
  };
  nodeTypes: Record<string, NodeTypeDefinition>;
  edgeTypes: Record<string, EdgeTypeDefinition>;
  phases: Record<string, PhaseDefinition>;
  integrityRules: Record<string, IntegrityRule>;
  validationRules: Record<string, ValidationRule>;
  funcSimilarity: {
    thresholds: SimilarityThresholds;
    canonicalVerbs: Record<string, string[]>;
  };
  schemaSimilarity: {
    thresholds: SimilarityThresholds;
  };
  rewardCalculation: RewardConfig;
  llmContext: {
    systemPromptSection: string;
    suggestionMap: Record<string, string>;
  };
}

/**
 * Rule violation from evaluation
 */
export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  weight: number;
  semanticId: string;
  reason: string;
  suggestion?: string;
  isHard: boolean;
}

/**
 * Similarity match between nodes
 */
export interface SimilarityMatch {
  nodeA: {
    uuid: string;
    semanticId: string;
    type: string;
    name: string;
    descr: string;
  };
  nodeB: {
    uuid: string;
    semanticId: string;
    type: string;
    name: string;
    descr: string;
  };
  score: number;
  matchType: 'exactName' | 'prefixMatch' | 'embedding';
  recommendation: 'merge' | 'review' | 'keep';
}

/**
 * Validation result summary
 */
export interface ValidationResult {
  phase: PhaseId;
  timestamp: number;
  hardRulesPassed: boolean;
  totalViolations: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  violations: RuleViolation[];
  similarityMatches: SimilarityMatch[];
  rewardScore: number;
  phaseGateReady: boolean;
}

/**
 * Node embedding record for AgentDB
 */
export interface NodeEmbedding {
  nodeUuid: string;
  nodeType: string;
  textContent: string;
  embedding: Float32Array;
  embeddingModel: string;
  createdAt: number;
  invalidatedAt?: number;
}

/**
 * Pre-Apply Validation Error (CR-055)
 * Represents an error found before applying operations to AgentDB
 */
export interface PreApplyError {
  code: string;
  severity: 'error' | 'warning';
  operationIndex: number;
  operation: string;
  reason: string;
  suggestion: string;
}

/**
 * Pre-Apply Validation Result (CR-055)
 */
export interface PreApplyResult {
  valid: boolean;
  errors: PreApplyError[];
  feedback: string;
}
