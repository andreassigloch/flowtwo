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

      graphState.nodes.set(sys.semanticId, sys);
      graphState.nodes.set(backend.semanticId, backend);
      graphState.nodes.set(database.semanticId, database);
      graphState.nodes.set(neo4j.semanticId, neo4j);

      // System → Backend → Neo4jService (primary)
      graphState.edges.set(
        'e1',
        createEdge('e1', sys.semanticId, backend.semanticId, 'compose')
      );
      graphState.edges.set(
        'e2',
        createEdge('e2', backend.semanticId, neo4j.semanticId, 'allocate')
      );

      // System → Database → Neo4jService (reference)
      graphState.edges.set(
        'e3',
        createEdge('e3', sys.semanticId, database.semanticId, 'compose')
      );
      graphState.edges.set(
        'e4',
        createEdge('e4', database.semanticId, neo4j.semanticId, 'allocate')
      );

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      const neo4jOccurrences = occurrenceMap.byNode.get(neo4j.semanticId)!;
      expect(neo4jOccurrences).toHaveLength(2);
      expect(neo4jOccurrences[0].isPrimary).toBe(true);
      expect(neo4jOccurrences[1].isPrimary).toBe(false);
    });

    it('builds correct hierarchical paths', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const backend = createNode('backend-1', 'MOD', 'Backend');
      const neo4j = createNode('neo4j-1', 'FUNC', 'Neo4jService');

      graphState.nodes.set(sys.semanticId, sys);
      graphState.nodes.set(backend.semanticId, backend);
      graphState.nodes.set(neo4j.semanticId, neo4j);

      graphState.edges.set(
        'e1',
        createEdge('e1', sys.semanticId, backend.semanticId, 'compose')
      );
      graphState.edges.set(
        'e2',
        createEdge('e2', backend.semanticId, neo4j.semanticId, 'allocate')
      );

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      const neo4jOccurrence = occurrenceMap.byNode.get(neo4j.semanticId)![0];
      expect(neo4jOccurrence.path).toBe('GraphEngine/Backend/Neo4jService');
      expect(neo4jOccurrence.parentPath).toBe('GraphEngine/Backend');
    });

    it('respects maxDepth parameter', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const backend = createNode('backend-1', 'MOD', 'Backend');
      const neo4j = createNode('neo4j-1', 'FUNC', 'Neo4jService');
      const func = createNode('func-1', 'FUNC', 'QueryFunction');

      graphState.nodes.set(sys.semanticId, sys);
      graphState.nodes.set(backend.semanticId, backend);
      graphState.nodes.set(neo4j.semanticId, neo4j);
      graphState.nodes.set(func.semanticId, func);

      graphState.edges.set('e1', createEdge('e1', sys.semanticId, backend.semanticId, 'compose'));
      graphState.edges.set('e2', createEdge('e2', backend.semanticId, neo4j.semanticId, 'allocate'));
      graphState.edges.set('e3', createEdge('e3', neo4j.semanticId, func.semanticId, 'compose'));

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
      expect(occurrenceMap.byNode.has(sys.semanticId)).toBe(true);
      // Depth 1: Backend
      expect(occurrenceMap.byNode.has(backend.semanticId)).toBe(true);
      // Depth 2: Neo4jService
      expect(occurrenceMap.byNode.has(neo4j.semanticId)).toBe(true);
      // Depth 3: QueryFunction (should be excluded)
      expect(occurrenceMap.byNode.has(func.semanticId)).toBe(false);
    });

    it('handles circular dependencies without infinite loop', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const modA = createNode('mod-a', 'MOD', 'ModuleA');
      const modB = createNode('mod-b', 'MOD', 'ModuleB');

      graphState.nodes.set(sys.semanticId, sys);
      graphState.nodes.set(modA.semanticId, modA);
      graphState.nodes.set(modB.semanticId, modB);

      // Create circular dependency
      graphState.edges.set('e1', createEdge('e1', sys.semanticId, modA.semanticId, 'compose'));
      graphState.edges.set('e2', createEdge('e2', modA.semanticId, modB.semanticId, 'compose'));
      graphState.edges.set('e3', createEdge('e3', modB.semanticId, modA.semanticId, 'compose')); // Circular

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      // Should complete without hanging
      expect(occurrenceMap.byNode.size).toBeGreaterThan(0);

      // ModuleA should appear twice (once as primary, once skipped due to circular ref)
      const modAOccurrences = occurrenceMap.byNode.get(modA.semanticId);
      expect(modAOccurrences).toBeDefined();
    });

    it('includes all nesting edge types', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const func = createNode('func-1', 'FUNC', 'ChatAPI');
      const req = createNode('req-1', 'REQ', 'REQ-001');
      const mod = createNode('mod-1', 'MOD', 'Backend');

      graphState.nodes.set(sys.semanticId, sys);
      graphState.nodes.set(func.semanticId, func);
      graphState.nodes.set(req.semanticId, req);
      graphState.nodes.set(mod.semanticId, mod);

      // Three different nesting edge types
      graphState.edges.set('e1', createEdge('e1', sys.semanticId, func.semanticId, 'compose'));
      graphState.edges.set('e2', createEdge('e2', func.semanticId, req.semanticId, 'satisfy'));
      graphState.edges.set('e3', createEdge('e3', sys.semanticId, mod.semanticId, 'compose'));
      graphState.edges.set('e4', createEdge('e4', mod.semanticId, func.semanticId, 'allocate'));

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      // FUNC should appear twice (via compose and allocate)
      const funcOccurrences = occurrenceMap.byNode.get(func.semanticId)!;
      expect(funcOccurrences).toHaveLength(2);

      // REQ should appear once (via satisfy from FUNC)
      const reqOccurrences = occurrenceMap.byNode.get(req.semanticId)!;
      expect(reqOccurrences).toHaveLength(1);
      expect(reqOccurrences[0].nestingEdgeType).toBe('satisfy');
    });

    it('finds root nodes correctly', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const orphan = createNode('orphan-1', 'MOD', 'OrphanModule');
      const child = createNode('child-1', 'FUNC', 'ChildFunction');

      graphState.nodes.set(sys.semanticId, sys);
      graphState.nodes.set(orphan.semanticId, orphan);
      graphState.nodes.set(child.semanticId, child);

      // Only child has incoming edge
      graphState.edges.set('e1', createEdge('e1', sys.semanticId, child.semanticId, 'compose'));

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      // Both sys and orphan should be roots (depth 0)
      const sysOcc = occurrenceMap.byNode.get(sys.semanticId)![0];
      const orphanOcc = occurrenceMap.byNode.get(orphan.semanticId)![0];

      expect(sysOcc.depth).toBe(0);
      expect(orphanOcc.depth).toBe(0);

      // Child should not be root (depth 1)
      const childOcc = occurrenceMap.byNode.get(child.semanticId)![0];
      expect(childOcc.depth).toBe(1);
    });

    it('only expands children for primary occurrence', () => {
      const sys = createNode('sys-1', 'SYS', 'GraphEngine');
      const modA = createNode('mod-a', 'MOD', 'ModuleA');
      const modB = createNode('mod-b', 'MOD', 'ModuleB');
      const func = createNode('func-1', 'FUNC', 'SharedFunction');
      const child = createNode('child-1', 'FUNC', 'ChildFunction');

      graphState.nodes.set(sys.semanticId, sys);
      graphState.nodes.set(modA.semanticId, modA);
      graphState.nodes.set(modB.semanticId, modB);
      graphState.nodes.set(func.semanticId, func);
      graphState.nodes.set(child.semanticId, child);

      // SharedFunction used in ModuleA and ModuleB
      graphState.edges.set('e1', createEdge('e1', sys.semanticId, modA.semanticId, 'compose'));
      graphState.edges.set('e2', createEdge('e2', sys.semanticId, modB.semanticId, 'compose'));
      graphState.edges.set('e3', createEdge('e3', modA.semanticId, func.semanticId, 'allocate'));
      graphState.edges.set('e4', createEdge('e4', modB.semanticId, func.semanticId, 'allocate'));

      // ChildFunction nested under SharedFunction
      graphState.edges.set('e5', createEdge('e5', func.semanticId, child.semanticId, 'compose'));

      const viewFilter = new ViewFilter(DEFAULT_VIEW_CONFIGS.spec);
      const occurrenceMap = viewFilter.buildMultiOccurrenceTree(graphState);

      // SharedFunction should appear twice
      const funcOccurrences = occurrenceMap.byNode.get(func.semanticId)!;
      expect(funcOccurrences).toHaveLength(2);

      // ChildFunction should appear only once (under primary occurrence of SharedFunction)
      const childOccurrences = occurrenceMap.byNode.get(child.semanticId)!;
      expect(childOccurrences).toHaveLength(1);
    });
  });
});

// Helper functions

function createNode(id: string, type: string, name: string): Node {
  return {
    uuid: id,
    semanticId: id,
    type: type as any,
    name: name,
    workspaceId: 'test-workspace',
    systemId: 'test-system',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test',
  };
}

function createEdge(
  id: string,
  sourceId: string,
  targetId: string,
  type: string
): Edge {
  return {
    uuid: id,
    semanticId: id,
    sourceId,
    targetId,
    type: type as any,
    workspaceId: 'test-workspace',
    systemId: 'test-system',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test',
  };
}
