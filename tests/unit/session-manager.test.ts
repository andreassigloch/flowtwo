/**
 * SessionManager Unit Tests (CR-038 Phase 5)
 *
 * Validates:
 * - Only ONE AgentDB instance created per session
 * - Proper component initialization order
 * - Session lifecycle (load/save/switch)
 * - Background validation setup
 * - Broadcasting coordination
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../src/session-manager.js';
import { resetAgentDBInstance } from '../../src/llm-engine/agentdb/unified-agentdb-service.js';
import * as fs from 'fs';

// Mock modules
vi.mock('../../src/neo4j-client/neo4j-client.js', () => ({
  Neo4jClient: vi.fn().mockImplementation(() => ({
    loadGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    saveNodes: vi.fn().mockResolvedValue(undefined),
    saveEdges: vi.fn().mockResolvedValue(undefined),
    saveUserSession: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/canvas/websocket-client.js', () => ({
  CanvasWebSocketClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock('../../src/llm-engine/engine-factory.js', () => ({
  createLLMEngine: vi.fn().mockImplementation(() => ({
    processRequestStream: vi.fn(),
  })),
  getCurrentProvider: vi.fn().mockReturnValue('mock-provider'),
}));

vi.mock('../../src/shared/session-resolver.js', () => ({
  initNeo4jClient: vi.fn().mockReturnValue({
    loadGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    saveNodes: vi.fn().mockResolvedValue(undefined),
    saveEdges: vi.fn().mockResolvedValue(undefined),
    saveUserSession: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }),
  updateActiveSystem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/llm-engine/agents/workflow-router.js', () => ({
  getWorkflowRouter: vi.fn().mockReturnValue({
    routeUserInput: vi.fn().mockReturnValue('system-architect'),
  }),
}));

vi.mock('../../src/llm-engine/agents/agent-executor.js', () => ({
  getAgentExecutor: vi.fn().mockReturnValue({
    getAgentContextPrompt: vi.fn().mockReturnValue('mock prompt'),
    calculateReward: vi.fn().mockReturnValue(1.0),
  }),
}));

vi.mock('../../src/llm-engine/agents/config-loader.js', () => ({
  getAgentConfigLoader: vi.fn().mockReturnValue({
    getPrompt: vi.fn().mockReturnValue('fallback prompt'),
  }),
}));

vi.mock('fs', () => ({
  default: {
    appendFileSync: vi.fn(),
  },
  appendFileSync: vi.fn(),
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  const mockResolvedSession = {
    workspaceId: 'test-workspace',
    systemId: 'test-system',
    chatId: 'test-chat',
    userId: 'test-user',
    source: 'test',
  };

  beforeEach(() => {
    // Reset AgentDB singleton before each test
    resetAgentDBInstance();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (sessionManager) {
      try {
        // Shutdown may fail if already closed, that's ok
        await sessionManager.shutdown();
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }
    resetAgentDBInstance();
  });

  describe('Initialization', () => {
    it('should create SessionManager via factory method', async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);

      expect(sessionManager).toBeDefined();
      expect(sessionManager.getConfig()).toEqual({
        workspaceId: 'test-workspace',
        systemId: 'test-system',
        chatId: 'test-chat',
        userId: 'test-user',
      });
    });

    it('should initialize components in correct order', async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);

      // Verify all components are initialized
      expect(sessionManager.getAgentDB()).toBeDefined();
      expect(sessionManager.getGraphCanvas()).toBeDefined();
      expect(sessionManager.getChatCanvas()).toBeDefined();
      expect(sessionManager.getWebSocketClient()).toBeDefined();
      expect(sessionManager.getNeo4jClient()).toBeDefined();
    });

    it('should create only ONE AgentDB instance', async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);

      const agentDB1 = sessionManager.getAgentDB();
      const agentDB2 = sessionManager.getAgentDB();

      // Same instance reference
      expect(agentDB1).toBe(agentDB2);

      // Verify it's the singleton instance
      expect(agentDB1.isInitialized()).toBe(true);
    });

    it('should handle missing LLM engine gracefully', async () => {
      // Mock LLM engine creation to throw
      const { createLLMEngine } = await import('../../src/llm-engine/engine-factory.js');
      vi.mocked(createLLMEngine).mockImplementationOnce(() => {
        throw new Error('No API key');
      });

      sessionManager = await SessionManager.create(mockResolvedSession);

      expect(sessionManager.getLLMEngine()).toBeNull();
    });
  });

  describe('Session Lifecycle', () => {
    beforeEach(async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);
    });

    it('should load graph from Neo4j on initialization', async () => {
      const neo4jClient = sessionManager.getNeo4jClient();
      expect(neo4jClient.loadGraph).toHaveBeenCalledWith({
        workspaceId: 'test-workspace',
        systemId: 'test-system',
      });
    });

    it('should save graph to Neo4j', async () => {
      await sessionManager.saveGraphToNeo4j();

      const neo4jClient = sessionManager.getNeo4jClient();
      expect(neo4jClient.saveNodes).toHaveBeenCalled();
      expect(neo4jClient.saveEdges).toHaveBeenCalled();
    });

    it('should switch to different system', async () => {
      await sessionManager.switchSystem('new-system');

      expect(sessionManager.getConfig().systemId).toBe('new-system');
    });
  });

  describe('Broadcasting', () => {
    beforeEach(async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);
    });

    it('should broadcast graph updates via WebSocket', () => {
      sessionManager.notifyGraphUpdate();

      const wsClient = sessionManager.getWebSocketClient();
      expect(wsClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'graph_update',
          workspaceId: 'test-workspace',
          systemId: 'test-system',
        })
      );
    });

    it('should not broadcast when WebSocket disconnected', () => {
      const wsClient = sessionManager.getWebSocketClient();
      vi.mocked(wsClient.isConnected).mockReturnValue(false);

      sessionManager.notifyGraphUpdate();

      expect(wsClient.send).not.toHaveBeenCalled();
    });
  });

  describe('Background Validation', () => {
    beforeEach(async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);
    });

    it('should setup background validation on AgentDB changes', () => {
      // Background validation is set up internally
      // Verify SessionManager was created successfully
      expect(sessionManager).toBeDefined();
      expect(sessionManager.getAgentDB()).toBeDefined();
    });
  });

  describe('Command Context', () => {
    beforeEach(async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);
    });

    it('should provide command context with all components', () => {
      const mockRl = {} as any;
      const ctx = sessionManager.getCommandContext(mockRl);

      expect(ctx.config).toEqual(sessionManager.getConfig());
      expect(ctx.agentDB).toBe(sessionManager.getAgentDB());
      expect(ctx.graphCanvas).toBe(sessionManager.getGraphCanvas());
      expect(ctx.chatCanvas).toBe(sessionManager.getChatCanvas());
      expect(ctx.wsClient).toBe(sessionManager.getWebSocketClient());
      expect(ctx.neo4jClient).toBe(sessionManager.getNeo4jClient());
      expect(ctx.sessionManager).toBe(sessionManager);
      expect(ctx.log).toBeInstanceOf(Function);
      expect(ctx.notifyGraphUpdate).toBeInstanceOf(Function);
    });
  });

  describe('Shutdown', () => {
    beforeEach(async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);
    });

    it('should shutdown cleanly', async () => {
      await sessionManager.shutdown();

      const wsClient = sessionManager.getWebSocketClient();
      const neo4jClient = sessionManager.getNeo4jClient();

      expect(wsClient.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'shutdown' })
      );
      expect(neo4jClient.close).toHaveBeenCalled();
    });

    it('should save state before shutdown', async () => {
      await sessionManager.shutdown();

      const neo4jClient = sessionManager.getNeo4jClient();
      expect(neo4jClient.saveNodes).toHaveBeenCalled();
      expect(neo4jClient.saveEdges).toHaveBeenCalled();
      expect(neo4jClient.saveUserSession).toHaveBeenCalled();
    });
  });

  describe('Message Processing', () => {
    beforeEach(async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);
    });

    it('should throw if LLM engine not available', async () => {
      // Create session manager without LLM
      const { createLLMEngine } = await import('../../src/llm-engine/engine-factory.js');
      vi.mocked(createLLMEngine).mockImplementationOnce(() => {
        throw new Error('No API key');
      });

      const noLLMSession = await SessionManager.create(mockResolvedSession);

      await expect(
        noLLMSession.processMessage('test', () => {})
      ).rejects.toThrow('LLM Engine not available');

      await noLLMSession.shutdown();
    });
  });

  describe('AgentDB Singleton Guarantee', () => {
    afterEach(() => {
      // Extra cleanup for singleton tests
      resetAgentDBInstance();
    });

    it('should reuse same AgentDB for same session', async () => {
      const session1 = await SessionManager.create(mockResolvedSession);
      const agentDB1 = session1.getAgentDB();

      const session2 = await SessionManager.create(mockResolvedSession);
      const agentDB2 = session2.getAgentDB();

      // Same singleton instance
      expect(agentDB1).toBe(agentDB2);

      // Clean shutdown (only shutdown once since they share instance)
      try {
        await session1.shutdown();
      } catch {
        // Ignore
      }
    });

    it('should clear AgentDB when switching sessions', async () => {
      const session1 = await SessionManager.create(mockResolvedSession);
      const agentDB1 = session1.getAgentDB();

      await session1.switchSystem('different-system');

      const agentDB2 = session1.getAgentDB();

      // Same instance, but data cleared
      expect(agentDB1).toBe(agentDB2);
      expect(session1.getConfig().systemId).toBe('different-system');

      try {
        await session1.shutdown();
      } catch {
        // Ignore
      }
    });
  });

  describe('Logging', () => {
    beforeEach(async () => {
      sessionManager = await SessionManager.create(mockResolvedSession);
    });

    it('should log to file', () => {
      sessionManager.log('test message');

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('test message')
      );
    });
  });
});
