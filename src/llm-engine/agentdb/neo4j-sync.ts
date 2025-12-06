/**
 * Neo4j Sync Layer (CR-032 Phase 5)
 *
 * Handles synchronization between AgentDB (in-memory) and Neo4j (cold storage).
 *
 * Features:
 * - Load graph from Neo4j on session start
 * - Persist graph to Neo4j on demand/shutdown
 * - Auto-persist with configurable interval
 * - Dirty tracking for incremental saves
 * - Vector/embedding persistence for similarity search
 *
 * @author andreas@siglochconsulting
 */

import { Neo4jClient } from '../../neo4j-client/neo4j-client.js';
import type { UnifiedAgentDBService } from './unified-agentdb-service.js';
import type { Node, Edge } from '../../shared/types/ontology.js';
import { AgentDBLogger } from './agentdb-logger.js';
import { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE } from '../../shared/config.js';

/**
 * Simplified graph state for sync operations (uses arrays, not Maps)
 */
interface SimplifiedGraphState {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Sync options
 */
export interface SyncOptions {
  /** Auto-persist interval in ms (0 = disabled) */
  autoPersistInterval?: number;
  /** Persist on shutdown */
  persistOnShutdown?: boolean;
  /** Persist embeddings/vectors to Neo4j (requires Neo4j 5.x with vector index) */
  persistEmbeddings?: boolean;
}

/**
 * Embedding entry for persistence
 */
export interface EmbeddingEntry {
  nodeId: string;
  embedding: number[];
  text: string;
  timestamp: number;
}

/**
 * Sync status
 */
export interface SyncStatus {
  lastLoadTime: number | null;
  lastPersistTime: number | null;
  loadedNodeCount: number;
  loadedEdgeCount: number;
  persistedNodeCount: number;
  persistedEdgeCount: number;
  isDirty: boolean;
}

/**
 * Neo4j Sync Manager
 *
 * Manages data flow between AgentDB and Neo4j.
 */
export class Neo4jSyncManager {
  private neo4j: Neo4jClient | null = null;
  private agentDB: UnifiedAgentDBService;
  private workspaceId: string;
  private systemId: string;
  private options: Required<SyncOptions>;

  private status: SyncStatus = {
    lastLoadTime: null,
    lastPersistTime: null,
    loadedNodeCount: 0,
    loadedEdgeCount: 0,
    persistedNodeCount: 0,
    persistedEdgeCount: 0,
    isDirty: false,
  };

  private autoPersistTimer: ReturnType<typeof setInterval> | null = null;
  private versionAtLastPersist: number = 0;
  private unsubscribeGraphChange: (() => void) | null = null;

  constructor(
    agentDB: UnifiedAgentDBService,
    workspaceId: string,
    systemId: string,
    options: SyncOptions = {}
  ) {
    this.agentDB = agentDB;
    this.workspaceId = workspaceId;
    this.systemId = systemId;
    this.options = {
      autoPersistInterval: options.autoPersistInterval ?? 0,
      persistOnShutdown: options.persistOnShutdown ?? true,
      persistEmbeddings: options.persistEmbeddings ?? false,
    };
  }

  /**
   * Initialize Neo4j connection
   */
  async initialize(): Promise<void> {
    this.neo4j = new Neo4jClient({
      uri: NEO4J_URI,
      user: NEO4J_USER,
      password: NEO4J_PASSWORD,
      database: NEO4J_DATABASE,
    });

    const connected = await this.neo4j.verifyConnection();
    if (!connected) {
      throw new Error('Failed to connect to Neo4j');
    }

    // Subscribe to graph changes for dirty tracking
    this.unsubscribeGraphChange = this.agentDB.onGraphChange(() => {
      this.status.isDirty = true;
    });

    // Start auto-persist if configured
    if (this.options.autoPersistInterval > 0) {
      this.startAutoPersist();
    }

    AgentDBLogger.info(`Neo4jSyncManager initialized for ${this.workspaceId}/${this.systemId}`);
  }

