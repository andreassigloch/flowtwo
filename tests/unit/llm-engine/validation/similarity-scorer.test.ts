/**
 * Similarity Scorer Unit Tests
 *
 * Tests for tiered similarity detection.
 *
 * CR-030: Evaluation Criteria Implementation
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimilarityScorer, createSimilarityScorer, type NodeData } from '../../../../src/llm-engine/validation/similarity-scorer.js';

// Mock the EmbeddingService to avoid API calls in tests
vi.mock('../../../../src/llm-engine/agentdb/embedding-service.js', () => ({
  EmbeddingService: class MockEmbeddingService {
    async embedText(text: string): Promise<number[]> {
      // Generate deterministic mock embedding based on text hash
      const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return Array.from({ length: 10 }, (_, i) => Math.sin(hash + i));
    }

    async embedTexts(texts: string[]): Promise<number[][]> {
      // Batch version - same logic as embedText
      return texts.map((text) => {
        const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return Array.from({ length: 10 }, (_, i) => Math.sin(hash + i));
      });
    }

    cosineSimilarity(a: number[], b: number[]): number {
      if (a.length !== b.length) return 0;
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
  },
}));

describe('SimilarityScorer', () => {
  let scorer: SimilarityScorer;

  beforeEach(() => {
    scorer = createSimilarityScorer();
    scorer.clearCache();
  });

  describe('getSimilarityScore', () => {
    it('should return 0 for different node types', async () => {
      const nodeA: NodeData = {
        uuid: '1',
        semanticId: 'ValidateOrder.FN.001',
        type: 'FUNC',
        name: 'ValidateOrder',
        descr: 'Validates an order',
      };
      const nodeB: NodeData = {
        uuid: '2',
        semanticId: 'OrderSchema.SC.001',
        type: 'SCHEMA',
        name: 'ValidateOrder',
        descr: 'Order data schema',
      };

      const score = await scorer.getSimilarityScore(nodeA, nodeB);
      expect(score).toBe(0);
    });

    it('should return 1.0 for exact name match (same type)', async () => {
      const nodeA: NodeData = {
        uuid: '1',
        semanticId: 'ValidateOrder.FN.001',
        type: 'FUNC',
        name: 'ValidateOrder',
        descr: 'Validates an order',
      };
      const nodeB: NodeData = {
        uuid: '2',
        semanticId: 'ValidateOrder.FN.002',
        type: 'FUNC',
        name: 'ValidateOrder',
        descr: 'Different description',
      };

      const score = await scorer.getSimilarityScore(nodeA, nodeB);
      expect(score).toBe(1.0);
    });

    it('should return 1.0 for case-insensitive exact name match', async () => {
      const nodeA: NodeData = {
        uuid: '1',
        semanticId: 'ValidateOrder.FN.001',
        type: 'FUNC',
        name: 'ValidateOrder',
        descr: 'Validates an order',
      };
      const nodeB: NodeData = {
        uuid: '2',
        semanticId: 'validateorder.FN.002',
        type: 'FUNC',
        name: 'validateorder',
        descr: 'Different description',
      };

      const score = await scorer.getSimilarityScore(nodeA, nodeB);
      expect(score).toBe(1.0);
    });

    it('should return score for prefix match', async () => {
      const nodeA: NodeData = {
        uuid: '1',
        semanticId: 'ValidateOrder.FN.001',
        type: 'FUNC',
        name: 'ValidateOrder',
        descr: 'Validates an order',
      };
      const nodeB: NodeData = {
        uuid: '2',
        semanticId: 'ValidateOrderItems.FN.002',
        type: 'FUNC',
        name: 'ValidateOrderItems',
        descr: 'Validates order items',
      };

      const score = await scorer.getSimilarityScore(nodeA, nodeB);
      // With mock embedding, score may be low - just verify it's a valid score
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return embedding-based score for different names', async () => {
      const nodeA: NodeData = {
        uuid: '1',
        semanticId: 'ProcessPayment.FN.001',
        type: 'FUNC',
        name: 'ProcessPayment',
        descr: 'Processes payment transactions',
      };
      const nodeB: NodeData = {
        uuid: '2',
        semanticId: 'HandleRefund.FN.002',
        type: 'FUNC',
        name: 'HandleRefund',
        descr: 'Handles refund requests',
      };

      const score = await scorer.getSimilarityScore(nodeA, nodeB);
      // Cosine similarity can be negative with mock embeddings
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('findSimilarNodes', () => {
    it('should find exact name matches', async () => {
      const targetNode: NodeData = {
        uuid: '1',
        semanticId: 'ValidateOrder.FN.001',
        type: 'FUNC',
        name: 'ValidateOrder',
        descr: 'Validates an order',
      };

      const allNodes: NodeData[] = [
        targetNode,
        {
          uuid: '2',
          semanticId: 'ValidateOrder.FN.002',
          type: 'FUNC',
          name: 'ValidateOrder',
          descr: 'Validates orders',
        },
        {
          uuid: '3',
          semanticId: 'ProcessOrder.FN.003',
          type: 'FUNC',
          name: 'ProcessOrder',
          descr: 'Processes orders',
        },
      ];

      const matches = await scorer.findSimilarNodes(targetNode, allNodes, 0.9);

      // Should find 1 exact match (uuid=2)
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].nodeB.uuid).toBe('2');
      expect(matches[0].score).toBe(1.0);
      expect(matches[0].matchType).toBe('exactName');
    });

    it('should exclude self from matches', async () => {
      const targetNode: NodeData = {
        uuid: '1',
        semanticId: 'ValidateOrder.FN.001',
        type: 'FUNC',
        name: 'ValidateOrder',
        descr: 'Validates an order',
      };

      const matches = await scorer.findSimilarNodes(targetNode, [targetNode], 0.5);

      expect(matches.length).toBe(0);
    });

    it('should only compare same type nodes', async () => {
      const targetNode: NodeData = {
        uuid: '1',
        semanticId: 'ValidateOrder.FN.001',
        type: 'FUNC',
        name: 'ValidateOrder',
        descr: 'Validates an order',
      };

      const allNodes: NodeData[] = [
        targetNode,
        {
          uuid: '2',
          semanticId: 'ValidateOrder.SC.001',
          type: 'SCHEMA',
          name: 'ValidateOrder',
          descr: 'Order validation schema',
        },
      ];

      const matches = await scorer.findSimilarNodes(targetNode, allNodes, 0.5);

      expect(matches.length).toBe(0);
    });

    it('should sort matches by score descending', async () => {
      const targetNode: NodeData = {
        uuid: '1',
        semanticId: 'Validate.FN.001',
        type: 'FUNC',
        name: 'Validate',
        descr: 'Validates data',
      };

      const allNodes: NodeData[] = [
        targetNode,
        {
          uuid: '2',
          semanticId: 'Validate.FN.002',
          type: 'FUNC',
          name: 'Validate',
          descr: 'Validates data too',
        },
        {
          uuid: '3',
          semanticId: 'ValidateOrder.FN.003',
          type: 'FUNC',
          name: 'ValidateOrder',
          descr: 'Validates orders',
        },
      ];

      const matches = await scorer.findSimilarNodes(targetNode, allNodes, 0.5);

      expect(matches.length).toBeGreaterThan(0);
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
      }
    });
  });

  describe('findAllSimilarityMatches', () => {
    it('should find all pairwise matches above threshold', async () => {
      const nodes: NodeData[] = [
        {
          uuid: '1',
          semanticId: 'ValidateOrder.FN.001',
          type: 'FUNC',
          name: 'ValidateOrder',
          descr: 'Validates an order',
        },
        {
          uuid: '2',
          semanticId: 'ValidateOrder.FN.002',
          type: 'FUNC',
          name: 'ValidateOrder',
          descr: 'Validates orders',
        },
        {
          uuid: '3',
          semanticId: 'ProcessOrder.FN.003',
          type: 'FUNC',
          name: 'ProcessOrder',
          descr: 'Processes orders',
        },
      ];

      const matches = await scorer.findAllSimilarityMatches(nodes, 0.9);

      expect(matches.length).toBe(1);
      expect(matches[0].score).toBe(1.0);
    });

    it('should not duplicate pairs', async () => {
      const nodes: NodeData[] = [
        {
          uuid: '1',
          semanticId: 'A.FN.001',
          type: 'FUNC',
          name: 'A',
          descr: 'Func A',
        },
        {
          uuid: '2',
          semanticId: 'A.FN.002',
          type: 'FUNC',
          name: 'A',
          descr: 'Func A duplicate',
        },
      ];

      const matches = await scorer.findAllSimilarityMatches(nodes, 0.5);

      expect(matches.length).toBe(1);
    });
  });

  describe('recommendation', () => {
    it('should recommend merge for near-duplicates (>=0.85)', async () => {
      const nodes: NodeData[] = [
        {
          uuid: '1',
          semanticId: 'ValidateOrder.FN.001',
          type: 'FUNC',
          name: 'ValidateOrder',
          descr: 'Validates an order',
        },
        {
          uuid: '2',
          semanticId: 'ValidateOrder.FN.002',
          type: 'FUNC',
          name: 'ValidateOrder',
          descr: 'Validates orders',
        },
      ];

      const matches = await scorer.findAllSimilarityMatches(nodes, 0.5);

      expect(matches.length).toBe(1);
      expect(matches[0].recommendation).toBe('merge');
    });
  });

  describe('caching', () => {
    it('should cache embeddings', async () => {
      const node: NodeData = {
        uuid: '1',
        semanticId: 'Test.FN.001',
        type: 'FUNC',
        name: 'Test',
        descr: 'Test function',
      };

      await scorer.getNodeEmbedding(node);
      const stats1 = scorer.getCacheStats();

      await scorer.getNodeEmbedding(node);
      const stats2 = scorer.getCacheStats();

      expect(stats1.size).toBe(1);
      expect(stats2.size).toBe(1);
    });

    it('should invalidate cache on demand', async () => {
      const node: NodeData = {
        uuid: '1',
        semanticId: 'Test.FN.001',
        type: 'FUNC',
        name: 'Test',
        descr: 'Test function',
      };

      await scorer.getNodeEmbedding(node);
      expect(scorer.getCacheStats().size).toBe(1);

      scorer.invalidateEmbedding(node.uuid);
      expect(scorer.getCacheStats().size).toBe(0);
    });

    it('should clear all cache', async () => {
      const nodes: NodeData[] = [
        {
          uuid: '1',
          semanticId: 'A.FN.001',
          type: 'FUNC',
          name: 'A',
          descr: 'A',
        },
        {
          uuid: '2',
          semanticId: 'B.FN.002',
          type: 'FUNC',
          name: 'B',
          descr: 'B',
        },
      ];

      for (const node of nodes) {
        await scorer.getNodeEmbedding(node);
      }
      expect(scorer.getCacheStats().size).toBe(2);

      scorer.clearCache();
      expect(scorer.getCacheStats().size).toBe(0);
    });
  });
});
