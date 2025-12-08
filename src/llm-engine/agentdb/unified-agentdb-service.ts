/**
 * Unified AgentDB Service (CR-032)
 *
 * Single Source of Truth for all graph data.
 * Extends AgentDBService with Graph Store CRUD operations.
 *
 * Key Features:
 * - Graph Store with CRUD and uniqueness constraints
 * - Version-aware response caching
 * - Unified cache invalidation on graph changes
 * - Episodic memory for agent learning
 *
 * @author andreas@siglochconsulting
 */

import { EventEmitter } from 'events';
import { AGENTDB_CACHE_TTL, AGENTDB_SIMILARITY_THRESHOLD, AGENTDB_BACKEND } from '../../shared/config.js';
import { createBackend } from './backend-factory.js';
import { GraphStore, type NodeFilter, type EdgeFilter, type SetOptions, type GraphChangeEvent } from './graph-store.js';
import { VariantPool, type GraphDiff, type VariantInfo, type GraphState as VariantGraphState } from './variant-pool.js';
import { EmbeddingStore, type EmbeddableNode, type EmbeddingEntry } from './embedding-store.js';
import type { AgentDBBackend, CachedResponse, Episode, CacheMetrics, UnifiedAgentDBAPI } from './types.js';
import type { Node, Edge, SemanticId, GraphState } from '../../shared/types/ontology.js';
import { AgentDBLogger } from './agentdb-logger.js';

/**
 * Versioned cache key generator
 */
function makeCacheKey(query: string, graphVersion: number): string {
  return `${query}::v${graphVersion}`;
}

/**
 * Unified AgentDB Service - Single Source of Truth
 *
 * All graph reads/writes go through this service.
 * Canvas delegates to this, Validation reads from this.
 */
export class UnifiedAgentDBService extends EventEmitter implements UnifiedAgentDBAPI {
  private backend: AgentDBBackend | null = null;
  private initialized = false;
  private graphStore: GraphStore | null = null;
  private variantPool: VariantPool | null = null;
  private embeddingStore: EmbeddingStore | null = null;

  // Version-aware cache: Map<cacheKey, CachedResponse>
  private versionedCache: Map<string, CachedResponse> = new Map();

  // Track which graph versions are cached (for invalidation)
  private cachedVersions: Set<number> = new Set();

  /**
   * Initialize the service with a specific workspace/system
   */
  async initialize(workspaceId: string, systemId: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.backend = await createBackend();
    this.graphStore = new GraphStore(workspaceId, systemId);
    this.variantPool = new VariantPool();
    this.embeddingStore = new EmbeddingStore();

    // Subscribe to graph changes for cache invalidation
    this.graphStore.onGraphChange((event) => {
      this.handleGraphChange(event);
    });

    this.initialized = true;
    AgentDBLogger.info(`UnifiedAgentDBService initialized for ${workspaceId}/${systemId}`);
  }

  /**
   * Handle graph changes - invalidate stale caches
   */
  private handleGraphChange(event: GraphChangeEvent): void {
    const newVersion = event.version;

    // Invalidate all cache entries for old versions
    for (const version of this.cachedVersions) {
      if (version < newVersion) {
        // Remove all entries for this old version
        for (const [key] of this.versionedCache) {
          if (key.includes(`::v${version}`)) {
            this.versionedCache.delete(key);
          }
        }
        this.cachedVersions.delete(version);
      }
    }

    // Invalidate embedding for changed nodes
    if (event.type === 'node_update' || event.type === 'node_delete') {
      this.embeddingStore?.invalidate(event.id);
    }

    // Emit change event for external subscribers (e.g., WebSocket broadcast)
    this.emit('graphChange', event);
  }

  // ============================================================
  // Graph Store API (delegate to GraphStore)
  // ============================================================

  getNode(semanticId: SemanticId): Node | null {
    this.ensureInitialized();
    return this.graphStore!.getNode(semanticId);
  }

  setNode(node: Node, options?: SetOptions): void {
    this.ensureInitialized();
    this.graphStore!.setNode(node, options);
  }

