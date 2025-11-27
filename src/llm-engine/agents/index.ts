/**
 * Multi-Agent Architecture System
 *
 * Exports for the INCOSE-conformant multi-agent system.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

// Types
export * from './types.js';

// Decision Tree
export { classifyNode, validateClassification, getDecisionTreePrompt } from './decision-tree.js';

// Agent Prompts
export { getAgentSystemPrompt, getAgentContextPrompt } from './agent-prompts.js';

// Agent Coordinator
export { AgentCoordinator, getAgentCoordinator } from './agent-coordinator.js';

// Validation
export { VALIDATION_QUERIES, getValidationQuery, getQueriesBySeverity } from './validation-queries.js';
export { ArchitectureValidator, getArchitectureValidator } from './architecture-validator.js';

// Review Flow
export { ReviewFlowManager, getReviewFlowManager } from './review-flow.js';

// Multi-Agent Processor (main integration point)
export {
  MultiAgentProcessor,
  getMultiAgentProcessor,
  createMultiAgentProcessor,
} from '../multi-agent-processor.js';
export type { MultiAgentResult, MultiAgentConfig } from '../multi-agent-processor.js';
