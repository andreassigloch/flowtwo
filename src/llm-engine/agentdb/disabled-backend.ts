/**
 * Disabled AgentDB Backend
 *
 * No-op implementation for when caching is disabled.
 * All operations are no-ops, always returns empty results.
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

export class DisabledBackend implements AgentDBBackend {
  async initialize(): Promise<void> {
    // No-op
  }

  async vectorSearch(_query: string, _threshold: number, _k?: number): Promise<SearchResult[]> {
    return [];
  }

  async cacheResponse(_response: CachedResponse): Promise<void> {
    // No-op
  }

  async storeEpisode(_episode: Episode): Promise<void> {
    // No-op
  }

  async retrieveEpisodes(_agentId: string, _task?: string, _k?: number): Promise<Episode[]> {
    return [];
  }

  async getMetrics(): Promise<CacheMetrics> {
    return {
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      episodesStored: 0,
      tokensSaved: 0,
      costSavings: 0,
    };
  }

  async cleanup(): Promise<void> {
    // No-op
  }

  async shutdown(): Promise<void> {
    // No-op
  }
}