  deleteNode(semanticId: SemanticId): boolean {
    this.ensureInitialized();
    return this.graphStore!.deleteNode(semanticId);
  }

  getNodes(filter?: NodeFilter): Node[] {
    this.ensureInitialized();
    return this.graphStore!.getNodes(filter);
  }

  getEdge(uuid: string): Edge | null {
    this.ensureInitialized();
    return this.graphStore!.getEdge(uuid);
  }

  getEdgeByKey(sourceId: SemanticId, type: string, targetId: SemanticId): Edge | null {
    this.ensureInitialized();
    return this.graphStore!.getEdgeByKey(sourceId, type, targetId);
  }

  setEdge(edge: Edge, options?: SetOptions): void {
    this.ensureInitialized();
    this.graphStore!.setEdge(edge, options);
  }

  deleteEdge(uuid: string): boolean {
    this.ensureInitialized();
    return this.graphStore!.deleteEdge(uuid);
  }

  getEdges(filter?: EdgeFilter): Edge[] {
    this.ensureInitialized();
    return this.graphStore!.getEdges(filter);
  }

  getGraphVersion(): number {
    this.ensureInitialized();
    return this.graphStore!.getVersion();
  }

  onGraphChange(callback: (event: GraphChangeEvent) => void): () => void {
    this.ensureInitialized();
    return this.graphStore!.onGraphChange(callback);
  }

  /**
   * Get edges for a specific node
   */
  getNodeEdges(semanticId: SemanticId, direction?: 'in' | 'out'): Edge[] {
    this.ensureInitialized();
    return this.graphStore!.getNodeEdges(semanticId, direction);
  }

  /**
   * Export graph as GraphState
   */
  toGraphState(): GraphState {
    this.ensureInitialized();
    return this.graphStore!.toGraphState();
  }

  /**
   * Load graph data from GraphState (e.g., from Neo4j)
   * Accepts either full GraphState or simplified { nodes, edges } format
   */
  loadFromState(state: GraphState | { nodes: Node[]; edges: Edge[] }): void {
    this.ensureInitialized();
    this.graphStore!.loadFromState(state);
  }

  /**
   * Clear all graph data
   */
  clearGraph(): void {
    this.ensureInitialized();
    this.graphStore!.clear();
  }

  /**
   * Get graph statistics
   */
  getGraphStats(): { nodeCount: number; edgeCount: number; version: number } {
    this.ensureInitialized();
    return this.graphStore!.getStats();
  }

  // ============================================================
  // Variant Pool API (for optimization experiments)
  // ============================================================

  /**
   * Create a variant from current graph state
   */
  createVariant(): string {
    this.ensureInitialized();
    const state = this.graphStore!.toGraphState();
    const systemId = this.graphStore!.getSystemId();

    // Convert to VariantGraphState format (state.nodes/edges are already Maps)
    const variantState: VariantGraphState = {
      nodes: new Map(state.nodes),
      edges: new Map(state.edges),
      version: state.version,
    };

    return this.variantPool!.createVariant(systemId, variantState);
  }

  /**
   * Get variant state
   */
  getVariant(variantId: string): { nodes: Node[]; edges: Edge[]; version: number } | null {
    this.ensureInitialized();
    const state = this.variantPool!.getVariant(variantId);
    if (!state) return null;

    return {
      nodes: Array.from(state.nodes.values()),
      edges: Array.from(state.edges.values()),
      version: state.version,
    };
  }

  /**
   * Apply changes to a variant
   */
  applyToVariant(variantId: string, diff: GraphDiff): void {
    this.ensureInitialized();
    this.variantPool!.applyToVariant(variantId, diff);
  }

  /**
   * Promote variant to main graph (replaces current graph state)
   */
  promoteVariant(variantId: string): void {
    this.ensureInitialized();
    const promoted = this.variantPool!.promoteVariant(variantId);

    // Clear current graph and load promoted state
    this.graphStore!.clear();
    // loadFromState accepts both Map-based and array-based state
    const state = {
      nodes: Array.from(promoted.nodes.values()),
      edges: Array.from(promoted.edges.values()),
    };
    this.graphStore!.loadFromState(state);
  }

