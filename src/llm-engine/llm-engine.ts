/**
 * LLM Engine
 *
 * Main LLM service integrating:
 * - Anthropic API with prompt caching
 * - Response parsing
 * - Usage tracking
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import { LLMRequest, LLMResponse, LLMEngineConfig } from '../shared/types/llm.js';
import { PromptBuilder } from './prompt-builder.js';
import { ResponseParser } from './response-parser.js';

/**
 * Log to STDOUT file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ${message}`;
  fs.appendFileSync('/tmp/graphengine.log', logMsg + '\n');
}

/**
 * LLM Engine
 *
 * Handles LLM requests with caching and response parsing
 */
export class LLMEngine {
  private client: Anthropic;
  private config: Required<LLMEngineConfig>;
  private promptBuilder: PromptBuilder;
  private responseParser: ResponseParser;

  constructor(config: LLMEngineConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'claude-sonnet-4-5-20250929',
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.7,
      enableCache: config.enableCache ?? true,
      agentDbUrl: config.agentDbUrl || '',
      cacheTTL: config.cacheTTL || 3600,
      enableAutoDerivation: config.enableAutoDerivation ?? false,
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
    });

    this.promptBuilder = new PromptBuilder();
    this.responseParser = new ResponseParser();
  }

  /**
   * Process LLM request
   *
   * @param request - LLM request with message and context
   * @returns LLM response with text and operations
   */
  async processRequest(request: LLMRequest): Promise<LLMResponse> {
    // Build system prompt with cache control
    const systemPrompt = this.promptBuilder.buildSystemPrompt(
      request.canvasState,
      request.chatHistory
    );

    // Prepare system sections for Anthropic API
    const systemSections = systemPrompt.sections.map((section) => ({
      type: 'text' as const,
      text: section.text,
      ...(section.cacheControl && { cache_control: section.cacheControl }),
    }));

    // Call Anthropic API
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemSections,
      messages: [
        {
          role: 'user',
          content: request.message,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
      .join('\n');

    // Parse response to extract operations
    const parsed = this.responseParser.parseResponse(textContent);

    // Build LLM response
    const llmResponse: LLMResponse = {
      textResponse: parsed.textResponse,
      operations: parsed.operations,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: (response.usage as any).cache_read_input_tokens,
        cacheWriteTokens: (response.usage as any).cache_creation_input_tokens,
      },
      cacheHit: (response.usage as any).cache_read_input_tokens > 0,
      model: this.config.model,
      responseId: response.id,
    };

    // Log cache performance
    this.logCachePerformance(llmResponse);

    return llmResponse;
  }

  /**
   * Log cache performance metrics
   */
  private logCachePerformance(response: LLMResponse): void {
    const { usage, cacheHit } = response;

    log('📊 LLM Usage:');
    log(`   Input tokens: ${usage.inputTokens}`);
    log(`   Output tokens: ${usage.outputTokens}`);

    if (usage.cacheReadTokens) {
      log(`   Cache read tokens: ${usage.cacheReadTokens} ✅`);
      const savings = Math.round(
        (usage.cacheReadTokens / (usage.inputTokens + usage.cacheReadTokens)) * 100
      );
      log(`   Cache savings: ${savings}%`);
    }

    if (usage.cacheWriteTokens) {
      log(`   Cache write tokens: ${usage.cacheWriteTokens} (building cache)`);
    }

    log(`   Cache hit: ${cacheHit ? 'Yes ✅' : 'No (first request)'}`);
  }

  /**
   * Get configuration
   */
  getConfig(): LLMEngineConfig {
    return this.config;
  }
}
