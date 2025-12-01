/**
 * Agent Executor
 *
 * Executes agents using configuration-driven prompts and validates success criteria.
 * Replaces hardcoded prompts from agent-prompts.ts with config-loaded prompts.
 *
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

import { getAgentConfigLoader, AgentDefinition } from './config-loader.js';
import { getWorkflowRouter, SessionContext } from './workflow-router.js';
import { WorkItem } from './work-item-manager.js';
import { ValidationError, AgentMessage } from './types.js';
import { getDecisionTreePrompt } from './decision-tree.js';
import { AgentDBLogger } from '../agentdb/agentdb-logger.js';

/**
 * Execution context for an agent
 */
export interface ExecutionContext {
  agentId: string;
  graphSnapshot: string;
  userMessage?: string;
  previousMessages?: AgentMessage[];
  workItem?: WorkItem;
  sessionContext: SessionContext;
  validationErrors?: ValidationError[];
}

/**
 * Agent execution result
 */
export interface AgentResult {
  agentId: string;
  textResponse: string;
  operations?: string;
  validationErrors?: ValidationError[];
  nextAgent?: string;
  isComplete: boolean;
  reward?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Handoff data between agents
 */
export interface HandoffData {
  fromAgent: string;
  toAgent: string;
  snapshot: string;
  summary?: string;
  openQuestions?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Agent Executor
 *
 * Manages agent execution with config-driven behavior.
 */
export class AgentExecutor {
  private configLoader = getAgentConfigLoader();
  private router = getWorkflowRouter();
  private executionHistory: Map<string, AgentResult[]> = new Map();

  /**
   * Execute an agent with given context
   */
  async executeAgent(context: ExecutionContext): Promise<AgentResult> {
    const { agentId, userMessage, sessionContext } = context;

    AgentDBLogger.agentActivity(agentId, 'executing', userMessage?.substring(0, 50) || 'work item');

    // Get agent definition
    const agentDef = this.configLoader.getAgentDefinition(agentId);
    if (!agentDef) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    // Validate phase compatibility
    if (!this.isPhaseCompatible(agentId, sessionContext.currentPhase)) {
      AgentDBLogger.agentActivity(agentId, 'skipped', `not compatible with ${sessionContext.currentPhase}`);
      return {
        agentId,
        textResponse: `Agent ${agentId} is not active in ${sessionContext.currentPhase}`,
        isComplete: false,
      };
    }

    // Build prompt from config
    const prompt = this.buildPrompt(agentId, agentDef, context);

    // Note: Actual LLM execution would happen here
    // This returns the prompt for integration with LLM engine
    const result: AgentResult = {
      agentId,
      textResponse: prompt, // In real execution, this would be LLM response
      isComplete: false,
    };

    // Store execution history
    this.recordExecution(agentId, result);

    return result;
  }

  /**
   * Build full prompt for an agent
   */
  buildPrompt(agentId: string, agentDef: AgentDefinition, context: ExecutionContext): string {
    // Load prompt template
    const promptTemplate = this.configLoader.getPrompt(agentId);

    // Build context sections
    const sections: string[] = [];

    // Add base prompt
    sections.push(promptTemplate);

    // Add decision trees if agent uses them
    if (agentDef.decisionTrees.length > 0) {
      sections.push('\n## Decision Trees\n');
      sections.push(getDecisionTreePrompt());
    }

    // Add current graph state
    sections.push('\n## Current Graph State\n');
    sections.push('```');
    sections.push(context.graphSnapshot);
    sections.push('```');

    // Add validation errors if present
    if (context.validationErrors && context.validationErrors.length > 0) {
      sections.push('\n## Validation Errors to Address\n');
      for (const error of context.validationErrors) {
        sections.push(`- **${error.code}** [${error.severity}]: ${error.issue}`);
        if (error.suggestion) {
          sections.push(`  - Suggestion: ${error.suggestion}`);
        }
      }
    }

    // Add work item context if present
    if (context.workItem) {
      sections.push('\n## Current Work Item\n');
      sections.push(`- **Action**: ${context.workItem.action}`);
      sections.push(`- **Priority**: ${context.workItem.priority}`);
      sections.push(`- **Affected Nodes**: ${context.workItem.affectedNodes.join(', ')}`);
    }

    // Add user message if present
    if (context.userMessage) {
      sections.push('\n## User Request\n');
      sections.push(context.userMessage);
    }

    // Add tool access reminder
    sections.push('\n## Available Tools\n');
    for (const toolId of agentDef.toolAccess) {
      const toolDef = this.configLoader.getToolDefinition(toolId);
      if (toolDef) {
        sections.push(`- **${toolId}**: ${toolDef.description}`);
      }
    }

    // Add output format reminder
    sections.push('\n## Expected Output Format\n');
    sections.push('Provide your output using Format E syntax:');
    sections.push('```');
    sections.push('## Nodes');
    sections.push('+ {Name}|{Type}|{SemanticID}|{Description}');
    sections.push('');
    sections.push('## Edges');
    sections.push('+ {SourceID} -{edgeType}-> {TargetID}');
    sections.push('```');

    return sections.join('\n');
  }

