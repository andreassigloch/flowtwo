/**
 * Neo4j Client
 *
 * Database client for graph and chat persistence
 *
 * Features:
 * - Connection management with pooling
 * - Graph CRUD operations
 * - Chat message persistence
 * - Audit log tracking
 * - Transaction support
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import type {
  Neo4jConfig,
  BatchPersistResult,
  GraphQueryOptions,
  ChatQueryOptions,
  AuditLogEntry,
  GraphStats,
} from '../shared/types/neo4j.js';
import type { Node, Edge, Message } from '../shared/types/ontology.js';

/**
 * Neo4j Client
 *
 * Manages database connections and provides persistence operations
 */
export class Neo4jClient {
  private driver: Driver;
  private config: Required<Neo4jConfig>;

  constructor(config: Neo4jConfig) {
    this.config = {
      uri: config.uri,
      user: config.user,
      password: config.password,
      database: config.database || 'neo4j',
      maxConnectionPoolSize: config.maxConnectionPoolSize || 50,
      connectionTimeout: config.connectionTimeout || 30000,
    };

    this.driver = neo4j.driver(this.config.uri, neo4j.auth.basic(this.config.user, this.config.password), {
      maxConnectionPoolSize: this.config.maxConnectionPoolSize,
      connectionTimeout: this.config.connectionTimeout,
    });
  }

  /**
   * Get database session
   */
  private getSession(): Session {
    return this.driver.session({ database: this.config.database });
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.driver.close();
  }

