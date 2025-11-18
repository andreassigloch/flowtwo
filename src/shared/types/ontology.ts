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

/** Edge Types (6 total) */
export type EdgeType =
  | 'compose' // Hierarchical composition
  | 'io' // Input/Output flow
  | 'satisfy' // Requirement satisfaction
  | 'verify' // Test verification
  | 'allocate' // Function allocation to module
  | 'relation'; // Generic relationship

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
