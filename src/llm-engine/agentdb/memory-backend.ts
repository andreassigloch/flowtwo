/**
 * In-Memory AgentDB Backend
 *
 * Fast, ephemeral storage for development and testing.
 * No persistence, no vector search (uses simple string matching).
 *
 * @author andreas@siglochconsulting
 */

import type {
  AgentDBBackend,
  CachedResponse,
  Episode,
  SearchResult,
  CacheMetrics,
} from './types.js';
import { AgentDBLogger } from './agentdb-logger.js';

export class MemoryBackend implements AgentDBBackend {
  private cachedResponses: Map<string, CachedResponse> = new Map();
  private episodes: Episode[] = [];
  private metrics: CacheMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheHitRate: 0,
    episodesStored: 0,
    tokensSaved: 0,
    costSavings: 0,
  };

  async initialize(): Promise<void> {
    AgentDBLogger.backendInitialized('memory', false);
  }

  async vectorSearch(query: string, threshold: number, k: number = 5): Promise<SearchResult[]> {
    // Simple substring matching (no actual vector embeddings)
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    for (const [, cached] of Array.from(this.cachedResponses.entries())) {
      const cachedQueryLower = cached.query.toLowerCase();

      // Simple similarity calculation
      let similarity = 0;

      if (cachedQueryLower === queryLower) {
        // Exact match
        similarity = 1.0;
      } else if (cachedQueryLower.includes(queryLower) || queryLower.includes(cachedQueryLower)) {
        // One contains the other
        similarity = 0.9;
      } else {
        // Word-based similarity
        const cachedWords = cachedQueryLower.split(/\s+/);
        const matchingWords = queryWords.filter((word) => cachedWords.includes(word));

        if (matchingWords.length > 0) {
          similarity = 0.7 + (matchingWords.length / Math.max(queryWords.length, cachedWords.length)) * 0.2;
        }
      }

      if (similarity >= threshold) {
        results.push({
          content: cached.response,
          similarity,
          metadata: {
            query: cached.query,
            operations: cached.operations,
            timestamp: cached.timestamp,
          },
        });
      }
    }

    // Sort by similarity descending and limit to k
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, k);
  }

  async cacheResponse(response: CachedResponse): Promise<void> {
    const key = response.query.toLowerCase();
    this.cachedResponses.set(key, response);
    AgentDBLogger.responseStored(response.query, 'memory', false);
  }

  async storeEpisode(episode: Episode): Promise<void> {
    this.episodes.push(episode);
    this.metrics.episodesStored++;
    AgentDBLogger.episodeStored(episode.agentId, episode.task, episode.success, 'memory');
  }

  async retrieveEpisodes(agentId: string, task?: string, k: number = 10): Promise<Episode[]> {
    let filtered = this.episodes.filter((ep) => ep.agentId === agentId);

    if (task) {
      const taskLower = task.toLowerCase();
      filtered = filtered.filter((ep) => ep.task.toLowerCase().includes(taskLower));
    }

    // Sort by timestamp descending (most recent first)
    const results = filtered.sort((a, b) => b.timestamp - a.timestamp).slice(0, k);
    AgentDBLogger.episodesRetrieved(agentId, results.length, 'memory');
    return results;
  }

  /**
   * Get all episodes (CR-063: for persistence)
   */
  async getAllEpisodes(): Promise<Episode[]> {
    return [...this.episodes].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Import episodes (CR-063: for persistence)
   */
  async importEpisodes(episodes: Episode[]): Promise<void> {
    // Deduplicate by timestamp + agentId
    const existingKeys = new Set(this.episodes.map(e => `${e.timestamp}-${e.agentId}`));
    for (const episode of episodes) {
      const key = `${episode.timestamp}-${episode.agentId}`;
      if (!existingKeys.has(key)) {
        this.episodes.push(episode);
        existingKeys.add(key);
      }
    }
    AgentDBLogger.debug(`importEpisodes: Imported ${episodes.length} episodes (memory backend)`);
  }

  async getMetrics(): Promise<CacheMetrics> {
    this.metrics.cacheHitRate =
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
        : 0;

    return { ...this.metrics };
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, cached] of Array.from(this.cachedResponses.entries())) {
      if (now - cached.timestamp > cached.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cachedResponses.delete(key);
    }

    if (expiredKeys.length > 0) {
      AgentDBLogger.cleanup(expiredKeys.length, 'memory');
    }
  }

  async shutdown(): Promise<void> {
    AgentDBLogger.backendShutdown('memory');
    // Clear all data
    this.cachedResponses.clear();
    this.episodes = [];
  }

  /**
   * Record a cache hit (used by service layer)
   */
  recordCacheHit(tokensSaved: number = 1000): void {
    this.metrics.cacheHits++;
    this.metrics.tokensSaved += tokensSaved;
    this.metrics.costSavings += (tokensSaved / 1000) * 0.003; // Rough estimate: $3 per 1M tokens
  }

  /**
   * Record a cache miss (used by service layer)
   */
  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }
}
