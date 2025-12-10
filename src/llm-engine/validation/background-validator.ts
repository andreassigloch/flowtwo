/**
 * Background Validator (CR-038 Phase 4)
 *
 * Debounced validation handler that runs validation automatically
 * when the graph changes. Accepts AgentDB instance via constructor
 * for clean dependency injection.
 *
 * Key Features:
 * - 300ms debounce to avoid excessive validation calls
 * - Accepts AgentDB instance (no singleton)
 * - Pushes validation results to ChatCanvas for LLM context
 * - Automatic cleanup on shutdown
 *
 * @author andreas@siglochconsulting
 */

import type { UnifiedAgentDBService } from '../agentdb/unified-agentdb-service.js';
import type { ChatCanvas } from '../../canvas/chat-canvas.js';
import { createUnifiedRuleEvaluator } from './index.js';
import type { PhaseId } from './types.js';

/**
 * Background Validator Options
 */
export interface BackgroundValidatorOptions {
  /** Debounce delay in milliseconds (default: 300ms) */
  debounceMs?: number;

  /** Phase to validate (default: 'phase2_logical') */
  phase?: PhaseId;

  /** Logger function (optional) */
  log?: (message: string) => void;
}

/**
 * Background Validator
 *
 * Listens to AgentDB graph changes and runs validation automatically
 * with debouncing to avoid excessive validation calls.
 */
export class BackgroundValidator {
  private agentDB: UnifiedAgentDBService;
  private chatCanvas: ChatCanvas;
  private options: Required<BackgroundValidatorOptions>;
  private debounceTimer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Create background validator
   *
   * @param agentDB - AgentDB instance to monitor
   * @param chatCanvas - ChatCanvas to push validation results to
   * @param options - Validation options
   */
  constructor(
    agentDB: UnifiedAgentDBService,
    chatCanvas: ChatCanvas,
    options: BackgroundValidatorOptions = {}
  ) {
    this.agentDB = agentDB;
    this.chatCanvas = chatCanvas;
    this.options = {
      debounceMs: options.debounceMs ?? 300,
      phase: options.phase ?? 'phase2_logical',
      log: options.log ?? (() => {}),
    };
  }

  /**
   * Start background validation
   *
   * Subscribes to graph changes and validates automatically.
   */
  start(): void {
    if (this.unsubscribe) {
      throw new Error('BackgroundValidator already started');
    }

    // Subscribe to graph changes
    this.unsubscribe = this.agentDB.onGraphChange(() => {
      this.scheduleValidation();
    });

    this.options.log(
      `✅ Background validation started (${this.options.debounceMs}ms debounce, phase: ${this.options.phase})`
    );
  }

  /**
   * Stop background validation
   *
   * Unsubscribes from graph changes and clears pending validation.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.options.log('🛑 Background validation stopped');
  }

  /**
   * Schedule validation with debouncing
   *
   * Clears any pending validation and schedules a new one.
   */
  private scheduleValidation(): void {
    // Clear previous timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Schedule new validation
    this.debounceTimer = setTimeout(() => {
      this.runValidation().catch((error) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.options.log(`⚠️ Background validation error: ${errorMsg}`);
      });
    }, this.options.debounceMs);
  }

  /**
   * Run validation and push results to ChatCanvas
   */
  private async runValidation(): Promise<void> {
    try {
      // Create evaluator with current AgentDB instance
      const evaluator = createUnifiedRuleEvaluator(this.agentDB);
      const result = await evaluator.evaluate(this.options.phase);

      // Push validation summary to ChatCanvas (for LLM context)
      this.chatCanvas.setValidationSummary({
        violationCount: result.totalViolations,
        rewardScore: result.rewardScore,
        phaseGateReady: result.phaseGateReady,
        timestamp: new Date(),
      });

      // Log validation summary (if violations found)
      if (result.totalViolations > 0) {
        const scorePercent = (result.rewardScore * 100).toFixed(0);
        this.options.log(
          `🔍 Background validation: ${result.totalViolations} violations (score: ${scorePercent}%)`
        );
      }
    } catch (error) {
      throw error; // Re-throw for error handling in scheduleValidation
    }
  }

  /**
   * Trigger immediate validation (bypasses debounce)
   */
  async validateNow(): Promise<void> {
    // Clear pending validation
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Run validation immediately
    await this.runValidation();
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<BackgroundValidatorOptions> {
    return { ...this.options };
  }

  /**
   * Update configuration
   *
   * Note: Requires restart to take effect
   */
  updateConfig(options: Partial<BackgroundValidatorOptions>): void {
    if (this.unsubscribe) {
      throw new Error('Cannot update config while validator is running. Stop first.');
    }

    if (options.debounceMs !== undefined) {
      this.options.debounceMs = options.debounceMs;
    }
    if (options.phase !== undefined) {
      this.options.phase = options.phase;
    }
    if (options.log !== undefined) {
      this.options.log = options.log;
    }
  }
}

/**
 * Create and start background validator
 *
 * Convenience function for common usage pattern.
 */
export function createBackgroundValidator(
  agentDB: UnifiedAgentDBService,
  chatCanvas: ChatCanvas,
  options: BackgroundValidatorOptions = {}
): BackgroundValidator {
  const validator = new BackgroundValidator(agentDB, chatCanvas, options);
  validator.start();
  return validator;
}
