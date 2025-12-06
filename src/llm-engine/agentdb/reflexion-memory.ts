/**
 * Enhanced Reflexion Memory (CR-032 Phase 6 / CR-026)
 *
 * Provides episodic memory with automatic reward calculation
 * and critique generation from validation results.
 *
 * Features:
 * - Automatic reward from UnifiedRuleEvaluator
 * - Critique generation from rule violations
 * - Episode context loading for LLM prompts
 * - Agent effectiveness tracking
 *
 * @author andreas@siglochconsulting
 */

import type { UnifiedAgentDBService } from './unified-agentdb-service.js';
import type { UnifiedRuleEvaluator } from '../validation/unified-rule-evaluator.js';
import type { Episode } from './types.js';
import type { ValidationResult, PhaseId } from '../validation/types.js';
import { AgentDBLogger } from './agentdb-logger.js';

/**
 * Enhanced episode with validation details
 */
export interface EnrichedEpisode extends Episode {
  validationScore: number;
  violations: string[];
  phase: PhaseId;
}

/**
 * Agent effectiveness metrics
 */
export interface AgentEffectiveness {
  agentId: string;
  totalEpisodes: number;
  successfulEpisodes: number;
  averageReward: number;
  recentTrend: 'improving' | 'stable' | 'declining';
  commonViolations: string[];
}

/**
 * Episode context for LLM prompt injection
 */
export interface EpisodeContext {
  lessonsLearned: string;
  successfulPatterns: string;
  episodeCount: number;
}

/**
 * Enhanced Reflexion Memory
 *
 * Integrates episodic memory with validation for self-learning.
 */
export class ReflexionMemory {
  private agentDB: UnifiedAgentDBService;
  private evaluator: UnifiedRuleEvaluator;

  // Configuration
  private readonly config = {
    successThreshold: 0.7,
    maxCritiqueViolations: 5,
    maxContextEpisodes: 3,
    maxCritiqueLength: 500,
  };

  constructor(agentDB: UnifiedAgentDBService, evaluator: UnifiedRuleEvaluator) {
    this.agentDB = agentDB;
    this.evaluator = evaluator;
  }

  /**
   * Store episode with automatic reward and critique from validation
   *
   * This is the main entry point after graph operations.
   */
  async storeEpisodeWithValidation(
    agentId: string,
    task: string,
    operations: string,
    phase: PhaseId = 'all'
  ): Promise<EnrichedEpisode> {
    // Run validation to get reward and violations
    const validation = await this.evaluator.evaluate(phase);

    // Calculate success based on threshold
    const success = validation.rewardScore >= this.config.successThreshold;

    // Generate critique from violations
    const critique = this.generateCritique(validation);

    // Create enriched episode
    const episode: EnrichedEpisode = {
      agentId,
      task,
      reward: validation.rewardScore,
      success,
      critique,
      output: operations,
      timestamp: Date.now(),
      validationScore: validation.rewardScore,
      violations: validation.violations.map(v => v.ruleId),
      phase,
    };

    // Store in AgentDB
    await this.agentDB.storeEpisode(
      agentId,
      task,
      success,
      { operations, validationScore: validation.rewardScore, phase },
      critique
    );

    // Log validation result
    AgentDBLogger.validationResult(validation.errorCount, validation.warningCount);

    return episode;
  }

  /**
   * Generate human-readable critique from validation violations
   */
  generateCritique(validation: ValidationResult): string {
    if (validation.violations.length === 0) {
      return 'No violations detected.';
    }

    const violations = validation.violations
      .slice(0, this.config.maxCritiqueViolations);

    const critiqueParts: string[] = [];

    // Group by severity
    const errors = violations.filter(v => v.severity === 'error');
    const warnings = violations.filter(v => v.severity === 'warning');

    if (errors.length > 0) {
      critiqueParts.push('Errors:');
      for (const error of errors) {
        critiqueParts.push(`- ${error.ruleName}: ${error.reason}`);
        if (error.suggestion) {
          critiqueParts.push(`  Fix: ${error.suggestion}`);
        }
      }
    }

    if (warnings.length > 0) {
      if (critiqueParts.length > 0) critiqueParts.push('');
      critiqueParts.push('Warnings:');
      for (const warning of warnings) {
        critiqueParts.push(`- ${warning.ruleName}: ${warning.reason}`);
      }
    }

    // Add remaining violation count if truncated
    if (validation.violations.length > this.config.maxCritiqueViolations) {
      critiqueParts.push(`... and ${validation.violations.length - this.config.maxCritiqueViolations} more`);
    }

    const critique = critiqueParts.join('\n');
    return critique.length > this.config.maxCritiqueLength
      ? critique.substring(0, this.config.maxCritiqueLength) + '...'
      : critique;
  }