  /**
   * Validate agent success based on criteria
   */
  validateSuccess(agentId: string, result: AgentResult): boolean {
    const criteria = this.configLoader.getSuccessCriteria(agentId);
    if (!criteria) {
      return true; // No criteria = always success
    }

    // Check minimum reward if specified
    if (criteria.minReward !== undefined && result.reward !== undefined) {
      if (result.reward < criteria.minReward) {
        return false;
      }
    }

    // Check if all rules pass (no validation errors for those rules)
    if (criteria.rules.length > 0 && result.validationErrors) {
      const ruleViolations = result.validationErrors.filter(
        (e) => e.severity === 'error' && criteria.rules.includes(e.code)
      );
      if (ruleViolations.length > 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate reward for agent result
   */
  calculateReward(agentId: string, result: AgentResult): number {
    const criteria = this.configLoader.getSuccessCriteria(agentId);
    if (!criteria) {
      return 1.0;
    }

    let reward = 1.0;

    // Deduct for validation errors
    if (result.validationErrors) {
      const errorCount = result.validationErrors.filter((e) => e.severity === 'error').length;
      const warningCount = result.validationErrors.filter((e) => e.severity === 'warning').length;

      reward -= errorCount * 0.2;
      reward -= warningCount * 0.05;
    }

    // Bonus for completing work items
    if (result.isComplete) {
      reward += 0.1;
    }

    return Math.max(0, Math.min(1, reward));
  }

  /**
   * Handoff to next agent
   */
  handoffToNext(fromAgent: string, result: AgentResult, snapshot: string): HandoffData | null {
    const { nextAgent } = result;
    if (!nextAgent) {
      return null;
    }

    // Get handoff requirements
    const requirements = this.router.getHandoffRequirements(fromAgent, nextAgent);

    const handoff: HandoffData = {
      fromAgent,
      toAgent: nextAgent,
      snapshot,
    };

    // Add summary if required
    if (requirements.includes('summary')) {
      handoff.summary = this.generateSummary(result);
    }

    AgentDBLogger.agentActivity(
      fromAgent,
      `→ ${nextAgent}`,
      'handoff'
    );

    return handoff;
  }

  /**
   * Generate summary from agent result
   */
  private generateSummary(result: AgentResult): string {
    const lines: string[] = [];

    if (result.operations) {
      // Count operations
      const nodeAdds = (result.operations.match(/^\+ [^-]/gm) || []).length;
      const nodeRemoves = (result.operations.match(/^- [^-]/gm) || []).length;
      const edgeAdds = (result.operations.match(/^\+ .+-\w+->/) || []).length;

      lines.push(`Operations: +${nodeAdds} nodes, -${nodeRemoves} nodes, +${edgeAdds} edges`);
    }

    if (result.validationErrors && result.validationErrors.length > 0) {
      lines.push(`Validation: ${result.validationErrors.length} issues`);
    }

    return lines.join('\n');
  }

  /**
   * Check if agent is compatible with current phase
   */
  private isPhaseCompatible(agentId: string, currentPhase: string): boolean {
    const agentDef = this.configLoader.getAgentDefinition(agentId);
    if (!agentDef) {
      return false;
    }

    return (
      agentDef.inputPhases.includes(currentPhase) ||
      agentDef.inputPhases.includes('all')
    );
  }

  /**
   * Record execution in history
   */
  private recordExecution(agentId: string, result: AgentResult): void {
    const history = this.executionHistory.get(agentId) || [];
    history.push(result);

    // Keep only last 10 executions per agent
    if (history.length > 10) {
      history.shift();
    }

    this.executionHistory.set(agentId, history);
  }

  /**
   * Get execution history for an agent
   */
  getExecutionHistory(agentId: string): AgentResult[] {
    return this.executionHistory.get(agentId) || [];
  }

  /**
   * Get agent system prompt (for LLM integration)
   */
  getAgentPrompt(agentId: string): string {
    return this.configLoader.getPrompt(agentId);
  }

  /**
   * Get agent context prompt with current state
   */
  getAgentContextPrompt(
    agentId: string,
    graphSnapshot: string,
    previousContext?: string
  ): string {
    const agentDef = this.configLoader.getAgentDefinition(agentId);
    if (!agentDef) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const context: ExecutionContext = {
      agentId,
      graphSnapshot,
      userMessage: previousContext,
      sessionContext: {
        currentPhase: 'phase1_requirements',
        graphEmpty: graphSnapshot.trim() === '',
        userMessage: previousContext || '',
      },
    };

    return this.buildPrompt(agentId, agentDef, context);
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory.clear();
  }
}

// Singleton instance
let executorInstance: AgentExecutor | null = null;

/**
 * Get the singleton AgentExecutor instance
 */
export function getAgentExecutor(): AgentExecutor {
  if (!executorInstance) {
    executorInstance = new AgentExecutor();
  }
  return executorInstance;
}
