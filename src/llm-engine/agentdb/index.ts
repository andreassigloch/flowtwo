/**
 * AgentDB Module Exports
 *
 * CR-032: UnifiedAgentDBService is the Single Source of Truth
 *
 * @author andreas@siglochconsulting
 */

export * from './types.js';
export { MemoryBackend } from './memory-backend.js';
export { AgentDBPersistentBackend } from './agentdb-backend.js';
export { DisabledBackend } from './disabled-backend.js';
export { createBackend } from './backend-factory.js';

// CR-032: UnifiedAgentDBService is THE Single Source of Truth
export { UnifiedAgentDBService, getUnifiedAgentDBService, shutdownAllServices } from './unified-agentdb-service.js';
export { GraphStore } from './graph-store.js';
export { VariantPool } from './variant-pool.js';
export { Neo4jSyncManager, createNeo4jSyncManager } from './neo4j-sync.js';
export { EmbeddingStore, type EmbeddingEntry, type EmbeddableNode } from './embedding-store.js';
export { EmbeddingService } from './embedding-service.js';
