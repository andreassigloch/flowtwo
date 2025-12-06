/**
 * AgentDB Types and Interfaces
 *
 * Defines the contract for AgentDB backends and unified data layer.
 * Part of CR-032: Unified Data Layer Architecture
 *
 * @author andreas@siglochconsulting
 */

import type { Node, Edge, SemanticId } from '../../shared/types/ontology.js';
import type { NodeFilter, EdgeFilter, SetOptions, GraphChangeEvent } from './graph-store.js';

/**
 * Episodic memory entry (Reflexion)
 */
export interface Episode {
  agentId: string;
  task: string;
  reward: number;
  success: boolean;
  critique: string;
  output: any;
  timestamp: number;
}

/**
 * Cached LLM response with vector embedding
 */
export interface CachedResponse {
  query: string;
  queryEmbedding?: number[];
  response: string;
  operations: string | null;
  similarity?: number;
  timestamp: number;
  ttl: number;
}

/**
 * Vector search result
 */
export interface SearchResult {
  content: string;
  similarity: number;
  metadata: any;
}

/**
 * Cache metrics for monitoring
 */
export interface CacheMetrics {
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  episodesStored: number;
  tokensSaved: number;
  costSavings: number;
}

/**
 * Backend interface that all implementations must satisfy
 */
export interface AgentDBBackend {
  /**
   * Initialize the backend (connect to database, setup storage, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Vector similarity search for cached responses
   */
  vectorSearch(query: string, threshold: number, k?: number): Promise<SearchResult[]>;

  /**
   * Store a cached response
   */
  cacheResponse(response: CachedResponse): Promise<void>;

  /**
   * Store an episodic memory entry (Reflexion)
   */
  storeEpisode(episode: Episode): Promise<void>;

  /**
   * Retrieve episodes by agent ID or task similarity
   */
  retrieveEpisodes(agentId: string, task?: string, k?: number): Promise<Episode[]>;

  /**
   * Get cache metrics
   */
  getMetrics(): Promise<CacheMetrics>;

  /**
   * Clear expired cache entries based on TTL
   */
  cleanup(): Promise<void>;

  /**
   * Shutdown the backend (close connections, etc.)
   */
  shutdown(): Promise<void>;
}

// ============================================================
// Re-export Graph Store types for convenience
// ============================================================

export type { NodeFilter, EdgeFilter, SetOptions, GraphChangeEvent };
export type { Node, Edge, SemanticId };

// ============================================================
// Unified Data Layer Types (CR-032)
// ============================================================

/**
 * Versioned response cache - includes graph version in key
 */
export interface VersionedCachedResponse extends CachedResponse {
  graphVersion: number;
}

/**
 * Graph state with version info for cache
 */
export interface VersionedGraphInfo {
  workspaceId: string;
  systemId: string;
  version: number;
  nodeCount: number;
  edgeCount: number;
}

/**
 * Unified AgentDB API interface (CR-032)
 *
 * Combines:
 * - Graph Store (CRUD)
 * - Response Cache (version-aware)
 * - Episodic Memory (Reflexion)
 * - Variant Pool (optimization)
 */
export interface UnifiedAgentDBAPI {
  // === Graph Store ===
  getNode(semanticId: SemanticId): Node | null;
  setNode(node: Node, options?: SetOptions): void;
  deleteNode(semanticId: SemanticId): boolean;
  getNodes(filter?: NodeFilter): Node[];
  getEdge(uuid: string): Edge | null;
  getEdgeByKey(sourceId: SemanticId, type: string, targetId: SemanticId): Edge | null;
  setEdge(edge: Edge, options?: SetOptions): void;
  deleteEdge(uuid: string): boolean;
  getEdges(filter?: EdgeFilter): Edge[];
  getGraphVersion(): number;
  onGraphChange(callback: (event: GraphChangeEvent) => void): () => void;

  // === Response Cache (version-aware) ===
  checkCache(query: string, graphVersion: number): Promise<{ response: string; operations: string | null } | null>;
  cacheResponse(query: string, graphVersion: number, response: string, operations: string | null): Promise<void>;

  // === Episodic Memory (Reflexion) ===
  storeEpisode(agentId: string, task: string, success: boolean, output: unknown, critique?: string): Promise<void>;
  loadAgentContext(agentId: string, task?: string, k?: number): Promise<Episode[]>;

  // === Metrics ===
  getMetrics(): Promise<CacheMetrics>;
}
