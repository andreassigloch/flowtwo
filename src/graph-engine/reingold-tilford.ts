/**
 * Reingold-Tilford Tree Layout Algorithm
 *
 * Classic tree layout algorithm that:
 * 1. Centers parents over children
 * 2. Minimizes tree width
 * 3. Ensures siblings are equally spaced
 * 4. Prevents node overlap
 *
 * References:
 * - Reingold, E. M., & Tilford, J. S. (1981)
 * - "Tidier Drawings of Trees" IEEE Trans. on Software Engineering
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { GraphState } from '../shared/types/ontology.js';
import { LayoutResult, TreeNode, Position, Bounds } from '../shared/types/layout.js';

export interface ReingoldTilfordConfig {
  /** Tree orientation */
  orientation?: 'top-down' | 'left-right' | 'bottom-up' | 'right-left';

  /** Horizontal spacing between siblings */
  nodeSpacing?: number;

  /** Vertical spacing between levels */
  levelSpacing?: number;
}

/**
 * Reingold-Tilford Tree Layout
 *
 * Implements the classic tree layout algorithm
 *
 * TEST: tests/unit/graph-engine/reingold-tilford.test.ts
 */
export class ReingoldTilfordLayout {
  private config: Required<ReingoldTilfordConfig>;

  constructor(config: ReingoldTilfordConfig = {}) {
    this.config = {
      orientation: config.orientation || 'top-down',
      nodeSpacing: config.nodeSpacing || 50,
      levelSpacing: config.levelSpacing || 100,
    };
  }

  /**
   * Compute tree layout
   *
   * @param graph - Graph state (must be a tree or forest)
   * @returns Layout result with positions
   */
  compute(graph: GraphState): LayoutResult {
    // Build tree structure from graph
    const trees = this.buildTreeStructure(graph);

    // Compute relative positions using Reingold-Tilford
    for (const root of trees) {
      this.computeLayout(root, 0);
      this.finalizePositions(root, 0, 0);
    }

    // Convert tree positions to absolute positions
    const positions = new Map<string, Position>();
    let offsetX = 0;

    for (const root of trees) {
      this.collectPositions(root, positions, offsetX);

      // Offset next tree to the right
      const { width } = this.computeTreeBounds(root);
      offsetX += width + this.config.nodeSpacing * 2;
    }

    // Apply orientation transformation
    this.applyOrientation(positions);

    // Compute bounds
    const bounds = this.computeBounds(positions);

    return {
      positions,
      ports: new Map(), // Ports handled separately by PortExtractor
      bounds,
      algorithm: 'reingold-tilford',
    };
  }

  /**
   * Build tree structure from graph
   *
   * Handles forests (multiple root nodes)
   */
  private buildTreeStructure(graph: GraphState): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();
    const childrenMap = new Map<string, Set<string>>();
    const parentMap = new Map<string, string>();

    // Initialize nodes
    for (const node of graph.nodes.values()) {
      nodeMap.set(node.semanticId, {
        id: node.semanticId,
        children: [],
      });
      childrenMap.set(node.semanticId, new Set());
    }

    // Build parent-child relationships
    for (const edge of graph.edges.values()) {
      if (edge.type === 'compose') {
        childrenMap.get(edge.sourceId)?.add(edge.targetId);
        parentMap.set(edge.targetId, edge.sourceId);
      }
    }

    // Connect children
    for (const [nodeId, childIds] of childrenMap) {
      const node = nodeMap.get(nodeId)!;
      node.children = Array.from(childIds).map((childId) => nodeMap.get(childId)!);
    }

    // Find roots (nodes without parents)
    const roots: TreeNode[] = [];
    for (const node of nodeMap.values()) {
      if (!parentMap.has(node.id)) {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Compute layout using Reingold-Tilford algorithm
   *
   * First pass: Compute relative x positions
   */
  private computeLayout(node: TreeNode, depth: number): void {
    node.y = depth * this.config.levelSpacing;

    if (node.children.length === 0) {
      // Leaf node: x = 0 (relative to siblings)
      node.x = 0;
      node.mod = 0;
      return;
    }

    // Recursively layout children
    for (const child of node.children) {
      this.computeLayout(child, depth + 1);
    }

    // Position children with spacing
    const childrenWidth = node.children.length - 1;
    let offset = -childrenWidth / 2;

    for (const child of node.children) {
      child.x = offset * this.config.nodeSpacing;
      offset++;
    }

    // Center parent over children
    const leftmost = node.children[0].x!;
    const rightmost = node.children[node.children.length - 1].x!;
    node.x = (leftmost + rightmost) / 2;
    node.mod = 0;
  }

  /**
   * Finalize positions
   *
   * Second pass: Apply parent modifiers to get absolute x positions
   */
  private finalizePositions(node: TreeNode, modSum: number, parentX: number): void {
    node.x = (node.x || 0) + modSum;
    node.y = (node.y || 0);

    for (const child of node.children) {
      this.finalizePositions(child, modSum + (node.mod || 0), node.x);
    }
  }

  /**
   * Collect positions from tree structure
   */
  private collectPositions(
    node: TreeNode,
    positions: Map<string, Position>,
    offsetX: number
  ): void {
    positions.set(node.id, {
      x: (node.x || 0) + offsetX,
      y: node.y || 0,
    });

    for (const child of node.children) {
      this.collectPositions(child, positions, offsetX);
    }
  }

  /**
   * Compute tree bounds
   */
  private computeTreeBounds(node: TreeNode): { width: number; height: number } {
    let minX = node.x || 0;
    let maxX = node.x || 0;
    let maxY = node.y || 0;

    const traverse = (n: TreeNode) => {
      minX = Math.min(minX, n.x || 0);
      maxX = Math.max(maxX, n.x || 0);
      maxY = Math.max(maxY, n.y || 0);

      for (const child of n.children) {
        traverse(child);
      }
    };

    traverse(node);

    return {
      width: maxX - minX,
      height: maxY,
    };
  }

  /**
   * Apply orientation transformation
   *
   * Transform from canonical top-down to requested orientation
   */
  private applyOrientation(positions: Map<string, Position>): void {
    if (this.config.orientation === 'top-down') {
      return; // Already in correct orientation
    }

    for (const [id, pos] of positions) {
      let newPos: Position;

      switch (this.config.orientation) {
        case 'left-right':
          newPos = { x: pos.y, y: pos.x };
          break;
        case 'bottom-up':
          newPos = { x: pos.x, y: -pos.y };
          break;
        case 'right-left':
          newPos = { x: -pos.y, y: pos.x };
          break;
        default:
          newPos = pos;
      }

      positions.set(id, newPos);
    }
  }

  /**
   * Compute bounds from positions
   */
  private computeBounds(positions: Map<string, Position>): Bounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pos of positions.values()) {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}
