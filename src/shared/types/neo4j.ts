/**
 * Neo4j Client Types
 *
 * Types for Neo4j database operations and persistence
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import type { Node, Edge, Message } from './ontology.js';

/**
 * Neo4j Connection Configuration
 */
export interface Neo4jConfig {
  /** Neo4j URI (bolt://localhost:7687) */
  uri: string;

  /** Database user */
  user: string;

  /** Database password */
  password: string;

  /** Database name (default: neo4j) */
  database?: string;

  /** Max connection pool size */
  maxConnectionPoolSize?: number;

  /** Connection timeout (ms) */
  connectionTimeout?: number;
}

/**
 * Neo4j Query Result
 */
export interface Neo4jQueryResult<T = any> {
  /** Records returned */
  records: T[];

  /** Query execution summary */
  summary: {
    /** Query executed */
    query: string;

    /** Parameters used */
    parameters: Record<string, any>;

    /** Execution time (ms) */
    executionTime: number;

    /** Records returned count */
    recordCount: number;
  };
}

/**
 * Batch Persistence Result
 */
export interface BatchPersistResult {
  /** Success flag */
  success: boolean;

  /** Nodes persisted */
  nodeCount: number;

  /** Edges persisted */
  edgeCount: number;

  /** Messages persisted */
  messageCount: number;

  /** Execution time (ms) */
  executionTime: number;

  /** Errors encountered */
  errors?: string[];
}

/**
 * Graph Query Options
 */
export interface GraphQueryOptions {
  /** Workspace ID filter */
  workspaceId: string;

  /** System ID filter */
  systemId: string;

  /** Node types to include */
  nodeTypes?: string[];

  /** Edge types to include */
  edgeTypes?: string[];

  /** Max depth for traversal */
  maxDepth?: number;

  /** Include deleted nodes */
  includeDeleted?: boolean;
}

/**
 * Chat Query Options
 */
export interface ChatQueryOptions {
  /** Chat ID filter */
  chatId: string;

  /** Workspace ID filter */
  workspaceId: string;

  /** System ID filter */
  systemId: string;

  /** Limit number of messages */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Include deleted messages */
  includeDeleted?: boolean;
}

/**
 * Audit Log Entry
 */
export interface AuditLogEntry {
  /** Unique ID */
  id: string;

  /** Chat ID */
  chatId: string;

  /** Workspace ID */
  workspaceId: string;

  /** System ID */
  systemId: string;

  /** User ID who made change */
  userId: string;

  /** Action type */
  action: 'create' | 'update' | 'delete' | 'persist';

  /** Format E Diff */
  diff: string;

  /** Timestamp */
  timestamp: Date;

  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Graph Statistics
 */
export interface GraphStats {
  /** Total nodes */
  nodeCount: number;

  /** Total edges */
  edgeCount: number;

  /** Nodes by type */
  nodesByType: Record<string, number>;

  /** Edges by type */
  edgesByType: Record<string, number>;

  /** Last modified timestamp */
  lastModified: Date;
}
