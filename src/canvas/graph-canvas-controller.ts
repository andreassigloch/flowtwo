/**
 * Graph Canvas Controller - Interaction State Management
 *
 * CR-038 Phase 9: Separates interaction state (view, filters, selection)
 * from pure rendering logic.
 *
 * Key Responsibilities:
 * - Manages current view mode
 * - Handles filter configuration
 * - Tracks node selection and focus
 * - Delegates rendering to GraphCanvasRenderer
 * - Generates Format E operations from user edits (GUI-ready)
 *
 * @author andreas@siglochconsulting
 */

import { UnifiedAgentDBService } from '../llm-engine/agentdb/unified-agentdb-service.js';
import { GraphCanvasRenderer, RenderData, RenderOptions } from './graph-canvas-renderer.js';

// ============================================================
// Types
// ============================================================

export type ViewId =
  | 'hierarchy'
  | 'allocation'
  | 'traceability'
  | 'dependency'
  | 'fchain'
  | 'all';

export interface FilterConfig {
  nodeTypes?: string[];
  phase?: number;
  showDeleted?: boolean;
  searchTerm?: string;
}

export interface UserEdit {
  type: 'add-node' | 'update-node' | 'delete-node' | 'add-edge' | 'delete-edge';
  nodeType?: string;
  nodeId?: string;
  label?: string;
  properties?: Record<string, unknown>;
  source?: string;
  target?: string;
  edgeType?: string;
}

export interface FormatEOperation {
  type: 'NODE' | 'EDGE' | 'DELETE';
  operation: 'ADD' | 'UPDATE' | 'DELETE';
  data: Record<string, unknown>;
}

// ============================================================
// Graph Canvas Controller
// ============================================================

export class GraphCanvasController {
  // View state
  private currentView: ViewId = 'hierarchy';
  private filters: FilterConfig = {};
  private selection: Set<string> = new Set();
  private focusNodeId: string | null = null;

  // Renderer (stateless)
  private renderer: GraphCanvasRenderer;

  constructor(private agentDB: UnifiedAgentDBService) {
    this.renderer = new GraphCanvasRenderer();
  }

  // ============================================================
  // Command Handling
  // ============================================================

