/**
 * Chat Canvas - State Manager for Conversation
 *
 * Manages chat state (messages, LLM responses) and forwards graph operations
 * to StatelessGraphCanvas (via AgentDB)
 *
 * CR-032: Refactored to use StatelessGraphCanvas
 *
 * @author andreas@siglochconsulting
 * @version 3.0.0
 */

import { EventEmitter } from 'events';
import { StatelessGraphCanvas } from './stateless-graph-canvas.js';
import { Message, Operation, ChatCanvasState, FormatEDiff, PersistResult } from '../shared/types/canvas.js';
import { FormatEParser } from '../shared/parsers/format-e-parser.js';
import { IFormatEParser } from '../shared/types/format-e.js';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';

/**
 * Chat Canvas Implementation
 *
 * Manages:
 * - Message collection (user, assistant, system)
 * - LLM response streaming
 * - Extraction of graph operations from LLM responses
 * - Forwarding operations to StatelessGraphCanvas (-> AgentDB)
 *
 * TEST: tests/unit/canvas/chat-canvas.test.ts
 */
/**
 * Validation summary from background validation
 * CR-039: ChatCanvas receives validation feedback for LLM context
 */
export interface ValidationSummary {
  violationCount: number;
  rewardScore: number;
  phaseGateReady: boolean;
  timestamp: Date;
}

export class ChatCanvas extends EventEmitter {
  private state: ChatCanvasState;
  private graphCanvas?: StatelessGraphCanvas;
  private neo4jClient?: Neo4jClient;
  private parser: IFormatEParser;

  // CR-039: Validation results for LLM context
  private validationSummary?: ValidationSummary;

  // Metadata
  private readonly workspaceId: string;
  private readonly systemId: string;
  private readonly chatId: string;
  private readonly userId: string;

  constructor(
    workspaceId: string,
    systemId: string,
    chatId: string,
    userId: string,
    graphCanvas?: StatelessGraphCanvas,
    neo4jClient?: Neo4jClient
  ) {
    super();
    this.parser = new FormatEParser();
    this.neo4jClient = neo4jClient;
    this.workspaceId = workspaceId;
    this.systemId = systemId;
    this.chatId = chatId;
    this.userId = userId;

    this.state = {
      chatId,
      workspaceId,
      systemId,
      messages: [],
      dirtyMessageIds: new Set(),
      createdAt: new Date(),
      lastModified: new Date(),
    };

    this.graphCanvas = graphCanvas;
  }

  /**
   * Get current chat state (read-only)
   */
  getState(): Readonly<ChatCanvasState> {
    return this.state;
  }

  /**
   * Link to StatelessGraphCanvas for forwarding operations
   */
  linkGraphCanvas(graphCanvas: StatelessGraphCanvas): void {
    this.graphCanvas = graphCanvas;
  }

