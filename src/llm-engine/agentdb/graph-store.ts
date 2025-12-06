/**
 * Graph Store - Single Source of Truth for Graph Data
 *
 * Provides CRUD operations for nodes and edges with:
 * - Uniqueness constraints (no duplicate semanticIds or edge keys)
 * - Version tracking with monotonic counter
 * - Change notification system for cache invalidation
 * - In-memory storage with O(1) access
 *
 * Part of CR-032: Unified Data Layer Architecture
 *
 * @author andreas@siglochconsulting
 */

import { EventEmitter } from 'events';
import type { Node, Edge, SemanticId, GraphState } from '../../shared/types/ontology.js';
import { DuplicateSemanticIdError, DuplicateEdgeError, NodeNotFoundError } from './errors.js';

/**
 * Filter options for node queries
 */
export interface NodeFilter {
  workspaceId?: string;
  systemId?: string;
  type?: string | string[];
  semanticIdPrefix?: string;
}

/**
 * Filter options for edge queries
 */
export interface EdgeFilter {
  workspaceId?: string;
  systemId?: string;
  type?: string | string[];
  sourceId?: SemanticId;
  targetId?: SemanticId;
}

/**
 * Options for set operations
 */
export interface SetOptions {
  /** Allow overwriting existing entries (default: false) */
  upsert?: boolean;
}

/**
 * Graph change event payload
 */
export interface GraphChangeEvent {
  type: 'node_add' | 'node_update' | 'node_delete' | 'edge_add' | 'edge_update' | 'edge_delete';
  id: string;
  version: number;
  timestamp: number;
}

/**
 * Graph Store - In-memory graph data with CRUD and change tracking
 */
export class GraphStore extends EventEmitter {
  private nodes: Map<SemanticId, Node> = new Map();
  private edges: Map<string, Edge> = new Map();
  private edgeIndex: Map<string, Edge> = new Map(); // key: sourceId|type|targetId -> Edge
  private version = 0;
  private workspaceId: string;
  private systemId: string;

  constructor(workspaceId: string, systemId: string) {
    super();
    this.workspaceId = workspaceId;
    this.systemId = systemId;
  }

  // ============================================================
  // Version Management
  // ============================================================

  /**
   * Get current graph version (monotonically increasing)
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Subscribe to graph changes
   */
  onGraphChange(callback: (event: GraphChangeEvent) => void): () => void {
    this.on('change', callback);
    return () => this.off('change', callback);
  }

  private incrementVersion(): number {
    this.version++;
    return this.version;
  }

  private emitChange(type: GraphChangeEvent['type'], id: string): void {
    const event: GraphChangeEvent = {
      type,
      id,
      version: this.version,
      timestamp: Date.now(),
    };
    this.emit('change', event);
  }

  // ============================================================
  // Node Operations
  // ============================================================

  /**
   * Get a node by semantic ID
   */
  getNode(semanticId: SemanticId): Node | null {
    return this.nodes.get(semanticId) ?? null;
  }

  /**
   * Set a node (add or update)
   *
   * @throws DuplicateSemanticIdError if semanticId exists with different uuid (unless upsert=true)
   */
  setNode(node: Node, options?: SetOptions): void {
    const existing = this.nodes.get(node.semanticId);

    if (existing && existing.uuid !== node.uuid && !options?.upsert) {
      throw new DuplicateSemanticIdError(node.semanticId, existing.uuid, node.uuid);
    }

    const isUpdate = existing !== undefined;
    this.nodes.set(node.semanticId, {
      ...node,
      workspaceId: this.workspaceId,
      systemId: this.systemId,
      updatedAt: new Date(),
    });

    this.incrementVersion();
    this.emitChange(isUpdate ? 'node_update' : 'node_add', node.semanticId);
  }