  /**
   * Load episode context for LLM prompt injection
   *
   * Returns lessons from failed episodes and patterns from successful ones.
   */
  async loadEpisodeContext(
    agentId: string,
    task?: string,
    k: number = this.config.maxContextEpisodes
  ): Promise<EpisodeContext> {
    const episodes = await this.agentDB.loadAgentContext(agentId, task, k * 2);

    const failed = episodes.filter(e => !e.success && e.critique);
    const successful = episodes.filter(e => e.success);

    // Generate lessons from failures
    const lessonsLearned = failed
      .slice(0, k)
      .map(e => `Task: "${e.task}"\nIssue: ${e.critique}`)
      .join('\n\n');

    // Generate patterns from successes
    const successfulPatterns = successful
      .slice(0, k)
      .map(e => `Task: "${e.task}" (score: ${e.reward.toFixed(2)})`)
      .join('\n');

    return {
      lessonsLearned,
      successfulPatterns,
      episodeCount: episodes.length,
    };
  }

  /**
   * Format episode context for system prompt injection
   */
  formatContextForPrompt(context: EpisodeContext): string {
    const parts: string[] = [];

    if (context.lessonsLearned) {
      parts.push('Learn from previous issues:');
      parts.push(context.lessonsLearned);
    }

    if (context.successfulPatterns) {
      parts.push('');
      parts.push('Successful patterns:');
      parts.push(context.successfulPatterns);
    }

    return parts.join('\n');
  }

  /**
   * Get agent effectiveness metrics
   */
  async getAgentEffectiveness(agentId: string): Promise<AgentEffectiveness> {
    const episodes = await this.agentDB.loadAgentContext(agentId, undefined, 100);

    if (episodes.length === 0) {
      return {
        agentId,
        totalEpisodes: 0,
        successfulEpisodes: 0,
        averageReward: 0,
        recentTrend: 'stable',
        commonViolations: [],
      };
    }

    const successful = episodes.filter(e => e.success).length;
    const avgReward = episodes.reduce((sum, e) => sum + e.reward, 0) / episodes.length;

    // Calculate trend from recent vs older episodes
    const midpoint = Math.floor(episodes.length / 2);
    const recentAvg = episodes.slice(0, midpoint).reduce((sum, e) => sum + e.reward, 0) /
      Math.max(1, midpoint);
    const olderAvg = episodes.slice(midpoint).reduce((sum, e) => sum + e.reward, 0) /
      Math.max(1, episodes.length - midpoint);

    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (recentAvg > olderAvg + 0.1) trend = 'improving';
    else if (recentAvg < olderAvg - 0.1) trend = 'declining';

    // Find common violations from critiques
    const violationCounts = new Map<string, number>();
    for (const episode of episodes) {
      if (episode.critique) {
        // Extract violation patterns from critiques
        const violations = episode.critique.match(/(\w+_\w+):/g) || [];
        for (const v of violations) {
          const rule = v.replace(':', '');
          violationCounts.set(rule, (violationCounts.get(rule) || 0) + 1);
        }
      }
    }

    const commonViolations = Array.from(violationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rule]) => rule);

    return {
      agentId,
      totalEpisodes: episodes.length,
      successfulEpisodes: successful,
      averageReward: avgReward,
      recentTrend: trend,
      commonViolations,
    };
  }

  /**
   * Generate review questions for low-reward operations
   */
  generateReviewQuestions(validation: ValidationResult): string[] {
    const questions: string[] = [];

    for (const violation of validation.violations.slice(0, 3)) {
      switch (violation.ruleId) {
        case 'required_properties':
          questions.push(`Node ${violation.semanticId} is missing required properties. What should name and descr be?`);
          break;
        case 'isolation':
          questions.push(`Node ${violation.semanticId} has no connections. Which node should it connect to?`);
          break;
        case 'function_requirements':
          questions.push(`Function ${violation.semanticId} doesn't satisfy any requirements. Which REQ should it satisfy?`);
          break;
        case 'function_io':
          questions.push(`Function ${violation.semanticId} has missing I/O. What data flows in/out?`);
          break;
        case 'millers_law':
          questions.push(`Parent ${violation.semanticId} has too many children. Can some be grouped?`);
          break;
        default:
          questions.push(`${violation.ruleName} violated at ${violation.semanticId}. How should this be fixed?`);
      }
    }

    return questions;
  }
}

/**
 * Create a ReflexionMemory instance
 */
export function createReflexionMemory(
  agentDB: UnifiedAgentDBService,
  evaluator: UnifiedRuleEvaluator
): ReflexionMemory {
  return new ReflexionMemory(agentDB, evaluator);
}
