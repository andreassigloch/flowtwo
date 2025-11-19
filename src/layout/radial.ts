/**
 * Radial Layout Algorithm
 *
 * Implements radial layout for use case diagrams
 * - UC nodes in center ring
 * - ACTOR nodes in outer ring
 * - Balanced angular distribution
 *
 * @author andreas@siglochconsulting
 */

import { Node, Edge } from '../shared/types/ontology.js';
import {
  ILayoutAlgorithm,
  LayoutResult,
  PositionedNode,
  PositionedEdge,
  RadialConfig,
} from './types.js';

export class RadialLayout implements ILayoutAlgorithm {
  compute(nodes: Node[], edges: Edge[], config: RadialConfig): LayoutResult {
    if (nodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        bounds: { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 },
      };
    }

    // Separate center and outer nodes
    const centerNodes = nodes.filter((n) => n.type === config.radialProperties.centerNodeType);
    const outerNodes = nodes.filter((n) =>
      config.radialProperties.outerNodeTypes.includes(n.type)
    );

    // Position center nodes in inner circle
    const centerRadius = config.radialProperties.radius || 200;
    const positionedCenterNodes = this.positionNodesInCircle(
      centerNodes,
      centerRadius,
      { x: 500, y: 500 }
    );

    // Position outer nodes in outer circle
    const outerRadius = (config.radialProperties.radius || 200) + config.radialProperties.layerDistance;
    const positionedOuterNodes = this.positionNodesInCircle(
      outerNodes,
      outerRadius,
      { x: 500, y: 500 }
    );

    const allPositionedNodes = [...positionedCenterNodes, ...positionedOuterNodes];

    // Position edges
    const positionedEdges = this.positionEdges(edges, allPositionedNodes);

    // Calculate bounds
    const bounds = this.calculateBounds(allPositionedNodes);

    return {
      nodes: allPositionedNodes,
      edges: positionedEdges,
      bounds,
    };
  }

  /**
   * Position nodes in a circle
   */
  private positionNodesInCircle(
    nodes: Node[],
    radius: number,
    center: { x: number; y: number }
  ): PositionedNode[] {
    if (nodes.length === 0) return [];

    const angleStep = (2 * Math.PI) / nodes.length;

    return nodes.map((node, index) => {
      const angle = index * angleStep - Math.PI / 2; // Start at top (12 o'clock)
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);

      return {
        ...node,
        x: x - 60, // Center node (assuming 120x60 size)
        y: y - 30,
        width: 120,
        height: 60,
      };
    });
  }

  /**
   * Position edges as straight lines
   */
  private positionEdges(edges: Edge[], nodes: PositionedNode[]): PositionedEdge[] {
    const nodeMap = new Map<string, PositionedNode>();
    nodes.forEach((n) => nodeMap.set(n.semanticId, n));

    return edges.map((edge) => {
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);

      if (!source || !target) {
        return { ...edge, points: [] };
      }

      // Straight line from center to center
      const points = [
        { x: source.x + (source.width || 0) / 2, y: source.y + (source.height || 0) / 2 },
        { x: target.x + (target.width || 0) / 2, y: target.y + (target.height || 0) / 2 },
      ];

      return { ...edge, points };
    });
  }

  /**
   * Calculate layout bounds
   */
  private calculateBounds(nodes: PositionedNode[]): LayoutResult['bounds'] {
    if (nodes.length === 0) {
      return { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs.map((x, i) => x + (nodes[i].width || 120)));
    const maxY = Math.max(...ys.map((y, i) => y + (nodes[i].height || 60)));

    return {
      width: maxX - minX,
      height: maxY - minY,
      minX,
      minY,
      maxX,
      maxY,
    };
  }
}