  /**
   * Delete a node by semantic ID
   *
   * @returns true if node was deleted, false if not found
   */
  deleteNode(semanticId: SemanticId): boolean {
    const deleted = this.nodes.delete(semanticId);

    if (deleted) {
      // Remove all edges connected to this node
      const edgesToDelete: string[] = [];
      for (const [key, edge] of this.edges) {
        if (edge.sourceId === semanticId || edge.targetId === semanticId) {
          edgesToDelete.push(key);
        }
      }
      for (const key of edgesToDelete) {
        this.edges.delete(key);
        // Also remove from index
        const edge = this.edges.get(key);
        if (edge) {
          this.edgeIndex.delete(this.getEdgeIndexKey(edge));
        }
      }

      this.incrementVersion();
      this.emitChange('node_delete', semanticId);
    }

    return deleted;
  }

  /**
   * Get all nodes, optionally filtered
   */
  getNodes(filter?: NodeFilter): Node[] {
    let result = Array.from(this.nodes.values());

    if (filter) {
      if (filter.workspaceId) {
        result = result.filter((n) => n.workspaceId === filter.workspaceId);
      }
      if (filter.systemId) {
        result = result.filter((n) => n.systemId === filter.systemId);
      }
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        result = result.filter((n) => types.includes(n.type));
      }
      if (filter.semanticIdPrefix) {
        result = result.filter((n) => n.semanticId.startsWith(filter.semanticIdPrefix!));
      }
    }

