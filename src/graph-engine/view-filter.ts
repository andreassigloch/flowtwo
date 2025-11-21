/**
 * View Filter
 *
 * Filters graph state based on view configuration
 * Separates layout filtering (for computation) from render filtering (for display)
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { ViewConfig, FilteredGraph } from '../shared/types/view.js';
import { GraphState, Node, Edge, NodeType, EdgeType } from '../shared/types/ontology.js';

/**
 * Occurrence of a node in the spec view
 */
export interface Occurrence {
  nodeId: string;
  path: string; // Hierarchical path from root (e.g., "GraphEngine/Backend/Neo4jService")
  isPrimary: boolean;
  depth: number;
  parentPath: string | null;
  nestingEdgeType: EdgeType | null; // Which nesting edge connects to parent
}

/**
 * Map of all occurrences in spec view
 */
export interface OccurrenceMap {
  byNode: Map<string, Occurrence[]>; // nodeId → all occurrences
  byPath: Map<string, Occurrence>; // path → occurrence
}

/**
 * View Filter
 *
 * Applies view-specific filters to graph state:
 * 1. Layout Filter: Which nodes/edges to include in layout computation
 * 2. Render Filter: Which nodes/edges to actually display
 *
 * Key Insight: Layout and render filters may differ
 * Example: FLOW nodes needed for port extraction (layout) but hidden (render)
 *
 * TEST: tests/unit/graph-engine/view-filter.test.ts
 */
export class ViewFilter {
  constructor(private viewConfig: ViewConfig) {}

  /**
   * Apply layout filter
   *
   * Returns nodes/edges to include in layout computation
   * May include hidden nodes needed for layout (e.g., FLOW for ports)
   */
  applyLayoutFilter(graph: GraphState): FilteredGraph {
    const { includeNodeTypes, includeEdgeTypes } = this.viewConfig.layoutConfig;

    // Filter nodes by type
    const filteredNodes = new Map<string, Node>();
    for (const [id, node] of graph.nodes) {
      if (includeNodeTypes.includes(node.type)) {
        filteredNodes.set(id, node);
      }
    }

    // Filter edges by type AND validate source/target exist
    const filteredEdges = new Map<string, Edge>();
    for (const [id, edge] of graph.edges) {
      if (
        includeEdgeTypes.includes(edge.type) &&
        filteredNodes.has(edge.sourceId) &&
        filteredNodes.has(edge.targetId)
      ) {
        filteredEdges.set(id, edge);
      }
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      viewType: this.viewConfig.viewId,
    };
  }

  /**
   * Apply render filter
   *
   * Returns nodes/edges to actually display
   * Hides nodes that were needed for layout but shouldn't be rendered
   */
  applyRenderFilter(layoutGraph: FilteredGraph): FilteredGraph {
    const { showNodes, hideNodes = [], showEdges, hideEdges = [] } =
      this.viewConfig.renderConfig;

    // Filter nodes: show AND not hidden
    const filteredNodes = new Map<string, Node>();
    for (const [id, node] of layoutGraph.nodes) {
      if (typeof node === 'object' && node !== null && 'type' in node) {
        const shouldShow = showNodes.includes(node.type as NodeType);
        const shouldHide = hideNodes.includes(node.type as NodeType);

        if (shouldShow && !shouldHide) {
          filteredNodes.set(id, node as Node);
        }
      }
    }

    // Filter edges: show AND not hidden AND source/target exist
    const filteredEdges = new Map<string, Edge>();
    for (const [id, edge] of layoutGraph.edges) {
      if (typeof edge === 'object' && edge !== null && 'type' in edge && 'sourceId' in edge && 'targetId' in edge) {
        const shouldShow = showEdges.includes(edge.type as EdgeType);
        const shouldHide = hideEdges.includes(edge.type as EdgeType);
        const sourceExists = filteredNodes.has(edge.sourceId as string);
        const targetExists = filteredNodes.has(edge.targetId as string);

        if (shouldShow && !shouldHide && sourceExists && targetExists) {
          filteredEdges.set(id, edge as Edge);
        }
      }
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      viewType: layoutGraph.viewType,
    };
  }