  /**
   * Verify connection
   */
  async verifyConnection(): Promise<boolean> {
    const session = this.getSession();
    try {
      await session.run('RETURN 1');
      return true;
    } catch (error) {
      console.error('Neo4j connection failed:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * Run a raw Cypher query
   */
  async query<T = Record<string, unknown>>(cypher: string, params?: Record<string, unknown>): Promise<T[]> {
    const session = this.getSession();
    try {
      const result = await session.run(cypher, params);
      return result.records.map(record => {
        const obj: Record<string, unknown> = {};
        record.keys.forEach(key => {
          obj[String(key)] = record.get(key);
        });
        return obj as T;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Save nodes in batch
   */
  async saveNodes(nodes: Node[]): Promise<BatchPersistResult> {
    const session = this.getSession();
    const startTime = Date.now();

    try {
      // Build batch query - uuid equals semanticId for nodes
      const query = `
        UNWIND $nodes AS nodeData
        MERGE (n:Node {uuid: nodeData.uuid})
        SET n.semanticId = nodeData.semanticId,
            n.type = nodeData.type,
            n.name = nodeData.name,
            n.descr = nodeData.descr,
            n.workspaceId = nodeData.workspaceId,
            n.systemId = nodeData.systemId,
            n.position = nodeData.position,
            n.zoomLevel = nodeData.zoomLevel,
            n.createdAt = datetime(nodeData.createdAt),
            n.updatedAt = datetime(nodeData.updatedAt),
            n.createdBy = nodeData.createdBy
        RETURN count(n) as count
      `;

      const parameters = {
        nodes: nodes.map((node) => ({
          uuid: node.uuid,
          semanticId: node.semanticId,
          type: node.type,
          name: node.name,
          descr: node.descr || '',
          workspaceId: node.workspaceId,
          systemId: node.systemId,
          position: node.position ? JSON.stringify(node.position) : null,
          zoomLevel: node.zoomLevel || 'L2',
          createdAt: node.createdAt.toISOString(),
          updatedAt: node.updatedAt.toISOString(),
          createdBy: node.createdBy,
        })),
      };

      const result = await session.run(query, parameters);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        nodeCount: result.records[0]?.get('count').toNumber() || 0,
        edgeCount: 0,
        messageCount: 0,
        executionTime,
      };
    } catch (error) {
      console.error('Failed to save nodes:', error);
      return {
        success: false,
        nodeCount: 0,
        edgeCount: 0,
        messageCount: 0,
        executionTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Save edges in batch
   */
  async saveEdges(edges: Edge[]): Promise<BatchPersistResult> {
    const session = this.getSession();
    const startTime = Date.now();

    try {
      // Build batch query
      // Note: No semanticId stored - edges keyed by composite ${sourceId}-${type}-${targetId} in canvas
      const query = `
        UNWIND $edges AS edgeData
        MATCH (source:Node {semanticId: edgeData.sourceId})
        MATCH (target:Node {semanticId: edgeData.targetId})
        MERGE (source)-[r:EDGE {uuid: edgeData.uuid}]->(target)
        SET r.type = edgeData.type,
            r.workspaceId = edgeData.workspaceId,
            r.systemId = edgeData.systemId,
            r.createdAt = datetime(edgeData.createdAt),
            r.updatedAt = datetime(edgeData.updatedAt),
            r.createdBy = edgeData.createdBy
        RETURN count(r) as count
      `;

      const parameters = {
        edges: edges.map((edge) => ({
          uuid: edge.uuid,
          type: edge.type,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          workspaceId: edge.workspaceId,
          systemId: edge.systemId,
          createdAt: edge.createdAt.toISOString(),
          updatedAt: edge.updatedAt.toISOString(),
          createdBy: edge.createdBy,
        })),
      };

      const result = await session.run(query, parameters);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        nodeCount: 0,
        edgeCount: result.records[0]?.get('count').toNumber() || 0,
        messageCount: 0,
        executionTime,
      };
    } catch (error) {
      console.error('Failed to save edges:', error);
      return {
        success: false,
        nodeCount: 0,
        edgeCount: 0,
        messageCount: 0,
        executionTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Save messages in batch
   */
  async saveMessages(messages: Message[]): Promise<BatchPersistResult> {
    const session = this.getSession();
    const startTime = Date.now();

    try {
      const query = `
        UNWIND $messages AS msgData
        MERGE (m:Message {messageId: msgData.messageId})
        SET m.chatId = msgData.chatId,
            m.workspaceId = msgData.workspaceId,
            m.systemId = msgData.systemId,
            m.userId = msgData.userId,
            m.role = msgData.role,
            m.content = msgData.content,
            m.operations = msgData.operations,
            m.timestamp = datetime(msgData.timestamp)
        RETURN count(m) as count
      `;

      const parameters = {
        messages: messages.map((msg) => ({
          messageId: msg.messageId,
          chatId: msg.chatId,
          workspaceId: msg.workspaceId,
          systemId: msg.systemId,
          userId: msg.userId,
          role: msg.role,
          content: msg.content,
          operations: msg.operations || null,
          timestamp: msg.timestamp.toISOString(),
        })),
      };

      const result = await session.run(query, parameters);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        nodeCount: 0,
        edgeCount: 0,
        messageCount: result.records[0]?.get('count').toNumber() || 0,
        executionTime,
      };
    } catch (error) {
      console.error('Failed to save messages:', error);
      return {
        success: false,
        nodeCount: 0,
        edgeCount: 0,
        messageCount: 0,
        executionTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Load graph from database
   */
  async loadGraph(options: GraphQueryOptions): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const session = this.getSession();

    try {
      // Load nodes
      const nodeQuery = `
        MATCH (n:Node)
        WHERE n.workspaceId = $workspaceId
          AND n.systemId = $systemId
          ${options.nodeTypes ? 'AND n.type IN $nodeTypes' : ''}
        RETURN n
      `;

      const nodeResult = await session.run(nodeQuery, {
        workspaceId: options.workspaceId,
        systemId: options.systemId,
        nodeTypes: options.nodeTypes || [],
      });

      const nodes: Node[] = nodeResult.records.map((record) => {
        const n = record.get('n').properties;
        return {
          uuid: n.uuid,
          semanticId: n.semanticId,
          type: n.type,
          name: n.name,
          descr: n.descr || '',
          workspaceId: n.workspaceId,
          systemId: n.systemId,
          position: n.position ? JSON.parse(n.position) : undefined,
          zoomLevel: n.zoomLevel || 'L2',
          createdAt: new Date(n.createdAt),
          updatedAt: new Date(n.updatedAt),
          createdBy: n.createdBy,
        };
      });

      // Load edges
      const edgeQuery = `
        MATCH (source:Node)-[r:EDGE]->(target:Node)
        WHERE r.workspaceId = $workspaceId
          AND r.systemId = $systemId
          ${options.edgeTypes ? 'AND r.type IN $edgeTypes' : ''}
        RETURN r, source.semanticId as sourceId, target.semanticId as targetId
      `;

      const edgeResult = await session.run(edgeQuery, {
        workspaceId: options.workspaceId,
        systemId: options.systemId,
        edgeTypes: options.edgeTypes || [],
      });

      const edges: Edge[] = edgeResult.records.map((record) => {
        const r = record.get('r').properties;
        return {
          uuid: r.uuid,
          // No semanticId - composite key derived from sourceId-type-targetId
          type: r.type,
          sourceId: record.get('sourceId'),
          targetId: record.get('targetId'),
          workspaceId: r.workspaceId,
          systemId: r.systemId,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
          createdBy: r.createdBy,
        };
      });

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  /**
   * Load chat messages
   */
  async loadMessages(options: ChatQueryOptions): Promise<Message[]> {
    const session = this.getSession();

    try {
      const query = `
        MATCH (m:Message)
        WHERE m.chatId = $chatId
          AND m.workspaceId = $workspaceId
          AND m.systemId = $systemId
        RETURN m
        ORDER BY m.timestamp ASC
        ${options.limit ? 'LIMIT $limit' : ''}
        ${options.offset ? 'SKIP $offset' : ''}
      `;

      const result = await session.run(query, {
        chatId: options.chatId,
        workspaceId: options.workspaceId,
        systemId: options.systemId,
        limit: options.limit || null,
        offset: options.offset || 0,
      });

      return result.records.map((record) => {
        const m = record.get('m').properties;
        return {
          messageId: m.messageId,
          chatId: m.chatId,
          workspaceId: m.workspaceId,
          systemId: m.systemId,
          userId: m.userId,
          role: m.role,
          content: m.content,
          operations: m.operations || undefined,
          timestamp: new Date(m.timestamp),
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Create audit log entry
   */
  async createAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const session = this.getSession();

    try {
      const query = `
        CREATE (a:AuditLog {
          id: randomUUID(),
          chatId: $chatId,
          workspaceId: $workspaceId,
          systemId: $systemId,
          userId: $userId,
          action: $action,
          diff: $diff,
          timestamp: datetime(),
          metadata: $metadata
        })
      `;

      await session.run(query, {
        chatId: entry.chatId,
        workspaceId: entry.workspaceId,
        systemId: entry.systemId,
        userId: entry.userId,
        action: entry.action,
        diff: entry.diff,
        metadata: JSON.stringify(entry.metadata || {}),
      });
    } finally {
      await session.close();
    }
  }

  /**
   * List all systems in workspace
   */
  async listSystems(workspaceId: string): Promise<Array<{ systemId: string; nodeCount: number }>> {
    const session = this.getSession();

    try {
      // Query for both :Node and :OntologyNode labels
      // Filter out null systemIds (from legacy data)
      const query = `
        MATCH (n)
        WHERE (n:Node OR n:OntologyNode)
          AND n.workspaceId = $workspaceId
          AND n.systemId IS NOT NULL
        WITH DISTINCT n.systemId as systemId, count(n) as nodeCount
        WHERE systemId IS NOT NULL
        RETURN systemId, nodeCount
        ORDER BY systemId
      `;

      const result = await session.run(query, { workspaceId });

      return result.records
        .map((record) => ({
          systemId: record.get('systemId'),
          nodeCount: record.get('nodeCount').toNumber(),
        }))
        .filter((sys) => sys.systemId !== null && sys.systemId !== undefined);
    } finally {
      await session.close();
    }
  }

  /**
   * Get graph statistics
   */
  async getGraphStats(workspaceId: string, systemId: string): Promise<GraphStats> {
    const session = this.getSession();

    try {
      const query = `
        MATCH (n:Node)
        WHERE n.workspaceId = $workspaceId
          AND n.systemId = $systemId
        WITH n.type as type, count(n) as count
        RETURN collect({type: type, count: count}) as nodesByType,
               sum(count) as totalNodes
        UNION
        MATCH ()-[r:EDGE]->()
        WHERE r.workspaceId = $workspaceId
          AND r.systemId = $systemId
        WITH r.type as type, count(r) as count
        RETURN collect({type: type, count: count}) as edgesByType,
               sum(count) as totalEdges
      `;

      const result = await session.run(query, { workspaceId, systemId });

      // Parse results
      let nodeCount = 0;
      let edgeCount = 0;
      const nodesByType: Record<string, number> = {};
      const edgesByType: Record<string, number> = {};

      for (const record of result.records) {
        if (record.has('nodesByType')) {
          const types = record.get('nodesByType');
          nodeCount = record.get('totalNodes').toNumber();
          types.forEach((t: any) => {
            nodesByType[t.type] = t.count.toNumber();
          });
        }
        if (record.has('edgesByType')) {
          const types = record.get('edgesByType');
          edgeCount = record.get('totalEdges').toNumber();
          types.forEach((t: any) => {
            edgesByType[t.type] = t.count.toNumber();
          });
        }
      }

      return {
        nodeCount,
        edgeCount,
        nodesByType,
        edgesByType,
        lastModified: new Date(),
      };
    } finally {
      await session.close();
    }
  }
}
