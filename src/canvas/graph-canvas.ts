/**
 * Graph Canvas - State Manager for Ontology Graph
 *
 * Manages graph state (nodes, edges, positions) with dirty tracking
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { CanvasBase } from './canvas-base.js';
import { Node, Edge, SemanticId, GraphState } from '../shared/types/ontology.js';
import { Operation, GraphCanvasState } from '../shared/types/canvas.js';
import { FormatEParser } from '../shared/parsers/format-e-parser.js';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';

/**
 * Graph Canvas Implementation
 *
 * Manages:
 * - Node/edge collection
 * - Position tracking
 * - View state (current view, zoom, focus)
 * - Dirty tracking for incremental persistence
 *
 * TEST: tests/unit/canvas/graph-canvas.test.ts
 */
export class GraphCanvas extends CanvasBase {
  private state: GraphCanvasState;
  private neo4jClient?: Neo4jClient;

  constructor(
    workspaceId: string,
    systemId: string,
    chatId: string,
    userId: string,
    currentView: string = 'hierarchy',
    neo4jClient?: Neo4jClient,
    wsServer?: import('./websocket-server.js').CanvasWebSocketServer
  ) {
    const parser = new FormatEParser();
    super(workspaceId, systemId, chatId, userId, parser, wsServer);
    this.neo4jClient = neo4jClient;

    this.state = {
      workspaceId,
      systemId,
      currentView,
      nodes: new Map(),
      edges: new Map(),
      ports: new Map(),
      dirtyNodeIds: new Set(),
      dirtyEdgeIds: new Set(),
      version: 1,
      lastSavedVersion: 1,
      lastModified: new Date(),
    };
  }

  /**
   * Get current graph state (read-only)
   */
  getState(): Readonly<GraphCanvasState> {
    return this.state;
  }

  /**
   * Load graph from Neo4j (or initial state)
   */
  async loadGraph(initialState?: Partial<GraphState>): Promise<void> {
    if (initialState) {
      if (initialState.nodes) this.state.nodes = initialState.nodes;
      if (initialState.edges) this.state.edges = initialState.edges;
      if (initialState.ports) this.state.ports = initialState.ports;
    }

    this.lastFetchTime = new Date();
  }

  /**
   * Get node by semantic ID
   */
  getNode(semanticId: SemanticId): Node | undefined {
    return this.state.nodes.get(semanticId);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): Node[] {
    return Array.from(this.state.nodes.values());
  }

  /**
   * Get edge
   */
  getEdge(key: string): Edge | undefined {
    return this.state.edges.get(key);
  }

  /**
   * Get all edges
   */
  getAllEdges(): Edge[] {
    return Array.from(this.state.edges.values());
  }

  /**
   * Get edges for a specific node (incoming or outgoing)
   */
  getNodeEdges(semanticId: SemanticId, direction?: 'in' | 'out'): Edge[] {
    const edges = this.getAllEdges();

    if (direction === 'in') {
      return edges.filter((e) => e.targetId === semanticId);
    } else if (direction === 'out') {
      return edges.filter((e) => e.sourceId === semanticId);
    } else {
      return edges.filter((e) => e.sourceId === semanticId || e.targetId === semanticId);
    }
  }

  /**
   * Switch to different view
   */
  setCurrentView(viewName: string): void {
    this.state.currentView = viewName;
    this.state.lastModified = new Date();
  }

  /**
   * Set focus node
   */
  setFocus(semanticId: SemanticId | undefined): void {
    this.state.focus = semanticId;
  }

  /**
   * Set canvas zoom
   */
  setZoom(zoom: number): void {
    this.state.zoom = zoom;
  }

  /**
   * Apply operation to graph state
   *
   * SPEC: FR-4.1 (Canvas state management)
   */
  protected async applyOperation(op: Operation): Promise<void> {
    switch (op.type) {
      case 'add_node':
        if (op.node) {
          this.state.nodes.set(op.node.semanticId, op.node);
          this.state.dirtyNodeIds.add(op.node.semanticId);
          this.state.version++;
        }
        break;

      case 'remove_node':
        this.state.nodes.delete(op.semanticId);
        this.state.dirtyNodeIds.add(op.semanticId);
        this.state.version++;
        break;

      case 'update_node':
        if (op.updates && this.state.nodes.has(op.semanticId)) {
          const existing = this.state.nodes.get(op.semanticId)!;
          const updated = { ...existing, ...op.updates, updatedAt: new Date() };
          this.state.nodes.set(op.semanticId, updated as Node);
          this.state.dirtyNodeIds.add(op.semanticId);
          this.state.version++;
        }
        break;

      case 'add_edge':
        if (op.edge) {
          const key = `${op.edge.sourceId}-${op.edge.type}-${op.edge.targetId}`;
          this.state.edges.set(key, op.edge);
          this.state.dirtyEdgeIds.add(key);
          this.state.version++;
        }
        break;

      case 'remove_edge':
        if (op.edge) {
          const key = `${op.edge.sourceId}-${op.edge.type}-${op.edge.targetId}`;
          this.state.edges.delete(key);
          this.state.dirtyEdgeIds.add(key);
          this.state.version++;
        }
        break;
    }

    this.state.lastModified = new Date();
  }