  /**
   * Get view configuration
   */
  getViewConfig(): ViewConfig {
    return this.viewConfig;
  }

  /**
   * Build multi-occurrence tree for spec view
   *
   * Traverses graph breadth-first following all nesting edge types.
   * First occurrence of each node = primary (fully expanded)
   * Subsequent occurrences = references (link to primary)
   *
   * @param graph - Graph state to traverse
   * @returns Occurrence map with all node occurrences
   */
  buildMultiOccurrenceTree(graph: GraphState): OccurrenceMap {
    const layoutConfig = this.viewConfig.layoutConfig;
    const params = layoutConfig.parameters || {};
    const nestingEdgeTypes = (params.nestingEdgeTypes as EdgeType[]) || ['compose'];
    const maxDepth = (params.maxDepth as number | null) ?? null;

    const occurrenceMap: OccurrenceMap = {
      byNode: new Map(),
      byPath: new Map(),
    };

    // Find root nodes (no incoming nesting edges)
    const roots = this.findRootNodes(graph, nestingEdgeTypes);

    // BFS queue
    interface QueueItem {
      nodeId: string;
      path: string;
      depth: number;
      parentPath: string | null;
      edgeType: EdgeType | null;
    }

    const queue: QueueItem[] = roots.map((node) => ({
      nodeId: node.semanticId,
      path: node.name,
      depth: 0,
      parentPath: null,
      edgeType: null,
    }));

    // Track visited paths to prevent infinite loops
    const visitedPaths = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Check depth limit
      if (maxDepth !== null && current.depth > maxDepth) {
        continue;
      }

      // Prevent infinite loops (circular dependencies)
      if (visitedPaths.has(current.path)) {
        continue;
      }
      visitedPaths.add(current.path);

      // Record occurrence
      if (!occurrenceMap.byNode.has(current.nodeId)) {
        occurrenceMap.byNode.set(current.nodeId, []);
      }

      const occurrences = occurrenceMap.byNode.get(current.nodeId)!;
      const isPrimary = occurrences.length === 0;

      const occurrence: Occurrence = {
        nodeId: current.nodeId,
        path: current.path,
        isPrimary,
        depth: current.depth,
        parentPath: current.parentPath,
        nestingEdgeType: current.edgeType,
      };

      occurrences.push(occurrence);
      occurrenceMap.byPath.set(current.path, occurrence);

      // Only expand children for primary occurrence
      if (!isPrimary) {
        continue;
      }

      // Find children via all nesting edge types
      for (const edgeType of nestingEdgeTypes) {
        const children = this.getChildrenViaEdgeType(graph, current.nodeId, edgeType);

        for (const child of children) {
          const childPath = `${current.path}/${child.name}`;

          queue.push({
            nodeId: child.semanticId,
            path: childPath,
            depth: current.depth + 1,
            parentPath: current.path,
            edgeType,
          });
        }
      }
    }

    return occurrenceMap;
  }

  /**
   * Find root nodes (no incoming nesting edges)
   */
  private findRootNodes(graph: GraphState, nestingEdgeTypes: EdgeType[]): Node[] {
    const nodesWithIncomingNesting = new Set<string>();

    // Find all nodes that have incoming nesting edges
    for (const edge of graph.edges.values()) {
      if (nestingEdgeTypes.includes(edge.type)) {
        nodesWithIncomingNesting.add(edge.targetId);
      }
    }

    // Root nodes = nodes without incoming nesting edges
    const roots: Node[] = [];
    for (const node of graph.nodes.values()) {
      if (!nodesWithIncomingNesting.has(node.semanticId)) {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Get children of a node via specific edge type
   */
  private getChildrenViaEdgeType(
    graph: GraphState,
    nodeId: string,
    edgeType: EdgeType
  ): Node[] {
    const children: Node[] = [];

    for (const edge of graph.edges.values()) {
      if (edge.sourceId === nodeId && edge.type === edgeType) {
        const childNode = graph.nodes.get(edge.targetId);
        if (childNode) {
          children.push(childNode);
        }
      }
    }

    return children;
  }
}
