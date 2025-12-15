/**
 * Basic Views - Hierarchy, Allocation, Requirements, Use-Case view renderers
 *
 * CR-033: Added change indicator support (+/-/~)
 *
 * @author andreas@siglochconsulting
 */

import type { GraphState } from './view-utils.js';
import { getNodeColor, getChangeIndicator } from './view-utils.js';

/**
 * Render hierarchy view (tree using compose edges)
 * Allows nodes to appear multiple times if composed into multiple parents
 * (same behavior as spec/spec+ views)
 */
export function renderHierarchyView(state: GraphState, viewConfig: any): string[] {
  const lines: string[] = [];
  const { includeNodeTypes, includeEdgeTypes } = viewConfig.layoutConfig;

  // Track visited paths (not nodes) to allow multiple occurrences
  const visitedPaths = new Set<string>();

  function renderNode(
    nodeId: string,
    path: string,
    indent: string = '',
    isLast: boolean = true,
    isRoot: boolean = false
  ): void {
    // Path-based dedup: same node can appear under different parents
    if (visitedPaths.has(path)) return;
    visitedPaths.add(path);

    const node = state.nodes.get(nodeId);
    if (!node || !includeNodeTypes.includes(node.type)) return;

    const color = getNodeColor(node.type);
    const changeInd = getChangeIndicator(nodeId, state.nodeChangeStatus);

    if (isRoot) {
      lines.push(`${changeInd}[${color}${node.type}\x1b[0m] ${node.name}`);
    } else {
      const prefix = isLast ? '\u2514\u2500' : '\u251c\u2500';
      lines.push(`${indent}${prefix}${changeInd}[${color}${node.type}\x1b[0m] ${node.name}`);
    }

    const childEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === nodeId && includeEdgeTypes.includes(e.type)
    );
    const childIndent = isRoot ? '' : indent + (isLast ? '  ' : '\u2502 ');

    childEdges.forEach((edge: any, idx: number) => {
      const childNode = state.nodes.get(edge.targetId);
      if (!childNode) return;
      const childPath = `${path}/${childNode.name}`;
      const childIsLast = idx === childEdges.length - 1;
      renderNode(edge.targetId, childPath, childIndent, childIsLast, false);
    });
  }

  const rootNodes = Array.from(state.nodes.values()).filter((node: any) => {
    if (!includeNodeTypes.includes(node.type)) return false;
    const hasIncoming = Array.from(state.edges.values()).some(
      (e: any) => e.targetId === node.semanticId && includeEdgeTypes.includes(e.type)
    );
    return !hasIncoming;
  });

  if (rootNodes.length > 0) {
    rootNodes.forEach((root: any) => renderNode(root.semanticId, root.name, '', true, true));
  } else {
    lines.push('\x1b[90m(No root nodes found for hierarchy view)\x1b[0m');
  }

  return lines;
}

/**
 * Render allocation view (modules containing functions)
 */
export function renderAllocationView(state: GraphState, _viewConfig: any): string[] {
  const lines: string[] = [];

  const modules = Array.from(state.nodes.values()).filter((n: any) => n.type === 'MOD');

  if (modules.length === 0) {
    lines.push('\x1b[90m(No modules found)\x1b[0m');
    return lines;
  }

  modules.forEach((mod: any, modIdx: number) => {
    const allocatedFuncs = Array.from(state.edges.values())
      .filter((e: any) => e.sourceId === mod.semanticId && e.type === 'allocate')
      .map((e: any) => state.nodes.get(e.targetId))
      .filter((n: any) => n && n.type === 'FUNC');

    const modColor = getNodeColor('MOD');
    const modChangeInd = getChangeIndicator(mod.semanticId, state.nodeChangeStatus);
    const boxWidth = Math.max(40, mod.name.length + 10);
    const topLine = '\u250c\u2500 ' + `${modChangeInd}[${modColor}MOD\x1b[0m] ${mod.name}` + ' ' + '\u2500'.repeat(boxWidth - mod.name.length - 10) + '\u2510';
    lines.push(topLine);

    if (allocatedFuncs.length === 0) {
      lines.push('\u2502 \x1b[90m(no functions allocated)\x1b[0m' + ' '.repeat(boxWidth - 24) + '\u2502');
    } else {
      allocatedFuncs.forEach((func: any, funcIdx: number) => {
        const funcColor = getNodeColor('FUNC');
        const funcChangeInd = getChangeIndicator(func.semanticId, state.nodeChangeStatus);
        const isLast = funcIdx === allocatedFuncs.length - 1;
        const prefix = isLast ? '\u2514\u2500' : '\u251c\u2500';
        lines.push(`\u2502 ${prefix}${funcChangeInd}[${funcColor}FUNC\x1b[0m] ${func.name}` + ' '.repeat(Math.max(0, boxWidth - func.name.length - 12)) + '\u2502');
      });
    }

    lines.push('\u2514' + '\u2500'.repeat(boxWidth) + '\u2518');

    if (modIdx < modules.length - 1) {
      lines.push('');
    }
  });

  return lines;
}

