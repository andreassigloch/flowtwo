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
import { ChangeTracker, type ChangeStatus, type TrackedChange, type ChangeSummary } from './change-tracker.js';
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
  private changeTracker: ChangeTracker | null = null;

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
    this.changeTracker = new ChangeTracker();

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
   * Clear data for system load (CR-032)
   *
   * Clears graph-related data but preserves:
   * - variantPool (user-created optimization variants)
   * - backend/episodes (learning history for Reflexion)
   *
   * Use this before loading a new system to prevent duplicates.
   */
  clearForSystemLoad(): void {
    this.ensureInitialized();

    // Clear graph data (nodes, edges)
    this.graphStore!.clear();

    // Clear embeddings (tied to nodes)
    this.embeddingStore!.clear();

    // Clear response cache (graph version changed)
    this.versionedCache.clear();
    this.cachedVersions.clear();

    AgentDBLogger.info('Cleared graph data for system load (preserved episodes and variants)');
  }

  /**
   * Update system ID without clearing data (CR-038 Fix)
   *
   * Used when auto-detecting system ID from 'new-system' placeholder.
   * Preserves all existing graph data, just updates the systemId.
   */
  updateSystemId(newSystemId: string): void {
    this.ensureInitialized();
    this.graphStore!.setSystemId(newSystemId);

    // Clear response cache (systemId changed, responses may be stale)
    this.versionedCache.clear();
    this.cachedVersions.clear();

    AgentDBLogger.info(`System ID updated to ${newSystemId} (data preserved)`);
  }

  /**
   * Reinitialize for a new system after clearing data (CR-043 Fix)
   *
   * Called during system switch (e.g., /load different system).
   * Creates new GraphStore with new systemId, re-subscribes to events.
   * IMPORTANT: Call clearForSystemLoad() BEFORE this method.
   *
   * Unlike initialize(), this can be called when already initialized.
   */
  reinitializeForSystem(workspaceId: string, systemId: string): void {
    if (!this.initialized) {
      throw new Error('Cannot reinitialize - service not yet initialized');
    }

    // Create new GraphStore with new workspace/system IDs
    this.graphStore = new GraphStore(workspaceId, systemId);

    // Re-subscribe to graph changes for cache invalidation
    this.graphStore.onGraphChange((event) => {
      this.handleGraphChange(event);
    });

    AgentDBLogger.info(`Reinitialized GraphStore for ${workspaceId}/${systemId}`);
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

  /**
   * Get episode statistics aggregated by agent (CR-063)
   */
  async getEpisodeStats(knownAgents: string[] = []): Promise<{
    total: number;
    successful: number;
    failed: number;
    byAgent: Map<string, { total: number; successful: number; avgReward: number }>;
  }> {
    this.ensureInitialized();

    const byAgent = new Map<string, { total: number; successful: number; avgReward: number }>();
    let total = 0;
    let successful = 0;

    for (const agentId of knownAgents) {
      try {
        const episodes = await this.backend!.retrieveEpisodes(agentId, undefined, 100);
        if (episodes.length > 0) {
          const agentSuccessful = episodes.filter(e => e.success).length;
          const avgReward = episodes.reduce((sum, e) => sum + e.reward, 0) / episodes.length;

          byAgent.set(agentId, {
            total: episodes.length,
            successful: agentSuccessful,
            avgReward,
          });

          total += episodes.length;
          successful += agentSuccessful;
        }
      } catch {
        // Skip agents with errors
      }
    }

    return {
      total,
      successful,
      failed: total - successful,
      byAgent,
    };
  }

  /**
   * Get all episodes (CR-063: for persistence)
   */
  async getAllEpisodes(): Promise<Episode[]> {
    this.ensureInitialized();
    return this.backend!.getAllEpisodes();
  }

  /**
   * Import episodes (CR-063: for persistence)
   */
  async importEpisodes(episodes: Episode[]): Promise<void> {
    this.ensureInitialized();
    return this.backend!.importEpisodes(episodes);
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

  // ============================================================
  // Change Tracking (CR-033)
  // ============================================================

  /**
   * Capture current state as baseline for change tracking
   * Called on: session load, /commit
   */
  captureBaseline(): void {
    if (!this.graphStore || !this.changeTracker) return;
    this.changeTracker.captureBaseline(this.graphStore.toGraphState());
  }

  /**
   * Get change status for a node
   */
  getNodeChangeStatus(semanticId: SemanticId): ChangeStatus {
    if (!this.graphStore || !this.changeTracker) return 'unchanged';
    const node = this.graphStore.getNode(semanticId);
    return this.changeTracker.getNodeStatus(semanticId, node);
  }

  /**
   * Get change status for an edge
   */
  getEdgeChangeStatus(uuid: string): ChangeStatus {
    if (!this.graphStore || !this.changeTracker) return 'unchanged';
    const edge = this.graphStore.getEdge(uuid);
    return this.changeTracker.getEdgeStatus(uuid, edge);
  }

  /**
   * Get all tracked changes
   */
  getChanges(): TrackedChange[] {
    if (!this.graphStore || !this.changeTracker) return [];
    return this.changeTracker.getChanges(this.graphStore.toGraphState());
  }

  /**
   * Get change summary
   */
  getChangeSummary(): ChangeSummary {
    if (!this.graphStore || !this.changeTracker) {
      return { added: 0, modified: 0, deleted: 0, total: 0 };
    }
    return this.changeTracker.getSummary(this.graphStore.toGraphState());
  }

  /**
   * Check if there are pending changes
   */
  hasChanges(): boolean {
    if (!this.graphStore || !this.changeTracker) return false;
    return this.changeTracker.hasChanges(this.graphStore.toGraphState());
  }

  /**
   * Check if baseline exists
   */
  hasBaseline(): boolean {
    return this.changeTracker?.hasBaseline() ?? false;
  }

  /**
   * Restore graph state from baseline (CR-044)
   * Discards all changes since last commit/load
   * Returns the restored state summary or null if no baseline
   */
  restoreFromBaseline(): { nodes: number; edges: number } | null {
    if (!this.graphStore || !this.changeTracker) return null;

    const baselineState = this.changeTracker.getBaselineState();
    if (!baselineState) {
      return null;
    }

    // Clear current graph
    this.graphStore.clear();

    // Load baseline state back
    this.graphStore.loadFromState(baselineState);

    AgentDBLogger.info(
      `Restored from baseline: ${baselineState.nodes.length} nodes, ${baselineState.edges.length} edges`
    );

    return {
      nodes: baselineState.nodes.length,
      edges: baselineState.edges.length,
    };
  }
}

// ============================================================
// Singleton Management (CR-039: True Singleton)
// ============================================================

/**
 * TRUE singleton instance - only ONE AgentDB instance per process
 * This is THE single source of truth (CR-032, CR-039)
 */
let cachedInstance: UnifiedAgentDBService | null = null;
let cachedWorkspaceId: string | null = null;
let cachedSystemId: string | null = null;

/**
 * Get the singleton UnifiedAgentDBService instance
 *
 * CR-039: True singleton - returns SAME instance for same workspace/system
 * If workspace/system changes, clears old data and re-initializes
 *
 * CR-038 Fix: When transitioning from 'new-system' placeholder to a detected
 * system ID, PRESERVE data (don't clear). This handles the auto-detection
 * scenario where the LLM creates nodes and the system ID is auto-detected.
 */
export async function getUnifiedAgentDBService(
  workspaceId: string,
  systemId: string
): Promise<UnifiedAgentDBService> {
  // Same session - return cached instance
  if (cachedInstance && cachedWorkspaceId === workspaceId && cachedSystemId === systemId) {
    return cachedInstance;
  }

  // Different session - handle based on scenario
  if (cachedInstance) {
    const isNewSystemTransition = cachedSystemId === 'new-system' && systemId !== 'new-system';
    const isStaleRequestFromNewSystem = systemId === 'new-system' && cachedSystemId !== 'new-system';

    if (isNewSystemTransition) {
      // CR-038 Fix: Auto-detection from 'new-system' to real system ID
      // PRESERVE data - just update the cached systemId
      AgentDBLogger.info(`System auto-detected: updating systemId from ${cachedSystemId} to ${systemId} (preserving data)`);
      // Re-initialize GraphStore with new systemId but preserve existing nodes
      cachedInstance.updateSystemId(systemId);
    } else if (isStaleRequestFromNewSystem) {
      // CR-038 Fix: Stale request with 'new-system' while real system is cached
      // This happens when a request was created before /load completed
      // IGNORE the stale request - return cached instance without clearing
      AgentDBLogger.info(`Ignoring stale 'new-system' request - cached system: ${cachedSystemId} (preserving data)`);
      return cachedInstance;
    } else {
      // Normal system switch (e.g., /load different system) - clear old data
      // CR-043 Fix: Use reinitializeForSystem() instead of initialize() which returns early
      AgentDBLogger.info(`Switching session from ${cachedWorkspaceId}/${cachedSystemId} to ${workspaceId}/${systemId}`);
      cachedInstance.clearForSystemLoad();
      cachedInstance.reinitializeForSystem(workspaceId, systemId);
    }
  } else {
    cachedInstance = new UnifiedAgentDBService();
    await cachedInstance.initialize(workspaceId, systemId);
  }

  cachedWorkspaceId = workspaceId;
  cachedSystemId = systemId;

  return cachedInstance;
}

/**
 * Reset singleton instance (for testing only)
 */
export function resetAgentDBInstance(): void {
  if (cachedInstance) {
    cachedInstance.shutdown().catch(() => {});
  }
  cachedInstance = null;
  cachedWorkspaceId = null;
  cachedSystemId = null;
}

/**
 * CR-038 Fix: Sync singleton cache with external system changes
 *
 * Called by updateActiveSystem() after /load, /import, /new to ensure
 * the singleton cache matches the current session state.
 *
 * This prevents data loss when getUnifiedAgentDBService() is called later
 * (e.g., during LLM requests) with the new systemId - without this sync,
 * the mismatch would trigger clearForSystemLoad() and delete all data.
 *
 * @param workspaceId - Current workspace ID
 * @param systemId - Current system ID (after /load, /import, /new)
 */
export function syncSingletonCache(workspaceId: string, systemId: string): void {
  if (cachedInstance) {
    // Only update cache if there's an existing instance
    // Don't create new instance - let getUnifiedAgentDBService handle that
    AgentDBLogger.info(`Syncing singleton cache to ${workspaceId}/${systemId}`);
    cachedWorkspaceId = workspaceId;
    cachedSystemId = systemId;
  }
}

/**
 * Shutdown all service instances
 */
export async function shutdownAllServices(): Promise<void> {
  if (cachedInstance) {
    await cachedInstance.shutdown();
    cachedInstance = null;
    cachedWorkspaceId = null;
    cachedSystemId = null;
  }
}
