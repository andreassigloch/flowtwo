/**
 * AgentDB Types and Interfaces
 *
 * Defines the contract for AgentDB backends (memory, agentdb, disabled).
 *
 * @author andreas@siglochconsulting
 */

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
