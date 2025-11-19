/**
 * Treemap Layout Algorithm
 *
 * Implements squarified treemap for module allocation visualization
 * - MOD nodes as containers
 * - FUNC nodes packed within allocated MOD
 * - Maintains aspect ratio close to golden ratio (1.618)
 *
 * @author andreas@siglochconsulting
 */

import { Node, Edge } from '../shared/types/ontology.js';
import {
  ILayoutAlgorithm,
  LayoutResult,
  PositionedNode,
  PositionedEdge,
  TreemapConfig,
} from './types.js';

interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TreemapNode {
  node: Node;
  rect: TreemapRect;
  children: TreemapNode[];
  size: number;
}

export class TreemapLayout implements ILayoutAlgorithm {

  compute(nodes: Node[], edges: Edge[], config: TreemapConfig): LayoutResult {
    if (nodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        bounds: { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 },
      };
    }

    // Build module hierarchy
    const moduleTree = this.buildModuleHierarchy(nodes, edges);

    // Compute sizes (number of allocated functions)
    this.computeSizes(moduleTree);

    // Layout treemap
    const rootRect: TreemapRect = { x: 0, y: 0, width: 1000, height: 1000 };
    this.layoutTreemap(moduleTree, rootRect, config);

    // Convert to positioned nodes
    const positionedNodes = this.flattenTreemap(moduleTree);

    // Position edges
    const positionedEdges = this.positionEdges(edges, positionedNodes);

    // Calculate bounds
    const bounds = this.calculateBounds(positionedNodes);

