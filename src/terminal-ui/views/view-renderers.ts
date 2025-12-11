/**
 * View Renderers - ASCII graph visualization orchestrator
 *
 * Main entry point that delegates to specialized view modules.
 *
 * @author andreas@siglochconsulting
 */

import type { ViewType } from '../../shared/types/view.js';
import { DEFAULT_VIEW_CONFIGS } from '../../shared/types/view.js';

// Re-export types and utilities
export type { GraphState } from './view-utils.js';
export { getNodeColor } from './view-utils.js';

// Import view renderers
import type { GraphState } from './view-utils.js';
import {
  renderHierarchyView,
  renderAllocationView,
  renderRequirementsView,
  renderUseCaseView,
} from './basic-views.js';
import { renderSpecView, renderSpecPlusView, renderFchainView } from './spec-views.js';
import { renderArchitectureView, renderFunctionalNetworkView } from './mermaid-views.js';

/**
 * Generate ASCII graph visualization
 */
export async function generateAsciiGraph(
  state: GraphState,
  currentView: ViewType,
  systemId: string
): Promise<string> {
  const lines: string[] = [];

  if (state.nodes.size === 0) {
    return '\x1b[90m(No nodes in graph yet - send a message in CHAT terminal)\x1b[0m';
  }

  const viewConfig = DEFAULT_VIEW_CONFIGS[currentView];
  if (!viewConfig) {
    return `\x1b[33m\u274c Unknown view: ${currentView}\x1b[0m`;
  }

  // Header
  lines.push(`\x1b[1;36mGraph:\x1b[0m ${systemId}`);
  lines.push(`\x1b[1;36mView:\x1b[0m ${viewConfig.name}`);
  lines.push(`\x1b[1;36mNodes:\x1b[0m ${state.nodes.size} | \x1b[1;36mEdges:\x1b[0m ${state.edges.size}`);

  // CR-033: Show change summary if tracking is active
  if (state.nodeChangeStatus && state.nodeChangeStatus.size > 0) {
    let added = 0, modified = 0, deleted = 0;
    for (const status of state.nodeChangeStatus.values()) {
      if (status === 'added') added++;
      else if (status === 'modified') modified++;
      else if (status === 'deleted') deleted++;
    }
    const total = added + modified + deleted;
    if (total > 0) {
      const parts: string[] = [];
      if (added > 0) parts.push(`\x1b[32m+${added}\x1b[0m`);
      if (modified > 0) parts.push(`\x1b[33m~${modified}\x1b[0m`);
      if (deleted > 0) parts.push(`\x1b[31m-${deleted}\x1b[0m`);
      lines.push(`\x1b[1;36mChanges:\x1b[0m ${parts.join(' ')}`);
    }
  }
  lines.push('');

  switch (currentView) {
    case 'hierarchy':
      lines.push(...renderHierarchyView(state, viewConfig));
      break;
    case 'allocation':
      lines.push(...renderAllocationView(state, viewConfig));
      break;
    case 'requirements':
      lines.push(...renderRequirementsView(state, viewConfig));
      break;
    case 'use-case':
      lines.push(...renderUseCaseView(state, viewConfig));
      break;
    case 'spec':
      lines.push(...renderSpecView(state, viewConfig));
      break;
    case 'spec+':
      lines.push(...renderSpecPlusView(state, viewConfig));
      break;
    case 'architecture':
      lines.push(...await renderArchitectureView(state, viewConfig));
      break;
    case 'functional-flow':
      lines.push('\x1b[33m\u26a0\ufe0f  Functional-flow view not yet implemented in ASCII\x1b[0m');
      lines.push('\x1b[90m(This view requires graphical rendering - use Web-UI)\x1b[0m');
      break;
    case 'functional-network':
      lines.push(...await renderFunctionalNetworkView(state, viewConfig));
      break;
    case 'fchain':
      lines.push(...renderFchainView(state, viewConfig));
      break;
    default:
      lines.push(`\x1b[33m\u26a0\ufe0f  View "${currentView}" not implemented in ASCII renderer\x1b[0m`);
  }

  return lines.join('\n');
}
