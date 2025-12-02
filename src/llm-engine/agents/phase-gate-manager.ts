/**
 * Phase Gate Manager
 *
 * Manages phase transitions with automatic validation and gate checks.
 * Blocks phase advancement if gate rules fail.
 *
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

import { getWorkflowRouter } from './workflow-router.js';
import { getWorkItemManager, WorkItem } from './work-item-manager.js';
import { getArchitectureValidator } from './architecture-validator.js';
import { Phase, PhaseGateStatus, ValidationError } from './types.js';
import { AgentDBLogger } from '../agentdb/agentdb-logger.js';

/**
 * Gate check result
 */
export interface GateCheckResult {
  phase: Phase;
  passed: boolean;
  blockers: string[];
  warnings: string[];
  workItems: WorkItem[];
  nextPhase?: Phase;
  summary: string;
}

/**
 * Phase transition request
 */
export interface PhaseTransitionRequest {
  fromPhase: Phase;
  toPhase: Phase;
  graphSnapshot: string;
  force?: boolean;
}

/**
 * Phase Gate Manager
 *
 * Enforces phase gate rules and manages transitions.
 */
export class PhaseGateManager {
  private router = getWorkflowRouter();
  private workItemManager = getWorkItemManager();
  private validator = getArchitectureValidator();
  private currentPhase: Phase = 'phase1_requirements';
  private gateHistory: PhaseGateStatus[] = [];

  /**
   * Check if current phase gate can be passed
   */
  checkGate(graphSnapshot: string, phase?: Phase): GateCheckResult {
    const targetPhase = phase || this.currentPhase;

    AgentDBLogger.agentActivity('phase-gate', 'checking', targetPhase);

    // Run validation
    const validationErrors = this.validator.validateFormatE(graphSnapshot);

    // Get gate result from router
    const gateResult = this.router.routePhaseGate(targetPhase, validationErrors);

    // Separate errors and warnings
    const blockers = validationErrors
      .filter((e) => e.severity === 'error')
      .map((e) => `${e.code}: ${e.issue}`);

    const warnings = validationErrors
      .filter((e) => e.severity === 'warning')
      .map((e) => `${e.code}: ${e.issue}`);

    // Create work items for blockers
    const workItems: WorkItem[] = [];
    for (const error of validationErrors.filter((e) => e.severity === 'error')) {
      const item = this.workItemManager.createWorkItem({
        targetAgent: this.getResponsibleAgent(error),
        action: `[GATE BLOCKER] ${error.suggestion || error.issue}`,
        affectedNodes: [error.semanticId],
        sourceRule: error.code,
        priority: 'high',
        createdBy: 'phase-gate',
      });
      workItems.push(item);
    }

    const passed = blockers.length === 0;
    const nextPhase = passed ? this.getNextPhase(targetPhase) : undefined;

    // Record gate status
    const status: PhaseGateStatus = {
      phase: targetPhase,
      ready: passed,
      blockers: gateResult.blockers,
      passedRules: this.getGateRules(targetPhase).filter(
        (r) => !gateResult.blockers.includes(r)
      ),
      failedRules: gateResult.blockers,
      timestamp: Date.now(),
    };
    this.gateHistory.push(status);

    const summary = passed
      ? `Phase gate ${targetPhase} PASSED. Ready to advance to ${nextPhase}.`
      : `Phase gate ${targetPhase} BLOCKED by ${blockers.length} errors. Fix required.`;

    AgentDBLogger.agentActivity('phase-gate', passed ? 'passed' : 'blocked', summary);

    return {
      phase: targetPhase,
      passed,
      blockers,
      warnings,
      workItems,
      nextPhase,
      summary,
    };
  }

  /**
   * Attempt to transition to next phase
   */
  tryAdvancePhase(graphSnapshot: string): GateCheckResult {
    const result = this.checkGate(graphSnapshot);

    if (result.passed && result.nextPhase) {
      this.currentPhase = result.nextPhase;
      AgentDBLogger.agentActivity('phase-gate', 'advanced', `to ${result.nextPhase}`);
    }

    return result;
  }

  /**
   * Force transition to a specific phase (bypass gate check)
   */
  forcePhase(phase: Phase): void {
    AgentDBLogger.agentActivity('phase-gate', 'forced', `to ${phase}`);
    this.currentPhase = phase;
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): Phase {
    return this.currentPhase;
  }