    return result;
  }

  /**
   * Check if a node exists
   */
  hasNode(semanticId: SemanticId): boolean {
    return this.nodes.has(semanticId);
  }

  /**
   * Get node count
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  // ============================================================
  // Edge Operations
  // ============================================================

  /**
   * Generate index key for deduplication (sourceId|type|targetId)
   */
  private getEdgeIndexKey(edge: Edge): string {
    return `${edge.sourceId}|${edge.type}|${edge.targetId}`;
  }

  /**
   * Get an edge by UUID
   */
  getEdge(uuid: string): Edge | null {
    return this.edges.get(uuid) ?? null;
  }

  /**
   * Get an edge by composite key (sourceId, type, targetId)
   */
  getEdgeByKey(sourceId: SemanticId, type: string, targetId: SemanticId): Edge | null {
    const key = `${sourceId}|${type}|${targetId}`;
    return this.edgeIndex.get(key) ?? null;
  }

  /**
   * Set an edge (add or update)
   *
   * @throws DuplicateEdgeError if (source, type, target) exists with different uuid (unless upsert=true)
   * @throws NodeNotFoundError if source or target node doesn't exist
   */
  setEdge(edge: Edge, options?: SetOptions): void {
    // Validate source node exists
    if (!this.nodes.has(edge.sourceId)) {
      throw new NodeNotFoundError(edge.sourceId, 'edge source');
    }

    // Validate target node exists
    if (!this.nodes.has(edge.targetId)) {
      throw new NodeNotFoundError(edge.targetId, 'edge target');
    }

    const indexKey = this.getEdgeIndexKey(edge);
    const existingByIndex = this.edgeIndex.get(indexKey);

    if (existingByIndex && existingByIndex.uuid !== edge.uuid && !options?.upsert) {
      throw new DuplicateEdgeError(
        edge.sourceId,
        edge.targetId,
        edge.type,
        existingByIndex.uuid,
        edge.uuid
      );
    }

    const existingByUuid = this.edges.get(edge.uuid);
    const isUpdate = existingByUuid !== undefined;

    // If upsert and replacing by index, remove old edge first
    if (existingByIndex && existingByIndex.uuid !== edge.uuid && options?.upsert) {
      this.edges.delete(existingByIndex.uuid);
    }

    const updatedEdge: Edge = {
      ...edge,
      workspaceId: this.workspaceId,
      systemId: this.systemId,
      updatedAt: new Date(),
    };

    this.edges.set(edge.uuid, updatedEdge);
    this.edgeIndex.set(indexKey, updatedEdge);

    this.incrementVersion();
    this.emitChange(isUpdate ? 'edge_update' : 'edge_add', edge.uuid);
  }

  /**
   * Delete an edge by UUID
   *
   * @returns true if edge was deleted, false if not found
   */
  deleteEdge(uuid: string): boolean {
    const edge = this.edges.get(uuid);
    if (!edge) {
      return false;
    }

    this.edges.delete(uuid);
    this.edgeIndex.delete(this.getEdgeIndexKey(edge));

    this.incrementVersion();
    this.emitChange('edge_delete', uuid);

    return true;
  }

  /**
   * Delete an edge by composite key
   *
   * @returns true if edge was deleted, false if not found
   */
  deleteEdgeByKey(sourceId: SemanticId, type: string, targetId: SemanticId): boolean {
    const key = `${sourceId}|${type}|${targetId}`;
    const edge = this.edgeIndex.get(key);
    if (!edge) {
      return false;
    }

    return this.deleteEdge(edge.uuid);
  }

  /**
   * Get all edges, optionally filtered
   */
  getEdges(filter?: EdgeFilter): Edge[] {
    let result = Array.from(this.edges.values());

    if (filter) {
      if (filter.workspaceId) {
        result = result.filter((e) => e.workspaceId === filter.workspaceId);
      }
      if (filter.systemId) {
        result = result.filter((e) => e.systemId === filter.systemId);
      }
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        result = result.filter((e) => types.includes(e.type));
      }
      if (filter.sourceId) {
        result = result.filter((e) => e.sourceId === filter.sourceId);
      }
      if (filter.targetId) {
        result = result.filter((e) => e.targetId === filter.targetId);
      }
    }

    return result;
  }

  /**
   * Get edges connected to a node
   */
  getNodeEdges(semanticId: SemanticId, direction?: 'in' | 'out'): Edge[] {
    return this.getEdges().filter((e) => {
      if (direction === 'in') {
        return e.targetId === semanticId;
      }
      if (direction === 'out') {
        return e.sourceId === semanticId;
      }
      return e.sourceId === semanticId || e.targetId === semanticId;
    });
  }

  /**
   * Check if an edge exists
   */
  hasEdge(uuid: string): boolean {
    return this.edges.has(uuid);
  }

  /**
   * Check if an edge exists by composite key
   */
  hasEdgeByKey(sourceId: SemanticId, type: string, targetId: SemanticId): boolean {
    return this.edgeIndex.has(`${sourceId}|${type}|${targetId}`);
  }

  /**
   * Get edge count
   */
  getEdgeCount(): number {
    return this.edges.size;
  }

  // ============================================================
  // Bulk Operations
  // ============================================================

  /**
   * Load graph data from a GraphState object (typically from Neo4j)
   * Clears existing data and replaces with new state
   *
   * Accepts either:
   * - Full GraphState with Maps
   * - Simplified state with arrays { nodes: Node[], edges: Edge[] }
   */
  loadFromState(state: GraphState | { nodes: Node[]; edges: Edge[] }): void {
    this.clear();

    // Handle full GraphState
    if ('workspaceId' in state) {
      this.workspaceId = state.workspaceId;
      this.systemId = state.systemId;
    }

    // Handle both Map and Array formats
    const nodes = state.nodes instanceof Map
      ? Array.from(state.nodes.values())
      : state.nodes;

    const edges = state.edges instanceof Map
      ? Array.from(state.edges.values())
      : state.edges;

    // Load nodes
    for (const node of nodes) {
      this.nodes.set(node.semanticId, node);
    }

    // Load edges (with index)
    for (const edge of edges) {
      this.edges.set(edge.uuid, edge);
      this.edgeIndex.set(this.getEdgeIndexKey(edge), edge);
    }

    // Use state version if provided, otherwise keep current
    if ('version' in state && typeof state.version === 'number') {
      this.version = state.version;
    }

    this.emit('loaded', { nodeCount: this.nodes.size, edgeCount: this.edges.size });
  }

  /**
   * Export graph data as GraphState object
   */
  toGraphState(): GraphState {
    return {
      workspaceId: this.workspaceId,
      systemId: this.systemId,
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      ports: new Map(), // Ports derived from FLOW nodes
      version: this.version,
      lastSavedVersion: this.version,
      lastModified: new Date(),
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.edgeIndex.clear();
    this.incrementVersion();
    this.emit('cleared');
  }

  // ============================================================
  // Metadata
  // ============================================================

  getWorkspaceId(): string {
    return this.workspaceId;
  }

  getSystemId(): string {
    return this.systemId;
  }

  /**
   * Get store statistics
   */
  getStats(): { nodeCount: number; edgeCount: number; version: number } {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      version: this.version,
    };
  }
}
