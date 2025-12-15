/**
 * Graph Canvas Renderer - Pure Stateless Rendering
 *
 * CR-038 Phase 9: Pure function that transforms graph data into render output.
 * No state, no side effects - easy to test and reason about.
 *
 * Key Responsibilities:
 * - Apply filters to nodes/edges
 * - Apply view transformations
 * - Generate ASCII tree output
 * - Generate Format E operations from user edits
 *
 * @author andreas@siglochconsulting
 */

import type {
  FilterConfig,
  ViewId,
  UserEdit,
  FormatEOperation,
} from './graph-canvas-controller.js';
import type { Node, Edge, SemanticId } from '../shared/types/ontology.js';

// ============================================================
// Types
// ============================================================

export interface RenderData {
  ascii: string;
  nodeCount: number;
  edgeCount: number;
  filteredNodeCount: number;
  filteredEdgeCount: number;
  view: ViewId;
  timestamp: Date;
}

export interface RenderOptions {
  view: ViewId;
  filters: FilterConfig;
  selection: Set<string>;
  focusNodeId: string | null;
}

// Edge types per view
const VIEW_EDGE_TYPES: Record<ViewId, string[]> = {
  hierarchy: ['compose', 'contains', 'parent'],
  allocation: ['allocate', 'realize', 'implement'],
  traceability: ['trace', 'derive', 'satisfy', 'verify'],
  dependency: ['depend', 'use', 'require', 'import'],
  fchain: ['flow', 'trigger', 'signal', 'data', 'io'],
  all: [], // Show all edges
};

// ============================================================
// Graph Canvas Renderer
// ============================================================

export class GraphCanvasRenderer {
  // ============================================================
  // Main Render Function (Pure)
  // ============================================================

  /**
   * Pure render function: (nodes, edges, options) → RenderData
   *
   * No side effects, deterministic output for same input.
   */
  render(nodes: Node[], edges: Edge[], options: RenderOptions): RenderData {
    // Step 1: Apply filters
    const filteredNodes = this.applyNodeFilters(nodes, options.filters);
    const filteredEdges = this.applyEdgeFilters(edges, filteredNodes, options.view);

    // Step 2: Build tree structure
    const tree = this.buildTree(filteredNodes, filteredEdges, options);

    // Step 3: Render to ASCII
    const ascii = this.renderTree(tree, options);

    return {
      ascii,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      filteredNodeCount: filteredNodes.length,
      filteredEdgeCount: filteredEdges.length,
      view: options.view,
      timestamp: new Date(),
    };
  }

  // ============================================================
  // Filtering
  // ============================================================

