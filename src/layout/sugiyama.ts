/**
 * Sugiyama Layered Layout Algorithm
 *
 * Implements the 4-phase Sugiyama framework:
 * 1. Layer Assignment (longest path)
 * 2. Crossing Minimization (barycenter heuristic)
 * 3. Coordinate Assignment
 * 4. Edge Routing (polyline)
 *
 * @author andreas@siglochconsulting
 */

import { Node, Edge } from '../shared/types/ontology.js';
import {
  ILayoutAlgorithm,
  LayoutResult,
  PositionedNode,
  PositionedEdge,
  SugiyamaConfig,
} from './types.js';

interface LayerNode {
  node: Node;
  layer: number;
  position: number;
  x: number;
  y: number;
}

export class SugiyamaLayout implements ILayoutAlgorithm {
  compute(nodes: Node[], edges: Edge[], config: SugiyamaConfig): LayoutResult {
    if (nodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        bounds: { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 },
      };
    }

    // Phase 1: Layer Assignment
    const layeredNodes = this.assignLayers(nodes, edges, config);

    // Phase 2: Crossing Minimization
    this.minimizeCrossings(layeredNodes, edges, config);

    // Phase 3: Coordinate Assignment
    this.assignCoordinates(layeredNodes, config);

    // Phase 4: Edge Routing
    const positionedEdges = this.routeEdges(layeredNodes, edges);

    // Convert to PositionedNode
    const positionedNodes: PositionedNode[] = layeredNodes.map((ln) => ({
      ...ln.node,
      x: ln.x,
      y: ln.y,
      layer: ln.layer,
      width: 120,
      height: 60,
    }));

    // Calculate bounds
    const bounds = this.calculateBounds(positionedNodes);

