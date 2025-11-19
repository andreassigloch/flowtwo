/**
 * Layout Algorithm Type Definitions
 *
 * @author andreas@siglochconsulting
 */

import { Node, Edge, NodeType } from '../shared/types/ontology.js';

/**
 * Positioned Node (result of layout)
 */
export interface PositionedNode extends Node {
  x: number;
  y: number;
  width?: number;
  height?: number;
  layer?: number; // For layered layouts
}

/**
 * Positioned Edge (result of layout)
 */
export interface PositionedEdge extends Edge {
  points?: { x: number; y: number }[]; // Routing points for polyline
  bendPoints?: { x: number; y: number }[]; // Bend points for orthogonal
}

/**
 * Layout Result
 */
export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  bounds: {
    width: number;
    height: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

/**
 * Base Layout Configuration
 */
export interface LayoutConfig {
  algorithm: 'reingold-tilford' | 'sugiyama' | 'orthogonal' | 'treemap' | 'radial';
  orientation: 'top-down' | 'bottom-up' | 'left-right' | 'right-left';
  includeNodeTypes: NodeType[];
  includeRelTypes: string[];
  nodeSpacing?: {
    horizontal?: number;
    vertical?: number;
    layerSpacing?: number;
    padding?: number; // For treemap
    minModuleSize?: number; // For treemap
    funcNodeSize?: number; // For treemap
    portSpacing?: number; // For orthogonal
  };
}

/**
 * Sugiyama Layered Layout Configuration
 */
export interface SugiyamaConfig extends LayoutConfig {
  algorithm: 'sugiyama';
  layeredProperties: {
    layerAssignment: 'longest-path' | 'network-simplex';
    crossingMinimization: 'barycenter' | 'median';
    nodeOrdering: 'priority' | 'natural';
    edgeRouting: 'polyline' | 'spline';
    layerConstraints?: Record<NodeType, number>;
    iterations: number;
    minimizeBends: boolean;
  };
}

/**
 * Orthogonal Layout Configuration
 */
export interface OrthogonalConfig extends LayoutConfig {
  algorithm: 'orthogonal';
  orthogonalProperties: {
    portPlacement: 'fixed' | 'optimized';
    flowNodeHandling: 'as-ports' | 'as-nodes';
    minimizeBends: boolean;
    gridSize: number;
    channelRouting: boolean;
  };
}

/**
 * Treemap Layout Configuration
 */
export interface TreemapConfig extends LayoutConfig {
  algorithm: 'treemap';
  treemapProperties: {
    containerType: NodeType;
    itemType: NodeType;
    packingAlgorithm: 'squarify' | 'slice-dice' | 'strip';
    padding: number;
    aspectRatio: number;
  };
}

/**
 * Radial Layout Configuration
 */
export interface RadialConfig extends LayoutConfig {
  algorithm: 'radial';
  radialProperties: {
    centerNodeType: NodeType;
    outerNodeTypes: NodeType[];
    radius: number;
    angleSpread: number;
    layerDistance: number;
  };
}

/**
 * Layout Algorithm Interface
 */
export interface ILayoutAlgorithm {
  compute(
    nodes: Node[],
    edges: Edge[],
    config: LayoutConfig
  ): LayoutResult;
}
