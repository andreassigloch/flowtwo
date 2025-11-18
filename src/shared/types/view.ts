/**
 * View Configuration Types
 *
 * Defines view filters, layout configs, and render configs for the 5 views
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { NodeType, EdgeType } from './ontology.js';

/**
 * View Type Enum
 */
export type ViewType =
  | 'hierarchy'
  | 'functional-flow'
  | 'requirements'
  | 'allocation'
  | 'use-case';

/**
 * Layout Algorithm Type
 */
export type LayoutAlgorithm =
  | 'reingold-tilford' // Tree layout (hierarchy)
  | 'sugiyama' // Layered graph (functional flow)
  | 'orthogonal' // Orthogonal routing
  | 'treemap' // Nested boxes
  | 'radial'; // Radial tree

/**
 * Layout Configuration
 *
 * Defines which nodes/edges to include in layout computation
 * (may differ from render config)
 */
export interface LayoutConfig {
  /** Node types to include in layout */
  includeNodeTypes: NodeType[];

  /** Edge types to include in layout */
  includeEdgeTypes: EdgeType[];

  /** Layout algorithm to use */
  algorithm: LayoutAlgorithm;

  /** Algorithm-specific parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Render Configuration
 *
 * Defines which nodes/edges to actually display
 * (subset of layout nodes)
 */
export interface RenderConfig {
  /** Node types to show */
  showNodes: NodeType[];

  /** Node types to hide (takes precedence) */
  hideNodes?: NodeType[];

  /** Edge types to show */
  showEdges: EdgeType[];

  /** Edge types to hide (takes precedence) */
  hideEdges?: EdgeType[];
}

/**
 * View Configuration
 *
 * Complete configuration for a view
 */
export interface ViewConfig {
  /** View identifier */
  viewId: ViewType;

  /** Human-readable name */
  name: string;

  /** Description */
  description: string;

  /** Layout configuration */
  layoutConfig: LayoutConfig;

  /** Render configuration */
  renderConfig: RenderConfig;
}

/**
 * Filtered Graph
 *
 * Result of applying view filter to graph state
 */
export interface FilteredGraph {
  /** Filtered nodes */
  nodes: Map<string, unknown>;

  /** Filtered edges */
  edges: Map<string, unknown>;

  /** View context */
  viewType: ViewType;
}

/**
 * Default View Configurations
 */
export const DEFAULT_VIEW_CONFIGS: Record<ViewType, ViewConfig> = {
  /**
   * Hierarchy View
   *
   * IMPORTANT: Nesting/indentation is ONLY created by 'compose' edges (per Ontology V3).
   * - compose edges: SYS→SYS, SYS→UC, UC→FCHAIN, FCHAIN→FUNC, MOD→FUNC
   * - Other edge types (io, satisfy, verify, allocate) do NOT create hierarchy
   *
   * Layout algorithm: reingold-tilford (tree layout)
   * - Only 'compose' edges define parent-child relationships
   * - Nodes without incoming 'compose' edges are roots
   * - Nested rendering: children indented under parents
   */
  hierarchy: {
    viewId: 'hierarchy',
    name: 'Hierarchy View',
    description: 'System decomposition tree (SYS → UC → FCHAIN → FUNC)',
    layoutConfig: {
      includeNodeTypes: ['SYS', 'UC', 'FCHAIN', 'FUNC', 'MOD'],
      includeEdgeTypes: ['compose'], // ONLY compose creates hierarchy
      algorithm: 'reingold-tilford',
      parameters: {
        orientation: 'top-down',
        nodeSpacing: 50,
        levelSpacing: 100,
        nestingEdgeType: 'compose', // Explicit: only this edge type creates nesting
      },
    },
    renderConfig: {
      showNodes: ['SYS', 'UC', 'FCHAIN', 'FUNC', 'MOD'],
      showEdges: [], // Implicit via nesting (compose edges hidden, shown as indentation)
    },
  },

  'functional-flow': {
    viewId: 'functional-flow',
    name: 'Functional Flow View',
    description: 'Data flow between functions (FUNC ←→ FLOW)',
    layoutConfig: {
      includeNodeTypes: ['FUNC', 'FLOW'], // FLOW needed for port extraction
      includeEdgeTypes: ['io'],
      algorithm: 'sugiyama',
      parameters: {
        orientation: 'left-right',
        layerSpacing: 100,
      },
    },
    renderConfig: {
      showNodes: ['FUNC'], // FLOW hidden, converted to ports
      hideNodes: ['FLOW'],
      showEdges: ['io'],
    },
  },

  requirements: {
    viewId: 'requirements',
    name: 'Requirements View',
    description: 'Requirements traceability (FUNC → satisfy → REQ ← verify ← TEST)',
    layoutConfig: {
      includeNodeTypes: ['FUNC', 'REQ', 'TEST'],
      includeEdgeTypes: ['satisfy', 'verify'],
      algorithm: 'sugiyama',
      parameters: {
        orientation: 'left-right',
      },
    },
    renderConfig: {
      showNodes: ['FUNC', 'REQ', 'TEST'],
      showEdges: ['satisfy', 'verify'],
    },
  },

  allocation: {
    viewId: 'allocation',
    name: 'Allocation View',
    description: 'Function allocation to modules (FUNC → allocate → MOD)',
    layoutConfig: {
      includeNodeTypes: ['FUNC', 'MOD'],
      includeEdgeTypes: ['allocate'],
      algorithm: 'treemap',
      parameters: {
        groupBy: 'MOD',
      },
    },
    renderConfig: {
      showNodes: ['FUNC', 'MOD'],
      showEdges: ['allocate'],
    },
  },

  'use-case': {
    viewId: 'use-case',
    name: 'Use Case Diagram',
    description: 'Actors interacting with use cases',
    layoutConfig: {
      includeNodeTypes: ['ACTOR', 'UC', 'SYS'],
      includeEdgeTypes: ['compose', 'io'],
      algorithm: 'radial',
      parameters: {
        centerNode: 'SYS',
      },
    },
    renderConfig: {
      showNodes: ['ACTOR', 'UC', 'SYS'],
      showEdges: ['io'],
    },
  },
};