    return {
      nodes: positionedNodes,
      edges: positionedEdges,
      bounds,
    };
  }

  /**
   * Phase 1: Assign nodes to layers based on longest path
   */
  private assignLayers(
    nodes: Node[],
    edges: Edge[],
    config: SugiyamaConfig
  ): LayerNode[] {
    const layerMap = new Map<string, number>();

    // Apply layer constraints if specified
    if (config.layeredProperties.layerConstraints) {
      for (const node of nodes) {
        const constraint = config.layeredProperties.layerConstraints[node.type];
        if (constraint !== undefined) {
          layerMap.set(node.semanticId, constraint);
        }
      }
    }

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();

    for (const edge of edges) {
      if (!outgoing.has(edge.sourceId)) outgoing.set(edge.sourceId, []);
      if (!incoming.has(edge.targetId)) incoming.set(edge.targetId, []);
      outgoing.get(edge.sourceId)!.push(edge.targetId);
      incoming.get(edge.targetId)!.push(edge.sourceId);
    }

    // Longest path layer assignment
    const visited = new Set<string>();
    const computeLayer = (nodeId: string): number => {
      if (layerMap.has(nodeId)) {
        return layerMap.get(nodeId)!;
      }

      if (visited.has(nodeId)) {
        return layerMap.get(nodeId) || 0;
      }

      visited.add(nodeId);

      const parents = incoming.get(nodeId) || [];
      if (parents.length === 0) {
        layerMap.set(nodeId, 0);
        return 0;
      }

      const maxParentLayer = Math.max(...parents.map((p) => computeLayer(p)));
      const layer = maxParentLayer + 1;
      layerMap.set(nodeId, layer);
      return layer;
    };

    // Compute layers for all nodes
    for (const node of nodes) {
      computeLayer(node.semanticId);
    }

    // Create LayerNode objects
    const layeredNodes: LayerNode[] = nodes.map((node) => ({
      node,
      layer: layerMap.get(node.semanticId) || 0,
      position: 0,
      x: 0,
      y: 0,
    }));

    // Group by layer and assign positions
    const layers = new Map<number, LayerNode[]>();
    for (const ln of layeredNodes) {
      if (!layers.has(ln.layer)) layers.set(ln.layer, []);
      layers.get(ln.layer)!.push(ln);
    }

    // Assign initial position within layer
    for (const nodes of layers.values()) {
      nodes.forEach((ln, index) => {
        ln.position = index;
      });
    }

    return layeredNodes;
  }

  /**
   * Phase 2: Minimize edge crossings using barycenter heuristic
   */
  private minimizeCrossings(
    layeredNodes: LayerNode[],
    edges: Edge[],
    config: SugiyamaConfig
  ): void {
    const layers = this.groupByLayer(layeredNodes);
    const maxLayer = Math.max(...layers.keys());
    const iterations = config.layeredProperties.iterations;

    // Build adjacency
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();

    for (const edge of edges) {
      if (!outgoing.has(edge.sourceId)) outgoing.set(edge.sourceId, []);
      if (!incoming.has(edge.targetId)) incoming.set(edge.targetId, []);
      outgoing.get(edge.sourceId)!.push(edge.targetId);
      incoming.get(edge.targetId)!.push(edge.sourceId);
    }

    // Barycenter heuristic
    for (let iter = 0; iter < iterations; iter++) {
      // Downward pass
      for (let layer = 1; layer <= maxLayer; layer++) {
        const currentLayer = layers.get(layer) || [];
        this.orderLayerByBarycenter(currentLayer, incoming, layers.get(layer - 1) || []);
      }

      // Upward pass
      for (let layer = maxLayer - 1; layer >= 0; layer--) {
        const currentLayer = layers.get(layer) || [];
        this.orderLayerByBarycenter(currentLayer, outgoing, layers.get(layer + 1) || []);
      }
    }
  }

  /**
   * Order layer nodes by barycenter of neighbors
   */
  private orderLayerByBarycenter(
    currentLayer: LayerNode[],
    adjacency: Map<string, string[]>,
    neighborLayer: LayerNode[]
  ): void {
    const positionMap = new Map<string, number>();
    neighborLayer.forEach((ln) => positionMap.set(ln.node.semanticId, ln.position));

    const barycenters = currentLayer.map((ln) => {
      const neighbors = adjacency.get(ln.node.semanticId) || [];
      const positions = neighbors
        .map((nId) => positionMap.get(nId))
        .filter((p): p is number => p !== undefined);

      if (positions.length === 0) return { node: ln, barycenter: ln.position };

      const barycenter = positions.reduce((sum, p) => sum + p, 0) / positions.length;
      return { node: ln, barycenter };
    });

    barycenters.sort((a, b) => a.barycenter - b.barycenter);

    barycenters.forEach((item, index) => {
      item.node.position = index;
    });
  }

  /**
   * Phase 3: Assign x,y coordinates
   */
  private assignCoordinates(layeredNodes: LayerNode[], config: SugiyamaConfig): void {
    const spacing = config.nodeSpacing || {
      horizontal: 100,
      vertical: 120,
      layerSpacing: 150,
    };

    const layers = this.groupByLayer(layeredNodes);

    for (const [layerIndex, nodes] of layers.entries()) {
      const layerY = layerIndex * (spacing.layerSpacing || 150);

      nodes.forEach((ln) => {
        ln.y = layerY;
        ln.x = ln.position * (spacing.horizontal || 100);
      });
    }
  }

  /**
   * Phase 4: Route edges with polyline
   */
  private routeEdges(
    layeredNodes: LayerNode[],
    edges: Edge[]
  ): PositionedEdge[] {
    const nodeMap = new Map<string, LayerNode>();
    layeredNodes.forEach((ln) => nodeMap.set(ln.node.semanticId, ln));

    return edges.map((edge) => {
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);

      if (!source || !target) {
        return { ...edge, points: [] };
      }

      // Simple polyline: source center → target center
      const points = [
        { x: source.x + 60, y: source.y + 60 }, // Center of source
        { x: target.x + 60, y: target.y + 60 }, // Center of target
      ];

      return { ...edge, points };
    });
  }

  /**
   * Group nodes by layer
   */
  private groupByLayer(layeredNodes: LayerNode[]): Map<number, LayerNode[]> {
    const layers = new Map<number, LayerNode[]>();

    for (const ln of layeredNodes) {
      if (!layers.has(ln.layer)) layers.set(ln.layer, []);
      layers.get(ln.layer)!.push(ln);
    }

    // Sort nodes within each layer by position
    for (const nodes of layers.values()) {
      nodes.sort((a, b) => a.position - b.position);
    }

    return layers;
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
