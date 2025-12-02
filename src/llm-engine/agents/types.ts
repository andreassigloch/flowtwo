/**
 * Multi-Agent System Types
 *
 * Types for the INCOSE-conformant multi-agent architecture.
 *
 * CR-024: Multi-Agent Architecture System
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

/**
 * Agent role identifiers (INCOSE-conformant)
 * CR-027: Added verification-engineer for Phase 4
 */
export type AgentRole =
  | 'requirements-engineer'
  | 'system-architect'
  | 'architecture-reviewer'
  | 'functional-analyst'
  | 'verification-engineer';

/**
 * Agent message types for inter-agent communication
 */
export type AgentMessageType =
  | 'handoff'
  | 'review-request'
  | 'validation-result'
  | 'correction'
  | 'clarification-request'
  | 'clarification-response';

/**
 * Agent work item status
 */
export type AgentWorkStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

/**
 * Inter-agent message
 */
export interface AgentMessage {
  id: string;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  messageType: AgentMessageType;
  payload: {
    graphSnapshot: string;
    context: string;
    openQuestions?: string[];
    validationErrors?: ValidationError[];
    corrections?: CorrectionProposal[];
  };
  timestamp: number;
}

/**
 * Agent work item for workflow tracking
 */
export interface AgentWorkItem {
  id: string;
  agentId: AgentRole;
  task: string;
  status: AgentWorkStatus;
  inputFrom?: AgentRole;
  outputTo?: AgentRole;
  validationErrors?: ValidationError[];
  startedAt: number;
  completedAt?: number;
}

/**
 * Validation error from Architecture Reviewer
 */
export interface ValidationError {
  code: string;
  severity: 'error' | 'warning' | 'info';
  semanticId: string;
  issue: string;
  suggestion?: string;
  incoseReference?: string;
}

/**
 * Correction proposal from Architecture Reviewer
 */
export interface CorrectionProposal {
  semanticId: string;
  currentType: string;
  proposedType: string;
  reason: string;
  operations: string;
}

/**
 * Node type classification result from Decision Tree
 */
export interface ClassificationResult {
  nodeType: string;
  confidence: number;
  reasoning: string[];
  alternativeTypes?: string[];
}

/**
 * Review question for guided correction flow
 */
export interface ReviewQuestion {
  id: string;
  semanticId: string;
  question: string;
  options: ReviewOption[];
  context: string;
  incoseReference?: string;
}

/**
 * Review question option
 */
export interface ReviewOption {
  id: string;
  label: string;
  description: string;
  resultingType?: string;
  operations?: string;
}

/**
 * Agent context for LLM prompting
 */
export interface AgentContext {
  role: AgentRole;
  graphSnapshot: string;
  previousMessages: AgentMessage[];
  currentWorkItem?: AgentWorkItem;
  validationResults?: ValidationError[];
}

/**
 * Agent response from LLM
 */
export interface AgentResponse {
  agentRole: AgentRole;
  textResponse: string;
  operations?: string;
  validationErrors?: ValidationError[];
  reviewQuestions?: ReviewQuestion[];
  nextAgent?: AgentRole;
  isComplete: boolean;
}

/**
 * CR-027: Phase identifiers for workflow routing
 */
export type Phase =
  | 'phase0_concept'
  | 'phase1_requirements'
  | 'phase2_logical'
  | 'phase3_physical'
  | 'phase4_verification';

/**
 * CR-027: Volatility classification levels
 */
export type VolatilityLevel = 'low' | 'medium' | 'high';

/**
 * CR-027: Test coverage report from verification-engineer
 */
export interface TestCoverageReport {
  totalReqs: number;
  coveredReqs: number;
  uncoveredReqs: string[];
  coveragePercent: number;
  byTestType: {
    unit: number;
    integration: number;
    e2e: number;
  };
}

/**
 * CR-027: Traceability path for verification
 */
export interface TraceabilityPath {
  reqId: string;
  ucId?: string;
  funcId?: string;
  testId?: string;
  complete: boolean;
  missingLinks: string[];
}

/**
 * CR-027: Phase gate status
 */
export interface PhaseGateStatus {
  phase: Phase;
  ready: boolean;
  blockers: string[];
  passedRules: string[];
  failedRules: string[];
  timestamp: number;
}

/**
 * CR-027: Agent execution metrics
 */
export interface AgentMetrics {
  agentId: AgentRole;
  executionCount: number;
  successCount: number;
  avgReward: number;
  avgExecutionTimeMs: number;
  lastExecution: number;
}
