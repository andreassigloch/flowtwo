/**
 * Agent Coordinator
 *
 * Coordinates inter-agent communication and workflow orchestration.
 * Uses AgentDB for message passing and work item tracking.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import {
  AgentRole,
  AgentMessage,
  AgentWorkItem,
  AgentWorkStatus,
  ValidationError,
  CorrectionProposal,
  AgentResponse,
  AgentContext,
} from './types.js';
import { AgentDBLogger } from '../agentdb/agentdb-logger.js';

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Agent Coordinator
 *
 * Manages multi-agent workflow and communication.
 */
export class AgentCoordinator {
  private messages: AgentMessage[] = [];
  private workItems: Map<string, AgentWorkItem> = new Map();
  private currentWorkflow: AgentRole[] = [];

  /**
   * Standard agent workflow order
   */
  private readonly STANDARD_WORKFLOW: AgentRole[] = [
    'requirements-engineer',
    'system-architect',
    'architecture-reviewer',
    'functional-analyst',
  ];

  /**
   * Initialize a new agent workflow
   *
   * @param graphSnapshot - Current graph in Format E
   * @param userRequest - User's request/input
   * @returns First work item
   */
  initializeWorkflow(graphSnapshot: string, userRequest: string): AgentWorkItem {
    this.currentWorkflow = [...this.STANDARD_WORKFLOW];
    this.messages = [];
    this.workItems.clear();

    // Create initial work item for Requirements Engineer
    const firstAgent = this.currentWorkflow[0];
    const workItem = this.createWorkItem(firstAgent, `Process user request: ${userRequest}`);

    // Store initial context message
    this.storeMessage({
      id: generateId(),
      fromAgent: 'requirements-engineer', // Self-reference for initial context
      toAgent: firstAgent,
      messageType: 'handoff',
      payload: {
        graphSnapshot,
        context: `User request: ${userRequest}`,
      },
      timestamp: Date.now(),
    });

    AgentDBLogger.agentActivity(
      'coordinator',
      'initialized workflow',
      `with ${this.currentWorkflow.length} agents`
    );

    return workItem;
  }

  /**
   * Create a new work item for an agent
   */
  createWorkItem(agentId: AgentRole, task: string): AgentWorkItem {
    const id = generateId();
    const workItem: AgentWorkItem = {
      id,
      agentId,
      task,
      status: 'pending',
      startedAt: Date.now(),
    };

    this.workItems.set(id, workItem);
    AgentDBLogger.agentActivity(agentId, 'work item created', task.substring(0, 50));

    return workItem;
  }

  /**
   * Update work item status
   */
  updateWorkItemStatus(
    workItemId: string,
    status: AgentWorkStatus,
    validationErrors?: ValidationError[]
  ): void {
    const workItem = this.workItems.get(workItemId);
    if (!workItem) {
      throw new Error(`Work item not found: ${workItemId}`);
    }

    workItem.status = status;
    if (validationErrors) {
      workItem.validationErrors = validationErrors;
    }
    if (status === 'completed') {
      workItem.completedAt = Date.now();
    }

    AgentDBLogger.agentActivity(workItem.agentId, `status: ${status}`);
  }

  /**
   * Store inter-agent message
   */
  storeMessage(message: AgentMessage): void {
    this.messages.push(message);
    AgentDBLogger.agentActivity(
      message.fromAgent,
      `→ ${message.toAgent}`,
      message.messageType
    );
  }

  /**
   * Get messages for an agent
   */
  getMessagesForAgent(agentId: AgentRole): AgentMessage[] {
    return this.messages.filter((m) => m.toAgent === agentId);
  }

  /**
   * Get most recent message for an agent
   */
  getLatestMessage(agentId: AgentRole): AgentMessage | undefined {
    const messages = this.getMessagesForAgent(agentId);
    return messages[messages.length - 1];
  }

  /**
   * Handoff to next agent in workflow
   *
   * @param fromAgent - Current agent
   * @param response - Agent's response
   * @param graphSnapshot - Updated graph state
   * @returns Next work item or undefined if workflow complete
   */
  handoffToNextAgent(
    fromAgent: AgentRole,
    response: AgentResponse,
    graphSnapshot: string
  ): AgentWorkItem | undefined {
    const currentIndex = this.currentWorkflow.indexOf(fromAgent);
    if (currentIndex === -1 || currentIndex >= this.currentWorkflow.length - 1) {
      AgentDBLogger.agentActivity('coordinator', 'workflow complete');
      return undefined;
    }

    const nextAgent = this.currentWorkflow[currentIndex + 1];

    // Create handoff message
    const message: AgentMessage = {
      id: generateId(),
      fromAgent,
      toAgent: nextAgent,
      messageType: 'handoff',
      payload: {
        graphSnapshot,
        context: response.textResponse,
        validationErrors: response.validationErrors,
      },
      timestamp: Date.now(),
    };

    this.storeMessage(message);

    // Create work item for next agent
    const workItem = this.createWorkItem(
      nextAgent,
      `Continue from ${fromAgent}: ${response.textResponse.substring(0, 100)}...`
    );
    workItem.inputFrom = fromAgent;

    return workItem;
  }

