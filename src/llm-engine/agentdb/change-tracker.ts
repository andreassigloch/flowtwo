/**
 * Change Tracker - Git-like diff tracking for graph changes
 *
 * Tracks changes between current state and baseline (last commit):
 * - Added: element exists in current but not baseline
 * - Modified: element exists in both but has different content
 * - Deleted: element exists in baseline but not current
 *
 * Part of CR-033: Git-like Diff/Change Tracking
 *
 * @author andreas@siglochconsulting
 */

import type { Node, Edge, SemanticId, GraphState } from '../../shared/types/ontology.js';

/**
 * Change status for an element
 */
export type ChangeStatus = 'unchanged' | 'added' | 'modified' | 'deleted';

/**
 * Tracked change with element info
 */
export interface TrackedChange {
  status: ChangeStatus;
  elementType: 'node' | 'edge';
  id: string; // semanticId for nodes, uuid for edges
  current?: Node | Edge;
  baseline?: Node | Edge;
}

/**
 * Summary of pending changes
 */
export interface ChangeSummary {
  added: number;
  modified: number;
  deleted: number;
  total: number;
}

/**
 * Baseline snapshot (deep copy of graph at last commit)
 */
interface BaselineSnapshot {
  nodes: Map<SemanticId, Node>;
  edges: Map<string, Edge>; // key: uuid
  version: number;
  capturedAt: Date;
}

/**
 * Change Tracker - compares current graph state against baseline
 */
export class ChangeTracker {
  private baseline: BaselineSnapshot | null = null;

  /**
   * Capture baseline from current graph state
   * Called on: session load, /commit
   */
  captureBaseline(state: GraphState): void {
    this.baseline = {
      nodes: this.deepCopyNodes(state.nodes),
      edges: this.deepCopyEdges(state.edges),
      version: state.version ?? 0,
      capturedAt: new Date(),
    };
  }

  /**
   * Clear baseline (e.g., on session end)
   */
  clearBaseline(): void {
    this.baseline = null;
  }

  /**
   * Check if baseline exists
   */
  hasBaseline(): boolean {
    return this.baseline !== null;
  }

  /**
   * Get baseline capture time
   */
  getBaselineTime(): Date | null {
    return this.baseline?.capturedAt ?? null;
  }

  /**
   * Get baseline state for restore operation (CR-044)
   * Returns deep copy of baseline nodes and edges
   */
  getBaselineState(): { nodes: Node[]; edges: Edge[] } | null {
    if (!this.baseline) {
      return null;
    }

    return {
      nodes: Array.from(this.baseline.nodes.values()).map((n) => ({
        ...n,
        attributes: n.attributes ? JSON.parse(JSON.stringify(n.attributes)) : undefined,
      })),
      edges: Array.from(this.baseline.edges.values()).map((e) => ({ ...e })),
    };
  }

  /**
   * Get change status for a node
   */
  getNodeStatus(semanticId: SemanticId, currentNode: Node | null): ChangeStatus {
    if (!this.baseline) {
      // No baseline = everything is "unchanged" (first run)
      return 'unchanged';
    }

    const baselineNode = this.baseline.nodes.get(semanticId);

    if (!baselineNode && currentNode) {
      return 'added';
    }

    if (baselineNode && !currentNode) {
      return 'deleted';
    }

    if (baselineNode && currentNode) {
      if (this.nodeChanged(baselineNode, currentNode)) {
        return 'modified';
      }
    }

    return 'unchanged';
  }

  /**
   * Get change status for an edge
   */
  getEdgeStatus(uuid: string, currentEdge: Edge | null): ChangeStatus {
    if (!this.baseline) {
      return 'unchanged';
    }

    const baselineEdge = this.baseline.edges.get(uuid);

    if (!baselineEdge && currentEdge) {
      return 'added';
    }

    if (baselineEdge && !currentEdge) {
      return 'deleted';
    }

    if (baselineEdge && currentEdge) {
      if (this.edgeChanged(baselineEdge, currentEdge)) {
        return 'modified';
      }
    }

    return 'unchanged';
  }