  /**
   * Discard a variant
   */
  discardVariant(variantId: string): void {
    this.ensureInitialized();
    this.variantPool!.discardVariant(variantId);
  }

  /**
   * List all variants
   */
  listVariants(): VariantInfo[] {
    this.ensureInitialized();
    return this.variantPool!.listVariants();
  }

  /**
   * Compare two variants
   */
  compareVariants(variantIdA: string, variantIdB: string): {
    nodesDiff: { added: string[]; removed: string[]; modified: string[] };
    edgesDiff: { added: string[]; removed: string[]; modified: string[] };
  } {
    this.ensureInitialized();
    return this.variantPool!.compareVariants(variantIdA, variantIdB);
  }

  /**
   * Get variant pool memory usage
   */
  getVariantPoolUsage(): {
    totalVariants: number;
    byTier: Record<string, number>;
    estimatedBytes: number;
  } {
    this.ensureInitialized();
    return this.variantPool!.getMemoryUsage();
  }

  // ============================================================
  // Embedding Store API (for SimilarityScorer)
  // ============================================================

  /**
   * Get embedding for a node (lazy computation, cached)
   */
  async getEmbedding(node: EmbeddableNode): Promise<number[]> {
    this.ensureInitialized();
    return this.embeddingStore!.getEmbedding(node);
  }

  /**
   * Get cached embedding without API call (returns null if not cached)
   */
  getCachedEmbedding(nodeId: string): number[] | null {
    this.ensureInitialized();
    return this.embeddingStore!.getCachedEmbedding(nodeId);
  }

  /**
   * Batch compute embeddings for multiple nodes (single API call)
   */
  async batchComputeEmbeddings(nodes: EmbeddableNode[]): Promise<void> {
    this.ensureInitialized();
    return this.embeddingStore!.batchCompute(nodes);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    this.ensureInitialized();
    return this.embeddingStore!.cosineSimilarity(a, b);
  }

  /**
   * Invalidate embedding for a node
   */
  invalidateEmbedding(nodeId: string): void {
    this.ensureInitialized();
    this.embeddingStore!.invalidate(nodeId);
  }

  /**
   * Clear all cached embeddings
   */
  clearEmbeddings(): void {
    this.ensureInitialized();
    this.embeddingStore!.clear();
  }

  /**
   * Load embeddings from external source (e.g., Neo4j)
   */
  loadEmbeddings(entries: EmbeddingEntry[]): void {
    this.ensureInitialized();
    this.embeddingStore!.loadFromEntries(entries);
  }

  /**
   * Export all embeddings for persistence
   */
  exportEmbeddings(): EmbeddingEntry[] {
    this.ensureInitialized();
    return this.embeddingStore!.exportEntries();
  }

  /**
   * Get embedding cache statistics
   */
  getEmbeddingStats(): { size: number; oldestMs: number } {
    this.ensureInitialized();
    return this.embeddingStore!.getStats();
  }

  // ============================================================
  // Version-Aware Response Cache
  // ============================================================

  /**
   * Check cache for semantically similar query WITH graph version
   *
   * Different graph state = different cache entry (no stale results)
   */
  async checkCache(
    query: string,
    graphVersion: number
  ): Promise<{ response: string; operations: string | null } | null> {
    this.ensureInitialized();

    // First try exact version match in local cache
    const cacheKey = makeCacheKey(query, graphVersion);
    const localCached = this.versionedCache.get(cacheKey);

    if (localCached) {
      const age = Date.now() - localCached.timestamp;
      if (age <= AGENTDB_CACHE_TTL * 1000) {
        AgentDBLogger.cacheHit(query, 1.0, AGENTDB_BACKEND);
        return {
          response: localCached.response,
          operations: localCached.operations,
        };
      }
      // Expired - remove
      this.versionedCache.delete(cacheKey);
    }

    // Fall back to semantic search in backend (but still version-aware)
    const results = await this.backend!.vectorSearch(query, AGENTDB_SIMILARITY_THRESHOLD, 1);

    if (results.length > 0 && results[0].similarity >= AGENTDB_SIMILARITY_THRESHOLD) {
      // Check if cached result is for same graph version
      const cachedVersion = results[0].metadata?.graphVersion;
      if (cachedVersion === graphVersion) {
        AgentDBLogger.cacheHit(query, results[0].similarity, AGENTDB_BACKEND);
        return {
          response: results[0].content,
          operations: results[0].metadata.operations || null,
        };
      }
      // Different version - cache miss (stale data)
      AgentDBLogger.debug(`Cache miss: query found but version mismatch (cached=${cachedVersion}, current=${graphVersion})`);
    }

    AgentDBLogger.cacheMiss(query, AGENTDB_BACKEND);
    return null;
  }

