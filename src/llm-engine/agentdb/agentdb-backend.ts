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

    // Initialize schema for episodic memory (ReflexionMemory requires these tables)
    this.initializeSchema();

    // Initialize ReflexionMemory for episodic storage with embedding service
    this.reflexion = new ReflexionMemory(this.db, this.embeddingService as any);

    AgentDBLogger.backendInitialized('agentdb', true);
  }

  /**
   * Initialize database schema for episodic memory (Reflexion pattern)
   * Creates episodes and episode_embeddings tables if they don't exist
   */
  private initializeSchema(): void {
    // Episodes table for Reflexion-style episodic replay
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        session_id TEXT NOT NULL,
        task TEXT NOT NULL,
        input TEXT,
        output TEXT,
        critique TEXT,
        reward REAL DEFAULT 0.0,
        success BOOLEAN DEFAULT 0,
        latency_ms INTEGER,
        tokens_used INTEGER,
        tags TEXT,
        metadata JSON,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_episodes_ts ON episodes(ts DESC);
      CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_reward ON episodes(reward DESC);
      CREATE INDEX IF NOT EXISTS idx_episodes_task ON episodes(task);

      CREATE TABLE IF NOT EXISTS episode_embeddings (
        episode_id INTEGER PRIMARY KEY,
        embedding BLOB NOT NULL,
        embedding_model TEXT DEFAULT 'all-MiniLM-L6-v2',
        FOREIGN KEY(episode_id) REFERENCES episodes(id) ON DELETE CASCADE
      );

      -- CR-030: Node embeddings for similarity detection
      CREATE TABLE IF NOT EXISTS node_embeddings (
        node_uuid TEXT PRIMARY KEY,
        node_type TEXT NOT NULL,
        text_content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        embedding_model TEXT DEFAULT 'text-embedding-3-small',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        invalidated_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_node_embeddings_type ON node_embeddings(node_type);
    `);

    // Schema initialization complete - episodes and node_embeddings tables ready
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

  /**
   * Get all episodes (CR-063: for persistence)
   */
  async getAllEpisodes(): Promise<Episode[]> {
    if (!this.db) {
      return [];
    }

    try {
      const rows = this.db.exec('SELECT session_id, task, reward, success, critique, output, ts FROM episodes ORDER BY ts DESC');
      if (!rows || rows.length === 0) {
        return [];
      }

      const episodes: Episode[] = rows[0].values.map((row: any[]) => ({
        agentId: row[0] || '',
        task: row[1] || '',
        reward: row[2] || 0,
        success: Boolean(row[3]),
        critique: row[4] || '',
        output: row[5] ? JSON.parse(row[5]) : {},
        timestamp: (row[6] || 0) * 1000, // Convert from seconds to ms
      }));

      AgentDBLogger.debug(`getAllEpisodes: Retrieved ${episodes.length} episodes`);
      return episodes;
    } catch (error) {
      AgentDBLogger.error('Failed to get all episodes', error as Error);
      return [];
    }
  }

  /**
   * Import episodes (CR-063: for persistence)
   */
  async importEpisodes(episodes: Episode[]): Promise<void> {
    if (!this.db || episodes.length === 0) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO episodes (session_id, task, reward, success, critique, output, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const episode of episodes) {
        stmt.run([
          episode.agentId,
          episode.task,
          episode.reward,
          episode.success ? 1 : 0,
          episode.critique,
          JSON.stringify(episode.output),
          Math.floor(episode.timestamp / 1000), // Convert ms to seconds
        ]);
      }

      stmt.free();
      AgentDBLogger.debug(`importEpisodes: Imported ${episodes.length} episodes`);
    } catch (error) {
      AgentDBLogger.error('Failed to import episodes', error as Error);
    }
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
