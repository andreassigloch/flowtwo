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
  | 'functional-network'
  | 'requirements'
  | 'allocation'
  | 'use-case'
  | 'spec'
  | 'spec+'
  | 'architecture'
  | 'fchain'
  | 'fchain+';

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
   * - compose edges: SYS→SYS, SYS→UC, SYS→FUNC, UC→FCHAIN, FCHAIN→FUNC, FUNC→FUNC, SYS→MOD
   * - DEFAULT to FUNC→FUNC for logical decomposition (SYS→SYS only for external/purchased)
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
    description: 'System decomposition tree (SYS → UC → FCHAIN → FUNC/ACTOR)',
    layoutConfig: {
      includeNodeTypes: ['SYS', 'UC', 'FCHAIN', 'FUNC', 'MOD', 'ACTOR'],
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
      showNodes: ['SYS', 'UC', 'FCHAIN', 'FUNC', 'MOD', 'ACTOR'],
      showEdges: [], // Implicit via nesting (compose edges hidden, shown as indentation)
    },
  },

  /**
   * Functional Network View
   *
   * Circuit diagram showing all FUNC and ACTOR nodes connected via FLOW nodes.
   * FLOW nodes are rendered as edge labels, not separate nodes.
   * Layout: left-to-right with input actors on left, output actors on right.
   * Connections traced via: Source -io-> FLOW -io-> Target
   */
  'functional-network': {
    viewId: 'functional-network',
    name: 'Functional Network View',
    description: 'Circuit diagram of functions and actors connected via data flows',
    layoutConfig: {
      includeNodeTypes: ['FUNC', 'ACTOR', 'FLOW'],
      includeEdgeTypes: ['io'],
      algorithm: 'sugiyama',
      parameters: {
        orientation: 'left-right',
        layerSpacing: 150,
        nodeSpacing: 80,
        groupActors: true,
        showFlowLabels: true,
      },
    },
    renderConfig: {
      showNodes: ['FUNC', 'ACTOR'],
      hideNodes: ['FLOW'], // FLOW becomes edge labels
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

  /**
   * Use-Case View
   *
   * Shows use case in context:
   * - Center: UC (use case)
   * - Parent: Parent UC or SYS (via incoming compose edge)
   * - Children: Actors (via outgoing compose edges)
   * - Related: Requirements (via satisfy edges)
   */
  'use-case': {
    viewId: 'use-case',
    name: 'Use Case Diagram',
    description: 'Use case with parent, actors, and requirements',
    layoutConfig: {
      includeNodeTypes: ['ACTOR', 'UC', 'SYS', 'REQ'],
      includeEdgeTypes: ['compose', 'satisfy'],
      algorithm: 'radial',
      parameters: {
        centerNode: 'UC',
      },
    },
    renderConfig: {
      showNodes: ['ACTOR', 'UC', 'SYS', 'REQ'],
      showEdges: ['compose', 'satisfy'],
    },
  },

  /**
   * Spec View
   *
   * Complete system specification listing with all element types.
   * Elements appear multiple times when used in different contexts:
   * - First occurrence = primary (fully expanded)
   * - Subsequent occurrences = references with links to primary
   *
   * Uses all nesting edge types (compose, satisfy, allocate)
   * to show complete element usage across different hierarchies.
   */
  spec: {
    viewId: 'spec',
    name: 'Specification View',
    description: 'Complete system specification with hierarchical listing',
    layoutConfig: {
      includeNodeTypes: [
        'SYS',
        'UC',
        'FCHAIN',
        'FUNC',
        'MOD',
        'ACTOR',
        'REQ',
        'TEST',
        'SCHEMA',
        'FLOW',
      ],
      includeEdgeTypes: ['compose', 'satisfy', 'allocate'],
      algorithm: 'reingold-tilford',
      parameters: {
        orientation: 'top-down',
        nodeSpacing: 50,
        levelSpacing: 100,
        nestingEdgeTypes: ['compose', 'satisfy', 'allocate'],
        allowMultipleOccurrences: true,
        maxDepth: null, // Unlimited by default
      },
    },
    renderConfig: {
      showNodes: [
        'SYS',
        'UC',
        'FCHAIN',
        'FUNC',
        'MOD',
        'ACTOR',
        'REQ',
        'TEST',
        'SCHEMA',
        'FLOW',
      ],
      showEdges: [], // All nesting edges implicit via containment
    },
  },

  /**
   * Spec+ View (Enhanced Specification)
   *
   * Same as spec view but with descriptions shown as indented text
   * underneath each element. Useful for documentation and review.
   */
  'spec+': {
    viewId: 'spec+',
    name: 'Specification+ View',
    description: 'Complete specification with inline descriptions',
    layoutConfig: {
      includeNodeTypes: [
        'SYS',
        'UC',
        'FCHAIN',
        'FUNC',
        'MOD',
        'ACTOR',
        'REQ',
        'TEST',
        'SCHEMA',
        'FLOW',
      ],
      includeEdgeTypes: ['compose', 'satisfy', 'allocate'],
      algorithm: 'reingold-tilford',
      parameters: {
        orientation: 'top-down',
        nodeSpacing: 50,
        levelSpacing: 100,
        nestingEdgeTypes: ['compose', 'satisfy', 'allocate'],
        allowMultipleOccurrences: true,
        maxDepth: null,
        showDescriptions: true,
      },
    },
    renderConfig: {
      showNodes: [
        'SYS',
        'UC',
        'FCHAIN',
        'FUNC',
        'MOD',
        'ACTOR',
        'REQ',
        'TEST',
        'SCHEMA',
        'FLOW',
      ],
      showEdges: [],
    },
  },

  /**
   * Architecture View
   *
   * First-level logical architecture showing major function blocks.
   * Displays SYS and MOD nodes as boxes with their responsibilities.
   * Shows only top-level components (depth 1) to provide high-level overview.
   *
   * Uses compose edges to determine containment hierarchy but renders
   * only the first level of children within each major block.
   */
  architecture: {
    viewId: 'architecture',
    name: 'Logical Architecture View',
    description: 'First-level logical function blocks and their relationships',
    layoutConfig: {
      includeNodeTypes: ['SYS', 'MOD', 'UC', 'FCHAIN', 'FUNC'],
      includeEdgeTypes: ['compose', 'io'],
      algorithm: 'treemap',
      parameters: {
        orientation: 'top-down',
        nodeSpacing: 20,
        levelSpacing: 40,
        nestingEdgeTypes: ['compose'],
        maxDepth: 2, // Show only 2 levels: system + major blocks
      },
    },
    renderConfig: {
      showNodes: ['SYS', 'MOD', 'UC', 'FCHAIN', 'FUNC'],
      showEdges: ['io'], // Show data flow connections between blocks
    },
  },

  /**
   * Function Chain View (fchain)
   *
   * Activity diagram showing FCHAIN sequences with functions, actors, and data flows.
   * Visualizes use case implementation as ordered function execution with
   * external actor interactions via io-flow-io connections.
   *
   * Layout: top-to-bottom with swimlanes for actors.
   * FLOW nodes rendered as labeled edges, not separate nodes.
   * Functions sorted by topological order based on io edges.
   */
  fchain: {
    viewId: 'fchain',
    name: 'Function Chain View',
    description: 'Activity diagram with functions, actors, and data flows',
    layoutConfig: {
      includeNodeTypes: ['FCHAIN', 'FUNC', 'FLOW', 'ACTOR'],
      includeEdgeTypes: ['compose', 'io'],
      algorithm: 'sugiyama',
      parameters: {
        orientation: 'top-down',
        nodeSpacing: 100,
        levelSpacing: 80,
        nestingEdgeTypes: ['compose'],
        showSequenceNumbers: true,
        swimlaneGroupBy: 'ACTOR',
      },
    },
    renderConfig: {
      showNodes: ['FCHAIN', 'FUNC', 'ACTOR'],
      hideNodes: ['FLOW'], // FLOW becomes edge labels
      showEdges: ['io'],
    },
  },

  /**
   * Function Chain+ View (detailed)
   *
   * Same as fchain but with [A]/[F] tags, flow labels (italic),
   * and descriptions. Graph flows top-down with vertical flow labels.
   */
  'fchain+': {
    viewId: 'fchain+',
    name: 'Function Chain+ View',
    description: 'Detailed activity diagram with flow labels and descriptions',
    layoutConfig: {
      includeNodeTypes: ['FCHAIN', 'FUNC', 'FLOW', 'ACTOR'],
      includeEdgeTypes: ['compose', 'io'],
      algorithm: 'sugiyama',
      parameters: {
        orientation: 'top-down',
        nodeSpacing: 100,
        levelSpacing: 80,
        nestingEdgeTypes: ['compose'],
        showSequenceNumbers: true,
        showFlowLabels: true,
        showDescriptions: true,
      },
    },
    renderConfig: {
      showNodes: ['FCHAIN', 'FUNC', 'ACTOR'],
      hideNodes: ['FLOW'], // FLOW becomes edge labels
      showEdges: ['io'],
    },
  },
};
