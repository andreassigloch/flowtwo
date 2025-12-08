/**
 * LLM Engine Factory (CR-034)
 *
 * Creates appropriate LLM engine based on configuration.
 * Supports Anthropic (default) and OpenAI-compatible providers.
 *
 * @author andreas@siglochconsulting
 */

import { LLMEngine } from './llm-engine.js';
import { OpenAIEngine } from './openai-engine.js';
import type { LLMEngineConfig, LLMRequest, StreamChunk } from '../shared/types/llm.js';
import {
  LLM_PROVIDER,
  OPENAI_BASE_URL,
  OPENAI_MODEL,
  OPENAI_API_KEY,
  LLM_TEMPERATURE,
} from '../shared/config.js';

/**
 * LLM Engine Interface
 *
 * Common interface for all LLM engines
 */
export interface ILLMEngine {
  processRequestStream(
    request: LLMRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void>;
  getConfig(): LLMEngineConfig;
  getAgentDBMetrics(workspaceId: string, systemId: string): Promise<any>;
  cleanupAgentDBCache(workspaceId: string, systemId: string): Promise<void>;
}

/**
 * Factory configuration
 */
export interface EngineFactoryConfig {
  /** Anthropic API key (for anthropic provider) */
  anthropicApiKey?: string;
  /** Model override */
  model?: string;
  /** Max tokens */
  maxTokens?: number;
  /** Temperature */
  temperature?: number;
  /** Enable AgentDB caching */
  enableCache?: boolean;
}

/**
 * Create LLM engine based on LLM_PROVIDER env var
 *
 * @param config - Optional configuration overrides
 * @returns LLM engine instance (Anthropic or OpenAI-compatible)
 */
export function createLLMEngine(config: EngineFactoryConfig = {}): ILLMEngine {
  const provider = LLM_PROVIDER;

  if (provider === 'openai') {
    // OpenAI-compatible provider (LM Studio, OpenRouter, etc.)
    return new OpenAIEngine({
      apiKey: OPENAI_API_KEY,
      baseUrl: OPENAI_BASE_URL,
      model: config.model || OPENAI_MODEL,
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature ?? LLM_TEMPERATURE,
      enableCache: config.enableCache ?? true,
    });
  }

  // Default: Anthropic
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY required for anthropic provider');
  }

  return new LLMEngine({
    apiKey: config.anthropicApiKey,
    model: config.model || 'claude-sonnet-4-5-20250929',
    maxTokens: config.maxTokens || 4096,
    temperature: config.temperature ?? LLM_TEMPERATURE,
    enableCache: config.enableCache ?? true,
  });
}

/**
 * Get current provider name
 */
export function getCurrentProvider(): string {
  return LLM_PROVIDER;
}

/**
 * Check if using OpenAI-compatible provider
 */
export function isOpenAIProvider(): boolean {
  return LLM_PROVIDER === 'openai';
}