  /**
   * Handle view/filter commands from user
   */
  handleCommand(command: string, args: string[]): boolean {
    switch (command) {
      case '/view':
        return this.handleViewCommand(args);

      case '/filter':
        return this.handleFilterCommand(args);

      case '/select':
        return this.handleSelectCommand(args);

      case '/focus':
        return this.handleFocusCommand(args);

      case '/clear-filter':
        this.filters = {};
        return true;

      case '/clear-selection':
        this.selection.clear();
        this.focusNodeId = null;
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle /view command
   */
  private handleViewCommand(args: string[]): boolean {
    const viewArg = args[0]?.toLowerCase();

    const viewMap: Record<string, ViewId> = {
      hierarchy: 'hierarchy',
      h: 'hierarchy',
      allocation: 'allocation',
      alloc: 'allocation',
      a: 'allocation',
      traceability: 'traceability',
      trace: 'traceability',
      t: 'traceability',
      dependency: 'dependency',
      dep: 'dependency',
      d: 'dependency',
      fchain: 'fchain',
      f: 'fchain',
      all: 'all',
    };

    const newView = viewMap[viewArg];
    if (newView) {
      this.currentView = newView;
      return true;
    }

    return false;
  }

  /**
   * Handle /filter command
   */
  private handleFilterCommand(args: string[]): boolean {
    if (args.length === 0) {
      return false;
    }

    // Parse filter arguments
    for (const arg of args) {
      if (arg.startsWith('type:')) {
        const types = arg.substring(5).split(',');
        this.filters.nodeTypes = types.map((t) => t.toUpperCase());
      } else if (arg.startsWith('phase:')) {
        this.filters.phase = parseInt(arg.substring(6), 10);
      } else if (arg === 'deleted' || arg === 'show-deleted') {
        this.filters.showDeleted = true;
      } else if (arg.startsWith('search:')) {
        this.filters.searchTerm = arg.substring(7);
      } else {
        // Treat as search term
        this.filters.searchTerm = arg;
      }
    }

    return true;
  }

  /**
   * Handle /select command
   */
  private handleSelectCommand(args: string[]): boolean {
    if (args.length === 0) {
      this.selection.clear();
      return true;
    }

    // Toggle selection
    for (const nodeId of args) {
      if (this.selection.has(nodeId)) {
        this.selection.delete(nodeId);
      } else {
        this.selection.add(nodeId);
      }
    }

    return true;
  }

  /**
   * Handle /focus command
   */
  private handleFocusCommand(args: string[]): boolean {
    if (args.length === 0) {
      this.focusNodeId = null;
    } else {
      this.focusNodeId = args[0];
    }
    return true;
  }

  // ============================================================
  // View Configuration
  // ============================================================

  /**
   * Get current view configuration
   */
  getViewConfig(): { view: ViewId; filters: FilterConfig } {
    return {
      view: this.currentView,
      filters: { ...this.filters },
    };
  }

  /**
   * Set view directly
   */
  setView(view: ViewId): void {
    this.currentView = view;
  }

  /**
   * Set filters directly
   */
  setFilters(filters: FilterConfig): void {
    this.filters = { ...filters };
  }

  /**
   * Get current selection
   */
  getSelection(): Set<string> {
    return new Set(this.selection);
  }

  /**
   * Get focus node
   */
  getFocusNode(): string | null {
    return this.focusNodeId;
  }

  // ============================================================
  // Rendering
  // ============================================================

  /**
   * Render current view
   */
  render(): RenderData {
    const nodes = this.agentDB.getNodes();
    const edges = this.agentDB.getEdges();

    const options: RenderOptions = {
      view: this.currentView,
      filters: this.filters,
      selection: this.selection,
      focusNodeId: this.focusNodeId,
    };

    return this.renderer.render(nodes, edges, options);
  }

  /**
   * Render with custom options (for specific requests)
   */
  renderWithOptions(options: Partial<RenderOptions>): RenderData {
    const nodes = this.agentDB.getNodes();
    const edges = this.agentDB.getEdges();

    const fullOptions: RenderOptions = {
      view: options.view || this.currentView,
      filters: options.filters || this.filters,
      selection: options.selection || this.selection,
      focusNodeId: options.focusNodeId || this.focusNodeId,
    };

    return this.renderer.render(nodes, edges, fullOptions);
  }

  // ============================================================
  // User Edit Handling (GUI-Ready)
  // ============================================================

  /**
   * Handle user edit and generate Format E operations
   *
   * This prepares the controller for future GUI integration
   * where user actions in a visual editor generate graph operations.
   */
  handleUserEdit(edit: UserEdit): FormatEOperation[] {
    return this.renderer.generateOperations(edit);
  }

  /**
   * Preview edit without applying
   */
  previewEdit(_edit: UserEdit): RenderData {
    // For now, just show current state
    // In future, could show a preview with the edit applied
    return this.render();
  }

  // ============================================================
  // State Queries
  // ============================================================

  /**
   * Get available views
   */
  getAvailableViews(): ViewId[] {
    return ['hierarchy', 'allocation', 'traceability', 'dependency', 'fchain', 'all'];
  }

  /**
   * Get filter summary string
   */
  getFilterSummary(): string {
    const parts: string[] = [];

    if (this.filters.nodeTypes?.length) {
      parts.push(`types: ${this.filters.nodeTypes.join(',')}`);
    }
    if (this.filters.phase !== undefined) {
      parts.push(`phase: ${this.filters.phase}`);
    }
    if (this.filters.showDeleted) {
      parts.push('show-deleted');
    }
    if (this.filters.searchTerm) {
      parts.push(`search: ${this.filters.searchTerm}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'none';
  }

  /**
   * Get selection summary string
   */
  getSelectionSummary(): string {
    if (this.selection.size === 0) {
      return 'none';
    }
    return `${this.selection.size} nodes: ${Array.from(this.selection).join(', ')}`;
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a Graph Canvas Controller for an AgentDB instance
 */
export function createGraphCanvasController(
  agentDB: UnifiedAgentDBService
): GraphCanvasController {
  return new GraphCanvasController(agentDB);
}
