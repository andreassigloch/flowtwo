/**
 * Stateless Graph Canvas (CR-032)
 *
 * A stateless canvas that delegates all data operations to UnifiedAgentDBService.
 * This is the reference implementation for the Unified Data Layer architecture.
 *
 * Key Changes from GraphCanvas:
 * - NO private state Maps (nodes, edges)
 * - NO dirty tracking (AgentDB handles it)
 * - All reads/writes go through AgentDB
 * - View transformations only (zoom, focus, currentView)
 *
 * @author andreas@siglochconsulting
 */

import { EventEmitter } from 'events';
import { Node, Edge, SemanticId, GraphState } from '../shared/types/ontology.js';
import { Operation, GraphCanvasState, FormatEDiff, DiffResult, PersistResult } from '../shared/types/canvas.js';
import { FormatEParser } from '../shared/parsers/format-e-parser.js';
import { IFormatEParser } from '../shared/types/format-e.js';
import { UnifiedAgentDBService } from '../llm-engine/agentdb/unified-agentdb-service.js';
import { DuplicateSemanticIdError, DuplicateEdgeError, NodeNotFoundError } from '../llm-engine/agentdb/errors.js';
import type { SetOptions } from '../llm-engine/agentdb/graph-store.js';

/**
 * View-only state (Canvas manages this, not AgentDB)
 */
interface ViewState {
  currentView: string;
  focus?: SemanticId;
  zoom?: number;
}

/**
 * Stateless Graph Canvas
 *
 * Delegates all graph CRUD to UnifiedAgentDBService.
 * Only maintains view state locally.
 */
export class StatelessGraphCanvas extends EventEmitter {
  private agentDB: UnifiedAgentDBService;
  private parser: IFormatEParser;
  private viewState: ViewState;

  // Metadata (immutable after construction)
  private readonly workspaceId: string;
  private readonly systemId: string;
  private readonly chatId: string;
  private readonly userId: string;

  constructor(
    agentDB: UnifiedAgentDBService,
    workspaceId: string,
    systemId: string,
    chatId: string,
    userId: string,
    currentView: string = 'hierarchy'
  ) {
    super();
    this.agentDB = agentDB;
    this.parser = new FormatEParser();
    this.workspaceId = workspaceId;
    this.systemId = systemId;
    this.chatId = chatId;
    this.userId = userId;

    this.viewState = {
      currentView,
      focus: undefined,
      zoom: 1.0,
    };

    // Subscribe to AgentDB changes for UI updates
    this.agentDB.onGraphChange((event) => {
      this.emit('graphChange', event);
    });
  }

  // ============================================================
  // Read Operations (delegate to AgentDB)
  // ============================================================

  /**
   * Get current graph state (read-only, fetched from AgentDB)
   */
  getState(): Readonly<GraphCanvasState> {
    const graphState = this.agentDB.toGraphState();

    return {
      ...graphState,
      currentView: this.viewState.currentView,
      focus: this.viewState.focus,
      zoom: this.viewState.zoom,
    };
  }

  /**
   * Get node by semantic ID
   */
  getNode(semanticId: SemanticId): Node | undefined {
    return this.agentDB.getNode(semanticId) ?? undefined;
  }

  /**
   * Get all nodes
   */
  getAllNodes(): Node[] {
    return this.agentDB.getNodes();
  }

  /**
   * Get edge by composite key
   */
  getEdge(key: string): Edge | undefined {
    // key format: sourceId-type-targetId
    const parts = key.split('-');
    if (parts.length < 3) return undefined;

    // Type could be multi-character, so we need to find it
    // Format: Source.XX.001-type-Target.XX.001
    // Find the type by looking for known edge types
    const knownTypes = ['io', 'compose', 'satisfy', 'verify', 'allocate', 'relation'];

    for (const edgeType of knownTypes) {
      const typeIndex = key.indexOf(`-${edgeType}-`);
      if (typeIndex !== -1) {
        const sourceId = key.substring(0, typeIndex);
        const targetId = key.substring(typeIndex + edgeType.length + 2);
        const edge = this.agentDB.getEdgeByKey(sourceId, edgeType, targetId);
        if (edge) return edge;
      }
    }

    return undefined;
  }

  /**
   * Get all edges
   */
  getAllEdges(): Edge[] {
    return this.agentDB.getEdges();
  }

  /**
   * Get edges for a specific node
   */
  getNodeEdges(semanticId: SemanticId, direction?: 'in' | 'out'): Edge[] {
    return this.agentDB.getNodeEdges(semanticId, direction);
  }

  /**
   * Get graph version
   */
  getVersion(): number {
    return this.agentDB.getGraphVersion();
  }

  // ============================================================
  // View State (managed locally)
  // ============================================================

  /**
   * Get current view name
   */
  getCurrentView(): string {
    return this.viewState.currentView;
  }

