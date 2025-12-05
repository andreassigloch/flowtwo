/**
 * Similarity Scorer
 *
 * Tiered similarity detection for nodes:
 * - Tier 1: Neo4j index (exact name, prefix match)
 * - Tier 2: AgentDB vector search (embeddings)
 * - Tier 3: LLM review (for flagged candidates)
 *
 * CR-030: Evaluation Criteria Implementation
 *
 * @author andreas@siglochconsulting
 */

import type { Neo4jClient } from '../../neo4j-client/neo4j-client.js';
import { EmbeddingService } from '../agentdb/embedding-service.js';
import { getRuleLoader } from './rule-loader.js';
import type { SimilarityMatch, SimilarityThresholds } from './types.js';

/**
 * Node data for similarity comparison
 */
export interface NodeData {
  uuid: string;
  semanticId: string;
  type: string;
  name: string;
  descr: string;
}

/**
 * Embedding cache entry
 */
interface EmbeddingCacheEntry {
  nodeUuid: string;
  textContent: string;
  embedding: number[];
  createdAt: number;
}

/**
 * Similarity Scorer
 *
 * Provides tiered similarity detection for merge/duplicate candidates.
 */
export class SimilarityScorer {
  private neo4jClient: Neo4jClient | null = null;
  private embeddingService: EmbeddingService;
  private embeddingCache: Map<string, EmbeddingCacheEntry> = new Map();
  private indexEnsured: boolean = false;

  constructor(neo4jClient?: Neo4jClient) {
    this.neo4jClient = neo4jClient || null;
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Set Neo4j client (for lazy initialization)
   */
  setNeo4jClient(client: Neo4jClient): void {
    this.neo4jClient = client;
    this.indexEnsured = false;
  }

  /**
   * Ensure Neo4j index exists for (type, Name)
   */
  async ensureIndex(): Promise<void> {
    if (this.indexEnsured || !this.neo4jClient) {
      return;
    }

    try {
      await this.neo4jClient.query(`
        CREATE INDEX node_type_name IF NOT EXISTS
        FOR (n:Node) ON (n.type, n.name)
      `);
      this.indexEnsured = true;
    } catch (error) {
      // Index might already exist or Neo4j version doesn't support IF NOT EXISTS
      console.warn('Could not create index:', error);
      this.indexEnsured = true;
    }
  }

  /**
   * Get similarity score between two nodes (0.0 - 1.0)
   *
   * Uses tiered approach:
   * 1. Exact name match → 1.0
   * 2. Prefix match → 0.9
   * 3. Embedding similarity → 0.0-1.0
   */
  async getSimilarityScore(nodeA: NodeData, nodeB: NodeData): Promise<number> {
    // Only compare nodes of same type
    if (nodeA.type !== nodeB.type) {
      return 0;
    }

    // Tier 1: Exact name match
    if (nodeA.name.toLowerCase() === nodeB.name.toLowerCase()) {
      return 1.0;
    }

    // Tier 1.5: Prefix match (shared prefix >= 4 chars)
    const prefixScore = this.getPrefixMatchScore(nodeA.name, nodeB.name);
    if (prefixScore >= 0.9) {
      return prefixScore;
    }

    // Tier 2: Embedding similarity
    const embeddingScore = await this.getEmbeddingSimilarity(nodeA, nodeB);
    return embeddingScore;
  }

  /**
   * Find similar nodes for a given node
   *
   * Returns nodes with similarity >= threshold
   */
  async findSimilarNodes(
    node: NodeData,
    allNodes: NodeData[],
    threshold?: number
  ): Promise<SimilarityMatch[]> {
    const loader = getRuleLoader();
    const thresholds = node.type === 'SCHEMA'
      ? loader.getSchemaSimilarityThresholds()
      : loader.getFuncSimilarityThresholds();

    const effectiveThreshold = threshold ?? thresholds.review;
    const matches: SimilarityMatch[] = [];

    // Filter to same type, exclude self
    const candidates = allNodes.filter(
      (n) => n.type === node.type && n.uuid !== node.uuid
    );

    // Tier 1: Neo4j prefix query (if available)
    const prefixMatches = await this.findPrefixMatches(node, candidates);
    for (const match of prefixMatches) {
      if (match.score >= effectiveThreshold) {
        matches.push(match);
      }
    }

    // Tier 2: Embedding similarity for remaining candidates
    const checkedUuids = new Set(matches.map((m) => m.nodeB.uuid));
    const remainingCandidates = candidates.filter((c) => !checkedUuids.has(c.uuid));

    for (const candidate of remainingCandidates) {
      const score = await this.getEmbeddingSimilarity(node, candidate);
      if (score >= effectiveThreshold) {
        matches.push(this.createMatch(node, candidate, score, 'embedding', thresholds));
      }
    }

    // Sort by score descending
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Find all similarity matches above threshold in a node set
   *
   * Optimized: Batch embeddings upfront + parallel comparisons
   */
  async findAllSimilarityMatches(
    nodes: NodeData[],
    threshold?: number
  ): Promise<SimilarityMatch[]> {
    const loader = getRuleLoader();
    const funcThresholds = loader.getFuncSimilarityThresholds();
    const schemaThresholds = loader.getSchemaSimilarityThresholds();

    // Step 1: Batch compute all embeddings upfront (single API call)
    await this.batchComputeEmbeddings(nodes);

    // Step 2: Build comparison pairs (same type only)
    interface ComparisonPair {
      nodeA: NodeData;
      nodeB: NodeData;
      thresholds: SimilarityThresholds;
      effectiveThreshold: number;
    }
    const pairs: ComparisonPair[] = [];
    const checked = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      const thresholds = nodeA.type === 'SCHEMA' ? schemaThresholds : funcThresholds;
      const effectiveThreshold = threshold ?? thresholds.review;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];

        // Skip if different types
        if (nodeA.type !== nodeB.type) continue;

        // Skip if already checked
        const pairKey = [nodeA.uuid, nodeB.uuid].sort().join('-');
        if (checked.has(pairKey)) continue;
        checked.add(pairKey);

        pairs.push({ nodeA, nodeB, thresholds, effectiveThreshold });
      }
    }

