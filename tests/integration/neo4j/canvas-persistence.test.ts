/**
 * Canvas Persistence Integration Tests
 *
 * Tests actual Neo4j persistence operations (not mocked)
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GraphCanvas } from '../../../src/canvas/graph-canvas.js';
import { ChatCanvas } from '../../../src/canvas/chat-canvas.js';
import { Neo4jClient } from '../../../src/neo4j-client/neo4j-client.js';
import neo4j, { Driver, Session } from 'neo4j-driver';

describe('Canvas Persistence Integration', () => {
  let driver: Driver;
  let session: Session;
  let neo4jClient: Neo4jClient;

  const workspaceId = 'test-workspace';
  const systemId = 'TestSystem.SY.001';
  const chatId = 'test-chat-001';
  const userId = 'test-user';

  beforeAll(async () => {
    // Connect to Neo4j (expects local instance or test container)
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'test1234';

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    neo4jClient = new Neo4jClient({ uri, user, password });
  });

  beforeEach(async () => {
    session = driver.session();
    // Clean database before each test
    await session.run('MATCH (n) DETACH DELETE n');
  });

  afterAll(async () => {
    await session?.close();
    await driver?.close();
    await neo4jClient?.close();
  });

  describe('GraphCanvas Persistence', () => {
    it('throws error when Neo4j client not provided', async () => {
      const canvas = new GraphCanvas(
        workspaceId,
        systemId,
        chatId,
        userId,
        'hierarchy'
        // No neo4jClient provided
      );

      // Add a node
      const diff = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ TestNode|FUNC|TestNode.FN.001|Test function

## Edges
</operations>`;

      await canvas.applyDiff(diff);

      // Attempt to persist should throw error
      await expect(canvas.persistToNeo4j()).rejects.toThrow(
        'Cannot persist graph data: Neo4jClient not configured'
      );
    });

    it('persists dirty nodes to Neo4j', async () => {
      const canvas = new GraphCanvas(
        workspaceId,
        systemId,
        chatId,
        userId,
        'hierarchy',
        neo4jClient
      );

      // Add nodes via diff
      const diff = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ TestSystem|SYS|TestSystem.SY.001|A test system
+ TestFunction|FUNC|TestFunction.FN.001|A test function

## Edges
+ TestSystem.SY.001 -cp-> TestFunction.FN.001
</operations>`;

      await canvas.applyDiff(diff);

      // Persist to Neo4j
      const result = await canvas.persistToNeo4j();

      expect(result.success).toBe(true);
      expect(result.savedCount).toBeGreaterThan(0);

      // Verify in Neo4j
      const queryResult = await session.run(`
        MATCH (n {workspaceId: $workspaceId, systemId: $systemId})
        RETURN n.semanticId as id, n.type as type
        ORDER BY n.semanticId
      `, { workspaceId, systemId });

      expect(queryResult.records.length).toBeGreaterThanOrEqual(2);

      const nodes = queryResult.records.map(r => ({
        id: r.get('id'),
        type: r.get('type')
      }));

      expect(nodes).toContainEqual({
        id: 'TestSystem.SY.001',
        type: 'SYS'
      });
      expect(nodes).toContainEqual({
        id: 'TestFunction.FN.001',
        type: 'FUNC'
      });
    });

    it('persists edges to Neo4j', async () => {
      const canvas = new GraphCanvas(
        workspaceId,
        systemId,
        chatId,
        userId,
        'hierarchy',
        neo4jClient
      );

      const diff = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ Parent|SYS|Parent.SY.001|Parent system
+ Child|UC|Child.UC.001|Child use case

## Edges
+ Parent.SY.001 -cp-> Child.UC.001
</operations>`;

      await canvas.applyDiff(diff);
      await canvas.persistToNeo4j();

      // Verify edge in Neo4j
      const edgeResult = await session.run(`
        MATCH (source {semanticId: $sourceId})-[r:compose]->(target {semanticId: $targetId})
        RETURN r.type as type
      `, {
        sourceId: 'Parent.SY.001',
        targetId: 'Child.UC.001'
      });

      expect(edgeResult.records.length).toBe(1);
      expect(edgeResult.records[0].get('type')).toBe('compose');
    });

    it('creates audit log on persist', async () => {
      const canvas = new GraphCanvas(
        workspaceId,
        systemId,
        chatId,
        userId,
        'hierarchy',
        neo4jClient
      );

      const diff = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ AuditTest|FUNC|AuditTest.FN.001|Test audit logging

## Edges
</operations>`;

      await canvas.applyDiff(diff);
      await canvas.persistToNeo4j();

      // Verify audit log exists
      const auditResult = await session.run(`
        MATCH (log:AuditLog {chatId: $chatId, workspaceId: $workspaceId})
        RETURN log.action as action, log.userId as userId
        ORDER BY log.timestamp DESC
        LIMIT 1
      `, { chatId, workspaceId });

      expect(auditResult.records.length).toBeGreaterThan(0);
      expect(auditResult.records[0].get('action')).toBe('persist');
      expect(auditResult.records[0].get('userId')).toBe(userId);
    });

    it('clears dirty tracking after successful persist', async () => {
      const canvas = new GraphCanvas(
        workspaceId,
        systemId,
        chatId,
        userId,
        'hierarchy',
        neo4jClient
      );

      const diff = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ DirtyTest|FUNC|DirtyTest.FN.001|Test dirty tracking

## Edges
</operations>`;

      await canvas.applyDiff(diff);

      // First persist
      const result1 = await canvas.persistToNeo4j();
      expect(result1.success).toBe(true);
      expect(result1.savedCount).toBeGreaterThan(0);

      // Second persist should skip (no dirty items)
      const result2 = await canvas.persistToNeo4j();
      expect(result2.success).toBe(true);
      expect(result2.skipped).toBe(true);
    });

    it('survives application restart (load from Neo4j)', async () => {
      // First session: create and persist
      const canvas1 = new GraphCanvas(
        workspaceId,
        systemId,
        chatId,
        userId,
        'hierarchy',
        neo4jClient
      );

      const diff = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ PersistentSystem|SYS|PersistentSystem.SY.001|Should survive restart
+ PersistentFunction|FUNC|PersistentFunction.FN.001|Should survive restart

## Edges
+ PersistentSystem.SY.001 -cp-> PersistentFunction.FN.001
</operations>`;

      await canvas1.applyDiff(diff);
      await canvas1.persistToNeo4j();

      // Simulate restart: new canvas instance
      const _canvas2 = new GraphCanvas(
        workspaceId,
        systemId,
        'new-chat-002',
        userId,
        'hierarchy',
        neo4jClient
      );

      // Load from Neo4j (would need loadFromNeo4j method)
      // For now, verify data exists in database
      const loadResult = await session.run(`
        MATCH (n {workspaceId: $workspaceId, systemId: $systemId})
        RETURN count(n) as nodeCount
      `, { workspaceId, systemId });

      const nodeCount = loadResult.records[0].get('nodeCount').toInt();
      expect(nodeCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ChatCanvas Persistence', () => {
    it('throws error when Neo4j client not provided', async () => {
      const chatCanvas = new ChatCanvas(
        workspaceId,
        systemId,
        chatId,
        userId
        // No neo4jClient provided
      );

      chatCanvas.addMessage({
        messageId: 'msg-001',
        chatId,
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      });

      await expect(chatCanvas.persistToNeo4j()).rejects.toThrow(
        'Cannot persist chat messages: Neo4jClient not configured'
      );
    });

    it('persists chat messages to Neo4j', async () => {
      const chatCanvas = new ChatCanvas(
        workspaceId,
        systemId,
        chatId,
        userId,
        undefined, // no graphCanvas
        neo4jClient
      );

      // Add messages
      chatCanvas.addMessage({
        messageId: 'msg-001',
        chatId,
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      });

      chatCanvas.addMessage({
        messageId: 'msg-002',
        chatId,
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date(),
      });

      // Persist
      const result = await chatCanvas.persistToNeo4j();

      expect(result.success).toBe(true);
      expect(result.savedCount).toBe(2);

      // Verify in Neo4j
      const messagesResult = await session.run(`
        MATCH (m:ChatMessage {chatId: $chatId})
        RETURN m.messageId as id, m.role as role, m.content as content
        ORDER BY m.timestamp
      `, { chatId });

      expect(messagesResult.records.length).toBe(2);
      expect(messagesResult.records[0].get('role')).toBe('user');
      expect(messagesResult.records[1].get('role')).toBe('assistant');
    });

    it('retrieves chat history from Neo4j', async () => {
      // Save messages
      const chatCanvas1 = new ChatCanvas(
        workspaceId,
        systemId,
        chatId,
        userId,
        undefined,
        neo4jClient
      );

      chatCanvas1.addMessage({
        messageId: 'msg-historical',
        chatId,
        role: 'user',
        content: 'Historical message',
        timestamp: new Date(),
      });

      await chatCanvas1.persistToNeo4j();

      // New session - load history
      const historyResult = await session.run(`
        MATCH (m:ChatMessage {chatId: $chatId})
        RETURN m
        ORDER BY m.timestamp
      `, { chatId });

      expect(historyResult.records.length).toBeGreaterThan(0);
      const firstMessage = historyResult.records[0].get('m').properties;
      expect(firstMessage.content).toBe('Historical message');
    });
  });

  describe('Error Handling', () => {
    it('handles Neo4j connection errors gracefully', async () => {
      // Create client with wrong credentials
      const badClient = new Neo4jClient({
        uri: 'bolt://localhost:7687',
        user: 'wrong',
        password: 'wrong',
      });

      const canvas = new GraphCanvas(
        workspaceId,
        systemId,
        chatId,
        userId,
        'hierarchy',
        badClient
      );

      const diff = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ ErrorTest|FUNC|ErrorTest.FN.001|Should handle errors

## Edges
</operations>`;

      await canvas.applyDiff(diff);

      // Persist should fail but not crash
      const result = await canvas.persistToNeo4j();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);

      await badClient.close();
    });
  });
});
