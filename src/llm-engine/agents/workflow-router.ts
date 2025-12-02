/**
 * Workflow Router
 *
 * Routes user input and validation failures to appropriate agents.
 * Uses routing rules from agent-config.json.
 *
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

import { getAgentConfigLoader } from './config-loader.js';
import { ValidationError } from './types.js';

/**
 * Session context for routing decisions
 */
export interface SessionContext {
  currentPhase: string;
  graphEmpty: boolean;
  userMessage: string;
  activeAgent?: string;
  recentNodeTypes?: string[];
  lastValidation?: {
    errorCount: number;
    warningCount: number;
  };
}

/**
 * Work item generated from routing
 */
export interface RoutedWorkItem {
  id: string;
  targetAgent: string;
  action: string;
  affectedNodes: string[];
  sourceRule?: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  createdBy: string;
}

/**
 * Phase gate result
 */
export interface GateResult {
  phase: string;
  ready: boolean;
  blockers: string[];
  workItems: RoutedWorkItem[];
}

/**
 * Workflow Router
 *
 * Implements routing logic from agent-config.json.
 */
export class WorkflowRouter {
  private configLoader = getAgentConfigLoader();

  /**
   * Route user input to appropriate agent
   */
  routeUserInput(message: string, context: SessionContext): string {
    const rules = this.configLoader.getRoutingRules();
    const defaultAgent = this.configLoader.getDefaultAgent();

    // Evaluate each rule in order
    for (const rule of rules) {
      if (this.evaluateCondition(rule.condition, message, context)) {
        return rule.agent;
      }
    }

    return defaultAgent;
  }

  /**
   * Evaluate a routing condition
   */
  private evaluateCondition(
    condition: string,
    message: string,
    context: SessionContext
  ): boolean {
    const messageLower = message.toLowerCase();
    const parts = condition.split(' AND ').map((p) => p.trim());

    for (const part of parts) {
      if (!this.evaluateSingleCondition(part, messageLower, context)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition part
   */
  private evaluateSingleCondition(
    condition: string,
    messageLower: string,
    context: SessionContext
  ): boolean {
    // Handle OR conditions
    if (condition.includes(' OR ')) {
      const orParts = condition.split(' OR ').map((p) => p.trim());
      return orParts.some((part) =>
        this.evaluateSingleCondition(part, messageLower, context)
      );
    }

    // graph_empty
    if (condition === 'graph_empty') {
      return context.graphEmpty;
    }

    // phase == 'xxx'
    const phaseMatch = condition.match(/phase\s*==\s*'([^']+)'/);
    if (phaseMatch) {
      return context.currentPhase === phaseMatch[1];
    }

    // context contains 'xxx|yyy|zzz'
    const containsMatch = condition.match(/context\s+contains\s+'([^']+)'/);
    if (containsMatch) {
      const keywords = containsMatch[1].split('|').map((k) => k.toLowerCase());
      return keywords.some((kw) => messageLower.includes(kw));
    }

    return false;
  }

  /**
   * Route validation failures to work items
   */
  routeValidationFailure(violations: ValidationError[]): RoutedWorkItem[] {
    const workItems: RoutedWorkItem[] = [];

    // Group violations by target agent
    const groupedViolations = this.groupViolationsByAgent(violations);

    for (const [targetAgent, agentViolations] of groupedViolations) {
      for (const violation of agentViolations) {
        const workItem: RoutedWorkItem = {
          id: `wi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          targetAgent,
          action: violation.suggestion || `Fix ${violation.code}: ${violation.issue}`,
          affectedNodes: [violation.semanticId],
          sourceRule: violation.code,
          priority: this.mapSeverityToPriority(violation.severity),
          createdAt: new Date().toISOString(),
          createdBy: 'architecture-reviewer',
        };
        workItems.push(workItem);
      }
    }

    return workItems;
  }

  /**
   * Group violations by responsible agent based on node types
   */
  private groupViolationsByAgent(
    violations: ValidationError[]
  ): Map<string, ValidationError[]> {
    const grouped = new Map<string, ValidationError[]>();

    for (const violation of violations) {
      // Determine target agent based on semantic ID type
      const nodeType = this.extractNodeType(violation.semanticId);
      const targetAgent = this.findResponsibleAgent(nodeType);

      const existing = grouped.get(targetAgent) || [];
      existing.push(violation);
      grouped.set(targetAgent, existing);
    }

    return grouped;
  }

  /**
   * Extract node type from semantic ID
   */
  private extractNodeType(semanticId: string): string {
    // Format: Name.XX.NNN where XX is type code
    const parts = semanticId.split('.');
    if (parts.length >= 2) {
      const typeCode = parts[1];
      const typeMap: Record<string, string> = {
        SY: 'SYS',
        UC: 'UC',
        RQ: 'REQ',
        FN: 'FUNC',
        FL: 'FLOW',
        SC: 'SCHEMA',
        FC: 'FCHAIN',
        AC: 'ACTOR',
        MD: 'MOD',
        TC: 'TEST',
      };
      return typeMap[typeCode] || 'UNKNOWN';
    }
    return 'UNKNOWN';
  }

  /**
   * Find agent responsible for a node type
   */
  private findResponsibleAgent(nodeType: string): string {
    const config = this.configLoader.getConfig();

    for (const [agentId, def] of Object.entries(config.agents)) {
      if (def.outputNodeTypes.includes(nodeType)) {
        return agentId;
      }
    }

    // Default to system-architect for unknown types
    return 'system-architect';
  }

  /**
   * Map validation severity to work item priority
   */
  private mapSeverityToPriority(severity: string): 'high' | 'medium' | 'low' {
    switch (severity) {
      case 'error':
        return 'high';
      case 'warning':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Check phase gate readiness
   */
  routePhaseGate(currentPhase: string, violations: ValidationError[]): GateResult {

    // Get gate rules for current phase
    const gateRules = this.getGateRulesForPhase(currentPhase);

    // Check which rules are violated
    const blockers: string[] = [];
    const workItems: RoutedWorkItem[] = [];

    // Errors always block
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      for (const error of errors) {
        blockers.push(error.code);
        workItems.push({
          id: `gate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          targetAgent: this.findResponsibleAgent(this.extractNodeType(error.semanticId)),
          action: `[GATE BLOCKER] ${error.suggestion || error.issue}`,
          affectedNodes: [error.semanticId],
          sourceRule: error.code,
          priority: 'high',
          createdAt: new Date().toISOString(),
          createdBy: 'phase-gate',
        });
      }
    }

    // Check phase-specific gate rules
    for (const ruleId of gateRules) {
      const isViolated = violations.some((v) => v.code === ruleId);
      if (isViolated) {
        blockers.push(ruleId);
      }
    }

    return {
      phase: currentPhase,
      ready: blockers.length === 0,
      blockers,
      workItems,
    };
  }

