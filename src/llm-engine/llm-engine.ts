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
import { getUnifiedAgentDBService } from './agentdb/unified-agentdb-service.js';
import {
  GRAPH_QUERY_TOOL,
  createAgentDBQueryTool,
  QueryInput,
} from './tools/agentdb-query-tool.js';

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
    // Check AgentDB cache first (semantic similarity + graph version)
    let cached = null;
    try {
      const agentdb = await getUnifiedAgentDBService(request.workspaceId, request.systemId);
      const graphVersion = agentdb.getGraphVersion();
      cached = await agentdb.checkCache(request.message, graphVersion);
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

    // Initialize tool handler
    const agentdb = await getUnifiedAgentDBService(request.workspaceId, request.systemId);
    const queryTool = createAgentDBQueryTool(agentdb);

    // Build messages array (will be extended with tool results in loop)
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: request.message,
      },
    ];

    // Tool use loop - continue until no more tool calls
    let fullText = '';
    let finalMessage: Anthropic.Message | null = null;
    let toolUseCount = 0;
    const MAX_TOOL_ITERATIONS = 5;

    while (toolUseCount < MAX_TOOL_ITERATIONS) {
      // Create streaming request with tools
      const stream = await this.client.messages.stream({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: systemSections,
        messages,
        tools: [GRAPH_QUERY_TOOL],
      });

      // Buffer this iteration's response
      let iterationText = '';
      let wasInsideOperations = false;
      const toolUseBlocks: Array<{ id: string; name: string; input: unknown }> = [];
      let currentToolUse: { id: string; name: string; input: string } | null = null;

      // Stream chunks
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            };
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const textChunk = event.delta.text;
            const previousText = iterationText;
            iterationText += textChunk;

            const isNowInside = this.isInsideOperationsBlock(fullText + iterationText);

            // Only emit if we're not inside operations block
            if (!isNowInside && !wasInsideOperations) {
              onChunk({ type: 'text', text: textChunk });
            } else if (isNowInside && !wasInsideOperations) {
              const operationsStart = (fullText + iterationText).lastIndexOf('<operations>');
              const textBeforeOpsEndIdx = operationsStart - (fullText + previousText).length;
              if (textBeforeOpsEndIdx > 0) {
                const textBeforeOps = textChunk.substring(0, textBeforeOpsEndIdx);
                if (textBeforeOps) {
                  onChunk({ type: 'text', text: textBeforeOps });
                }
              }
            }

            wasInsideOperations = isNowInside;
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.input += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try {
              const parsedInput = JSON.parse(currentToolUse.input || '{}');
              toolUseBlocks.push({
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: parsedInput,
              });
            } catch (e) {
              log(`⚠️ Failed to parse tool input: ${currentToolUse.input}`);
            }
            currentToolUse = null;
          }
        }
      }

      // Get final message
      finalMessage = await stream.finalMessage();
      fullText += iterationText;

      // Check if we need to handle tool use
      if (finalMessage.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
        toolUseCount++;
        log(`🔧 Tool use iteration ${toolUseCount}: ${toolUseBlocks.map((t) => t.name).join(', ')}`);

        // Add assistant message with tool use to conversation
        messages.push({
          role: 'assistant',
          content: finalMessage.content,
        });

        // Execute tools and add results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          if (toolUse.name === 'graph_query') {
            const result = await queryTool.execute(toolUse.input as QueryInput);
            log(`📊 graph_query result: ${result.queryType} - ${result.count ?? 0} items, ${result.issues?.length ?? 0} issues`);
            toolResults.push(queryTool.toToolResult(toolUse.id, result));
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Unknown tool: ${toolUse.name}`,
              is_error: true,
            });
          }
        }

        // Add tool results to conversation
        messages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue loop to get next response
        continue;
      }

      // No more tool use - exit loop
      break;
    }

    if (!finalMessage) {
      throw new Error('No response received from LLM');
    }

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

    // Store in AgentDB for future cache hits (version-aware)
    try {
      const graphVersion = agentdb.getGraphVersion();
      await agentdb.cacheResponse(request.message, graphVersion, parsed.textResponse, parsed.operations);
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
   * Get AgentDB cache metrics for a workspace/system
   */
  async getAgentDBMetrics(workspaceId: string, systemId: string) {
    const agentdb = await getUnifiedAgentDBService(workspaceId, systemId);
    return agentdb.getMetrics();
  }

  /**
   * Cleanup expired AgentDB cache entries for a workspace/system
   */
  async cleanupAgentDBCache(workspaceId: string, systemId: string) {
    const agentdb = await getUnifiedAgentDBService(workspaceId, systemId);
    await agentdb.cleanup();
    log('🧹 AgentDB cache cleanup completed');
  }
}
