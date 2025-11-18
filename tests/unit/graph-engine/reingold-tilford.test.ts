/**
 * Reingold-Tilford Layout - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate tree layout algorithm
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect } from 'vitest';
import { ReingoldTilfordLayout } from '../../../src/graph-engine/reingold-tilford.js';
import { GraphState, Node, Edge } from '../../../src/shared/types/ontology.js';

describe('ReingoldTilfordLayout', () => {
  describe('compute', () => {
    it('should position root node at origin', () => {
      const graph = createTree([
        createNode('Root.SY.001', 'SYS', 'Root'),
      ], []);

      const layout = new ReingoldTilfordLayout({
        orientation: 'top-down',
        nodeSpacing: 50,
        levelSpacing: 100,
      });

      const result = layout.compute(graph);

      expect(result.positions.has('Root.SY.001')).toBe(true);
      const rootPos = result.positions.get('Root.SY.001')!;
      expect(rootPos.y).toBe(0); // Top
    });

    it('should place children below parent (top-down)', () => {
      const graph = createTree([
        createNode('Root.SY.001', 'SYS', 'Root'),
        createNode('Child1.UC.001', 'UC', 'Child1'),
        createNode('Child2.UC.002', 'UC', 'Child2'),
      ], [
        createEdge('Root.SY.001', 'Child1.UC.001'),
        createEdge('Root.SY.001', 'Child2.UC.002'),
      ]);

      const layout = new ReingoldTilfordLayout({
        orientation: 'top-down',
        levelSpacing: 100,
      });

      const result = layout.compute(graph);

      const rootPos = result.positions.get('Root.SY.001')!;
      const child1Pos = result.positions.get('Child1.UC.001')!;
      const child2Pos = result.positions.get('Child2.UC.002')!;

      // Children below root
      expect(child1Pos.y).toBeGreaterThan(rootPos.y);
      expect(child2Pos.y).toBeGreaterThan(rootPos.y);

      // Children on same level
      expect(child1Pos.y).toBe(child2Pos.y);

      // Children horizontally separated
      expect(child1Pos.x).not.toBe(child2Pos.x);
    });

    it('should center parent over children', () => {
      const graph = createTree([
        createNode('Root.SY.001', 'SYS', 'Root'),
        createNode('Child1.UC.001', 'UC', 'Child1'),
        createNode('Child2.UC.002', 'UC', 'Child2'),
      ], [
        createEdge('Root.SY.001', 'Child1.UC.001'),
        createEdge('Root.SY.001', 'Child2.UC.002'),
      ]);

      const layout = new ReingoldTilfordLayout({ orientation: 'top-down' });
      const result = layout.compute(graph);

      const rootPos = result.positions.get('Root.SY.001')!;
      const child1Pos = result.positions.get('Child1.UC.001')!;
      const child2Pos = result.positions.get('Child2.UC.002')!;

      // Root centered between children
      const childrenMidpoint = (child1Pos.x + child2Pos.x) / 2;
      expect(Math.abs(rootPos.x - childrenMidpoint)).toBeLessThan(1); // Allow floating point error
    });

    it('should handle deep tree (multiple levels)', () => {
      const graph = createTree([
        createNode('L0.SY.001', 'SYS', 'Level0'),
        createNode('L1.UC.001', 'UC', 'Level1'),
        createNode('L2.FC.001', 'FCHAIN', 'Level2'),
        createNode('L3.FN.001', 'FUNC', 'Level3'),
      ], [
        createEdge('L0.SY.001', 'L1.UC.001'),
        createEdge('L1.UC.001', 'L2.FC.001'),
        createEdge('L2.FC.001', 'L3.FN.001'),
      ]);

      const layout = new ReingoldTilfordLayout({
        orientation: 'top-down',
        levelSpacing: 100,
      });

      const result = layout.compute(graph);

      const l0 = result.positions.get('L0.SY.001')!;
      const l1 = result.positions.get('L1.UC.001')!;
      const l2 = result.positions.get('L2.FC.001')!;
      const l3 = result.positions.get('L3.FN.001')!;

      // Each level deeper than previous
      expect(l1.y).toBeGreaterThan(l0.y);
      expect(l2.y).toBeGreaterThan(l1.y);
      expect(l3.y).toBeGreaterThan(l2.y);

      // Level spacing should be consistent
      expect(l1.y - l0.y).toBe(100);
      expect(l2.y - l1.y).toBe(100);
      expect(l3.y - l2.y).toBe(100);
    });

    it('should handle wide tree (many siblings)', () => {
      const graph = createTree([
        createNode('Root.SY.001', 'SYS', 'Root'),
        createNode('Child1.UC.001', 'UC', 'Child1'),
        createNode('Child2.UC.002', 'UC', 'Child2'),
        createNode('Child3.UC.003', 'UC', 'Child3'),
        createNode('Child4.UC.004', 'UC', 'Child4'),
      ], [
        createEdge('Root.SY.001', 'Child1.UC.001'),
        createEdge('Root.SY.001', 'Child2.UC.002'),
        createEdge('Root.SY.001', 'Child3.UC.003'),
        createEdge('Root.SY.001', 'Child4.UC.004'),
      ]);

      const layout = new ReingoldTilfordLayout({
        orientation: 'top-down',
        nodeSpacing: 50,
      });

      const result = layout.compute(graph);

      const positions = [1, 2, 3, 4].map((i) => result.positions.get(`Child${i}.UC.00${i}`)!);

      // All on same level
      expect(new Set(positions.map((p) => p.y)).size).toBe(1);

      // Sorted by x position
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i].x).toBeGreaterThan(positions[i - 1].x);
      }

      // Minimum spacing between siblings
      for (let i = 1; i < positions.length; i++) {
        const spacing = positions[i].x - positions[i - 1].x;
        expect(spacing).toBeGreaterThanOrEqual(50);
      }
    });

    it('should compute correct bounds', () => {
      const graph = createTree([
        createNode('Root.SY.001', 'SYS', 'Root'),
        createNode('Child1.UC.001', 'UC', 'Child1'),
        createNode('Child2.UC.002', 'UC', 'Child2'),
      ], [
        createEdge('Root.SY.001', 'Child1.UC.001'),
        createEdge('Root.SY.001', 'Child2.UC.002'),
      ]);

      const layout = new ReingoldTilfordLayout({ orientation: 'top-down' });
      const result = layout.compute(graph);

      expect(result.bounds).toBeDefined();
      expect(result.bounds.minX).toBeLessThanOrEqual(result.bounds.maxX);
      expect(result.bounds.minY).toBeLessThanOrEqual(result.bounds.maxY);
      expect(result.bounds.width).toBeGreaterThan(0);
      expect(result.bounds.height).toBeGreaterThan(0);
    });

    it('should support left-right orientation', () => {
      const graph = createTree([
        createNode('Root.SY.001', 'SYS', 'Root'),
        createNode('Child.UC.001', 'UC', 'Child'),
      ], [
        createEdge('Root.SY.001', 'Child.UC.001'),
      ]);

      const layout = new ReingoldTilfordLayout({
        orientation: 'left-right',
        levelSpacing: 100,
      });

      const result = layout.compute(graph);

      const rootPos = result.positions.get('Root.SY.001')!;
      const childPos = result.positions.get('Child.UC.001')!;

      // Child to the right of root
      expect(childPos.x).toBeGreaterThan(rootPos.x);
      expect(childPos.x - rootPos.x).toBe(100);
    });

    it('should handle forest (multiple roots)', () => {
      const graph = createTree([
        createNode('Root1.SY.001', 'SYS', 'Root1'),
        createNode('Root2.SY.002', 'SYS', 'Root2'),
        createNode('Child1.UC.001', 'UC', 'Child1'),
        createNode('Child2.UC.002', 'UC', 'Child2'),
      ], [
        createEdge('Root1.SY.001', 'Child1.UC.001'),
        createEdge('Root2.SY.002', 'Child2.UC.002'),
      ]);

      const layout = new ReingoldTilfordLayout({ orientation: 'top-down' });
      const result = layout.compute(graph);

      // All nodes should be positioned
      expect(result.positions.size).toBe(4);

      // Roots on same level
      const root1Pos = result.positions.get('Root1.SY.001')!;
      const root2Pos = result.positions.get('Root2.SY.002')!;
      expect(root1Pos.y).toBe(root2Pos.y);
    });
  });
});

// ========== TEST HELPERS ==========

function createNode(
  semanticId: string,
  type: string,
  name: string
): Node {
  return {
    uuid: `uuid-${semanticId}`,
    semanticId,
    type: type as any,
    name,
    description: 'Test node',
    workspaceId: 'test-ws',
    systemId: 'System.SY.001',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

function createEdge(
  sourceId: string,
  targetId: string,
  type: string = 'compose'
): Edge {
  return {
    uuid: `uuid-${sourceId}-${targetId}`,
    type: type as any,
    sourceId,
    targetId,
    workspaceId: 'test-ws',
    systemId: 'System.SY.001',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

function createTree(nodes: Node[], edges: Edge[]): GraphState {
  return {
    workspaceId: 'test-ws',
    systemId: 'System.SY.001',
    nodes: new Map(nodes.map((n) => [n.semanticId, n])),
    edges: new Map(edges.map((e, idx) => [`edge-${idx}`, e])),
    ports: new Map(),
    version: 1,
    lastSavedVersion: 1,
    lastModified: new Date(),
  };
}
