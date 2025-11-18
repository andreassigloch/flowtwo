/**
 * Graph Engine Service
 *
 * Orchestrates view filtering, port extraction, and layout computation
 *
 * Usage:
 *   const engine = new GraphEngine();
 *   const result = await engine.computeLayout(graphState, 'hierarchy');
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { GraphState } from '../shared/types/ontology.js';
import { ViewType, ViewConfig, DEFAULT_VIEW_CONFIGS } from '../shared/types/view.js';
import { LayoutResult } from '../shared/types/layout.js';
import { ViewFilter } from './view-filter.js';
import { PortExtractor } from './port-extractor.js';
import { ReingoldTilfordLayout } from './reingold-tilford.js';

/**
 * Graph Engine
 *
 * Main service that coordinates:
 * 1. View filtering (layout vs render)
 * 2. Port extraction from FLOW nodes
 * 3. Layout algorithm execution
 * 4. Result aggregation
 */
export class GraphEngine {
  private viewConfigs: Map<ViewType, ViewConfig>;

  constructor(customViewConfigs?: Map<ViewType, ViewConfig>) {
    // Use custom configs or defaults
    this.viewConfigs = customViewConfigs || new Map(Object.entries(DEFAULT_VIEW_CONFIGS)) as Map<ViewType, ViewConfig>;
  }

  /**
   * Compute layout for a specific view
   *
   * @param graph - Graph state
   * @param viewType - View to render (hierarchy, functional-flow, etc.)
   * @returns Layout result with positions and ports
   */
  async computeLayout(graph: GraphState, viewType: ViewType): Promise<LayoutResult> {
    // 1. Get view configuration
    const viewConfig = this.viewConfigs.get(viewType);
    if (!viewConfig) {
      throw new Error(`View configuration not found: ${viewType}`);
    }

    // 2. Apply view filter (layout filter)
    const viewFilter = new ViewFilter(viewConfig);
    const filteredGraph = viewFilter.applyLayoutFilter(graph);

    // 3. Extract ports from FLOW nodes
    const portExtractor = new PortExtractor();
    const ports = portExtractor.extractAllPorts({
      ...graph,
      nodes: filteredGraph.nodes,
      edges: filteredGraph.edges,
    });

    // 4. Compute layout based on algorithm
    const layoutAlgorithm = viewConfig.layoutConfig.algorithm;
    let layoutResult: LayoutResult;

    switch (layoutAlgorithm) {
      case 'reingold-tilford':
        const rtLayout = new ReingoldTilfordLayout(viewConfig.layoutConfig.parameters);
        layoutResult = rtLayout.compute({
          ...graph,
          nodes: filteredGraph.nodes,
          edges: filteredGraph.edges,
        });
        break;

      case 'sugiyama':
        // TODO: Implement Sugiyama layered graph layout
        throw new Error('Sugiyama layout not yet implemented (Phase 3)');

      case 'orthogonal':
        // TODO: Implement orthogonal layout
        throw new Error('Orthogonal layout not yet implemented (Phase 3)');

      case 'treemap':
        // TODO: Implement treemap layout
        throw new Error('Treemap layout not yet implemented (Phase 3)');

      case 'radial':
        // TODO: Implement radial layout
        throw new Error('Radial layout not yet implemented (Phase 3)');

      default:
        throw new Error(`Unknown layout algorithm: ${layoutAlgorithm}`);
    }

    // 5. Merge ports into layout result
    layoutResult.ports = ports;

    return layoutResult;
  }

  /**
   * Get view configuration
   */
  getViewConfig(viewType: ViewType): ViewConfig | undefined {
    return this.viewConfigs.get(viewType);
  }

  /**
   * Get all view configurations
   */
  getAllViewConfigs(): ViewConfig[] {
    return Array.from(this.viewConfigs.values());
  }

  /**
   * Set custom view configuration
   */
  setViewConfig(viewType: ViewType, config: ViewConfig): void {
    this.viewConfigs.set(viewType, config);
  }
}
