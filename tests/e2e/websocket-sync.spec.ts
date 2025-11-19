/**
 * WebSocket Multi-User Synchronization E2E Tests
 *
 * Tests real-time graph synchronization between multiple users
 *
 * @author andreas@siglochconsulting
 */

import { test, expect } from '@playwright/test';
import { CanvasWebSocketServer } from '../../src/canvas/websocket-server.js';
import { GraphCanvas } from '../../src/canvas/graph-canvas.js';
import { Neo4jClient } from '../../src/neo4j-client/neo4j-client.js';
import WebSocket from 'ws';

const WS_PORT = 3003;
const workspaceId = 'e2e-workspace';
const systemId = 'E2ESystem.SY.001';

test.describe('WebSocket Multi-User Synchronization', () => {
  let wsServer: CanvasWebSocketServer;
  let neo4jClient: Neo4jClient;

  test.beforeAll(async () => {
    // Start WebSocket server
    wsServer = new CanvasWebSocketServer(WS_PORT);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Initialize Neo4j client
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'test1234';
    neo4jClient = new Neo4jClient({ uri, user, password });
  });

  test.afterAll(async () => {
    await wsServer?.close();
    await neo4jClient?.close();
  });

  test('broadcasts graph updates to other users in same workspace', async () => {
    const user1 = 'user-alice';
    const user2 = 'user-bob';
    const chatId1 = 'chat-alice';
    const chatId2 = 'chat-bob';

    // Create two WebSocket clients
    const client1 = new WebSocket(`ws://localhost:${WS_PORT}`);
    const client2 = new WebSocket(`ws://localhost:${WS_PORT}`);

    // Track messages received
    const client1Messages: any[] = [];
    const client2Messages: any[] = [];

    client1.on('message', (data) => {
      client1Messages.push(JSON.parse(data.toString()));
    });

    client2.on('message', (data) => {
      client2Messages.push(JSON.parse(data.toString()));
    });

    // Wait for connections
    await Promise.all([
      new Promise((resolve) => client1.on('open', resolve)),
      new Promise((resolve) => client2.on('open', resolve)),
    ]);

    // Wait for connection acknowledgments
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Subscribe both clients to same workspace
    client1.send(JSON.stringify({
      type: 'subscribe',
      workspaceId,
      systemId,
      userId: user1,
    }));

    client2.send(JSON.stringify({
      type: 'subscribe',
      workspaceId,
      systemId,
      userId: user2,
    }));

    // Wait for subscriptions
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create GraphCanvas for user1
    const canvas1 = new GraphCanvas(
      workspaceId,
      systemId,
      chatId1,
      user1,
      'hierarchy',
      neo4jClient,
      wsServer
    );

    // User1 makes a change
    const diff = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ SharedNode|FUNC|SharedNode.FN.001|A shared node

## Edges
</operations>`;

    await canvas1.applyDiff(diff);

    // Wait for broadcast
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify user2 received the update
    const graphUpdates = client2Messages.filter((m) => m.type === 'graph_update');
    expect(graphUpdates.length).toBeGreaterThan(0);

    const lastUpdate = graphUpdates[graphUpdates.length - 1];
    expect(lastUpdate.source.userId).toBe(user1);
    expect(lastUpdate.diff).toContain('SharedNode.FN.001');

    // Verify user1 did NOT receive own update
    const user1GraphUpdates = client1Messages.filter((m) => m.type === 'graph_update');
    expect(user1GraphUpdates.length).toBe(0);

    client1.close();
    client2.close();
  });

  test('isolates broadcasts by workspace', async () => {
    const workspace1 = 'workspace-alpha';
    const workspace2 = 'workspace-beta';
    const system1 = 'SystemA.SY.001';
    const system2 = 'SystemB.SY.001';

    // Create clients in different workspaces
    const clientA = new WebSocket(`ws://localhost:${WS_PORT}`);
    const clientB = new WebSocket(`ws://localhost:${WS_PORT}`);

    const clientAMessages: any[] = [];
    const clientBMessages: any[] = [];

    clientA.on('message', (data) => {
      clientAMessages.push(JSON.parse(data.toString()));
    });

    clientB.on('message', (data) => {
      clientBMessages.push(JSON.parse(data.toString()));
    });

    // Wait for connections
    await Promise.all([
      new Promise((resolve) => clientA.on('open', resolve)),
      new Promise((resolve) => clientB.on('open', resolve)),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Subscribe to different workspaces
    clientA.send(JSON.stringify({
      type: 'subscribe',
      workspaceId: workspace1,
      systemId: system1,
      userId: 'user-a',
    }));

    clientB.send(JSON.stringify({
      type: 'subscribe',
      workspaceId: workspace2,
      systemId: system2,
      userId: 'user-b',
    }));

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create canvas in workspace1
    const canvasA = new GraphCanvas(
      workspace1,
      system1,
      'chat-a',
      'user-a',
      'hierarchy',
      neo4jClient,
      wsServer
    );

    // Make change in workspace1
    const diff = `<operations>
<base_snapshot>${system1}@v1</base_snapshot>

## Nodes
+ IsolatedNode|FUNC|IsolatedNode.FN.001|Should not broadcast to workspace2

## Edges
</operations>`;

    await canvasA.applyDiff(diff);

    // Wait for potential broadcast
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify clientB did NOT receive update
    const clientBGraphUpdates = clientBMessages.filter((m) => m.type === 'graph_update');
    expect(clientBGraphUpdates.length).toBe(0);

    clientA.close();
    clientB.close();
  });

  test('handles concurrent edits from multiple users', async () => {
    const user1 = 'user-charlie';
    const user2 = 'user-diana';

    const client1 = new WebSocket(`ws://localhost:${WS_PORT}`);
    const client2 = new WebSocket(`ws://localhost:${WS_PORT}`);

    const client1Updates: any[] = [];
    const client2Updates: any[] = [];

    client1.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'graph_update') {
        client1Updates.push(msg);
      }
    });

    client2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'graph_update') {
        client2Updates.push(msg);
      }
    });

    // Wait for connections
    await Promise.all([
      new Promise((resolve) => client1.on('open', resolve)),
      new Promise((resolve) => client2.on('open', resolve)),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Subscribe both to same workspace
    client1.send(JSON.stringify({
      type: 'subscribe',
      workspaceId,
      systemId,
      userId: user1,
    }));

    client2.send(JSON.stringify({
      type: 'subscribe',
      workspaceId,
      systemId,
      userId: user2,
    }));

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create canvases for both users
    const canvas1 = new GraphCanvas(
      workspaceId,
      systemId,
      'chat-charlie',
      user1,
      'hierarchy',
      neo4jClient,
      wsServer
    );

    const canvas2 = new GraphCanvas(
      workspaceId,
      systemId,
      'chat-diana',
      user2,
      'hierarchy',
      neo4jClient,
      wsServer
    );

    // Both users make concurrent edits
    const diff1 = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ CharlieNode|FUNC|CharlieNode.FN.001|From user1

## Edges
</operations>`;

    const diff2 = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ DianaNode|FUNC|DianaNode.FN.001|From user2

## Edges
</operations>`;

    // Apply diffs concurrently
    await Promise.all([
      canvas1.applyDiff(diff1),
      canvas2.applyDiff(diff2),
    ]);

    // Wait for broadcasts
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Verify user1 received user2's update
    expect(client1Updates.length).toBeGreaterThan(0);
    const user1ReceivedFromUser2 = client1Updates.some(
      (u) => u.source.userId === user2 && u.diff.includes('DianaNode.FN.001')
    );
    expect(user1ReceivedFromUser2).toBe(true);

    // Verify user2 received user1's update
    expect(client2Updates.length).toBeGreaterThan(0);
    const user2ReceivedFromUser1 = client2Updates.some(
      (u) => u.source.userId === user1 && u.diff.includes('CharlieNode.FN.001')
    );
    expect(user2ReceivedFromUser1).toBe(true);

    client1.close();
    client2.close();
  });

  test('handles client disconnection gracefully', async () => {
    const client = new WebSocket(`ws://localhost:${WS_PORT}`);

    await new Promise((resolve) => client.on('open', resolve));
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Subscribe
    client.send(JSON.stringify({
      type: 'subscribe',
      workspaceId,
      systemId,
      userId: 'user-disconnect',
    }));

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify client count increased
    const beforeCount = wsServer.getClientCount();
    expect(beforeCount).toBeGreaterThan(0);

    // Disconnect
    client.close();

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify client count decreased
    const afterCount = wsServer.getClientCount();
    expect(afterCount).toBe(beforeCount - 1);
  });

  test('maintains subscription across multiple graph updates', async () => {
    const user1 = 'user-persistent';
    const user2 = 'user-receiver';

    const client = new WebSocket(`ws://localhost:${WS_PORT}`);
    const receivedUpdates: any[] = [];

    client.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'graph_update') {
        receivedUpdates.push(msg);
      }
    });

    await new Promise((resolve) => client.on('open', resolve));
    await new Promise((resolve) => setTimeout(resolve, 100));

    client.send(JSON.stringify({
      type: 'subscribe',
      workspaceId,
      systemId,
      userId: user2,
    }));

    await new Promise((resolve) => setTimeout(resolve, 200));

    const canvas = new GraphCanvas(
      workspaceId,
      systemId,
      'chat-persistent',
      user1,
      'hierarchy',
      neo4jClient,
      wsServer
    );

    // Apply 3 sequential diffs
    for (let i = 1; i <= 3; i++) {
      const diff = `<operations>
<base_snapshot>${systemId}@v${i}</base_snapshot>

## Nodes
+ Node${i}|FUNC|Node${i}.FN.001|Update ${i}

## Edges
</operations>`;

      await canvas.applyDiff(diff);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    // Verify all 3 updates received
    expect(receivedUpdates.length).toBe(3);
    expect(receivedUpdates[0].diff).toContain('Node1.FN.001');
    expect(receivedUpdates[1].diff).toContain('Node2.FN.001');
    expect(receivedUpdates[2].diff).toContain('Node3.FN.001');

    client.close();
  });
});
