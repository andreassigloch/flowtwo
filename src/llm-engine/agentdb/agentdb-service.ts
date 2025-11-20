/**
 * AgentDB Service
 *
 * High-level service for LLM agent shared memory.
 * Provides caching, episodic memory, and metrics.
 *
 * @author andreas@siglochconsulting
 */

import { AGENTDB_CACHE_TTL, AGENTDB_SIMILARITY_THRESHOLD, AGENTDB_BACKEND } from '../../shared/config.js';
import { createBackend } from './backend-factory.js';
import type { AgentDBBackend, CachedResponse, Episode, CacheMetrics } from './types.js';
import { AgentDBLogger } from './agentdb-logger.js';

export class AgentDBService {
  private backend: AgentDBBackend | null = null;
  private initialized = false;

  /**
   * Initialize the service (must be called before use)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.backend = await createBackend();
    this.initialized = true;
  }

  /**
   * Check cache for semantically similar query
   * Returns cached response if similarity > threshold, null otherwise
   */
  async checkCache(query: string): Promise<{ response: string; operations: string | null } | null> {
    if (!this.backend) {
      throw new Error('AgentDBService not initialized');
    }

    const results = await this.backend.vectorSearch(query, AGENTDB_SIMILARITY_THRESHOLD, 1);

    if (results.length > 0 && results[0].similarity >= AGENTDB_SIMILARITY_THRESHOLD) {
      // Cache hit!
      AgentDBLogger.cacheHit(query, results[0].similarity, AGENTDB_BACKEND);

      if ('recordCacheHit' in this.backend) {
        (this.backend as any).recordCacheHit(1000); // Estimate 1000 tokens saved
      }

      return {
        response: results[0].content,
        operations: results[0].metadata.operations || null,
      };
    }

    // Cache miss
    AgentDBLogger.cacheMiss(query, AGENTDB_BACKEND);

    if ('recordCacheMiss' in this.backend) {
      (this.backend as any).recordCacheMiss();
    }

    return null;
  }

  /**
   * Store LLM response in cache
   */
  async cacheResponse(query: string, response: string, operations: string | null): Promise<void> {
    if (!this.backend) {
      throw new Error('AgentDBService not initialized');
    }

    const cached: CachedResponse = {
      query,
      response,
      operations,
      timestamp: Date.now(),
      ttl: AGENTDB_CACHE_TTL * 1000, // Convert seconds to ms
    };

    await this.backend.cacheResponse(cached);
  }

  /**
   * Store episodic memory (Reflexion)
   */
  async storeEpisode(
    agentId: string,
    task: string,
    success: boolean,
    output: any,
    critique?: string
  ): Promise<void> {
    if (!this.backend) {
      throw new Error('AgentDBService not initialized');
    }

    const episode: Episode = {
      agentId,
      task,
      reward: success ? 1.0 : 0.0,
      success,
      critique: critique || (success ? 'Success' : 'Failed'),
      output,
      timestamp: Date.now(),
    };

    await this.backend.storeEpisode(episode);
  }

  /**
   * Retrieve past episodes for agent context loading
   */
  async loadAgentContext(agentId: string, task?: string, k: number = 5): Promise<Episode[]> {
    if (!this.backend) {
      throw new Error('AgentDBService not initialized');
    }

    return this.backend.retrieveEpisodes(agentId, task, k);
  }

  /**
   * Get cache and episodic memory metrics
   */
  async getMetrics(): Promise<CacheMetrics> {
    if (!this.backend) {
      throw new Error('AgentDBService not initialized');
    }

    const metrics = await this.backend.getMetrics();

    // Log metrics
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

  /**
   * Clean up expired cache entries
   */
  async cleanup(): Promise<void> {
    if (!this.backend) {
      return;
    }

    await this.backend.cleanup();
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (!this.backend) {
      return;
    }

    await this.backend.shutdown();
    this.initialized = false;
    this.backend = null;
  }
}

// Singleton instance
let agentDBService: AgentDBService | null = null;

/**
 * Get the singleton AgentDB service instance
 */
export async function getAgentDBService(): Promise<AgentDBService> {
  if (!agentDBService) {
    agentDBService = new AgentDBService();
    await agentDBService.initialize();
  }

  return agentDBService;
}
