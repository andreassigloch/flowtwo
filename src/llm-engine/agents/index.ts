/**
 * Multi-Agent Architecture System
 *
 * Exports for the INCOSE-conformant multi-agent system.
 *
 * CR-024: Multi-Agent Architecture System
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

// Types
export * from './types.js';

// Decision Tree
export { classifyNode, validateClassification, getDecisionTreePrompt } from './decision-tree.js';

// Validation
export { VALIDATION_QUERIES, getValidationQuery, getQueriesBySeverity } from './validation-queries.js';
export { ArchitectureValidator, getArchitectureValidator } from './architecture-validator.js';

// Review Flow
export { ReviewFlowManager, getReviewFlowManager } from './review-flow.js';

// CR-027: Configuration-Driven Agent Framework
export {
  AgentConfigLoader,
  getAgentConfigLoader,
  createAgentConfigLoader,
} from './config-loader.js';
export type {
  AgentConfig,
  AgentDefinition,
  RoutingRule,
  RoutingConfig,
  HandoffConfig,
  WorkItemQueueConfig,
  ToolDefinition,
} from './config-loader.js';

// CR-027: Workflow Routing
export { WorkflowRouter, getWorkflowRouter } from './workflow-router.js';
export type { SessionContext, RoutedWorkItem, GateResult } from './workflow-router.js';

// CR-027: Work Item Management
export { WorkItemManager, getWorkItemManager } from './work-item-manager.js';
export type {
  WorkItem,
  WorkItemInput,
  WorkItemStatus,
  WorkItemPriority,
  WorkItemFilter,
} from './work-item-manager.js';

// CR-027: Agent Executor
export { AgentExecutor, getAgentExecutor } from './agent-executor.js';
export type { ExecutionContext, AgentResult, HandoffData } from './agent-executor.js';

// CR-027: Phase Gate Automation
export { PhaseGateManager, getPhaseGateManager } from './phase-gate-manager.js';
export type { GateCheckResult, PhaseTransitionRequest } from './phase-gate-manager.js';

// Multi-Agent Processor (main integration point)
export {
  MultiAgentProcessor,
  getMultiAgentProcessor,
  createMultiAgentProcessor,
} from '../multi-agent-processor.js';
export type { MultiAgentResult, MultiAgentConfig } from '../multi-agent-processor.js';
