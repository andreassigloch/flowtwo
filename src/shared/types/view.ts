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
   * IMPORTANT: Nesting/indentation created by 'compose' edges ONLY in this view.
   * - compose edges: SYS→SYS, SYS→UC, UC→FCHAIN, FCHAIN→FUNC, SYS→MOD
   * - Per ontology_schema.json: compose, satisfy, allocate are ALL nesting edges
   * - But hierarchy view uses ONLY compose for structural decomposition
   *
   * Layout algorithm: reingold-tilford (tree layout)
   * - Only 'compose' edges define parent-child relationships in this view
   * - Nodes without incoming 'compose' edges are roots
   * - Nested rendering: children indented under parents
   */
  hierarchy: {
    viewId: 'hierarchy',
    name: 'Hierarchy View',
    description: 'System decomposition tree (SYS → UC → FCHAIN → FUNC)',
    layoutConfig: {
      includeNodeTypes: ['SYS', 'UC', 'FCHAIN', 'FUNC', 'MOD'],
      includeEdgeTypes: ['compose'], // ONLY compose for structural hierarchy
      algorithm: 'reingold-tilford',
      parameters: {
        orientation: 'top-down',
        nodeSpacing: 50,
        levelSpacing: 100,
        nestingEdgeTypes: ['compose'], // Array: which nesting edges to use in this view
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

  /**
   * Requirements View
   *
   * Uses 'satisfy' nesting edges to show requirement hierarchy.
   * - satisfy is a nesting edge (per ontology_schema.json)
   * - Creates tree: SYS→REQ, REQ→REQ, UC→REQ, FUNC→REQ
   * - verify edges shown as explicit connections
   */
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
        nestingEdgeTypes: ['satisfy'], // satisfy creates requirement hierarchy
      },
    },
    renderConfig: {
      showNodes: ['FUNC', 'REQ', 'TEST'],
      showEdges: ['verify'], // Show verify as arrows, satisfy as nesting
    },
  },

  /**
   * Allocation View
   *
   * Uses 'allocate' nesting edges to show module-function containment.
   * - allocate is a nesting edge (per ontology_schema.json)
   * - Creates tree: MOD→FUNC (modules contain functions)
   * - Treemap layout: functions nested within module boxes
   */
  allocation: {
    viewId: 'allocation',
    name: 'Allocation View',
    description: 'Function allocation to modules (MOD contains FUNC)',
    layoutConfig: {
      includeNodeTypes: ['FUNC', 'MOD'],
      includeEdgeTypes: ['allocate'],
      algorithm: 'treemap',
      parameters: {
        groupBy: 'MOD',
        nestingEdgeTypes: ['allocate'], // allocate creates containment
      },
    },
    renderConfig: {
      showNodes: ['FUNC', 'MOD'],
      showEdges: [], // Implicit via nesting (allocate shown as containment)
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