/**
 * Render requirements view (tree using satisfy edges)
 */
export function renderRequirementsView(state: GraphState, viewConfig: any): string[] {
  const lines: string[] = [];
  const visited = new Set<string>();
  const { includeNodeTypes } = viewConfig.layoutConfig;

  function renderNode(nodeId: string, indent: string = '', isLast: boolean = true): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = state.nodes.get(nodeId);
    if (!node || !includeNodeTypes.includes(node.type)) return;

    const prefix = isLast ? '\u2514\u2500' : '\u251c\u2500';
    const color = getNodeColor(node.type);
    const changeInd = getChangeIndicator(nodeId, state.nodeChangeStatus);
    lines.push(`${indent}${prefix}${changeInd}[${color}${node.type}\x1b[0m] ${node.name}`);

    const satisfyEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === nodeId && e.type === 'satisfy'
    );

    const verifyEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === nodeId && e.type === 'verify'
    );

    const childIndent = indent + (isLast ? '  ' : '\u2502 ');

    satisfyEdges.forEach((edge: any, idx: number) => {
      const childIsLast = idx === satisfyEdges.length - 1 && verifyEdges.length === 0;
      renderNode(edge.targetId, childIndent, childIsLast);
    });

    verifyEdges.forEach((edge: any, idx: number) => {
      const test = state.nodes.get(edge.targetId);
      if (test) {
        const childIsLast = idx === verifyEdges.length - 1;
        const testPrefix = childIsLast ? '\u2514\u2500' : '\u251c\u2500';
        const testColor = getNodeColor('TEST');
        const testChangeInd = getChangeIndicator(edge.targetId, state.nodeChangeStatus);
        lines.push(`${childIndent}${testPrefix}${testChangeInd}[${testColor}TEST\x1b[0m] ${test.name} \x1b[90m(verifies)\x1b[0m`);
      }
    });
  }

  const rootNodes = Array.from(state.nodes.values()).filter((node: any) => {
    if (!['FUNC', 'REQ'].includes(node.type)) return false;
    const hasIncoming = Array.from(state.edges.values()).some(
      (e: any) => e.targetId === node.semanticId && e.type === 'satisfy'
    );
    return !hasIncoming;
  });

  if (rootNodes.length > 0) {
    rootNodes.forEach((root: any) => renderNode(root.semanticId));
  } else {
    lines.push('\x1b[90m(No root requirements found)\x1b[0m');
  }

  return lines;
}

/**
 * Render use-case view
 */
export function renderUseCaseView(state: GraphState, _viewConfig: any): string[] {
  const lines: string[] = [];

  const useCases = Array.from(state.nodes.values()).filter((n: any) => n.type === 'UC');

  if (useCases.length === 0) {
    lines.push('\x1b[90m(No use cases found)\x1b[0m');
    return lines;
  }

  useCases.forEach((uc: any, ucIdx: number) => {
    const ucColor = getNodeColor('UC');
    const ucChangeInd = getChangeIndicator(uc.semanticId, state.nodeChangeStatus);
    lines.push(`${ucChangeInd}[${ucColor}UC\x1b[0m] ${uc.name}`);

    const parentEdge = Array.from(state.edges.values()).find(
      (e: any) => e.targetId === uc.semanticId && e.type === 'compose' &&
                  ['SYS', 'UC'].includes(state.nodes.get(e.sourceId)?.type)
    );
    if (parentEdge) {
      const parent = state.nodes.get((parentEdge as any).sourceId);
      if (parent) {
        const parentColor = getNodeColor(parent.type);
        lines.push(`  \u2191 Parent: [${parentColor}${parent.type}\x1b[0m] ${parent.name}`);
      }
    }

    const actorEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === uc.semanticId && e.type === 'compose' &&
                  state.nodes.get(e.targetId)?.type === 'ACTOR'
    );
    if (actorEdges.length > 0) {
      lines.push('  Actors:');
      actorEdges.forEach((edge: any) => {
        const actor = state.nodes.get(edge.targetId);
        if (actor) {
          const actorColor = getNodeColor('ACTOR');
          const actorChangeInd = getChangeIndicator(actor.semanticId, state.nodeChangeStatus);
          lines.push(`    - ${actorChangeInd}[${actorColor}ACTOR\x1b[0m] ${actor.name}`);
        }
      });
    }

    const reqEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === uc.semanticId && e.type === 'satisfy' &&
                  state.nodes.get(e.targetId)?.type === 'REQ'
    );
    if (reqEdges.length > 0) {
      lines.push('  Requirements:');
      reqEdges.forEach((edge: any) => {
        const req = state.nodes.get(edge.targetId);
        if (req) {
          const reqColor = getNodeColor('REQ');
          const reqChangeInd = getChangeIndicator(req.semanticId, state.nodeChangeStatus);
          lines.push(`    - ${reqChangeInd}[${reqColor}REQ\x1b[0m] ${req.name}`);
        }
      });
    }

    if (ucIdx < useCases.length - 1) {
      lines.push('');
    }
  });

  return lines;
}