  /**
   * Load graph from Neo4j into AgentDB
   */
  async loadFromNeo4j(): Promise<{ nodeCount: number; edgeCount: number }> {
    if (!this.neo4j) {
      throw new Error('Neo4jSyncManager not initialized');
    }

    const startTime = Date.now();

    // Load from Neo4j
    const { nodes, edges } = await this.neo4j.loadGraph({
      workspaceId: this.workspaceId,
      systemId: this.systemId,
    });

    // Clear current AgentDB data and load new data
    this.agentDB.clearGraph();

    const state: SimplifiedGraphState = { nodes, edges };
    this.agentDB.loadFromState(state);

    // Update status
    this.status.lastLoadTime = Date.now();
    this.status.loadedNodeCount = nodes.length;
    this.status.loadedEdgeCount = edges.length;
    this.status.isDirty = false;
    this.versionAtLastPersist = this.agentDB.getGraphVersion();

    const loadTime = Date.now() - startTime;
    AgentDBLogger.info(
      `Loaded ${nodes.length} nodes, ${edges.length} edges from Neo4j in ${loadTime}ms`
    );

    return { nodeCount: nodes.length, edgeCount: edges.length };
  }

  /**
   * Persist AgentDB graph to Neo4j
   */
  async persistToNeo4j(): Promise<{ nodeCount: number; edgeCount: number }> {
    if (!this.neo4j) {
      throw new Error('Neo4jSyncManager not initialized');
    }

    // Skip if not dirty
    const currentVersion = this.agentDB.getGraphVersion();
    if (currentVersion === this.versionAtLastPersist && !this.status.isDirty) {
      AgentDBLogger.debug('Skip persist - no changes since last persist');
      return { nodeCount: 0, edgeCount: 0 };
    }

    const startTime = Date.now();

    // Get current state from AgentDB (returns GraphState with Maps)
    const state = this.agentDB.toGraphState();

    // Convert Maps to arrays for Neo4j client
    const nodesArray = Array.from(state.nodes.values());
    const edgesArray = Array.from(state.edges.values());

    // Save nodes
    const nodeResult = await this.neo4j.saveNodes(nodesArray);
    if (!nodeResult.success) {
      throw new Error(`Failed to save nodes: ${nodeResult.errors?.join(', ')}`);
    }

    // Save edges
    const edgeResult = await this.neo4j.saveEdges(edgesArray);
    if (!edgeResult.success) {
      throw new Error(`Failed to save edges: ${edgeResult.errors?.join(', ')}`);
    }

    // Update status
    this.status.lastPersistTime = Date.now();
    this.status.persistedNodeCount = nodeResult.nodeCount;
    this.status.persistedEdgeCount = edgeResult.edgeCount;
    this.status.isDirty = false;
    this.versionAtLastPersist = currentVersion;

    const persistTime = Date.now() - startTime;
    AgentDBLogger.info(
      `Persisted ${nodeResult.nodeCount} nodes, ${edgeResult.edgeCount} edges to Neo4j in ${persistTime}ms`
    );

    return {
      nodeCount: nodeResult.nodeCount,
      edgeCount: edgeResult.edgeCount,
    };
  }

  /**
   * Persist embeddings to Neo4j (requires Neo4j 5.x with vector index)
   *
   * Creates/updates Embedding nodes with vector properties.
   * Use CALL db.index.vector.createNodeIndex() to create vector index.
   */
  async persistEmbeddings(embeddings: EmbeddingEntry[]): Promise<number> {
    if (!this.neo4j) {
      throw new Error('Neo4jSyncManager not initialized');
    }

    if (embeddings.length === 0) return 0;

    const startTime = Date.now();

    // Save embeddings using batch query
    // Neo4j 5.x vector format: list of floats
    const query = `
      UNWIND $embeddings AS e
      MERGE (emb:Embedding {nodeId: e.nodeId})
      SET emb.embedding = e.embedding,
          emb.text = e.text,
          emb.workspaceId = $workspaceId,
          emb.systemId = $systemId,
          emb.timestamp = datetime(e.timestamp)
      RETURN count(emb) as count
    `;

    const result = await this.neo4j.query<{ count: { toNumber: () => number } }>(query, {
      embeddings: embeddings.map(e => ({
        nodeId: e.nodeId,
        embedding: e.embedding,
        text: e.text,
        timestamp: new Date(e.timestamp).toISOString(),
      })),
      workspaceId: this.workspaceId,
      systemId: this.systemId,
    });

    const count = result[0]?.count?.toNumber?.() ?? embeddings.length;
    const persistTime = Date.now() - startTime;

    AgentDBLogger.info(`Persisted ${count} embeddings to Neo4j in ${persistTime}ms`);

    return count;
  }