  /**
   * Get gate rules for a specific phase
   */
  private getGateRulesForPhase(phase: string): string[] {
    // Phase-specific gate rules
    const gateRules: Record<string, string[]> = {
      phase1_requirements: ['req_semantic_id', 'uc_satisfy_req', 'required_properties'],
      phase2_logical: [
        'millers_law_func',
        'function_requirements',
        'function_io',
        'flow_connectivity',
      ],
      phase3_physical: [
        'function_allocation',
        'nested_func_isolation',
        'volatile_func_isolation',
      ],
      phase4_verification: ['requirements_verification', 'isolation'],
    };

    return gateRules[phase] || [];
  }

  /**
   * Get next phase after current
   */
  getNextPhase(currentPhase: string): string | undefined {
    const phaseSequence = this.configLoader.getPhaseSequence();
    const currentIndex = phaseSequence.indexOf(currentPhase);

    if (currentIndex === -1 || currentIndex >= phaseSequence.length - 1) {
      return undefined;
    }

    return phaseSequence[currentIndex + 1];
  }

  /**
   * Determine routing after agent completes work
   */
  routeAfterAgentComplete(
    completedAgent: string,
    result: { hasErrors: boolean; errorCount: number },
    context: SessionContext
  ): { nextAgent: string | null; reason: string } {
    // Always route to reviewer after agent action
    if (completedAgent !== 'architecture-reviewer') {
      return {
        nextAgent: 'architecture-reviewer',
        reason: 'Post-action validation',
      };
    }

    // After reviewer, route based on results
    if (result.hasErrors && result.errorCount > 0) {
      // Route back to responsible agent
      return {
        nextAgent: context.activeAgent || 'system-architect',
        reason: `Fix ${result.errorCount} validation errors`,
      };
    }

    // Check if ready for next phase
    const nextPhase = this.getNextPhase(context.currentPhase);
    if (nextPhase) {
      const agentsForNextPhase = this.configLoader.getAgentsForPhase(nextPhase);
      if (agentsForNextPhase.length > 0) {
        return {
          nextAgent: agentsForNextPhase[0],
          reason: `Phase gate passed, advancing to ${nextPhase}`,
        };
      }
    }

    return {
      nextAgent: null,
      reason: 'Workflow complete',
    };
  }

  /**
   * Get handoff data requirements between agents
   */
  getHandoffRequirements(fromAgent: string, toAgent: string): string[] {
    const handoff = this.configLoader.getHandoffConfig(fromAgent, toAgent);
    if (!handoff) {
      return ['snapshot'];
    }

    return Object.keys(handoff.handoffData);
  }
}

// Singleton instance
let routerInstance: WorkflowRouter | null = null;

/**
 * Get the singleton WorkflowRouter instance
 */
export function getWorkflowRouter(): WorkflowRouter {
  if (!routerInstance) {
    routerInstance = new WorkflowRouter();
  }
  return routerInstance;
}