  /**
   * Store LLM response in cache WITH graph version
   */
  async cacheResponse(
    query: string,
    graphVersion: number,
    response: string,
    operations: string | null
  ): Promise<void> {
    this.ensureInitialized();

    const cached: CachedResponse = {
      query,
      response,
      operations,
      timestamp: Date.now(),
      ttl: AGENTDB_CACHE_TTL * 1000,
    };

    // Store in local versioned cache
    const cacheKey = makeCacheKey(query, graphVersion);
    this.versionedCache.set(cacheKey, cached);
    this.cachedVersions.add(graphVersion);

    // Also store in backend with version metadata
    await this.backend!.cacheResponse({
      ...cached,
      // Store version in operations field for backend retrieval
      operations: JSON.stringify({ graphVersion, operations }),
    });
  }

  // ============================================================
  // Episodic Memory (Reflexion)
  // ============================================================

  async storeEpisode(
    agentId: string,
    task: string,
    success: boolean,
    output: unknown,
    critique?: string
  ): Promise<void> {
    this.ensureInitialized();

    const episode: Episode = {
      agentId,
      task,
      reward: success ? 1.0 : 0.0,
      success,
      critique: critique || (success ? 'Success' : 'Failed'),
      output,
      timestamp: Date.now(),
    };

    await this.backend!.storeEpisode(episode);
  }

  async loadAgentContext(agentId: string, task?: string, k: number = 5): Promise<Episode[]> {
    this.ensureInitialized();
    return this.backend!.retrieveEpisodes(agentId, task, k);
  }

  // ============================================================
  // Metrics
  // ============================================================

  async getMetrics(): Promise<CacheMetrics> {
    this.ensureInitialized();

    const metrics = await this.backend!.getMetrics();

    AgentDBLogger.metrics(
      metrics.cacheHits,
      metrics.cacheMisses,
      metrics.cacheHitRate,
      metrics.episodesStored,
      metrics.tokensSaved,
      metrics.costSavings,
      AGENTDB_BACKEND
    );

    return metrics;
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async cleanup(): Promise<void> {
    if (!this.backend) return;
    await this.backend.cleanup();
  }

  async shutdown(): Promise<void> {
    if (!this.backend) return;

    await this.backend.shutdown();
    this.graphStore?.removeAllListeners();
    this.variantPool?.clear();
    this.embeddingStore?.clear();
    this.removeAllListeners();

    this.initialized = false;
    this.backend = null;
    this.graphStore = null;
    this.variantPool = null;
    this.embeddingStore = null;
    this.versionedCache.clear();
    this.cachedVersions.clear();
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.graphStore || !this.backend) {
      throw new Error('UnifiedAgentDBService not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// ============================================================
// Singleton Management
// ============================================================

// Map of workspace/system -> service instance
const serviceInstances: Map<string, UnifiedAgentDBService> = new Map();

/**
 * Get or create UnifiedAgentDBService for a workspace/system pair
 */
export async function getUnifiedAgentDBService(
  workspaceId: string,
  systemId: string
): Promise<UnifiedAgentDBService> {
  const key = `${workspaceId}::${systemId}`;

  let service = serviceInstances.get(key);
  if (!service) {
    service = new UnifiedAgentDBService();
    await service.initialize(workspaceId, systemId);
    serviceInstances.set(key, service);
  }

  return service;
}

/**
 * Shutdown all service instances
 */
export async function shutdownAllServices(): Promise<void> {
  for (const service of serviceInstances.values()) {
    await service.shutdown();
  }
  serviceInstances.clear();
}