  /**
   * Switch to different view
   */
  setCurrentView(viewName: string): void {
    this.viewState.currentView = viewName;
    this.emit('viewChange', { view: viewName });
  }

  /**
   * Get focus node
   */
  getFocus(): SemanticId | undefined {
    return this.viewState.focus;
  }

  /**
   * Set focus node
   */
  setFocus(semanticId: SemanticId | undefined): void {
    this.viewState.focus = semanticId;
    this.emit('focusChange', { semanticId });
  }

  /**
   * Get canvas zoom
   */
  getZoom(): number {
    return this.viewState.zoom ?? 1.0;
  }

  /**
   * Set canvas zoom
   */
  setZoom(zoom: number): void {
    this.viewState.zoom = zoom;
    this.emit('zoomChange', { zoom });
  }

  // ============================================================
  // Write Operations (delegate to AgentDB)
  // ============================================================

  /**
   * Apply Format E Diff to graph state
   *
   * Delegates all operations to AgentDB.
   */
  async applyDiff(diff: FormatEDiff): Promise<DiffResult> {
    const affectedIds: SemanticId[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const op of diff.operations) {
      try {
        await this.applyOperation(op);
        affectedIds.push(op.semanticId);
      } catch (error) {
        if (error instanceof DuplicateSemanticIdError) {
          errors.push(`Duplicate node: ${error.semanticId}`);
        } else if (error instanceof DuplicateEdgeError) {
          errors.push(`Duplicate edge: ${error.sourceId} -> ${error.targetId}`);
        } else if (error instanceof NodeNotFoundError) {
          errors.push(`Node not found: ${error.semanticId}`);
        } else {
          errors.push(error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        affectedIds,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    // Emit update event
    this.emit('diffApplied', { diff, affectedIds });

    return {
      success: true,
      affectedIds,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Apply single operation
   */
  private async applyOperation(op: Operation): Promise<void> {
    const options: SetOptions = { upsert: false }; // Strict mode by default

    switch (op.type) {
      case 'add_node':
        if (op.node) {
          this.agentDB.setNode(op.node, options);
        }
        break;

      case 'remove_node':
        this.agentDB.deleteNode(op.semanticId);
        break;

      case 'update_node':
        if (op.updates) {
          const existing = this.agentDB.getNode(op.semanticId);
          if (existing) {
            const updated: Node = {
              ...existing,
              ...op.updates,
              updatedAt: new Date(),
            } as Node;
            this.agentDB.setNode(updated, { upsert: true });
          }
        }
        break;

      case 'add_edge':
        if (op.edge) {
          this.agentDB.setEdge(op.edge, options);
        }
        break;

      case 'remove_edge':
        if (op.edge) {
          // Find and delete by composite key
          const existing = this.agentDB.getEdgeByKey(
            op.edge.sourceId,
            op.edge.type,
            op.edge.targetId
          );
          if (existing) {
            this.agentDB.deleteEdge(existing.uuid);
          }
        }
        break;
    }
  }

  /**
   * Add node with upsert option
   */
  setNode(node: Node, options?: SetOptions): void {
    this.agentDB.setNode(node, options);
  }

  /**
   * Delete node
   */
  deleteNode(semanticId: SemanticId): boolean {
    return this.agentDB.deleteNode(semanticId);
  }

  /**
   * Add edge with upsert option
   */
  setEdge(edge: Edge, options?: SetOptions): void {
    this.agentDB.setEdge(edge, options);
  }

  /**
   * Delete edge
   */
  deleteEdge(uuid: string): boolean {
    return this.agentDB.deleteEdge(uuid);
  }

  // ============================================================
  // Persistence (AgentDB handles dirty tracking)
  // ============================================================

  /**
   * Persist to Neo4j is now handled by AgentDB's persistence layer.
   * This method exists for API compatibility.
   */
  async persistToNeo4j(_force: boolean = false): Promise<PersistResult> {
    // In the unified data layer, persistence is managed by AgentDB
    // This stub returns success for compatibility
    return {
      success: true,
      savedCount: 0,
      skipped: true,
    };
  }

  /**
   * Get dirty IDs - empty since we don't track dirty state
   */
  getDirtyIds(): ReadonlySet<string> {
    return new Set();
  }

  // ============================================================
  // Serialization
  // ============================================================

  /**
   * Serialize current state as Format E
   */
  serializeState(viewContext?: string): string {
    return this.parser.serializeGraph(this.agentDB.toGraphState(), viewContext);
  }

  /**
   * Load state from GraphState
   */
  loadFromState(state: GraphState): void {
    this.agentDB.loadFromState(state);
  }

  /**
   * Clear graph
   */
  clear(): void {
    this.agentDB.clearGraph();
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

  getChatId(): string {
    return this.chatId;
  }

  getUserId(): string {
    return this.userId;
  }
}
