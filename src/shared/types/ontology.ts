/**
 * GraphEngine Ontology V3 - Type Definitions
 *
 * 10 Node Types + 6 Edge Types following SysML 2.0 inspiration
 * Single Source of Truth: settings/ontology-rules.json
 *
 * @author andreas@siglochconsulting
 * @version 3.1.1
 */

import ontologyJson from '../../../settings/ontology-rules.json' assert { type: 'json' };

/** Ontology JSON structure types */
export interface OntologyNodeType {
  name: string;
  description: string;
  abbreviation: string;
  color: string;
  ansiColor: string;
}

export interface OntologyEdgeType {
  name: string;
  description: string;
  isNesting: boolean;
  visualStyle: string;
  validConnections: Array<{ source: string; target: string }>;
}

export interface Ontology {
  nodeTypes: Record<string, OntologyNodeType>;
  edgeTypes: Record<string, OntologyEdgeType>;
  nestingEdgeTypes: string[];
  zoomLevels: string[];
  semanticIdFormat: {
    pattern: string;
    example: string;
    constraints: {
      nodeName: string;
      counter: string;
    };
  };
}

/** Export the loaded ontology for runtime access */
export const ONTOLOGY = ontologyJson as Ontology;

/** Node Types (10 total) - derived from ontology-rules.json */
export type NodeType =
  | 'SYS' // System (top-level or subsystem)
  | 'UC' // Use Case
  | 'ACTOR' // External entity
  | 'FCHAIN' // Function Chain (sequence)
  | 'FUNC' // Function (specific capability)
  | 'FLOW' // Data Flow Contract (interface def)
  | 'REQ' // Requirement
  | 'TEST' // Test Case / Verification
  | 'MOD' // Module (physical/SW component)
  | 'SCHEMA'; // Global data structure

/**
 * Edge Types (6 total)
 *
 * IMPORTANT: Three edge types create hierarchical nesting (per ontology-rules.json):
 * - compose, satisfy, allocate = NESTING edges (shown as indentation)
 * - io, verify, relation = CONNECTION edges (shown as arrows/lines)
 */
export type EdgeType =
  | 'compose' // Hierarchical composition - CREATES NESTING
  | 'io' // Input/Output flow - Shown as arrow
  | 'satisfy' // Requirement satisfaction - CREATES NESTING
  | 'verify' // Test verification - Shown as dashed arrow
  | 'allocate' // Function allocation to module - CREATES NESTING
  | 'relation'; // Generic relationship - Shown as gray line

/**
 * Edge Type Metadata - loaded from settings/ontology-rules.json
 *
 * Provides backward-compatible access with string-based validConnections format.
 * For structured access, use ONTOLOGY.edgeTypes directly.
 */
export const EDGE_TYPE_METADATA = Object.fromEntries(
  Object.entries(ONTOLOGY.edgeTypes).map(([key, value]) => [
    key,
    {
      description: value.description,
      isNesting: value.isNesting,
      visualStyle: value.visualStyle,
      validConnections: value.validConnections.map(
        (c) => `${c.source} -> ${c.target}`
      ),
    },
  ])
) as Record<
  EdgeType,
  {
    description: string;
    isNesting: boolean;
    visualStyle: string;
    validConnections: string[];
  }
>;

/** Semantic ID format: {NodeName}.{TypeAbbr}.{Counter} */
export type SemanticId = string; // e.g., "ValidateOrder.FN.001"

/** Zoom Levels (5 total) */
export type ZoomLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

/** Base Node Interface */
export interface Node {
  uuid: string; // Equals semanticId (unique identifier from import)
  semanticId: SemanticId; // User-facing semantic ID (same as uuid)
  type: NodeType; // Must match type abbreviation in semanticId
  name: string; // PascalCase, max 25 chars - must match name part in semanticId
  descr: string; // Description (required, non-empty)
  workspaceId: string;
  systemId: string; // Root SYS node semantic ID

  // Optional attributes (type-specific)
  attributes?: Record<string, unknown>;

  // Visual attributes (managed by Graph Engine)
  position?: { x: number; y: number };
  zoomLevel?: ZoomLevel;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // userId
}

/** Edge Interface */
export interface Edge {
  uuid: string;
  // Note: No semanticId - edges are keyed by composite: ${sourceId}-${type}-${targetId}
  type: EdgeType;
  sourceId: SemanticId; // Source node semantic ID
  targetId: SemanticId; // Target node semantic ID
  workspaceId: string;
  systemId: string;

  // Optional attributes
  label?: string;
  attributes?: Record<string, unknown>;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/** Position (2D coordinates) */
export interface Position {
  x: number;
  y: number;
}

/** Port Definition (from FLOW nodes) */
export interface Port {
  flowNodeId: SemanticId; // FLOW node that defines this port
  direction: 'input' | 'output';
  label: string;
  position?: Position; // Relative to parent FUNC node

  // FLOW attributes
  flowType?: string; // Data type (e.g., "OrderData", "PaymentInfo")
  pattern?: string; // Communication pattern (e.g., "request-response", "pub-sub")
  validation?: string; // Validation rules
}

/** Graph State (in-memory representation) */
export interface GraphState {
  workspaceId: string;
  systemId: string;
  nodes: Map<SemanticId, Node>;
  edges: Map<string, Edge>; // key = `${sourceId}-${type}-${targetId}`
  ports: Map<SemanticId, Port[]>; // key = FUNC node semantic ID

  // Metadata
  version: number; // Incremented on each change
  lastSavedVersion: number; // Version last persisted to Neo4j
  lastModified: Date;
}

/**
 * View Types and Configuration
 *
 * IMPORTANT: ViewType and ViewConfig are defined in view.ts (single source of truth)
 * Import from '../shared/types/view.js' instead.
 *
 * @see view.ts for ViewType union and DEFAULT_VIEW_CONFIGS
 */

/** Workspace */
export interface Workspace {
  workspaceId: string;
  name: string;
  description?: string;

  // Access control
  ownerId: string;
  members: WorkspaceMember[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/** Workspace Member */
export interface WorkspaceMember {
  userId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  joinedAt: Date;
}

/** User */
export interface User {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
}

/** Re-export Message from canvas types */
export type { Message } from './canvas.js';