  /**
   * Apply node filters
   */
  private applyNodeFilters(nodes: Node[], filters: FilterConfig): Node[] {
    return nodes.filter((node) => {
      // Type filter
      if (filters.nodeTypes?.length) {
        if (!filters.nodeTypes.includes(node.type)) {
          return false;
        }
      }

      // Phase filter
      if (filters.phase !== undefined) {
        const nodePhase = (node.attributes?.phase as number) ?? 2;
        if (nodePhase > filters.phase) {
          return false;
        }
      }

      // Search filter
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        const matchesId = node.semanticId.toLowerCase().includes(term);
        const matchesName = node.name?.toLowerCase().includes(term);
        const matchesDescr = node.descr?.toLowerCase().includes(term);
        if (!matchesId && !matchesName && !matchesDescr) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Apply edge filters based on view and included nodes
   */
  private applyEdgeFilters(edges: Edge[], includedNodes: Node[], view: ViewId): Edge[] {
    const nodeIds = new Set(includedNodes.map((n) => n.semanticId));
    const viewEdgeTypes = VIEW_EDGE_TYPES[view];

    return edges.filter((edge) => {
      // Both endpoints must be in filtered nodes
      if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
        return false;
      }

      // View-specific edge type filtering
      if (viewEdgeTypes.length > 0) {
        const edgeTypeLower = edge.type.toLowerCase();
        const matches = viewEdgeTypes.some((t) => edgeTypeLower.includes(t));
        if (!matches) {
          return false;
        }
      }

      return true;
    });
  }

  // ============================================================
  // Tree Building
  // ============================================================

  /**
   * Build tree structure from nodes and edges
   */
  private buildTree(nodes: Node[], edges: Edge[], options: RenderOptions): TreeNode[] {
    // Build adjacency map
    const children = new Map<SemanticId, Set<SemanticId>>();
    const parents = new Map<SemanticId, Set<SemanticId>>();

    for (const edge of edges) {
      // Parent -> Child relationship
      if (!children.has(edge.sourceId)) {
        children.set(edge.sourceId, new Set());
      }
      children.get(edge.sourceId)!.add(edge.targetId);

      if (!parents.has(edge.targetId)) {
        parents.set(edge.targetId, new Set());
      }
      parents.get(edge.targetId)!.add(edge.sourceId);
    }

    // Find roots (nodes with no parents in the filtered set)
    const nodeMap = new Map(nodes.map((n) => [n.semanticId, n]));
    const roots: TreeNode[] = [];

    for (const node of nodes) {
      const nodeParents = parents.get(node.semanticId);
      const hasParentInSet =
        nodeParents && Array.from(nodeParents).some((p) => nodeMap.has(p));

      if (!hasParentInSet) {
        roots.push(this.buildTreeNode(node, children, nodeMap, options, new Set()));
      }
    }

    // Sort roots by type, then by name
    roots.sort((a, b) => {
      if (a.node.type !== b.node.type) {
        return a.node.type.localeCompare(b.node.type);
      }
      return (a.node.name || '').localeCompare(b.node.name || '');
    });

    return roots;
  }

  /**
   * Build tree node recursively
   */
  private buildTreeNode(
    node: Node,
    children: Map<SemanticId, Set<SemanticId>>,
    nodeMap: Map<SemanticId, Node>,
    options: RenderOptions,
    visited: Set<SemanticId>
  ): TreeNode {
    // Prevent cycles
    if (visited.has(node.semanticId)) {
      return {
        node,
        children: [],
        isSelected: options.selection.has(node.semanticId),
        isFocused: options.focusNodeId === node.semanticId,
      };
    }

    visited.add(node.semanticId);

    const childIds = children.get(node.semanticId) || new Set();
    const childNodes: TreeNode[] = [];

    for (const childId of childIds) {
      const childNode = nodeMap.get(childId);
      if (childNode) {
        childNodes.push(
          this.buildTreeNode(childNode, children, nodeMap, options, new Set(visited))
        );
      }
    }

    // Sort children
    childNodes.sort((a, b) => {
      if (a.node.type !== b.node.type) {
        return a.node.type.localeCompare(b.node.type);
      }
      return (a.node.name || '').localeCompare(b.node.name || '');
    });

    return {
      node,
      children: childNodes,
      isSelected: options.selection.has(node.semanticId),
      isFocused: options.focusNodeId === node.semanticId,
    };
  }

  // ============================================================
  // ASCII Rendering
  // ============================================================

  /**
   * Render tree to ASCII
   */
  private renderTree(roots: TreeNode[], options: RenderOptions): string {
    if (roots.length === 0) {
      return '(empty graph)';
    }

    const lines: string[] = [];
    lines.push(`View: ${options.view}`);
    lines.push('');

    for (let i = 0; i < roots.length; i++) {
      const isLast = i === roots.length - 1;
      this.renderTreeNode(roots[i], '', isLast, lines);
    }

    return lines.join('\n');
  }

  /**
   * Render single tree node recursively
   */
  private renderTreeNode(
    treeNode: TreeNode,
    prefix: string,
    isLast: boolean,
    lines: string[]
  ): void {
    const { node, children, isSelected, isFocused } = treeNode;

    // Build node line
    const connector = isLast ? '└── ' : '├── ';
    const marker = isFocused ? '➤ ' : isSelected ? '✓ ' : '';
    const typeTag = `[${node.type}]`;
    const label = node.name || node.semanticId;

    lines.push(`${prefix}${connector}${marker}${typeTag} ${label}`);

    // Render children
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    for (let i = 0; i < children.length; i++) {
      const isLastChild = i === children.length - 1;
      this.renderTreeNode(children[i], childPrefix, isLastChild, lines);
    }
  }

  // ============================================================
  // Format E Operation Generation
  // ============================================================

  /**
   * Generate Format E operations from user edit
   *
   * Pure function - no side effects.
   */
  generateOperations(edit: UserEdit): FormatEOperation[] {
    switch (edit.type) {
      case 'add-node':
        return this.generateAddNodeOps(edit);

      case 'update-node':
        return this.generateUpdateNodeOps(edit);

      case 'delete-node':
        return this.generateDeleteNodeOps(edit);

      case 'add-edge':
        return this.generateAddEdgeOps(edit);

      case 'delete-edge':
        return this.generateDeleteEdgeOps(edit);

      default:
        return [];
    }
  }

  private generateAddNodeOps(edit: UserEdit): FormatEOperation[] {
    if (!edit.nodeType || !edit.nodeId) {
      return [];
    }

    return [
      {
        type: 'NODE',
        operation: 'ADD',
        data: {
          semanticId: edit.nodeId,
          type: edit.nodeType,
          name: edit.label || edit.nodeId,
          ...edit.properties,
        },
      },
    ];
  }

  private generateUpdateNodeOps(edit: UserEdit): FormatEOperation[] {
    if (!edit.nodeId) {
      return [];
    }

    return [
      {
        type: 'NODE',
        operation: 'UPDATE',
        data: {
          semanticId: edit.nodeId,
          name: edit.label,
          ...edit.properties,
        },
      },
    ];
  }

  private generateDeleteNodeOps(edit: UserEdit): FormatEOperation[] {
    if (!edit.nodeId) {
      return [];
    }

    return [
      {
        type: 'DELETE',
        operation: 'DELETE',
        data: {
          semanticId: edit.nodeId,
        },
      },
    ];
  }

  private generateAddEdgeOps(edit: UserEdit): FormatEOperation[] {
    if (!edit.source || !edit.target || !edit.edgeType) {
      return [];
    }

    return [
      {
        type: 'EDGE',
        operation: 'ADD',
        data: {
          sourceId: edit.source,
          targetId: edit.target,
          type: edit.edgeType,
        },
      },
    ];
  }

  private generateDeleteEdgeOps(edit: UserEdit): FormatEOperation[] {
    if (!edit.source || !edit.target) {
      return [];
    }

    return [
      {
        type: 'EDGE',
        operation: 'DELETE',
        data: {
          sourceId: edit.source,
          targetId: edit.target,
        },
      },
    ];
  }
}

// ============================================================
// Internal Types
// ============================================================

interface TreeNode {
  node: Node;
  children: TreeNode[];
  isSelected: boolean;
  isFocused: boolean;
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a Graph Canvas Renderer
 */
export function createGraphCanvasRenderer(): GraphCanvasRenderer {
  return new GraphCanvasRenderer();
}
