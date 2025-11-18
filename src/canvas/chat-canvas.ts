/**
 * Chat Canvas - State Manager for Conversation
 *
 * Manages chat state (messages, LLM responses) and forwards graph operations
 * to Graph Canvas
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { CanvasBase } from './canvas-base.js';
import { GraphCanvas } from './graph-canvas.js';
import { Message, Operation, ChatCanvasState } from '../shared/types/canvas.js';
import { FormatEParser } from '../shared/parsers/format-e-parser.js';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';

/**
 * Chat Canvas Implementation
 *
 * Manages:
 * - Message collection (user, assistant, system)
 * - LLM response streaming
 * - Extraction of graph operations from LLM responses
 * - Forwarding operations to Graph Canvas
 * - Dirty tracking for message persistence
 *
 * TEST: tests/unit/canvas/chat-canvas.test.ts
 */
export class ChatCanvas extends CanvasBase {
  private state: ChatCanvasState;
  private graphCanvas?: GraphCanvas;
  private neo4jClient?: Neo4jClient;

  constructor(
    workspaceId: string,
    systemId: string,
    chatId: string,
    userId: string,
    graphCanvas?: GraphCanvas,
    neo4jClient?: Neo4jClient
  ) {
    const parser = new FormatEParser();
    super(workspaceId, systemId, chatId, userId, parser);
    this.neo4jClient = neo4jClient;

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
   * Link to Graph Canvas for forwarding operations
   */
  linkGraphCanvas(graphCanvas: GraphCanvas): void {
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
    this.markDirty([message.messageId]); // Update base class dirty tracking
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
    this.markDirty([message.messageId]); // Update base class dirty tracking
    this.state.lastModified = new Date();

    // If operations present, forward to Graph Canvas
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
    this.markDirty([message.messageId]); // Update base class dirty tracking
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
   * Forward graph operations to Graph Canvas
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

      // Apply to Graph Canvas
      await this.graphCanvas.applyDiff(diff);
    } catch (error) {
      console.error('Failed to forward operations to Graph Canvas:', error);
      throw error;
    }
  }

  /**
   * Apply operation to chat state
   *
   * SPEC: FR-4.1 (Canvas state management)
   */
  protected async applyOperation(op: Operation): Promise<void> {
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
   * Get dirty items for persistence
   */
  protected getDirtyItems(): Message[] {
    const items: Message[] = [];

    for (const messageId of this.state.dirtyMessageIds) {
      const message = this.state.messages.find((m) => m.messageId === messageId);
      if (message) {
        items.push(message);
      }
    }

    return items;
  }

  /**
   * Serialize dirty state as Format E Diff
   */
  protected serializeDirtyAsDiff(): string {
    const operations: Operation[] = [];

    for (const messageId of this.state.dirtyMessageIds) {
      const message = this.state.messages.find((m) => m.messageId === messageId);
      if (message) {
        operations.push({
          type: 'add_message',
          semanticId: messageId,
          message,
        });
      }
    }

    return this.parser.serializeDiff({
      baseSnapshot: `${this.chatId}@msgCount:${this.state.messages.length}`,
      operations,
    });
  }

  /**
   * Validate diff before application
   */
  protected validateDiff(diff: any): {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  } {
    const errors: string[] = [];

    // Check base snapshot
    if (!diff.baseSnapshot) {
      errors.push('Missing base snapshot');
    }

    // Validate operations
    for (const op of diff.operations || []) {
      if (!op.type) {
        errors.push('Operation missing type');
      }

      if (op.type === 'add_message') {
        if (!op.message) {
          errors.push('add_message operation missing message data');
        } else {
          // Validate role
          const validRoles = ['user', 'assistant', 'system'];
          if (!validRoles.includes(op.message.role)) {
            errors.push(`Invalid message role: ${op.message.role}`);
          }

          // Validate content
          if (!op.message.content || op.message.content.trim() === '') {
            errors.push('Message content cannot be empty');
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear subclass dirty tracking
   */
  protected clearSubclassDirtyTracking(): void {
    this.state.dirtyMessageIds.clear();
  }

  /**
   * Save batch to Neo4j
   */
  protected async saveBatch(items: unknown[]): Promise<void> {
    if (!this.neo4jClient) {
      console.log(`Saving ${items.length} messages to Neo4j (mock - no client)`);
      return;
    }

    const messages: Message[] = [];

    for (const messageId of items) {
      const message = this.state.messages.find((m) => m.messageId === messageId);
      if (message) {
        messages.push(message);
      }
    }

    if (messages.length > 0) {
      await this.neo4jClient.saveMessages(messages);
    }
  }

  /**
   * Create audit log
   */
  protected async createAuditLog(log: {
    chatId: string;
    diff: string;
    action: string;
  }): Promise<void> {
    if (!this.neo4jClient) {
      console.log('Creating chat audit log (mock - no client):', log);
      return;
    }

    await this.neo4jClient.createAuditLog({
      chatId: log.chatId,
      workspaceId: this.workspaceId,
      systemId: this.systemId,
      userId: this.userId,
      action: log.action as any,
      diff: log.diff,
    });
  }
}