    // Step 3: Compare all pairs in parallel (embeddings already cached)
    const results = await Promise.all(
      pairs.map(async ({ nodeA, nodeB, thresholds, effectiveThreshold }) => {
        const score = await this.getSimilarityScoreCached(nodeA, nodeB);
        if (score >= effectiveThreshold) {
          const matchType = this.getMatchType(nodeA, nodeB, score);
          return this.createMatch(nodeA, nodeB, score, matchType, thresholds);
        }
        return null;
      })
    );

    // Filter out nulls and sort
    const allMatches = results.filter((m): m is SimilarityMatch => m !== null);
    return allMatches.sort((a, b) => b.score - a.score);
  }

  /**
   * Batch compute embeddings for all nodes (single API call)
   * Populates cache for subsequent lookups
   */
  private async batchComputeEmbeddings(nodes: NodeData[]): Promise<void> {
    // Find nodes that need embeddings (not in cache or stale)
    const nodesToEmbed: NodeData[] = [];
    const textContents: string[] = [];

    for (const node of nodes) {
      const textContent = this.getEmbeddingText(node);
      const cached = this.embeddingCache.get(node.uuid);

      if (!cached || cached.textContent !== textContent) {
        nodesToEmbed.push(node);
        textContents.push(textContent);
      }
    }

    if (nodesToEmbed.length === 0) {
      return; // All embeddings already cached
    }

    // Batch API call for all texts
    const embeddings = await this.embeddingService.embedTexts(textContents);

    // Populate cache
    const now = Date.now();
    for (let i = 0; i < nodesToEmbed.length; i++) {
      const node = nodesToEmbed[i];
      this.embeddingCache.set(node.uuid, {
        nodeUuid: node.uuid,
        textContent: textContents[i],
        embedding: embeddings[i],
        createdAt: now,
      });
    }
  }

  /**
   * Get similarity score using cached embeddings (no API calls)
   */
  private async getSimilarityScoreCached(nodeA: NodeData, nodeB: NodeData): Promise<number> {
    // Only compare nodes of same type
    if (nodeA.type !== nodeB.type) {
      return 0;
    }

    // Tier 1: Exact name match
    if (nodeA.name.toLowerCase() === nodeB.name.toLowerCase()) {
      return 1.0;
    }

    // Tier 1.5: Prefix match (shared prefix >= 4 chars)
    const prefixScore = this.getPrefixMatchScore(nodeA.name, nodeB.name);
    if (prefixScore >= 0.9) {
      return prefixScore;
    }

    // Tier 2: Embedding similarity (from cache - no API call)
    const embeddingA = this.embeddingCache.get(nodeA.uuid)?.embedding;
    const embeddingB = this.embeddingCache.get(nodeB.uuid)?.embedding;

    if (!embeddingA || !embeddingB) {
      // Fallback to API call if cache miss (shouldn't happen after batch)
      return this.getEmbeddingSimilarity(nodeA, nodeB);
    }

    return this.embeddingService.cosineSimilarity(embeddingA, embeddingB);
  }

  /**
   * Get embedding for a node (lazy computation, cached)
   */
  async getNodeEmbedding(node: NodeData): Promise<number[]> {
    // Check cache
    const cached = this.embeddingCache.get(node.uuid);
    const textContent = this.getEmbeddingText(node);

    if (cached && cached.textContent === textContent) {
      return cached.embedding;
    }

    // Compute embedding
    const embedding = await this.embeddingService.embedText(textContent);

    // Cache it
    this.embeddingCache.set(node.uuid, {
      nodeUuid: node.uuid,
      textContent,
      embedding,
      createdAt: Date.now(),
    });

    return embedding;
  }

  /**
   * Invalidate embedding cache for a node (call when description changes)
   */
  invalidateEmbedding(nodeUuid: string): void {
    this.embeddingCache.delete(nodeUuid);
  }

  /**
   * Clear all cached embeddings
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; oldestMs: number } {
    let oldest = Date.now();
    for (const entry of this.embeddingCache.values()) {
      if (entry.createdAt < oldest) {
        oldest = entry.createdAt;
      }
    }
    return {
      size: this.embeddingCache.size,
      oldestMs: this.embeddingCache.size > 0 ? Date.now() - oldest : 0,
    };
  }

  /**
   * Get text content for embedding
   */
  private getEmbeddingText(node: NodeData): string {
    return `${node.type}: ${node.name} - ${node.descr}`;
  }

  /**
   * Calculate prefix match score
   */
  private getPrefixMatchScore(nameA: string, nameB: string): number {
    const a = nameA.toLowerCase();
    const b = nameB.toLowerCase();
    const minLen = Math.min(a.length, b.length);

    let commonPrefix = 0;
    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) {
        commonPrefix++;
      } else {
        break;
      }
    }

    // Require at least 4 char prefix for significance
    if (commonPrefix < 4) return 0;

    // Score based on prefix ratio
    const maxLen = Math.max(a.length, b.length);
    return 0.7 + (0.2 * commonPrefix / maxLen);
  }

  /**
   * Get embedding similarity between two nodes
   */
  private async getEmbeddingSimilarity(nodeA: NodeData, nodeB: NodeData): Promise<number> {
    const embeddingA = await this.getNodeEmbedding(nodeA);
    const embeddingB = await this.getNodeEmbedding(nodeB);
    return this.embeddingService.cosineSimilarity(embeddingA, embeddingB);
  }

  /**
   * Find prefix matches using Neo4j or in-memory
   */
  private async findPrefixMatches(
    node: NodeData,
    candidates: NodeData[]
  ): Promise<SimilarityMatch[]> {
    const loader = getRuleLoader();
    const thresholds = node.type === 'SCHEMA'
      ? loader.getSchemaSimilarityThresholds()
      : loader.getFuncSimilarityThresholds();

    const matches: SimilarityMatch[] = [];

    for (const candidate of candidates) {
      // Exact name match
      if (node.name.toLowerCase() === candidate.name.toLowerCase()) {
        matches.push(this.createMatch(node, candidate, 1.0, 'exactName', thresholds));
        continue;
      }

      // Prefix match
      const prefixScore = this.getPrefixMatchScore(node.name, candidate.name);
      if (prefixScore >= 0.7) {
        matches.push(this.createMatch(node, candidate, prefixScore, 'prefixMatch', thresholds));
      }
    }

    return matches;
  }

  /**
   * Determine match type based on score and names
   */
  private getMatchType(
    nodeA: NodeData,
    nodeB: NodeData,
    score: number
  ): 'exactName' | 'prefixMatch' | 'embedding' {
    if (nodeA.name.toLowerCase() === nodeB.name.toLowerCase()) {
      return 'exactName';
    }
    const prefixScore = this.getPrefixMatchScore(nodeA.name, nodeB.name);
    if (prefixScore >= 0.7 && Math.abs(score - prefixScore) < 0.1) {
      return 'prefixMatch';
    }
    return 'embedding';
  }

  /**
   * Create a similarity match object
   */
  private createMatch(
    nodeA: NodeData,
    nodeB: NodeData,
    score: number,
    matchType: 'exactName' | 'prefixMatch' | 'embedding',
    thresholds: SimilarityThresholds
  ): SimilarityMatch {
    let recommendation: 'merge' | 'review' | 'keep';
    if (score >= thresholds.nearDuplicate) {
      recommendation = 'merge';
    } else if (score >= thresholds.mergeCandidate) {
      recommendation = 'review';
    } else {
      recommendation = 'keep';
    }

    return {
      nodeA: {
        uuid: nodeA.uuid,
        semanticId: nodeA.semanticId,
        type: nodeA.type,
        name: nodeA.name,
        descr: nodeA.descr,
      },
      nodeB: {
        uuid: nodeB.uuid,
        semanticId: nodeB.semanticId,
        type: nodeB.type,
        name: nodeB.name,
        descr: nodeB.descr,
      },
      score,
      matchType,
      recommendation,
    };
  }
}

// Singleton instance
let scorerInstance: SimilarityScorer | null = null;

/**
 * Get the singleton SimilarityScorer instance
 */
export function getSimilarityScorer(): SimilarityScorer {
  if (!scorerInstance) {
    scorerInstance = new SimilarityScorer();
  }
  return scorerInstance;
}

/**
 * Create a new SimilarityScorer with Neo4j client
 */
export function createSimilarityScorer(neo4jClient?: Neo4jClient): SimilarityScorer {
  return new SimilarityScorer(neo4jClient);
}
