/**
 * Multi-Agent Processor
 *
 * Integrates the multi-agent architecture system with the LLM engine.
 * Provides auto-validation, agent prompts, and review flow integration.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { LLMResponse } from '../shared/types/llm.js';
import {
  AgentRole,
  ValidationError,
  CorrectionProposal,
  ReviewQuestion,
  AgentResponse,
} from './agents/types.js';
import { getAgentCoordinator } from './agents/agent-coordinator.js';
import { getArchitectureValidator } from './agents/architecture-validator.js';
import { getReviewFlowManager } from './agents/review-flow.js';
import { getAgentSystemPrompt, getAgentContextPrompt } from './agents/agent-prompts.js';
import { classifyNode } from './agents/decision-tree.js';
import { AgentDBLogger } from './agentdb/agentdb-logger.js';

/**
 * Multi-Agent processing result
 */
export interface MultiAgentResult {
  /** Original LLM response */
  llmResponse: LLMResponse;
  /** Validation errors found */
  validationErrors: ValidationError[];
  /** Proposed corrections */
  corrections: CorrectionProposal[];
  /** Review questions for user */
  reviewQuestions: ReviewQuestion[];
  /** Agent that processed the request */
  processingAgent: AgentRole;
  /** Whether auto-corrections were applied */
  autoCorrectionsApplied: boolean;
}

/**
 * Multi-Agent Processor configuration
 */
export interface MultiAgentConfig {
  /** Enable auto-validation after graph changes (default: true) */
  enableAutoValidation?: boolean;
  /** Enable guided review flow (default: true) */
  enableReviewFlow?: boolean;
  /** Auto-apply safe corrections without user confirmation (default: false) */
  autoApplySafeCorrections?: boolean;
  /** Agent role to use for processing (default: auto-detect) */
  defaultAgent?: AgentRole;
}

/**
 * Multi-Agent Processor
 *
 * Coordinates multi-agent workflow and provides validation/review integration.
 */
export class MultiAgentProcessor {
  private config: Required<MultiAgentConfig>;

  constructor(config: MultiAgentConfig = {}) {
    this.config = {
      enableAutoValidation: config.enableAutoValidation ?? true,
      enableReviewFlow: config.enableReviewFlow ?? true,
      autoApplySafeCorrections: config.autoApplySafeCorrections ?? false,
      defaultAgent: config.defaultAgent ?? 'system-architect',
    };
  }

  /**
   * Process LLM response through multi-agent system
   *
   * @param llmResponse - Original LLM response
   * @param graphSnapshot - Current graph in Format E
   * @param userMessage - Original user message
   * @returns Multi-agent processing result
   */
  async processResponse(
    llmResponse: LLMResponse,
    graphSnapshot: string,
    userMessage: string
  ): Promise<MultiAgentResult> {
    const processingAgent = this.detectAgent(userMessage);

    AgentDBLogger.agentActivity(
      processingAgent,
      'processing response',
      `from LLM: ${llmResponse.textResponse.substring(0, 50)}...`
    );

    let validationErrors: ValidationError[] = [];
    let corrections: CorrectionProposal[] = [];
    let reviewQuestions: ReviewQuestion[] = [];
    let autoCorrectionsApplied = false;

    // Phase 1: Auto-validate if operations were generated
    if (this.config.enableAutoValidation && llmResponse.operations) {
      const validator = getArchitectureValidator();
      const updatedGraph = this.applyOperationsToGraph(graphSnapshot, llmResponse.operations);
      validationErrors = validator.validateFormatE(updatedGraph);

      if (validationErrors.length > 0) {
        AgentDBLogger.agentActivity(
          'architecture-reviewer',
          'validation completed',
          `${validationErrors.length} issues found`
        );

        // Generate corrections for errors
        corrections = validator.generateCorrections(validationErrors);
      }
    }

    // Phase 2: Generate review questions if enabled
    if (this.config.enableReviewFlow && validationErrors.length > 0) {
      const reviewManager = getReviewFlowManager();
      reviewQuestions = reviewManager.generateQuestionsFromErrors(validationErrors);
    }

    // Phase 3: Auto-apply safe corrections if enabled
    if (this.config.autoApplySafeCorrections && corrections.length > 0) {
      const safeCorrections = corrections.filter((c) => this.isSafeCorrection(c));
      if (safeCorrections.length > 0) {
        // Apply safe corrections to operations
        llmResponse = this.applyCorrections(llmResponse, safeCorrections);
        autoCorrectionsApplied = true;

        AgentDBLogger.agentActivity(
          'architecture-reviewer',
          'auto-applied corrections',
          `${safeCorrections.length} safe corrections`
        );
      }
    }

    return {
      llmResponse,
      validationErrors,
      corrections,
      reviewQuestions,
      processingAgent,
      autoCorrectionsApplied,
    };
  }

  /**
   * Get agent-enhanced system prompt
   *
   * @param agentRole - Agent role to get prompt for
   * @param canvasState - Current graph state
   * @returns Enhanced system prompt
   */
  getAgentPrompt(agentRole: AgentRole, canvasState: string): string {
    const systemPrompt = getAgentSystemPrompt(agentRole);
    const contextPrompt = getAgentContextPrompt(agentRole, canvasState);
    return `${systemPrompt}\n\n${contextPrompt}`;
  }

