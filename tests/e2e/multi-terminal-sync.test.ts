/**
 * Multi-Terminal Sync E2E Tests (CR-018)
 *
 * Tests the end-to-end synchronization between multiple terminals:
 * 1. Startup orchestrator initializes WebSocket server
 * 2. Chat interface broadcasts state with systemId
 * 3. Graph viewer receives initial state on connect
 * 4. System changes propagate correctly
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasWebSocketServer, BroadcastUpdate } from '../../src/canvas/websocket-server.js';
import { CanvasWebSocketClient } from '../../src/canvas/websocket-client.js';

// Unique port for E2E tests
const E2E_PORT = 3300 + Math.floor(Math.random() * 100);
const WS_URL = `ws://localhost:${E2E_PORT}`;

describe('Multi-Terminal Sync E2E', { sequential: true }, () => {
  let server: CanvasWebSocketServer;

  beforeEach(async () => {
    server = new CanvasWebSocketServer(E2E_PORT);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterEach(async () => {
    server.clearBroadcastCache();
    await server.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it('graph viewer shows correct system after startup', async () => {
    // Scenario: Orchestrator caches initial state, graph viewer connects later

    // Step 1: Simulate orchestrator sending initial broadcast (before any clients)
    const initialState = {
      nodes: [['OfficeKaffee.SY.001', { name: 'OfficeKaffeeversorgung', type: 'SYS' }]],
      edges: [],
      currentView: 'hierarchy',
    };

    // Manually cache the initial state (simulates orchestrator's initial broadcast)
    const chatClient = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'e2e-workspace',
        systemId: 'OfficeKaffee.SY.001',
        userId: 'orchestrator',
      },
      () => {}
    );
    await chatClient.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    chatClient.broadcastUpdate(
      'graph_update',
      JSON.stringify(initialState),
      { userId: 'orchestrator', sessionId: 'startup', origin: 'system' },
      'e2e-workspace',
      'OfficeKaffee.SY.001'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Step 2: Graph viewer connects (simulates user starting graph-viewer.ts)
    // In production, the graph viewer would subscribe to same workspace+system
    // and receive the cached initial state
    const graphViewerUpdates: BroadcastUpdate[] = [];
    const graphViewer = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'e2e-workspace',
        systemId: 'OfficeKaffee.SY.001', // Same system to receive cached state
        userId: 'graph-viewer',
      },
      (update) => graphViewerUpdates.push(update)
    );

    await graphViewer.connect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Step 3: Verify graph viewer received cached initial state
    expect(graphViewerUpdates.length).toBeGreaterThan(0);

    const initialUpdate = graphViewerUpdates.find((u) => u.type === 'graph_update');
    expect(initialUpdate).toBeDefined();
    expect(initialUpdate?.systemId).toBe('OfficeKaffee.SY.001');
    expect(initialUpdate?.diff).toContain('OfficeKaffeeversorgung');

    chatClient.disconnect();
    graphViewer.disconnect();
  });

  it('/load command in chat updates graph viewer', async () => {
    // Scenario: User loads different system in chat, graph viewer updates

    const chatUpdates: BroadcastUpdate[] = [];
    const graphViewerUpdates: BroadcastUpdate[] = [];

    // Chat interface connects
    const chatClient = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'e2e-workspace',
        systemId: 'SystemA.SY.001',
        userId: 'chat-user',
      },
      (update) => chatUpdates.push(update)
    );

    // Graph viewer connects
    const graphViewer = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'e2e-workspace',
        systemId: 'SystemA.SY.001',
        userId: 'graph-viewer',
      },
      (update) => graphViewerUpdates.push(update)
    );

    await Promise.all([chatClient.connect(), graphViewer.connect()]);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // User types /load SystemB in chat
    // Chat sends broadcast with new systemId
    const newSystemState = {
      nodes: [['SystemB.SY.002', { name: 'SystemB', type: 'SYS' }]],
      edges: [],
      currentView: 'hierarchy',
    };

    chatClient.broadcastUpdate(
      'graph_update',
      JSON.stringify(newSystemState),
      { userId: 'chat-user', sessionId: 'chat-session', origin: 'llm-operation' },
      'e2e-workspace',
      'SystemB.SY.002' // New system
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Graph viewer should receive update with new systemId
    const loadUpdate = graphViewerUpdates.find(
      (u) => u.type === 'graph_update' && u.systemId === 'SystemB.SY.002'
    );
    expect(loadUpdate).toBeDefined();
    expect(loadUpdate?.diff).toContain('SystemB');

    chatClient.disconnect();
    graphViewer.disconnect();
  });

  it('/view command in chat updates graph viewer', async () => {
    // Scenario: User changes view in chat, graph viewer re-renders

    const graphViewerUpdates: BroadcastUpdate[] = [];

    // Both clients connect
    const chatClient = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'e2e-workspace',
        systemId: 'ViewTest.SY.001',
        userId: 'chat-user',
      },
      () => {}
    );

    const graphViewer = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'e2e-workspace',
        systemId: 'ViewTest.SY.001',
        userId: 'graph-viewer',
      },
      (update) => graphViewerUpdates.push(update)
    );

    await Promise.all([chatClient.connect(), graphViewer.connect()]);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // User types /view architecture in chat
    const viewChangeState = {
      nodes: [['ViewTest.SY.001', { name: 'ViewTest', type: 'SYS' }]],
      edges: [],
      currentView: 'architecture', // View changed
    };

    chatClient.broadcastUpdate(
      'graph_update',
      JSON.stringify(viewChangeState),
      { userId: 'chat-user', sessionId: 'chat-session', origin: 'llm-operation' },
      'e2e-workspace',
      'ViewTest.SY.001'
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Graph viewer should receive update with new view
    const viewUpdate = graphViewerUpdates.find((u) => u.type === 'graph_update');
    expect(viewUpdate).toBeDefined();

    const state = JSON.parse(viewUpdate?.diff || '{}');
    expect(state.currentView).toBe('architecture');

    chatClient.disconnect();
    graphViewer.disconnect();
  });

  it('maintains consistency across multiple rapid updates', async () => {
    // Scenario: Rapid updates don't cause sync issues

    const graphViewerUpdates: BroadcastUpdate[] = [];

    const chatClient = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'e2e-workspace',
        systemId: 'RapidTest.SY.001',
        userId: 'chat-user',
      },
      () => {}
    );

    const graphViewer = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'e2e-workspace',
        systemId: 'RapidTest.SY.001',
        userId: 'graph-viewer',
      },
      (update) => graphViewerUpdates.push(update)
    );

    await Promise.all([chatClient.connect(), graphViewer.connect()]);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send 5 rapid updates
    for (let i = 1; i <= 5; i++) {
      chatClient.broadcastUpdate(
        'graph_update',
        JSON.stringify({ version: i, nodes: [], edges: [] }),
        { userId: 'chat-user', sessionId: 'chat-session', origin: 'llm-operation' },
        'e2e-workspace',
        'RapidTest.SY.001'
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Graph viewer should receive all 5 updates
    const graphUpdates = graphViewerUpdates.filter((u) => u.type === 'graph_update');
    expect(graphUpdates.length).toBe(5);

    // Last cached state should be version 5
    const cached = server.getCachedBroadcast('e2e-workspace', 'RapidTest.SY.001');
    expect(cached?.diff).toContain('"version":5');

    chatClient.disconnect();
    graphViewer.disconnect();
  });
});
