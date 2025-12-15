/**
 * Format E Parser - Token-Efficient Serialization
 *
 * Achieves 74% token reduction vs JSON
 *
 * Syntax Examples:
 *   Node: TestSystem|SYS|TestSystem.SY.001|Test system [x:0,y:0,zoom:L2]
 *   Edge: TestSystem.SY.001 -cp-> NavigateEnv.UC.001
 *   Diff: + NewNode|FUNC|NewNode.FN.002|Description [x:100,y:200]
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import {
  Node,
  Edge,
  GraphState,
  EdgeType,
  SemanticId,
  ZoomLevel,
} from '../types/ontology.js';
import {
  FormatEDiff,
  Operation,
  ChatCanvasState,
  Message,
} from '../types/canvas.js';
import {
  IFormatEParser,
  ParsedNodeLine,
  ParsedEdgeLine,
  ParsedMessageLine,
  FormatESyntax,
} from '../types/format-e.js';
import { extractFromSemanticId } from '../utils/semantic-id.js';

/**
 * Format E Syntax Constants
 */
const SYNTAX: FormatESyntax = {
  VIEW_CONTEXT: '## View-Context',
  NODES: '## Nodes',
  EDGES: '## Edges',
  MESSAGES: '## Messages',
  OPERATIONS: '<operations>',

  FIELD_SEPARATOR: '|',
  ATTRIBUTE_START: '[',
  ATTRIBUTE_END: ']',
  ATTRIBUTE_SEPARATOR: ',',
  ATTRIBUTE_KV_SEPARATOR: ':',

  ADD_PREFIX: '+',
  REMOVE_PREFIX: '-',

  EDGE_ARROW: {
    compose: '-cp->',
    io: '-io->',
    satisfy: '-sat->',
    verify: '-ver->',
    allocate: '-alc->',
    relation: '-rel->',
  },
  // Long-form aliases for parsing compatibility
  EDGE_ARROW_ALIASES: {
    '-compose->': 'compose',
    '-relation->': 'relation',
    '-satisfy->': 'satisfy',
    '-verify->': 'verify',
    '-allocate->': 'allocate',
  },
};

/**
 * Format E Parser Implementation
 *
 * TEST: tests/unit/parsers/format-e-parser.test.ts
 */
export class FormatEParser implements IFormatEParser {
  private currentWorkspaceId: string = 'default-ws';
  private currentSystemId: string = 'default-sys';

  /**
   * Parse full graph from Format E string
   *
   * Format:
   * ## View-Context
   * Type: Hierarchy
   *
   * ## Nodes
   * NodeName|Type|SemanticID|Description [attrs]
   *
   * ## Edges
   * SourceID -type-> TargetID
   */
  parseGraph(formatE: string): GraphState {
    const lines = formatE.split('\n').map((l) => l.trim());
    const nodes = new Map<SemanticId, Node>();
    const edges = new Map<string, Edge>();
    const ports = new Map<SemanticId, any[]>();

    let section: 'none' | 'view' | 'nodes' | 'edges' = 'none';
    let workspaceId = 'default-workspace';
    let systemId = 'default-system';

    // First pass: extract metadata from header comments
    for (const line of lines) {
      if (line.startsWith('# System ID:')) {
        systemId = line.replace('# System ID:', '').trim();
      } else if (line.startsWith('# Workspace ID:')) {
        workspaceId = line.replace('# Workspace ID:', '').trim();
      }
      // Stop at section markers (optimization)
      if (line.startsWith('## ') || line.startsWith('[')) break;
    }

    // Second pass: parse content
    for (const line of lines) {
      // Check for section markers (support both ## and [] formats)
      const lineLower = line.toLowerCase();
      if (line === SYNTAX.VIEW_CONTEXT || lineLower === '[view-context]') {
        section = 'view';
        continue;
      } else if (line === SYNTAX.NODES || lineLower === '[nodes]') {
        section = 'nodes';
        continue;
      } else if (line === SYNTAX.EDGES || lineLower === '[edges]') {
        section = 'edges';
        continue;
      }

      // Skip empty lines and comments
      if (!line || line.startsWith('#')) {
        continue;
      }

      if (section === 'view') {
        // Parse view metadata (optional)
        continue;
      } else if (section === 'nodes') {
        const parsed = this.parseNodeLine(line);
        if (parsed) {
          const node = this.createNodeFromParsed(parsed, workspaceId, systemId);
          nodes.set(node.semanticId, node);

          // Auto-detect systemId from first SYS node if not found in header
          if (systemId === 'default-system' && parsed.type === 'SYS') {
            systemId = parsed.semanticId;
          }
        }
      } else if (section === 'edges') {
        const parsedEdges = this.parseEdgeLine(line);
        for (const parsed of parsedEdges) {
          const edge = this.createEdgeFromParsed(parsed, workspaceId, systemId);
          edges.set(`${edge.sourceId}-${edge.type}-${edge.targetId}`, edge);
        }
      }
    }

    return {
      workspaceId,
      systemId,
      nodes,
      edges,
      ports,
      version: 1,
      lastSavedVersion: 1,
      lastModified: new Date(),
    };
  }

