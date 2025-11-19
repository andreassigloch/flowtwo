/**
 * Format E - Token-Efficient Serialization Format
 *
 * Achieves 74% token reduction vs JSON
 *
 * Syntax:
 *   Nodes: NodeName|Type|SemanticID|Description [x:100,y:200,zoom:L2]
 *   Edges: SourceID -op-> TargetID
 *   Diff:  + AddNode|Type|ID|Descr
 *          - RemovedNodeID
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { SemanticId, NodeType, EdgeType, GraphState } from './ontology.js';
import type { FormatEDiff, ChatCanvasState } from './canvas.js';

/** Format E Parser Interface */
export interface IFormatEParser {
  /**
   * Parse full graph from Format E string
   */
  parseGraph(formatE: string): GraphState;

  /**
   * Parse diff operations from Format E string
   */
  parseDiff(formatE: string): FormatEDiff;

  /**
   * Serialize graph to Format E string
   */
  serializeGraph(state: GraphState, viewContext?: string): string;

  /**
   * Serialize diff to Format E string
   */
  serializeDiff(diff: FormatEDiff): string;

  /**
   * Parse chat canvas from Format E string
   */
  parseChatCanvas(formatE: string): ChatCanvasState;

  /**
   * Serialize chat canvas to Format E string
   */
  serializeChatCanvas(state: ChatCanvasState): string;
}

/** Format E Validation Rules */
export interface FormatEValidationRule {
  name: string;
  description: string;
  validate(formatE: string): boolean;
  getErrorMessage(): string;
}

/** Format E Syntax Elements */
export interface FormatESyntax {
  // Section markers
  VIEW_CONTEXT: string; // "## View-Context"
  NODES: string; // "## Nodes"
  EDGES: string; // "## Edges"
  MESSAGES: string; // "## Messages"
  OPERATIONS: string; // "<operations>"

  // Delimiters
  FIELD_SEPARATOR: string; // "|"
  ATTRIBUTE_START: string; // "["
  ATTRIBUTE_END: string; // "]"
  ATTRIBUTE_SEPARATOR: string; // ","
  ATTRIBUTE_KV_SEPARATOR: string; // ":"

  // Operation prefixes
  ADD_PREFIX: string; // "+"
  REMOVE_PREFIX: string; // "-"

  // Edge notation
  EDGE_ARROW: Record<EdgeType, string>; // e.g., "-cp->" for compose
}

/** Parsed Node Line */
export interface ParsedNodeLine {
  name: string;
  type: NodeType;
  semanticId: SemanticId;
  description?: string;
  attributes?: Record<string, string | number>;
}

/** Parsed Edge Line */
export interface ParsedEdgeLine {
  sourceId: SemanticId;
  type: EdgeType;
  targetId: SemanticId;
  label?: string;
}

/** Parsed Message Line */
export interface ParsedMessageLine {
  role: 'user' | 'assistant' | 'system';
  timestamp: string; // ISO 8601
  content: string;
  operations?: string; // Embedded Format E Diff
}

/** Format E Statistics (for token reduction analysis) */
export interface FormatEStats {
  nodeCount: number;
  edgeCount: number;
  formatETokens: number;
  jsonTokens: number;
  reductionPercent: number;
}