  /**
   * Get all changes between current state and baseline
   */
  getChanges(currentState: GraphState): TrackedChange[] {
    if (!this.baseline) {
      return [];
    }

    const changes: TrackedChange[] = [];

    // Check current nodes against baseline
    for (const [semanticId, node] of currentState.nodes) {
      const status = this.getNodeStatus(semanticId, node);
      if (status !== 'unchanged') {
        changes.push({
          status,
          elementType: 'node',
          id: semanticId,
          current: node,
          baseline: this.baseline.nodes.get(semanticId),
        });
      }
    }

    // Check for deleted nodes (in baseline but not current)
    for (const [semanticId, node] of this.baseline.nodes) {
      if (!currentState.nodes.has(semanticId)) {
        changes.push({
          status: 'deleted',
          elementType: 'node',
          id: semanticId,
          baseline: node,
        });
      }
    }

    // Check current edges against baseline
    for (const [uuid, edge] of currentState.edges) {
      const status = this.getEdgeStatus(uuid, edge);
      if (status !== 'unchanged') {
        changes.push({
          status,
          elementType: 'edge',
          id: uuid,
          current: edge,
          baseline: this.baseline.edges.get(uuid),
        });
      }
    }

    // Check for deleted edges (in baseline but not current)
    for (const [uuid, edge] of this.baseline.edges) {
      if (!currentState.edges.has(uuid)) {
        changes.push({
          status: 'deleted',
          elementType: 'edge',
          id: uuid,
          baseline: edge,
        });
      }
    }

    return changes;
  }

  /**
   * Get change summary
   */
  getSummary(currentState: GraphState): ChangeSummary {
    const changes = this.getChanges(currentState);

    return {
      added: changes.filter((c) => c.status === 'added').length,
      modified: changes.filter((c) => c.status === 'modified').length,
      deleted: changes.filter((c) => c.status === 'deleted').length,
      total: changes.length,
    };
  }

  /**
   * Check if there are any pending changes
   */
  hasChanges(currentState: GraphState): boolean {
    if (!this.baseline) {
      return false;
    }

    // Quick size check first
    if (currentState.nodes.size !== this.baseline.nodes.size) {
      return true;
    }
    if (currentState.edges.size !== this.baseline.edges.size) {
      return true;
    }

    // Check for any node changes
    for (const [semanticId, node] of currentState.nodes) {
      const baselineNode = this.baseline.nodes.get(semanticId);
      if (!baselineNode || this.nodeChanged(baselineNode, node)) {
        return true;
      }
    }

    // Check for any edge changes
    for (const [uuid, edge] of currentState.edges) {
      const baselineEdge = this.baseline.edges.get(uuid);
      if (!baselineEdge || this.edgeChanged(baselineEdge, edge)) {
        return true;
      }
    }

    return false;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Check if a node has changed (comparing relevant fields)
   */
  private nodeChanged(baseline: Node, current: Node): boolean {
    // Compare key fields that constitute a meaningful change
    return (
      baseline.name !== current.name ||
      baseline.descr !== current.descr ||
      baseline.type !== current.type ||
      JSON.stringify(baseline.attributes) !== JSON.stringify(current.attributes)
    );
  }

  /**
   * Check if an edge has changed
   */
  private edgeChanged(baseline: Edge, current: Edge): boolean {
    return (
      baseline.sourceId !== current.sourceId ||
      baseline.targetId !== current.targetId ||
      baseline.type !== current.type ||
      baseline.label !== current.label
    );
  }

  /**
   * Deep copy nodes map
   */
  private deepCopyNodes(nodes: Map<SemanticId, Node>): Map<SemanticId, Node> {
    const copy = new Map<SemanticId, Node>();
    for (const [key, node] of nodes) {
      copy.set(key, {
        ...node,
        attributes: node.attributes ? JSON.parse(JSON.stringify(node.attributes)) : undefined,
      });
    }
    return copy;
  }

  /**
   * Deep copy edges map
   */
  private deepCopyEdges(edges: Map<string, Edge>): Map<string, Edge> {
    const copy = new Map<string, Edge>();
    for (const [key, edge] of edges) {
      copy.set(key, { ...edge });
    }
    return copy;
  }
}