  /**
   * Parse diff operations from Format E string
   *
   * Format:
   * <operations>
   * <base_snapshot>SystemID@version</base_snapshot>
   * <view_context>ViewName</view_context>
   *
   * ## Nodes
   * + AddedNode|Type|ID|Descr
   * - RemovedNodeID
   *
   * ## Edges
   * + SourceID -type-> TargetID
   * - SourceID -type-> TargetID
   * </operations>
   */
  parseDiff(formatE: string, workspaceId?: string, systemId?: string): FormatEDiff {
    const lines = formatE.split('\n').map((l) => l.trim());
    const operations: Operation[] = [];

    // Store context for node/edge creation
    this.currentWorkspaceId = workspaceId || 'default-ws';
    this.currentSystemId = systemId || 'default-sys';

    let baseSnapshot = '';
    let viewContext: string | undefined;
    let section: 'none' | 'nodes' | 'edges' = 'none';

    // Diagnostic counters
    let skippedLines = 0;
    let nodeLinesTried = 0;
    let edgeLinesTried = 0;

    for (const line of lines) {
      if (!line || line.startsWith('</')) continue;

      // Parse metadata
      if (line.includes('<base_snapshot>')) {
        baseSnapshot = this.extractTagContent(line, 'base_snapshot');
        continue;
      }
      if (line.includes('<view_context>')) {
        viewContext = this.extractTagContent(line, 'view_context');
        continue;
      }

      // Section markers (case-insensitive, multiple formats)
      const lineLower = line.toLowerCase();
      if (line === SYNTAX.NODES || lineLower === '## nodes' || lineLower === '[nodes]' || lineLower === '**nodes**' || lineLower === 'nodes:') {
        section = 'nodes';
        continue;
      }
      if (line === SYNTAX.EDGES || lineLower === '## edges' || lineLower === '[edges]' || lineLower === '**edges**' || lineLower === 'edges:') {
        section = 'edges';
        continue;
      }

      // Skip common non-operation lines
      if (line.startsWith('#') || line.startsWith('```') || line.startsWith('<operations>')) {
        continue;
      }

      // Parse operations
      if (section === 'nodes') {
        nodeLinesTried++;
        const op = this.parseNodeOperation(line);
        if (op) {
          operations.push(op);
        } else {
          skippedLines++;
        }
      } else if (section === 'edges') {
        edgeLinesTried++;
        const ops = this.parseEdgeOperation(line);
        if (ops.length > 0) {
          operations.push(...ops);
        } else {
          skippedLines++;
        }
      }
    }

    // Debug logging when no operations found but lines were tried
    if (operations.length === 0 && (nodeLinesTried > 0 || edgeLinesTried > 0)) {
      console.error(`[FormatE Parser] WARNING: Tried ${nodeLinesTried} node lines, ${edgeLinesTried} edge lines, but parsed 0 operations. ${skippedLines} lines skipped.`);
    }

    return {
      baseSnapshot,
      viewContext,
      operations,
    };
  }

