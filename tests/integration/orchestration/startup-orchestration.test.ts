/**
 * Startup Orchestration Integration Tests (CR-018)
 *
 * Tests the multi-terminal synchronization flow:
 * 1. WebSocket server caches broadcast
 * 2. Chat interface sends broadcast with systemId
 * 3. Graph viewer receives initial state on connect
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasWebSocketServer, BroadcastUpdate } from '../../../src/canvas/websocket-server.js';
import { CanvasWebSocketClient } from '../../../src/canvas/websocket-client.js';

// Use unique port to avoid conflicts
const TEST_PORT = 3200 + Math.floor(Math.random() * 100);
const WS_URL = `ws://localhost:${TEST_PORT}`;

describe('Startup Orchestration', { sequential: true }, () => {
  let server: CanvasWebSocketServer;

  beforeEach(async () => {
    server = new CanvasWebSocketServer(TEST_PORT);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterEach(async () => {
    server.clearBroadcastCache();
    await server.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it('chat broadcast includes workspaceId and systemId', async () => {
    // Simulate chat interface sending broadcast
    const receivedUpdates: BroadcastUpdate[] = [];

    const client = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'integration-test-ws',
        systemId: 'IntegrationTest.SY.001',
        userId: 'test-user',
      },
      (update) => receivedUpdates.push(update)
    );

    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate chat sending a broadcast with systemId
    client.broadcastUpdate(
      'graph_update',
      JSON.stringify({ nodes: [], edges: [], currentView: 'hierarchy' }),
      { userId: 'test-user', sessionId: 'test-session', origin: 'llm-operation' },
      'integration-test-ws',
      'IntegrationTest.SY.001'
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify broadcast was cached
    const cached = server.getCachedBroadcast('integration-test-ws', 'IntegrationTest.SY.001');
    expect(cached).toBeDefined();
    expect(cached?.workspaceId).toBe('integration-test-ws');
    expect(cached?.systemId).toBe('IntegrationTest.SY.001');

    client.disconnect();
  });

  it('new client receives cached broadcast on subscribe', async () => {
    const receivedByFirstClient: BroadcastUpdate[] = [];
    const receivedBySecondClient: BroadcastUpdate[] = [];

    // First client (simulates chat) sends initial broadcast
    const chatClient = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'new-client-test-ws',
        systemId: 'NewClientTest.SY.001',
        userId: 'chat-user',
      },
      (update) => receivedByFirstClient.push(update)
    );

    await chatClient.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Chat sends broadcast
    chatClient.broadcastUpdate(
      'graph_update',
      JSON.stringify({
        nodes: [['TestNode.FN.001', { name: 'TestNode' }]],
        edges: [],
        currentView: 'hierarchy',
      }),
      { userId: 'chat-user', sessionId: 'chat-session', origin: 'llm-operation' },
      'new-client-test-ws',
      'NewClientTest.SY.001'
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second client (simulates graph viewer) connects
    const graphViewerClient = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'new-client-test-ws',
        systemId: 'NewClientTest.SY.001',
        userId: 'graph-viewer-user',
      },
      (update) => receivedBySecondClient.push(update)
    );

    await graphViewerClient.connect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Graph viewer should receive cached broadcast
    expect(receivedBySecondClient.length).toBeGreaterThan(0);

    const initialBroadcast = receivedBySecondClient.find((u) => u.type === 'graph_update');
    expect(initialBroadcast).toBeDefined();
    expect(initialBroadcast?.diff).toContain('TestNode');
    expect(initialBroadcast?.workspaceId).toBe('new-client-test-ws');
    expect(initialBroadcast?.systemId).toBe('NewClientTest.SY.001');

    chatClient.disconnect();
    graphViewerClient.disconnect();
  });

  it('graph viewer updates subscription when systemId changes', async () => {
    const graphViewerUpdates: BroadcastUpdate[] = [];
    let currentSystemId = 'System1.SY.001';

    // Graph viewer connects
    const graphViewerClient = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'system-change-ws',
        systemId: currentSystemId,
        userId: 'graph-viewer',
      },
      (update) => {
        graphViewerUpdates.push(update);
        // Simulate graph viewer updating subscription on systemId change
        if (update.systemId && update.systemId !== currentSystemId) {
          currentSystemId = update.systemId;
          graphViewerClient.updateSubscription(currentSystemId);
        }
      }
    );

    await graphViewerClient.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Chat connects with different system
    const chatClient = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'system-change-ws',
        systemId: 'System2.SY.002',
        userId: 'chat-user',
      },
      () => {}
    );

    await chatClient.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Chat sends broadcast for new system
    chatClient.broadcastUpdate(
      'graph_update',
      JSON.stringify({ nodes: [], edges: [], currentView: 'architecture' }),
      { userId: 'chat-user', sessionId: 'chat-session', origin: 'llm-operation' },
      'system-change-ws',
      'System2.SY.002'
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Graph viewer should have received the update and updated subscription
    const receivedUpdate = graphViewerUpdates.find(
      (u) => u.type === 'graph_update' && u.systemId === 'System2.SY.002'
    );
    expect(receivedUpdate).toBeDefined();
    expect(currentSystemId).toBe('System2.SY.002');

    chatClient.disconnect();
    graphViewerClient.disconnect();
  });

  it('multiple systems have separate caches', async () => {
    const client = new CanvasWebSocketClient(
      WS_URL,
      {
        workspaceId: 'multi-system-ws',
        systemId: 'SystemA.SY.001',
        userId: 'test-user',
      },
      () => {}
    );

    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Broadcast for SystemA
    client.broadcastUpdate(
      'graph_update',
      JSON.stringify({ system: 'A' }),
      { userId: 'test-user', sessionId: 'session', origin: 'llm-operation' },
      'multi-system-ws',
      'SystemA.SY.001'
    );

    // Broadcast for SystemB
    client.broadcastUpdate(
      'graph_update',
      JSON.stringify({ system: 'B' }),
      { userId: 'test-user', sessionId: 'session', origin: 'llm-operation' },
      'multi-system-ws',
      'SystemB.SY.002'
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Each system should have its own cached broadcast
    const cachedA = server.getCachedBroadcast('multi-system-ws', 'SystemA.SY.001');
    const cachedB = server.getCachedBroadcast('multi-system-ws', 'SystemB.SY.002');

    expect(cachedA?.diff).toContain('system":"A"');
    expect(cachedB?.diff).toContain('system":"B"');

    client.disconnect();
  });
});