  /**
   * Get gate rules for a phase
   */
  getGateRules(phase: Phase): string[] {
    const gateRules: Record<Phase, string[]> = {
      phase0_concept: [],
      phase1_requirements: ['req_semantic_id', 'uc_satisfy_req', 'required_properties', 'naming'],
      phase2_logical: [
        'millers_law_func',
        'function_requirements',
        'function_io',
        'flow_connectivity',
        'flow_data_schema',
        'fchain_actor_boundary',
        'nested_func_isolation',
        'volatile_func_isolation',
      ],
      phase3_physical: [
        'millers_law_mod',
        'function_allocation',
      ],
      phase4_verification: [
        'requirements_verification',
        'isolation',
      ],
    };

    return gateRules[phase] || [];
  }

  /**
   * Get next phase in sequence
   */
  private getNextPhase(currentPhase: Phase): Phase | undefined {
    const sequence: Phase[] = [
      'phase0_concept',
      'phase1_requirements',
      'phase2_logical',
      'phase3_physical',
      'phase4_verification',
    ];

    const currentIndex = sequence.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex >= sequence.length - 1) {
      return undefined;
    }

    return sequence[currentIndex + 1];
  }

  /**
   * Get responsible agent for a validation error
   */
  private getResponsibleAgent(error: ValidationError): string {
    // Map validation rule to responsible agent
    const ruleToAgent: Record<string, string> = {
      req_semantic_id: 'requirements-engineer',
      uc_satisfy_req: 'requirements-engineer',
      required_properties: 'requirements-engineer',
      naming: 'requirements-engineer',
      millers_law_func: 'system-architect',
      millers_law_mod: 'system-architect',
      function_requirements: 'system-architect',
      function_io: 'system-architect',
      function_allocation: 'system-architect',
      flow_connectivity: 'functional-analyst',
      flow_data_schema: 'system-architect',
      fchain_actor_boundary: 'functional-analyst',
      nested_func_isolation: 'system-architect',
      volatile_func_isolation: 'system-architect',
      requirements_verification: 'verification-engineer',
      isolation: 'architecture-reviewer',
      V1: 'system-architect',
      V2: 'system-architect',
      V3: 'system-architect',
      V4: 'system-architect',
      V5: 'system-architect',
      V6: 'system-architect',
      V7: 'system-architect',
      V8: 'system-architect',
      V9: 'system-architect',
      V10: 'system-architect',
      V11: 'system-architect',
    };

    return ruleToAgent[error.code] || 'architecture-reviewer';
  }

  /**
   * Get gate history
   */
  getGateHistory(): PhaseGateStatus[] {
    return [...this.gateHistory];
  }

  /**
   * Get last gate status for a phase
   */
  getLastGateStatus(phase: Phase): PhaseGateStatus | undefined {
    return this.gateHistory
      .filter((s) => s.phase === phase)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  /**
   * Clear gate history
   */
  clearHistory(): void {
    this.gateHistory = [];
  }

  /**
   * Reset to initial phase
   */
  reset(): void {
    this.currentPhase = 'phase1_requirements';
    this.gateHistory = [];
    AgentDBLogger.agentActivity('phase-gate', 'reset');
  }

  /**
   * Get phase progress summary
   */
  getProgressSummary(): {
    currentPhase: Phase;
    completedPhases: Phase[];
    remainingPhases: Phase[];
    blockedBy: string[];
  } {
    const sequence: Phase[] = [
      'phase0_concept',
      'phase1_requirements',
      'phase2_logical',
      'phase3_physical',
      'phase4_verification',
    ];

    const currentIndex = sequence.indexOf(this.currentPhase);
    const completedPhases = sequence.slice(0, currentIndex);
    const remainingPhases = sequence.slice(currentIndex + 1);

    // Get blocking items for current phase
    const blockedBy = this.gateHistory
      .filter((s) => s.phase === this.currentPhase && !s.ready)
      .flatMap((s) => s.blockers);

    return {
      currentPhase: this.currentPhase,
      completedPhases,
      remainingPhases,
      blockedBy: [...new Set(blockedBy)],
    };
  }
}

// Singleton instance
let managerInstance: PhaseGateManager | null = null;

/**
 * Get the singleton PhaseGateManager instance
 */
export function getPhaseGateManager(): PhaseGateManager {
  if (!managerInstance) {
    managerInstance = new PhaseGateManager();
  }
  return managerInstance;
}