  /**
   * Request review from Architecture Reviewer
   */
  requestReview(
    fromAgent: AgentRole,
    graphSnapshot: string,
    openQuestions: string[]
  ): AgentWorkItem {
    const message: AgentMessage = {
      id: generateId(),
      fromAgent,
      toAgent: 'architecture-reviewer',
      messageType: 'review-request',
      payload: {
        graphSnapshot,
        context: `Review requested by ${fromAgent}`,
        openQuestions,
      },
      timestamp: Date.now(),
    };

    this.storeMessage(message);

    const workItem = this.createWorkItem(
      'architecture-reviewer',
      `Review architecture from ${fromAgent}`
    );
    workItem.inputFrom = fromAgent;

    return workItem;
  }

  /**
   * Send validation result
   */
  sendValidationResult(
    validationErrors: ValidationError[],
    corrections: CorrectionProposal[],
    toAgent: AgentRole
  ): void {
    const message: AgentMessage = {
      id: generateId(),
      fromAgent: 'architecture-reviewer',
      toAgent,
      messageType: 'validation-result',
      payload: {
        graphSnapshot: '',
        context: `Validation completed: ${validationErrors.length} errors found`,
        validationErrors,
        corrections,
      },
      timestamp: Date.now(),
    };

    this.storeMessage(message);
  }

  /**
   * Request clarification from user
   */
  requestClarification(
    fromAgent: AgentRole,
    question: string,
    graphSnapshot: string
  ): AgentMessage {
    const message: AgentMessage = {
      id: generateId(),
      fromAgent,
      toAgent: 'requirements-engineer', // User interaction goes through RE
      messageType: 'clarification-request',
      payload: {
        graphSnapshot,
        context: question,
        openQuestions: [question],
      },
      timestamp: Date.now(),
    };

    this.storeMessage(message);
    return message;
  }

  /**
   * Build agent context for LLM prompting
   */
  buildAgentContext(agentId: AgentRole, graphSnapshot: string): AgentContext {
    const messages = this.getMessagesForAgent(agentId);
    const workItems = Array.from(this.workItems.values()).filter(
      (w) => w.agentId === agentId
    );
    const currentWorkItem = workItems.find((w) => w.status === 'in_progress');

    // Collect validation errors from messages
    const validationResults = messages
      .filter((m) => m.messageType === 'validation-result')
      .flatMap((m) => m.payload.validationErrors || []);

    return {
      role: agentId,
      graphSnapshot,
      previousMessages: messages,
      currentWorkItem,
      validationResults: validationResults.length > 0 ? validationResults : undefined,
    };
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(): {
    currentAgent: AgentRole | undefined;
    completedAgents: AgentRole[];
    pendingAgents: AgentRole[];
    totalMessages: number;
    totalWorkItems: number;
  } {
    const workItemsArray = Array.from(this.workItems.values());
    const completedAgents = workItemsArray
      .filter((w) => w.status === 'completed')
      .map((w) => w.agentId);
    const currentAgent = workItemsArray.find((w) => w.status === 'in_progress')?.agentId;
    const pendingAgents = this.currentWorkflow.filter(
      (a) => !completedAgents.includes(a) && a !== currentAgent
    );

    return {
      currentAgent,
      completedAgents,
      pendingAgents,
      totalMessages: this.messages.length,
      totalWorkItems: this.workItems.size,
    };
  }

  /**
   * Get all messages (for logging/debugging)
   */
  getAllMessages(): AgentMessage[] {
    return [...this.messages];
  }

  /**
   * Get all work items (for logging/debugging)
   */
  getAllWorkItems(): AgentWorkItem[] {
    return Array.from(this.workItems.values());
  }

  /**
   * Clear workflow state
   */
  reset(): void {
    this.messages = [];
    this.workItems.clear();
    this.currentWorkflow = [];
    AgentDBLogger.agentActivity('coordinator', 'reset');
  }
}

// Singleton instance
let coordinatorInstance: AgentCoordinator | null = null;

/**
 * Get the singleton AgentCoordinator instance
 */
export function getAgentCoordinator(): AgentCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new AgentCoordinator();
  }
  return coordinatorInstance;
}
