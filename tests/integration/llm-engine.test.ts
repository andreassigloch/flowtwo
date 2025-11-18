/**
 * LLM Engine - Integration Tests
 *
 * Test Category: Integration (20% of test pyramid)
 * Purpose: Validate LLM Engine with Anthropic API (mocked)
 *
 * NOTE: These tests use mocked Anthropic API responses
 *       For real API testing, run demo-llm.ts
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMEngine } from '../../src/llm-engine/llm-engine.js';
import type { LLMRequest } from '../../src/shared/types/llm.js';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn(),
      };
    },
  };
});

describe('LLMEngine Integration', () => {
  let llmEngine: LLMEngine;

  beforeEach(() => {
    llmEngine = new LLMEngine({
      apiKey: 'test-api-key',
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 4096,
      temperature: 0.7,
      enableCache: true,
    });
  });

  describe('processRequest', () => {
    it('should process request with operations', async () => {
      // Mock Anthropic response
      const mockResponse = {
        id: 'msg_test123',
        content: [
          {
            type: 'text',
            text: `I've added a payment function.

<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>

## Nodes
+ ProcessPayment|FUNC|ProcessPayment.FN.001|Process payments

## Edges
+ System.SY.001 -cp-> ProcessPayment.FN.001
</operations>

The function is now part of your system.`,
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 200,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 500,
        },
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (llmEngine as any).client.messages.create = mockCreate;

      // Create request
      const request: LLMRequest = {
        message: 'Add a payment function',
        chatId: 'test-chat',
        workspaceId: 'test-ws',
        systemId: 'TestSystem.SY.001',
        userId: 'test-user',
        canvasState: '## Nodes\nTestSystem|SYS|TestSystem.SY.001|Test system',
      };

      // Process request
      const response = await llmEngine.processRequest(request);

      // Verify Anthropic API was called with cache control
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          temperature: 0.7,
          system: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              cache_control: { type: 'ephemeral' },
            }),
          ]),
          messages: [
            {
              role: 'user',
              content: 'Add a payment function',
            },
          ],
        })
      );

      // Verify response structure
      expect(response.textResponse).toBe(
        "I've added a payment function.\n\nThe function is now part of your system."
      );
      expect(response.operations).toContain('<operations>');
      expect(response.operations).toContain('ProcessPayment.FN.001');
      expect(response.usage.inputTokens).toBe(100);
      expect(response.usage.outputTokens).toBe(200);
      expect(response.usage.cacheWriteTokens).toBe(500);
      expect(response.cacheHit).toBe(false);
      expect(response.model).toBe('claude-sonnet-4-5-20250929');
      expect(response.responseId).toBe('msg_test123');
    });

    it('should handle response without operations', async () => {
      // Mock conversational response
      const mockResponse = {
        id: 'msg_test456',
        content: [
          {
            type: 'text',
            text: 'I can help you with that. What would you like to add?',
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 20,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (llmEngine as any).client.messages.create = mockCreate;

      const request: LLMRequest = {
        message: 'What can you do?',
        chatId: 'test-chat',
        workspaceId: 'test-ws',
        systemId: 'TestSystem.SY.001',
        userId: 'test-user',
        canvasState: '## Nodes\nTestSystem|SYS|TestSystem.SY.001|Test system',
      };

      const response = await llmEngine.processRequest(request);

      expect(response.textResponse).toBe(
        'I can help you with that. What would you like to add?'
      );
      expect(response.operations).toBeNull();
    });

    it('should detect cache hit', async () => {
      // Mock response with cache hit
      const mockResponse = {
        id: 'msg_test789',
        content: [
          {
            type: 'text',
            text: 'Response with cache hit',
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 100,
          cache_read_input_tokens: 1500, // Cache hit!
          cache_creation_input_tokens: 0,
        },
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (llmEngine as any).client.messages.create = mockCreate;

      const request: LLMRequest = {
        message: 'Second request',
        chatId: 'test-chat',
        workspaceId: 'test-ws',
        systemId: 'TestSystem.SY.001',
        userId: 'test-user',
        canvasState: '## Nodes\nTestSystem|SYS|TestSystem.SY.001|Test system',
      };

      const response = await llmEngine.processRequest(request);

      expect(response.cacheHit).toBe(true);
      expect(response.usage.cacheReadTokens).toBe(1500);
    });

    it('should include chat history in prompt', async () => {
      const mockResponse = {
        id: 'msg_test_history',
        content: [{ type: 'text', text: 'Response with history' }],
        usage: {
          input_tokens: 200,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 1000,
        },
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (llmEngine as any).client.messages.create = mockCreate;

      const request: LLMRequest = {
        message: 'Current message',
        chatId: 'test-chat',
        workspaceId: 'test-ws',
        systemId: 'TestSystem.SY.001',
        userId: 'test-user',
        canvasState: '## Nodes\nTestSystem|SYS|TestSystem.SY.001|Test system',
        chatHistory: [
          { role: 'user', content: 'Previous message' },
          { role: 'assistant', content: 'Previous response' },
        ],
      };

      const response = await llmEngine.processRequest(request);

      // Verify system prompt includes chat history section
      const systemCall = mockCreate.mock.calls[0][0].system;
      const systemTexts = systemCall.map((s: any) => s.text).join(' ');
      expect(systemTexts).toContain('Previous message');
      expect(systemTexts).toContain('Previous response');
      expect(response.textResponse).toBe('Response with history');
    });

    it('should use correct model configuration', async () => {
      const customEngine = new LLMEngine({
        apiKey: 'test-api-key',
        model: 'claude-opus-4-20250514',
        maxTokens: 8192,
        temperature: 0.5,
      });

      const mockResponse = {
        id: 'msg_custom',
        content: [{ type: 'text', text: 'Custom model response' }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (customEngine as any).client.messages.create = mockCreate;

      const request: LLMRequest = {
        message: 'Test custom config',
        chatId: 'test-chat',
        workspaceId: 'test-ws',
        systemId: 'TestSystem.SY.001',
        userId: 'test-user',
        canvasState: '## Nodes',
      };

      await customEngine.processRequest(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4-20250514',
          max_tokens: 8192,
          temperature: 0.5,
        })
      );
    });
  });

  describe('getConfig', () => {
    it('should return engine configuration', () => {
      const config = llmEngine.getConfig();

      expect(config.apiKey).toBe('test-api-key');
      expect(config.model).toBe('claude-sonnet-4-5-20250929');
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.7);
      expect(config.enableCache).toBe(true);
    });
  });
});
