/**
 * Unit tests for ChangeTracker (CR-033)
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeTracker } from '../../../src/llm-engine/agentdb/change-tracker.js';
import type { GraphState } from '../../../src/llm-engine/agentdb/types.js';
import type { Node, Edge } from '../../../src/shared/types/format-e.js';

describe('unit: ChangeTracker', () => {
  let tracker: ChangeTracker;

  const createNode = (semanticId: string, name: string, type = 'FUNC'): Node => ({
    semanticId,
    name,
    type,
  });

  const createEdge = (uuid: string, sourceId: string, targetId: string, type = 'compose'): Edge => ({
    uuid,
    sourceId,
    targetId,
    type,
  });

  const createState = (nodes: Node[], edges: Edge[]): GraphState => ({
    nodes: new Map(nodes.map(n => [n.semanticId, n])),
    edges: new Map(edges.map(e => [e.uuid, e])),
  });

  beforeEach(() => {
    tracker = new ChangeTracker();
  });

  describe('baseline management', () => {
    it('should start without baseline', () => {
      expect(tracker.hasBaseline()).toBe(false);
    });

    it('should capture baseline snapshot', () => {
      const state = createState(
        [createNode('func1', 'Function 1')],
        [createEdge('edge1', 'sys', 'func1')]
      );

      tracker.captureBaseline(state);

      expect(tracker.hasBaseline()).toBe(true);
    });

    it('should report no changes after capture', () => {
      const state = createState(
        [createNode('func1', 'Function 1')],
        []
      );

      tracker.captureBaseline(state);
      const summary = tracker.getSummary(state);

      expect(summary.total).toBe(0);
      expect(summary.added).toBe(0);
      expect(summary.modified).toBe(0);
      expect(summary.deleted).toBe(0);
    });
  });

  describe('node change detection', () => {
    it('should detect added nodes', () => {
      const baseline = createState([createNode('func1', 'Function 1')], []);
      tracker.captureBaseline(baseline);

      const current = createState(
        [createNode('func1', 'Function 1'), createNode('func2', 'Function 2')],
        []
      );

      expect(tracker.getNodeStatus('func2', current.nodes.get('func2')!)).toBe('added');
      expect(tracker.getSummary(current).added).toBe(1);
    });

    it('should detect deleted nodes', () => {
      const baseline = createState(
        [createNode('func1', 'Function 1'), createNode('func2', 'Function 2')],
        []
      );
      tracker.captureBaseline(baseline);

      const current = createState([createNode('func1', 'Function 1')], []);

      const summary = tracker.getSummary(current);
      expect(summary.deleted).toBe(1);
    });

    it('should detect modified nodes', () => {
      const baseline = createState(
        [createNode('func1', 'Function 1')],
        []
      );
      tracker.captureBaseline(baseline);

      const modifiedNode = createNode('func1', 'Function 1 Updated');
      const current = createState([modifiedNode], []);

      expect(tracker.getNodeStatus('func1', modifiedNode)).toBe('modified');
      expect(tracker.getSummary(current).modified).toBe(1);
    });

    it('should detect unchanged nodes', () => {
      const node = createNode('func1', 'Function 1');
      const baseline = createState([node], []);
      tracker.captureBaseline(baseline);

      const _current = createState([node], []);

      expect(tracker.getNodeStatus('func1', node)).toBe('unchanged');
    });
  });

  describe('edge change detection', () => {
    it('should detect added edges', () => {
      const baseline = createState([], []);
      tracker.captureBaseline(baseline);

      const edge = createEdge('edge1', 'sys', 'func1');
      const _current = createState([], [edge]);

      expect(tracker.getEdgeStatus('edge1', edge)).toBe('added');
    });

    it('should detect deleted edges', () => {
      const baseline = createState([], [createEdge('edge1', 'sys', 'func1')]);
      tracker.captureBaseline(baseline);

      const current = createState([], []);

      const summary = tracker.getSummary(current);
      expect(summary.deleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('change tracking', () => {
    it('should return all changes', () => {
      const baseline = createState(
        [createNode('func1', 'Function 1')],
        []
      );
      tracker.captureBaseline(baseline);

      const current = createState(
        [
          createNode('func1', 'Function 1 Modified'),
          createNode('func2', 'Function 2'),
        ],
        []
      );

      const changes = tracker.getChanges(current);

      expect(changes.length).toBeGreaterThanOrEqual(2);
      expect(changes.some(c => c.status === 'added' && c.id === 'func2')).toBe(true);
      expect(changes.some(c => c.status === 'modified' && c.id === 'func1')).toBe(true);
    });

    it('should indicate when there are no changes', () => {
      const state = createState([createNode('func1', 'Function 1')], []);
      tracker.captureBaseline(state);

      expect(tracker.hasChanges(state)).toBe(false);
    });

    it('should indicate when there are changes', () => {
      const baseline = createState([createNode('func1', 'Function 1')], []);
      tracker.captureBaseline(baseline);

      const current = createState(
        [createNode('func1', 'Function 1'), createNode('func2', 'Function 2')],
        []
      );

      expect(tracker.hasChanges(current)).toBe(true);
    });
  });

  describe('without baseline', () => {
    it('should return unchanged for all nodes', () => {
      const node = createNode('func1', 'Function 1');
      expect(tracker.getNodeStatus('func1', node)).toBe('unchanged');
    });

    it('should return unchanged for all edges', () => {
      const edge = createEdge('edge1', 'sys', 'func1');
      expect(tracker.getEdgeStatus('edge1', edge)).toBe('unchanged');
    });

    it('should report no changes', () => {
      const state = createState([createNode('func1', 'Function 1')], []);
      expect(tracker.hasChanges(state)).toBe(false);
    });
  });

  describe('getBaselineState (CR-044)', () => {
    it('should return null when no baseline', () => {
      expect(tracker.getBaselineState()).toBeNull();
    });

    it('should return deep copy of baseline nodes and edges', () => {
      const node = createNode('func1', 'Function 1');
      const edge = createEdge('edge1', 'sys', 'func1');
      const baseline = createState([node], [edge]);
      tracker.captureBaseline(baseline);

      const result = tracker.getBaselineState();

      expect(result).not.toBeNull();
      expect(result!.nodes.length).toBe(1);
      expect(result!.edges.length).toBe(1);
      expect(result!.nodes[0].semanticId).toBe('func1');
      expect(result!.edges[0].uuid).toBe('edge1');
    });

    it('should return independent copy (mutations do not affect baseline)', () => {
      const node = createNode('func1', 'Function 1');
      const baseline = createState([node], []);
      tracker.captureBaseline(baseline);

      const result1 = tracker.getBaselineState();
      result1!.nodes[0].name = 'MUTATED';

      const result2 = tracker.getBaselineState();
      expect(result2!.nodes[0].name).toBe('Function 1'); // Original preserved
    });

    it('should include node attributes in deep copy', () => {
      const node = createNode('func1', 'Function 1');
      (node as unknown as Record<string, unknown>).attributes = { priority: 'high' };
      const baseline = createState([node], []);
      tracker.captureBaseline(baseline);

      const result = tracker.getBaselineState();

      expect((result!.nodes[0] as unknown as Record<string, unknown>).attributes).toEqual({ priority: 'high' });
    });
  });
});
