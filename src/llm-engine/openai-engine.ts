/**
 * OpenAI-Compatible LLM Engine (CR-034)
 *
 * Supports OpenAI-compatible APIs:
 * - LM Studio (local)
 * - OpenRouter (cloud)
 * - Ollama, vLLM, etc.
 *
 * @author andreas@siglochconsulting
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import { LLMRequest, LLMResponse, LLMEngineConfig, StreamChunk } from '../shared/types/llm.js';
import { PromptBuilder } from './prompt-builder.js';
import { ResponseParser } from './response-parser.js';
import { LOG_PATH, LLM_TEMPERATURE } from '../shared/config.js';
import { getUnifiedAgentDBService } from './agentdb/unified-agentdb-service.js';

/**
 * Log to STDOUT file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ${message}`;
  fs.appendFileSync(LOG_PATH, logMsg + '\n');
}

/**
 * OpenAI Engine Configuration
 */
export interface OpenAIEngineConfig extends LLMEngineConfig {
  /** Base URL for OpenAI-compatible API */
  baseUrl: string;
}

/**
 * OpenAI-Compatible LLM Engine
 *
 * Same interface as LLMEngine but uses OpenAI SDK
 */
export class OpenAIEngine {
  private client: OpenAI;
  private config: Required<LLMEngineConfig> & { baseUrl: string };
  private promptBuilder: PromptBuilder;
  private responseParser: ResponseParser;

  constructor(config: OpenAIEngineConfig) {
    this.config = {
      apiKey: config.apiKey || 'not-needed',
      model: config.model || 'devstral-small-2505-mlx',
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature ?? LLM_TEMPERATURE,
      enableCache: config.enableCache ?? true,
      agentDbUrl: config.agentDbUrl || '',
      cacheTTL: config.cacheTTL || 3600,
      enableAutoDerivation: config.enableAutoDerivation ?? false,
      baseUrl: config.baseUrl,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });

    this.promptBuilder = new PromptBuilder();
    this.responseParser = new ResponseParser();

    log(`🔧 OpenAI Engine initialized: ${this.config.baseUrl} (model: ${this.config.model})`);
  }

  /**
   * Process LLM request with streaming
   *
   * Same interface as LLMEngine.processRequestStream
   */
  async processRequestStream(
    request: LLMRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    // Check AgentDB cache first
    let cached = null;
    try {
      const agentdb = await getUnifiedAgentDBService(request.workspaceId, request.systemId);
      const graphVersion = agentdb.getGraphVersion();
      cached = await agentdb.checkCache(request.message, graphVersion);
    } catch (error) {
      log(`⚠️ AgentDB cache check failed: ${error}`);
    }

    if (cached) {
      onChunk({ type: 'text', text: cached.response });
      onChunk({
        type: 'complete',
        response: {
          textResponse: cached.response,
          operations: cached.operations,
          usage: { inputTokens: 0, outputTokens: 0 },
          cacheHit: true,
          model: this.config.model,
          responseId: 'agentdb-cached',
        },
      });
      return;
    }

    // Build system prompt (strip cache_control - not supported)
    const systemPrompt = this.promptBuilder.buildSystemPrompt(
      request.canvasState,
      request.chatHistory
    );

    // Combine all sections into single system message (no cache_control)
    const systemContent = systemPrompt.sections.map(s => s.text).join('\n\n');

    // Create streaming request
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: request.message },
      ],
    });

    // Buffer full response
    let fullText = '';
    let emittedBlockCount = 0; // Track how many blocks we've already emitted
    let emittedTextLength = 0; // Track how much text we've already emitted
    let promptTokens = 0;
    let completionTokens = 0;

    // Stream chunks - CR-034: emit complete operations blocks immediately
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Track usage if available
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens || 0;
        completionTokens = chunk.usage.completion_tokens || 0;
      }

      if (delta?.content) {
        const textChunk = delta.content;
        fullText += textChunk;

        // Check for NEW complete operations blocks
        const completeBlocks = this.responseParser.extractAllCompleteBlocks(fullText);

        // Emit any new complete blocks as 'content' chunks
        while (emittedBlockCount < completeBlocks.length) {
          const newBlock = completeBlocks[emittedBlockCount];
          onChunk({ type: 'content', text: newBlock });
          emittedBlockCount++;
        }

        // Emit text that's NOT inside an operations block
        const isCurrentlyInside = this.isInsideOperationsBlock(fullText);
        if (!isCurrentlyInside && !textChunk.includes('<operations')) {
          // Emit the chunk as text (it's outside any operations block)
          onChunk({ type: 'text', text: textChunk });
          emittedTextLength += textChunk.length;
        }
      }
    }

    // Parse complete response
    const parsed = this.responseParser.parseResponse(fullText);

    // Build final response
    const llmResponse: LLMResponse = {
      textResponse: parsed.textResponse,
      operations: parsed.operations,
      usage: {
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        // No cache metrics for OpenAI-compatible APIs
      },
      cacheHit: false,
      model: this.config.model,
      responseId: `openai-${Date.now()}`,
    };

    // Log usage
    log(`📊 OpenAI Usage: Input: ${promptTokens}, Output: ${completionTokens}`);

    // Store in AgentDB
    try {
      const agentdb = await getUnifiedAgentDBService(request.workspaceId, request.systemId);
      const graphVersion = agentdb.getGraphVersion();
      await agentdb.cacheResponse(request.message, graphVersion, parsed.textResponse, parsed.operations);

      await agentdb.storeEpisode(
        'openai-engine',
        request.message,
        parsed.operations !== null,
        { operations: parsed.operations, textResponse: parsed.textResponse },
        'OpenAI request processed'
      );
    } catch (error) {
      log(`⚠️ AgentDB storage failed: ${error}`);
    }

    onChunk({ type: 'complete', response: llmResponse });
  }

  /**
   * Check if inside operations block
   */
  private isInsideOperationsBlock(text: string): boolean {
    const openMatches = text.match(/<operations>/gi);
    const closeMatches = text.match(/<\/operations>/gi);
    return (openMatches?.length || 0) > (closeMatches?.length || 0);
  }

  /**
   * Find the end position of the last complete operations block (CR-034)
   */
  private findLastBlockEnd(text: string): number {
    const regex = /<\/operations>/gi;
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      lastMatch = match;
    }

    if (lastMatch) {
      return lastMatch.index + lastMatch[0].length;
    }
    return 0;
  }

  /**
   * Get configuration
   */
  getConfig(): LLMEngineConfig {
    return this.config;
  }

  /**
   * Get AgentDB metrics
   */
  async getAgentDBMetrics(workspaceId: string, systemId: string) {
    const agentdb = await getUnifiedAgentDBService(workspaceId, systemId);
    return agentdb.getMetrics();
  }

  /**
   * Cleanup AgentDB cache
   */
  async cleanupAgentDBCache(workspaceId: string, systemId: string) {
    const agentdb = await getUnifiedAgentDBService(workspaceId, systemId);
    await agentdb.cleanup();
    log('🧹 AgentDB cache cleanup completed');
  }
}
