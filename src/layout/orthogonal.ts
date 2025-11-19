/**
 * Orthogonal Layout Algorithm
 *
 * Implements orthogonal (Manhattan) routing with port-based connectivity
 * - FLOW nodes rendered as ports on FUNC blocks
 * - 90° angle routing only
 * - Left-to-right flow orientation
 *
 * @author andreas@siglochconsulting
 */

import { Node, Edge } from '../shared/types/ontology.js';
import {
  ILayoutAlgorithm,
  LayoutResult,
  PositionedNode,
  PositionedEdge,
  OrthogonalConfig,
} from './types.js';

interface Port {
  id: string;
  nodeId: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  offset: number;
  x: number;
  y: number;
  flowNode?: Node;
}


export class OrthogonalLayout implements ILayoutAlgorithm {
  private ports: Map<string, Port[]> = new Map();
  private flowNodes: Map<string, Node> = new Map();

  compute(nodes: Node[], edges: Edge[], config: OrthogonalConfig): LayoutResult {
    if (nodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        bounds: { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 },
      };
    }

    // Separate FLOW nodes from other nodes
    const flowNodes = nodes.filter((n) => n.type === 'FLOW');
    const visibleNodes = nodes.filter((n) => n.type !== 'FLOW');

    flowNodes.forEach((fn) => this.flowNodes.set(fn.semanticId, fn));

    // Extract ports from FLOW nodes and io edges
    this.extractPorts(visibleNodes, edges);

    // Perform layered placement (left-to-right)
    const layeredNodes = this.assignLayers(visibleNodes, edges);

    // Position nodes on grid
    const positionedNodes = this.positionNodes(layeredNodes, config);

    // Update port coordinates
    this.updatePortCoordinates(positionedNodes);

    // Route edges orthogonally
    const positionedEdges = this.routeEdgesOrthogonally(edges);

    // Calculate bounds
    const bounds = this.calculateBounds(positionedNodes);

