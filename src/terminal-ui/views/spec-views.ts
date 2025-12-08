/**
 * Spec Views - Specification view renderers (spec, spec+)
 *
 * CR-033: Added change indicator support (+/-/~)
 *
 * @author andreas@siglochconsulting
 */

import type { GraphState } from './view-utils.js';
import { getNodeColor, getChangeIndicator, buildOccurrenceMap, findChildOccurrences } from './view-utils.js';

/**
 * Render spec view (complete specification with multiple occurrences)
 */
export function renderSpecView(state: GraphState, viewConfig: any): string[] {
  const lines: string[] = [];
  const { includeEdgeTypes } = viewConfig.layoutConfig;
  const nestingEdgeTypes = includeEdgeTypes.filter((t: string) =>
    ['compose', 'satisfy', 'allocate'].includes(t)
  );

  const occurrenceMap = buildOccurrenceMap(state, nestingEdgeTypes);

  if (occurrenceMap.byNode.size === 0) {
    lines.push('\x1b[90m(No nodes found)\x1b[0m');
    return lines;
  }

  const rootOccurrences: any[] = [];
  for (const occurrences of occurrenceMap.byNode.values()) {
    const root = occurrences.find((occ: any) => occ.depth === 0);
    if (root) {
      rootOccurrences.push(root);
    }
  }

  rootOccurrences.forEach((rootOcc) => {
    lines.push(...renderOccurrence(rootOcc, state, occurrenceMap, '', true));
  });

  return lines;
}

/**
 * Render spec+ view (specification with inline descriptions)
 */
export function renderSpecPlusView(state: GraphState, viewConfig: any): string[] {
  const lines: string[] = [];
  const { includeEdgeTypes } = viewConfig.layoutConfig;
  const nestingEdgeTypes = includeEdgeTypes.filter((t: string) =>
    ['compose', 'satisfy', 'allocate'].includes(t)
  );

  const occurrenceMap = buildOccurrenceMap(state, nestingEdgeTypes);

  if (occurrenceMap.byNode.size === 0) {
    lines.push('\x1b[90m(No nodes found)\x1b[0m');
    return lines;
  }

  const rootOccurrences: any[] = [];
  for (const occurrences of occurrenceMap.byNode.values()) {
    const root = occurrences.find((occ: any) => occ.depth === 0);
    if (root) {
      rootOccurrences.push(root);
    }
  }

  rootOccurrences.forEach((rootOcc) => {
    lines.push(...renderOccurrenceWithDescription(rootOcc, state, occurrenceMap, '', true));
  });

  return lines;
}

/**
 * Render single occurrence
 */
function renderOccurrence(
  occurrence: any,
  state: GraphState,
  occurrenceMap: any,
  indent: string,
  isRoot: boolean = false
): string[] {
  const lines: string[] = [];
  const node = state.nodes.get(occurrence.nodeId);
  if (!node) return lines;

  const color = getNodeColor(node.type);
  const changeInd = getChangeIndicator(node.semanticId, state.nodeChangeStatus);

  if (occurrence.isPrimary) {
    lines.push(`${indent}${changeInd}[${color}${node.type}\x1b[0m] ${node.name}`);

    const children = findChildOccurrences(occurrence.path, occurrenceMap);
    const baseIndent = isRoot ? '' : indent;

    children.forEach((child, idx) => {
      const isLast = idx === children.length - 1;
      const prefix = isLast ? '\u2514\u2500' : '\u251c\u2500';
      const childIndent = baseIndent + (isLast ? '  ' : '\u2502 ');

      const childLines = renderOccurrence(child, state, occurrenceMap, childIndent, false);
      if (childLines.length > 0) {
        childLines[0] = `${baseIndent}${prefix}${childLines[0].slice(childIndent.length)}`;
        lines.push(...childLines);
      }
    });
  } else {
    lines.push(`${indent}${changeInd}[${color}${node.type}\x1b[0m] ${node.name} \x1b[90m\u2192\x1b[0m`);
  }

  return lines;
}

/**
 * Render single occurrence with description (for spec+ view)
 */
function renderOccurrenceWithDescription(
  occurrence: any,
  state: GraphState,
  occurrenceMap: any,
  indent: string,
  isRoot: boolean = false
): string[] {
  const lines: string[] = [];
  const node = state.nodes.get(occurrence.nodeId);
  if (!node) return lines;

  const color = getNodeColor(node.type);
  const changeInd = getChangeIndicator(node.semanticId, state.nodeChangeStatus);

  if (occurrence.isPrimary) {
    lines.push(`${indent}${changeInd}[${color}${node.type}\x1b[0m] ${node.name}`);

    if (node.descr && node.descr.trim()) {
      const descIndent = isRoot ? '  ' : indent + '  ';
      lines.push(`${descIndent}\x1b[90m${node.descr}\x1b[0m`);
    }

    const children = findChildOccurrences(occurrence.path, occurrenceMap);
    const baseIndent = isRoot ? '' : indent;

    children.forEach((child, idx) => {
      const isLast = idx === children.length - 1;
      const prefix = isLast ? '\u2514\u2500' : '\u251c\u2500';
      const childIndent = baseIndent + (isLast ? '  ' : '\u2502 ');

      const childLines = renderOccurrenceWithDescription(child, state, occurrenceMap, childIndent, false);
      if (childLines.length > 0) {
        childLines[0] = `${baseIndent}${prefix}${childLines[0].slice(childIndent.length)}`;
        lines.push(...childLines);
      }
    });
  } else {
    lines.push(`${indent}${changeInd}[${color}${node.type}\x1b[0m] ${node.name} \x1b[90m\u2192\x1b[0m`);
  }

  return lines;
}
