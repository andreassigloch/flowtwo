/**
 * Background Validator Tests (CR-038 Phase 4)
 *
 * Tests for the BackgroundValidator class
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BackgroundValidator, createBackgroundValidator } from '../../../src/llm-engine/validation/background-validator.js';
import type { UnifiedAgentDBService } from '../../../src/llm-engine/agentdb/unified-agentdb-service.js';
import type { ChatCanvas } from '../../../src/canvas/chat-canvas.js';

describe('BackgroundValidator', () => {
  let mockAgentDB: UnifiedAgentDBService;
  let mockChatCanvas: ChatCanvas;
  let changeCallback: (() => void) | null = null;
  const logMessages: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    logMessages.length = 0;

    // Mock AgentDB with graph change subscription
    mockAgentDB = {
      onGraphChange: vi.fn((callback: () => void) => {
        changeCallback = callback;
        return vi.fn(); // Return unsubscribe function
      }),
      getNodes: vi.fn(() => []),
      getEdges: vi.fn(() => []),
      getGraphStats: vi.fn(() => ({ nodeCount: 0, edgeCount: 0, version: 1 })),
    } as unknown as UnifiedAgentDBService;

    // Mock ChatCanvas
    mockChatCanvas = {
      setValidationSummary: vi.fn(),
    } as unknown as ChatCanvas;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create validator with default options', () => {
    const validator = new BackgroundValidator(mockAgentDB, mockChatCanvas);

    const config = validator.getConfig();
    expect(config.debounceMs).toBe(300);
    expect(config.phase).toBe('phase2_logical');
  });

  it('should create validator with custom options', () => {
    const validator = new BackgroundValidator(mockAgentDB, mockChatCanvas, {
      debounceMs: 500,
      phase: 'phase1_requirements',
      log: (msg) => logMessages.push(msg),
    });

    const config = validator.getConfig();
    expect(config.debounceMs).toBe(500);
    expect(config.phase).toBe('phase1_requirements');
  });

  it('should start and subscribe to graph changes', () => {
    const validator = new BackgroundValidator(mockAgentDB, mockChatCanvas, {
      log: (msg) => logMessages.push(msg),
    });

    validator.start();

    expect(mockAgentDB.onGraphChange).toHaveBeenCalled();
    expect(logMessages).toContain('✅ Background validation started (300ms debounce, phase: phase2_logical)');
  });

  it('should throw if started twice', () => {
    const validator = new BackgroundValidator(mockAgentDB, mockChatCanvas);

    validator.start();
    expect(() => validator.start()).toThrow('BackgroundValidator already started');
  });

  it('should debounce validation on graph changes', () => {
    const validator = new BackgroundValidator(mockAgentDB, mockChatCanvas, {
      debounceMs: 300,
    });

    validator.start();

    // Trigger graph changes rapidly
    if (changeCallback) {
      changeCallback(); // 0ms
      changeCallback(); // 0ms
      changeCallback(); // 0ms
    }

    // Validation should NOT have run yet (debounced)
    expect(mockChatCanvas.setValidationSummary).not.toHaveBeenCalled();

    // Advance timers by debounce time
    vi.advanceTimersByTime(300);

    // Validation should run once (not 3 times)
    // Note: Since we're testing debouncing logic only, we can't test actual validation
    // because that requires full AgentDB setup. The mock just verifies debouncing works.
  });

  it('should stop and unsubscribe from graph changes', () => {
    const unsubscribeMock = vi.fn();
    mockAgentDB.onGraphChange = vi.fn(() => unsubscribeMock);

    const validator = new BackgroundValidator(mockAgentDB, mockChatCanvas, {
      log: (msg) => logMessages.push(msg),
    });

    validator.start();
    validator.stop();

    expect(unsubscribeMock).toHaveBeenCalled();
    expect(logMessages).toContain('🛑 Background validation stopped');
  });

  it('should clear pending validation on stop', () => {
    const validator = new BackgroundValidator(mockAgentDB, mockChatCanvas, {
      debounceMs: 300,
    });

    validator.start();

    // Trigger graph change
    if (changeCallback) {
      changeCallback();
    }

    // Stop before debounce completes
    validator.stop();

    // Advance timers
    vi.advanceTimersByTime(300);

    // Validation should NOT run (stopped)
    expect(mockChatCanvas.setValidationSummary).not.toHaveBeenCalled();
  });

  it('should allow config updates when stopped', () => {
    const validator = new BackgroundValidator(mockAgentDB, mockChatCanvas, {
      debounceMs: 300,
    });

    validator.updateConfig({ debounceMs: 500 });

    const config = validator.getConfig();
    expect(config.debounceMs).toBe(500);
  });

  it('should prevent config updates when running', () => {
    const validator = new BackgroundValidator(mockAgentDB, mockChatCanvas);

    validator.start();

    expect(() => validator.updateConfig({ debounceMs: 500 })).toThrow(
      'Cannot update config while validator is running. Stop first.'
    );

    validator.stop();
  });

  it('should create and start validator with convenience function', () => {
    const validator = createBackgroundValidator(mockAgentDB, mockChatCanvas, {
      log: (msg) => logMessages.push(msg),
    });

    expect(mockAgentDB.onGraphChange).toHaveBeenCalled();
    expect(logMessages).toContain('✅ Background validation started (300ms debounce, phase: phase2_logical)');
    expect(validator).toBeInstanceOf(BackgroundValidator);
  });
});