    return {
      nodes: positionedNodes,
      edges: positionedEdges,
      bounds,
    };
  }

  /**
   * Extract ports from FLOW nodes connected via io edges
   */
  private extractPorts(nodes: Node[], edges: Edge[]): void {
    for (const node of nodes) {
      if (node.type === 'FUNC') {
        this.ports.set(node.semanticId, []);
      }
    }

    for (const edge of edges) {
      if (edge.type !== 'io') continue;

      const sourceNode = this.flowNodes.get(edge.sourceId);
      const targetNode = this.flowNodes.get(edge.targetId);

      // FUNC --io--> FLOW (output port)
      if (targetNode && targetNode.type === 'FLOW') {
        const ports = this.ports.get(edge.sourceId) || [];
        ports.push({
          id: `${edge.sourceId}-out-${targetNode.semanticId}`,
          nodeId: edge.sourceId,
          side: 'right',
          offset: ports.filter((p) => p.side === 'right').length,
          x: 0,
          y: 0,
          flowNode: targetNode,
        });
        this.ports.set(edge.sourceId, ports);
      }

      // FLOW --io--> FUNC (input port)
      if (sourceNode && sourceNode.type === 'FLOW') {
        const ports = this.ports.get(edge.targetId) || [];
        ports.push({
          id: `${edge.targetId}-in-${sourceNode.semanticId}`,
          nodeId: edge.targetId,
          side: 'left',
          offset: ports.filter((p) => p.side === 'left').length,
          x: 0,
          y: 0,
          flowNode: sourceNode,
        });
        this.ports.set(edge.targetId, ports);
      }
    }
  }

  /**
   * Assign nodes to layers (columns) for left-to-right flow
   */
  private assignLayers(nodes: Node[], edges: Edge[]): Map<number, Node[]> {
    const layerMap = new Map<string, number>();
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();

    // Build adjacency (ignore FLOW nodes)
    for (const edge of edges) {
      if (edge.type === 'io') continue; // Skip io for layer assignment

      if (!outgoing.has(edge.sourceId)) outgoing.set(edge.sourceId, []);
      if (!incoming.has(edge.targetId)) incoming.set(edge.targetId, []);
      outgoing.get(edge.sourceId)!.push(edge.targetId);
      incoming.get(edge.targetId)!.push(edge.sourceId);
    }

    // Topological layering
    const visited = new Set<string>();
    const computeLayer = (nodeId: string): number => {
      if (layerMap.has(nodeId)) return layerMap.get(nodeId)!;
      if (visited.has(nodeId)) return layerMap.get(nodeId) || 0;

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

    for (const node of nodes) {
      computeLayer(node.semanticId);
    }

    // Group by layer
    const layers = new Map<number, Node[]>();
    for (const node of nodes) {
      const layer = layerMap.get(node.semanticId) || 0;
      if (!layers.has(layer)) layers.set(layer, []);
      layers.get(layer)!.push(node);
    }

    return layers;
  }

  /**
   * Position nodes on grid
   */
  private positionNodes(layers: Map<number, Node[]>, config: OrthogonalConfig): PositionedNode[] {
    const spacing = config.nodeSpacing || { horizontal: 150, vertical: 80 };
    const horizontal = spacing.horizontal || 150;
    const vertical = spacing.vertical || 80;
    const positionedNodes: PositionedNode[] = [];

    for (const [layerIndex, nodes] of layers.entries()) {
      const x = layerIndex * horizontal;

      nodes.forEach((node, index) => {
        const y = index * vertical;

        positionedNodes.push({
          ...node,
          x,
          y,
          width: 120,
          height: 60,
        });
      });
    }

    return positionedNodes;
  }

  /**
   * Update port coordinates based on node positions
   */
  private updatePortCoordinates(nodes: PositionedNode[]): void {
    const nodeMap = new Map<string, PositionedNode>();
    nodes.forEach((n) => nodeMap.set(n.semanticId, n));

    for (const [nodeId, ports] of this.ports.entries()) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const leftPorts = ports.filter((p) => p.side === 'left');
      const rightPorts = ports.filter((p) => p.side === 'right');

      // Distribute left ports vertically
      leftPorts.forEach((port, index) => {
        const spacing = node.height! / (leftPorts.length + 1);
        port.x = node.x;
        port.y = node.y + spacing * (index + 1);
      });

      // Distribute right ports vertically
      rightPorts.forEach((port, index) => {
        const spacing = node.height! / (rightPorts.length + 1);
        port.x = node.x + node.width!;
        port.y = node.y + spacing * (index + 1);
      });
    }
  }

  /**
   * Route edges orthogonally (Manhattan routing)
   */
  private routeEdgesOrthogonally(
    edges: Edge[]
  ): PositionedEdge[] {
    return edges.map((edge) => {
      if (edge.type !== 'io') {
        return { ...edge, bendPoints: [] };
      }

      // Find source and target ports
      const sourcePort = this.findPort(edge.sourceId, 'right', edge.targetId);
      const targetPort = this.findPort(edge.targetId, 'left', edge.sourceId);

      if (!sourcePort || !targetPort) {
        return { ...edge, bendPoints: [] };
      }

      // Simple orthogonal routing: horizontal → vertical → horizontal
      const bendPoints = this.computeOrthogonalPath(sourcePort, targetPort);

      return { ...edge, bendPoints };
    });
  }

  /**
   * Find port by node, side, and connected flow
   */
  private findPort(nodeId: string, side: 'left' | 'right', flowId: string): Port | undefined {
    const ports = this.ports.get(nodeId) || [];
    return ports.find((p) => p.side === side && p.flowNode?.semanticId === flowId);
  }

  /**
   * Compute orthogonal path between two ports
   */
  private computeOrthogonalPath(
    source: Port,
    target: Port
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];

    // Start at source port
    points.push({ x: source.x, y: source.y });

    const midX = (source.x + target.x) / 2;

    // Horizontal segment from source
    points.push({ x: midX, y: source.y });

    // Vertical segment
    points.push({ x: midX, y: target.y });

    // Horizontal segment to target
    points.push({ x: target.x, y: target.y });

    return points;
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
