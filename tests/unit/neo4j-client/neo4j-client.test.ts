/**
 * Neo4j Client - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate Neo4j client operations (mocked)
 *
 * NOTE: These tests use mocked Neo4j driver
 *       For real database testing, use integration tests
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Neo4jClient } from '../../../src/neo4j-client/neo4j-client.js';
import type { Node, Edge, Message } from '../../../src/shared/types/ontology.js';

// Mock neo4j-driver
vi.mock('neo4j-driver', () => {
  const mockSession = {
    run: vi.fn(),
    close: vi.fn(),
  };

  const mockDriver = {
    session: vi.fn(() => mockSession),
    close: vi.fn(),
  };

  return {
    default: {
      driver: vi.fn(() => mockDriver),
      auth: {
        basic: vi.fn((user, password) => ({ user, password })),
      },
    },
  };
});

describe('Neo4jClient', () => {
  let client: Neo4jClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new Neo4jClient({
      uri: 'bolt://localhost:7687',
      user: 'neo4j',
      password: 'test',
    });
  });

  describe('saveNodes', () => {
    it('should save nodes in batch', async () => {
      const nodes: Node[] = [
        {
          uuid: 'node-001',
          semanticId: 'TestNode.FN.001',
          type: 'FUNC',
          name: 'TestNode',
          description: 'Test node',
          workspaceId: 'ws-001',
          systemId: 'System.SY.001',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
        },
      ];

      // Mock successful save
      const mockRun = vi.fn().mockResolvedValue({
        records: [{ get: () => ({ toNumber: () => 1 }) }],
      });
      (client as any).getSession = () => ({
        run: mockRun,
        close: vi.fn(),
      });

      const result = await client.saveNodes(nodes);

      expect(result.success).toBe(true);
      expect(result.nodeCount).toBe(1);
      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Node'),
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              uuid: 'node-001',
              semanticId: 'TestNode.FN.001',
            }),
          ]),
        })
      );
    });

    it('should handle save errors', async () => {
      const nodes: Node[] = [
        {
          uuid: 'node-001',
          semanticId: 'TestNode.FN.001',
          type: 'FUNC',
          name: 'TestNode',
          workspaceId: 'ws-001',
          systemId: 'System.SY.001',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
        },
      ];

      // Mock error
      const mockRun = vi.fn().mockRejectedValue(new Error('Database error'));
      (client as any).getSession = () => ({
        run: mockRun,
        close: vi.fn(),
      });

      const result = await client.saveNodes(nodes);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Database error');
    });
  });

  describe('saveEdges', () => {
    it('should save edges in batch', async () => {
      const edges: Edge[] = [
        {
          uuid: 'edge-001',
          semanticId: 'Edge.E.001',
          type: 'compose',
          sourceId: 'Source.FN.001',
          targetId: 'Target.FN.002',
          workspaceId: 'ws-001',
          systemId: 'System.SY.001',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
        },
      ];

      // Mock successful save
      const mockRun = vi.fn().mockResolvedValue({
        records: [{ get: () => ({ toNumber: () => 1 }) }],
      });
      (client as any).getSession = () => ({
        run: mockRun,
        close: vi.fn(),
      });

      const result = await client.saveEdges(edges);

      expect(result.success).toBe(true);
      expect(result.edgeCount).toBe(1);
      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (source)-[r:EDGE'),
        expect.objectContaining({
          edges: expect.arrayContaining([
            expect.objectContaining({
              uuid: 'edge-001',
              semanticId: 'Edge.E.001',
            }),
          ]),
        })
      );
    });
  });

  describe('saveMessages', () => {
    it('should save messages in batch', async () => {
      const messages: Message[] = [
        {
          messageId: 'msg-001',
          chatId: 'chat-001',
          workspaceId: 'ws-001',
          systemId: 'System.SY.001',
          userId: 'user-001',
          role: 'user',
          content: 'Test message',
          timestamp: new Date(),
        },
      ];

      // Mock successful save
      const mockRun = vi.fn().mockResolvedValue({
        records: [{ get: () => ({ toNumber: () => 1 }) }],
      });
      (client as any).getSession = () => ({
        run: mockRun,
        close: vi.fn(),
      });

      const result = await client.saveMessages(messages);

      expect(result.success).toBe(true);
      expect(result.messageCount).toBe(1);
      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (m:Message'),
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              messageId: 'msg-001',
              chatId: 'chat-001',
            }),
          ]),
        })
      );
    });
  });

  describe('loadGraph', () => {
    it('should load graph from database', async () => {
      // Mock node and edge queries
      const mockRun = vi
        .fn()
        .mockResolvedValueOnce({
          // Nodes
          records: [
            {
              get: () => ({
                properties: {
                  uuid: 'node-001',
                  semanticId: 'TestNode.FN.001',
                  type: 'FUNC',
                  name: 'TestNode',
                  workspaceId: 'ws-001',
                  systemId: 'System.SY.001',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'test-user',
                },
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          // Edges
          records: [
            {
              get: (key: string) => {
                if (key === 'r') {
                  return {
                    properties: {
                      uuid: 'edge-001',
                      semanticId: 'Edge.E.001',
                      type: 'compose',
                      workspaceId: 'ws-001',
                      systemId: 'System.SY.001',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      createdBy: 'test-user',
                    },
                  };
                }
                if (key === 'sourceId') return 'Source.FN.001';
                if (key === 'targetId') return 'Target.FN.002';
              },
            },
          ],
        });

      (client as any).getSession = () => ({
        run: mockRun,
        close: vi.fn(),
      });

      const result = await client.loadGraph({
        workspaceId: 'ws-001',
        systemId: 'System.SY.001',
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(1);
      expect(result.nodes[0].semanticId).toBe('TestNode.FN.001');
      expect(result.edges[0].semanticId).toBe('Edge.E.001');
    });
  });

  describe('loadMessages', () => {
    it('should load messages from database', async () => {
      // Mock message query
      const mockRun = vi.fn().mockResolvedValue({
        records: [
          {
            get: () => ({
              properties: {
                messageId: 'msg-001',
                chatId: 'chat-001',
                workspaceId: 'ws-001',
                systemId: 'System.SY.001',
                userId: 'user-001',
                role: 'user',
                content: 'Test message',
                timestamp: new Date().toISOString(),
              },
            }),
          },
        ],
      });

      (client as any).getSession = () => ({
        run: mockRun,
        close: vi.fn(),
      });

      const result = await client.loadMessages({
        chatId: 'chat-001',
        workspaceId: 'ws-001',
        systemId: 'System.SY.001',
      });

      expect(result).toHaveLength(1);
      expect(result[0].messageId).toBe('msg-001');
      expect(result[0].content).toBe('Test message');
    });
  });

  describe('createAuditLog', () => {
    it('should create audit log entry', async () => {
      const mockRun = vi.fn().mockResolvedValue({});
      (client as any).getSession = () => ({
        run: mockRun,
        close: vi.fn(),
      });

      await client.createAuditLog({
        chatId: 'chat-001',
        workspaceId: 'ws-001',
        systemId: 'System.SY.001',
        userId: 'user-001',
        action: 'create',
        diff: '<operations>...</operations>',
      });

      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (a:AuditLog'),
        expect.objectContaining({
          chatId: 'chat-001',
          workspaceId: 'ws-001',
        })
      );
    });
  });

  describe('verifyConnection', () => {
    it('should verify successful connection', async () => {
      const mockRun = vi.fn().mockResolvedValue({});
      (client as any).getSession = () => ({
        run: mockRun,
        close: vi.fn(),
      });

      const result = await client.verifyConnection();

      expect(result).toBe(true);
      expect(mockRun).toHaveBeenCalledWith('RETURN 1');
    });

    it('should handle connection failure', async () => {
      const mockRun = vi.fn().mockRejectedValue(new Error('Connection failed'));
      (client as any).getSession = () => ({
        run: mockRun,
        close: vi.fn(),
      });

      const result = await client.verifyConnection();

      expect(result).toBe(false);
    });
  });
});
