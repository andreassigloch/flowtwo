/**
 * Similarity Scorer
 *
 * Tiered similarity detection for nodes using AgentDB embeddings.
 * All embeddings are stored in AgentDB (Single Source of Truth).
 *
 * Tier 1: Exact name match / Prefix match (no API call)
 * Tier 2: Embedding similarity (from AgentDB cache)
 *
 * CR-032: Refactored to use AgentDB EmbeddingStore
 *
 * @author andreas@siglochconsulting
 */

import type { UnifiedAgentDBService } from '../agentdb/unified-agentdb-service.js';
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
 * Similarity Scorer
 *
 * Uses AgentDB for all embedding storage and computation.
 */
export class SimilarityScorer {
  private agentDB: UnifiedAgentDBService | null = null;

  constructor(agentDB?: UnifiedAgentDBService) {
    this.agentDB = agentDB || null;
  }

  /**
   * Set AgentDB service (for lazy initialization)
   */
  setAgentDB(agentDB: UnifiedAgentDBService): void {
    this.agentDB = agentDB;
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

    // Tier 2: Embedding similarity (via AgentDB)
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

    // Tier 1: Prefix matches (no API call)
    const prefixMatches = this.findPrefixMatches(node, candidates, thresholds);
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
   * Optimized: Batch embeddings upfront via AgentDB + parallel comparisons
   */
  async findAllSimilarityMatches(
    nodes: NodeData[],
    threshold?: number
  ): Promise<SimilarityMatch[]> {
    const loader = getRuleLoader();
    const funcThresholds = loader.getFuncSimilarityThresholds();
    const schemaThresholds = loader.getSchemaSimilarityThresholds();

    // Step 1: Batch compute all embeddings via AgentDB (single API call)
    if (this.agentDB) {
      await this.agentDB.batchComputeEmbeddings(nodes);
    }

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

    // Step 3: Compare all pairs in parallel (embeddings already cached in AgentDB)
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
   * Get similarity score using cached embeddings from AgentDB (no API calls)
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

    // Tier 2: Embedding similarity from AgentDB cache
    if (!this.agentDB) {
      return 0;
    }

    const embeddingA = this.agentDB.getCachedEmbedding(nodeA.uuid);
    const embeddingB = this.agentDB.getCachedEmbedding(nodeB.uuid);

    if (!embeddingA || !embeddingB) {
      // Fallback to API call if cache miss (shouldn't happen after batch)
      return this.getEmbeddingSimilarity(nodeA, nodeB);
    }

    return this.agentDB.cosineSimilarity(embeddingA, embeddingB);
  }

  /**
   * Get embedding for a node via AgentDB
   */
  async getNodeEmbedding(node: NodeData): Promise<number[]> {
    if (!this.agentDB) {
      throw new Error('SimilarityScorer: AgentDB not set');
    }
    return this.agentDB.getEmbedding(node);
  }

  /**
   * Invalidate embedding cache for a node (call when description changes)
   */
  invalidateEmbedding(nodeUuid: string): void {
    this.agentDB?.invalidateEmbedding(nodeUuid);
  }

  /**
   * Clear all cached embeddings
   */
  clearCache(): void {
    this.agentDB?.clearEmbeddings();
  }

  /**
   * Get cache statistics from AgentDB
   */
  getCacheStats(): { size: number; oldestMs: number } {
    return this.agentDB?.getEmbeddingStats() ?? { size: 0, oldestMs: 0 };
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
   * Get embedding similarity between two nodes via AgentDB
   */
  private async getEmbeddingSimilarity(nodeA: NodeData, nodeB: NodeData): Promise<number> {
    if (!this.agentDB) {
      return 0;
    }

    const embeddingA = await this.agentDB.getEmbedding(nodeA);
    const embeddingB = await this.agentDB.getEmbedding(nodeB);
    return this.agentDB.cosineSimilarity(embeddingA, embeddingB);
  }

  /**
   * Find prefix matches (no API call)
   */
  private findPrefixMatches(
    node: NodeData,
    candidates: NodeData[],
    thresholds: SimilarityThresholds
  ): SimilarityMatch[] {
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
 * Create a new SimilarityScorer with AgentDB
 */
export function createSimilarityScorer(agentDB?: UnifiedAgentDBService): SimilarityScorer {
  return new SimilarityScorer(agentDB);
}
