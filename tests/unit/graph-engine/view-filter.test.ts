/**
 * View Filter - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate view filtering logic
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ViewFilter } from '../../../src/graph-engine/view-filter.js';
import { ViewConfig, DEFAULT_VIEW_CONFIGS } from '../../../src/shared/types/view.js';
import { Node, Edge, GraphState } from '../../../src/shared/types/ontology.js';

describe('ViewFilter', () => {
  let sampleGraph: GraphState;

  beforeEach(() => {
    // Create sample graph with all node types
    const nodes: Node[] = [
      createNode('System.SY.001', 'SYS', 'System'),
      createNode('UseCase.UC.001', 'UC', 'Use Case'),
      createNode('Chain.FC.001', 'FCHAIN', 'Chain'),
      createNode('Function.FN.001', 'FUNC', 'Function'),
      createNode('FlowData.FL.001', 'FLOW', 'Flow Data'),
      createNode('Requirement.RQ.001', 'REQ', 'Requirement'),
      createNode('Test.TS.001', 'TEST', 'Test'),
      createNode('Module.MD.001', 'MOD', 'Module'),
      createNode('Actor.AC.001', 'ACTOR', 'Actor'),
    ];

    const edges: Edge[] = [
      createEdge('System.SY.001', 'UseCase.UC.001', 'compose'),
      createEdge('UseCase.UC.001', 'Chain.FC.001', 'compose'),
      createEdge('Chain.FC.001', 'Function.FN.001', 'compose'),
      createEdge('FlowData.FL.001', 'Function.FN.001', 'io'),
      createEdge('Function.FN.001', 'Requirement.RQ.001', 'satisfy'),
      createEdge('Test.TS.001', 'Requirement.RQ.001', 'verify'),
      createEdge('Function.FN.001', 'Module.MD.001', 'allocate'),
      createEdge('Actor.AC.001', 'UseCase.UC.001', 'io'),
    ];

    sampleGraph = {
      workspaceId: 'test-ws',
      systemId: 'System.SY.001',
      nodes: new Map(nodes.map((n) => [n.semanticId, n])),
      edges: new Map(edges.map((e, idx) => [`edge-${idx}`, e])),
      ports: new Map(),
      version: 1,
      lastSavedVersion: 1,
      lastModified: new Date(),
    };
  });

  describe('applyLayoutFilter', () => {
    it('should filter nodes by layout config (hierarchy view)', () => {
      const viewConfig = DEFAULT_VIEW_CONFIGS.hierarchy;
      const filter = new ViewFilter(viewConfig);

      const filtered = filter.applyLayoutFilter(sampleGraph);

      // Should include: SYS, UC, FCHAIN, FUNC, MOD
      expect(filtered.nodes.size).toBe(5);
      expect(filtered.nodes.has('System.SY.001')).toBe(true);
      expect(filtered.nodes.has('UseCase.UC.001')).toBe(true);
      expect(filtered.nodes.has('Chain.FC.001')).toBe(true);
      expect(filtered.nodes.has('Function.FN.001')).toBe(true);
      expect(filtered.nodes.has('Module.MD.001')).toBe(true);

      // Should exclude: FLOW, REQ, TEST, ACTOR
      expect(filtered.nodes.has('FlowData.FL.001')).toBe(false);
      expect(filtered.nodes.has('Requirement.RQ.001')).toBe(false);
    });

    it('should filter edges by layout config (hierarchy view)', () => {
      const viewConfig = DEFAULT_VIEW_CONFIGS.hierarchy;
      const filter = new ViewFilter(viewConfig);

      const filtered = filter.applyLayoutFilter(sampleGraph);

      // Should only include compose edges
      const edgeTypes = Array.from(filtered.edges.values()).map((e) => e.type);
      expect(edgeTypes.every((t) => t === 'compose')).toBe(true);
      expect(filtered.edges.size).toBe(3); // SYS→UC, UC→FCHAIN, FCHAIN→FUNC
    });

    it('should include FLOW nodes in functional-flow layout', () => {
      const viewConfig = DEFAULT_VIEW_CONFIGS['functional-flow'];
      const filter = new ViewFilter(viewConfig);

      const filtered = filter.applyLayoutFilter(sampleGraph);

      // FLOW needed for port extraction (even though hidden in render)
      expect(filtered.nodes.has('FlowData.FL.001')).toBe(true);
      expect(filtered.nodes.has('Function.FN.001')).toBe(true);
    });

    it('should filter to requirements traceability graph', () => {
      const viewConfig = DEFAULT_VIEW_CONFIGS.requirements;
      const filter = new ViewFilter(viewConfig);

      const filtered = filter.applyLayoutFilter(sampleGraph);

      // Should include: FUNC, REQ, TEST
      expect(filtered.nodes.size).toBe(3);
      expect(filtered.nodes.has('Function.FN.001')).toBe(true);
      expect(filtered.nodes.has('Requirement.RQ.001')).toBe(true);
      expect(filtered.nodes.has('Test.TS.001')).toBe(true);

      // Should include: satisfy, verify edges
      const edgeTypes = Array.from(filtered.edges.values()).map((e) => e.type);
      expect(edgeTypes).toContain('satisfy');
      expect(edgeTypes).toContain('verify');
      expect(filtered.edges.size).toBe(2);
    });
  });

  describe('applyRenderFilter', () => {
    it('should hide FLOW nodes in functional-flow render', () => {
      const viewConfig = DEFAULT_VIEW_CONFIGS['functional-flow'];
      const filter = new ViewFilter(viewConfig);

      // First apply layout filter (includes FLOW)
      const layoutFiltered = filter.applyLayoutFilter(sampleGraph);
      expect(layoutFiltered.nodes.has('FlowData.FL.001')).toBe(true);

      // Then apply render filter (hides FLOW)
      const renderFiltered = filter.applyRenderFilter(layoutFiltered);
      expect(renderFiltered.nodes.has('FlowData.FL.001')).toBe(false);
      expect(renderFiltered.nodes.has('Function.FN.001')).toBe(true);
    });

    it('should hide compose edges in hierarchy render (implicit via nesting)', () => {
      const viewConfig = DEFAULT_VIEW_CONFIGS.hierarchy;
      const filter = new ViewFilter(viewConfig);

      const layoutFiltered = filter.applyLayoutFilter(sampleGraph);
      const renderFiltered = filter.applyRenderFilter(layoutFiltered);

      // Compose edges should be hidden (implicit via nesting)
      expect(renderFiltered.edges.size).toBe(0);
    });

    it('should show only specified edges in requirements view', () => {
      const viewConfig = DEFAULT_VIEW_CONFIGS.requirements;
      const filter = new ViewFilter(viewConfig);

      const layoutFiltered = filter.applyLayoutFilter(sampleGraph);
      const renderFiltered = filter.applyRenderFilter(layoutFiltered);

      // Should show satisfy and verify edges
      const edgeTypes = Array.from(renderFiltered.edges.values()).map((e) => e.type);
      expect(edgeTypes).toContain('satisfy');
      expect(edgeTypes).toContain('verify');
    });
  });

  describe('separate layout and render filters', () => {
    it('should use FLOW for layout but hide in render', () => {
      const viewConfig = DEFAULT_VIEW_CONFIGS['functional-flow'];
      const filter = new ViewFilter(viewConfig);

      const layoutGraph = filter.applyLayoutFilter(sampleGraph);
      const renderGraph = filter.applyRenderFilter(layoutGraph);

      // Layout includes FLOW (for port extraction)
      expect(Array.from(layoutGraph.nodes.values()).some((n) => n.type === 'FLOW')).toBe(true);

      // Render excludes FLOW
      expect(Array.from(renderGraph.nodes.values()).some((n) => n.type === 'FLOW')).toBe(false);
    });
  });

  describe('edge filtering removes dangling edges', () => {
    it('should remove edges whose source/target was filtered out', () => {
      const viewConfig = DEFAULT_VIEW_CONFIGS.hierarchy;
      const filter = new ViewFilter(viewConfig);

      const filtered = filter.applyLayoutFilter(sampleGraph);

      // io edge (FlowData → Function) should be removed because FlowData is not included
      const hasIoEdge = Array.from(filtered.edges.values()).some((e) => e.type === 'io');
      expect(hasIoEdge).toBe(false);
    });
  });
});

// ========== TEST HELPERS ==========

function createNode(
  semanticId: string,
  type: string,
  name: string,
  description: string = 'Test node'
): Node {
  return {
    uuid: `uuid-${semanticId}`,
    semanticId,
    type: type as any,
    name,
    description,
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
