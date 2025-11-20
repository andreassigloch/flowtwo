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
import { LLMRequest, LLMResponse, LLMEngineConfig, StreamChunk } from '../shared/types/llm.js';
import { PromptBuilder } from './prompt-builder.js';
import { ResponseParser } from './response-parser.js';
import { LOG_PATH, LLM_TEMPERATURE } from '../shared/config.js';
import { getAgentDBService } from './agentdb/agentdb-service.js';

/**
 * Log to STDOUT file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ${message}`;
  fs.appendFileSync(LOG_PATH, logMsg + '\n');
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
      temperature: config.temperature ?? LLM_TEMPERATURE,
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
   * Process LLM request with streaming
   *
   * Streams text chunks in real-time, buffers operations until complete
   *
   * @param request - LLM request with message and context
   * @param onChunk - Callback for each chunk (text or final response)
   */
  async processRequestStream(
    request: LLMRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    // Check AgentDB cache first (semantic similarity)
    let cached = null;
    try {
      const agentdb = await getAgentDBService();
      cached = await agentdb.checkCache(request.message);
    } catch (error) {
      log(`⚠️ AgentDB cache check failed: ${error}`);
    }

    if (cached) {
      // AgentDB logger already logged cache hit - no duplicate needed

      // Emit cached text as a single chunk first (for display)
      onChunk({
        type: 'text',
        text: cached.response,
      });

      // Then emit complete with operations
      onChunk({
        type: 'complete',
        response: {
          textResponse: cached.response,
          operations: cached.operations,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          cacheHit: true,
          model: this.config.model,
          responseId: 'agentdb-cached',
        },
      });
      return;
    }

    // AgentDB logger already logged cache miss - no duplicate needed

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

    // Create streaming request
    const stream = await this.client.messages.stream({
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

    // Buffer full response text
    let fullText = '';
    let wasInsideOperations = false;

    // Stream text chunks
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const textChunk = event.delta.text;
          const previousText = fullText;
          fullText += textChunk;

          const isNowInside = this.isInsideOperationsBlock(fullText);

          // Only emit if we're not inside operations block
          if (!isNowInside && !wasInsideOperations) {
            // Normal text - emit chunk
            onChunk({
              type: 'text',
              text: textChunk,
            });
          } else if (isNowInside && !wasInsideOperations) {
            // Just entered operations block - emit text before <operations>
            const operationsStart = fullText.lastIndexOf('<operations>');
            const textBeforeOpsEndIdx = operationsStart - previousText.length;

            if (textBeforeOpsEndIdx > 0) {
              // <operations> tag is in this chunk - emit text before it
              const textBeforeOps = textChunk.substring(0, textBeforeOpsEndIdx);
              if (textBeforeOps) {
                onChunk({
                  type: 'text',
                  text: textBeforeOps,
                });
              }
            }
          }

          wasInsideOperations = isNowInside;
        }
      }
    }

    // Get final message with usage stats
    const finalMessage = await stream.finalMessage();

    // Parse complete response
    const parsed = this.responseParser.parseResponse(fullText);

    // Build final LLM response
    const llmResponse: LLMResponse = {
      textResponse: parsed.textResponse,
      operations: parsed.operations,
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        cacheReadTokens: (finalMessage.usage as any).cache_read_input_tokens,
        cacheWriteTokens: (finalMessage.usage as any).cache_creation_input_tokens,
      },
      cacheHit: (finalMessage.usage as any).cache_read_input_tokens > 0,
      model: this.config.model,
      responseId: finalMessage.id,
    };

    // Log cache performance
    this.logCachePerformance(llmResponse);

    // Store in AgentDB for future cache hits
    try {
      const agentdb = await getAgentDBService();
      await agentdb.cacheResponse(request.message, parsed.textResponse, parsed.operations);
      // AgentDB logger already logged cache store - no duplicate needed

      // Store episodic memory (Reflexion)
      await agentdb.storeEpisode(
        'llm-engine',
        request.message,
        parsed.operations !== null, // Success if operations parsed
        { operations: parsed.operations, textResponse: parsed.textResponse },
        'LLM request processed successfully'
      );
    } catch (error) {
      log(`⚠️ AgentDB storage failed: ${error}`);
    }

    // Emit final response with operations
    onChunk({
      type: 'complete',
      response: llmResponse,
    });
  }

  /**
   * Check if we're currently inside an operations block
   *
   * @param text - Current accumulated text
   * @returns True if inside unclosed operations block
   */
  private isInsideOperationsBlock(text: string): boolean {
    const openMatches = text.match(/<operations>/gi);
    const closeMatches = text.match(/<\/operations>/gi);

    const openCount = openMatches ? openMatches.length : 0;
    const closeCount = closeMatches ? closeMatches.length : 0;

    return openCount > closeCount;
  }

  /**
   * Log cache performance metrics
   */
  private logCachePerformance(response: LLMResponse): void {
    const { usage } = response;

    log('📊 LLM Usage:');
    log(`   Input: ${usage.inputTokens}, Output: ${usage.outputTokens}, Cache read: ${usage.cacheReadTokens || 0}, Cache write: ${usage.cacheWriteTokens || 0}`);
  }

  /**
   * Get configuration
   */
  getConfig(): LLMEngineConfig {
    return this.config;
  }

  /**
   * Get AgentDB cache metrics
   */
  async getAgentDBMetrics() {
    const agentdb = await getAgentDBService();
    return agentdb.getMetrics();
  }

  /**
   * Cleanup expired AgentDB cache entries
   */
  async cleanupAgentDBCache() {
    const agentdb = await getAgentDBService();
    await agentdb.cleanup();
    log('🧹 AgentDB cache cleanup completed');
  }
}