  /**
   * Get dirty items for persistence
   */
  protected getDirtyItems(): Array<Node | Edge> {
    const items: Array<Node | Edge> = [];

    // Dirty nodes
    for (const nodeId of this.state.dirtyNodeIds) {
      const node = this.state.nodes.get(nodeId);
      if (node) {
        items.push(node);
      }
    }

    // Dirty edges
    for (const edgeKey of this.state.dirtyEdgeIds) {
      const edge = this.state.edges.get(edgeKey);
      if (edge) {
        items.push(edge);
      }
    }

    return items;
  }

  /**
   * Serialize dirty state as Format E Diff
   */
  protected serializeDirtyAsDiff(): string {
    const operations: Operation[] = [];

    // Dirty nodes
    for (const nodeId of this.state.dirtyNodeIds) {
      const node = this.state.nodes.get(nodeId);
      if (node) {
        operations.push({
          type: 'add_node',
          semanticId: nodeId,
          node,
        });
      }
    }

    // Dirty edges
    for (const edgeKey of this.state.dirtyEdgeIds) {
      const edge = this.state.edges.get(edgeKey);
      if (edge) {
        operations.push({
          type: 'add_edge',
          semanticId: edgeKey,
          edge,
        });
      }
    }

    return this.parser.serializeDiff({
      baseSnapshot: `${this.systemId}@v${this.state.version}`,
      viewContext: this.state.currentView,
      operations,
    });
  }

  /**
   * Validate diff before application
   */
  protected validateDiff(diff: any): {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check base snapshot
    if (!diff.baseSnapshot) {
      errors.push('Missing base snapshot');
    }

    // Validate operations
    for (const op of diff.operations || []) {
      if (!op.type) {
        errors.push('Operation missing type');
      }

      if (!op.semanticId) {
        errors.push('Operation missing semantic ID');
      }

      // Validate node operations
      if (op.type === 'add_node') {
        if (!op.node) {
          errors.push('add_node operation missing node data');
        } else {
          // Check semantic ID format
          if (!this.isValidSemanticId(op.node.semanticId)) {
            errors.push(`Invalid semantic ID format: ${op.node.semanticId}`);
          }
        }
      }

      // Validate edge operations
      if (op.type === 'add_edge') {
        if (!op.edge) {
          errors.push('add_edge operation missing edge data');
        } else {
          // Check source/target exist
          if (!this.state.nodes.has(op.edge.sourceId)) {
            warnings.push(`Source node not found: ${op.edge.sourceId}`);
          }
          if (!this.state.nodes.has(op.edge.targetId)) {
            warnings.push(`Target node not found: ${op.edge.targetId}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate semantic ID format: {Name}.{TypeAbbr}.{Counter}
   */
  private isValidSemanticId(semanticId: string): boolean {
    // Format: Name.TYPE.NNN (e.g., TestSystem.SY.001)
    const pattern = /^[A-Za-z0-9]+\.[A-Z]{2,6}\.\d{3,}$/;
    return pattern.test(semanticId);
  }

  /**
   * Clear subclass dirty tracking
   */
  protected clearSubclassDirtyTracking(): void {
    this.state.dirtyNodeIds.clear();
    this.state.dirtyEdgeIds.clear();
  }

  /**
   * Save batch to Neo4j
   */
  protected async saveBatch(items: unknown[]): Promise<void> {
    if (!this.neo4jClient) {
      throw new Error(
        'Cannot persist graph data: Neo4jClient not configured. ' +
        'Provide a Neo4jClient instance in GraphCanvas constructor to enable persistence.'
      );
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    for (const item of items) {
      if (this.state.nodes.has(item as string)) {
        nodes.push(this.state.nodes.get(item as string)!);
      }
      if (this.state.edges.has(item as string)) {
        edges.push(this.state.edges.get(item as string)!);
      }
    }

    if (nodes.length > 0) {
      await this.neo4jClient.saveNodes(nodes);
    }
    if (edges.length > 0) {
      await this.neo4jClient.saveEdges(edges);
    }
  }

  /**
   * Create audit log
   */
  protected async createAuditLog(log: {
    chatId: string;
    diff: string;
    action: string;
  }): Promise<void> {
    if (!this.neo4jClient) {
      throw new Error(
        'Cannot create audit log: Neo4jClient not configured. ' +
        'Provide a Neo4jClient instance in GraphCanvas constructor to enable audit logging.'
      );
    }

    await this.neo4jClient.createAuditLog({
      chatId: log.chatId,
      workspaceId: this.workspaceId,
      systemId: this.systemId,
      userId: this.userId,
      action: log.action as any,
      diff: log.diff,
    });
  }
}
