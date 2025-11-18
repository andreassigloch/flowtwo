/**
 * Layout Types
 *
 * Types for layout computation (positions, ports, bounds)
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

/**
 * Port Position
 */
export type PortPosition = 'left' | 'right' | 'top' | 'bottom';

/**
 * Port Definition
 *
 * Port extracted from FLOW node
 */
export interface Port {
  /** Port ID (FLOW semantic ID) */
  id: string;

  /** Port label (FLOW name) */
  label: string;

  /** Port position on node */
  position: PortPosition;

  /** Port type (input/output) */
  type: 'input' | 'output';

  /** Optional FLOW properties */
  flowProperties?: {
    dataType?: string;
    pattern?: string;
    validation?: string;
  };
}

/**
 * Node Ports
 *
 * All ports for a specific node
 */
export interface NodePorts {
  /** Node semantic ID */
  nodeId: string;

  /** Input ports (left side) */
  inputs: Port[];

  /** Output ports (right side) */
  outputs: Port[];
}

/**
 * Position
 *
 * X/Y coordinates for node placement
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Bounds
 *
 * Bounding box for layout
 */
export interface Bounds {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Layout Result
 *
 * Complete layout computation result
 */
export interface LayoutResult {
  /** Node positions */
  positions: Map<string, Position>;

  /** Port positions per node */
  ports: Map<string, NodePorts>;

  /** Edge routes (optional) */
  edgeRoutes?: Map<string, Position[]>;

  /** Layout bounds */
  bounds: Bounds;

  /** Layout algorithm used */
  algorithm: string;
}

/**
 * Tree Node (for tree layout algorithms)
 */
export interface TreeNode {
  id: string;
  children: TreeNode[];
  x?: number;
  y?: number;
  mod?: number; // Reingold-Tilford modifier
}