  /**
   * Load embeddings from Neo4j
   */
  async loadEmbeddings(): Promise<EmbeddingEntry[]> {
    if (!this.neo4j) {
      throw new Error('Neo4jSyncManager not initialized');
    }

    const query = `
      MATCH (emb:Embedding)
      WHERE emb.workspaceId = $workspaceId
        AND emb.systemId = $systemId
      RETURN emb.nodeId as nodeId,
             emb.embedding as embedding,
             emb.text as text,
             emb.timestamp as timestamp
    `;

    const result = await this.neo4j.query<{
      nodeId: string;
      embedding: number[];
      text: string;
      timestamp: { toNumber?: () => number };
    }>(query, {
      workspaceId: this.workspaceId,
      systemId: this.systemId,
    });

    return result.map(r => ({
      nodeId: r.nodeId,
      embedding: r.embedding,
      text: r.text,
      timestamp: r.timestamp?.toNumber?.() ?? Date.now(),
    }));
  }

  /**
   * Delete embeddings for removed nodes
   */
  async deleteEmbeddings(nodeIds: string[]): Promise<number> {
    if (!this.neo4j || nodeIds.length === 0) return 0;

    const query = `
      MATCH (emb:Embedding)
      WHERE emb.nodeId IN $nodeIds
        AND emb.workspaceId = $workspaceId
        AND emb.systemId = $systemId
      DELETE emb
      RETURN count(emb) as count
    `;

    const result = await this.neo4j.query<{ count: { toNumber: () => number } }>(query, {
      nodeIds,
      workspaceId: this.workspaceId,
      systemId: this.systemId,
    });

    return result[0]?.count?.toNumber?.() ?? 0;
  }

  /**
   * Start auto-persist timer
   */
  private startAutoPersist(): void {
    if (this.autoPersistTimer) {
      clearInterval(this.autoPersistTimer);
    }

    this.autoPersistTimer = setInterval(async () => {
      if (this.status.isDirty) {
        try {
          await this.persistToNeo4j();
        } catch (error) {
          AgentDBLogger.error('Auto-persist failed', error as Error);
        }
      }
    }, this.options.autoPersistInterval);

    AgentDBLogger.debug(`Auto-persist enabled: ${this.options.autoPersistInterval}ms interval`);
  }

  /**
   * Stop auto-persist timer
   */
  private stopAutoPersist(): void {
    if (this.autoPersistTimer) {
      clearInterval(this.autoPersistTimer);
      this.autoPersistTimer = null;
    }
  }

  /**
   * Get sync status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Check if there are unsaved changes
   */
  isDirty(): boolean {
    return this.status.isDirty;
  }

  /**
   * Shutdown sync manager
   */
  async shutdown(): Promise<void> {
    // Stop auto-persist
    this.stopAutoPersist();

    // Unsubscribe from graph changes
    if (this.unsubscribeGraphChange) {
      this.unsubscribeGraphChange();
      this.unsubscribeGraphChange = null;
    }

    // Persist on shutdown if configured and dirty
    if (this.options.persistOnShutdown && this.status.isDirty) {
      try {
        await this.persistToNeo4j();
      } catch (error) {
        AgentDBLogger.error('Persist on shutdown failed', error as Error);
      }
    }

    // Close Neo4j connection
    if (this.neo4j) {
      await this.neo4j.close();
      this.neo4j = null;
    }

    AgentDBLogger.info('Neo4jSyncManager shutdown complete');
  }
}

/**
 * Create a Neo4j sync manager
 */
export function createNeo4jSyncManager(
  agentDB: UnifiedAgentDBService,
  workspaceId: string,
  systemId: string,
  options?: SyncOptions
): Neo4jSyncManager {
  return new Neo4jSyncManager(agentDB, workspaceId, systemId, options);
}
