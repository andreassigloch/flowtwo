/**
 * Prompt Builder - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate prompt building with chat history context
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../../../src/llm-engine/prompt-builder.js';

describe('PromptBuilder', () => {
  const builder = new PromptBuilder();

  describe('buildSystemPrompt', () => {
    it('should build prompt without chat history', () => {
      const canvasState = '# System: TestSystem.SY.001\n## Nodes\n';

      const result = builder.buildSystemPrompt(canvasState);

      expect(result.sections.length).toBeGreaterThanOrEqual(3);
      expect(result.totalChars).toBeGreaterThan(0);
      expect(result.cachedSections).toBeGreaterThanOrEqual(3);
    });

    it('should build prompt with chat history', () => {
      const canvasState = '# System: TestSystem.SY.001\n## Nodes\n';
      const chatHistory = [
        { role: 'user' as const, content: 'Add a payment function' },
        { role: 'assistant' as const, content: 'I added ProcessPayment function' },
      ];

      const result = builder.buildSystemPrompt(canvasState, chatHistory);

      // Should have 4 sections: ontology, methodology, canvas state, chat history
      expect(result.sections.length).toBe(4);
      expect(result.cachedSections).toBe(4);
    });

    it('should include chat history content in prompt', () => {
      const canvasState = '# System: TestSystem.SY.001\n';
      const chatHistory = [
        { role: 'user' as const, content: 'Create a use case for user login' },
        { role: 'assistant' as const, content: 'I created UserLogin use case' },
        { role: 'user' as const, content: 'Now add authentication function' },
      ];

      const result = builder.buildSystemPrompt(canvasState, chatHistory);

      // Find chat history section
      const chatHistorySection = result.sections.find((s) =>
        s.text.includes('Conversation History')
      );

      expect(chatHistorySection).toBeDefined();
      expect(chatHistorySection?.text).toContain('USER: Create a use case for user login');
      expect(chatHistorySection?.text).toContain('ASSISTANT: I created UserLogin use case');
      expect(chatHistorySection?.text).toContain('USER: Now add authentication function');
    });

    it('should not include chat history section when empty', () => {
      const canvasState = '# System: TestSystem.SY.001\n';
      const chatHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

      const result = builder.buildSystemPrompt(canvasState, chatHistory);

      // Should have 3 sections: ontology, methodology, canvas state (no chat history)
      expect(result.sections.length).toBe(3);

      // No section should contain "Conversation History"
      const hasHistorySection = result.sections.some((s) =>
        s.text.includes('Conversation History')
      );
      expect(hasHistorySection).toBe(false);
    });

    it('should handle undefined chat history', () => {
      const canvasState = '# System: TestSystem.SY.001\n';

      const result = builder.buildSystemPrompt(canvasState, undefined);

      // Should have 3 sections: ontology, methodology, canvas state
      expect(result.sections.length).toBe(3);
    });

    it('should mark chat history section as cached', () => {
      const canvasState = '# System: TestSystem.SY.001\n';
      const chatHistory = [{ role: 'user' as const, content: 'Test message' }];

      const result = builder.buildSystemPrompt(canvasState, chatHistory);

      const chatHistorySection = result.sections.find((s) =>
        s.text.includes('Conversation History')
      );

      expect(chatHistorySection?.cacheControl).toEqual({ type: 'ephemeral' });
    });
  });

  describe('multi-turn context', () => {
    it('should preserve message order in chat history', () => {
      const canvasState = '# System: TestSystem.SY.001\n';
      const chatHistory = [
        { role: 'user' as const, content: 'First message' },
        { role: 'assistant' as const, content: 'First response' },
        { role: 'user' as const, content: 'Second message' },
        { role: 'assistant' as const, content: 'Second response' },
        { role: 'user' as const, content: 'Third message' },
      ];

      const result = builder.buildSystemPrompt(canvasState, chatHistory);
      const chatHistorySection = result.sections.find((s) =>
        s.text.includes('Conversation History')
      );

      // Messages should appear in order
      const text = chatHistorySection?.text || '';
      const firstIndex = text.indexOf('First message');
      const secondIndex = text.indexOf('Second message');
      const thirdIndex = text.indexOf('Third message');

      expect(firstIndex).toBeLessThan(secondIndex);
      expect(secondIndex).toBeLessThan(thirdIndex);
    });

    it('should handle system messages in chat history', () => {
      const canvasState = '# System: TestSystem.SY.001\n';
      const chatHistory = [
        { role: 'system' as const, content: 'System initialized' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = builder.buildSystemPrompt(canvasState, chatHistory);
      const chatHistorySection = result.sections.find((s) =>
        s.text.includes('Conversation History')
      );

      expect(chatHistorySection?.text).toContain('SYSTEM: System initialized');
      expect(chatHistorySection?.text).toContain('USER: Hello');
    });

    it('should enable LLM to understand selection context like "1." or "option 1"', () => {
      const canvasState = '# System: TestSystem.SY.001\n';
      const chatHistory = [
        { role: 'user' as const, content: 'add use case' },
        {
          role: 'assistant' as const,
          content:
            'Here are options:\n1. **Manage Server Health** - Monitor and maintain server health\n2. **Process Payment** - Handle payment transactions',
        },
        { role: 'user' as const, content: '1.' },
      ];

      const result = builder.buildSystemPrompt(canvasState, chatHistory);
      const chatHistorySection = result.sections.find((s) =>
        s.text.includes('Conversation History')
      );

      // Chat history should contain all the context needed for LLM to understand "1."
      expect(chatHistorySection?.text).toContain('add use case');
      expect(chatHistorySection?.text).toContain('Manage Server Health');
      expect(chatHistorySection?.text).toContain('1.');

      // The prompt should enable the LLM to correlate "1." with option 1
      expect(chatHistorySection?.text).toContain(
        'Use this context to understand the user\'s intent'
      );
    });
  });
});
