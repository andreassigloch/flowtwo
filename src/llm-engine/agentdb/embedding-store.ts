/**
 * Embedding Store - Unified Embedding Cache for AgentDB
 *
 * Single source of truth for all node embeddings.
 * Used by SimilarityScorer for duplicate detection.
 *
 * Features:
 * - In-memory cache with content-based invalidation
 * - Batch embedding computation (single API call)
 * - Graph change subscription for auto-invalidation
 * - Persistence via Neo4jSyncManager (optional)
 *
 * Part of CR-032: Unified Data Layer Architecture
 *
 * @author andreas@siglochconsulting
 */

import { EmbeddingService } from './embedding-service.js';
import { AgentDBLogger } from './agentdb-logger.js';

/**
 * Cached embedding entry
 */
export interface EmbeddingEntry {
  nodeId: string;
  textContent: string;
  embedding: number[];
  createdAt: number;
}

/**
 * Node data for embedding computation
 */
export interface EmbeddableNode {
  uuid: string;
  semanticId: string;
  type: string;
  name: string;
  descr: string;
}

/**
 * Embedding Store - Centralized embedding cache
 */
export class EmbeddingStore {
  private cache: Map<string, EmbeddingEntry> = new Map();
  private embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Get embedding for a node (lazy computation, cached)
   */
  async getEmbedding(node: EmbeddableNode): Promise<number[]> {
    const textContent = this.getEmbeddingText(node);
    const cached = this.cache.get(node.uuid);

    // Return cached if content matches
    if (cached && cached.textContent === textContent) {
      return cached.embedding;
    }

    // Compute new embedding
    const embedding = await this.embeddingService.embedText(textContent);

    // Cache it
    this.cache.set(node.uuid, {
      nodeId: node.uuid,
      textContent,
      embedding,
      createdAt: Date.now(),
    });

    return embedding;
  }

  /**
   * Get cached embedding without API call (returns null if not cached)
   */
  getCachedEmbedding(nodeId: string): number[] | null {
    return this.cache.get(nodeId)?.embedding ?? null;
  }

  /**
   * Batch compute embeddings for multiple nodes (single API call)
   * Populates cache for subsequent lookups
   */
  async batchCompute(nodes: EmbeddableNode[]): Promise<void> {
    // Find nodes that need embeddings
    const nodesToEmbed: EmbeddableNode[] = [];
    const textContents: string[] = [];

    for (const node of nodes) {
      const textContent = this.getEmbeddingText(node);
      const cached = this.cache.get(node.uuid);

      if (!cached || cached.textContent !== textContent) {
        nodesToEmbed.push(node);
        textContents.push(textContent);
      }
    }

    if (nodesToEmbed.length === 0) {
      AgentDBLogger.debug('EmbeddingStore: All embeddings already cached');
      return;
    }

    AgentDBLogger.debug(`EmbeddingStore: Computing ${nodesToEmbed.length} embeddings`);

    // Batch API call
    const embeddings = await this.embeddingService.embedTexts(textContents);

    // Populate cache
    const now = Date.now();
    for (let i = 0; i < nodesToEmbed.length; i++) {
      const node = nodesToEmbed[i];
      this.cache.set(node.uuid, {
        nodeId: node.uuid,
        textContent: textContents[i],
        embedding: embeddings[i],
        createdAt: now,
      });
    }

    AgentDBLogger.debug(`EmbeddingStore: Cached ${nodesToEmbed.length} embeddings`);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    return this.embeddingService.cosineSimilarity(a, b);
  }

  /**
   * Invalidate embedding for a node (call on node content change)
   */
  invalidate(nodeId: string): void {
    this.cache.delete(nodeId);
  }

  /**
   * Invalidate multiple embeddings
   */
  invalidateMany(nodeIds: string[]): void {
    for (const id of nodeIds) {
      this.cache.delete(id);
    }
  }

  /**
   * Clear all cached embeddings
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Load embeddings from external source (e.g., Neo4j)
   */
  loadFromEntries(entries: EmbeddingEntry[]): void {
    for (const entry of entries) {
      this.cache.set(entry.nodeId, entry);
    }
    AgentDBLogger.debug(`EmbeddingStore: Loaded ${entries.length} embeddings`);
  }

  /**
   * Export all embeddings for persistence
   */
  exportEntries(): EmbeddingEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; oldestMs: number } {
    let oldest = Date.now();
    for (const entry of this.cache.values()) {
      if (entry.createdAt < oldest) {
        oldest = entry.createdAt;
      }
    }
    return {
      size: this.cache.size,
      oldestMs: this.cache.size > 0 ? Date.now() - oldest : 0,
    };
  }

  /**
   * Check if embedding is cached for a node
   */
  has(nodeId: string): boolean {
    return this.cache.has(nodeId);
  }

  /**
   * Get text content for embedding
   */
  private getEmbeddingText(node: EmbeddableNode): string {
    return `${node.type}: ${node.name} - ${node.descr}`;
  }
}
