/**
 * AgentDB Backend Factory
 *
 * Creates the appropriate backend based on configuration.
 *
 * @author andreas@siglochconsulting
 */

import {
  AGENTDB_ENABLED,
  AGENTDB_BACKEND,
  AGENTDB_URL,
} from '../../shared/config.js';
import type { AgentDBBackend } from './types.js';
import { MemoryBackend } from './memory-backend.js';
import { AgentDBPersistentBackend } from './agentdb-backend.js';
import { DisabledBackend } from './disabled-backend.js';

/**
 * Create and initialize the configured AgentDB backend
 */
export async function createBackend(): Promise<AgentDBBackend> {
  if (!AGENTDB_ENABLED || AGENTDB_BACKEND === 'disabled') {
    const backend = new DisabledBackend();
    await backend.initialize();
    return backend;
  }

  if (AGENTDB_BACKEND === 'memory') {
    const backend = new MemoryBackend();
    await backend.initialize();
    return backend;
  }

  if (AGENTDB_BACKEND === 'agentdb') {
    const dbPath = AGENTDB_URL || '/tmp/graphengine-agentdb.db';
    const backend = new AgentDBPersistentBackend(dbPath);
    await backend.initialize();
    return backend;
  }

  throw new Error(`Unknown AGENTDB_BACKEND: ${AGENTDB_BACKEND}`);
}
