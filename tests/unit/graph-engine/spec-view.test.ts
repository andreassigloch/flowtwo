/**
 * Unit Tests - Spec View Multi-Occurrence Logic
 *
 * Tests the buildMultiOccurrenceTree method in ViewFilter
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ViewFilter } from '../../../src/graph-engine/view-filter.js';
import { GraphState, Node, Edge } from '../../../src/shared/types/ontology.js';
import { DEFAULT_VIEW_CONFIGS } from '../../../src/shared/types/view.js';

describe('Spec View - Multi-Occurrence Logic', () => {
  let graphState: GraphState;

  beforeEach(() => {
    graphState = {
      nodes: new Map(),
      edges: new Map(),
      ports: new Map(),
    };
  });

  describe('buildMultiOccurrenceTree', () => {
    it('marks first occurrence as primary', () => {
      // Setup: Node used in multiple contexts
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const backend = createNode('backend-1', 'MOD', 'Backend');
      const database = createNode('database-1', 'MOD', 'Database');
      const neo4j = createNode('neo4j-1', 'FUNC', 'Neo4jService');

      graphState.nodes.set(sys.id, sys);
      graphState.nodes.set(backend.id, backend);
      graphState.nodes.set(database.id, database);
      graphState.nodes.set(neo4j.id, neo4j);

      // System → Backend → Neo4jService (primary)
      graphState.edges.set(
        'e1',
        createEdge('e1', sys.id, backend.id, 'compose')
      );
      graphState.edges.set(
        'e2',
        createEdge('e2', backend.id, neo4j.id, 'allocate')
      );

      // System → Database → Neo4jService (reference)
      graphState.edges.set(
        'e3',
        createEdge('e3', sys.id, database.id, 'compose')
      );
      graphState.edges.set(
        'e4',
        createEdge('e4', database.id, neo4j.id, 'allocate')
      );

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      const neo4jOccurrences = occurrenceMap.byNode.get(neo4j.id)!;
      expect(neo4jOccurrences).toHaveLength(2);
      expect(neo4jOccurrences[0].isPrimary).toBe(true);
      expect(neo4jOccurrences[1].isPrimary).toBe(false);
    });

    it('builds correct hierarchical paths', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const backend = createNode('backend-1', 'MOD', 'Backend');
      const neo4j = createNode('neo4j-1', 'FUNC', 'Neo4jService');

      graphState.nodes.set(sys.id, sys);
      graphState.nodes.set(backend.id, backend);
      graphState.nodes.set(neo4j.id, neo4j);

      graphState.edges.set(
        'e1',
        createEdge('e1', sys.id, backend.id, 'compose')
      );
      graphState.edges.set(
        'e2',
        createEdge('e2', backend.id, neo4j.id, 'allocate')
      );

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      const neo4jOccurrence = occurrenceMap.byNode.get(neo4j.id)![0];
      expect(neo4jOccurrence.path).toBe('GraphEngine/Backend/Neo4jService');
      expect(neo4jOccurrence.parentPath).toBe('GraphEngine/Backend');
    });

    it('respects maxDepth parameter', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const backend = createNode('backend-1', 'MOD', 'Backend');
      const neo4j = createNode('neo4j-1', 'FUNC', 'Neo4jService');
      const func = createNode('func-1', 'FUNC', 'QueryFunction');

      graphState.nodes.set(sys.id, sys);
      graphState.nodes.set(backend.id, backend);
      graphState.nodes.set(neo4j.id, neo4j);
      graphState.nodes.set(func.id, func);

      graphState.edges.set('e1', createEdge('e1', sys.id, backend.id, 'compose'));
      graphState.edges.set('e2', createEdge('e2', backend.id, neo4j.id, 'allocate'));
      graphState.edges.set('e3', createEdge('e3', neo4j.id, func.id, 'compose'));

      // Create custom config with maxDepth = 2
      const config = {
        ...DEFAULT_VIEW_CONFIGS.spec,
        layoutConfig: {
          ...DEFAULT_VIEW_CONFIGS.spec.layoutConfig,
          parameters: {
            ...DEFAULT_VIEW_CONFIGS.spec.layoutConfig.parameters,
            maxDepth: 2,
          },
        },
      };

      const viewFilter = new ViewFilter(config);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      // Depth 0: GraphEngine
      expect(occurrenceMap.byNode.has(sys.id)).toBe(true);
      // Depth 1: Backend
      expect(occurrenceMap.byNode.has(backend.id)).toBe(true);
      // Depth 2: Neo4jService
      expect(occurrenceMap.byNode.has(neo4j.id)).toBe(true);
      // Depth 3: QueryFunction (should be excluded)
      expect(occurrenceMap.byNode.has(func.id)).toBe(false);
    });

    it('handles circular dependencies without infinite loop', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const modA = createNode('mod-a', 'MOD', 'ModuleA');
      const modB = createNode('mod-b', 'MOD', 'ModuleB');

      graphState.nodes.set(sys.id, sys);
      graphState.nodes.set(modA.id, modA);
      graphState.nodes.set(modB.id, modB);

      // Create circular dependency
      graphState.edges.set('e1', createEdge('e1', sys.id, modA.id, 'compose'));
      graphState.edges.set('e2', createEdge('e2', modA.id, modB.id, 'compose'));
      graphState.edges.set('e3', createEdge('e3', modB.id, modA.id, 'compose')); // Circular

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      // Should complete without hanging
      expect(occurrenceMap.byNode.size).toBeGreaterThan(0);

      // ModuleA should appear twice (once as primary, once skipped due to circular ref)
      const modAOccurrences = occurrenceMap.byNode.get(modA.id);
      expect(modAOccurrences).toBeDefined();
    });

    it('includes all nesting edge types', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const func = createNode('func-1', 'FUNC', 'ChatAPI');
      const req = createNode('req-1', 'REQ', 'REQ-001');
      const mod = createNode('mod-1', 'MOD', 'Backend');

      graphState.nodes.set(sys.id, sys);
      graphState.nodes.set(func.id, func);
      graphState.nodes.set(req.id, req);
      graphState.nodes.set(mod.id, mod);

      // Three different nesting edge types
      graphState.edges.set('e1', createEdge('e1', sys.id, func.id, 'compose'));
      graphState.edges.set('e2', createEdge('e2', func.id, req.id, 'satisfy'));
      graphState.edges.set('e3', createEdge('e3', sys.id, mod.id, 'compose'));
      graphState.edges.set('e4', createEdge('e4', mod.id, func.id, 'allocate'));

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      // FUNC should appear twice (via compose and allocate)
      const funcOccurrences = occurrenceMap.byNode.get(func.id)!;
      expect(funcOccurrences).toHaveLength(2);

      // REQ should appear once (via satisfy from FUNC)
      const reqOccurrences = occurrenceMap.byNode.get(req.id)!;
      expect(reqOccurrences).toHaveLength(1);
      expect(reqOccurrences[0].nestingEdgeType).toBe('satisfy');
    });

    it('finds root nodes correctly', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const orphan = createNode('orphan-1', 'MOD', 'OrphanModule');
      const child = createNode('child-1', 'FUNC', 'ChildFunction');

      graphState.nodes.set(sys.id, sys);
      graphState.nodes.set(orphan.id, orphan);
      graphState.nodes.set(child.id, child);

      // Only child has incoming edge
      graphState.edges.set('e1', createEdge('e1', sys.id, child.id, 'compose'));

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      // Both sys and orphan should be roots (depth 0)
      const sysOcc = occurrenceMap.byNode.get(sys.id)![0];
      const orphanOcc = occurrenceMap.byNode.get(orphan.id)![0];

      expect(sysOcc.depth).toBe(0);
      expect(orphanOcc.depth).toBe(0);

      // Child should not be root (depth 1)
      const childOcc = occurrenceMap.byNode.get(child.id)![0];
      expect(childOcc.depth).toBe(1);
    });

    it('only expands children for primary occurrence', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const modA = createNode('mod-a', 'MOD', 'ModuleA');
      const modB = createNode('mod-b', 'MOD', 'ModuleB');
      const func = createNode('func-1', 'FUNC', 'SharedFunction');
      const child = createNode('child-1', 'FUNC', 'ChildFunction');

      graphState.nodes.set(sys.id, sys);
      graphState.nodes.set(modA.id, modA);
      graphState.nodes.set(modB.id, modB);
      graphState.nodes.set(func.id, func);
      graphState.nodes.set(child.id, child);

      // SharedFunction used in ModuleA and ModuleB
      graphState.edges.set('e1', createEdge('e1', sys.id, modA.id, 'compose'));
      graphState.edges.set('e2', createEdge('e2', sys.id, modB.id, 'compose'));
      graphState.edges.set('e3', createEdge('e3', modA.id, func.id, 'allocate'));
      graphState.edges.set('e4', createEdge('e4', modB.id, func.id, 'allocate'));

      // ChildFunction nested under SharedFunction
      graphState.edges.set('e5', createEdge('e5', func.id, child.id, 'compose'));

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      // SharedFunction should appear twice
      const funcOccurrences = occurrenceMap.byNode.get(func.id)!;
      expect(funcOccurrences).toHaveLength(2);

      // ChildFunction should appear only once (under primary occurrence of SharedFunction)
      const childOccurrences = occurrenceMap.byNode.get(child.id)!;
      expect(childOccurrences).toHaveLength(1);
    });
  });
});

// Helper functions

function createNode(id: string, type: string, name: string): Node {
  return {
    id,
    semanticId: id,
    type: type as any,
    category: 'definition',
    properties: {
      Name: name,
      Description: '',
    },
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: 'test',
      version: '1.0.0',
    },
  };
}

function createEdge(
  id: string,
  sourceId: string,
  targetId: string,
  type: string
): Edge {
  return {
    id,
    semanticId: id,
    sourceId,
    targetId,
    type: type as any,
    properties: {},
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: 'test',
      version: '1.0.0',
    },
  };
}
