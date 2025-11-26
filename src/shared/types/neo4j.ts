/**
 * Neo4j Types
 *
 * Type definitions for Neo4j client operations
 *
 * @author andreas@siglochconsulting
 */

/** Neo4j connection configuration */
export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database?: string;
  maxConnectionPoolSize?: number;
  connectionTimeout?: number;
}

/** Result of batch persistence operation */
export interface BatchPersistResult {
  success: boolean;
  nodeCount: number;
  edgeCount: number;
  messageCount: number;
  executionTime: number;
  errors?: string[];
}

/** Options for graph queries */
export interface GraphQueryOptions {
  workspaceId: string;
  systemId?: string;
  nodeTypes?: string[];
  edgeTypes?: string[];
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

/** Options for chat queries */
export interface ChatQueryOptions {
  chatId: string;
  workspaceId?: string;
  systemId?: string;
  limit?: number;
  offset?: number;
  before?: Date;
  after?: Date;
}

/** Audit log entry for tracking changes */
export interface AuditLogEntry {
  id?: string;
  chatId: string;
  workspaceId: string;
  systemId?: string;
  userId: string;
  action: string;
  diff?: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

/** Graph statistics */
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  lastModified: Date;
}
