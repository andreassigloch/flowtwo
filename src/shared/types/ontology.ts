/**
 * GraphEngine Ontology V3 - Type Definitions
 *
 * 10 Node Types + 6 Edge Types following SysML 2.0 inspiration
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

/** Node Types (10 total) */
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
 * IMPORTANT: Three edge types create hierarchical nesting (per ontology_schema.json):
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
 * Edge Type Metadata
 *
 * Defines visual and semantic properties of each edge type
 * Per ontology_schema.json v3.0.0
 */
export const EDGE_TYPE_METADATA = {
  compose: {
    description: 'Hierarchical composition (parent-child)',
    isNesting: true, // Per ontology_schema.json
    visualStyle: 'implicit', // Not shown as line, shown as indentation
    validConnections: [
      'SYS -> SYS', // System contains subsystem
      'SYS -> UC', // System contains use cases
      'UC -> UC', // Use case contains sub-use-cases
      'UC -> ACTOR', // Use case composes actor
      'FCHAIN -> ACTOR', // Function chain composes actor
      'UC -> FCHAIN', // Use case contains function chains
      'FCHAIN -> FUNC', // Function chain contains functions
      'FCHAIN -> FLOW', // Function chain contains flows
      'SYS -> MOD', // System contains modules
    ],
  },
  io: {
    description: 'Input/Output data flow',
    isNesting: false, // Per ontology_schema.json
    visualStyle: 'solid-arrow',
    validConnections: [
      'FUNC -> FLOW', // Function output to flow
      'FLOW -> FUNC', // Flow input to function
      'ACTOR -> FLOW', // Actor sends data
      'FLOW -> ACTOR', // Actor receives data
    ],
  },
  satisfy: {
    description: 'Requirement satisfaction',
    isNesting: true, // Per ontology_schema.json
    visualStyle: 'dashed-arrow',
    validConnections: [
      'SYS -> REQ', // System satisfies requirement
      'REQ -> REQ', // Requirement satisfies parent requirement
      'UC -> REQ', // Use case satisfies requirement
      'FUNC -> REQ', // Function satisfies requirement
    ],
  },
  verify: {
    description: 'Test verification',
    isNesting: false, // Per ontology_schema.json
    visualStyle: 'dashed-arrow',
    validConnections: [
      'TEST -> TEST', // Test verifies sub-test
      'REQ -> TEST', // Requirement verified by test
    ],
  },
  allocate: {
    description: 'Function allocation to module',
    isNesting: true, // Per ontology_schema.json
    visualStyle: 'solid-arrow-diamond',
    validConnections: ['MOD -> FUNC'], // Module allocates function
  },
  relation: {
    description: 'Generic relationship',
    isNesting: false, // Per ontology_schema.json
    visualStyle: 'gray-line',
    validConnections: [
      'ANY -> ANY',
      'SCHEMA -> FUNC',
      'FLOW -> SCHEMA',
    ],
  },
} as const;

/** Semantic ID format: {NodeName}.{TypeAbbr}.{Counter} */
export type SemanticId = string; // e.g., "ValidateOrder.FN.001"

/** Zoom Levels (5 total) */
export type ZoomLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

/** Base Node Interface */
export interface Node {
  uuid: string; // Internal UUID
  semanticId: SemanticId; // User-facing semantic ID
  type: NodeType;
  name: string; // PascalCase, max 25 chars
  description?: string;
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
  semanticId?: SemanticId; // Optional for edges
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

/** View Types (5 specialized views) */
export type ViewType =
  | 'hierarchy'
  | 'functional-flow'
  | 'requirements'
  | 'allocation'
  | 'use-case';

/** View Configuration */
export interface ViewConfig {
  type: ViewType;
  name: string;
  description: string;

  // Filter rules
  nodeTypes: NodeType[]; // Which node types to include
  edgeTypes: EdgeType[]; // Which edge types to render explicitly

  // Layout algorithm
  layoutAlgorithm:
    | 'reingold-tilford' // Tree
    | 'sugiyama' // Layered DAG
    | 'orthogonal' // Orthogonal routing
    | 'treemap' // Nested containment
    | 'radial'; // Radial (UML-style)

  // Layout parameters (algorithm-specific)
  layoutParams?: Record<string, unknown>;

  // Default zoom levels per node type
  defaultZoomLevels?: Partial<Record<NodeType, ZoomLevel>>;
}

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