  /**
   * Serialize graph to Format E string
   */
  serializeGraph(state: GraphState, viewContext?: string): string {
    const lines: string[] = [];

    // View context (optional)
    if (viewContext) {
      lines.push(SYNTAX.VIEW_CONTEXT);
      lines.push(`Type: ${viewContext}`);
      lines.push('');
    }

    // Nodes
    lines.push(SYNTAX.NODES);
    for (const node of state.nodes.values()) {
      lines.push(this.serializeNode(node));
    }
    lines.push('');

    // Edges - grouped by (source, type) for 1:N efficiency
    lines.push(SYNTAX.EDGES);
    const edgeGroups = this.groupEdgesBySourceAndType(state.edges);
    for (const [key, targets] of edgeGroups) {
      const [sourceId, edgeType] = key.split('|');
      const arrow = SYNTAX.EDGE_ARROW[edgeType as EdgeType];
      lines.push(`${sourceId} ${arrow} ${targets.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Group edges by (sourceId, type) for 1:N serialization
   * Returns Map<"sourceId|type", targetId[]>
   */
  private groupEdgesBySourceAndType(edges: Map<string, Edge>): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const edge of edges.values()) {
      const key = `${edge.sourceId}|${edge.type}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(edge.targetId);
    }

    return groups;
  }

  /**
   * Serialize diff to Format E string
   */
  serializeDiff(diff: FormatEDiff): string {
    const lines: string[] = [];

    lines.push(SYNTAX.OPERATIONS);
    lines.push(`<base_snapshot>${diff.baseSnapshot}</base_snapshot>`);
    if (diff.viewContext) {
      lines.push(`<view_context>${diff.viewContext}</view_context>`);
    }
    lines.push('');

    // Group operations by type
    const nodeOps = diff.operations.filter((op) =>
      ['add_node', 'remove_node', 'update_node'].includes(op.type)
    );
    const edgeOps = diff.operations.filter((op) =>
      ['add_edge', 'remove_edge'].includes(op.type)
    );

    // Nodes
    if (nodeOps.length > 0) {
      lines.push(SYNTAX.NODES);
      for (const op of nodeOps) {
        lines.push(this.serializeOperation(op));
      }
      lines.push('');
    }

    // Edges
    if (edgeOps.length > 0) {
      lines.push(SYNTAX.EDGES);
      for (const op of edgeOps) {
        lines.push(this.serializeOperation(op));
      }
      lines.push('');
    }

    lines.push('</operations>');
    return lines.join('\n');
  }

  /**
   * Parse chat canvas from Format E string
   */
  parseChatCanvas(formatE: string): ChatCanvasState {
    const lines = formatE.split('\n').map((l) => l.trim());
    const messages: Message[] = [];

    const chatId = 'default-chat';
    const workspaceId = 'default-workspace';
    const systemId = 'default-system';
    let section: 'none' | 'messages' = 'none';

    for (const line of lines) {
      if (!line || line.startsWith('#')) {
        if (line === SYNTAX.MESSAGES) section = 'messages';
        continue;
      }

      if (section === 'messages') {
        const parsed = this.parseMessageLine(line);
        if (parsed) {
          messages.push({
            messageId: `msg-${messages.length + 1}`,
            chatId,
            role: parsed.role,
            content: parsed.content,
            operations: parsed.operations,
            timestamp: new Date(parsed.timestamp),
          });
        }
      }
    }

    return {
      chatId,
      workspaceId,
      systemId,
      messages,
      dirtyMessageIds: new Set(),
      createdAt: new Date(),
      lastModified: new Date(),
    };
  }

  /**
   * Serialize chat canvas to Format E string
   */
  serializeChatCanvas(state: ChatCanvasState): string {
    const lines: string[] = [];

    lines.push(SYNTAX.MESSAGES);
    for (const msg of state.messages) {
      lines.push(this.serializeMessage(msg));
    }

    return lines.join('\n');
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Parse node line - CR-053 Compact Format: SemanticId|Description [attrs]
   * Name and Type are extracted from SemanticId
   */
  private parseNodeLine(line: string): ParsedNodeLine | null {
    const attrMatch = line.match(/\[([^\]]+)\]$/);
    const attributes: Record<string, string | number> = {};

    let coreLine = line;
    if (attrMatch) {
      coreLine = line.substring(0, line.indexOf('['));
      const attrStr = attrMatch[1];
      const pairs = attrStr.split(SYNTAX.ATTRIBUTE_SEPARATOR);
      for (const pair of pairs) {
        const [key, value] = pair.split(SYNTAX.ATTRIBUTE_KV_SEPARATOR);
        attributes[key.trim()] = isNaN(Number(value)) ? value.trim() : Number(value);
      }
    }

    const parts = coreLine.split(SYNTAX.FIELD_SEPARATOR).map((p) => p.trim());
    if (parts.length < 1) return null;

    // CR-053 Compact Format: SemanticId|Description
    const semanticId = parts[0];
    const description = parts[1];

    // Extract name and type from semanticId
    try {
      const { name, type } = extractFromSemanticId(semanticId);
      return {
        name,
        type,
        semanticId,
        description,
        attributes,
      };
    } catch {
      // Invalid semanticId format
      return null;
    }
  }

  /**
   * Parse edge line: SourceID -type-> TargetID or SourceID -type-> Target1, Target2, Target3
   * Supports both short (-cp->) and long (-compose->) arrow formats
   * Supports 1:N multi-target syntax with comma-separated targets
   *
   * @returns Array of ParsedEdgeLine (1 for single target, N for multi-target)
   */
  private parseEdgeLine(line: string): ParsedEdgeLine[] {
    // First try standard short arrows
    for (const [edgeType, arrow] of Object.entries(SYNTAX.EDGE_ARROW)) {
      if (line.includes(arrow)) {
        const parts = line.split(arrow).map((p) => p.trim());
        if (parts.length === 2) {
          const sourceId = parts[0];
          const targets = this.parseMultipleTargets(parts[1]);
          return targets.map((targetId) => ({
            sourceId,
            type: edgeType as EdgeType,
            targetId,
          }));
        }
      }
    }

    // Try long-form aliases
    for (const [longArrow, edgeType] of Object.entries(SYNTAX.EDGE_ARROW_ALIASES)) {
      if (line.includes(longArrow)) {
        const parts = line.split(longArrow).map((p) => p.trim());
        if (parts.length === 2) {
          const sourceId = parts[0];
          const targets = this.parseMultipleTargets(parts[1]);
          return targets.map((targetId) => ({
            sourceId,
            type: edgeType as EdgeType,
            targetId,
          }));
        }
      }
    }

    return [];
  }

  /**
   * Parse comma-separated target IDs
   * Handles: "Target1, Target2, Target3" or just "Target1"
   */
  private parseMultipleTargets(targetString: string): string[] {
    return targetString
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  /**
   * Parse message line: role|timestamp|content|operations
   */
  private parseMessageLine(line: string): ParsedMessageLine | null {
    const parts = line.split(SYNTAX.FIELD_SEPARATOR);
    if (parts.length < 3) return null;

    return {
      role: parts[0] as 'user' | 'assistant' | 'system',
      timestamp: parts[1],
      content: parts[2],
      operations: parts[3],
    };
  }

  /**
   * Parse node operation (+ or - prefix, or implicit add without prefix)
   */
  private parseNodeOperation(line: string): Operation | null {
    const prefix = line[0];

    if (prefix === SYNTAX.ADD_PREFIX) {
      const content = line.substring(1).trim();
      const parsed = this.parseNodeLine(content);
      if (!parsed) return null;

      return {
        type: 'add_node',
        semanticId: parsed.semanticId,
        node: this.createNodeFromParsed(parsed, this.currentWorkspaceId, this.currentSystemId),
      };
    } else if (prefix === SYNTAX.REMOVE_PREFIX) {
      const content = line.substring(1).trim();
      return {
        type: 'remove_node',
        semanticId: content,
      };
    }

    // Fallback: Try parsing line without prefix as implicit add
    // This handles LLM output that omits the + prefix
    const parsed = this.parseNodeLine(line);
    if (parsed) {
      return {
        type: 'add_node',
        semanticId: parsed.semanticId,
        node: this.createNodeFromParsed(parsed, this.currentWorkspaceId, this.currentSystemId),
      };
    }

    return null;
  }

  /**
   * Parse edge operation (+ or - prefix, or implicit add without prefix)
   * Supports 1:N syntax, returns array of operations
   */
  private parseEdgeOperation(line: string): Operation[] {
    const prefix = line[0];
    const operations: Operation[] = [];

    if (prefix === SYNTAX.ADD_PREFIX) {
      const content = line.substring(1).trim();
      const parsedEdges = this.parseEdgeLine(content);
      for (const parsed of parsedEdges) {
        operations.push({
          type: 'add_edge',
          semanticId: `${parsed.sourceId}-${parsed.type}-${parsed.targetId}`,
          edge: this.createEdgeFromParsed(parsed, this.currentWorkspaceId, this.currentSystemId),
        });
      }
    } else if (prefix === SYNTAX.REMOVE_PREFIX) {
      const content = line.substring(1).trim();
      const parsedEdges = this.parseEdgeLine(content);
      for (const parsed of parsedEdges) {
        operations.push({
          type: 'remove_edge',
          semanticId: `${parsed.sourceId}-${parsed.type}-${parsed.targetId}`,
        });
      }
    } else {
      // Fallback: Try parsing line without prefix as implicit add
      // This handles LLM output that omits the + prefix
      const parsedEdges = this.parseEdgeLine(line);
      for (const parsed of parsedEdges) {
        operations.push({
          type: 'add_edge',
          semanticId: `${parsed.sourceId}-${parsed.type}-${parsed.targetId}`,
          edge: this.createEdgeFromParsed(parsed, this.currentWorkspaceId, this.currentSystemId),
        });
      }
    }

    return operations;
  }

  /**
   * Create Node from parsed line
   */
  private createNodeFromParsed(
    parsed: ParsedNodeLine,
    workspaceId: string,
    systemId: string
  ): Node {
    // uuid equals semanticId for nodes (unique identifier from import)
    return {
      uuid: parsed.semanticId,
      semanticId: parsed.semanticId,
      type: parsed.type,
      name: parsed.name,
      descr: parsed.description || '',
      workspaceId,
      systemId,
      attributes: parsed.attributes,
      position: {
        x: (parsed.attributes?.x as number) || 0,
        y: (parsed.attributes?.y as number) || 0,
      },
      zoomLevel: (parsed.attributes?.zoom as ZoomLevel) || 'L2',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
    };
  }

  /**
   * Create Edge from parsed line
   */
  private createEdgeFromParsed(
    parsed: ParsedEdgeLine,
    workspaceId: string,
    systemId: string
  ): Edge {
    return {
      uuid: `uuid-${Date.now()}-${Math.random()}`,
      type: parsed.type,
      sourceId: parsed.sourceId,
      targetId: parsed.targetId,
      workspaceId,
      systemId,
      label: parsed.label,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
    };
  }

  /**
   * Serialize node to Format E - CR-053 Compact Format
   * Output: SemanticId|Description [attrs]
   */
  private serializeNode(node: Node): string {
    const attrs = [];
    if (node.position) {
      attrs.push(`x:${node.position.x}`);
      attrs.push(`y:${node.position.y}`);
    }
    if (node.zoomLevel) {
      attrs.push(`zoom:${node.zoomLevel}`);
    }

    const attrStr = attrs.length > 0 ? ` [${attrs.join(',')}]` : '';
    // CR-053: Compact format - only semanticId and description
    return `${node.semanticId}|${node.descr || ''}${attrStr}`;
  }

  /**
   * Serialize edge to Format E
   */
  private serializeEdge(edge: Edge): string {
    const arrow = SYNTAX.EDGE_ARROW[edge.type];
    return `${edge.sourceId} ${arrow} ${edge.targetId}`;
  }

  /**
   * Serialize message to Format E
   */
  private serializeMessage(msg: Message): string {
    const parts = [msg.role, msg.timestamp.toISOString(), msg.content];
    if (msg.operations) {
      parts.push(msg.operations);
    }
    return parts.join(SYNTAX.FIELD_SEPARATOR);
  }

  /**
   * Serialize operation to Format E
   */
  private serializeOperation(op: Operation): string {
    if (op.type === 'add_node' && op.node) {
      return `${SYNTAX.ADD_PREFIX} ${this.serializeNode(op.node)}`;
    } else if (op.type === 'remove_node') {
      return `${SYNTAX.REMOVE_PREFIX} ${op.semanticId}`;
    } else if (op.type === 'add_edge' && op.edge) {
      return `${SYNTAX.ADD_PREFIX} ${this.serializeEdge(op.edge)}`;
    } else if (op.type === 'remove_edge' && op.edge) {
      return `${SYNTAX.REMOVE_PREFIX} ${this.serializeEdge(op.edge)}`;
    }
    return '';
  }

  /**
   * Extract content from XML-like tag
   */
  private extractTagContent(line: string, tagName: string): string {
    const match = line.match(new RegExp(`<${tagName}>([^<]+)</${tagName}>`));
    return match ? match[1] : '';
  }
}
