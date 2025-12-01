/**
 * Unit Tests for Session Resolver (CR-018)
 *
 * Tests the central session resolution logic:
 * - Priority: ENV → Neo4j → new-installation
 * - Neo4j is MANDATORY - abort if not available
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveSession, initNeo4jClient, type ResolvedSession } from '../../../src/shared/session-resolver.js';

// Mock Neo4jClient - must match the internal getSession() call pattern
const createMockNeo4jClient = () => {
  const mockSession = {
    run: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    mockSession,
    client: {
      // Private method accessed via bracket notation in session-resolver.ts
      getSession: vi.fn(() => mockSession),
    },
  };
};

describe('Session Resolver', () => {
  const originalEnv = process.env;
  let mockClient: ReturnType<typeof createMockNeo4jClient>;

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
    // Set required Neo4j env vars for initNeo4jClient tests
    process.env.NEO4J_URI = 'bolt://localhost:7687';
    process.env.NEO4J_USER = 'neo4j';
    process.env.NEO4J_PASSWORD = 'test';
    // Create fresh mock for each test
    mockClient = createMockNeo4jClient();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveSession - Priority Order', () => {
    it('Priority 1: ENV SYSTEM_ID takes precedence over Neo4j', async () => {
      // Arrange
      process.env.SYSTEM_ID = 'EnvSystem.SY.001';
      process.env.WORKSPACE_ID = 'env-workspace';
      process.env.USER_ID = 'test-user';
      process.env.CHAT_ID = 'test-chat';

      // Act
      const result = await resolveSession(mockClient.client as any);

      // Assert
      expect(result.source).toBe('env');
      expect(result.systemId).toBe('EnvSystem.SY.001');
      expect(result.workspaceId).toBe('env-workspace');
      // Neo4j should NOT be called when ENV is set
      expect(mockClient.mockSession.run).not.toHaveBeenCalled();
    });

    it('Priority 2: Neo4j session when ENV not set', async () => {
      // Arrange - no SYSTEM_ID in env
      delete process.env.SYSTEM_ID;
      process.env.WORKSPACE_ID = 'test-workspace';
      process.env.USER_ID = 'test-user';

      mockClient.mockSession.run.mockResolvedValue({
        records: [{
          get: (key: string) => {
            if (key === 'activeSystemId') return 'Neo4jSystem.SY.002';
            if (key === 'chatId') return 'neo4j-chat-001';
            return null;
          },
        }],
      });

      // Act
      const result = await resolveSession(mockClient.client as any);

      // Assert
      expect(result.source).toBe('neo4j');
      expect(result.systemId).toBe('Neo4jSystem.SY.002');
      expect(result.chatId).toBe('neo4j-chat-001');
      expect(mockClient.mockSession.run).toHaveBeenCalled();
    });

    it('Priority 3: new-installation when Neo4j is empty', async () => {
      // Arrange - no SYSTEM_ID, no Neo4j session
      delete process.env.SYSTEM_ID;
      process.env.WORKSPACE_ID = 'new-workspace';

      mockClient.mockSession.run.mockResolvedValue({
        records: [], // Empty - no existing session
      });

      // Act
      const result = await resolveSession(mockClient.client as any);

      // Assert
      expect(result.source).toBe('new-installation');
      expect(result.systemId).toBe('new-system');
      expect(result.workspaceId).toBe('new-workspace');
    });
  });

  describe('resolveSession - Default Values', () => {
    it('uses default workspaceId when not set', async () => {
      // Arrange
      delete process.env.WORKSPACE_ID;
      process.env.SYSTEM_ID = 'Test.SY.001';

      // Act
      const result = await resolveSession(mockClient.client as any);

      // Assert
      expect(result.workspaceId).toBe('demo-workspace');
    });

    it('uses default userId when not set', async () => {
      // Arrange
      delete process.env.USER_ID;
      process.env.SYSTEM_ID = 'Test.SY.001';

      // Act
      const result = await resolveSession(mockClient.client as any);

      // Assert
      expect(result.userId).toBe('andreas@siglochconsulting');
    });

    it('uses default chatId when not set', async () => {
      // Arrange
      delete process.env.CHAT_ID;
      process.env.SYSTEM_ID = 'Test.SY.001';

      // Act
      const result = await resolveSession(mockClient.client as any);

      // Assert
      expect(result.chatId).toBe('demo-chat-001');
    });
  });

  describe('resolveSession - ResolvedSession Interface', () => {
    it('returns complete ResolvedSession object', async () => {
      // Arrange
      process.env.SYSTEM_ID = 'Complete.SY.001';
      process.env.WORKSPACE_ID = 'complete-workspace';
      process.env.USER_ID = 'complete-user';
      process.env.CHAT_ID = 'complete-chat';

      // Act
      const result = await resolveSession(mockClient.client as any);

      // Assert
      expect(result).toEqual<ResolvedSession>({
        workspaceId: 'complete-workspace',
        systemId: 'Complete.SY.001',
        userId: 'complete-user',
        chatId: 'complete-chat',
        source: 'env',
      });
    });
  });

  describe('initNeo4jClient - Fail Fast', () => {
    it('exits when NEO4J_URI is missing', () => {
      // Arrange
      delete process.env.NEO4J_URI;
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Act & Assert
      expect(() => initNeo4jClient()).toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('exits when NEO4J_USER is missing', () => {
      // Arrange
      delete process.env.NEO4J_USER;
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Act & Assert
      expect(() => initNeo4jClient()).toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('exits when NEO4J_PASSWORD is missing', () => {
      // Arrange
      delete process.env.NEO4J_PASSWORD;
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Act & Assert
      expect(() => initNeo4jClient()).toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe('Consistency - Both Terminals Use Same Logic', () => {
    it('same input produces same output (deterministic)', async () => {
      // Arrange
      process.env.SYSTEM_ID = 'Consistent.SY.001';
      process.env.WORKSPACE_ID = 'consistent-workspace';
      process.env.USER_ID = 'consistent-user';
      process.env.CHAT_ID = 'consistent-chat';

      // Act - simulate both terminals calling resolveSession
      const result1 = await resolveSession(mockClient.client as any);
      const result2 = await resolveSession(mockClient.client as any);

      // Assert - both should be identical
      expect(result1).toEqual(result2);
      expect(result1.systemId).toBe(result2.systemId);
      expect(result1.workspaceId).toBe(result2.workspaceId);
    });
  });
});