  /**
   * Add user message
   */
  async addUserMessage(content: string): Promise<Message> {
    const message: Message = {
      messageId: `msg-${Date.now()}-${Math.random()}`,
      chatId: this.chatId,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    this.state.messages.push(message);
    this.state.dirtyMessageIds.add(message.messageId);
    this.state.lastModified = new Date();

    return message;
  }

  /**
   * Add assistant message (from LLM)
   *
   * If message contains operations, extract and forward to Graph Canvas
   */
  async addAssistantMessage(content: string, operations?: string): Promise<Message> {
    const message: Message = {
      messageId: `msg-${Date.now()}-${Math.random()}`,
      chatId: this.chatId,
      role: 'assistant',
      content,
      operations,
      timestamp: new Date(),
    };

    this.state.messages.push(message);
    this.state.dirtyMessageIds.add(message.messageId);
    this.state.lastModified = new Date();

    // If operations present, forward to Graph Canvas (-> AgentDB)
    if (operations && this.graphCanvas) {
      await this.forwardOperationsToGraph(operations);
    }

    return message;
  }

  /**
   * Add system message
   */
  async addSystemMessage(content: string): Promise<Message> {
    const message: Message = {
      messageId: `msg-${Date.now()}-${Math.random()}`,
      chatId: this.chatId,
      role: 'system',
      content,
      timestamp: new Date(),
    };

    this.state.messages.push(message);
    this.state.dirtyMessageIds.add(message.messageId);
    this.state.lastModified = new Date();

    return message;
  }

  /**
   * Get all messages
   */
  getAllMessages(): Message[] {
    return [...this.state.messages];
  }

  /**
   * Get messages by role
   */
  getMessagesByRole(role: 'user' | 'assistant' | 'system'): Message[] {
    return this.state.messages.filter((m) => m.role === role);
  }

  /**
   * Get message by ID
   */
  getMessage(messageId: string): Message | undefined {
    return this.state.messages.find((m) => m.messageId === messageId);
  }

  /**
   * Get conversation context (last N messages)
   */
  getConversationContext(limit: number = 10): Message[] {
    return this.state.messages.slice(-limit);
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.state.messages = [];
    this.state.dirtyMessageIds.clear();
    this.state.lastModified = new Date();
  }

  /**
   * Forward graph operations to StatelessGraphCanvas (-> AgentDB)
   *
   * Extracts operations from LLM response and applies to graph state
   */
  private async forwardOperationsToGraph(operationsStr: string): Promise<void> {
    if (!this.graphCanvas) {
      console.warn('Graph Canvas not linked - cannot forward operations');
      return;
    }

    try {
      // Parse operations
      const diff = this.parser.parseDiff(operationsStr);

      // Apply to StatelessGraphCanvas (delegates to AgentDB)
      await this.graphCanvas.applyDiff(diff);
    } catch (error) {
      console.error('Failed to forward operations to Graph Canvas:', error);
      throw error;
    }
  }

  /**
   * Apply Format E Diff to chat state
   */
  async applyDiff(diff: FormatEDiff): Promise<{ success: boolean; errors?: string[] }> {
    const errors: string[] = [];

    for (const op of diff.operations) {
      try {
        await this.applyOperation(op);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true };
  }

  /**
   * Apply operation to chat state
   */
  private async applyOperation(op: Operation): Promise<void> {
    switch (op.type) {
      case 'add_message':
        if (op.message) {
          this.state.messages.push(op.message);
          this.state.dirtyMessageIds.add(op.message.messageId);
        }
        break;

      case 'remove_message':
        const index = this.state.messages.findIndex((m) => m.messageId === op.semanticId);
        if (index !== -1) {
          this.state.messages.splice(index, 1);
          this.state.dirtyMessageIds.add(op.semanticId);
        }
        break;
    }

    this.state.lastModified = new Date();
  }

  /**
   * Persist dirty messages to Neo4j
   */
  async persistToNeo4j(): Promise<PersistResult> {
    if (!this.neo4jClient) {
      return { success: false, errors: ['Neo4jClient not configured'] };
    }

    if (this.state.dirtyMessageIds.size === 0) {
      return { success: true, savedCount: 0, skipped: true };
    }

    try {
      const messages: Message[] = [];
      for (const messageId of this.state.dirtyMessageIds) {
        const message = this.state.messages.find((m) => m.messageId === messageId);
        if (message) {
          messages.push(message);
        }
      }

      if (messages.length > 0) {
        await this.neo4jClient.saveMessages(messages);
      }

      // Clear dirty tracking
      this.state.dirtyMessageIds.clear();

      return { success: true, savedCount: messages.length };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  // Metadata accessors
  getWorkspaceId(): string {
    return this.workspaceId;
  }

  getSystemId(): string {
    return this.systemId;
  }

  getChatId(): string {
    return this.chatId;
  }

  getUserId(): string {
    return this.userId;
  }

  /**
   * CR-039: Set validation summary from background validation
   * Called by chat-interface when validation completes
   */
  setValidationSummary(summary: ValidationSummary): void {
    this.validationSummary = summary;
    this.emit('validation_update', summary);
  }

  /**
   * CR-039: Get current validation summary for LLM context
   */
  getValidationSummary(): ValidationSummary | undefined {
    return this.validationSummary;
  }

  /**
   * CR-039: Get validation context string for LLM prompts
   * Returns formatted string to inject into LLM context
   */
  getValidationContextForLLM(): string | undefined {
    if (!this.validationSummary) {
      return undefined;
    }

    const { violationCount, rewardScore, phaseGateReady } = this.validationSummary;

    if (violationCount === 0) {
      return `[Architecture Status: ✅ Clean - No violations, score: ${(rewardScore * 100).toFixed(0)}%, phase gate: ${phaseGateReady ? 'ready' : 'not ready'}]`;
    }

    return `[Architecture Status: ⚠️ ${violationCount} violation(s) detected, score: ${(rewardScore * 100).toFixed(0)}%, phase gate: ${phaseGateReady ? 'ready' : 'not ready'}]`;
  }
}