  /**
   * Classify a new node using the decision tree
   *
   * @param name - Node name
   * @param description - Node description
   * @param context - Optional context (isTopLevel, parentType)
   * @returns Classification result
   */
  classifyNewNode(
    name: string,
    description: string,
    context?: { isTopLevel?: boolean; parentType?: string }
  ): { type: string; confidence: number; reasoning: string[] } {
    const result = classifyNode(name, description, context);
    return {
      type: result.nodeType,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  }

  /**
   * Process user response to a review question
   *
   * @param questionId - ID of the question
   * @param optionId - Selected option ID
   * @returns Correction proposal if applicable
   */
  processReviewResponse(questionId: string, optionId: string): CorrectionProposal | null {
    const reviewManager = getReviewFlowManager();
    return reviewManager.processResponse(questionId, optionId);
  }

  /**
   * Get pending review questions
   */
  getPendingReviewQuestions(): ReviewQuestion[] {
    const reviewManager = getReviewFlowManager();
    return reviewManager.getPendingQuestions();
  }

  /**
   * Format review questions for display
   */
  formatReviewQuestionsForDisplay(): string {
    const reviewManager = getReviewFlowManager();
    return reviewManager.formatQuestionsForDisplay(reviewManager.getPendingQuestions());
  }

  /**
   * Initialize a multi-agent workflow
   *
   * @param graphSnapshot - Current graph in Format E
   * @param userRequest - User's request
   * @returns Workflow status
   */
  initializeWorkflow(
    graphSnapshot: string,
    userRequest: string
  ): { workflowId: string; currentAgent: AgentRole } {
    const coordinator = getAgentCoordinator();
    const workItem = coordinator.initializeWorkflow(graphSnapshot, userRequest);

    return {
      workflowId: workItem.id,
      currentAgent: workItem.agentId,
    };
  }

  /**
   * Get current workflow status
   */
  getWorkflowStatus(): {
    currentAgent: AgentRole | undefined;
    completedAgents: AgentRole[];
    pendingAgents: AgentRole[];
  } {
    const coordinator = getAgentCoordinator();
    const status = coordinator.getWorkflowStatus();
    return {
      currentAgent: status.currentAgent,
      completedAgents: status.completedAgents,
      pendingAgents: status.pendingAgents,
    };
  }

  /**
   * Complete current agent and handoff to next
   *
   * @param response - Current agent's response
   * @param graphSnapshot - Updated graph state
   * @returns Next agent or undefined if workflow complete
   */
  handoffToNextAgent(
    response: AgentResponse,
    graphSnapshot: string
  ): AgentRole | undefined {
    const coordinator = getAgentCoordinator();
    const status = coordinator.getWorkflowStatus();

    if (!status.currentAgent) {
      return undefined;
    }

    const workItem = coordinator.handoffToNextAgent(status.currentAgent, response, graphSnapshot);
    return workItem?.agentId;
  }

  /**
   * Reset processor state
   */
  reset(): void {
    const coordinator = getAgentCoordinator();
    const reviewManager = getReviewFlowManager();

    coordinator.reset();
    reviewManager.reset();

    AgentDBLogger.agentActivity('multi-agent-processor', 'reset');
  }

  /**
   * Detect which agent should process the request
   *
   * @param userMessage - User's message
   * @returns Appropriate agent role
   */
  private detectAgent(userMessage: string): AgentRole {
    const messageLower = userMessage.toLowerCase();

    // Keywords for each agent
    if (
      messageLower.includes('requirement') ||
      messageLower.includes('need') ||
      messageLower.includes('must') ||
      messageLower.includes('shall')
    ) {
      return 'requirements-engineer';
    }

    if (
      messageLower.includes('validate') ||
      messageLower.includes('check') ||
      messageLower.includes('review') ||
      messageLower.includes('correct')
    ) {
      return 'architecture-reviewer';
    }

    if (
      messageLower.includes('chain') ||
      messageLower.includes('sequence') ||
      messageLower.includes('flow') ||
      messageLower.includes('process')
    ) {
      return 'functional-analyst';
    }

    // Default to system architect
    return this.config.defaultAgent;
  }

  /**
   * Apply operations to graph (simple merge for now)
   */
  private applyOperationsToGraph(graphSnapshot: string, operations: string): string {
    // For validation purposes, we combine the original graph with new operations
    // A full implementation would parse and merge properly
    return `${graphSnapshot}\n\n## Applied Operations\n${operations}`;
  }

  /**
   * Check if a correction is safe to auto-apply
   */
  private isSafeCorrection(correction: CorrectionProposal): boolean {
    // Safe corrections:
    // - Type changes from FUNC to SCHEMA (format misclassifications)
    // - Type changes from FUNC to FLOW (transport misclassifications)
    const safeTypeChanges = ['FUNC→SCHEMA', 'FUNC→FLOW'];
    const typeChange = `${correction.currentType}→${correction.proposedType}`;

    return safeTypeChanges.includes(typeChange) && correction.operations !== undefined;
  }

  /**
   * Apply corrections to LLM response
   */
  private applyCorrections(
    response: LLMResponse,
    corrections: CorrectionProposal[]
  ): LLMResponse {
    if (!response.operations) {
      return response;
    }

    let updatedOperations = response.operations;

    for (const correction of corrections) {
      if (correction.operations) {
        // Append correction operations
        updatedOperations += `\n\n## Auto-Correction: ${correction.reason}\n${correction.operations}`;
      }
    }

    return {
      ...response,
      operations: updatedOperations,
    };
  }
}

// Singleton instance
let processorInstance: MultiAgentProcessor | null = null;

/**
 * Get the singleton MultiAgentProcessor instance
 */
export function getMultiAgentProcessor(config?: MultiAgentConfig): MultiAgentProcessor {
  if (!processorInstance) {
    processorInstance = new MultiAgentProcessor(config);
  }
  return processorInstance;
}

/**
 * Create a new MultiAgentProcessor instance (for testing)
 */
export function createMultiAgentProcessor(config?: MultiAgentConfig): MultiAgentProcessor {
  return new MultiAgentProcessor(config);
}
