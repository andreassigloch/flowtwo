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
}
