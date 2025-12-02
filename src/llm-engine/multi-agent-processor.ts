/**
 * Multi-Agent Processor
 *
 * Integrates the multi-agent architecture system with the LLM engine.
 * Provides auto-validation, agent prompts, and review flow integration.
 *
 * CR-024: Multi-Agent Architecture System
 * CR-027: Refactored to use config-driven agents (workflow-router, agent-executor)
 *
 * @author andreas@siglochconsulting
 */

import { LLMResponse } from '../shared/types/llm.js';
import {
  AgentRole,
  ValidationError,
  CorrectionProposal,
  ReviewQuestion,
} from './agents/types.js';
import { getArchitectureValidator } from './agents/architecture-validator.js';
import { getReviewFlowManager } from './agents/review-flow.js';
import { classifyNode } from './agents/decision-tree.js';
import { AgentDBLogger } from './agentdb/agentdb-logger.js';

// CR-027: Use config-driven components
import { getWorkflowRouter, SessionContext } from './agents/workflow-router.js';
import { getAgentExecutor } from './agents/agent-executor.js';

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
  /** Agent role to use for processing (default: auto-detect via CR-027 router) */
  defaultAgent?: AgentRole;
}

/**
 * Multi-Agent Processor
 *
 * Coordinates multi-agent workflow and provides validation/review integration.
 * CR-027: Now uses WorkflowRouter and AgentExecutor for config-driven behavior.
 */
export class MultiAgentProcessor {
  private config: Required<MultiAgentConfig>;
  private router = getWorkflowRouter();
  private executor = getAgentExecutor();

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
    // CR-027: Use WorkflowRouter for agent selection
    const sessionContext: SessionContext = {
      currentPhase: 'phase1_requirements',
      graphEmpty: graphSnapshot.trim() === '',
      userMessage,
    };
    const processingAgent = this.router.routeUserInput(userMessage, sessionContext) as AgentRole;

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
   * Get agent-enhanced system prompt (CR-027: uses AgentExecutor)
   *
   * @param agentRole - Agent role to get prompt for
   * @param canvasState - Current graph state
   * @returns Enhanced system prompt
   */
  getAgentPrompt(agentRole: AgentRole, canvasState: string): string {
    return this.executor.getAgentContextPrompt(agentRole, canvasState);
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
   * Route user input to appropriate agent (CR-027)
   *
   * @param message - User message
   * @param context - Session context
   * @returns Selected agent ID
   */
  routeUserInput(message: string, context: SessionContext): string {
    return this.router.routeUserInput(message, context);
  }

  /**
   * Get agent context prompt (CR-027)
   *
   * @param agentId - Agent ID
   * @param graphSnapshot - Current graph state
   * @param userMessage - User message for context
   * @returns Full agent prompt with context
   */
  getAgentContextPrompt(agentId: string, graphSnapshot: string, userMessage?: string): string {
    return this.executor.getAgentContextPrompt(agentId, graphSnapshot, userMessage);
  }

  /**
   * Calculate reward for agent execution (CR-027)
   */
  calculateReward(
    agentId: string,
    result: { agentId: string; textResponse: string; operations?: string; isComplete: boolean }
  ): number {
    return this.executor.calculateReward(agentId, result);
  }

  /**
   * Reset processor state
   */
  reset(): void {
    const reviewManager = getReviewFlowManager();
    reviewManager.reset();
    this.executor.clearHistory();

    AgentDBLogger.agentActivity('multi-agent-processor', 'reset');
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
