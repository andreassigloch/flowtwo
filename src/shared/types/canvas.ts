/**
 * Canvas State Manager Types - Dual Canvas Architecture
 *
 * Graph Canvas: Manages ontology graph state
 * Chat Canvas: Manages conversation state
 *
 * Both use Format E Diff as universal change protocol
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { GraphState, SemanticId, Node, Edge } from './ontology.js';

/** Canvas Type */
export type CanvasType = 'graph' | 'chat';

/** Format E Diff Operation Types */
export type OperationType =
  | 'add_node'
  | 'remove_node'
  | 'update_node'
  | 'add_edge'
  | 'remove_edge'
  | 'add_message'
  | 'remove_message';

/** Single Operation (parsed from Format E Diff) */
export interface Operation {
  type: OperationType;
  semanticId: SemanticId;

  // Node operations
  node?: Node;

  // Edge operations
  edge?: Edge;

  // Message operations (Chat Canvas)
  message?: Message;

  // Update-specific (for partial updates)
  updates?: Partial<Node | Edge | Message>;
}

/** Format E Diff Structure */
export interface FormatEDiff {
  baseSnapshot: string; // Format: "SystemID@version" or "chatId@msgCount"
  viewContext?: string; // Optional view name
  operations: Operation[];
}

/** Diff Result */
export interface DiffResult {
  success: boolean;
  affectedIds: SemanticId[];
  errors?: string[];
  warnings?: string[];
}

/** Message (Chat Canvas) */
export interface Message {
  messageId: string;
  chatId: string;
  workspaceId?: string; // Required for Neo4j persistence
  systemId?: string; // Required for Neo4j persistence
  userId?: string; // Required for Neo4j persistence
  role: 'user' | 'assistant' | 'system';
  content: string;
  operations?: string; // Embedded Format E Diff (if assistant response contains graph ops)
  timestamp: Date;
}

/** Chat Canvas State */
export interface ChatCanvasState {
  chatId: string;
  workspaceId: string;
  systemId: string; // Which graph this chat is about

  // Chat data
  messages: Message[];

  // Dirty tracking
  dirtyMessageIds: Set<string>;

  // Metadata
  createdAt: Date;
  lastModified: Date;
}

/** Graph Canvas State (extends GraphState) */
export interface GraphCanvasState extends GraphState {
  currentView: string; // View ID or type

  // Note: Dirty tracking is handled by base class CanvasBase.dirty Set<string>
  // Uses semanticId for nodes, composite key (sourceId-type-targetId) for edges

  // User session state
  focus?: SemanticId; // Currently focused node
  zoom?: number; // Canvas zoom level (1.0 = 100%)
}

/** Session (combines both canvases) */
export interface Session {
  sessionId: string;
  workspaceId: string;
  systemId: string;
  chatId: string;
  userId: string;

  // Dual canvas instances
  graphCanvas: GraphCanvasState;
  chatCanvas: ChatCanvasState;

  // WebSocket connection
  connectionId?: string;

  // Metadata
  createdAt: Date;
  lastActivity: Date;
}

/** Broadcast Update (WebSocket message) */
export interface BroadcastUpdate {
  type: 'graph_update' | 'chat_update';
  diff: FormatEDiff;
  source: {
    userId: string;
    sessionId: string;
    origin: 'user-edit' | 'llm-operation' | 'system';
  };
  timestamp: Date;
}

/** Persist Result */
export interface PersistResult {
  success: boolean;
  savedCount?: number;
  skipped?: boolean;
  errors?: string[];
}

/** Validation Result */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/** Cache Strategy Decision */
export type CacheDecision = 'use_cache' | 'apply_diff' | 'fetch_neo4j';

/** Cache Strategy Context */
export interface CacheContext {
  lastFetchTime: Date;
  staleThresholdMs: number; // How old before cache is considered stale
  dirtyCount: number; // Number of dirty items
  forceRefresh: boolean; // User explicitly requested refresh
}
