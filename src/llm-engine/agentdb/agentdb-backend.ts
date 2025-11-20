/**
 * AgentDB Backend (Production)
 *
 * Uses AgentDB library with OpenAI embeddings for semantic vector search.
 * Ported embedding approach from aise project.
 *
 * @author andreas@siglochconsulting
 */

import { ReflexionMemory, createDatabase } from 'agentdb';
import type {
  AgentDBBackend,
  CachedResponse,
  Episode,
  SearchResult,
  CacheMetrics,
} from './types.js';
import { EmbeddingService } from './embedding-service.js';
import { AgentDBLogger } from './agentdb-logger.js';

export class AgentDBPersistentBackend implements AgentDBBackend {
  private db: any;
  private reflexion: ReflexionMemory | null = null;
  private embeddingService: EmbeddingService;
  private cachedEmbeddings: Map<string, { text: string; embedding: number[]; response: CachedResponse }> = new Map();
  private dbPath: string;
  private metrics: CacheMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheHitRate: 0,
    episodesStored: 0,
    tokensSaved: 0,
    costSavings: 0,
  };

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.embeddingService = new EmbeddingService();
  }

  async initialize(): Promise<void> {
    // Create database
    this.db = await createDatabase(this.dbPath);

    // Initialize ReflexionMemory for episodic storage with embedding service
    this.reflexion = new ReflexionMemory(this.db, this.embeddingService as any);

    AgentDBLogger.backendInitialized('agentdb', true);
  }

  async vectorSearch(query: string, threshold: number, k: number = 5): Promise<SearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embedText(query);

    // Calculate similarity with all cached embeddings
    const results: Array<{ content: string; similarity: number; metadata: any }> = [];

    for (const [, cached] of Array.from(this.cachedEmbeddings.entries())) {
      const similarity = this.embeddingService.cosineSimilarity(queryEmbedding, cached.embedding);

      if (similarity >= threshold) {
        results.push({
          content: cached.response.response,
          similarity,
          metadata: {
            query: cached.response.query,
            operations: cached.response.operations,
            timestamp: cached.response.timestamp,
          },
        });
      }
    }

    // Sort by similarity descending and limit to k
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, k);
  }

  async cacheResponse(response: CachedResponse): Promise<void> {
    // Generate embedding for the query
    const embedding = await this.embeddingService.embedText(response.query);
    AgentDBLogger.embeddingGenerated(response.query, embedding.length);

    // Store in memory cache with embedding
    const id = `${Date.now()}-${Math.random()}`;
    this.cachedEmbeddings.set(id, {
      text: response.query,
      embedding,
      response,
    });
    AgentDBLogger.responseStored(response.query, 'agentdb', true);
  }

  async storeEpisode(episode: Episode): Promise<void> {
    // Store using ReflexionMemory
    if (!this.reflexion) {
      AgentDBLogger.error('ReflexionMemory not initialized - skipping episode storage');
      return;
    }

    try {
      // AgentDB's ReflexionMemory.storeEpisode expects Episode format
      await this.reflexion.storeEpisode({
        sessionId: episode.agentId,
        task: episode.task,
        reward: episode.reward,
        success: episode.success,
        critique: episode.critique,
      });

      this.metrics.episodesStored++;
      AgentDBLogger.episodeStored(episode.agentId, episode.task, episode.success, 'agentdb');
    } catch (error) {
      // Table doesn't exist yet - log but don't fail
      AgentDBLogger.error('Episode storage not available (table missing)', error as Error);
    }
  }

  async retrieveEpisodes(agentId: string, task?: string, k: number = 10): Promise<Episode[]> {
    if (!this.reflexion) {
      throw new Error('ReflexionMemory not initialized');
    }

    // Retrieve episodes using Reflexion query
    const results = await this.reflexion.retrieveRelevant({
      task: task || agentId,
      k,
    });

    const episodes = results.map((result: any) => ({
      agentId: result.sessionId || agentId,
      task: result.task || '',
      reward: result.reward || 0,
      success: result.success || false,
      critique: result.critique || '',
      output: result.output || {},
      timestamp: result.ts || Date.now(),
    }));

    AgentDBLogger.episodesRetrieved(agentId, episodes.length, 'agentdb');
    return episodes;
  }

  async getMetrics(): Promise<CacheMetrics> {
    this.metrics.cacheHitRate =
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
        : 0;

    return {
      ...this.metrics,
      episodesStored: this.cachedEmbeddings.size + this.metrics.episodesStored,
    };
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [id, cached] of Array.from(this.cachedEmbeddings.entries())) {
      if (now - cached.response.timestamp > cached.response.ttl) {
        expiredKeys.push(id);
      }
    }

    for (const key of expiredKeys) {
      this.cachedEmbeddings.delete(key);
    }

    if (expiredKeys.length > 0) {
      AgentDBLogger.cleanup(expiredKeys.length, 'agentdb');
    }
  }

  async shutdown(): Promise<void> {
    AgentDBLogger.backendShutdown('agentdb');

    // Close database
    if (this.db && typeof this.db.close === 'function') {
      await this.db.close();
    }

    this.cachedEmbeddings.clear();
  }

  /**
   * Record a cache hit (used by service layer)
   */
  recordCacheHit(tokensSaved: number = 1000): void {
    this.metrics.cacheHits++;
    this.metrics.tokensSaved += tokensSaved;
    this.metrics.costSavings += (tokensSaved / 1000) * 0.003; // $3 per 1M tokens estimate
  }

  /**
   * Record a cache miss (used by service layer)
   */
  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }
}
