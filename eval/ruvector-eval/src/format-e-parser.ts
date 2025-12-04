/**
 * Simple Format-E Parser for RuVector Evaluation
 *
 * Parses GraphEngine export files to extract nodes and edges
 *
 * @author andreas@siglochconsulting
 */

export interface ParsedNode {
  name: string;
  type: string;
  semanticId: string;
  description: string;
  position?: { x: number; y: number };
  zoomLevel?: string;
}

export interface ParsedEdge {
  sourceId: string;
  targetId: string;
  type: string;
}

export interface ParsedGraph {
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  metadata: {
    systemId?: string;
    workspaceId?: string;
    nodeCount: number;
    edgeCount: number;
  };
}

const EDGE_TYPE_MAP: Record<string, string> = {
  '-cp->': 'compose',
  '-io->': 'io',
  '-sat->': 'satisfy',
  '-ver->': 'verify',
  '-rel->': 'relation',
  '-alc->': 'allocate',
  '-drv->': 'derive',
};

export function parseFormatE(content: string): ParsedGraph {
  const lines = content.split('\n');
  const nodes: ParsedNode[] = [];
  const edges: ParsedEdge[] = [];
  const metadata: ParsedGraph['metadata'] = { nodeCount: 0, edgeCount: 0 };

  let section: 'header' | 'nodes' | 'edges' = 'header';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Detect section changes FIRST (before comment handling)
    if (trimmed === '## Nodes') {
      section = 'nodes';
      continue;
    }
    if (trimmed === '## Edges') {
      section = 'edges';
      continue;
    }

    // Parse header comments (single # only, not section headers ##)
    if (trimmed.startsWith('#') && !trimmed.startsWith('##')) {
      const systemMatch = trimmed.match(/# System ID: (.+)/);
      if (systemMatch) metadata.systemId = systemMatch[1];

      const workspaceMatch = trimmed.match(/# Workspace ID: (.+)/);
      if (workspaceMatch) metadata.workspaceId = workspaceMatch[1];

      const nodeCountMatch = trimmed.match(/# Nodes: (\d+)/);
      if (nodeCountMatch) metadata.nodeCount = parseInt(nodeCountMatch[1], 10);

      const edgeCountMatch = trimmed.match(/# Edges: (\d+)/);
      if (edgeCountMatch) metadata.edgeCount = parseInt(edgeCountMatch[1], 10);

      continue;
    }

    // Parse nodes: Name|Type|SemanticId|Description [x:N,y:N,zoom:L2]
    if (section === 'nodes') {
      const parts = trimmed.split('|');
      if (parts.length >= 4) {
        const node: ParsedNode = {
          name: parts[0],
          type: parts[1],
          semanticId: parts[2],
          description: parts[3],
        };

        // Extract position if present
        const posMatch = parts[3].match(/\[x:(-?\d+),y:(-?\d+),zoom:(\w+)\]/);
        if (posMatch) {
          node.position = { x: parseInt(posMatch[1], 10), y: parseInt(posMatch[2], 10) };
          node.zoomLevel = posMatch[3];
          node.description = parts[3].replace(/\s*\[x:.*\]/, '').trim();
        }

        nodes.push(node);
      }
    }

    // Parse edges: SourceId -type-> TargetId
    if (section === 'edges') {
      for (const [arrow, edgeType] of Object.entries(EDGE_TYPE_MAP)) {
        if (trimmed.includes(arrow)) {
          const [sourceId, rest] = trimmed.split(arrow);
          if (sourceId && rest) {
            edges.push({
              sourceId: sourceId.trim(),
              targetId: rest.trim(),
              type: edgeType,
            });
          }
          break;
        }
      }
    }
  }

  return { nodes, edges, metadata };
}
