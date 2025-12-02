/**
 * Multi-Agent Processor Unit Tests
 *
 * Tests for the LLM-Engine integration of the multi-agent system.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MultiAgentProcessor,
  createMultiAgentProcessor,
} from '../../../src/llm-engine/multi-agent-processor.js';
import type { LLMResponse } from '../../../src/shared/types/llm.js';

describe('MultiAgentProcessor', () => {
  let processor: MultiAgentProcessor;

  beforeEach(() => {
    processor = createMultiAgentProcessor();
    processor.reset();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const proc = createMultiAgentProcessor();
      expect(proc).toBeDefined();
    });

    it('should accept custom config', () => {
      const proc = createMultiAgentProcessor({
        enableAutoValidation: false,
        enableReviewFlow: false,
        autoApplySafeCorrections: true,
        defaultAgent: 'functional-analyst',
      });
      expect(proc).toBeDefined();
    });
  });

  describe('processResponse', () => {
    const mockGraphSnapshot = `## Nodes
+ TestSystem|SYS|TestSystem.SY.001|Test system`;

    const mockLLMResponse: LLMResponse = {
      textResponse: 'Added a new function',
      operations: `## Nodes
+ FormatESerialization|FUNC|FormatESerialization.FN.001|Serializes data`,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      cacheHit: false,
      model: 'claude-sonnet-4-5-20250929',
      responseId: 'test-123',
    };

    it('should process response and detect validation errors', async () => {
      const result = await processor.processResponse(
        mockLLMResponse,
        mockGraphSnapshot,
        'Add serialization function'
      );

      expect(result.llmResponse).toBe(mockLLMResponse);
      expect(result.processingAgent).toBeDefined();
      // Should detect V1 error (format as FUNC)
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    it('should not validate if operations is null', async () => {
      const noOpsResponse: LLMResponse = {
        ...mockLLMResponse,
        operations: null,
      };

      const result = await processor.processResponse(
        noOpsResponse,
        mockGraphSnapshot,
        'Just asking a question'
      );

      expect(result.validationErrors.length).toBe(0);
    });

    it('should generate review questions when enabled', async () => {
      const result = await processor.processResponse(
        mockLLMResponse,
        mockGraphSnapshot,
        'Add serialization'
      );

      // Review questions should be generated for validation errors
      if (result.validationErrors.length > 0) {
        expect(result.reviewQuestions.length).toBeGreaterThan(0);
      }
    });

    it('should skip review questions when disabled', async () => {
      const proc = createMultiAgentProcessor({ enableReviewFlow: false });

      const result = await proc.processResponse(
        mockLLMResponse,
        mockGraphSnapshot,
        'Add serialization'
      );

      expect(result.reviewQuestions.length).toBe(0);
    });
  });

  describe('detectAgent', () => {
    it('should detect requirements engineer for requirement keywords', async () => {
      const response: LLMResponse = {
        textResponse: 'OK',
        operations: null,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cacheHit: false,
        model: 'test',
        responseId: 'test',
      };

      const result = await processor.processResponse(response, '', 'Add a new requirement');
      expect(result.processingAgent).toBe('requirements-engineer');
    });

    it('should detect architecture reviewer for validation keywords', async () => {
      const response: LLMResponse = {
        textResponse: 'OK',
        operations: null,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cacheHit: false,
        model: 'test',
        responseId: 'test',
      };

      const result = await processor.processResponse(response, '', 'Validate my architecture');
      expect(result.processingAgent).toBe('architecture-reviewer');
    });

    it('should detect functional analyst for flow keywords', async () => {
      const response: LLMResponse = {
        textResponse: 'OK',
        operations: null,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cacheHit: false,
        model: 'test',
        responseId: 'test',
      };

      const result = await processor.processResponse(response, '', 'Create a new process chain');
      expect(result.processingAgent).toBe('functional-analyst');
    });

    it('should default to system architect', async () => {
      const response: LLMResponse = {
        textResponse: 'OK',
        operations: null,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cacheHit: false,
        model: 'test',
        responseId: 'test',
      };

      const result = await processor.processResponse(response, '', 'Add a button');
      expect(result.processingAgent).toBe('system-architect');
    });
  });

  describe('classifyNewNode', () => {
    it('should classify format names as SCHEMA', () => {
      const result = processor.classifyNewNode('FormatESerialization', 'Serializes data');

      expect(result.type).toBe('SCHEMA');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify processing names as FUNC', () => {
      const result = processor.classifyNewNode('ProcessPayment', 'Processes customer payments');

      expect(result.type).toBe('FUNC');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify module names as MOD', () => {
      const result = processor.classifyNewNode('PaymentModule', 'Payment processing module');

      expect(result.type).toBe('MOD');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('getAgentPrompt', () => {
    it('should return prompt for system architect', () => {
      const prompt = processor.getAgentPrompt('system-architect', '## Nodes\n+ Test|SYS|Test.SY.001');

      expect(prompt).toContain('System Architect');
      expect(prompt).toContain('Test.SY.001');
    });

    it('should return prompt for architecture reviewer', () => {
      const prompt = processor.getAgentPrompt('architecture-reviewer', '## Nodes');

      expect(prompt).toContain('Architecture Reviewer');
    });

    it('should return prompt for requirements engineer', () => {
      const prompt = processor.getAgentPrompt('requirements-engineer', '## Nodes');

      expect(prompt).toContain('Requirements Engineer');
    });

    it('should return prompt for functional analyst', () => {
      const prompt = processor.getAgentPrompt('functional-analyst', '## Nodes');

      expect(prompt).toContain('Functional Analyst');
    });
  });

  describe('CR-027 routing', () => {
    it('should route user input to appropriate agent', () => {
      const agent = processor.routeUserInput('Add a new requirement', {
        currentPhase: 'phase1_requirements',
        graphEmpty: true,
        userMessage: 'Add a new requirement',
      });

      expect(agent).toBe('requirements-engineer');
    });

    it('should route to system-architect when graph is empty', () => {
      const agent = processor.routeUserInput('Create a system', {
        currentPhase: 'phase1_requirements',
        graphEmpty: true,
        userMessage: 'Create a system',
      });

      // When graph is empty and asking about system creation, routes to system-architect
      expect(agent).toBe('system-architect');
    });

    it('should calculate reward for agent execution', () => {
      const reward = processor.calculateReward('system-architect', {
        agentId: 'system-architect',
        textResponse: 'Created system',
        operations: '## Nodes\n+ Test|SYS|Test.SY.001',
        isComplete: true,
      });

      expect(reward).toBeGreaterThanOrEqual(0);
      expect(reward).toBeLessThanOrEqual(1);
    });
  });

  describe('review flow', () => {
    it('should return formatted review questions', () => {
      // First generate some questions by processing a response with errors
      const mockResponse: LLMResponse = {
        textResponse: 'Added',
        operations: `## Nodes
+ FormatSchema|FUNC|FormatSchema.FN.001|Schema format`,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cacheHit: false,
        model: 'test',
        responseId: 'test',
      };

      // Process to generate questions
      processor.processResponse(mockResponse, '', 'Add format');

      const formatted = processor.formatReviewQuestionsForDisplay();
      expect(typeof formatted).toBe('string');
    });

    it('should return pending review questions', () => {
      const questions = processor.getPendingReviewQuestions();
      expect(Array.isArray(questions)).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset processor state', async () => {
      // Process a response to create some state
      const mockResponse: LLMResponse = {
        textResponse: 'Added',
        operations: `## Nodes\n+ Test|FUNC|Test.FN.001|Test`,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cacheHit: false,
        model: 'test',
        responseId: 'test',
      };

      await processor.processResponse(mockResponse, '', 'Test');

      // Reset and verify no pending review questions
      processor.reset();

      const questions = processor.getPendingReviewQuestions();
      expect(questions.length).toBe(0);
    });
  });

  describe('auto-corrections', () => {
    it('should not auto-apply corrections by default', async () => {
      const proc = createMultiAgentProcessor({ autoApplySafeCorrections: false });

      const mockResponse: LLMResponse = {
        textResponse: 'Added',
        operations: `## Nodes
+ FormatESerialization|FUNC|FormatESerialization.FN.001|Serialization`,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cacheHit: false,
        model: 'test',
        responseId: 'test',
      };

      const result = await proc.processResponse(mockResponse, '', 'Add serialization');

      expect(result.autoCorrectionsApplied).toBe(false);
    });

    it('should auto-apply safe corrections when enabled', async () => {
      const proc = createMultiAgentProcessor({ autoApplySafeCorrections: true });

      const mockResponse: LLMResponse = {
        textResponse: 'Added',
        operations: `## Nodes
+ FormatESerialization|FUNC|FormatESerialization.FN.001|Serialization`,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cacheHit: false,
        model: 'test',
        responseId: 'test',
      };

      const result = await proc.processResponse(mockResponse, '', 'Add serialization');

      // Should have corrections available (V1 error for format as FUNC)
      expect(result.corrections.length).toBeGreaterThan(0);
      // Auto-corrections should be applied for safe type changes
      expect(result.autoCorrectionsApplied).toBe(true);
    });
  });
});
