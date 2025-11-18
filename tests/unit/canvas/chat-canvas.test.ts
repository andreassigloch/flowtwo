/**
 * Chat Canvas - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate Chat Canvas state management
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChatCanvas } from '../../../src/canvas/chat-canvas.js';
import { GraphCanvas } from '../../../src/canvas/graph-canvas.js';
import { FormatEDiff } from '../../../src/shared/types/canvas.js';

describe('ChatCanvas', () => {
  let chatCanvas: ChatCanvas;
  let graphCanvas: GraphCanvas;

  beforeEach(() => {
    graphCanvas = new GraphCanvas('test-ws', 'TestSystem.SY.001', 'chat-001', 'user-001');
    chatCanvas = new ChatCanvas('test-ws', 'TestSystem.SY.001', 'chat-001', 'user-001', graphCanvas);
  });

  describe('initialization', () => {
    it('should initialize with empty message list', () => {
      const state = chatCanvas.getState();

      expect(state.messages.length).toBe(0);
      expect(state.chatId).toBe('chat-001');
      expect(state.workspaceId).toBe('test-ws');
      expect(state.systemId).toBe('TestSystem.SY.001');
    });

    it('should initialize without Graph Canvas', () => {
      const standalone = new ChatCanvas('test-ws', 'TestSystem.SY.001', 'chat-002', 'user-001');
      const state = standalone.getState();

      expect(state.messages.length).toBe(0);
    });
  });

  describe('user messages', () => {
    it('should add user message', async () => {
      const message = await chatCanvas.addUserMessage('Hello, add a function');

      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, add a function');
      expect(message.chatId).toBe('chat-001');
      expect(message.messageId).toBeDefined();
      expect(message.timestamp).toBeInstanceOf(Date);
    });

    it('should store user message in state', async () => {
      await chatCanvas.addUserMessage('Test message');

      const state = chatCanvas.getState();
      expect(state.messages.length).toBe(1);
      expect(state.messages[0].content).toBe('Test message');
    });

    it('should track dirty message after add', async () => {
      const message = await chatCanvas.addUserMessage('Test');

      const state = chatCanvas.getState();
      expect(state.dirtyMessageIds.has(message.messageId)).toBe(true);
    });
  });

  describe('assistant messages', () => {
    it('should add assistant message without operations', async () => {
      const message = await chatCanvas.addAssistantMessage('I will help you');

      expect(message.role).toBe('assistant');
      expect(message.content).toBe('I will help you');
      expect(message.operations).toBeUndefined();
    });

    it('should add assistant message with operations', async () => {
      const operations = `<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>
## Nodes
+ NewNode|FUNC|NewNode.FN.001|New function
</operations>`;

      const message = await chatCanvas.addAssistantMessage(
        'I added a new function',
        operations
      );

      expect(message.role).toBe('assistant');
      expect(message.operations).toBe(operations);
    });

    it('should forward operations to Graph Canvas', async () => {
      const operations = `<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>
## Nodes
+ NewNode|FUNC|NewNode.FN.001|New function [x:100,y:200]
</operations>`;

      await chatCanvas.addAssistantMessage('I added a function', operations);

      // Check that Graph Canvas received the operation
      const graphState = graphCanvas.getState();
      expect(graphState.nodes.size).toBe(1);
      expect(graphState.nodes.has('NewNode.FN.001')).toBe(true);
    });

    it('should handle missing Graph Canvas gracefully', async () => {
      const standalone = new ChatCanvas('test-ws', 'TestSystem.SY.001', 'chat-002', 'user-001');

      const operations = `<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>
## Nodes
+ NewNode|FUNC|NewNode.FN.001|New
</operations>`;

      // Should not throw
      await expect(
        standalone.addAssistantMessage('Test', operations)
      ).resolves.toBeDefined();
    });
  });

  describe('system messages', () => {
    it('should add system message', async () => {
      const message = await chatCanvas.addSystemMessage('System initialized');

      expect(message.role).toBe('system');
      expect(message.content).toBe('System initialized');
    });
  });

  describe('message retrieval', () => {
    beforeEach(async () => {
      await chatCanvas.addUserMessage('User message 1');
      await chatCanvas.addAssistantMessage('Assistant response 1');
      await chatCanvas.addSystemMessage('System message 1');
      await chatCanvas.addUserMessage('User message 2');
      await chatCanvas.addAssistantMessage('Assistant response 2');
    });

    it('should get all messages', () => {
      const messages = chatCanvas.getAllMessages();
      expect(messages.length).toBe(5);
    });

    it('should get messages by role - user', () => {
      const messages = chatCanvas.getMessagesByRole('user');
      expect(messages.length).toBe(2);
      expect(messages.every((m) => m.role === 'user')).toBe(true);
    });

    it('should get messages by role - assistant', () => {
      const messages = chatCanvas.getMessagesByRole('assistant');
      expect(messages.length).toBe(2);
      expect(messages.every((m) => m.role === 'assistant')).toBe(true);
    });

    it('should get messages by role - system', () => {
      const messages = chatCanvas.getMessagesByRole('system');
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('System message 1');
    });

    it('should get message by ID', async () => {
      const added = await chatCanvas.addUserMessage('Find me');
      const found = chatCanvas.getMessage(added.messageId);

      expect(found).toBeDefined();
      expect(found?.messageId).toBe(added.messageId);
      expect(found?.content).toBe('Find me');
    });

    it('should return undefined for non-existent message', () => {
      const found = chatCanvas.getMessage('non-existent-id');
      expect(found).toBeUndefined();
    });

    it('should get conversation context (last N messages)', () => {
      const context = chatCanvas.getConversationContext(3);

      expect(context.length).toBe(3);
      expect(context[0].content).toBe('System message 1');
      expect(context[1].content).toBe('User message 2');
      expect(context[2].content).toBe('Assistant response 2');
    });

    it('should get all messages when limit exceeds count', () => {
      const context = chatCanvas.getConversationContext(100);
      expect(context.length).toBe(5);
    });
  });

  describe('clear messages', () => {
    it('should clear all messages', async () => {
      await chatCanvas.addUserMessage('Message 1');
      await chatCanvas.addUserMessage('Message 2');

      expect(chatCanvas.getAllMessages().length).toBe(2);

      chatCanvas.clearMessages();

      expect(chatCanvas.getAllMessages().length).toBe(0);
    });

    it('should clear dirty tracking when clearing messages', async () => {
      await chatCanvas.addUserMessage('Message 1');

      const stateBefore = chatCanvas.getState();
      expect(stateBefore.dirtyMessageIds.size).toBeGreaterThan(0);

      chatCanvas.clearMessages();

      const stateAfter = chatCanvas.getState();
      expect(stateAfter.dirtyMessageIds.size).toBe(0);
    });
  });

  describe('Graph Canvas linking', () => {
    it('should link Graph Canvas after creation', () => {
      const standalone = new ChatCanvas('test-ws', 'TestSystem.SY.001', 'chat-002', 'user-001');
      const newGraphCanvas = new GraphCanvas('test-ws', 'TestSystem.SY.001', 'chat-002', 'user-001');

      standalone.linkGraphCanvas(newGraphCanvas);

      // Should not throw when forwarding operations
      expect(async () => {
        await standalone.addAssistantMessage('Test', '<operations></operations>');
      }).not.toThrow();
    });
  });

  describe('validation', () => {
    it('should validate message role', async () => {
      const diff: FormatEDiff = {
        baseSnapshot: 'chat-001@msgCount:0',
        operations: [
          {
            type: 'add_message',
            semanticId: 'msg-1',
            message: {
              messageId: 'msg-1',
              chatId: 'chat-001',
              role: 'invalid' as any,
              content: 'Test',
              timestamp: new Date(),
            },
          },
        ],
      };

      const result = await chatCanvas.applyDiff(diff);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes('Invalid message role'))).toBe(true);
    });

    it('should validate empty message content', async () => {
      const diff: FormatEDiff = {
        baseSnapshot: 'chat-001@msgCount:0',
        operations: [
          {
            type: 'add_message',
            semanticId: 'msg-1',
            message: {
              messageId: 'msg-1',
              chatId: 'chat-001',
              role: 'user',
              content: '   ', // Empty/whitespace
              timestamp: new Date(),
            },
          },
        ],
      };

      const result = await chatCanvas.applyDiff(diff);

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes('content cannot be empty'))).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should serialize dirty state as diff', async () => {
      await chatCanvas.addUserMessage('Test message');

      const diff = chatCanvas['serializeDirtyAsDiff']();

      expect(diff).toContain('<operations>');
      expect(diff).toContain('chat-001@msgCount:1');
    });

    it('should clear dirty tracking after persist', async () => {
      await chatCanvas.addUserMessage('Test');

      const stateBefore = chatCanvas.getState();
      expect(stateBefore.dirtyMessageIds.size).toBeGreaterThan(0);

      await chatCanvas.persistToNeo4j();

      const stateAfter = chatCanvas.getState();
      expect(stateAfter.dirtyMessageIds.size).toBe(0);
    });
  });

  describe('integration with Graph Canvas', () => {
    it('should handle complete conversation flow', async () => {
      // User asks to add a node
      await chatCanvas.addUserMessage('Add a payment processing function');

      // LLM responds with operations
      const operations = `<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>
## Nodes
+ ProcessPayment|FUNC|ProcessPayment.FN.001|Process payment [x:100,y:200]
## Edges
+ TestSystem.SY.001 -cp-> ProcessPayment.FN.001
</operations>`;

      await chatCanvas.addAssistantMessage(
        'I added a ProcessPayment function',
        operations
      );

      // Verify chat state
      const chatState = chatCanvas.getState();
      expect(chatState.messages.length).toBe(2);
      expect(chatState.messages[0].role).toBe('user');
      expect(chatState.messages[1].role).toBe('assistant');
      expect(chatState.messages[1].operations).toBe(operations);

      // Verify graph state updated
      const graphState = graphCanvas.getState();
      expect(graphState.nodes.size).toBe(1);
      expect(graphState.nodes.has('ProcessPayment.FN.001')).toBe(true);
      expect(graphState.edges.size).toBe(1);
    });
  });
});
