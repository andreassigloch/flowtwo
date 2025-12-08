/**
 * Unit tests for LLM Engine Factory (CR-034)
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('unit: Engine Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createLLMEngine', () => {
    it('should create Anthropic engine by default', async () => {
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const { createLLMEngine, getCurrentProvider } = await import(
        '../../../src/llm-engine/engine-factory.js'
      );

      const engine = createLLMEngine({
        anthropicApiKey: 'test-key',
      });

      expect(engine).toBeDefined();
      expect(getCurrentProvider()).toBe('anthropic');
    });

    it('should create OpenAI engine when LLM_PROVIDER=openai', async () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_BASE_URL = 'http://localhost:1234/v1';
      process.env.OPENAI_MODEL = 'test-model';
      process.env.OPENAI_API_KEY = 'not-needed';

      const { createLLMEngine, getCurrentProvider, isOpenAIProvider } = await import(
        '../../../src/llm-engine/engine-factory.js'
      );

      const engine = createLLMEngine({});

      expect(engine).toBeDefined();
      expect(getCurrentProvider()).toBe('openai');
      expect(isOpenAIProvider()).toBe(true);
    });

    it('should throw error if anthropic provider but no API key', async () => {
      process.env.LLM_PROVIDER = 'anthropic';
      delete process.env.ANTHROPIC_API_KEY;

      const { createLLMEngine } = await import(
        '../../../src/llm-engine/engine-factory.js'
      );

      expect(() => createLLMEngine({})).toThrow('ANTHROPIC_API_KEY required');
    });
  });

  describe('getCurrentProvider', () => {
    it('should return anthropic when LLM_PROVIDER=anthropic', async () => {
      process.env.LLM_PROVIDER = 'anthropic';

      const { getCurrentProvider } = await import(
        '../../../src/llm-engine/engine-factory.js'
      );

      expect(getCurrentProvider()).toBe('anthropic');
    });

    it('should return openai when LLM_PROVIDER=openai', async () => {
      process.env.LLM_PROVIDER = 'openai';

      const { getCurrentProvider } = await import(
        '../../../src/llm-engine/engine-factory.js'
      );

      expect(getCurrentProvider()).toBe('openai');
    });
  });

  describe('isOpenAIProvider', () => {
    it('should return false for anthropic', async () => {
      process.env.LLM_PROVIDER = 'anthropic';

      const { isOpenAIProvider } = await import(
        '../../../src/llm-engine/engine-factory.js'
      );

      expect(isOpenAIProvider()).toBe(false);
    });

    it('should return true for openai', async () => {
      process.env.LLM_PROVIDER = 'openai';

      const { isOpenAIProvider } = await import(
        '../../../src/llm-engine/engine-factory.js'
      );

      expect(isOpenAIProvider()).toBe(true);
    });
  });
});