    return {
      nodes: positionedNodes,
      edges: positionedEdges,
      bounds,
    };
  }

  /**
   * Build module hierarchy from compose and allocate edges
   */
  private buildModuleHierarchy(nodes: Node[], edges: Edge[]): TreemapNode[] {
    const modNodes = nodes.filter((n) => n.type === 'MOD');
    const funcNodes = nodes.filter((n) => n.type === 'FUNC');

    // Build parent-child map for MOD nodes
    const parentMap = new Map<string, string>();
    const childrenMap = new Map<string, string[]>();

    for (const edge of edges) {
      if (edge.type === 'compose') {
        parentMap.set(edge.targetId, edge.sourceId);
        if (!childrenMap.has(edge.sourceId)) {
          childrenMap.set(edge.sourceId, []);
        }
        childrenMap.get(edge.sourceId)!.push(edge.targetId);
      }
    }

    // Build allocation map (FUNC -> MOD)
    const allocationMap = new Map<string, string>();
    for (const edge of edges) {
      if (edge.type === 'allocate') {
        allocationMap.set(edge.sourceId, edge.targetId);
      }
    }

    // Find root modules (no parent)
    const rootModules = modNodes.filter((n) => !parentMap.has(n.semanticId));

    // Build tree recursively
    const buildNode = (node: Node): TreemapNode => {
      const children: TreemapNode[] = [];

      // Add child modules
      const childModIds = childrenMap.get(node.semanticId) || [];
      for (const childId of childModIds) {
        const childNode = modNodes.find((n) => n.semanticId === childId);
        if (childNode) {
          children.push(buildNode(childNode));
        }
      }

      // Add allocated functions
      const allocatedFuncs = funcNodes.filter(
        (fn) => allocationMap.get(fn.semanticId) === node.semanticId
      );
      for (const func of allocatedFuncs) {
        children.push({
          node: func,
          rect: { x: 0, y: 0, width: 0, height: 0 },
          children: [],
          size: 1,
        });
      }

      return {
        node,
        rect: { x: 0, y: 0, width: 0, height: 0 },
        children,
        size: 0,
      };
    };

    return rootModules.map((mod) => buildNode(mod));
  }

  /**
   * Compute sizes (leaf count) for each node
   */
  private computeSizes(nodes: TreemapNode[]): void {
    const computeSize = (node: TreemapNode): number => {
      if (node.children.length === 0) {
        node.size = 1;
        return 1;
      }

      const childSize = node.children.reduce((sum, child) => sum + computeSize(child), 0);
      node.size = Math.max(childSize, 1);
      return node.size;
    };

    for (const node of nodes) {
      computeSize(node);
    }
  }

  /**
   * Layout treemap using squarified algorithm
   */
  private layoutTreemap(
    nodes: TreemapNode[],
    rect: TreemapRect,
    config: TreemapConfig
  ): void {
    for (const node of nodes) {
      node.rect = { ...rect };

      if (node.children.length === 0) {
        continue;
      }

      // Apply padding
      const padding = config.nodeSpacing?.padding || 10;
      const innerRect: TreemapRect = {
        x: rect.x + padding,
        y: rect.y + padding,
        width: rect.width - 2 * padding,
        height: rect.height - 2 * padding,
      };

      // Sort children by size (descending)
      const sortedChildren = [...node.children].sort((a, b) => b.size - a.size);

      // Squarify
      this.squarify(sortedChildren, innerRect);
    }
  }

  /**
   * Squarified treemap algorithm
   */
  private squarify(nodes: TreemapNode[], rect: TreemapRect): void {
    if (nodes.length === 0) return;

    const totalSize = nodes.reduce((sum, n) => sum + n.size, 0);
    const scale = (rect.width * rect.height) / totalSize;

    let currentX = rect.x;
    let currentY = rect.y;
    let remainingWidth = rect.width;
    let remainingHeight = rect.height;

    let currentRow: TreemapNode[] = [];
    

    
    const isHorizontal = rect.width >= rect.height;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      

      currentRow.push(node);

      const currentRowSize = currentRow.reduce((sum, n) => sum + n.size, 0);
      const currentRowScaledSize = currentRowSize * scale;

      // Calculate worst aspect ratio for current row
      const worstAspectRatio = this.worstAspectRatio(
        currentRow,
        isHorizontal ? remainingHeight : remainingWidth,
        scale
      );

      // Check if adding next node would improve aspect ratio
      const nextRow = i + 1 < nodes.length ? [...currentRow, nodes[i + 1]] : currentRow;
      const nextWorstAspectRatio = this.worstAspectRatio(
        nextRow,
        isHorizontal ? remainingHeight : remainingWidth,
        scale
      );

      // Layout row if this is last node or next node worsens aspect ratio
      if (i === nodes.length - 1 || nextWorstAspectRatio > worstAspectRatio) {
        this.layoutRow(
          currentRow,
          isHorizontal,
          currentX,
          currentY,
          isHorizontal ? remainingHeight : remainingWidth,
          currentRowScaledSize,
          scale
        );

        // Update position and remaining space
        if (isHorizontal) {
          const rowHeight = currentRowScaledSize / remainingHeight;
          currentX += rowHeight;
          remainingWidth -= rowHeight;
        } else {
          const rowHeight = currentRowScaledSize / remainingWidth;
          currentY += rowHeight;
          remainingHeight -= rowHeight;
        }

        currentRow = [];
      }
    }
  }

  /**
   * Layout a single row of nodes
   */
  private layoutRow(
    nodes: TreemapNode[],
    isHorizontal: boolean,
    x: number,
    y: number,
    breadth: number,
    totalSize: number,
    scale: number
  ): void {
    let offset = 0;

    for (const node of nodes) {
      const scaledSize = node.size * scale;
      const length = scaledSize / breadth;

      if (isHorizontal) {
        node.rect = {
          x,
          y: y + offset,
          width: totalSize / breadth,
          height: length,
        };
      } else {
        node.rect = {
          x: x + offset,
          y,
          width: length,
          height: totalSize / breadth,
        };
      }

      offset += length;

      // Recursively layout children
      if (node.children.length > 0) {
        this.squarify(node.children, node.rect);
      }
    }
  }

  /**
   * Calculate worst aspect ratio for a row
   */
  private worstAspectRatio(nodes: TreemapNode[], breadth: number, scale: number): number {
    if (nodes.length === 0) return Infinity;

    const sizes = nodes.map((n) => n.size * scale);
    const totalSize = sizes.reduce((sum, s) => sum + s, 0);
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);

    const length = totalSize / breadth;

    const ratio1 = (breadth * breadth * maxSize) / (length * length);
    const ratio2 = (length * length) / (breadth * breadth * minSize);

    return Math.max(ratio1, ratio2);
  }

  /**
   * Flatten treemap to positioned nodes
   */
  private flattenTreemap(nodes: TreemapNode[]): PositionedNode[] {
    const result: PositionedNode[] = [];

    const flatten = (node: TreemapNode): void => {
      result.push({
        ...node.node,
        x: node.rect.x,
        y: node.rect.y,
        width: node.rect.width,
        height: node.rect.height,
      });

      for (const child of node.children) {
        flatten(child);
      }
    };

    for (const node of nodes) {
      flatten(node);
    }

    return result;
  }

  /**
   * Position edges
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

      // Simple straight line from center to center
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
    const maxX = Math.max(...xs.map((x, i) => x + (nodes[i].width || 0)));
    const maxY = Math.max(...ys.map((y, i) => y + (nodes[i].height || 0)));

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
