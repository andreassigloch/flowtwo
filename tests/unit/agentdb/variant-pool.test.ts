/**
 * Variant Pool Unit Tests (CR-032 Phase 4)
 *
 * Tests variant isolation, tier management, and promotion.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VariantPool,
  VariantTier,
  type GraphState,
  type GraphDiff,
} from '../../../src/llm-engine/agentdb/variant-pool.js';
import type { Node, Edge } from '../../../src/shared/types/ontology.js';

describe('VariantPool', () => {
  let pool: VariantPool;
  let baseState: GraphState;
  const systemId = 'TestSystem.SY.001';

  const createTestNode = (semanticId: string, name: string): Node => ({
    uuid: semanticId,
    semanticId,
    type: 'FUNC',
    name,
    descr: `Description for ${name}`,
    workspaceId: 'test-workspace',
    systemId,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  });

  const createTestEdge = (uuid: string, sourceId: string, targetId: string): Edge => ({
    uuid,
    type: 'io',
    sourceId,
    targetId,
    workspaceId: 'test-workspace',
    systemId,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  });

  beforeEach(() => {
    pool = new VariantPool();

    // Create base state with 2 nodes and 1 edge
    baseState = {
      nodes: new Map([
        ['NodeA.FN.001', createTestNode('NodeA.FN.001', 'NodeA')],
        ['NodeB.FN.002', createTestNode('NodeB.FN.002', 'NodeB')],
      ]),
      edges: new Map([
        ['edge-1', createTestEdge('edge-1', 'NodeA.FN.001', 'NodeB.FN.002')],
      ]),
      version: 1,
    };
  });

  describe('createVariant()', () => {
    it('should create a new variant with unique ID', () => {
      const variantId = pool.createVariant(systemId, baseState);

      expect(variantId).toMatch(/^variant-TestSystem\.SY\.001-\d+$/);
    });

    it('should create independent copies', () => {
      const variantId = pool.createVariant(systemId, baseState);
      const variant = pool.getVariant(variantId);

      expect(variant).not.toBeNull();
      expect(variant!.nodes.size).toBe(2);
      expect(variant!.edges.size).toBe(1);
      expect(variant!.version).toBe(1);
    });

    it('should not share references with base state', () => {
      const variantId = pool.createVariant(systemId, baseState);
      const variant = pool.getVariant(variantId);

      // Modify base state
      baseState.nodes.set('NewNode.FN.003', createTestNode('NewNode.FN.003', 'NewNode'));

      // Variant should not be affected
      expect(variant!.nodes.has('NewNode.FN.003')).toBe(false);
    });

    it('should start in HOT tier', () => {
      const variantId = pool.createVariant(systemId, baseState);
      const variants = pool.listVariants();

      const created = variants.find(v => v.id === variantId);
      expect(created?.tier).toBe(VariantTier.HOT);
    });
  });

  describe('getVariant()', () => {
    it('should return null for non-existent variant', () => {
      const result = pool.getVariant('non-existent');
      expect(result).toBeNull();
    });

    it('should return variant state', () => {
      const variantId = pool.createVariant(systemId, baseState);
      const variant = pool.getVariant(variantId);

      expect(variant).not.toBeNull();
      expect(variant!.nodes.get('NodeA.FN.001')?.name).toBe('NodeA');
    });

    it('should update lastAccessed time', () => {
      const variantId = pool.createVariant(systemId, baseState);

      // Wait a bit
      const before = pool.listVariants().find(v => v.id === variantId)!.lastAccessed;

      // Access again
      pool.getVariant(variantId);

      const after = pool.listVariants().find(v => v.id === variantId)!.lastAccessed;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('applyToVariant()', () => {
    it('should add nodes', () => {
      const variantId = pool.createVariant(systemId, baseState);

      const diff: GraphDiff = {
        addNodes: [createTestNode('NewNode.FN.003', 'NewNode')],
      };

      pool.applyToVariant(variantId, diff);

      const variant = pool.getVariant(variantId);
      expect(variant!.nodes.size).toBe(3);
      expect(variant!.nodes.has('NewNode.FN.003')).toBe(true);
    });

    it('should update nodes', () => {
      const variantId = pool.createVariant(systemId, baseState);

      const updatedNode = createTestNode('NodeA.FN.001', 'UpdatedNodeA');
      const diff: GraphDiff = {
        updateNodes: [updatedNode],
      };

      pool.applyToVariant(variantId, diff);

      const variant = pool.getVariant(variantId);
      expect(variant!.nodes.get('NodeA.FN.001')?.name).toBe('UpdatedNodeA');
    });

    it('should delete nodes', () => {
      const variantId = pool.createVariant(systemId, baseState);

      const diff: GraphDiff = {
        deleteNodes: ['NodeB.FN.002'],
      };

      pool.applyToVariant(variantId, diff);

      const variant = pool.getVariant(variantId);
      expect(variant!.nodes.size).toBe(1);
      expect(variant!.nodes.has('NodeB.FN.002')).toBe(false);
    });

    it('should add edges', () => {
      const variantId = pool.createVariant(systemId, baseState);

      const diff: GraphDiff = {
        addEdges: [createTestEdge('edge-2', 'NodeB.FN.002', 'NodeA.FN.001')],
      };

      pool.applyToVariant(variantId, diff);

      const variant = pool.getVariant(variantId);
      expect(variant!.edges.size).toBe(2);
    });

    it('should delete edges', () => {
      const variantId = pool.createVariant(systemId, baseState);

      const diff: GraphDiff = {
        deleteEdges: ['edge-1'],
      };

      pool.applyToVariant(variantId, diff);

      const variant = pool.getVariant(variantId);
      expect(variant!.edges.size).toBe(0);
    });

    it('should increment version', () => {
      const variantId = pool.createVariant(systemId, baseState);

      const diff: GraphDiff = {
        addNodes: [createTestNode('NewNode.FN.003', 'NewNode')],
      };

      pool.applyToVariant(variantId, diff);

      const variant = pool.getVariant(variantId);
      expect(variant!.version).toBe(2);
    });

    it('should throw for non-existent variant', () => {
      const diff: GraphDiff = {
        addNodes: [createTestNode('New.FN.001', 'New')],
      };

      expect(() => pool.applyToVariant('non-existent', diff)).toThrow('not found');
    });

    it('should not affect base state', () => {
      const variantId = pool.createVariant(systemId, baseState);

      const diff: GraphDiff = {
        addNodes: [createTestNode('NewNode.FN.003', 'NewNode')],
      };

      pool.applyToVariant(variantId, diff);

      // Base state should be unchanged
      expect(baseState.nodes.size).toBe(2);
      expect(baseState.nodes.has('NewNode.FN.003')).toBe(false);
    });
  });

  describe('promoteVariant()', () => {
    it('should return variant state for promotion', () => {
      const variantId = pool.createVariant(systemId, baseState);

      // Add a node to variant
      pool.applyToVariant(variantId, {
        addNodes: [createTestNode('Promoted.FN.003', 'Promoted')],
      });

      const promoted = pool.promoteVariant(variantId);

      expect(promoted.nodes.size).toBe(3);
      expect(promoted.nodes.has('Promoted.FN.003')).toBe(true);
    });

    it('should discard variant after promotion', () => {
      const variantId = pool.createVariant(systemId, baseState);

      pool.promoteVariant(variantId);

      expect(pool.getVariant(variantId)).toBeNull();
      expect(pool.getVariantCount()).toBe(0);
    });

    it('should throw for non-existent variant', () => {
      expect(() => pool.promoteVariant('non-existent')).toThrow('not found');
    });
  });

  describe('discardVariant()', () => {
    it('should remove variant', () => {
      const variantId = pool.createVariant(systemId, baseState);

      expect(pool.getVariantCount()).toBe(1);

      pool.discardVariant(variantId);

      expect(pool.getVariantCount()).toBe(0);
      expect(pool.getVariant(variantId)).toBeNull();
    });

    it('should be idempotent', () => {
      const variantId = pool.createVariant(systemId, baseState);

      pool.discardVariant(variantId);
      pool.discardVariant(variantId); // Should not throw

      expect(pool.getVariantCount()).toBe(0);
    });
  });

  describe('listVariants()', () => {
    it('should return empty array initially', () => {
      expect(pool.listVariants()).toEqual([]);
    });

    it('should list all variants with metadata', () => {
      pool.createVariant(systemId, baseState);
      pool.createVariant(systemId, baseState);

      const list = pool.listVariants();

      expect(list).toHaveLength(2);
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('baseSystemId', systemId);
      expect(list[0]).toHaveProperty('tier', VariantTier.HOT);
      expect(list[0]).toHaveProperty('nodeCount', 2);
      expect(list[0]).toHaveProperty('edgeCount', 1);
    });
  });

  describe('getVariantsForSystem()', () => {
    it('should filter by system ID', () => {
      pool.createVariant(systemId, baseState);
      pool.createVariant('OtherSystem.SY.002', baseState);

      const forSystem = pool.getVariantsForSystem(systemId);

      expect(forSystem).toHaveLength(1);
      expect(forSystem[0].baseSystemId).toBe(systemId);
    });
  });

  describe('compareVariants()', () => {
    it('should detect added nodes', () => {
      const variantA = pool.createVariant(systemId, baseState);
      const variantB = pool.createVariant(systemId, baseState);

      pool.applyToVariant(variantB, {
        addNodes: [createTestNode('New.FN.003', 'New')],
      });

      const diff = pool.compareVariants(variantA, variantB);

      expect(diff.nodesDiff.added).toContain('New.FN.003');
      expect(diff.nodesDiff.removed).toHaveLength(0);
    });

    it('should detect removed nodes', () => {
      const variantA = pool.createVariant(systemId, baseState);
      const variantB = pool.createVariant(systemId, baseState);

      pool.applyToVariant(variantB, {
        deleteNodes: ['NodeA.FN.001'],
      });

      const diff = pool.compareVariants(variantA, variantB);

      expect(diff.nodesDiff.removed).toContain('NodeA.FN.001');
      expect(diff.nodesDiff.added).toHaveLength(0);
    });

    it('should detect modified nodes', () => {
      const variantA = pool.createVariant(systemId, baseState);
      const variantB = pool.createVariant(systemId, baseState);

      const modified = createTestNode('NodeA.FN.001', 'ModifiedNodeA');
      pool.applyToVariant(variantB, {
        updateNodes: [modified],
      });

      const diff = pool.compareVariants(variantA, variantB);

      expect(diff.nodesDiff.modified).toContain('NodeA.FN.001');
    });

    it('should detect edge differences', () => {
      const variantA = pool.createVariant(systemId, baseState);
      const variantB = pool.createVariant(systemId, baseState);

      pool.applyToVariant(variantB, {
        addEdges: [createTestEdge('edge-new', 'NodeB.FN.002', 'NodeA.FN.001')],
      });

      const diff = pool.compareVariants(variantA, variantB);

      expect(diff.edgesDiff.added).toContain('edge-new');
    });

    it('should throw for non-existent variants', () => {
      const variantA = pool.createVariant(systemId, baseState);

      expect(() => pool.compareVariants(variantA, 'non-existent')).toThrow('not found');
    });
  });

  describe('getMemoryUsage()', () => {
    it('should report zero for empty pool', () => {
      const usage = pool.getMemoryUsage();

      expect(usage.totalVariants).toBe(0);
      expect(usage.estimatedBytes).toBe(0);
    });

    it('should estimate memory usage', () => {
      pool.createVariant(systemId, baseState);

      const usage = pool.getMemoryUsage();

      expect(usage.totalVariants).toBe(1);
      expect(usage.byTier[VariantTier.HOT]).toBe(1);
      // 2 nodes * 500 + 1 edge * 200 = 1200 bytes
      expect(usage.estimatedBytes).toBe(1200);
    });
  });

  describe('clear()', () => {
    it('should remove all variants', () => {
      pool.createVariant(systemId, baseState);
      pool.createVariant(systemId, baseState);

      expect(pool.getVariantCount()).toBe(2);

      pool.clear();

      expect(pool.getVariantCount()).toBe(0);
      expect(pool.listVariants()).toHaveLength(0);
    });
  });

  describe('isolation between variants', () => {
    it('should keep variants completely independent', () => {
      const variantA = pool.createVariant(systemId, baseState);
      const variantB = pool.createVariant(systemId, baseState);

      // Modify variant A
      pool.applyToVariant(variantA, {
        addNodes: [createTestNode('OnlyInA.FN.003', 'OnlyInA')],
      });

      // Modify variant B differently
      pool.applyToVariant(variantB, {
        deleteNodes: ['NodeA.FN.001'],
        addEdges: [createTestEdge('edge-b', 'NodeB.FN.002', 'NodeB.FN.002')],
      });

      const stateA = pool.getVariant(variantA)!;
      const stateB = pool.getVariant(variantB)!;

      // Verify independence
      expect(stateA.nodes.size).toBe(3); // 2 original + 1 added
      expect(stateA.nodes.has('OnlyInA.FN.003')).toBe(true);
      expect(stateA.nodes.has('NodeA.FN.001')).toBe(true);

      expect(stateB.nodes.size).toBe(1); // 2 original - 1 deleted
      expect(stateB.nodes.has('OnlyInA.FN.003')).toBe(false);
      expect(stateB.nodes.has('NodeA.FN.001')).toBe(false);
      expect(stateB.edges.size).toBe(2);
    });
  });
});
